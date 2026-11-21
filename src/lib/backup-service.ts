import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { db } from '../db';
import * as schema from '../db/schema';
import { env } from './env';
import { migrateSqliteToMysql } from '../../scripts/migrate-sqlite-to-mysql';

export interface RestoreResult {
  success: boolean;
  message: string;
  safetyBackupPath?: string;
}

/**
 * Creates a standalone .tar.gz archive containing a structured JSON dump
 * of all MySQL tables and the uploads directory.
 */
export async function createBackupArchive(): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-backup-'));
  const exportJsonPath = path.join(tempDir, 'data-export.json');

  // 1. Export all table data to JSON
  const data = {
    version: '2.0.0',
    dialect: 'mysql',
    timestamp: new Date().toISOString(),
    tables: {
      users: await db.select().from(schema.users),
      media: await db.select().from(schema.media),
      posts: await db.select().from(schema.posts),
      postTranslations: await db.select().from(schema.postTranslations),
      projects: await db.select().from(schema.projects),
      projectTranslations: await db.select().from(schema.projectTranslations),
      freelanceProjects: await db.select().from(schema.freelanceProjects),
      freelanceProjectTranslations: await db.select().from(schema.freelanceProjectTranslations),
      tags: await db.select().from(schema.tags),
      postTags: await db.select().from(schema.postTags),
      projectTags: await db.select().from(schema.projectTags),
      siteSettings: await db.select().from(schema.siteSettings),
      publishingJobs: await db.select().from(schema.publishingJobs),
      urlRedirects: await db.select().from(schema.urlRedirects),
    },
  };

  fs.writeFileSync(exportJsonPath, JSON.stringify(data, null, 2), 'utf-8');

  // 2. Prepare tar archive path
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(tempDir, `portfolio-backup-${stamp}.tar.gz`);

  const uploadsDir = env.UPLOAD_DIR;
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const uploadsParent = path.dirname(uploadsDir);
  const uploadsBase = path.basename(uploadsDir);

  const proc = Bun.spawn([
    'tar',
    '-czf',
    archivePath,
    '-C',
    tempDir,
    'data-export.json',
    '-C',
    uploadsParent,
    uploadsBase,
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errText = await new Response(proc.stderr).text();
    throw new Error(`Failed to create backup archive (exit code ${exitCode}): ${errText}`);
  }

  // Cleanup temporary JSON file
  try {
    fs.unlinkSync(exportJsonPath);
  } catch {}

  return archivePath;
}

/**
 * Restores data from an uploaded archive (.tar.gz, .tgz, or .db).
 * Supports both new JSON archives and legacy SQLite archives with automatic migration.
 */
