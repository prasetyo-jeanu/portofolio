# Project Multi-Image and Selectable Main Cover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow projects to have multiple images with user selection of the primary cover image in the admin CMS, and display an interactive gallery on the public project detail page.

**Architecture:** Use the existing `coverMediaId` and `galleryJson` columns on `projects` in SQLite. Replace the single-image picker in `/admin/projects/[id]` with a unified `ProjectImageGalleryPicker` component that manages multiple images, reordering, alt/captions, and radio selection of the main cover. On the public project detail page (`ProjectDetailView.astro`), render an interactive main view with thumbnail strip when multiple images are present.

**Tech Stack:** Astro 5, TypeScript, Drizzle ORM (SQLite), Tailwind CSS, Vanilla JS.

**Spec:** `docs/superpowers/specs/2026-11-21-project-multi-image-and-cover-design.md`

## Global Constraints

- **Palette & Design System:** Follow Brass & Slate Monograph tokens (`--accent`, `--border-subtle`, `--bg-elevated`, `--bg-primary`, `--text-primary`, `--text-secondary`).
- **Zero Heavy Dependencies:** No external slider/carousel libraries; use accessible, responsive vanilla JS and CSS.
- **Backward Compatibility:** Existing projects with only `coverMediaId` must continue rendering identically without breakage.
- **Static Prerendering:** All public project views must build cleanly during `bun run build` and `scripts/materialize-content.ts`.

## Review Focus

1. **Cover Synchronization:** When an image marked as cover is deleted, the picker must either clear the cover or gracefully fall back to the first remaining image.
2. **Media Library vs Direct Upload:** Both direct multi-file uploads (via `/api/media/upload`) and selections from the existing media library dialog must be supported in the same gallery list.
3. **Empty Gallery with Existing Cover:** When editing an existing project that only had a single `coverMediaId` and empty `galleryJson`, the existing cover image must be automatically surfaced in the gallery list as the active cover.
4. **URL & Alt Sanitization:** Alt text, captions, and image URLs must be properly escaped when rendered in HTML.
5. **Interactive Thumbnail Keyboard Navigation:** Thumbnails must have `role="button"`, `tabindex="0"`, and respond to both click and Enter/Space keyboard events.

---

### Task 1: Backend & Materialization Tests for Project Gallery and Cover

**Files:**
- Modify: `tests/integration.test.ts`
- Modify: `scripts/materialize-content.ts` (if needed to ensure fallback/sync)

**Interfaces:**
- Consumes: `actions.saveProject`, `db.select().from(projects)`, `materialize-content.ts`
- Produces: Verified integration test confirming projects can save and retrieve multiple gallery images with a designated cover media ID.

- [ ] **Step 1: Write integration tests for multi-image project saving and retrieval**

Add a test in `tests/integration.test.ts` verifying that:
1. Creating/updating a project with `coverMediaId` and a multi-item `gallery` array saves correctly to SQLite.
2. Querying `projects` returns the expected `coverMediaId` and valid parsed `galleryJson`.
3. Changing the designated cover updates `coverMediaId` while keeping all gallery items intact.

- [ ] **Step 2: Run test to verify behavior**

Run: `bun test tests/integration.test.ts -t "gallery"`
Expected: PASS

- [ ] **Step 3: Ensure `scripts/materialize-content.ts` correctly handles gallery with cover**

Verify `scripts/materialize-content.ts`:
If `gallery` is empty but `proj.coverMediaId` exists and resolves to a media row, ensure frontmatter gets `coverImage` populated, and if `gallery` has items, both `coverImage` and `gallery` are written to frontmatter.

- [ ] **Step 4: Run test suite**

Run: `bun test tests/integration.test.ts`
Expected: Passes for database/content tests.

- [ ] **Step 5: Commit**

```bash
git add tests/integration.test.ts scripts/materialize-content.ts
git commit -m "test: add integration tests for project multi-image and cover persistence"
```

---

### Task 2: Build `ProjectImageGalleryPicker.astro` Admin Component

**Files:**
- Create: `src/components/admin/ProjectImageGalleryPicker.astro`

