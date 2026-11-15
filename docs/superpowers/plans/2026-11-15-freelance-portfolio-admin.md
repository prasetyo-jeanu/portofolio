# Freelance Portfolio Admin Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `Freelance` admin menu (`/admin/freelance` and `/admin/freelance/[id]`) backed by isolated SQLite tables, Astro actions, and an idempotent importer that loads the 12 Indonesian freelance projects from `porto_prompt/porto_tambahan_onlinenotepad.io.txt`.

**Architecture:** Isolate freelance data into dedicated `freelance_projects` and `freelance_project_translations` Drizzle tables so existing public `projects`, `scripts/materialize-content.ts`, and static routes remain completely untouched. Extract validation and DB mutation logic into `src/lib/freelance-service.ts` so both Astro Actions (`src/actions/index.ts`) and Bun integration tests exercise the exact same code paths, and build the admin list/editor UI following the existing `/admin/projects` UX (`attachDragReorder`, `AdminStickyHeader`, `AdminLayout`).

**Tech Stack:** Astro 7, Bun (`bun:sqlite`, `bun:test`), Drizzle ORM + Drizzle Kit, Zod (`astro/zod`), Tailwind CSS v4.

**Spec:** [2026-11-15-freelance-portfolio-admin-design.md](file:///d:/PROJECT/portofilio/docs/superpowers/specs/2026-11-15-freelance-portfolio-admin-design.md)

## Global Constraints

- All `/admin/freelance*` pages remain protected by `src/middleware.ts`, and all freelance Astro actions must enforce `requireAdmin(context)`.
- Public routes (`/id/*`, `/en/*`), `HomeView.astro`, `src/content.config.ts`, and `scripts/materialize-content.ts` must NOT be modified and freelance items must NOT enter `.generated-content/`.
- `Kontribusi`, `Pendekatan`, and `Dampak` must remain separate structured text fields (not combined into MDX).
- Schema is bilingual-ready (`locale: 'id' | 'en'`), with Indonesian (`id`) active now and English (`en`) optional on save.
- `demoUrl` and `repoUrl` must reject unsafe URL schemes (`javascript:`, `data:`, etc.), and `isConfidential = true` must clear `repoUrl` to `null`.
- Schema changes in `src/db/schema.ts` require a generated SQL migration in `drizzle/` verified with `bun run db:migrate`.
- `bun test`, `bun run typecheck`, `bun run check`, and `bun run build` must all pass after implementation.

## Review Focus

1. **Teknologi prefix, trailing period, and slash-separated tags in `porto_tambahan_onlinenotepad.io.txt`:** Entries #10 and #12 prefix technologies with `Teknologi:`, all entries end with `.`, and entry #5 uses `Fastify/Express`; parser must strip `Teknologi:` and trailing `.`, split `Fastify/Express` into `['Fastify', 'Express']`, and deduplicate case-insensitively.
2. **Separator lines and trailing blank lines in source text:** The `=========================================` footer and blank lines must never create a 13th phantom record or corrupt entry #12's tech list.
3. **Unsafe URL schemes and confidential repo clearing:** Submitting `javascript:alert(1)` in `demoUrl` or `repoUrl` must fail validation, and saving with `isConfidential: true` must persist `repoUrl: null`.
4. **Duplicate slug conflict per locale:** Saving a freelance project whose derived or explicit `slug` collides with another project in the same locale must throw a structured `CONFLICT` error rather than an unhandled SQLite constraint failure.
5. **ID-only save vs empty translations:** Saving with only `id` filled (and `en` empty) must succeed, while saving with both `id.title` and `en.title` empty must fail cleanly with a validation error.

---

### Task 1: Database Schema & Drizzle Migration

**Files:**
- Modify: `src/db/schema.ts:138-146` (append new tables near `projects` / `projectTranslations`)
- Create: `drizzle/0002_*.sql` and snapshot updates (generated via `bun run db:generate`)
- Test: `tests/integration.test.ts`

**Interfaces:**
- Consumes: `sqliteTable`, `integer`, `text`, `uniqueIndex`, `index` from `drizzle-orm/sqlite-core`, `media` table in `src/db/schema.ts`.
- Produces:
  - `freelanceProjects` table (`id`, `category`, `featured`, `isConfidential`, `demoUrl`, `repoUrl`, `coverMediaId`, `techStackJson`, `sortOrder`, `deletedAt`, `createdAt`, `updatedAt`)
  - `freelanceProjectTranslations` table (`id`, `freelanceProjectId`, `locale`, `title`, `slug`, `summary`, `contribution`, `approach`, `impact`, `status`, `publishedAt`, `createdAt`, `updatedAt`)

- [ ] **Step 1: Write the failing integration test in `tests/integration.test.ts`**

Add a test importing `freelanceProjects` and `freelanceProjectTranslations` from `../src/db/schema` verifying table insertion, unique `(locale, slug)` enforcement, and cascade delete on `freelanceProjectId`:

```ts
test('freelanceProjects and freelanceProjectTranslations enforce unique slug per locale and cascade deletes', async () => {
  const db = getDb();
  const now = new Date();
  const [fp] = await db
    .insert(freelanceProjects)
    .values({
      category: 'saas',
      featured: false,
      isConfidential: false,
      techStackJson: JSON.stringify(['NodeJs', 'Fastify']),
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(freelanceProjectTranslations).values({
    freelanceProjectId: fp.id,
    locale: 'id',
    title: 'Test Freelance',
    slug: 'test-freelance',
    summary: '',
    contribution: 'Kontribusi test',
    approach: 'Pendekatan test',
    impact: 'Dampak test',
    status: 'published',
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  expect(() =>
    db
      .insert(freelanceProjectTranslations)
      .values({
        freelanceProjectId: fp.id,
        locale: 'id',
        title: 'Dup',
        slug: 'test-freelance',
        contribution: 'x',
        approach: 'y',
        impact: 'z',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      })
      .run(),
  ).toThrow();

  await db.delete(freelanceProjects).where(eq(freelanceProjects.id, fp.id));
  const remaining = await db
    .select()
    .from(freelanceProjectTranslations)
    .where(eq(freelanceProjectTranslations.freelanceProjectId, fp.id));
  expect(remaining).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration.test.ts`
Expected: FAIL because `freelanceProjects` and `freelanceProjectTranslations` are not exported from `src/db/schema.ts`.

- [ ] **Step 3: Define `freelanceProjects` and `freelanceProjectTranslations` in `src/db/schema.ts`**

Add both tables in `src/db/schema.ts` matching existing conventions (`mode: 'boolean'`, `mode: 'timestamp_ms'`, `onDelete: 'set null'` for `coverMediaId`, `onDelete: 'cascade'` for `freelanceProjectId`, indexes on `(featured, sortOrder)`, `(deletedAt)`, unique `(freelanceProjectId, locale)`, unique `(locale, slug)`, and `(locale, status, publishedAt)`).

- [ ] **Step 4: Generate Drizzle SQL migration**

Run: `bun run db:generate`
Expected: New migration file created under `drizzle/0002_*.sql` with `CREATE TABLE freelance_projects` and `CREATE TABLE freelance_project_translations`.

- [ ] **Step 5: Run integration test to verify it passes**

Run: `bun test tests/integration.test.ts`
Expected: PASS (all tests including new freelance schema test).

---

### Task 2: Freelance Parser, Idempotent Importer, and CLI Script

**Files:**
- Create: `src/lib/freelance-importer.ts`
- Create: `scripts/import-freelance.ts`
- Modify: `package.json:14-16` (add `"freelance:import": "bun run scripts/import-freelance.ts"`)
- Test: `tests/unit.test.ts`, `tests/integration.test.ts`

**Interfaces:**
- Consumes: `freelanceProjects`, `freelanceProjectTranslations` from `../db/schema`, `getDb` from `../db`, `slugify` from `./slug`, `normalizePortfolioTags` from `./portfolio-data`.
- Produces:
  - `ParsedFreelanceEntry`: `{ title: string; slug: string; category: string; sortOrder: number; contribution: string; approach: string; impact: string; techStack: string[] }`
  - `FreelanceImportSummary`: `{ projectsCreated: number; projectsUpdated: number; translationsSynced: number }`
  - `parseFreelanceSourceText(rawText: string): ParsedFreelanceEntry[]`
  - `loadFreelanceEntries(sourcePath?: string): ParsedFreelanceEntry[]`
  - `importFreelanceToDb(options?: { db?: DbClient; sourcePath?: string }): Promise<FreelanceImportSummary>`

- [ ] **Step 1: Write the failing unit tests in `tests/unit.test.ts`**

Add a `describe('Freelance portfolio parser', ...)` suite covering:
1. Parsing the real `porto_prompt/porto_tambahan_onlinenotepad.io.txt` file yields exactly `12` entries (`sortOrder` `1..12`), each with non-empty `title`, valid kebab-case `slug`, non-empty `contribution`, `approach`, `impact`, and `techStack.length >= 2`.
2. Entry #5 (`Platform Pembelajaran Bahasa Jepang N5–N4`) splits `Fastify/Express` cleanly into `['NodeJs', 'Fastify', 'Express', 'VueJs', 'SPA', 'Vuetify', 'PostgreSQL', 'Git']`.
3. Entries #10 (`Google Maps Location Scraper`) and #12 (`Binomo Trading Bot`) strip the `Teknologi:` prefix and trailing `.` cleanly (`['Puppeteer', 'TypeScript', 'NodeJs']` and `['Puppeteer', 'NodeJs']`).
4. Separator lines (`=========================================`) and extra blank lines do not produce a 13th item or pollute entry #12.

- [ ] **Step 2: Write the failing integration test in `tests/integration.test.ts`**

Add a test calling `importFreelanceToDb({ db })` twice in sequence:
- First run returns `{ projectsCreated: 12, projectsUpdated: 0, translationsSynced: 12 }`.
- Second run returns `{ projectsCreated: 0, projectsUpdated: 12, translationsSynced: 12 }`.
- Total rows in `freelanceProjects` is `12` and `projects` table remains untouched (`0` rows added by freelance import).

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test`
Expected: FAIL because `src/lib/freelance-importer.ts` does not exist.

- [ ] **Step 4: Implement `src/lib/freelance-importer.ts`, `scripts/import-freelance.ts`, and `package.json` script**

Implementation rules for `parseFreelanceSourceText(rawText: string)`:
- Split lines (`/\r?\n/`), ignoring empty lines and divider lines matching `/^=+$/`.
- Start a new entry on lines starting with `• `; strip `• ` for `title`, derive `slug = slugify(title)`, infer a clean `category` from keywords or default to `'freelance'` (e.g., `ai`, `saas`, `automation`, `mobile`, `ecommerce`, `web-app`).
- Parse `Kontribusi:`, `Pendekatan:`, `Dampak:` prefixes into `contribution`, `approach`, `impact`.
- Parse the remaining line in an entry as the tech list: strip optional `/^Teknologi:\s*/i`, strip trailing `.`, split on `[,/]` so `Fastify/Express` becomes `Fastify`, `Express`, then pass through `normalizePortfolioTags`.
- In `importFreelanceToDb`, match existing records by `(locale = 'id', slug)` on `freelanceProjectTranslations`, updating `freelanceProjects` (`category`, `techStackJson`, `sortOrder`, `deletedAt: null`, `updatedAt`) and `freelanceProjectTranslations` (`title`, `contribution`, `approach`, `impact`, `status: 'published'`, preserving existing `publishedAt || now`) or inserting new rows.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test`
Expected: PASS across both `tests/unit.test.ts` and `tests/integration.test.ts`.

---

### Task 3: Freelance Validation, Service Layer, and Astro Actions

**Files:**
- Create: `src/lib/freelance-service.ts`
- Modify: `src/actions/index.ts:1-20,645-647` (import and register 4 freelance actions)
- Test: `tests/unit.test.ts`, `tests/integration.test.ts`

**Interfaces:**
- Consumes: `freelanceProjects`, `freelanceProjectTranslations` from `../db/schema`, `normalizePortfolioTags` from `./portfolio-data`, `isValidSlug`, `slugify` from `./slug`.
- Produces in `src/lib/freelance-service.ts`:
  - `FreelanceServiceError` (with `code: 'BAD_REQUEST' | 'CONFLICT' | 'NOT_FOUND'`)
  - `sanitizeOptionalUrl(raw: string): string | null` (allows empty string -> `null` or `http://` / `https://` URLs; throws `FreelanceServiceError('BAD_REQUEST', ...)` on unsafe schemes like `javascript:` or invalid URLs)
  - `saveFreelanceInputSchema` (Zod schema)
  - `saveFreelanceProjectRecord(db: DbClient, input: z.infer<typeof saveFreelanceInputSchema>): Promise<{ freelanceProjectId: number }>`
  - `archiveFreelanceProjectRecord(db: DbClient, id: number): Promise<void>`
  - `toggleFreelanceFeaturedRecord(db: DbClient, id: number, featured: boolean): Promise<{ featured: boolean }>`
  - `reorderFreelanceProjectRecords(db: DbClient, orderedIds: number[]): Promise<void>`
- Produces in `src/actions/index.ts`:
  - `actions.saveFreelanceProject`
  - `actions.deleteFreelanceProject`
  - `actions.toggleFreelanceFeatured`
  - `actions.reorderFreelanceProjects`

- [ ] **Step 1: Write failing unit & integration tests for `freelance-service.ts`**

In `tests/unit.test.ts`:
- `sanitizeOptionalUrl('')` returns `null`, `sanitizeOptionalUrl('https://example.com')` returns `'https://example.com'`, and `sanitizeOptionalUrl('javascript:alert(1)')` throws `FreelanceServiceError` with `code: 'BAD_REQUEST'`.

In `tests/integration.test.ts`:
- `saveFreelanceProjectRecord` succeeds when only `id` translation is provided (`en.title === ''`), creating 1 row in `freelanceProjects` and 1 `id` row in `freelanceProjectTranslations`.
- `saveFreelanceProjectRecord` with `isConfidential: true` and `repoUrl: 'https://github.com/org/private'` clears `repoUrl` to `null`.
- `saveFreelanceProjectRecord` throws `FreelanceServiceError('BAD_REQUEST')` when both `id.title` and `en.title` are empty.
- `saveFreelanceProjectRecord` throws `FreelanceServiceError('CONFLICT')` when a second project tries to use an existing `id` slug.
- `toggleFreelanceFeaturedRecord` updates `featured`, `reorderFreelanceProjectRecords` updates `sortOrder` (`1..N`), and `archiveFreelanceProjectRecord` sets `deletedAt` and marks translations `'archived'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test`
Expected: FAIL because `src/lib/freelance-service.ts` does not exist.

- [ ] **Step 3: Implement `src/lib/freelance-service.ts` and wire Astro actions in `src/actions/index.ts`**

- Implement `src/lib/freelance-service.ts` cleanly using `FreelanceServiceError` so `src/actions/index.ts` catches `FreelanceServiceError` and rethrows `ActionError({ code: err.code, message: err.message })`.
- Add `saveFreelanceProject`, `deleteFreelanceProject`, `toggleFreelanceFeatured`, and `reorderFreelanceProjects` to `export const server` in `src/actions/index.ts`, each calling `requireAdmin(context)` first.

- [ ] **Step 4: Run tests and typecheck to verify Task 3**

Run: `bun test && bun run typecheck`
Expected: PASS with zero TypeScript errors.

---

### Task 4: Admin Sidebar Navigation, Freelance List Page, and Edit Page

**Files:**
- Modify: `src/layouts/AdminLayout.astro:4-23` (add `'freelance'` to `activeNav` union and `navLinks`)
- Modify: `src/pages/admin/index.astro:1-97` (display `Freelance Projects` count card in overview stats grid)
- Create: `src/pages/admin/freelance/index.astro`
- Create: `src/pages/admin/freelance/[id].astro`

**Interfaces:**
- Consumes: `freelanceProjects`, `freelanceProjectTranslations`, `media` from `../../../db/schema`, `actions.saveFreelanceProject`, `actions.deleteFreelanceProject`, `actions.toggleFreelanceFeatured`, `actions.reorderFreelanceProjects` from `astro:actions`, `attachDragReorder` from `../../../lib/admin/drag-reorder`, `AdminLayout`, `AdminStickyHeader`.
- Produces:
  - `/admin/freelance`: table with drag-handle `#01..`, Title + category + tech stack badges, ID status badge (and EN badge if present), Featured toggle button + NDA badge, Updated date, Edit & Archive actions.
  - `/admin/freelance/new` and `/admin/freelance/[id]`: form with shared metadata (`category`, `coverMediaId`, `sortOrder`, `techStack`, `demoUrl`, `repoUrl`, `featured`, `isConfidential`), `ID` tab (active by default) + `EN (Optional)` tab, structured inputs for `Title`, `Slug`, `Status`, `Summary (optional)`, `Kontribusi`, `Pendekatan`, `Dampak`.

- [ ] **Step 1: Update `src/layouts/AdminLayout.astro` and `src/pages/admin/index.astro`**

- In `AdminLayout.astro`: add `'freelance'` to `Props['activeNav']` and add `{ id: 'freelance', label: 'Freelance', href: '/admin/freelance' }` immediately after `projects` in `navLinks`.
- In `src/pages/admin/index.astro`: query active `freelanceProjects` (`isNull(freelanceProjects.deletedAt)`) and add a `Freelance Projects` stat card linking to `/admin/freelance` (adjust grid classes cleanly e.g. `lg:grid-cols-5`).

- [ ] **Step 2: Create `src/pages/admin/freelance/index.astro`**

Mirror `src/pages/admin/projects/index.astro` structure:
- Query active `freelanceProjects` ordered by `asc(freelanceProjects.sortOrder), desc(freelanceProjects.featured), asc(freelanceProjects.id)` and `freelanceProjectTranslations`.
- Parse `techStackJson` safely to show up to 3–4 compact tech chips under the title.
- Wire `attachDragReorder` to `actions.reorderFreelanceProjects`, `[data-toggle-featured]` to `actions.toggleFreelanceFeatured`, and `[data-delete-freelance]` to `actions.deleteFreelanceProject`.
- Empty state links to `/admin/freelance/new`.

- [ ] **Step 3: Create `src/pages/admin/freelance/[id].astro`**

Mirror `src/pages/admin/projects/[id].astro` structure without CodeMirror/MDX:
- Handle `rawId === 'new'` vs numeric `id` (redirect to `/admin/freelance` on invalid/missing ID).
- Shared metadata section: Category, Cover Image (`mediaList`), Sort Order, Tech Stack (comma-separated), Live Demo URL, Public Repository URL, Featured checkbox, Confidential/NDA checkbox.
- Tabs: `Indonesian (ID)` active by default, `English (EN - Optional)` secondary.
- Fields per locale: `Title`, `Slug` (placeholder explaining auto-generation from title if left blank), `Status` (`draft` / `published` / `archived`, defaulting to `published` for new ID entries or `draft` as appropriate), `Summary (optional)`, `Kontribusi` (`textarea`), `Pendekatan` (`textarea`), `Dampak` (`textarea`).
- Save button dispatches `actions.saveFreelanceProject`, displays inline status alert, and redirects to `/admin/freelance/${data.freelanceProjectId}` when creating a new record.

- [ ] **Step 4: Run Astro type/template check**

Run: `bun run typecheck && bun run check`
Expected: PASS with 0 errors.

---

### Task 5: Apply Migration, Import 12 Freelance Projects, and Full Verification

**Files:**
- Local SQLite database (`data/portfolio.db`, untracked runtime data — verify no unintended changes to `.generated-content/` or public pages)

- [ ] **Step 1: Run database migration and import the 12 freelance projects**

Run: `bun run db:migrate && bun run freelance:import`
Expected:
- Migration applies cleanly.
- Output prints `12 created, 0 updated, 12 translations synced` (or `updated` if already present).

- [ ] **Step 2: Verify database state and public isolation**

Run a quick Bun one-liner check verifying:
- `freelance_projects` has 12 active rows and `freelance_project_translations` has 12 `'id'` rows.
- `bun run freelance:import` a second time outputs `0 created, 12 updated, 12 translations synced`.

- [ ] **Step 3: Run full test suite, typecheck, astro check, and production build**

Run: `bun test && bun run typecheck && bun run check && bun run build`
Expected:
- All unit and integration tests pass with 0 failures/skips.
- `tsc --noEmit` exits 0.
- `astro check` exits 0.
- `bun run build` completes cleanly and `.generated-content/projects/` does not contain any freelance slugs.

---

## Self-Review

1. **Spec coverage:**
   - Dedicated admin nav item (`AdminLayout.astro`) -> Task 4
   - Isolated SQLite tables (`freelance_projects`, `freelance_project_translations`) + Drizzle migration -> Task 1
   - Structured fields (`Kontribusi`, `Pendekatan`, `Dampak`, `techStack`, metadata, `ID` active + `EN` optional) -> Tasks 1, 3, 4
   - CRUD, drag-reorder, featured toggle, soft archive -> Tasks 3, 4
   - Idempotent parser/importer for the 12 projects in `porto_tambahan_onlinenotepad.io.txt` -> Tasks 2, 5
   - Public frontend & `materialize-content.ts` untouched -> Global Constraints + Task 5 verification
2. **Step scan:** Every step specifies exact files, function signatures, assertions, and verification commands.
3. **Type consistency:** `freelanceProjects`, `freelanceProjectTranslations`, `ParsedFreelanceEntry`, `FreelanceImportSummary`, `parseFreelanceSourceText`, `importFreelanceToDb`, `saveFreelanceProjectRecord`, `archiveFreelanceProjectRecord`, `toggleFreelanceFeaturedRecord`, `reorderFreelanceProjectRecords`, `saveFreelanceProject`, `deleteFreelanceProject`, `toggleFreelanceFeatured`, `reorderFreelanceProjects` match across all tasks.
4. **Review Focus:** All 5 edge cases are explicitly covered and pinned to tests in Tasks 2 and 3.
5. **Proportion:** Concise task breakdown without pasting full page templates into the plan.
