# Developer Portfolio & Multilingual Technical Blog CMS

Platform portofolio dan technical blog dwibahasa (`id` / `en`) yang dibangun dengan **Astro**, **Bun**, **TypeScript**, **Tailwind CSS v4**, **SQLite + Drizzle ORM**, **MDX**, **CodeMirror 6**, **Shiki**, dan **Pagefind**.

## Arsitektur Inti

- **Single Source of Truth:** Semua artikel blog, studi kasus proyek, tag, metadata SEO, pengaturan situs, redirect URL, dan log publishing disimpan di SQLite (`data/portfolio.db`, WAL mode).
- **Static Public + SSR Admin:** Halaman publik (`/id/*`, `/en/*`, sitemap, RSS, Pagefind index) di-prerender menjadi HTML statis ke `dist-public/`, sedangkan `/admin`, `/_actions/*`, `/api/*`, dan `/uploads/*` berjalan dinamis melalui Astro SSR + Astro Actions.
- **Publishing Pipeline Aman:** Saat admin menekan **Publish Static Site**, sistem mematerialisasi konten `published` ke artefak MDX sementara, menjalankan `astro build` + `pagefind` di direktori staging, memverifikasi artefak penting, lalu menukar direktori live secara atomik (dengan snapshot `.prev` untuk rollback cepat dan tanpa mengganggu ketersediaan `/admin`).
- **Restricted MDX Trust Model:** Editor CodeMirror 6 hanya mengizinkan Markdown standar plus komponen allowlist `<Callout>` dan `<Figure>` (tanpa `import`/`export`, `<script>`, event handler, atau ekspresi JSX `{...}`).

## Menjalankan Secara Lokal

1. Salin konfigurasi lingkungan:
   ```bash
   cp .env.example .env
   ```
2. Pasang dependensi dan migrasi basis data:
   ```bash
   bun install --no-save
   bun run db:migrate
   bun run db:seed
   ```
3. Jalankan mode development:
   ```bash
   bun run dev
   ```
4. Buka:
   - Situs publik: `http://localhost:4321/id/`
   - Admin CMS: `http://localhost:4321/admin/login` (gunakan `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari `.env`)

## Perintah Penting

- `bun run build` — Materialisasi konten SQLite, build Astro, dan indeksasi Pagefind.
- `bun run start` — Jalankan server produksi (`server/entrypoint.ts`).
- `bun test` — Jalankan unit & integration tests.
- `bun run typecheck` — Pemeriksaan TypeScript (`tsc --noEmit`).
- `bun run check` — Pemeriksaan Astro (`astro check`).
- `bun run scripts/backup.ts` — Membuat snapshot backup SQLite yang aman untuk mode WAL (`VACUUM INTO`).

## Deployment (Docker & Easypanel)

- Mount persistent volume pada `/data` di Easypanel agar `/data/portfolio.db` dan `/data/uploads/` bertahan antar-deploy.
- Atur environment variables produksi (`SITE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- Healthcheck endpoint tersedia di `GET /api/health`.