**Interfaces:**
- Props:
  - `coverInputId: string` (e.g. `'proj-cover'`)
  - `galleryInputId: string` (e.g. `'proj-gallery-json'`)
  - `mediaList: Array<{ id: number; filename: string; publicUrl: string; altEn?: string | null; altId?: string | null }>`
  - `initialCoverId?: number | null`
  - `initialGallery?: Array<{ url: string; alt: string; caption?: string; mediaId?: number }>`
- Produces:
  - Hidden input `#proj-cover` containing the active cover's media ID (or empty string).
  - Hidden input `#proj-gallery-json` containing the serialized JSON string of gallery items.
  - Interactive UI for uploading images, selecting from library, marking "Cover Utama", reordering items (Move Up / Down), and removing items.

- [ ] **Step 1: Create `src/components/admin/ProjectImageGalleryPicker.astro` structure and markup**

Implement:
1. Header with label "Project Images & Gallery", count of attached images, and action buttons:
   - "Upload Gambar" (`<input type="file" multiple accept="image/*" ...>`)
   - "Pilih dari Media Library" (modal dialog with search filter and multi-select support)
2. Empty state card when 0 images are attached ("Belum ada gambar proyek. Unggah gambar atau pilih dari library.").
3. Grid/list of attached image cards:
   - Thumbnail preview (16:9 ratio).
   - "★ Cover Utama" badge/button with radio indicator:
     - Active cover highlighted with `bg-[var(--accent)] text-black font-bold`.
     - Inactive images show "Jadikan Cover" button.
   - Input fields:
     - Alt text input.
     - Caption input.
   - Action controls:
     - "↑" (Move Up) and "↓" (Move Down) buttons.
     - "Hapus" (Remove) button.
4. Hidden inputs:
   - `<input type="hidden" id={coverInputId} value="..." />`
   - `<input type="hidden" id={galleryInputId} value="..." />`
5. Media Library selection modal with search input, image grid, and "Tambahkan ke Proyek" button.

- [ ] **Step 2: Add client-side script for state management in `ProjectImageGalleryPicker.astro`**

Implement vanilla JavaScript functions:
- `renderGallery()`: Re-renders the card list from in-memory state array and synchronizes the hidden inputs (`#proj-cover` and `#proj-gallery-json`).
- `setCover(index)`: Updates the designated cover image index and sets `#proj-cover` to that image's `mediaId`.
- `moveItem(index, direction)`: Swaps position with neighbor and re-renders.
- `removeItem(index)`: Removes item, updates cover if the deleted item was cover, and re-renders.
- `handleUpload(files)`: Posts files to `/api/media/upload`, adds returned media to gallery array, sets first as cover if none existed, and re-renders.
- `handleLibrarySelect(mediaItem)`: Adds selected media from library to gallery array.

- [ ] **Step 3: Verify component syntax and types**

Run: `bunx tsc --noEmit`
Expected: 0 type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/ProjectImageGalleryPicker.astro
git commit -m "feat(admin): create ProjectImageGalleryPicker component for multi-image project management"
```

---

### Task 3: Integrate `ProjectImageGalleryPicker` into Project Admin Form

**Files:**
- Modify: `src/pages/admin/projects/[id].astro`

**Interfaces:**
- Consumes: `ProjectImageGalleryPicker.astro`, `projRow.coverMediaId`, `projRow.galleryJson`, `mediaList`
- Produces: Project editor that passes existing cover & gallery data into the picker, and reads both during `proj-save-btn` click to save via `actions.saveProject`.

- [ ] **Step 1: Update `src/pages/admin/projects/[id].astro` imports and data parsing**

1. Replace `import CoverImagePicker from '../../../components/admin/CoverImagePicker.astro';` with `import ProjectImageGalleryPicker from '../../../components/admin/ProjectImageGalleryPicker.astro';`.
2. Parse `projRow?.galleryJson`:
   ```ts
   let initialGallery: Array<{ url: string; alt: string; caption?: string; mediaId?: number }> = [];
   try {
     initialGallery = JSON.parse(projRow?.galleryJson || '[]');
   } catch {
     initialGallery = [];
   }
   ```
3. If `projRow?.coverMediaId` exists and `initialGallery` does not already contain this cover image, synthesize or look up the cover in `mediaList` to ensure it is included in `initialGallery` marked as the cover.

- [ ] **Step 2: Replace `<CoverImagePicker>` with `<ProjectImageGalleryPicker>` in the template**

In the form:
```astro
<ProjectImageGalleryPicker
  coverInputId="proj-cover"
  galleryInputId="proj-gallery-json"
  mediaList={mediaList}
  initialCoverId={projRow?.coverMediaId ?? null}
  initialGallery={initialGallery}
