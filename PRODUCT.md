# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **B2B clients, engineering leads, and recruiters** evaluating fullstack web development, systems integration, and workflow automation capabilities before initiating a project discussion or hiring inquiry.
- **Technical blog readers** (Indonesian and English) looking for software architecture notes, backend engineering guides, and implementation tutorials.
- **Site owner / developer** authoring and publishing projects, bilingual MDX blog posts, redirects, and profile settings through the private `/admin` CMS.

## Product Purpose

Provide a bilingual (`id` / `en`) developer portfolio and technical blog CMS where visitors can evaluate engineering background, inspect project case studies without leaving the page, read technical articles, search content, and submit project inquiries, while keeping `/admin` editorial workflows intact.

## Positioning

A production-backed developer showcase and technical writing platform built as a single-source-of-truth SQLite CMS with atomic static public publishing (`dist-public/`) and restricted MDX authoring (`<Callout>`, `<Figure>`).

## Operating Context

- Bilingual public routes under `/id/*` (default) and `/en/*` with localized section anchors (`#tentang` / `#about`, `#proyek` / `#projects`, `#kontak` / `#contact`), `/blog/`, `/cari/` / `/search/`, and RSS feeds.
- Home page (`HomeView.astro`) delivers the primary portfolio experience: hero introduction, background & philosophy, core stack, technical expertise, experience highlights, filterable project grid with in-page `<dialog>` case-study modals, latest blog posts, and on-page contact section with Astro Actions form submission.
- Private `/admin/*` CMS surfaces remain untouched by the public redesign.

## Capabilities and Constraints

- **Redesign scope:** Public portfolio and technical blog surfaces (`/id/*`, `/en/*`, shared public components and layouts) only; `/admin/*` routes and admin layout stay preserved.
- **Theme behavior:** Dark mode is the primary/default theme; keep the light/dark theme toggle (`ThemeToggle.astro`) functional and persisted via `localStorage`.
- **Language & data integrity:** Preserve bilingual (`id` / `en`) routing, `UI_TRANSLATIONS`, SQLite-backed `SiteProfileSettings`, Pagefind search, Shiki code highlighting, MDX `<Callout>`/`<Figure>`, project technology filters, in-page project case-study `<dialog>` modals, and Astro Actions contact submission.
- **Content truth:** Dynamic copy, stack items, expertise, experience, projects, and posts come from `siteSettings` and SQLite/MDX collections (`DEFAULT_SITE_SETTINGS` as fallback); never fabricate testimonials, client rosters, or fake metrics.

## Brand Commitments

- Binding color palette: `#222831`, `#393E46`, `#FFD369`, `#EEEEEE` (dark mode default).

## Evidence on Hand

- Existing Astro 7 + Tailwind CSS v4 + Bun + SQLite codebase in `src/` with `DEFAULT_SITE_SETTINGS` (`src/lib/settings.ts`), `UI_TRANSLATIONS` (`src/lib/i18n.ts`), and local SQLite database (`data/portfolio.db`).
- Empty or minimal initial project/post records may occur before admin publishing, so empty states must remain functional and clear.

## Product Principles

- Keep all public data, routes, SEO metadata (`hreflang`, JSON-LD, RSS, canonicals), and CMS-driven fields intact across visual changes.
- Ensure every interactive flow (tag filtering, modal case studies, search, theme toggle, language switcher, mobile navigation, contact form) stays keyboard-accessible and responsive.
- Maintain readable technical prose and code blocks alongside expressive portfolio presentation.

## Accessibility & Inclusion

- Maintain skip-to-content link, visible `:focus-visible` outlines, semantic landmarks, `aria-current`, modal focus/close semantics, and `prefers-reduced-motion` support across both dark and light themes.
