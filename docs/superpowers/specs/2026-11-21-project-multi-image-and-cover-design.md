# Design Spec: Multi-Image Projects with Selectable Main Cover

**Date:** 2026-11-21  
**Status:** In Review (pending user approval)

## 1. Intent & Why

Projects and case studies need to showcase multiple screenshots (e.g. desktop views, mobile views, architecture diagrams, dashboards, user workflows). Currently, the project admin form (`/admin/projects/[id]`) only allows selecting a single `coverMediaId` and hardcodes `gallery: []`. Furthermore, `ProjectDetailView.astro` only displays that single cover image.

This feature enables:
1. Adding multiple images to a project (via file upload or media library selection).
2. Allowing the user to explicitly designate any image in the collection as the **Cover Utama (Primary Cover)** that appears on `ProjectCard` in homepage and project listings.
3. Presenting the multiple images interactively on the project case study detail page (`ProjectDetailView.astro`) via a responsive hero view with thumbnail switcher, while preserving backward compatibility for projects with only a single image.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Admin Image Manager (`ProjectGalleryManager.astro` or unified picker)**:
  - Allow uploading multiple images directly or selecting existing images from the media library.
  - Display all selected project images as cards/thumbnails with:
    - Radio/badge to select **"Cover Utama"** (Cover Image).
    - Remove image button.
    - Optional caption / alt text input.
    - Reorder buttons (Move Up / Move Down or Drag).
  - Synchronize seamlessly with `actions.saveProject`:
    - Sends the chosen cover's media ID as `coverMediaId`.
    - Sends all project images as `gallery` array: `[{ url: string, alt: string, caption?: string }]`.
- **Database & Data Compatibility**:
  - Leverage existing schema columns on `projects`: `coverMediaId` (`integer`) and `galleryJson` (`text`). No breaking SQLite schema migration required.
- **Materialization & Content Collections**:
  - Verify and ensure `scripts/materialize-content.ts` maps `coverImage` and full `gallery` list into `.generated-content/projects/[locale]/[slug].mdx` frontmatter.
- **Public Project Detail (`ProjectDetailView.astro`)**:
  - If a project has multiple gallery images, render an interactive gallery:
    - Active main image display (defaults to the cover image).
    - Thumbnail strip/grid below the main image.
    - Keyboard-accessible and clickable thumbnails to switch the active view in real time (vanilla JS, zero framework bloat).
    - Optional caption display under the active image.
  - If a project only has 1 image, preserve the existing clean single `<figure>` display.
- **Public Project Cards (`ProjectCard.astro`, `HomeView.astro`)**:
  - Keep displaying the designated `coverImage` without regressions.

### Non-Goals
- Adding external heavy slider/carousel NPM dependencies (e.g. Swiper, Slick). We keep it lightweight, fast, and accessible using vanilla JS and CSS.
- Modifying SQLite schema with new tables (the existing `coverMediaId` and `galleryJson` columns are fully sufficient and already supported by `drizzle/schema.ts`).
- Altering Freelance Projects in this pass unless requested (focusing cleanly on Project Case Studies).

### Anti-Goals
- Do not break existing projects that only have a single `coverMediaId` and an empty gallery.
- Do not lose cover selection when adding or removing secondary gallery images.

---

## 3. Constraints

- **Design System (`DESIGN.md`)**:
  - Follow the Brass & Slate Monograph aesthetic (`--accent`, `--border-subtle`, `--bg-elevated`, `--bg-primary`).
  - High-contrast badges for "Cover Utama" (e.g. `bg-[var(--accent)] text-black font-semibold`).
- **Static Site Generation**:
  - The public detail page is statically generated; the interactive thumbnail switcher runs via an inline `<script>` without client hydration frameworks.
- **Mobile Responsiveness**:
  - Thumbnail strips must scroll horizontally on small mobile viewports (`overflow-x-auto` with touch scrolling) and display cleanly on desktop.

---

## 4. Approaches Considered

1. **Approach 1 — Unified Project Image & Gallery Manager (Chosen)**
   - Single dedicated component in `src/pages/admin/projects/[id].astro` where all project images live together.
   - Any image can be clicked or toggled as "Cover Utama".
   - **Pros**: Cleanest user experience. The user sees all images in one place, easily chooses which one is the cover, and reorders them.
   - **Cons**: Requires building a dedicated multi-image picker UI component.

2. **Approach 2 — Separate Cover Picker + Separate Gallery Array**
   - Keep `CoverImagePicker` as-is, and add a separate "Secondary Gallery" repeater below it.
   - **Pros**: Keeps existing `CoverImagePicker` intact.
   - **Cons**: Confusing UX. If a user wants to change which image is the cover, they have to re-upload or re-select in two different inputs.

**Decision**: Approach 1 provides an intuitive, cohesive workflow.

---

## 5. Detailed Architecture & Implementation Plan

### 5.1 Admin Multi-Image Component (`src/components/admin/ProjectImageGalleryPicker.astro`)
- Receives:
  - `mediaList`: list of media rows from `media` table.
  - `initialCoverId`: `number | null` (current `projRow.coverMediaId`).
  - `initialGallery`: array of `{ url: string, alt: string, caption?: string }` (parsed from `projRow.galleryJson`).
- Features:
  - "Add Images" button with two options:
    - Multi-file upload (`<input type="file" multiple ...>`) posting to `/api/media/upload`.
    - Modal library picker to select one or multiple images from existing media library items.
  - List of image cards with:
    - Thumbnail preview.
    - Radio button or "Set as Cover" badge:
      - Marked as `[★ Cover Utama]` on the active cover.
      - Clicking another card's "Set Cover" radio immediately marks that item as the cover.
    - Alt text input and optional Caption input.
    - Move Up / Move Down buttons for ordering.
    - Remove button (with confirmation or immediate undoable remove).
  - Hidden inputs or JS getter methods:
    - `getProjectImageData()` returning `{ coverMediaId: number | null, gallery: Array<{ url: string, alt: string, caption?: string }> }`.

### 5.2 Admin Project Page Form Integration (`src/pages/admin/projects/[id].astro`)
- Replace `<CoverImagePicker>` with `<ProjectImageGalleryPicker>`.
- In `proj-save-btn` click handler:
  - Read `coverMediaId` and `gallery` from the picker.
  - Send in payload to `actions.saveProject`:
    ```ts
    coverMediaId: galleryData.coverMediaId,
    gallery: galleryData.gallery,
    ```

### 5.3 Static Materialization (`scripts/materialize-content.ts`)
- If `gallery` is empty but `coverMediaId` exists:
  - Automatically include the cover image in `gallery` if needed, or keep `gallery` as explicit list.
- Ensure `coverImage` resolves to `cover?.publicUrl` and `gallery` is written to frontmatter.

### 5.4 Frontend Project Detail (`src/components/views/ProjectDetailView.astro`)
- In `<article>` header/media section:
  - If `entry.data.gallery && entry.data.gallery.length > 1`:
    - Render hero figure with `id="project-active-image"` displaying the cover image (or first gallery image).
    - Render a thumbnail strip (`overflow-x-auto flex gap-3 pb-2`) with `tabindex="0"`, `aria-label="Project image thumbnails"`.
    - Active thumbnail highlighted with `border-[var(--accent)] ring-2 ring-[var(--accent)]/50`.
    - Vanilla JS event listener on thumbnails: clicking or pressing Enter/Space updates the main image `src`, `alt`, and caption text smoothly.
  - If only 1 image exists:
    - Keep the existing single `<figure>` layout intact.
