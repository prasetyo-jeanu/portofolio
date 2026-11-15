import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-export-'));
const snapshotDb = path.join(tempDir, 'portfolio.db');
const normalizedSnapshot = snapshotDb.replace(/\\/g, '/').replace(/'/g, "''");

console.log('Connecting to local portfolio.db...');
const db = new Database('data/portfolio.db');
db.exec(`VACUUM INTO '${normalizedSnapshot}';`);
db.close();

console.log('Snapshot created successfully at:', snapshotDb);

// Verify snapshot
const test = new Database(snapshotDb, { readonly: true });
const tables = test.query("SELECT name FROM sqlite_master WHERE type='table';").all();
console.log('Verified tables in snapshot:', tables.length);
test.close();

// Build data-transfer.tar.gz
const targetArchive = path.resolve(process.cwd(), 'data-transfer.tar.gz');
if (fs.existsSync(targetArchive)) {
  fs.unlinkSync(targetArchive);
}

const proc = Bun.spawn([
  'tar',
  '-czf',
  targetArchive,
  '-C',
  tempDir,
  'portfolio.db',
  '-C',
  path.resolve(process.cwd(), 'data'),
  'uploads',
]);

const exitCode = await proc.exited;
if (exitCode !== 0) {
  const err = await new Response(proc.stderr).text();
  console.error('Tar creation failed:', err);
  process.exit(1);
}

console.log('data-transfer.tar.gz created successfully! Size:', fs.statSync(targetArchive).size, 'bytes');

fs.rmSync(tempDir, { recursive: true, force: true });
