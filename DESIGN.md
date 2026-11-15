# Design System — Brass & Slate Monograph

## 1. Visual Identity & Core Palette

- **Aesthetic Direction:** Brass & Slate Monograph — an obsidian-grounded architectural portfolio and technical monograph for a bilingual (`en` default at `/`, `/en/*`, `/id/*`) developer CMS.
- **Approved Seed:** `seed:953b5b9f2bd5ffe9`
- **Primary Binding Palette:**
  - `#222831` — Obsidian primary ground (`--color-obsidian`, default dark `--bg-primary`, specimen dark ink `--text-specimen`)
  - `#393E46` — Graphite secondary band / elevated ledger ground (`--color-graphite`, dark `--bg-secondary`, default `--border-subtle`)
  - `#FFD369` — Brass accent & primary action fill (`--color-accent`, dark `--accent`, `--accent-fill`, `::selection` highlight, `:focus-visible` outline)
  - `#EEEEEE` — Chalk foreground & contrasting specimen band ground (`--color-chalk`, dark `--text-primary`, dark `--bg-specimen`, light mode `--bg-primary`)

## 2. Semantic CSS Custom Properties (`src/styles/global.css`)

### Dark Theme (Default — `.dark`)

| Token | Value | Role |
| :--- | :--- | :--- |
| `--bg-primary` | `#222831` | Page ground, hero band, expertise/experience band, contact band |
| `--bg-secondary` | `#393E46` | Monograph ledger band, latest articles band, contact form surface |
| `--bg-elevated` | `#2b313b` | Tag chips and secondary elevated panels |
| `--bg-specimen` | `#EEEEEE` | High-contrast Projects specimen band |
| `--text-specimen` | `#222831` | Heading and primary copy inside specimen band |
| `--text-specimen-secondary` | `#393E46` | Muted copy inside specimen band |
| `--border-specimen` | `#c7ccd3` | Hairline rules inside specimen band |
| `--text-primary` | `#EEEEEE` | Headings, stack table items, direct channel links |
| `--text-secondary` | `#d4d8df` | Running prose copy and nav links |
| `--text-muted` | `#a2a9b4` | Sub-index numerals, metadata timestamps, placeholders |
| `--border-subtle` | `#393E46` | Section dividers and form/footer hairlines |
| `--border-ledger` | `rgba(238, 238, 238, 0.18)` | Ledger column dividers and core stack grid borders |
| `--accent` | `#FFD369` | Highlights, active nav links, sub-index numbers (`02`–`06`), focus rings |
| `--accent-fill` | `#FFD369` | Primary CTA and form submit fills |
| `--accent-ink` | `#222831` | Ink on `#FFD369` button fills |
| `--accent-soft` | `rgba(255, 211, 105, 0.14)` | Tinted accent surface |

### Light Theme (`:root`, toggled via `ThemeToggle.astro`)

| Token | Value | Role |
| :--- | :--- | :--- |
| `--bg-primary` | `#EEEEEE` | Page ground |
| `--bg-secondary` | `#e2e4e8` | Secondary band and form panel |
| `--bg-elevated` | `#f8f8f8` | Elevated card/tag surface |
| `--bg-specimen` | `#222831` | Inverted obsidian Projects specimen band |
| `--text-specimen` | `#EEEEEE` | Chalk text in light-mode specimen band |
| `--text-specimen-secondary` | `#cfd4dc` | Secondary text in light-mode specimen band |
| `--border-specimen` | `#393E46` | Hairline rule in light-mode specimen band |
| `--text-primary` | `#222831` | Primary ink |
| `--text-secondary` | `#393E46` | Secondary prose ink |
| `--text-muted` | `#525965` | Metadata and labels |
| `--border-subtle` | `#c8cdd4` | Light hairline dividers |
| `--border-ledger` | `rgba(34, 40, 49, 0.16)` | Light ledger borders |
| `--accent` | `#9a6700` | High-contrast amber-brass text/border accent on `#EEEEEE` |
| `--accent-fill` | `#FFD369` | Primary CTA fill |
| `--accent-ink` | `#222831` | Button ink on brass fill |
| `--accent-soft` | `rgba(255, 211, 105, 0.28)` | Soft brass tint |

## 3. Typography & Self-Hosted Font Budget (`src/styles/fonts.css`)

Three font families (`4` active `woff2` weights loaded across `latin` + `latin-ext` subsets; `font-display: swap`):

- **Display (`--font-display`):** `"Miranda Sans"`, weight `700` (`/fonts/miranda-sans-700-*.woff2`)
  - Hero `h1`: `clamp(1.75rem, 4.7vw, 4.0rem)`, `font-bold`, `leading-[1.08]`, `tracking-[-0.026em]`
  - Major section `h2`: `text-2xl` / `sm:text-[1.9rem]`, `font-bold uppercase tracking-[-0.02em]`
  - Ledger sub-headings `h2`: `text-lg xl:text-[1.32rem]`, `font-bold uppercase tracking-[-0.02em]`