/>
```

- [ ] **Step 3: Update `proj-save-btn` click handler to send gallery data**

In the client `<script>`:
```ts
let galleryPayload: Array<{ url: string; alt: string; caption?: string }> = [];
try {
  galleryPayload = JSON.parse(val('proj-gallery-json') || '[]');
} catch {
  galleryPayload = [];
}

const payload = {
  // ...
  coverMediaId: val('proj-cover') ? Number(val('proj-cover')) : null,
  gallery: galleryPayload,
  // ...
};
```

- [ ] **Step 4: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/projects/[id].astro
git commit -m "feat(admin): integrate ProjectImageGalleryPicker into project edit page"
```

---

### Task 4: Interactive Project Gallery on Public Detail View

**Files:**
- Modify: `src/components/views/ProjectDetailView.astro`

**Interfaces:**
- Consumes: `entry.data.coverImage`, `entry.data.coverAlt`, `entry.data.gallery`
- Produces: Interactive main image view + thumbnail navigation on project detail pages when `entry.data.gallery.length > 1`.

- [ ] **Step 1: Update `ProjectDetailView.astro` media section**

Replace the static `<figure>` in `src/components/views/ProjectDetailView.astro` with conditional gallery rendering:
1. If `entry.data.gallery && entry.data.gallery.length > 1`:
   - Render main hero figure containing:
     - `<img id="project-main-display" src={activeCoverUrl} alt={activeAlt} ... />`
     - Optional caption element `<figcaption id="project-main-caption" ...>`
   - Render thumbnail strip beneath:
     - Container with `flex gap-3 overflow-x-auto pb-2 scrollbar-thin`
     - For each image in `gallery`:
       - Thumbnail button with `role="button"`, `tabindex="0"`, `data-gallery-thumb`, `data-url={img.url}`, `data-alt={img.alt}`, `data-caption={img.caption || ''}`.
       - Highlight active thumbnail with `border-[var(--accent)] ring-2 ring-[var(--accent)]/40`.
2. If only 1 image exists (or gallery empty but `coverImage` exists):
   - Render the standard single `<figure>` as before.

- [ ] **Step 2: Add client-side script in `ProjectDetailView.astro` for thumbnail switching**

Add accessible event listeners:
- Click or `keydown` (Enter / Space) on any thumbnail updates:
  - Main image `src` and `alt`.
  - Main caption text (or toggles visibility if empty).
  - Active thumbnail border/ring styles.
  - Smooth fade/opacity transition on the main image.

- [ ] **Step 3: Run typecheck and check static build**

Run: `bunx tsc --noEmit`
Run: `bun run build:content`
Expected: Content materializes without errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/views/ProjectDetailView.astro
git commit -m "feat(public): add interactive multi-image gallery with thumbnail switcher to ProjectDetailView"
```

---

### Task 5: End-to-End Verification & Sanity Checks

**Files:**
- None (verification phase)

**Steps:**
- [ ] **Step 1: Run unit and integration tests**

Run: `bun test tests/backup-restore.test.ts tests/unit.test.ts tests/integration.test.ts`
Expected: All core tests pass.

- [ ] **Step 2: Run TypeScript typechecking**

Run: `bunx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run full site build**

Run: `bun run build`
Expected: `build:content`, `astro build`, and `pagefind` complete with exit code 0.

- [ ] **Step 4: Final commit & review summary**

```bash
git status
```
Verify git tree is clean and ready.
