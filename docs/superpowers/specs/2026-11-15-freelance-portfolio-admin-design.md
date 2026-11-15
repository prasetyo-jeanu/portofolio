# Design Spec: Freelance Portfolio Admin Menu

**Date:** 2026-11-15  
**Status:** Draft (pending user approval)

## 1. Intent & Why

The portfolio owner has an additional set of 12 freelance projects (stored in `porto_prompt/porto_tambahan_onlinenotepad.io.txt`) that are distinct from the main career/enterprise case studies currently managed in `/admin/projects`.

The goal is to add a dedicated **Freelance** menu to the Admin CMS (`/admin/freelance`) so the owner can manage, reorder, feature, and edit these freelance projects separately in SQLite without affecting or leaking into the public frontend pages until the frontend presentation is designed in a later conversation.

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Add a new **Freelance** navigation item in `AdminLayout.astro` pointing to `/admin/freelance`.
- Store freelance projects in dedicated SQLite tables via Drizzle (`freelance_projects` and `freelance_project_translations`) isolated from `projects` and `project_translations`.
- Support full CRUD, drag-and-drop sort reordering, Featured toggling, and soft-archive in `/admin/freelance` and `/admin/freelance/[id]`, matching the UX and security patterns of `/admin/projects`.
- Structure each freelance project's content explicitly around the fields from the owner's source data:
  - **Title** (`Judul`)
  - **Slug** (auto-derived from title when omitted, unique per locale)
  - **Contribution** (`Kontribusi`)
  - **Approach** (`Pendekatan`)
  - **Impact** (`Dampak`)
  - **Tech Stack** (list of technology tags, stored cleanly — e.g. JSON array or normalized helper)
  - **Optional shared metadata**: category/tag label, status (`draft` | `published` | `archived`), `featured` flag, `sortOrder`, `demoUrl`, `repoUrl`, `isConfidential`, `coverMediaId`
- Provide an idempotent importer/seed mechanism (`src/lib/freelance-importer.ts` + CLI script `scripts/import-freelance.ts` + npm script) that parses `porto_prompt/porto_tambahan_onlinenotepad.io.txt` (or structured data derived from it) and populates all 12 Indonesian (`id`) freelance projects into the database.
- Keep the schema bilingual-ready (`locale: 'id' | 'en'`) while keeping Indonesian (`id`) active now and English (`en`) optional in the admin editor (`en` tab hidden/optional or secondary without requiring EN fields to save).

### Non-Goals
- **No public frontend changes:** Do NOT modify public routes (`/id/`, `/en/`, `/id/proyek/`, `/en/projects/`), `HomeView.astro`, `src/content.config.ts`, or `scripts/materialize-content.ts`. Freelance projects must NOT appear in `.generated-content/` or public static builds yet.
- **No automatic English translation:** The 12 imported projects should only populate the `id` locale for now (`sementara versi ID saja dulu`).
- **No URL redirect generation for freelance projects:** Since no public routes exist yet, `saveFreelanceProject` does not need to generate `url_redirects` entries on slug changes.

### Anti-Goals
- Do not mix freelance items into the existing `projects` table where an unguarded query could publish them onto `/id/proyek/` or `/en/projects/`.
- Do not force the owner to author raw MDX blobs for `Kontribusi`, `Pendekatan`, and `Dampak`—those three fields must remain distinct structured inputs so future frontend designs (cards, expandable rows, or detail pages) can render them cleanly without parsing markdown.

## 3. Constraints

- **Stack:** Astro 7, Bun (`bun:sqlite`), Drizzle ORM (`drizzle-orm/bun-sqlite`), Zod (`astro/zod`), Tailwind CSS v4.
- **Auth:** All admin pages under `/admin/freelance*` are protected by existing admin session middleware (`src/middleware.ts`), and all Astro actions must call `requireAdmin(context)`.
- **Database migrations:** Schema changes in `src/db/schema.ts` must have a corresponding SQL migration generated in `drizzle/` via `bun run db:generate` and verified with `bun run db:migrate`.
- **Safe URL handling:** Any optional `demoUrl` / `repoUrl` inputs must validate/sanitize against unsafe schemes (`javascript:`, etc.), and if `isConfidential` is true, `repoUrl` should be cleared/hidden consistently with `saveProject`.
- **No regressions:** Existing tests (`bun test`), typecheck (`bun run typecheck`), `bun run check`, and `bun run build` must continue to pass.

## 4. Approaches Considered