- **Body / UI (`--font-sans`):** `"Public Sans"`, weights `400` and `600` (`/fonts/public-sans-{400,600}-*.woff2`)
  - Body default: `line-height: 1.6`, `-webkit-font-smoothing: antialiased`
  - Technical article prose (`.prose-tech`): `1.05rem`, `line-height: 1.78`, `max-width: 72ch`
- **Monospace (`--font-mono`):** `"JetBrains Mono"`, weight `400` (`/fonts/jetbrains-mono-400-*.woff2`)
  - Tabular numbers via `.monograph-num` (`font-variant-numeric: tabular-nums`)
  - Core Stack matrix, form labels (`text-xs uppercase tracking-[0.08em]`), category tags, metadata lines, and code blocks

## 4. Layout & Surface Rhythm

- **Container width & edge alignment:** `max-w-[1376px] mx-auto px-5 sm:px-10` shared uniformly across `Header.astro`, all `HomeView.astro` bands, `BlogDetailView.astro`, and `Footer.astro`.
- **Section cadence (`HomeView.astro`):**
  1. Sticky top header (`h-[58px]`, `border-b border-[var(--border-subtle)]`, backdrop blur)
  2. Broadside Hero (`#222831`): asymmetric headline + `FOLIO 2022–2026` vertical stamp (desktop `lg:block`), bottom-right CTA pair
  3. Three-column Ledger (`#393E46`, `border-y border-[var(--border-ledger)]`): `01` Professional Background | `02` Development Philosophy | `03` Core Stack (wrapping point list with `#FFD369` dot markers)
  4. Portfolio Specimen Band (`#222831` dark mode / `#EEEEEE` light mode): `04 PROJECTS` with mono stack filters (`All` + top 8 stack tags), a `Grid` / full-width 12-column `List` view switcher (`data-project-view-btn`, `localStorage`-persisted), `1:1` WebP project cards (`bg-[var(--bg-elevated)]`), and in-page `<dialog>` case-study modals
  5. Aligned 2-column Capabilities & Track Record (`#222831`): `05 AREAS OF EXPERTISE` (`lg:col-span-5`) + `06 EXPERIENCE HIGHLIGHTS` (`lg:col-span-7`) with aligned row-2 top hairline rules
  6. Technical Writing Band (`#393E46`): `07 LATEST TECHNICAL ARTICLES` (`PostCard.astro` 3-column grid or honest empty state)
  7. Contact Band (`#222831`): `08 CONTACT` split between direct channels and `contact-form` panel (`bg-[var(--bg-secondary)]`)
  8. Rule-separated Footer (`Header`–aligned 3-column sitemap + locale switcher link)

## 5. Motion, Chrome & Accessibility

- **Hero entrance:** `.hero-reveal` runs `monograph-enter` (`380ms cubic-bezier(0.16, 1, 0.3, 1)` from `opacity: 0.92; translateY(6px)`).
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` reduces animation/transition durations to `0.01ms` and disables smooth scroll.
- **Browser chrome:** Custom `8px` scrollbar (`#393E46` thumb / `#FFD369` hover / `--bg-primary` track), brass caret (`caret-color: var(--accent)`), and brass selection (`#FFD369` fill / `#222831` ink).
- **Keyboard focus & touch targets:**
  - Global `:focus-visible { outline: 2px solid #FFD369; outline-offset: 2px; }`; controls on `#EEEEEE` specimen surface override dark-mode outline to `dark:focus-visible:outline-[#222831]`.
  - Skip-to-main-content link rendered as first focusable element in `PublicLayout.astro`.
  - Mobile controls (`LanguageSwitcher`, `ThemeToggle`, menu toggle, hero CTAs, filter pills, direct channel links, contact inputs/submit) maintain `min-h-[44px]` touch hit areas below `sm:`.

## 6. Routing & System Invariants

- **Default Locale (`DEFAULT_LOCALE = 'en'`):** Root `/` serves the English portfolio (`HomeView` with `locale="en"`, `canonicalPath="/"`). `/en/` remains accessible with canonical and `x-default` `hreflang` pointing to `/`. Indonesian routes live under `/id/*`; `/en/blog/*` and `/en/search/` remain prefixed under `/en/*`.
- **Preserved Subsystems:** `/admin/*` editorial CMS routes and `AdminLayout.astro`, SQLite/Drizzle schema, Astro Actions (`contact`), Pagefind static index, and restricted MDX (`<Callout>`, `<Figure>`).
