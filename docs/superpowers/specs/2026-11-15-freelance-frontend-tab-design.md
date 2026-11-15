# Design Spec: Frontend Freelance Portfolio Tab in Section 04

**Date:** 2026-11-15  
**Status:** Draft (pending user approval)

## 1. Intent & Why

The portfolio homepage (`HomeView.astro`) already contains 9 vertical bands (`00` Hero through `08` Contact) and 14 enterprise case studies in Section `04 PROJECTS`. Adding a new homepage band or appending 12 more image cards would cause scroll fatigue for the primary audience (**recruiters and hiring companies**).

The goal is to surface the 12 freelance projects inside **Section `04 PROJECTS`** via a **Tab Switcher** (`Main Projects` vs `Freelance Projects`) and a **Compact Impact Ledger** layout for freelance items. This showcases hands-on breadth (AI, SaaS, mobile, scrapers, automation) alongside enterprise scale without increasing homepage length, and shows up only for locales that have published freelance items (`id` now, `en` automatically once EN translations are added in admin).

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Add a clean query helper `getPublishedFreelanceProjectsByLocale(locale)` (in `src/lib/freelance-queries.ts` or `src/lib/content-queries.ts`) fetching active (`deletedAt IS NULL`), `status = 'published'` rows for the requested `locale` ordered by `sortOrder ASC, featured DESC, id ASC`.
- Add a **Tab Switcher** in Section `04 PROJECTS` header of `HomeView.astro` **only when** `freelanceProjects.length > 0` for the current `locale`:
  - Tab 1 (default active): Main Projects (`Proyek Utama` / `Main Projects`) with count badge.
  - Tab 2: Freelance Projects (`Proyek Freelance` / `Freelance Projects`) with count badge.
- When Tab 1 is active, keep the existing Section `04` experience unchanged (tech-stack filter pills, `Grid | List` toggle, 1:1 WebP `ProjectCard`s, and MDX `<dialog>` modals).
- When Tab 2 is active:
  - Hide the `Grid | List` toggle (since the freelance view is a compact scannable ledger) and show tech-stack filter pills scoped to the top tech tags from the freelance dataset (with `All` selected by default).
  - Render a **Compact Impact Ledger** (`#01..N` index, Title, Category pill, `★ Featured` / `Unggulan` badge if featured, 1-line **Impact** (`Dampak`) summary, compact tech stack chips, and a `Detail →` button / clickable row trigger).
  - Clicking a freelance item opens a `<dialog>` modal styled identically to the main project modals, displaying Title, Category, `Confidential / NDA` badge (if applicable), Tech Stack tags, structured sections (**Kontribusi**, **Pendekatan**, **Dampak**), and optional `Demo` / `Repo` buttons (hiding `Repo` when `isConfidential` is true).
- Support both dark mode (`#222831` / `#393E46` / `#FFD369`) and light mode (`#EEEEEE` / `#222831` / `#9a6700`) within the `bg-[var(--bg-specimen)]` band, preserving `min-h-[44px]` mobile touch targets and `:focus-visible` accessibility outlines.
- Update `/admin/freelance` and `/admin/freelance/[id]` alert copy to remind the admin to run **Publish Static Site** after editing freelance projects so static builds stay in sync.

### Non-Goals
- **No new top-level navigation item** in `Header.astro` and no new homepage section (`09`).
- **No standalone `/id/freelance` or `/en/freelance` route** in this phase.
- **No changes to `scripts/materialize-content.ts` or `src/content.config.ts`**: freelance projects are queried directly from SQLite at build/render time (matching `getSiteSettings()`), keeping `.generated-content/projects/` exclusively for the 14 main case studies.
- **No English freelance copy generation**: `/en/` and `/` simply omit the Freelance tab until `en` translations are published in the admin CMS.

### Anti-Goals
- Do not render 12 large image cards or duplicate the full height of Section `04` below the existing projects.
- Do not mix main `projects` and `freelance_projects` into the same unlabelled grid where recruiters cannot distinguish enterprise roles from freelance/automation builds.

## 3. Constraints

