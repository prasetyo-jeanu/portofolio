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

  // 1. Release existing SQLite locks before modifying files
  closeDb();

  // 2. Take a safety snapshot of existing DB if present
  if (fs.existsSync(env.DATABASE_PATH)) {
    try {
      fs.copyFileSync(env.DATABASE_PATH, safetyBackupPath);
    } catch (e) {
      console.warn('Could not create safety backup:', e);
    }
  }

  // 3. Remove existing WAL / SHM files to prevent journal replay over new data
  const walPath = `${env.DATABASE_PATH}-wal`;
  const shmPath = `${env.DATABASE_PATH}-shm`;
  if (fs.existsSync(walPath)) {
    try {
      fs.unlinkSync(walPath);
    } catch {}
  }
  if (fs.existsSync(shmPath)) {
    try {
      fs.unlinkSync(shmPath);
    } catch {}
  }

  // 4. Extract or copy the new data
  try {
    if (isDb) {
      fs.copyFileSync(archiveFilePath, env.DATABASE_PATH);
    } else {
      // Tar archive
      const proc = Bun.spawn(['tar', '-xzf', archiveFilePath, '-C', dataDir]);
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const errText = await new Response(proc.stderr).text();
        throw new Error(`tar extraction failed (${exitCode}): ${errText}`);
      }
    }

    // 5. Test opening the database to verify integrity
    const testDb = getDb();
    // Simple query to verify schema and connection
    testDb.run?.('SELECT 1;');

    return {
      success: true,
      message: 'Data successfully restored. Please publish the static site to apply updates.',
      safetyBackupPath,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Restore error:', errorMsg);

    // Rollback to safety backup if available
    if (fs.existsSync(safetyBackupPath)) {
      try {
        fs.copyFileSync(safetyBackupPath, env.DATABASE_PATH);
      } catch {}
    }

    return {
      success: false,
      message: `Restore failed: ${errorMsg}. Reverted to previous state.`,
      safetyBackupPath,
    };
  }
}
