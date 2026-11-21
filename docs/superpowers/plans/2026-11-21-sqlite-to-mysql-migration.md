# SQLite to MySQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the developer portfolio CMS database layer from Bun SQLite (`bun:sqlite` + `drizzle-orm/sqlite-core`) to remote MySQL (`mysql2/promise` + `drizzle-orm/mysql-core`) connecting directly to the user's Easypanel MySQL instance, with automated data migration and zero content loss.

**Architecture:** Replace the SQLite dialect in Drizzle ORM with `mysql-core`, establish a resilient connection pool via `mysql2/promise` pointing to `DATABASE_URL`, refactor `.returning()` queries to MySQL-compatible `insertId` / `.$returningId()` idioms, provide an automated one-off SQLite-to-MySQL data migration script, and adapt the admin backup/restore service to export structured JSON archives while preserving backwards compatibility for legacy SQLite backups.

**Tech Stack:** Bun runtime, Drizzle ORM (`drizzle-orm` v0.45+, `drizzle-kit` v0.31+), `mysql2` v3.12+, Astro v7, TypeScript v5.8.

**Spec:** [docs/superpowers/specs/2026-11-21-mysql-migration-design.md](file:///d:/PRAS/pri/app/porto/docs/superpowers/specs/2026-11-21-mysql-migration-design.md)

## Global Constraints

- Runtime: Bun (`bun --bun astro`, `bun run scripts/...`).
- Database Driver: `mysql2/promise` connection pool.
- Character Set / Collation: `utf8mb4` with `utf8mb4_unicode_ci` for multilingual support and emojis.
- Primary Keys & Slugs: All MySQL unique and primary key string columns must specify explicit length (e.g. `varchar({ length: 255 })`).
- Zero Query Regressions: Public page materialization (`scripts/materialize-content.ts`), search index generation (`pagefind`), and admin views must continue functioning without data loss.

## Review Focus

1. **MySQL `.returning()` Incompatibility**: MySQL does not support `RETURNING` clauses in `INSERT`/`UPDATE`. Every caller expecting returned records must use `.$returningId()` or follow-up select.
2. **Auto-Increment Primary Key Preservation during Migration**: When transferring rows from SQLite to MySQL, explicit primary key IDs (e.g. `media.id`, `posts.id`, `projects.id`) must be preserved to maintain foreign key integrity across join tables.
3. **Date/Time Precision & Parsing**: In SQLite dates were stored as integer millisecond timestamps (`timestamp_ms`), while in MySQL they will be `datetime({ mode: 'date', fsp: 3 })`. Drizzle must consistently serialize and deserialize JS `Date` objects.
4. **Idempotent Container Cutover**: In production, `server/entrypoint.ts` must only migrate data once; subsequent container restarts must check the sentinel file (`/data/.mysql-migrated`) and skip migration safely.
5. **Backup Archive Backward Compatibility**: Restoring an old `.tar.gz` backup containing `portfolio.db` must detect the SQLite format and migrate into MySQL without throwing an unpack error.

---

### Task 1: Package Dependencies & Environment Configuration

**Files:**
- Modify: `package.json:25-54`
- Modify: `src/lib/env.ts:1-43`
- Modify: `.env.example:1-25`
- Modify: `drizzle.config.ts:1-10`

**Interfaces:**
- Consumes: `process.env.DATABASE_URL`
- Produces: `env.DATABASE_URL: string | undefined`, `env.MYSQL_HOST: string`, `env.MYSQL_PORT: number`, `env.MYSQL_USER: string`, `env.MYSQL_PASSWORD: string`, `env.MYSQL_DATABASE: string`

- [ ] **Step 1: Install `mysql2` and `@types/mysql2`**
Run:
```bash
bun add mysql2
bun add -d @types/mysql2
```

- [ ] **Step 2: Update `src/lib/env.ts` with MySQL environment variables**
Add getters for `DATABASE_URL`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE` with fallback defaults. Keep `DATABASE_PATH` for backwards compatibility with the migration script.

- [ ] **Step 3: Update `drizzle.config.ts` to MySQL dialect**
Change `dialect: 'mysql'` and update credentials to use `process.env.DATABASE_URL`.

- [ ] **Step 4: Update `.env.example`**
Add `DATABASE_URL=mysql://root:password@localhost:3306/portfolio` and document MySQL configuration options.

- [ ] **Step 5: Verify environment configuration**
Run: `bun --bun -e "import { env } from './src/lib/env'; console.log('DB URL configured:', Boolean(env.DATABASE_URL));"`
Expected: Output `DB URL configured: true`.

- [ ] **Step 6: Commit**
```bash
git add package.json bun.lock drizzle.config.ts src/lib/env.ts .env.example
git commit -m "feat(db): install mysql2 and configure mysql environment variables"
```

---

### Task 2: Schema Conversion to Drizzle MySQL

**Files:**
- Modify: `src/db/schema.ts:1-273`

**Interfaces:**
- Consumes: `drizzle-orm/mysql-core`
- Produces: `users`, `sessions`, `media`, `posts`, `postTranslations`, `projects`, `projectTranslations`, `freelanceProjects`, `freelanceProjectTranslations`, `tags`, `postTags`, `projectTags`, `siteSettings`, `publishingJobs`, `urlRedirects` tables with MySQL column types and relation types.

- [ ] **Step 1: Replace imports and convert tables to `mysqlTable`**
In `src/db/schema.ts`:
- Import `mysqlTable`, `int`, `varchar`, `text`, `mediumtext`, `boolean`, `datetime`, `primaryKey`, `uniqueIndex`, `index`, `mysqlEnum` from `drizzle-orm/mysql-core`.
- Replace `sqliteTable` with `mysqlTable`.
- Convert `integer('id').primaryKey({ autoIncrement: true })` $\rightarrow$ `int('id').autoincrement().primaryKey()`.
- Convert `text('id').primaryKey()` $\rightarrow$ `varchar('id', { length: 255 }).primaryKey()`.
- Convert timestamp fields: `datetime('...', { mode: 'date', fsp: 3 })`.
- Convert booleans: `boolean('...').notNull().default(false)`.
- Convert enums: `mysqlEnum('locale', ['id', 'en'])`, `mysqlEnum('status', ['draft', 'published', 'archived'])`, `mysqlEnum('kind', ['topic', 'tech'])`.
- Convert large markdown texts: `mediumtext('content_mdx').notNull().default('')`.
- Add explicit lengths to all `varchar` keys and slugs: `varchar('slug', { length: 255 })`, `varchar('email', { length: 255 })`, `varchar('key', { length: 191 }).primaryKey()`.

- [ ] **Step 2: Run typecheck to verify schema definitions**
Run: `bun run typecheck`
Expected: Typecheck passes or reveals only call sites using SQLite-specific features (to be addressed in subsequent tasks).

- [ ] **Step 3: Commit**
```bash
git add src/db/schema.ts
git commit -m "feat(db): convert schema from sqlite-core to mysql-core"
```

---

### Task 3: Database Client & Connection Pool

**Files:**
- Modify: `src/db/index.ts:1-58`
- Modify: `scripts/migrate.ts:1-26`

**Interfaces:**
- Consumes: `mysql2/promise`, `drizzle-orm/mysql2`, `src/db/schema.ts`, `src/lib/env.ts`
- Produces: `getPool(): mysql.Pool`, `getDb(): MySql2Database<typeof schema>`, `closeDb(): Promise<void>`, `db: MySql2Database<typeof schema>`

- [ ] **Step 1: Rewrite `src/db/index.ts` with `mysql2/promise` pool**
Implement:
- Connection pooling with keep-alive (`connectionLimit: 10`, `enableKeepAlive: true`).
- Support both `env.DATABASE_URL` (direct URI) and granular host/user/pass parameters.
- Provide `getPool()`, `getDb()`, `closeDb()`, and proxy `db`.

- [ ] **Step 2: Update `scripts/migrate.ts` to use `drizzle-orm/mysql2/migrator`**
Replace `drizzle-orm/bun-sqlite/migrator` with `drizzle-orm/mysql2/migrator`. Make the migration function `async` and await `migrate(db, { migrationsFolder })`.

- [ ] **Step 3: Test database connectivity to Easypanel MySQL**
Run a test query via bun:
```bash
bun --bun -e "import { getDb, closeDb } from './src/db'; const db = getDb(); console.log('Connected!'); await closeDb();"
```
Expected: Output `Connected!` without timeout or connection refused errors.

- [ ] **Step 4: Commit**
```bash
git add src/db/index.ts scripts/migrate.ts
git commit -m "feat(db): implement mysql2 connection pool and mysql migration runner"
```

---

### Task 4: Query Refactoring (`.returning()` & Transactions)

**Files:**
- Modify: `src/actions/index.ts:1-300`
- Modify: `src/pages/api/media/upload.ts:1-90`
- Modify: `src/lib/publish.ts:1-120`
- Modify: `src/lib/freelance-service.ts:1-200`
- Modify: `src/lib/portfolio-importer.ts:1-250`
- Modify: `src/lib/freelance-importer.ts:1-250`

**Interfaces:**
- Consumes: `drizzle-orm/mysql2` query builder
- Produces: Refactored actions and utilities compatible with MySQL syntax without runtime errors.

- [ ] **Step 1: Refactor `src/pages/api/media/upload.ts`**
Replace:
```typescript
const [inserted] = await db.insert(media).values(...).returning();
```
With:
```typescript
const [result] = await db.insert(media).values(...);
const insertedId = result.insertId;
const [inserted] = await db.select().from(media).where(eq(media.id, insertedId)).limit(1);
```

- [ ] **Step 2: Refactor `src/actions/index.ts`**
In `savePost`:
- Replace `.returning()` with insert result `insertId` or follow-up fetch by ID.
In `saveProject`:
- Replace `.returning()` with insert result `insertId` or follow-up fetch by ID.
In `toggleProjectFeatured`:
- Perform `db.update(projects).set({ featured: newFeatured }).where(eq(projects.id, id))` and return `{ id, featured: newFeatured }`.

- [ ] **Step 3: Refactor `src/lib/publish.ts`**
In `startPublishingJob`:
- Replace `db.insert(publishingJobs).values(...).returning()` with `await db.insert(...)`, extract `result.insertId`, and fetch the job row.

- [ ] **Step 4: Refactor `src/lib/freelance-service.ts`**
- Replace all `.returning(...)` queries with `insertId` retrieval.
- Ensure transaction callbacks are `async (tx) => { ... }`.

- [ ] **Step 5: Refactor `src/lib/portfolio-importer.ts` and `src/lib/freelance-importer.ts`**
- Replace `.returning({ id: ... })` with `result.insertId`.

- [ ] **Step 6: Run TypeScript typecheck to verify query compatibility**
Run: `bun run typecheck`
Expected: PASS with 0 errors across all actions and libraries.

- [ ] **Step 7: Commit**
```bash
git add src/actions/index.ts src/pages/api/media/upload.ts src/lib/publish.ts src/lib/freelance-service.ts src/lib/portfolio-importer.ts src/lib/freelance-importer.ts
git commit -m "refactor(db): replace .returning() clauses with mysql2 insertId queries"
```

---

### Task 5: Data Migration Utility (`scripts/migrate-sqlite-to-mysql.ts`)

**Files:**
- Create: `scripts/migrate-sqlite-to-mysql.ts`
- Modify: `package.json:12-24`

**Interfaces:**
- Consumes: `bun:sqlite` (`env.DATABASE_PATH`), `src/db/index.ts` (`db`), `src/db/schema.ts`
- Produces: CLI script `bun run db:migrate-sqlite` that reads existing SQLite records and inserts them into MySQL preserving IDs and relationships.

- [ ] **Step 1: Write `scripts/migrate-sqlite-to-mysql.ts`**
The script will:
1. Verify if `env.DATABASE_PATH` (`data/portfolio.db`) exists. If not, log a notice and exit cleanly.
2. Open SQLite via `new Database(env.DATABASE_PATH, { readonly: true })`.
3. Read and insert data table-by-table in dependency order:
   - `users`
   - `media`
   - `posts`
   - `post_translations`
   - `projects`
   - `project_translations`
   - `freelance_projects`
   - `freelance_project_translations`
   - `tags`
   - `post_tags`
   - `project_tags`
   - `site_settings`
   - `url_redirects`
   - `publishing_jobs`
4. Convert SQLite timestamps (integers) to JavaScript `Date` objects before inserting.
5. Log row counts for every table transferred.
6. Close both database connections.

- [ ] **Step 2: Add npm script in `package.json`**
Add `"db:migrate-sqlite": "bun run scripts/migrate-sqlite-to-mysql.ts"`.

- [ ] **Step 3: Commit**
```bash
git add scripts/migrate-sqlite-to-mysql.ts package.json
git commit -m "feat(db): add automated sqlite-to-mysql data migration script"
```

---

### Task 6: Automatic Cutover in Server Entrypoint & Docker Deployment

**Files:**
- Modify: `server/entrypoint.ts:1-160`
- Modify: `docker-compose.yml:1-30`
- Modify: `Dockerfile:1-40`

**Interfaces:**
- Consumes: `env.DATABASE_URL`, `env.DATABASE_PATH`
- Produces: Automated migration check on container boot via sentinel file `/data/.mysql-migrated`.

- [ ] **Step 1: Update `server/entrypoint.ts`**
Before starting the HTTP listener:
- Log the MySQL target host (sanitizing password from `DATABASE_URL`).
- Check if `env.DATABASE_PATH` (`/data/portfolio.db`) exists AND sentinel `/data/.mysql-migrated` does NOT exist.
- If true, run `migrateSqliteToMysql()` dynamically, create `/data/.mysql-migrated`, and log success.

- [ ] **Step 2: Update `docker-compose.yml` and `Dockerfile`**
- In `docker-compose.yml`:
  - Add `DATABASE_URL: ${DATABASE_URL}` to `portfolio` service environment.
- In `Dockerfile`:
  - Ensure `DATABASE_URL` is accepted as an environment variable.

- [ ] **Step 3: Commit**
```bash
git add server/entrypoint.ts docker-compose.yml Dockerfile
git commit -m "feat(deploy): implement auto-cutover migration on container startup and update docker config"
```

---

### Task 7: Backup & Restore Service Adaptation

**Files:**
- Modify: `src/lib/backup-service.ts:1-250`
- Modify: `scripts/export-transfer.ts:1-60`

**Interfaces:**
- Consumes: `src/db/index.ts` (`db`), `src/db/schema.ts`
- Produces: Database-agnostic `createBackupArchive()` and backward-compatible `restoreFromArchive()`.

- [ ] **Step 1: Update `createBackupArchive()` in `src/lib/backup-service.ts`**
- Replace SQLite `VACUUM INTO` with structured JSON serialization of all tables (`data-export.json`).
- Package `data-export.json` + `uploads/` directory into a `.tar.gz` archive.

- [ ] **Step 2: Update `restoreFromArchive()` in `src/lib/backup-service.ts`**
- Extract archive to a temporary directory.
- Check archive format:
  - If `data-export.json` is present: parse JSON, clear tables within transaction, and re-insert rows.
  - If `portfolio.db` is present (legacy backup): run the SQLite-to-MySQL data migration logic to populate MySQL.
- Restore `uploads/` directory.

- [ ] **Step 3: Update `scripts/export-transfer.ts`**
Use `createBackupArchive()` logic to export a transfer archive without relying on `VACUUM INTO`.

- [ ] **Step 4: Commit**
```bash
git add src/lib/backup-service.ts scripts/export-transfer.ts
git commit -m "feat(backup): adapt backup and restore service to json export with legacy sqlite support"
```

---

### Task 8: End-to-End Verification & Content Materialization

**Files:**
- Test / Verify all touched components.

**Interfaces:**
- Consumes: Remote Easypanel MySQL instance via `DATABASE_URL` in `.env`
- Produces: Verified working database, materialized MDX content, and production Astro build.

- [ ] **Step 1: Generate MySQL migrations**
Run: `bun run db:generate`
Verify generated SQL files in `drizzle/` directory.

- [ ] **Step 2: Run migration against Easypanel MySQL**
Run: `bun run db:migrate`
Expected: Tables created successfully in the remote MySQL database.

- [ ] **Step 3: Run data migration from existing local SQLite**
Run: `bun run db:migrate-sqlite`
Expected: Rows copied from `data/portfolio.db` to MySQL; row counts verified.

- [ ] **Step 4: Run seed (idempotent check)**
Run: `bun run db:seed`
Expected: Admin user and default settings verified.

- [ ] **Step 5: Run static content materialization**
Run: `bun run build:content`
Expected: `.generated-content/` MDX files populated successfully from MySQL data.

- [ ] **Step 6: Run full production build**
Run: `bun run build`
Expected: Astro build succeeds with Pagefind index generation.

- [ ] **Step 7: Commit any migration artifacts**
```bash
git add drizzle/
git commit -m "chore(db): generate and commit mysql drizzle migrations"
```
