import fs from 'node:fs';
import path from 'node:path';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
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
  migrate(db, { migrationsFolder });
  console.log(`Database migrated successfully at ${env.DATABASE_PATH}`);
  closeDb();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
