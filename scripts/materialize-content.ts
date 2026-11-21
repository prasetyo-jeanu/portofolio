import fs from 'node:fs';
import path from 'node:path';
import { eq, isNull, and } from 'drizzle-orm';
import { db, closeDb } from '../src/db';
import {
  posts,
  postTranslations,
  projects,
  projectTranslations,
  tags,
  postTags,
  projectTags,
  media,
} from '../src/db/schema';
import { validateRestrictedMdx } from '../src/lib/mdx/validator';

const CONTENT_ROOT = path.resolve(process.cwd(), '.generated-content');
const BLOG_DIR = path.join(CONTENT_ROOT, 'blog');
const PROJECTS_DIR = path.join(CONTENT_ROOT, 'projects');

function resetDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function toYamlFrontmatter(data: Record<string, unknown>): string {
  return `---\n${Object.entries(data)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n`;
}

export async function materializeContentFromDb(): Promise<{
  postsCount: number;
  projectsCount: number;
}> {
  resetDir(BLOG_DIR);
  resetDir(PROJECTS_DIR);

  const allMedia = await db.select().from(media);
  const mediaById = new Map(allMedia.map((m) => [m.id, m]));

  // Materialize published blog posts
  const activePosts = await db.select().from(posts).where(isNull(posts.deletedAt));
  const allPostTranslations = await db
    .select()
    .from(postTranslations)
    .where(eq(postTranslations.status, 'published'));

  const postTagRows = await db
    .select({
      postId: postTags.postId,
      tagName: tags.name,
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id));

  const tagsByPost = new Map<number, string[]>();
  for (const row of postTagRows) {
    const arr = tagsByPost.get(row.postId) || [];
    arr.push(row.tagName);
    tagsByPost.set(row.postId, arr);
  }

  const publishedPostTransByPost = new Map<number, Map<'id' | 'en', typeof allPostTranslations[number]>>();
  for (const tr of allPostTranslations) {
    if (!publishedPostTransByPost.has(tr.postId)) {
      publishedPostTransByPost.set(tr.postId, new Map());
    }
    publishedPostTransByPost.get(tr.postId)!.set(tr.locale, tr);
  }

  let postsCount = 0;
  for (const post of activePosts) {
    const transMap = publishedPostTransByPost.get(post.id);
    if (!transMap) continue;

    const cover = post.coverMediaId ? mediaById.get(post.coverMediaId) : undefined;
    const postTagList = tagsByPost.get(post.id) || [];

    for (const [locale, tr] of transMap.entries()) {
      const validation = validateRestrictedMdx(tr.contentMdx);
      if (!validation.valid) {
        throw new Error(`Invalid MDX in post #${post.id} (${locale}): ${validation.errors.join('; ')}`);
      }

      const otherLocale = locale === 'id' ? 'en' : 'id';
      const alternateSlug = transMap.get(otherLocale)?.slug || null;

      const frontmatter = toYamlFrontmatter({
        postId: post.id,
        locale,
        title: tr.title,
        slug: tr.slug,
        summary: tr.summary,
        category: post.category,
        featured: post.featured,
        tags: postTagList,
        coverImage: cover?.publicUrl || null,
        coverAlt: (locale === 'id' ? cover?.altId : cover?.altEn) || tr.title,
        seoTitle: tr.seoTitle || null,
        seoDescription: tr.seoDescription || null,
        ogImageUrl: tr.ogImageUrl || cover?.publicUrl || null,
        readingTimeMinutes: tr.readingTimeMinutes,
        publishedAt: (tr.publishedAt || tr.createdAt).toISOString(),
        updatedAt: tr.updatedAt.toISOString(),
        alternateSlug,
      });

      const localeDir = path.join(BLOG_DIR, locale);
      fs.mkdirSync(localeDir, { recursive: true });
      fs.writeFileSync(path.join(localeDir, `${tr.slug}.mdx`), `${frontmatter}\n${tr.contentMdx.trim()}\n`, 'utf8');
      postsCount += 1;
    }
  }

  // Materialize published projects
  const activeProjects = await db.select().from(projects).where(isNull(projects.deletedAt));
  const allProjectTranslations = await db
    .select()
    .from(projectTranslations)
    .where(eq(projectTranslations.status, 'published'));

  const projectTagRows = await db
    .select({
      projectId: projectTags.projectId,
      tagName: tags.name,
    })
    .from(projectTags)
    .innerJoin(tags, eq(projectTags.tagId, tags.id));

  const tagsByProject = new Map<number, string[]>();
  for (const row of projectTagRows) {
    const arr = tagsByProject.get(row.projectId) || [];
    arr.push(row.tagName);
    tagsByProject.set(row.projectId, arr);
  }

  const publishedProjectTransByProject = new Map<number, Map<'id' | 'en', typeof allProjectTranslations[number]>>();
  for (const tr of allProjectTranslations) {
    if (!publishedProjectTransByProject.has(tr.projectId)) {
      publishedProjectTransByProject.set(tr.projectId, new Map());
    }
    publishedProjectTransByProject.get(tr.projectId)!.set(tr.locale, tr);
  }

  let projectsCount = 0;
  for (const proj of activeProjects) {
    const transMap = publishedProjectTransByProject.get(proj.id);
    if (!transMap) continue;

    const cover = proj.coverMediaId ? mediaById.get(proj.coverMediaId) : undefined;
    const projTagList = tagsByProject.get(proj.id) || [];
    let gallery: Array<{ url: string; alt: string; caption?: string }> = [];
    try {
      gallery = JSON.parse(proj.galleryJson || '[]');
    } catch {
      gallery = [];
    }

    for (const [locale, tr] of transMap.entries()) {
      const validation = validateRestrictedMdx(tr.contentMdx);
      if (!validation.valid) {
        throw new Error(`Invalid MDX in project #${proj.id} (${locale}): ${validation.errors.join('; ')}`);
      }

      const otherLocale = locale === 'id' ? 'en' : 'id';
      const alternateSlug = transMap.get(otherLocale)?.slug || null;

      const frontmatter = toYamlFrontmatter({
        projectId: proj.id,
        locale,
        title: tr.title,
        slug: tr.slug,
        role: tr.role,
        summary: tr.summary,
        category: proj.category,
        featured: proj.featured,
        isConfidential: proj.isConfidential,
        demoUrl: proj.demoUrl || null,
        repoUrl: proj.isConfidential ? null : proj.repoUrl || null,
        tags: projTagList,
        coverImage: cover?.publicUrl || (gallery.length > 0 ? gallery[0].url : null),
        coverAlt: (locale === 'id' ? cover?.altId : cover?.altEn) || tr.title,
        gallery,
        sortOrder: proj.sortOrder,
        seoTitle: tr.seoTitle || null,
        seoDescription: tr.seoDescription || null,
        ogImageUrl: tr.ogImageUrl || cover?.publicUrl || null,
        publishedAt: (tr.publishedAt || tr.createdAt).toISOString(),
        updatedAt: tr.updatedAt.toISOString(),
        alternateSlug,
      });

      const localeDir = path.join(PROJECTS_DIR, locale);
      fs.mkdirSync(localeDir, { recursive: true });
      fs.writeFileSync(path.join(localeDir, `${tr.slug}.mdx`), `${frontmatter}\n${tr.contentMdx.trim()}\n`, 'utf8');
      projectsCount += 1;
    }
  }

  return { postsCount, projectsCount };
}

if (import.meta.main) {
  materializeContentFromDb()
    .then(({ postsCount, projectsCount }) => {
      console.log(`Materialized ${postsCount} blog post translation(s) and ${projectsCount} project translation(s).`);
      closeDb();
    })
    .catch((err) => {
      console.error('Content materialization failed:', err);
      closeDb();
      process.exit(1);
    });
}
