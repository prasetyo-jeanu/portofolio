import fs from 'node:fs';
import path from 'node:path';
import { getSqlite, closeDb } from '../src/db';
import { env } from '../src/lib/env';

async function main() {
  const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR || './data/backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dbBackupPath = path.join(backupDir, `portfolio-${stamp}.db`);

  const sqlite = getSqlite();
  // VACUUM INTO creates a clean, WAL-safe, standalone consistent snapshot without blocking readers
  const escaped = dbBackupPath.replace(/'/g, "''");
  sqlite.exec(`VACUUM INTO '${escaped}';`);
  console.log(`Created WAL-safe SQLite backup at ${dbBackupPath}`);

  // Enforce retention policy (keep last 14 backups by default)
  const retentionCount = Number(process.env.BACKUP_RETENTION || 14);
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('portfolio-') && f.endsWith('.db'))
    .sort()
    .reverse();

  for (const stale of files.slice(retentionCount)) {
    fs.unlinkSync(path.join(backupDir, stale));
    console.log(`Pruned old backup: ${stale}`);
  }

  // Ensure uploads dir exists for separate tar/rsync offsite sync
  if (fs.existsSync(env.UPLOAD_DIR)) {
    console.log(`Media upload directory ready for offsite sync: ${env.UPLOAD_DIR}`);
  }

  closeDb();
}

main().catch((err) => {
  console.error('Backup failed:', err);
  closeDb();
  process.exit(1);
});
