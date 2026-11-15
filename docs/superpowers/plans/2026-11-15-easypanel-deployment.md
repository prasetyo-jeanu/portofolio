# Easypanel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the portfolio app deploy correctly on Easypanel via Dockerfile with all persistent data (SQLite DB, uploaded media, and published static site) surviving container restarts and redeployments.

**Architecture:** Mount a single Easypanel persistent volume at `/data`. Move `PUBLIC_DIST_DIR` from `/app/dist-public` (inside the image, lost on redeploy) to `/data/dist-public` (inside the volume, survives forever). The Dockerfile build step produces a bootstrap static site at `/app/dist-bootstrap/` (image-layer fallback); at first boot only, it's copied to `/data/dist-public/`. Subsequent redeploys skip the copy — the live published site stays intact.

**Tech Stack:** Bun 1.3, Astro SSR (Node adapter), SQLite via Drizzle, Docker, Easypanel

**Spec:** Conversation context — single-volume persistent deploy on Easypanel, no data loss on redeploy.

## Global Constraints

- `PUBLIC_DIST_DIR` must be `/data/dist-public` in production
- All persistent state lives under `/data` (one volume mount point in Easypanel)
- Bootstrap copy only runs when `/data/dist-public` is empty/missing
- `server/entrypoint.ts` fallback to `dist/client` is kept as-is
- No new packages; no DB schema changes; Dockerfile stays single-stage

## Review Focus

- **First boot:** `/data/dist-public` doesn't exist → bootstrap copied ✓
- **Redeploy:** `/data/dist-public` has content → bootstrap copy skipped → live site survives ✓
- **`dist-public.prev` (rollback):** `publish.ts` writes `PUBLIC_DIST_DIR + '.prev'` → will now be `/data/dist-public.prev` → still inside `/data` volume ✓
- **Idempotent startup scripts:** `migrate.ts` and `seed.ts` both idempotent — safe to re-run on every boot ✓
- **Easypanel env var must be explicit:** `env.ts` default is `./dist-public` (relative → `/app/dist-public`); Easypanel env must set `PUBLIC_DIST_DIR=/data/dist-public` explicitly

---

## Task 1: Update Dockerfile

**Files:**
- Modify: `Dockerfile`

**Interfaces:**
- Produces: image with bootstrap static at `/app/dist-bootstrap/`; CMD copies to `/data/dist-public` on first boot only

- [ ] **Step 1: Replace `Dockerfile` entirely**

```dockerfile
FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN bun install --no-save

# Copy application source
COPY . .

# Build Astro SSR server + static bundle → store bootstrap copy in image layer
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/portfolio.db
ENV UPLOAD_DIR=/data/uploads
ENV PUBLIC_DIST_DIR=/data/dist-public

RUN bun --bun astro build && \
    bunx pagefind --site dist/client && \
    cp -r dist/client/. /app/dist-bootstrap/

EXPOSE 4321

# On startup:
#   1. Ensure volume subdirs exist
#   2. Copy bootstrap static ONLY if /data/dist-public is empty/missing (first boot)
#   3. Run DB migrations (idempotent) + seed admin (idempotent)
#   4. Start server
CMD ["sh", "-c", "\
  mkdir -p /data/uploads /data/backups && \
  if [ ! -d /data/dist-public ] || [ -z \"$(ls -A /data/dist-public 2>/dev/null)\" ]; then \
    echo 'First boot: copying bootstrap static site to /data/dist-public' && \
    cp -r /app/dist-bootstrap/. /data/dist-public/; \
  else \
    echo 'Existing /data/dist-public found — skipping bootstrap copy'; \
  fi && \
  bun run scripts/migrate.ts && \
  bun run scripts/seed.ts && \
  bun run server/entrypoint.ts \
"]
```

- [ ] **Step 2: Verify mental trace**

| Scenario | `[ ! -d /data/dist-public ]` | Result |
|----------|------------------------------|--------|
| First deploy, empty volume | true | Bootstrap copied ✓ |
| Redeploy, volume has content | false → check `ls -A` → false | Skip copy, live site intact ✓ |

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "fix(docker): bootstrap static to /data/dist-public on first boot only"
```

---

## Task 2: Update `docker-compose.yml`

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Change `PUBLIC_DIST_DIR` env value**

Change:
```yaml
      PUBLIC_DIST_DIR: /app/dist-public
```
To:
```yaml
      PUBLIC_DIST_DIR: /data/dist-public
```

- [ ] **Step 2: Confirm volume covers all persistent paths**

`portfolio_data` mounted at `/data` now covers:
- `/data/portfolio.db` — SQLite
- `/data/uploads/` — media
- `/data/dist-public/` — live static site
- `/data/dist-public.prev/` — rollback snapshot
- `/data/backups/` — DB backups

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "fix(docker): set PUBLIC_DIST_DIR to /data/dist-public in compose"
```

---

## Task 3: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Annotate `PUBLIC_DIST_DIR` line**

Change:
```
PUBLIC_DIST_DIR=./dist-public
```
To:
```
# Local dev: ./dist-public | Docker/Easypanel production: /data/dist-public
PUBLIC_DIST_DIR=./dist-public
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: clarify PUBLIC_DIST_DIR values for local vs Docker in .env.example"
```

---

## Task 4: Create Easypanel deploy guide + MDX explanation

**Files:**
- Create: `docs/easypanel-deploy.md`

- [ ] **Step 1: Create `docs/easypanel-deploy.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/easypanel-deploy.md
git commit -m "docs: add Easypanel deployment guide with MDX workflow explanation"
```

---

## Task 5: Push and verify

- [ ] **Step 1: Push to GitHub**

```bash
git push
```

- [ ] **Step 2: Local Docker smoke test (optional but recommended)**

```bash
# Build
docker build -t portfolio-test .

# First boot (fresh volume)
docker run --rm \
  -e DATABASE_PATH=/data/portfolio.db \
  -e UPLOAD_DIR=/data/uploads \
  -e PUBLIC_DIST_DIR=/data/dist-public \
  -e SESSION_SECRET=test-secret-at-least-32-chars-longxx \
  -e ADMIN_EMAIL=test@test.com \
  -e ADMIN_PASSWORD=TestPass123! \
  -e ADMIN_NAME=Test \
  -v portfolio_test_vol:/data \
  -p 4321:4321 \
  portfolio-test
```

Expected first-boot log:
```
First boot: copying bootstrap static site to /data/dist-public
Portfolio server listening on http://0.0.0.0:4321
Public static dir: /data/dist-public
SQLite database: /data/portfolio.db
```

- [ ] **Step 3: Redeploy simulation**

Stop, re-run same command. Expected:
```
Existing /data/dist-public found — skipping bootstrap copy
Portfolio server listening on http://0.0.0.0:4321
```

- [ ] **Step 4: Cleanup**

```bash
docker rm -f $(docker ps -aq) 2>/dev/null; docker volume rm portfolio_test_vol
```
