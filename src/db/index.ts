import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from './schema';
import { env } from '../lib/env';

let pool: mysql.Pool | null = null;
let dbInstance: MySql2Database<typeof schema> | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    if (env.DATABASE_URL) {
      try {
        const parsed = new URL(env.DATABASE_URL);
        console.log(`[db] Connecting to MySQL via DATABASE_URL (host: ${parsed.hostname}, port: ${parsed.port || 3306}, database: ${parsed.pathname.replace(/^\//, '')}, user: ${parsed.username})`);
      } catch {
        console.log(`[db] Connecting to MySQL via DATABASE_URL`);
      }
      pool = mysql.createPool({
        uri: env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 10000,
      });
    } else {
      console.warn(`[db] WARNING: DATABASE_URL is not set! Falling back to host: ${env.MYSQL_HOST}:${env.MYSQL_PORT}, database: ${env.MYSQL_DATABASE}, user: ${env.MYSQL_USER}`);
      pool = mysql.createPool({
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD,
        database: env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 10000,
      });
    }
  }
  return pool;
}

export function getDb(): MySql2Database<typeof schema> {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema, mode: 'default' });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    dbInstance = null;
  }
}

export const db: MySql2Database<typeof schema> = new Proxy({} as MySql2Database<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
