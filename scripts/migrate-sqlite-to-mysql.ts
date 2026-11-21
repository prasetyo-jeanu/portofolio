import fs from 'node:fs';
import { Database } from 'bun:sqlite';
import { db, closeDb } from '../src/db';
import * as schema from '../src/db/schema';
import { env } from '../src/lib/env';

export async function migrateSqliteToMysql(sqlitePath: string = env.DATABASE_PATH) {
  if (!fs.existsSync(sqlitePath)) {
    console.log(`[migrate-sqlite] No SQLite database found at ${sqlitePath}. Skipping migration.`);
    return { migrated: false, reason: 'FILE_NOT_FOUND' };
  }

  console.log(`[migrate-sqlite] Reading SQLite database from ${sqlitePath}...`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  const existingTables = sqlite
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    .all() as { name: string }[];
  const tableNames = new Set(existingTables.map((t) => t.name));

  const toDate = (val: any): Date => {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    if (typeof val === 'number') return new Date(val);
    const num = Number(val);
    if (!isNaN(num) && String(val).trim() !== '' && !String(val).includes('-') && !String(val).includes('T')) {
      return new Date(num);
    }
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const toOptionalDate = (val: any): Date | null => {
    if (val === null || val === undefined || val === '') return null;
    return toDate(val);
  };

  const toBool = (val: any): boolean => Boolean(val);

  console.log(`[migrate-sqlite] Starting table data transfer to MySQL...`);

  // 1. users
  if (tableNames.has('users')) {
    const rows = sqlite.query('SELECT * FROM users;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.users)
        .ignore()
        .values({
          id: r.id,
          email: r.email,
          name: r.name,
          passwordHash: r.password_hash,
          createdAt: toDate(r.created_at),
          updatedAt: toDate(r.updated_at),
        });
    }
    console.log(`[migrate-sqlite] users: ${rows.length} rows processed.`);
  }

  // 2. media
  if (tableNames.has('media')) {
    const rows = sqlite.query('SELECT * FROM media;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.media)
        .ignore()
        .values({
          id: r.id,
          filename: r.filename,
          storagePath: r.storage_path,
          publicUrl: r.public_url,
          mimeType: r.mime_type,
          sizeBytes: r.size_bytes,
          width: r.width ?? null,
          height: r.height ?? null,
          altId: r.alt_id ?? '',
          altEn: r.alt_en ?? '',
          createdAt: toDate(r.created_at),
        });
    }
    console.log(`[migrate-sqlite] media: ${rows.length} rows processed.`);
  }

  // 3. posts
  if (tableNames.has('posts')) {
    const rows = sqlite.query('SELECT * FROM posts;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.posts)
        .ignore()
        .values({
          id: r.id,
          category: r.category || 'engineering',
          featured: toBool(r.featured),
          coverMediaId: r.cover_media_id ?? null,
          deletedAt: toOptionalDate(r.deleted_at),
          createdAt: toDate(r.created_at),
          updatedAt: toDate(r.updated_at),
        });
    }
    console.log(`[migrate-sqlite] posts: ${rows.length} rows processed.`);
  }

  // 4. post_translations
  if (tableNames.has('post_translations')) {
    const rows = sqlite.query('SELECT * FROM post_translations;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.postTranslations)
        .ignore()
        .values({
          id: r.id,
          postId: r.post_id,
          locale: r.locale,
          title: r.title,
          slug: r.slug,
          summary: r.summary ?? '',
          contentMdx: r.content_mdx ?? '',
          seoTitle: r.seo_title ?? null,
          seoDescription: r.seo_description ?? null,
          ogImageUrl: r.og_image_url ?? null,
          status: r.status || 'draft',
          readingTimeMinutes: r.reading_time_minutes ?? 1,
          publishedAt: toOptionalDate(r.published_at),
          createdAt: toDate(r.created_at),
          updatedAt: toDate(r.updated_at),
        });
    }
    console.log(`[migrate-sqlite] post_translations: ${rows.length} rows processed.`);
  }

  // 5. projects
  if (tableNames.has('projects')) {
    const rows = sqlite.query('SELECT * FROM projects;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.projects)
        .ignore()
        .values({
          id: r.id,
          category: r.category || 'fullstack',
          featured: toBool(r.featured),
          isConfidential: toBool(r.is_confidential),
          demoUrl: r.demo_url ?? null,
          repoUrl: r.repo_url ?? null,
          coverMediaId: r.cover_media_id ?? null,
          galleryJson: r.gallery_json || '[]',
          sortOrder: r.sort_order ?? 0,
          deletedAt: toOptionalDate(r.deleted_at),
          createdAt: toDate(r.created_at),
          updatedAt: toDate(r.updated_at),
        });
    }
    console.log(`[migrate-sqlite] projects: ${rows.length} rows processed.`);
  }

  // 6. project_translations
  if (tableNames.has('project_translations')) {
    const rows = sqlite.query('SELECT * FROM project_translations;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.projectTranslations)
        .ignore()
        .values({
          id: r.id,
          projectId: r.project_id,
          locale: r.locale,
          title: r.title,
          slug: r.slug,
          role: r.role ?? '',
          summary: r.summary ?? '',
          contentMdx: r.content_mdx ?? '',
          seoTitle: r.seo_title ?? null,
          seoDescription: r.seo_description ?? null,
          ogImageUrl: r.og_image_url ?? null,
          status: r.status || 'draft',
          publishedAt: toOptionalDate(r.published_at),
          createdAt: toDate(r.created_at),
          updatedAt: toDate(r.updated_at),
        });
    }
    console.log(`[migrate-sqlite] project_translations: ${rows.length} rows processed.`);
  }

  // 7. freelance_projects
  if (tableNames.has('freelance_projects')) {
    const rows = sqlite.query('SELECT * FROM freelance_projects;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.freelanceProjects)
        .ignore()
        .values({
          id: r.id,
          category: r.category || 'freelance',
          featured: toBool(r.featured),
          isConfidential: toBool(r.is_confidential),
          demoUrl: r.demo_url ?? null,
          repoUrl: r.repo_url ?? null,
          coverMediaId: r.cover_media_id ?? null,
          techStackJson: r.tech_stack_json || '[]',
          sortOrder: r.sort_order ?? 0,
          deletedAt: toOptionalDate(r.deleted_at),
          createdAt: toDate(r.created_at),
          updatedAt: toDate(r.updated_at),
        });
    }
    console.log(`[migrate-sqlite] freelance_projects: ${rows.length} rows processed.`);
  }

  // 8. freelance_project_translations
  if (tableNames.has('freelance_project_translations')) {
    const rows = sqlite.query('SELECT * FROM freelance_project_translations;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.freelanceProjectTranslations)
        .ignore()
        .values({
          id: r.id,
          freelanceProjectId: r.freelance_project_id,
          locale: r.locale,
          title: r.title,
          slug: r.slug,
          summary: r.summary ?? '',
          contribution: r.contribution ?? '',
          approach: r.approach ?? '',
          impact: r.impact ?? '',
          status: r.status || 'published',
          publishedAt: toOptionalDate(r.published_at),
          createdAt: toDate(r.created_at),
          updatedAt: toDate(r.updated_at),
        });
    }
    console.log(`[migrate-sqlite] freelance_project_translations: ${rows.length} rows processed.`);
  }

  // 9. tags
  if (tableNames.has('tags')) {
    const rows = sqlite.query('SELECT * FROM tags;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.tags)
        .ignore()
        .values({
          id: r.id,
          name: r.name,
          slug: r.slug,
          kind: r.kind || 'topic',
          createdAt: toDate(r.created_at),
        });
    }
    console.log(`[migrate-sqlite] tags: ${rows.length} rows processed.`);
  }

  // 10. post_tags
  if (tableNames.has('post_tags')) {
    const rows = sqlite.query('SELECT * FROM post_tags;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.postTags)
        .ignore()
        .values({
          postId: r.post_id,
          tagId: r.tag_id,
        });
    }
    console.log(`[migrate-sqlite] post_tags: ${rows.length} rows processed.`);
  }

  // 11. project_tags
  if (tableNames.has('project_tags')) {
    const rows = sqlite.query('SELECT * FROM project_tags;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.projectTags)
        .ignore()
        .values({
          projectId: r.project_id,
          tagId: r.tag_id,
        });
    }
    console.log(`[migrate-sqlite] project_tags: ${rows.length} rows processed.`);
  }

  // 12. site_settings
  if (tableNames.has('site_settings')) {
    const rows = sqlite.query('SELECT * FROM site_settings;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.siteSettings)
        .ignore()
        .values({
          key: r.key,
          value: r.value,
          updatedAt: toDate(r.updated_at),
        });
    }
    console.log(`[migrate-sqlite] site_settings: ${rows.length} rows processed.`);
  }

  // 13. url_redirects
  if (tableNames.has('url_redirects')) {
    const rows = sqlite.query('SELECT * FROM url_redirects;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.urlRedirects)
        .ignore()
        .values({
          id: r.id,
          locale: r.locale,
          contentType: r.content_type,
          fromPath: r.from_path,
          toPath: r.to_path,
          statusCode: r.status_code ?? 301,
          createdAt: toDate(r.created_at),
        });
    }
    console.log(`[migrate-sqlite] url_redirects: ${rows.length} rows processed.`);
  }

  // 14. publishing_jobs
  if (tableNames.has('publishing_jobs')) {
    const rows = sqlite.query('SELECT * FROM publishing_jobs;').all() as any[];
    for (const r of rows) {
      await db
        .insert(schema.publishingJobs)
        .ignore()
        .values({
          id: r.id,
          status: r.status,
          triggerSource: r.trigger_source || 'admin',
          triggeredByUserId: r.triggered_by_user_id ?? null,
          summary: r.summary ?? null,
          logs: r.logs || '',
          errorMessage: r.error_message ?? null,
          startedAt: toDate(r.started_at),
          finishedAt: toOptionalDate(r.finished_at),
        });
    }
    console.log(`[migrate-sqlite] publishing_jobs: ${rows.length} rows processed.`);
  }

  sqlite.close();
  console.log(`[migrate-sqlite] All SQLite tables successfully copied to MySQL!`);
  return { migrated: true };
}

// Allow direct CLI execution
if (import.meta.main) {
  migrateSqliteToMysql()
    .then(async () => {
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[migrate-sqlite] Migration failed:', err);
      await closeDb();
      process.exit(1);
    });
}
