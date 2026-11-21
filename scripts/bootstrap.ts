import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/lib/env';

async function main() {
  console.log('[bootstrap] Running MySQL migrations...');
  const procMigrate = Bun.spawn(['bun', 'run', 'scripts/migrate.ts'], { stdout: 'inherit', stderr: 'inherit' });
  const exitMigrate = await procMigrate.exited;
  if (exitMigrate !== 0) {
    throw new Error(`[bootstrap] db:migrate failed with exit code ${exitMigrate}`);
  }

  // Automatic one-time cutover check: if SQLite file exists and .mysql-migrated sentinel does not exist
  const dataDir = path.dirname(env.DATABASE_PATH);
  const sentinelFile = path.join(dataDir, '.mysql-migrated');

  if (fs.existsSync(env.DATABASE_PATH) && !fs.existsSync(sentinelFile)) {
    console.log('[bootstrap] Detected existing SQLite database and no .mysql-migrated marker.');
    console.log('[bootstrap] Executing automatic one-time migration to MySQL...');
    try {
      const { migrateSqliteToMysql } = await import('./migrate-sqlite-to-mysql');
      const result = await migrateSqliteToMysql(env.DATABASE_PATH);
      if (result.migrated) {
        fs.writeFileSync(sentinelFile, new Date().toISOString(), 'utf-8');
        console.log('[bootstrap] Auto-migration completed. Marker created at:', sentinelFile);
      }
    } catch (err) {
      console.error('[bootstrap] Auto-migration error:', err);
    }
  }

  console.log('[bootstrap] Running idempotent seed...');
  const procSeed = Bun.spawn(['bun', 'run', 'scripts/seed.ts'], { stdout: 'inherit', stderr: 'inherit' });
  const exitSeed = await procSeed.exited;
  if (exitSeed !== 0) {
    throw new Error(`[bootstrap] db:seed failed with exit code ${exitSeed}`);
  }

  console.log('[bootstrap] Starting portfolio server entrypoint...');
  const procServer = Bun.spawn(['bun', 'run', 'server/entrypoint.ts'], { stdout: 'inherit', stderr: 'inherit' });
  await procServer.exited;
}

main().catch((err) => {
  console.error('[bootstrap] Startup failed:', err);
  process.exit(1);
});
