# Frontend Freelance Portfolio Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a segmented Tab Switcher (`Karya Utama` vs `Proyek Freelance`) and a Compact Impact Ledger with `<dialog>` detail modals inside Section `04 PROJECTS` of `HomeView.astro`, backed by a SQLite query helper and localized UI strings.

**Architecture:** Query published, non-deleted freelance projects per locale directly from SQLite in `src/lib/freelance-queries.ts` (matching `getSiteSettings()`), keeping `scripts/materialize-content.ts` and `.generated-content/` untouched. Render the tab switcher and freelance panel/modals in `HomeView.astro` only when `freelanceItems.length > 0` for that locale, with vanilla client JS managing tab switching, `#freelance` hash deep-linking, independent freelance tag filtering, and `<dialog>` modals.

**Tech Stack:** Astro 7, Bun (`bun:sqlite`, `bun:test`), Drizzle ORM, Tailwind CSS v4, TypeScript.

**Spec:** [2026-11-15-freelance-frontend-tab-design.md](file:///d:/PROJECT/portofilio/docs/superpowers/specs/2026-11-15-freelance-frontend-tab-design.md)

## Global Constraints

- No new top-level navigation item in `Header.astro` and no new homepage section (`09`).
- `scripts/materialize-content.ts` and `src/content.config.ts` must NOT be modified; `.generated-content/projects/` remains exclusive to main projects.
- `freelanceItems` must only show on locales with published, non-deleted freelance items (`id` now; `/` and `/en/` omit the tab switcher until EN translations are published).
- Optional `demoUrl` / `repoUrl` links must fail closed (return `null` instead of throwing or rendering `javascript:`/`data:` URLs), and `repoUrl` must always be `null` when `isConfidential` is `true`.
- All user-authored freelance fields (`title`, `contribution`, `approach`, `impact`) must render via Astro template escaping (never `set:html`).
- Maintain `DESIGN.md` `--bg-specimen` / `--text-specimen` / `--border-specimen` contrast in both dark and light modes, `min-h-[44px]` touch targets below `sm:`, and `:focus-visible` outlines.
- `bun test`, `bun run typecheck`, `bun run check`, and `bun run build` must all pass.

## Review Focus

1. **Draft, archived, or soft-deleted freelance leakage:** Only rows with `freelanceProjects.deletedAt IS NULL` and `freelanceProjectTranslations.status = 'published'` for the exact requested `locale` may appear in `getPublishedFreelanceProjectsByLocale`.
2. **Confidential / unsafe URL fail-closed rendering:** If a DB row has `isConfidential = true` or a malformed/non-HTTP URL in `demoUrl`/`repoUrl`, the query helper must return `null` without crashing `astro build`.
3. **Zero freelance leakage on English pages (`/` & `/en/`):** When `locale = 'en'` has 0 published rows, `HomeView.astro` must not render `data-portfolio-tab`, `[data-portfolio-panel="freelance"]`, or any freelance `<dialog>` elements.
4. **Independent filter state between Main and Freelance tabs:** Clicking a tag pill in the Freelance panel must filter only `[data-freelance-card]` items and update `#freelance-empty-filter` without hiding or altering `[data-project-card]` items in the Main panel.
5. **Deep link `#freelance` & modal accessibility:** Visiting `/id/#freelance` must activate the Freelance tab on load, and clicking `[data-open-freelance]` must open the matching `<dialog>` and close cleanly on `×` button click or backdrop click.

---

### Task 1: Freelance Query Helper (`src/lib/freelance-queries.ts`)

**Files:**
- Create: `src/lib/freelance-queries.ts`
- Test: `tests/integration.test.ts`

**Interfaces:**
- Consumes: `freelanceProjects`, `freelanceProjectTranslations`, `Locale` from `../db/schema`, `getDb` from `../db`, `parseTechStackJson`, `sanitizeOptionalUrl` from `./freelance-service`.
- Produces:
  - `PublishedFreelanceProject` interface
  - `getPublishedFreelanceProjectsByLocale(locale: Locale, dbOverride?: DbClient): Promise<PublishedFreelanceProject[]>`

- [ ] **Step 1: Write the failing integration tests in `tests/integration.test.ts`**

Add tests importing `getPublishedFreelanceProjectsByLocale` from `../src/lib/freelance-queries`:
1. Returns only active (`deletedAt IS NULL`) and `status = 'published'` rows for `'id'`, ordered by `sortOrder ASC, featured DESC, id ASC`.
2. Excludes `'draft'`, `'archived'`, and soft-deleted rows.
3. Masks `repoUrl` to `null` when `isConfidential === true`, and fails closed (`null`) on malformed/unsafe URLs without throwing.
4. Returns `[]` for `'en'` when only `'id'` rows exist, and returns `'en'` rows once an `'en'` translation is published.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/integration.test.ts`
Expected: FAIL because `src/lib/freelance-queries.ts` does not exist.

- [ ] **Step 3: Implement `src/lib/freelance-queries.ts`**

Join `freelanceProjects` and `freelanceProjectTranslations` with `and(isNull(freelanceProjects.deletedAt), eq(freelanceProjectTranslations.locale, locale), eq(freelanceProjectTranslations.status, 'published'))`, order by `asc(freelanceProjects.sortOrder), desc(freelanceProjects.featured), asc(freelanceProjects.id)`, map `techStackJson` via `parseTechStackJson`, sanitize URLs safely (catching `FreelanceServiceError` -> `null`), and wrap the DB call in `try/catch` returning `[]` on unavailable DB.

- [ ] **Step 4: Run integration tests to verify they pass**

Run: `bun test tests/integration.test.ts`
Expected: PASS (all existing + new `getPublishedFreelanceProjectsByLocale` tests pass).

---

### Task 2: Localization Strings (`src/lib/i18n.ts`)

**Files:**
- Modify: `src/lib/i18n.ts:75-85,175-185`
- Test: `tests/unit.test.ts`

**Interfaces:**
- Produces: `UI_TRANSLATIONS.id.freelance` and `UI_TRANSLATIONS.en.freelance` containing `mainTabLabel`, `freelanceTabLabel`, `contributionLabel`, `approachLabel`, `impactLabel`, `detailButton`, `noFilterMatch`, `closeModalLabel`, `tabGroupLabel`, `filterGroupLabel`.

- [ ] **Step 1: Write failing unit test in `tests/unit.test.ts`**

Verify `getTranslations('id').freelance` and `getTranslations('en').freelance` expose non-empty strings for all 10 keys.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit.test.ts`
Expected: FAIL because `t.freelance` is undefined.

- [ ] **Step 3: Add `freelance` translation blocks to `UI_TRANSLATIONS.id` and `UI_TRANSLATIONS.en` in `src/lib/i18n.ts`**

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `bun test tests/unit.test.ts`
Expected: PASS.

---

### Task 3: Section `04` Tab Switcher, Compact Impact Ledger, Modals & Admin Copy

**Files:**
- Modify: `src/components/views/HomeView.astro:1-110,282-486,1260-1360,1420-1475`
- Modify: `src/pages/admin/freelance/index.astro:200-235,295-315`
- Modify: `src/pages/admin/freelance/[id].astro:270-290`

**Interfaces:**
- Consumes: `getPublishedFreelanceProjectsByLocale` from `../../lib/freelance-queries`, `t.freelance` from `../../lib/i18n`.
- Produces:
  - In `HomeView.astro`: segmented tablist `[data-portfolio-tab="main" | "freelance"]` rendered only when `hasFreelance` (`freelanceItems.length > 0`); `[data-portfolio-panel="main"]` wrapping main filters + `#projects-grid` + `#projects-empty-filter`; `[data-portfolio-panel="freelance"]` with `[data-freelance-filter-tag]` pills + `#freelance-ledger` rows (`data-freelance-card`, `data-tags`, `[data-open-freelance]`) + `#freelance-empty-filter`; `<dialog data-freelance-modal={item.slug}>` modals showing `Kontribusi`, `Pendekatan`, `Dampak`, tech tags, and safe `demoUrl`/`repoUrl` links.
  - Client `<script>` in `HomeView.astro`: `activatePortfolioTab('main' | 'freelance')`, `#freelance` hash handling on initial load (plus `hashchange`), independent freelance tag filtering, and `<dialog>` open/close handlers.
  - Updated admin alerts in `/admin/freelance` and `/admin/freelance/[id]` reminding to run `Publish Static Site`.

- [ ] **Step 1: Update `HomeView.astro` frontmatter and Section `04` markup**

- Fetch `freelanceItems = await getPublishedFreelanceProjectsByLocale(locale)` and compute `hasFreelance` and top 8 `displayFreelanceTags`.
- Add segmented tab switcher in Section `04` header when `hasFreelance` is `true` (keeping `min-h-[44px] sm:min-h-[34px]`, accessible `role="tablist"` / `role="tab"` / `aria-selected`).
- Wrap existing main filter/view toolbar + `#projects-grid` + `#projects-empty-filter` in `<div data-portfolio-panel="main">`.
- Add `<div data-portfolio-panel="freelance" class="hidden">` containing freelance tag filter pills, `#freelance-ledger` compact rows (number `#01..`, title, category pill, `featured` / `NDA` badges, 1-line `impact` preview, compact tech chips, `Detail →` button), and `#freelance-empty-filter`.
- Render `<dialog data-freelance-modal={item.slug}>` elements when `hasFreelance` is `true`, displaying `Kontribusi`, `Pendekatan`, `Dampak`, and safe optional `demoUrl` / `repoUrl` links.

- [ ] **Step 2: Add client-side tab, hash, filter, and modal logic + specimen styles in `HomeView.astro`**

- Style `[data-portfolio-tab]` (`portfolio-tab-btn`) cleanly for both light and dark modes matching `.project-view-btn` / `.project-filter-pill` tokens in `--bg-specimen`.
- Wire `activatePortfolioTab`, `#freelance` hash detection (only when `[data-portfolio-tab="freelance"]` exists), independent `[data-freelance-filter-tag]` filtering, and `[data-open-freelance]` / `[data-close-freelance-modal]` modal interactions.

- [ ] **Step 3: Update admin alert copy in `src/pages/admin/freelance/index.astro` and `src/pages/admin/freelance/[id].astro`**

Update success alert strings for Featured toggle, drag-reorder, and Save to include *"Jalankan Publish Static Site untuk memperbarui situs publik."*

- [ ] **Step 4: Run typecheck and astro check**

Run: `bun run typecheck; if ($LASTEXITCODE -eq 0) { bun run check }`
Expected: Exit code 0, 0 errors, 0 warnings.

---

### Task 4: Full Verification & Built HTML Inspection

**Files:**
- Inspect generated `dist/client/id/index.html`, `dist/client/index.html`, and `.generated-content/projects/`

- [ ] **Step 1: Run full test suite, typecheck, astro check, and production build**

Run: `bun test; if ($LASTEXITCODE -eq 0) { bun run typecheck }; if ($LASTEXITCODE -eq 0) { bun run check }; if ($LASTEXITCODE -eq 0) { bun run build }`
Expected:
- `bun test` passes all unit and integration tests with 0 failures.
- `tsc --noEmit` and `astro check` exit 0.
- `bun run build` completes cleanly with Pagefind indexing.

- [ ] **Step 2: Verify built static HTML isolation and content**

Run a quick Bun check verifying:
- `dist/client/id/index.html` contains `data-portfolio-tab="freelance"`, `SaaS WhatsApp Bot untuk UMKM`, and `Binomo Trading Bot`.
- `dist/client/index.html` (EN) does NOT contain `data-portfolio-tab="freelance"`.
- `.generated-content/projects/` contains only the 14 main projects (28 MDX files).

---

## Self-Review

1. **Spec coverage:**
   - `src/lib/freelance-queries.ts` (`getPublishedFreelanceProjectsByLocale`) -> Task 1
   - `src/lib/i18n.ts` (`UI_TRANSLATIONS.*.freelance`) -> Task 2
   - `HomeView.astro` Section `04` tab switcher, compact impact ledger, `<dialog>` modals, client script, specimen theme styling -> Task 3
   - Admin publish reminder copy -> Task 3
   - Tests + build + HTML output verification -> Tasks 1, 2, 4
2. **Step scan:** Every step specifies exact files, interfaces, tests, and verification commands.
3. **Type consistency:** `PublishedFreelanceProject`, `getPublishedFreelanceProjectsByLocale`, `t.freelance.*`, `data-portfolio-tab`, `data-portfolio-panel`, `data-freelance-filter-tag`, `data-freelance-card`, `data-open-freelance`, `data-freelance-modal`, `data-close-freelance-modal` match across tasks.
4. **Review Focus:** All 5 edge cases are pinned to Tasks 1, 3, and 4.
5. **Proportion:** Concise task steps without pasting whole Astro files.
