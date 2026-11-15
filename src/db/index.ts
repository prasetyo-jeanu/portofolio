import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import { env } from '../lib/env';

let sqliteInstance: Database | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensureDirectory(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getSqlite(): Database {
  if (!sqliteInstance) {
    ensureDirectory(env.DATABASE_PATH);
    sqliteInstance = new Database(env.DATABASE_PATH, { create: true });
    sqliteInstance.exec('PRAGMA journal_mode = WAL;');
    sqliteInstance.exec('PRAGMA synchronous = NORMAL;');
    sqliteInstance.exec('PRAGMA busy_timeout = 5000;');
    sqliteInstance.exec('PRAGMA foreign_keys = ON;');
  }
  return sqliteInstance;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getSqlite(), { schema });
  }
  return dbInstance;
}

export function closeDb() {
  if (sqliteInstance) {
    try {
      sqliteInstance.close(true);
    } catch {
      sqliteInstance.close();
    }
    sqliteInstance = null;
    dbInstance = null;
  }
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
