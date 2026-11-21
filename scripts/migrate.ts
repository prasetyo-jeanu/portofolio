import fs from 'node:fs';
import path from 'node:path';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { getDb, closeDb } from '../src/db';
import { env } from '../src/lib/env';

async function main() {
  if (!fs.existsSync(env.UPLOAD_DIR)) {
    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  }

  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  if (!fs.existsSync(migrationsFolder)) {
    throw new Error(`Migrations folder not found at ${migrationsFolder}. Run "bun run db:generate" first.`);
  }

  const db = getDb();
  await migrate(db, { migrationsFolder });
  console.log(`Database migrated successfully to MySQL target.`);
  await closeDb();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNREFUSED' || String(err).includes('ETIMEDOUT')) {
    console.error('\n[db troubleshooting] Connection to MySQL timed out or was refused.');
    console.error('[db troubleshooting] 1. Verify DATABASE_URL is set in Easypanel Environment Variables.');
    console.error('[db troubleshooting] 2. In Easypanel/Docker, use internal service name (e.g. mysql:3306) rather than public IP (217.217.255.58:3307), as Docker drops hairpin connections to host public IP.');
  }
  process.exit(1);
});
