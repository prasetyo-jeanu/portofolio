import fs from 'node:fs';
import path from 'node:path';
import { createBackupArchive } from '../src/lib/backup-service';
import { closeDb } from '../src/db';

async function main() {
  console.log('Generating transfer archive from MySQL and uploads...');
  const archivePath = await createBackupArchive();
  const targetArchive = path.resolve(process.cwd(), 'data-transfer.tar.gz');

  if (fs.existsSync(targetArchive)) {
    fs.unlinkSync(targetArchive);
  }

  fs.copyFileSync(archivePath, targetArchive);
  fs.unlinkSync(archivePath);

  const stats = fs.statSync(targetArchive);
  console.log(`data-transfer.tar.gz created successfully! Size: ${stats.size} bytes`);
  await closeDb();
}

main().catch(async (err) => {
  console.error('Export failed:', err);
  await closeDb();
  process.exit(1);
});