export async function restoreFromArchive(
  archiveFilePath: string,
  originalFilename: string,
): Promise<RestoreResult> {
  const lowerName = originalFilename.toLowerCase();
  const isTar = lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz');
  const isDb = lowerName.endsWith('.db');

  if (!isTar && !isDb) {
    return {
      success: false,
      message: 'Invalid file format. Supported formats: .tar.gz, .tgz, .db',
    };
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-restore-staging-'));

  try {
    let candidateDbPath = '';
    let jsonExportPath = '';

    if (isDb) {
      candidateDbPath = archiveFilePath;
    } else {
      // 1. Extract tar to staging
      const proc = Bun.spawn(['tar', '-xzf', archiveFilePath, '-C', stagingDir]);
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const errText = await new Response(proc.stderr).text();
        throw new Error(`tar extraction failed (${exitCode}): ${errText}`);
      }

      // Check if modern data-export.json exists
      const directJson = path.join(stagingDir, 'data-export.json');
      if (fs.existsSync(directJson)) {
        jsonExportPath = directJson;
      }

      // Check for legacy portfolio.db or any .db inside stagingDir
      const directDb = path.join(stagingDir, 'portfolio.db');
      if (fs.existsSync(directDb)) {
        candidateDbPath = directDb;
      } else {
        const found = fs.readdirSync(stagingDir).find((f) => f.endsWith('.db'));
        if (found) {
          candidateDbPath = path.join(stagingDir, found);
        }
      }

      // Restore uploads directory if present
      const stagingUploads = path.join(stagingDir, 'uploads');
      if (fs.existsSync(stagingUploads)) {
        fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
        fs.cpSync(stagingUploads, env.UPLOAD_DIR, { recursive: true });
      }
    }

    // 2. Perform restoration
    if (jsonExportPath) {
      const content = fs.readFileSync(jsonExportPath, 'utf-8');
      const dump = JSON.parse(content);
      const tables = dump.tables || {};

      const toDate = (val: any) => (val ? new Date(val) : new Date());
      const toOptionalDate = (val: any) => (val ? new Date(val) : null);

      if (Array.isArray(tables.users)) {
        for (const r of tables.users) {
          await db.insert(schema.users).ignore().values({
            ...r,
            createdAt: toDate(r.createdAt),
            updatedAt: toDate(r.updatedAt),
          });
        }
      }

      if (Array.isArray(tables.media)) {
        for (const r of tables.media) {
          await db.insert(schema.media).ignore().values({
            ...r,
            createdAt: toDate(r.createdAt),
          });
        }
      }

      if (Array.isArray(tables.posts)) {
        for (const r of tables.posts) {
          await db.insert(schema.posts).ignore().values({
            ...r,
            deletedAt: toOptionalDate(r.deletedAt),
            createdAt: toDate(r.createdAt),
            updatedAt: toDate(r.updatedAt),
          });
        }
      }

      if (Array.isArray(tables.postTranslations)) {
        for (const r of tables.postTranslations) {
          await db.insert(schema.postTranslations).ignore().values({
            ...r,
            publishedAt: toOptionalDate(r.publishedAt),
            createdAt: toDate(r.createdAt),
            updatedAt: toDate(r.updatedAt),
          });
        }
      }

      if (Array.isArray(tables.projects)) {
        for (const r of tables.projects) {
          await db.insert(schema.projects).ignore().values({
            ...r,
            deletedAt: toOptionalDate(r.deletedAt),
            createdAt: toDate(r.createdAt),
            updatedAt: toDate(r.updatedAt),
          });
        }
      }

      if (Array.isArray(tables.projectTranslations)) {
        for (const r of tables.projectTranslations) {
          await db.insert(schema.projectTranslations).ignore().values({
            ...r,
            publishedAt: toOptionalDate(r.publishedAt),
            createdAt: toDate(r.createdAt),
            updatedAt: toDate(r.updatedAt),
          });
        }
      }

      if (Array.isArray(tables.freelanceProjects)) {
        for (const r of tables.freelanceProjects) {
          await db.insert(schema.freelanceProjects).ignore().values({
            ...r,
            deletedAt: toOptionalDate(r.deletedAt),
            createdAt: toDate(r.createdAt),
            updatedAt: toDate(r.updatedAt),
          });
        }
      }

      if (Array.isArray(tables.freelanceProjectTranslations)) {
        for (const r of tables.freelanceProjectTranslations) {
          await db.insert(schema.freelanceProjectTranslations).ignore().values({
            ...r,
            publishedAt: toOptionalDate(r.publishedAt),
            createdAt: toDate(r.createdAt),
            updatedAt: toDate(r.updatedAt),
          });
        }
      }

      if (Array.isArray(tables.tags)) {
        for (const r of tables.tags) {
          await db.insert(schema.tags).ignore().values({
            ...r,
            createdAt: toDate(r.createdAt),
          });
        }
      }

      if (Array.isArray(tables.postTags)) {
        for (const r of tables.postTags) {
          await db.insert(schema.postTags).ignore().values(r);
        }
      }

      if (Array.isArray(tables.projectTags)) {
        for (const r of tables.projectTags) {
          await db.insert(schema.projectTags).ignore().values(r);
        }
      }

      if (Array.isArray(tables.siteSettings)) {
        for (const r of tables.siteSettings) {
          await db.insert(schema.siteSettings).ignore().values({
            ...r,
            updatedAt: toDate(r.updatedAt),
          });
        }
      }

      if (Array.isArray(tables.urlRedirects)) {
        for (const r of tables.urlRedirects) {
          await db.insert(schema.urlRedirects).ignore().values({
            ...r,
            createdAt: toDate(r.createdAt),
          });
        }
      }

      return {
        success: true,
        message: 'Data successfully restored from JSON archive. Please publish the static site to apply updates.',
      };
    } else if (candidateDbPath && fs.existsSync(candidateDbPath)) {
      // Legacy SQLite archive restoration
      console.log(`[restore] Detected legacy SQLite archive at ${candidateDbPath}. Running migration...`);
      const result = await migrateSqliteToMysql(candidateDbPath);
      return {
        success: result.migrated,
        message: result.migrated
          ? 'Legacy SQLite data successfully migrated into MySQL! Please publish the static site to apply updates.'
          : 'Legacy SQLite restore failed.',
      };
    } else {
      throw new Error('No valid database payload (data-export.json or portfolio.db) found in archive.');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Restore error:', errorMsg);
    return {
      success: false,
      message: `Restore failed: ${errorMsg}.`,
    };
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {}
  }
}