- **Design System (`DESIGN.md`):** Follow the Brass & Slate Monograph palette and `--bg-specimen` / `--text-specimen` / `--border-specimen` tokens so Section `04` remains crisp in both dark and light themes.
- **Static Build & Hydration:** `HomeView.astro` is statically prerendered during `bun run build` and `Publish Static Site`. All tab switching, tag filtering, and `<dialog>` opening/closing must work via vanilla client-side `<script>` with zero framework hydration runtime.
- **Security:** `demoUrl` / `repoUrl` rendered on `<dialog>` links must only allow `http://` / `https://` URLs (`sanitizeOptionalUrl`), and `repoUrl` must never render when `isConfidential` is true. All text fields (`title`, `contribution`, `approach`, `impact`) render via Astro template escaping (no `set:html`).
- **Deep-link / URL hash safety:** Existing `#project-<slug>` or `#proyek` / `#projects` anchors must keep working smoothly.

## 4. Approaches Considered

1. **Approach 1 — Direct SQLite build-time query + in-section Tab Switcher & Compact Impact Ledger in `HomeView.astro` (Chosen)**
   - Query published freelance rows per locale in `HomeView.astro` (with graceful `try/catch` fallback before migrations), render Tab 1 (`Main`) and Tab 2 (`Freelance` compact ledger + `<dialog>` modals) inside Section `04`, and swap panels + tag filter scope in client JS.
   - **Pros:** Zero extra vertical scroll on homepage, zero changes to `materialize-content.ts`, Pagefind automatically indexes freelance titles/impacts on `/id/index.html`, and `/en/` stays clean until EN translations exist.
   - **Cons:** Client script in `HomeView.astro` handles tab state alongside existing filter/view state.

2. **Approach 2 — Materialize freelance MDX/JSON files into `.generated-content/` and build a separate `/id/freelance/` page**
   - **Pros:** Separates static files cleanly.
   - **Cons:** Adds an extra route/nav jump that recruiters often miss, and alters `materialize-content.ts` + `publish.ts` counts.

**Decision:** Approach 1 best serves recruiters/companies on a single scannable portfolio without bloating the homepage.

## 5. Architecture & Detailed Design

### 5.1 Query Layer (`src/lib/freelance-queries.ts`)
- Export `PublishedFreelanceProject` interface:
  - `id: number`, `locale: Locale`, `title: string`, `slug: string`, `summary: string`, `contribution: string`, `approach: string`, `impact: string`, `category: string`, `featured: boolean`, `isConfidential: boolean`, `demoUrl: string | null`, `repoUrl: string | null`, `techStack: string[]`, `sortOrder: number`, `publishedAt: Date`.
- Export `getPublishedFreelanceProjectsByLocale(locale: Locale): Promise<PublishedFreelanceProject[]>`:
  - Joins `freelanceProjects` and `freelanceProjectTranslations` where `deletedAt IS NULL`, `locale = locale`, `status = 'published'`.
  - Orders by `asc(freelanceProjects.sortOrder), desc(freelanceProjects.featured), asc(freelanceProjects.id)`.
  - Parses `techStackJson` via `parseTechStackJson` and sanitizes `demoUrl` / `repoUrl` (returning `null` for `repoUrl` if `isConfidential`).
  - Returns `[]` inside `try/catch` if the DB is unavailable.

### 5.2 Localization Copy (`src/lib/i18n.ts`)
Add a `freelance` block to `UI_TRANSLATIONS.id` and `UI_TRANSLATIONS.en`:
- Tab labels: `mainTabLabel` (`Karya Utama` / `Main Projects`), `freelanceTabLabel` (`Proyek Freelance` / `Freelance Projects`)
- Ledger/Modal labels: `contributionLabel` (`Kontribusi` / `Contribution`), `approachLabel` (`Pendekatan` / `Approach`), `impactLabel` (`Dampak` / `Impact`), `detailButton` (`Detail` / `Details`), `noFilterMatch` (`Tidak ada proyek freelance yang cocok dengan filter teknologi ini.` / `No freelance projects match the selected technology filter.`), `closeModalLabel` (`Tutup dialog proyek freelance` / `Close freelance project dialog`), `tabGroupLabel` (`Kategori portofolio proyek` / `Portfolio project category`).

