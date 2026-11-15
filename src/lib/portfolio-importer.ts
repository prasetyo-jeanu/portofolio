import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import {
  media,
  projects,
  projectTags,
  projectTranslations,
  tags,
  type Locale,
} from '../db/schema';

type DbClient = ReturnType<typeof getDb>;
import { env } from './env';
import { validateRestrictedMdx } from './mdx/validator';
import { detectAllowedImageType } from './media';
import {
  buildProjectMdx,
  normalizePortfolioTags,
  portfolioProjectFileSchema,
  type PortfolioLocaleEntry,
  type PortfolioProjectFile,
} from './portfolio-data';
import { slugify } from './slug';

export interface LoadedPortfolioEntry {
  dirPath: string;
  imagePath: string;
  data: PortfolioProjectFile;
}

export interface PortfolioImportSummary {
  projectsCreated: number;
  projectsUpdated: number;
  mediaSynced: number;
  translationsSynced: number;
  tagsLinked: number;
}

/**
 * Loads, validates, and sorts all structured portfolio project definitions
 * from `<portfolioDir>/projects/<slug>/project.json`.
 *
 * Default dir: `src/seed/projects/`
 */
export function loadPortfolioEntries(
  portfolioDir = path.resolve(process.cwd(), 'src/seed'),
): LoadedPortfolioEntry[] {
  const projectsDir = path.join(portfolioDir, 'projects');
  if (!fs.existsSync(projectsDir)) {
    throw new Error(`Portfolio projects directory not found: ${projectsDir}`);
  }

  const dirs = fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries: LoadedPortfolioEntry[] = [];
  for (const dir of dirs) {
    const dirPath = path.join(projectsDir, dir.name);
    const jsonPath = path.join(dirPath, 'project.json');
    if (!fs.existsSync(jsonPath)) continue;

    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = portfolioProjectFileSchema.parse(JSON.parse(raw));
    const imagePath = path.resolve(dirPath, parsed.image.file);
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Missing image file for "${parsed.id}": ${imagePath}`);
    }

    for (const locale of ['en', 'id'] as const) {
      const mdx = buildProjectMdx(parsed.translations[locale].portfolio_copy);
      const validation = validateRestrictedMdx(mdx);
      if (!validation.valid) {
        throw new Error(`Invalid MDX in "${parsed.id}" (${locale}): ${validation.errors.join('; ')}`);
      }
    }

    entries.push({ dirPath, imagePath, data: parsed });
  }

  return entries.sort((a, b) => a.data.sort_order - b.data.sort_order);
}

async function upsertPortfolioMedia(
  db: DbClient,
  entry: LoadedPortfolioEntry,
  uploadDir: string,
  now: Date,
): Promise<number> {
  const bytes = new Uint8Array(fs.readFileSync(entry.imagePath));
  const detected = detectAllowedImageType(bytes);
  if (!detected) {
    throw new Error(`Unsupported image format for "${entry.data.id}": ${entry.imagePath}`);
  }

  const portfolioUploadDir = path.join(uploadDir, 'portfolio');
  fs.mkdirSync(portfolioUploadDir, { recursive: true });

  const filename = path.basename(entry.data.image.file);
  const storagePath = `portfolio/${filename}`;
  const publicUrl = `/uploads/${storagePath}`;
  fs.writeFileSync(path.join(uploadDir, storagePath), bytes);

  const existing = await db
    .select({ id: media.id })
    .from(media)
    .where(eq(media.storagePath, storagePath))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(media)
      .set({
        filename,
        publicUrl,
        mimeType: detected.mime,
        sizeBytes: bytes.byteLength,
        width: entry.data.image.width,
        height: entry.data.image.height,
        altId: entry.data.image.alt.id,
        altEn: entry.data.image.alt.en,
      })
      .where(eq(media.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db
    .insert(media)
    .values({
      filename,
      storagePath,
      publicUrl,
      mimeType: detected.mime,
      sizeBytes: bytes.byteLength,
      width: entry.data.image.width,
      height: entry.data.image.height,
      altId: entry.data.image.alt.id,
      altEn: entry.data.image.alt.en,
      createdAt: now,
    })
    .returning({ id: media.id });

  return created.id;
}

async function upsertProjectTranslationRow(
  db: DbClient,
  projectId: number,
  locale: Locale,
  translation: PortfolioLocaleEntry,
  status: 'draft' | 'published' | 'archived',
  coverPublicUrl: string,
  now: Date,
): Promise<void> {
  const contentMdx = buildProjectMdx(translation.portfolio_copy);
  const existing = await db
    .select({ id: projectTranslations.id, publishedAt: projectTranslations.publishedAt })
    .from(projectTranslations)
    .where(and(eq(projectTranslations.projectId, projectId), eq(projectTranslations.locale, locale)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(projectTranslations)
      .set({
        title: translation.title,
        slug: translation.slug,
        role: translation.role,
        summary: translation.summary,
        contentMdx,
        seoTitle: translation.seo_title || translation.title,
        seoDescription: translation.seo_description || translation.summary,
        ogImageUrl: coverPublicUrl,
        status,
        publishedAt: status === 'published' ? existing[0].publishedAt || now : null,
        updatedAt: now,
      })
      .where(eq(projectTranslations.id, existing[0].id));
    return;
  }

  await db.insert(projectTranslations).values({
    projectId,
    locale,
    title: translation.title,
    slug: translation.slug,
    role: translation.role,
    summary: translation.summary,
    contentMdx,
    seoTitle: translation.seo_title || translation.title,
    seoDescription: translation.seo_description || translation.summary,
    ogImageUrl: coverPublicUrl,
    status,
    publishedAt: status === 'published' ? now : null,
    createdAt: now,
    updatedAt: now,
  });
}

async function syncProjectTags(
  db: DbClient,
  projectId: number,
  rawTags: string[],
  now: Date,
): Promise<number> {
  const cleanTags = normalizePortfolioTags(rawTags);
  await db.delete(projectTags).where(eq(projectTags.projectId, projectId));

  let linked = 0;
  for (const name of cleanTags) {
    const tagSlug = slugify(name);
    if (!tagSlug) continue;

    let [tagRow] = await db.select().from(tags).where(eq(tags.slug, tagSlug)).limit(1);
    if (!tagRow) {
      [tagRow] = await db
        .insert(tags)
        .values({ name, slug: tagSlug, kind: 'tech', createdAt: now })
        .returning();
    }

    await db.insert(projectTags).values({ projectId, tagId: tagRow.id }).onConflictDoNothing();
    linked += 1;
  }
  return linked;
}

/**
 * Idempotently imports all portfolio projects and cover media from `src/seed/`
 * into SQLite (`media`, `projects`, `project_translations`, `tags`, `project_tags`).
 */
export async function importPortfolioToDb(options?: {
  db?: DbClient;
  portfolioDir?: string;
  uploadDir?: string;
}): Promise<PortfolioImportSummary> {
  const db = options?.db ?? getDb();
  const uploadDir = options?.uploadDir ?? env.UPLOAD_DIR;
  const entries = loadPortfolioEntries(options?.portfolioDir);
  const now = new Date();

  const summary: PortfolioImportSummary = {
    projectsCreated: 0,
    projectsUpdated: 0,
    mediaSynced: 0,
    translationsSynced: 0,
    tagsLinked: 0,
  };

  for (const entry of entries) {
    const { data } = entry;
    const mediaId = await upsertPortfolioMedia(db, entry, uploadDir, now);
    summary.mediaSynced += 1;

    const coverPublicUrl = `/uploads/portfolio/${path.basename(data.image.file)}`;
    const existingEn = await db
      .select({ projectId: projectTranslations.projectId })
      .from(projectTranslations)
      .where(and(eq(projectTranslations.locale, 'en'), eq(projectTranslations.slug, data.translations.en.slug)))
      .limit(1);

    let projectId: number;
    if (existingEn.length > 0) {
      projectId = existingEn[0].projectId;
      await db
        .update(projects)
        .set({
          category: data.category,
          featured: data.featured,
          isConfidential: data.is_confidential,
          demoUrl: data.demo_url ?? null,
          repoUrl: data.is_confidential ? null : (data.repo_url ?? null),
          coverMediaId: mediaId,
          sortOrder: data.sort_order,
          deletedAt: null,
          updatedAt: now,
        })
        .where(eq(projects.id, projectId));
      summary.projectsUpdated += 1;
    } else {
      const [created] = await db
        .insert(projects)
        .values({
          category: data.category,
          featured: data.featured,
          isConfidential: data.is_confidential,
          demoUrl: data.demo_url ?? null,
          repoUrl: data.is_confidential ? null : (data.repo_url ?? null),
          coverMediaId: mediaId,
          galleryJson: '[]',
          sortOrder: data.sort_order,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: projects.id });
      projectId = created.id;
      summary.projectsCreated += 1;
    }

    for (const locale of ['en', 'id'] as const) {
      await upsertProjectTranslationRow(
        db,
        projectId,
        locale,
        data.translations[locale],
        data.status,
        coverPublicUrl,
        now,
      );
      summary.translationsSynced += 1;
    }

    summary.tagsLinked += await syncProjectTags(db, projectId, data.tech_stack_tags, now);
  }

  return summary;
}
