# Design Spec: SQLite to MySQL Migration (Easypanel & Direct Connection)

**Date:** 2026-11-21  
**Status:** Ready for Approval  
**Author:** Antigravity (AI Architect)

---

## 1. Intent & Why

The portfolio CMS currently runs on a file-based SQLite database (`bun:sqlite` + `drizzle-orm/sqlite-core`) stored at `data/portfolio.db`. 
A dedicated **MySQL** instance is already deployed and accessible on Docker via Easypanel. Migrating the application to this MySQL instance provides:
- Decoupling of application container and persistent database storage.
- Support for concurrent connections and robust multi-process deployments.
- Unified database management, automated backups, and monitoring via Easypanel.
- Seamless compatibility with the Bun runtime via `mysql2/promise` and Drizzle ORM's MySQL dialect.
- Direct connection from local development to the Easypanel MySQL database via `DATABASE_URL`.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Full Schema Conversion**:
  - Migrate all 14 tables in `src/db/schema.ts` from `drizzle-orm/sqlite-core` to `drizzle-orm/mysql-core`.
  - Ensure correct MySQL data types (`int().autoincrement()`, `varchar(255)` for unique keys/slugs, `datetime({ mode: 'date', fsp: 3 })` for timestamps, `boolean`, `mysqlEnum`, `text`/`mediumtext` for MDX).