1. **Approach 1 — Dedicated `freelance_projects` & `freelance_project_translations` tables (Chosen)**
   - Add dedicated tables (`freelance_projects` + `freelance_project_translations`) in `src/db/schema.ts`, dedicated Astro actions (`saveFreelanceProject`, `deleteFreelanceProject`, `toggleFreelanceFeatured`, `reorderFreelanceProjects`), dedicated admin pages (`/admin/freelance` and `/admin/freelance/[id]`), and an idempotent importer for the 12 projects.
   - **Pros:** Zero risk of leaking into public `projects` queries or `materialize-content.ts`; columns match `contribution`, `approach`, `impact`, and `techStack` directly; `locale` column in `freelance_project_translations` makes adding `en` later effortless with zero schema migration.
   - **Cons:** Introduces two new tables, a Drizzle migration, and parallel actions/UI routes alongside `projects`.

2. **Approach 2 — Share the `projects` table with a `kind` discriminator column**
   - Add `kind: 'main' | 'freelance'` to `projects` and filter existing queries.
   - **Pros:** Reuses `projects`, `project_translations`, and `project_tags`.
   - **Cons:** High risk of accidental leakage into public pages/content generation if any query omits the filter, and forces structured `Kontribusi`/`Pendekatan`/`Dampak` fields into a single `contentMdx` column.

**Decision:** Approach 1 was selected for data isolation, clean structured fields, and zero impact on current public pages.

## 5. Architecture & Detailed Design

### 5.1 Database Schema (`src/db/schema.ts`)
1. `freelanceProjects`:
   - `id`: integer primary key autoincrement
   - `category`: text, notNull, default `'freelance'` (allows grouping like `saas`, `ai`, `ecommerce`, `mobile`, `automation`, `web-app`, etc.)
   - `featured`: integer boolean, notNull, default `false`
   - `isConfidential`: integer boolean, notNull, default `false`
   - `demoUrl`: text, nullable
   - `repoUrl`: text, nullable
   - `coverMediaId`: integer references `media.id` (`onDelete: 'set null'`)
   - `techStackJson`: text, notNull, default `'[]'` (JSON array of strings, preserving display casing such as `NodeJs`, `Fastify`, `Puppeteer`, `TypeScript`)
   - `sortOrder`: integer, notNull, default `0`
   - `deletedAt`: integer timestamp_ms, nullable
   - `createdAt`: integer timestamp_ms, notNull
   - `updatedAt`: integer timestamp_ms, notNull
   - Indexes: `(featured, sortOrder)` and `(deletedAt)`

2. `freelanceProjectTranslations`:
   - `id`: integer primary key autoincrement
   - `freelanceProjectId`: integer notNull references `freelanceProjects.id` (`onDelete: 'cascade'`)
   - `locale`: text (`'id' | 'en'`), notNull
   - `title`: text, notNull
   - `slug`: text, notNull
   - `summary`: text, notNull, default `''` (optional short summary for cards/list if needed later)
   - `contribution`: text, notNull, default `''` (`Kontribusi`)
   - `approach`: text, notNull, default `''` (`Pendekatan`)
   - `impact`: text, notNull, default `''` (`Dampak`)
   - `status`: text (`'draft' | 'published' | 'archived'`), notNull, default `'published'`
   - `publishedAt`: integer timestamp_ms, nullable
   - `createdAt`: integer timestamp_ms, notNull
   - `updatedAt`: integer timestamp_ms, notNull
   - Indexes: unique `(freelanceProjectId, locale)`, unique `(locale, slug)`, and `(locale, status, publishedAt)`

### 5.2 Server Actions (`src/actions/index.ts`)
Add four admin-authenticated actions mirroring `projects`:
- `saveFreelanceProject`:
  - Validates shared metadata (`id`, `category`, `featured`, `isConfidential`, `demoUrl`, `repoUrl`, `coverMediaId`, `sortOrder`, `techStack: string[]`) and `translations: { id, en? }`.
  - Requires at least one locale (typically `id`) to have a non-empty `title`.
  - Normalizes `techStack` deduplicating case-insensitively while preserving display order/casing (reusing `normalizePortfolioTags`).
  - Generates/validates `slug` via `slugify` + `isValidSlug`, ensuring uniqueness within `freelance_project_translations` per locale.
  - Validates `contribution`, `approach`, `impact` strings (trimmed, bounded lengths).
  - Inserts or updates `freelance_projects` and upserts active locale rows in `freelance_project_translations`.
