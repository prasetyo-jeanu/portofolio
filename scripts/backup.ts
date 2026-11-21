import fs from 'node:fs';
import path from 'node:path';
import { createBackupArchive } from '../src/lib/backup-service';
import { closeDb } from '../src/db';

async function main() {
  const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR || './data/backups');
  fs.mkdirSync(backupDir, { recursive: true });

  console.log('Creating MySQL backup archive...');
  const archivePath = await createBackupArchive();
  const filename = path.basename(archivePath);
  const targetPath = path.join(backupDir, filename);

  fs.copyFileSync(archivePath, targetPath);
  fs.unlinkSync(archivePath);
  console.log(`Created backup archive at ${targetPath}`);

  // Enforce retention policy (keep last 14 backups by default)
  const retentionCount = Number(process.env.BACKUP_RETENTION || 14);
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('portfolio-backup-') && f.endsWith('.tar.gz'))
    .sort()
    .reverse();

  for (const stale of files.slice(retentionCount)) {
    fs.unlinkSync(path.join(backupDir, stale));
    console.log(`Pruned old backup: ${stale}`);
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error('Backup failed:', err);
  await closeDb();
  process.exit(1);
});