- **Driver & Connection Pool**:
  - Replace `bun:sqlite` connection in `src/db/index.ts` with connection pooling using `mysql2/promise` and `drizzle-orm/mysql2`.
  - Support `DATABASE_URL` (e.g. `mysql://user:password@host:3306/dbname`) and separate fallback variables (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`).
- **Query Refactoring for MySQL Compatibility**:
  - Refactor all `.returning()` clauses across `src/actions/*`, `src/lib/*`, and API routes to use Drizzle MySQL `.$returningId()` or `result[0].insertId` plus follow-up reads where needed.
  - Convert any synchronous transaction blocks to `async (tx) => ...`.
- **Automated Production Cutover & Migration Utility**:
  - Provide a standalone script `scripts/migrate-sqlite-to-mysql.ts` to copy all data from local `data/portfolio.db` into MySQL.
  - In `server/entrypoint.ts`, add an automatic one-time migration check on container startup: if `/data/portfolio.db` exists and `/data/.mysql-migrated` sentinel file does not exist, automatically execute the SQLite-to-MySQL data migration and write the sentinel file.
- **Environment & Docker**:
  - Update `.env.example`, `.env`, `docker-compose.yml`, and `Dockerfile` to use MySQL configuration (`DATABASE_URL`).
- **Admin Backup/Restore Backward Compatibility**:
  - New backups export all MySQL tables into structured `data-export.json` + `uploads/` archive.
  - The restore handler in `src/lib/backup-service.ts` supports both the new JSON format and legacy `.tar.gz` SQLite archives (extracts and copies legacy SQLite data into MySQL).

### Non-Goals
- Changing ORMs (staying strictly on Drizzle ORM to preserve all existing page queries and actions).
- Dual-database dialect runtime (maintaining both SQLite and MySQL simultaneously in the application code).

### Anti-Goals
- Do not lose existing portfolio data (posts, projects, freelance projects, translations, media metadata, site settings).
- Do not break existing UI workflows in admin and public pages.

---

## 3. Constraints & User Decisions

- **Database Host**: The MySQL database is hosted on Easypanel Docker and is already running and accessible.
- **Development Workflow**: Local development (`bun run dev`) and CI will connect directly to the MySQL instance via `DATABASE_URL` in `.env`.
- **Runtime**: Bun runtime (`bun --bun astro`). `mysql2` is fully compatible with Bun's Node compatibility layer.
- **Character Set**: `utf8mb4` with collation `utf8mb4_unicode_ci` to support multilingual content (Indonesian & English) and emojis.
- **Indexed Columns**: MySQL requires explicit length on `VARCHAR` when used as primary keys, unique constraints, or indexed columns.

---

## 4. Detailed Architecture & Implementation Specification

### 4.1 Dependencies
Install `mysql2` and its TypeScript definitions:
```bash
bun add mysql2
bun add -d @types/mysql2
```

### 4.2 Schema Conversion (`src/db/schema.ts`)
Map SQLite types to MySQL types:
- `sqliteTable` $\rightarrow$ `mysqlTable`
- `integer('id').primaryKey({ autoIncrement: true })` $\rightarrow$ `int('id').autoincrement().primaryKey()`
- `text('id').primaryKey()` $\rightarrow$ `varchar('id', { length: 255 }).primaryKey()`
- `integer('created_at', { mode: 'timestamp_ms' })` $\rightarrow$ `datetime('created_at', { mode: 'date', fsp: 3 }).notNull()`
- `integer('featured', { mode: 'boolean' })` $\rightarrow$ `boolean('featured').notNull().default(false)`
- `text('slug')` with unique index $\rightarrow$ `varchar('slug', { length: 255 }).notNull()`
- `text('email')` unique $\rightarrow$ `varchar('email', { length: 255 }).notNull()`
- `text('locale', { enum: ['id', 'en'] })` $\rightarrow$ `mysqlEnum('locale', ['id', 'en']).notNull()`
- `text('content_mdx')` $\rightarrow$ `mediumtext('content_mdx').notNull()`
- `text('gallery_json')` $\rightarrow$ `text('gallery_json').notNull()`
- Table unique indexes and composite foreign keys:
  - `uniqueIndex('post_translations_locale_slug_uq').on(table.locale, table.slug)`
  - Composite primary keys using `primaryKey({ columns: [table.postId, table.tagId] })`

### 4.3 Database Client & Connection Pool (`src/db/index.ts`)
```typescript
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema';
import { env } from '../lib/env';

let pool: mysql.Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    if (env.DATABASE_URL) {
      pool = mysql.createPool({
        uri: env.DATABASE_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      });
    } else {
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
      });
    }
  }
  return pool;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema, mode: 'default' });
  }
  return dbInstance;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
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
```

### 4.4 Query Refactoring (`.returning()` Replacement)
Files updated:
1. `src/actions/index.ts`:
   - `savePost`: replace `.returning()` with `.$returningId()` to get `inserted[0].id`, or query by ID after insert/update.
   - `saveProject`: replace `.returning()` with `.$returningId()`.
   - `toggleProjectFeatured`: execute update and return `{ id, featured: !current }`.
2. `src/pages/api/media/upload.ts`:
   - Replace `db.insert(media).values(...).returning()` with `.$returningId()` and select the created media record.
3. `src/lib/publish.ts`:
   - Replace `db.insert(publishingJobs).values(...).returning()` with `.$returningId()`.
4. `src/lib/freelance-service.ts`:
   - Replace `.returning()` with `.$returningId()` and ensure transaction functions are `async`.

### 4.5 Automated Production Cutover & Data Migration
- **Script**: `scripts/migrate-sqlite-to-mysql.ts`:
  - Connects to SQLite at `env.DATABASE_PATH` and MySQL via `getDb()`.
  - Migrates tables in topological order:
    1. `users`
    2. `media`
    3. `posts` & `post_translations`
    4. `projects` & `project_translations`
    5. `freelance_projects` & `freelance_project_translations`
    6. `tags`, `post_tags`, `project_tags`
    7. `site_settings`
    8. `url_redirects`
    9. `publishing_jobs`
  - Logs row counts before and after to verify data fidelity.
- **Entrypoint check (`server/entrypoint.ts`)**:
  - On startup, if `env.DATABASE_URL` is configured:
    - Check if `data/portfolio.db` exists AND `data/.mysql-migrated` does NOT exist.
    - If so, run migration, write `data/.mysql-migrated`, and proceed to start server.

### 4.6 Backup & Restore Service (`src/lib/backup-service.ts`)
- **Export**:
  - Dumps all tables to `data-export.json`.
  - Packs `data-export.json` + `uploads/` into `.tar.gz`.
- **Restore**:
  - If `.tar.gz` contains `data-export.json`: parses JSON and re-inserts into MySQL tables.
  - If legacy `.tar.gz` containing `portfolio.db` or raw `.db` is uploaded: runs SQLite-to-MySQL table importer.

### 4.7 CI/CD Pipeline
- Update `.gitlab-ci.yml`:
  - Provide `DATABASE_URL` secret variable in GitLab CI or run unit tests that do not require live DB connection.

---

## 5. Verification Plan

1. **Type Safety**: Run `bun run typecheck` and `bun run check` to verify zero type mismatches with Drizzle MySQL.
2. **Schema Generation**: Run `bun run db:generate` to verify clean MySQL DDL generation.
3. **Database Migration & Seed**: Run `bun run db:migrate` and `bun run db:seed` against the Easypanel MySQL instance.
4. **Data Transfer Test**: Run `bun run scripts/migrate-sqlite-to-mysql.ts` and verify exact row count matches for all tables.
5. **Static Materialization & Build**: Run `bun run build` (`materialize-content` $\rightarrow$ `astro build` $\rightarrow$ `pagefind`) to confirm static content builds flawlessly from MySQL.
6. **Admin Verification**: Test Admin login, editing a project/article, uploading a media file, and downloading a backup.
