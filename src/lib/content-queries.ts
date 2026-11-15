import { getCollection, type CollectionEntry } from "astro:content";
import type { Locale } from "../db/schema";

export type BlogEntry = CollectionEntry<"blog">;
export type ProjectEntry = CollectionEntry<"projects">;

export async function getPublishedPostsByLocale(
  locale: Locale,
): Promise<BlogEntry[]> {
  try {
    const entries = await getCollection(
      "blog",
      (entry) => entry.data.locale === locale,
    );
    return entries.sort(
      (a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
    );
  } catch {
    return [];
  }
}

export async function getPublishedProjectsByLocale(
  locale: Locale,
): Promise<ProjectEntry[]> {
  try {
    const entries = await getCollection(
      "projects",
      (entry) => entry.data.locale === locale,
    );
    return entries.sort((a, b) => {
      if (a.data.sortOrder !== b.data.sortOrder)
        return a.data.sortOrder - b.data.sortOrder;
      if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
      return b.data.publishedAt.getTime() - a.data.publishedAt.getTime();
    });
  } catch {
    return [];
  }
}

function scoreRelatedEntries<
  T extends {
    data: { slug: string; tags: string[]; category: string; publishedAt: Date };
  },
>(current: T, allLocaleEntries: T[], limit: number): T[] {
  const currentTags = new Set(current.data.tags.map((t) => t.toLowerCase()));
  return allLocaleEntries
    .filter((item) => item.data.slug !== current.data.slug)
    .map((item) => {
      const overlap = item.data.tags.filter((t) =>
        currentTags.has(t.toLowerCase()),
      ).length;
      const sameCategory = item.data.category === current.data.category ? 1 : 0;
      return { item, score: overlap * 2 + sameCategory };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.item.data.publishedAt.getTime() - a.item.data.publishedAt.getTime(),
    )
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function getRelatedPosts(
  current: BlogEntry,
  allLocalePosts: BlogEntry[],
  limit = 3,
): BlogEntry[] {
  return scoreRelatedEntries(current, allLocalePosts, limit);
}

export function getRelatedProjects(
  current: ProjectEntry,
  allLocaleProjects: ProjectEntry[],
  limit = 3,
): ProjectEntry[] {
  return scoreRelatedEntries(current, allLocaleProjects, limit);
}
