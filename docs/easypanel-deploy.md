# Deploying on Easypanel

## 1. Create App

Easypanel dashboard → **New Service → App**

- **Source:** GitHub → `prasetyo-jeanu/portofolio`
- **Branch:** `master`
- **Build Method:** Dockerfile (auto-detected)

## 2. Add Persistent Volume

Service → **Volumes** tab:

| Mount Path | Description |
|------------|-------------|
| `/data` | SQLite DB, uploads, published static site, backups |

> **Important:** Never delete this volume. It holds all your content.

## 3. Environment Variables

Service → **Environment** tab:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | `4321` |
| `SITE_URL` | `https://your-domain.com` |
| `DATABASE_PATH` | `/data/portfolio.db` |
| `UPLOAD_DIR` | `/data/uploads` |
| `PUBLIC_DIST_DIR` | `/data/dist-public` |
| `SESSION_SECRET` | *(run: `openssl rand -hex 32`)* |
| `ADMIN_EMAIL` | your email |
| `ADMIN_PASSWORD` | strong password |
| `ADMIN_NAME` | your name |

## 4. Domain & Port

**Domains** tab → Internal port: `4321` → add domain + enable HTTPS.

## 5. Deploy

Click **Deploy**. First build: ~2–3 min (Bun install + Astro build inside container).

## 6. First Login & Publish

1. Go to `https://your-domain.com/admin`
2. Login with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
3. Click **Publish** → generates live static site from DB content

---

## How Data Survives Redeployment

```
/data/                     ← single Easypanel persistent volume
  portfolio.db             ← SQLite (all posts, projects, settings)
  uploads/                 ← uploaded images & media
  dist-public/             ← live published static site
  dist-public.prev/        ← rollback snapshot (after any Publish)
  backups/                 ← manual DB backups
```

On every redeploy, the container checks if `/data/dist-public` already has content:
- **Has content** → skips bootstrap copy → your live published site stays intact
- **Empty/missing** (first deploy only) → copies bootstrap placeholder from image

---

## MDX Files — Where Are They?

There are no permanent MDX files. MDX is an ephemeral build artifact.

**Flow:**
```
Admin panel (edit content)
    ↓  stored in SQLite /data/portfolio.db
Click "Publish" in admin
    ↓  materialize-content.ts generates MDX into .generated-content/ (temp)
    ↓  Astro build consumes .generated-content/ → builds static HTML
    ↓  Pagefind indexes the HTML
    ↓  New static files atomically replace /data/dist-public/
    ↓  .generated-content/ is cleaned up
Live site updated ✓
```

**SQLite is the single source of truth.** The MDX files only exist for the duration of a Publish job (~30s). The admin panel is your content editor.