- `deleteFreelanceProject`: soft-deletes (`deletedAt = now`) and sets translation statuses to `'archived'`.
- `toggleFreelanceFeatured`: toggles `featured` boolean and returns updated value.
- `reorderFreelanceProjects`: updates `sortOrder` transactionally (`1..N`) from `orderedIds`.

### 5.3 Admin UI
1. **Sidebar (`src/layouts/AdminLayout.astro`)**:
   - Extend `activeNav` union with `'freelance'`.
   - Add `{ id: 'freelance', label: 'Freelance', href: '/admin/freelance' }` right after `Projects`.
2. **Dashboard Overview (`src/pages/admin/index.astro`)**:
   - Optionally display active freelance project count alongside `Total Projects` (or keep existing stats clean; left to builder as long as existing dashboard layout remains clean and unbroken).
3. **List Page (`src/pages/admin/freelance/index.astro`)**:
   - Uses `AdminLayout` (`activeNav="freelance"`) and `AdminStickyHeader` with `+ New Freelance Project` CTA (`/admin/freelance/new`).
   - Displays active (`deletedAt IS NULL`) freelance projects ordered by `sortOrder`, `featured`, `id`.
   - Table columns: Order (`#01` with drag handle using shared `attachDragReorder`), Project Title & Tech Stack preview chips/category, ID Status badge, Flags (`★ Featured` toggle button, `NDA` badge if confidential), Updated date, Actions (`Edit`, `Archive`).
4. **Create / Edit Page (`src/pages/admin/freelance/[id].astro`)**:
   - Supports `/admin/freelance/new` and `/admin/freelance/<id>`.
   - Shared metadata card: Category, Cover Image select (from `media`), Sort Order, Tech Stack (comma-separated input), Live Demo URL, Public Repo URL, Featured checkbox, Confidential/NDA checkbox.
   - Locale section: Indonesian (`ID`) shown by default with Title, Slug (auto-filled or editable), Status (`draft` / `published` / `archived`), Summary (optional), **Kontribusi** (textarea), **Pendekatan** (textarea), and **Dampak** (textarea). Include a secondary `English (EN - Optional)` tab/pane so future EN translations work without UI rework, while keeping `ID` as the primary active tab.

### 5.4 Data Parsing & Import (`porto_prompt/porto_tambahan_onlinenotepad.io.txt`)
- Create a pure parser/importer module (`src/lib/freelance-importer.ts`) and CLI entrypoint (`scripts/import-freelance.ts`, plus `"freelance:import": "bun run scripts/import-freelance.ts"` in `package.json`).
- Parsing rules for `porto_tambahan_onlinenotepad.io.txt`:
  - Each entry starts with `• <Title>`.
  - Extracts `Kontribusi:`, `Pendekatan:`, `Dampak:`.
  - Extracts the technology line: strips optional `Teknologi:` prefix and trailing `.`, splits on `,`, trims each tag, and normalizes `Fastify/Express` or keeps clean tag tokens.
  - Assigns deterministic `slug` (via `slugify(title)`) and sequential `sortOrder` (`1..12`), `status: 'published'`, `featured: false` (or top items left for user to toggle in admin).
  - Idempotent upsert keyed by `(locale = 'id', slug)`: re-running updates fields cleanly without duplicating rows.
- Also run the migration and import against the local SQLite database so the 12 projects immediately appear in `/admin/freelance`.

### 5.5 Verification Plan
- Unit tests (`tests/unit.test.ts` or new test file) for parsing all 12 entries from `porto_prompt/porto_tambahan_onlinenotepad.io.txt` (verifying count = 12, non-empty `title`, `contribution`, `approach`, `impact`, and `techStack` for every project, including handling the `Teknologi:` prefix on entries 10 & 12).
- Integration tests (`tests/integration.test.ts`) verifying Drizzle migration applies cleanly, `importFreelanceToDb` is idempotent across two runs, and CRUD/reorder/featured actions/DB queries work as expected without touching `projects` or `materialize-content.ts`.
- Run `bun test`, `bun run typecheck`, `bun run check`, and `bun run build`.

## 6. Left to the Builder
- Exact category slugs assigned during initial import (e.g. `saas`, `ai`, `automation`, `mobile`, `web-app`, `ecommerce`, or `'freelance'`).
- How `Fastify/Express` in project #5's tech line is split (`['Fastify', 'Express']` vs `'Fastify/Express'`).
- Whether `AdminLayout` / `src/pages/admin/index.astro` includes a Freelance stat card on the main overview page.
- Exact Drizzle migration filename generated by `bun run db:generate`.