### 5.3 Section `04` UI & Behavior (`src/components/views/HomeView.astro`)
- Compute `freelanceItems = await getPublishedFreelanceProjectsByLocale(locale)` and `hasFreelance = freelanceItems.length > 0`.
- Compute `displayFreelanceTags`: top 8 most frequent tags from `freelanceItems` (lowercased for `data-freelance-filter-tag`).
- Header toolbar when `hasFreelance`:
  - Render a segmented tab control (`role="tablist"`) with:
    - `data-portfolio-tab="main"` (`aria-selected="true"`) -> `Karya Utama (14)`
    - `data-portfolio-tab="freelance"` (`aria-selected="false"`) -> `Proyek Freelance (12)`
- Panels:
  - `[data-portfolio-panel="main"]`: wraps the existing main filter toolbar (`Grid | List`, main tag pills) + `#projects-grid` + `#projects-empty-filter` (shown by default).
  - `[data-portfolio-panel="freelance"]` (hidden by default via `hidden`):
    - Freelance tech filter pills (`All` + `displayFreelanceTags`).
    - **Compact Impact Ledger** (`<div id="freelance-ledger" class="mt-6 divide-y divide-[var(--border-specimen)] border-y border-[var(--border-specimen)]">`):
      - Each item (`<article data-freelance-card data-tags={...}>`) displays:
        - Row index `#01`, `#02`, ... in `.monograph-num font-mono`
        - Title (`font-display font-bold`), Category mono pill, optional `★ Unggulan` badge if `featured`, optional `NDA` badge if `isConfidential`
        - 1-line `Dampak` preview (`text-sm text-[var(--text-specimen-secondary)]`)
        - Compact tech chips + `Detail →` button (`data-open-freelance={item.slug}`)
    - Empty filter notice `#freelance-empty-filter` (hidden unless filter matches 0 items).
- Freelance `<dialog>` modals (`data-freelance-modal={item.slug}`):
  - Sticky header showing category + close button.
  - Title, optional `NDA` / `Featured` pills, tech stack tags, and three clear labeled blocks: **Kontribusi**, **Pendekatan**, **Dampak** (plus optional `Summary` lead if present), and optional `Demo` / `Repo` footer links.
- Client-side `<script>` behavior:
  - Switching `[data-portfolio-tab]` updates `aria-selected`, toggles `hidden` on `[data-portfolio-panel="main"]` and `[data-portfolio-panel="freelance"]`.
  - Supporting `#freelance` URL hash on load (if `window.location.hash === '#freelance'` and the freelance tab exists, activate the freelance tab automatically and scroll to `#proyek` / `#projects`).
  - Independent tag filtering on `#freelance-ledger` rows without interfering with `#projects-grid` filters.
  - Opening/closing `data-freelance-modal` `<dialog>` elements (including backdrop click close).

### 5.4 Admin Reminder Copy (`src/pages/admin/freelance/index.astro` & `[id].astro`)
- Update client-side alert messages after save / reorder / featured toggle to mention running **Publish Static Site** to update the public site (consistent with `/admin/projects`).

### 5.5 Verification Plan
- Unit/Integration tests (`tests/integration.test.ts`):
  - `getPublishedFreelanceProjectsByLocale('id')` returns only active (`deletedAt IS NULL`), `status = 'published'` rows in `sortOrder ASC, featured DESC, id ASC` order, strips `repoUrl` when `isConfidential = true`, and excludes `draft`/`archived` or soft-deleted items.
  - `getPublishedFreelanceProjectsByLocale('en')` returns `[]` when only `id` rows exist, and returns `en` items once an `en` translation is published.
- Full verification: `bun test`, `bun run typecheck`, `bun run check`, `bun run build`, plus inspecting built `/id/index.html` and `/index.html` to confirm freelance tab + 12 ledger items appear on `/id/index.html` and are omitted on `/index.html`.

## 6. Left to the Builder
- Exact CSS class details for the segmented tab switcher and compact ledger row padding/breakpoints inside Section `04` (must match `--bg-specimen` / `--border-specimen` contrast in both dark and light modes).
- Whether clicking the whole ledger row or specifically the title/`Detail →` button triggers the modal (keeping accessible `<button>` semantics).
