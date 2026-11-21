import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Database } from 'bun:sqlite';
import { createBackupArchive, restoreFromArchive } from '../src/lib/backup-service';
import { closeDb } from '../src/db';

describe('Backup and Restore Service', () => {
  beforeAll(async () => {
    await closeDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  test('rejects unsupported file formats', async () => {
    const result = await restoreFromArchive('dummy.txt', 'dummy.txt');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid file format');
  });

  test(
    'creates a valid .tar.gz backup archive containing data-export.json',
    async () => {
      const archivePath = await createBackupArchive();
      expect(fs.existsSync(archivePath)).toBe(true);
      expect(archivePath.endsWith('.tar.gz')).toBe(true);

      const stats = fs.statSync(archivePath);
      expect(stats.size).toBeGreaterThan(100);

      // Verify it contains data-export.json and uploads
      const proc = Bun.spawn(['tar', '-tzf', archivePath]);
      const output = await new Response(proc.stdout).text();
      expect(output).toContain('data-export.json');
      expect(output).toContain('uploads');

      // Test restoring from this freshly generated archive
      const restoreRes = await restoreFromArchive(archivePath, path.basename(archivePath));
      expect(restoreRes.success).toBe(true);

      // Cleanup
      try {
        fs.unlinkSync(archivePath);
        fs.rmdirSync(path.dirname(archivePath));
      } catch {}
    },
    20000,
  );

  test('supports restoring from a legacy SQLite .db file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-legacy-restore-'));
    const dummyDbPath = path.join(tempDir, 'dummy.db');

    // Create a standalone dummy SQLite database with a users table
    const testDb = new Database(dummyDbPath, { create: true });
    testDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO users VALUES (999, 'legacy@example.com', 'Legacy User', 'hash123', 1700000000000, 1700000000000);
    `);
    testDb.close();

    const result = await restoreFromArchive(dummyDbPath, 'dummy.db');
    expect(result.success).toBe(true);
    expect(result.message).toContain('Legacy SQLite');

    try {
      fs.unlinkSync(dummyDbPath);
      fs.rmdirSync(tempDir);
    } catch {}
  });
});
