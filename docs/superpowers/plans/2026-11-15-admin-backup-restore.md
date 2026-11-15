# Admin Data Backup & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a web-based "Backup & Restore" interface in the Admin CMS (`/admin/settings`) allowing the user to upload local data (`data-transfer.tar.gz` or `.db`) to production with 1 click, as well as download current backups.

**Architecture:**
- API endpoint `POST /api/admin/restore`: receives multipart file (`.tar.gz` or `.db`), creates an automated safety snapshot to `/data/backups/pre-restore-<timestamp>.db`, closes DB connection, extracts archive or replaces DB file, re-opens DB connection cleanly.
- API endpoint `GET /api/admin/backup`: exports consistent WAL-safe SQLite snapshot + uploads directory as `.tar.gz` for download.
- UI panel in `src/pages/admin/settings/index.astro`: clean cards with Download Backup and Drag-and-Drop / File input + Restore button.

**Tech Stack:** Astro SSR API endpoints (`APIRoute`), Bun SQLite (`closeDb()`, `getSqlite()`), native `tar` extraction/creation.

**Spec:** Conversation context — web-based data upload/restore directly in Admin CMS.

## Global Constraints

- Requires authentication (`locals.user != null`), fails with 401 otherwise
- Safe against corruption: always creates `pre-restore-<timestamp>.db` before touching live database
- Releases SQLite locks (`closeDb()`) before overwriting `portfolio.db`
- WAL and SHM files (`portfolio.db-wal`, `portfolio.db-shm`) cleaned up on replace so stale WAL logs don't overwrite new data
- Works on both Linux container (Alpine) and Windows local dev

## Review Focus

- **Upload file type:** validates extension is `.tar.gz`, `.tgz`, or `.db`
- **Safety backup:** verifies `pre-restore-*.db` exists before extraction begins
- **Connection reset:** confirms `closeDb()` releases lock so Bun doesn't fail with "database is locked" or file-busy errors
- **Error handling:** if extraction fails, rollback to pre-restore snapshot

---

## Task 1: Create Backup & Restore Service Module

**Files:**
- Create: `src/lib/backup-service.ts`

**Interfaces:**
- Produces:
  - `createBackupArchive(): Promise<string>` — creates `.tar.gz` and returns path
  - `restoreFromArchive(filePath: string, originalName: string): Promise<{ success: boolean; message: string; backupPath?: string }>`

- [ ] **Step 1: Write `src/lib/backup-service.ts`** with archive creation, safe DB backup, WAL cleanup, and extraction logic
- [ ] **Step 2: Commit**

```bash
git add src/lib/backup-service.ts
git commit -m "feat(backup): add core backup and restore service module"
```

---

## Task 2: Create API Endpoints for Backup & Restore

**Files:**
- Create: `src/pages/api/admin/backup.ts`
- Create: `src/pages/api/admin/restore.ts`

**Interfaces:**
- `GET /api/admin/backup` → stream/download `.tar.gz`
- `POST /api/admin/restore` → receives `FormData` with `file`, calls `restoreFromArchive`, returns JSON `{ success: boolean, message: string }`

- [ ] **Step 1: Implement `src/pages/api/admin/backup.ts`**
- [ ] **Step 2: Implement `src/pages/api/admin/restore.ts`**
- [ ] **Step 3: Commit**

```bash
git add src/pages/api/admin/backup.ts src/pages/api/admin/restore.ts
git commit -m "feat(api): add admin endpoints for backup download and restore"
```

---

## Task 3: Write Unit/Integration Tests for Backup & Restore

**Files:**
- Create: `tests/backup-restore.test.ts`

- [ ] **Step 1: Write tests for archive validation, backup creation, and restore cycle**
- [ ] **Step 2: Run tests via `bun test tests/backup-restore.test.ts`**
- [ ] **Step 3: Verify all tests pass**
- [ ] **Step 4: Commit**

```bash
git add tests/backup-restore.test.ts
git commit -m "test: add test coverage for backup and restore service"
```

---

## Task 4: Add UI Card to Admin Settings

**Files:**
- Modify: `src/pages/admin/settings/index.astro`

**Interfaces:**
- Adds "Data Backup & Restore" card with:
  - "Download Database & Media" button
  - File input (accepts `.tar.gz`, `.tgz`, `.db`)
  - "Restore / Upload Data" button with confirmation alert
  - Visual loading indicator & alert banner

- [ ] **Step 1: Edit `src/pages/admin/settings/index.astro`**
- [ ] **Step 2: Test building static/SSR via `bun test`**
- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/settings/index.astro
git commit -m "feat(admin): add backup and restore UI section to settings page"
```

---

## Task 5: Push and Verify

- [ ] **Step 1: Push commits to GitHub**
- [ ] **Step 2: Provide clear step-by-step instructions to the user**
