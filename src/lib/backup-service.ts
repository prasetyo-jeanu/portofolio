import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { closeDb, getSqlite, getDb } from '../db';
import { env } from './env';

export interface RestoreResult {
  success: boolean;
  message: string;
  safetyBackupPath?: string;
}

/**
 * Creates a standalone .tar.gz archive containing a WAL-safe SQLite snapshot
 * and the uploads directory.
 */
export async function createBackupArchive(): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-backup-'));
  const tempDbPath = path.join(tempDir, 'portfolio.db');

  // 1. Take a safe point-in-time SQLite snapshot
  const sqlite = getSqlite();
  const escaped = tempDbPath.replace(/'/g, "''");
  sqlite.exec(`VACUUM INTO '${escaped}';`);

  // 2. Prepare tar archive path
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(tempDir, `portfolio-backup-${stamp}.tar.gz`);

  const dataDir = path.dirname(env.DATABASE_PATH);
  const uploadsDir = env.UPLOAD_DIR;

  // Check if uploads exists, if not create empty
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Copy uploads or run tar from tempDir and dataDir
  // Using Bun.spawn with tar
  // We'll create tar from tempDbPath and uploads directory
  const uploadsRel = path.relative(dataDir, uploadsDir) || 'uploads';
  const proc = Bun.spawn([
    'tar',
    '-czf',
    archivePath,
    '-C',
    tempDir,
    'portfolio.db',
    '-C',
    dataDir,
    uploadsRel,
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errText = await new Response(proc.stderr).text();
    throw new Error(`Failed to create backup archive (exit code ${exitCode}): ${errText}`);
  }

  // Cleanup temporary db file
  try {
    fs.unlinkSync(tempDbPath);
  } catch {}

  return archivePath;
}

/**
 * Restores data from an uploaded archive (.tar.gz, .tgz, or .db).
 * Automatically creates a pre-restore safety snapshot before touching live files.
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

  const dataDir = path.dirname(env.DATABASE_PATH);
  const backupDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safetyBackupPath = path.join(backupDir, `pre-restore-${stamp}.db`);

  // Staging directory for safe extraction
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-restore-staging-'));

  try {
    let candidateDbPath = '';

    if (isDb) {
      candidateDbPath = archiveFilePath;
    } else {
      // 1. Extract tar to isolated staging directory first
      const proc = Bun.spawn(['tar', '-xzf', archiveFilePath, '-C', stagingDir]);
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const errText = await new Response(proc.stderr).text();
        throw new Error(`tar extraction failed (${exitCode}): ${errText}`);
      }

      // Check for portfolio.db or any .db inside stagingDir
      const directDb = path.join(stagingDir, 'portfolio.db');
      if (fs.existsSync(directDb)) {
        candidateDbPath = directDb;
      } else {
        const found = fs.readdirSync(stagingDir).find((f) => f.endsWith('.db'));
        if (found) {
          candidateDbPath = path.join(stagingDir, found);
        }
      }

      // Copy uploads if present in staging
      const stagingUploads = path.join(stagingDir, 'uploads');
      if (fs.existsSync(stagingUploads)) {
        fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
        fs.cpSync(stagingUploads, env.UPLOAD_DIR, { recursive: true });
      }
    }

    if (!candidateDbPath || !fs.existsSync(candidateDbPath)) {
      throw new Error('No valid SQLite database file found in archive.');
    }

    // 2. Validate candidate DB before touching production
    const { Database } = await import('bun:sqlite');
    const testCandidate = new Database(candidateDbPath, { readonly: true });
    testCandidate.query('SELECT 1;').get();
    testCandidate.close();

    // 3. Flush and close live DB cleanly
    closeDb();

    // 4. Create safety snapshot of current live DB
    if (fs.existsSync(env.DATABASE_PATH)) {
      try {
        fs.copyFileSync(env.DATABASE_PATH, safetyBackupPath);
      } catch (e) {
        console.warn('Could not create safety backup:', e);
      }
    }

    // 5. Remove existing WAL & SHM files cleanly
    const walPath = `${env.DATABASE_PATH}-wal`;
    const shmPath = `${env.DATABASE_PATH}-shm`;
    try {
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch {}

    // 6. Copy new DB file to target DATABASE_PATH
    fs.copyFileSync(candidateDbPath, env.DATABASE_PATH);

    // 7. Verify live database reopens cleanly
    const liveTest = getSqlite();
    liveTest.query('SELECT 1;').get();

    return {
      success: true,
      message: 'Data successfully restored. Please publish the static site to apply updates.',
      safetyBackupPath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Restore error:', errorMsg);

    // Rollback to safety backup if available
    try {
      closeDb();
      if (fs.existsSync(safetyBackupPath)) {
        fs.copyFileSync(safetyBackupPath, env.DATABASE_PATH);
      }
    } catch {}

    return {
      success: false,
      message: `Restore failed: ${errorMsg}. Reverted to previous state.`,
      safetyBackupPath,
    };
  } finally {
    // Cleanup staging directory
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {}
  }
}
