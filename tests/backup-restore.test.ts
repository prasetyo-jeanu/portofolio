import { describe, expect, test, beforeAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createBackupArchive, restoreFromArchive } from '../src/lib/backup-service';
import { env } from '../src/lib/env';
import { closeDb } from '../src/db';

describe('Backup and Restore Service', () => {
  beforeAll(() => {
    closeDb();
  });
  test('rejects unsupported file formats', async () => {
    const result = await restoreFromArchive('dummy.txt', 'dummy.txt');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid file format');
  });

  test('creates a valid .tar.gz backup archive', async () => {
    const archivePath = await createBackupArchive();
    expect(fs.existsSync(archivePath)).toBe(true);
    expect(archivePath.endsWith('.tar.gz')).toBe(true);

    const stats = fs.statSync(archivePath);
    expect(stats.size).toBeGreaterThan(100);

    // Verify it contains portfolio.db
    const proc = Bun.spawn(['tar', '-tzf', archivePath]);
    const output = await new Response(proc.stdout).text();
    expect(output).toContain('portfolio.db');

    // Cleanup
    try {
      fs.unlinkSync(archivePath);
      fs.rmdirSync(path.dirname(archivePath));
    } catch {}
  });

  test('creates safety backup before restoring', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-restore-'));
    const dummyDbPath = path.join(tempDir, 'dummy.db');

    // Create a snapshot of current db as dummy source
    const live = (await import('../src/db')).getSqlite();
    const safeDummy = dummyDbPath.replace(/\\/g, '/').replace(/'/g, "''");
    live.exec(`VACUUM INTO '${safeDummy}';`);

    const result = await restoreFromArchive(dummyDbPath, 'dummy.db');
    expect(result.success).toBe(true);
    expect(result.safetyBackupPath).toBeDefined();
    if (result.safetyBackupPath) {
      expect(fs.existsSync(result.safetyBackupPath)).toBe(true);
      // Clean up the safety test backup
      try {
        fs.unlinkSync(result.safetyBackupPath);
      } catch {}
    }

    try {
      fs.unlinkSync(dummyDbPath);
      fs.rmdirSync(tempDir);
    } catch {}
  });
});
