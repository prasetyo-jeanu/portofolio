import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db';
import {
  freelanceProjects,
  freelanceProjectTranslations,
  type Locale,
} from '../db/schema';
import { parseTechStackJson, sanitizeOptionalUrl } from './freelance-service';

type DbClient = ReturnType<typeof getDb>;

export interface PublishedFreelanceProject {
  id: number;
  category: string;
  featured: boolean;
  isConfidential: boolean;
  demoUrl: string | null;
  repoUrl: string | null;
  sortOrder: number;
  techStack: string[];
  title: string;
  slug: string;
  summary: string;
  contribution: string;
  approach: string;
  impact: string;
  publishedAt: Date | null;
}

function safeOptionalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return sanitizeOptionalUrl(raw);
  } catch {
    return null;
  }
}

/**
 * Returns active, published freelance projects for a given locale,
 * ordered by sortOrder ascending, featured descending, then id ascending.
 * Masks confidential repositories and fails closed on invalid/unsafe URLs.
 */
export async function getPublishedFreelanceProjectsByLocale(
  locale: Locale,
  dbOverride?: DbClient,
): Promise<PublishedFreelanceProject[]> {
  try {
    const db = dbOverride ?? getDb();
    const rows = await db
      .select({
        id: freelanceProjects.id,
        category: freelanceProjects.category,
        featured: freelanceProjects.featured,
        isConfidential: freelanceProjects.isConfidential,
        demoUrl: freelanceProjects.demoUrl,
        repoUrl: freelanceProjects.repoUrl,
        sortOrder: freelanceProjects.sortOrder,
        techStackJson: freelanceProjects.techStackJson,
        title: freelanceProjectTranslations.title,
        slug: freelanceProjectTranslations.slug,
        summary: freelanceProjectTranslations.summary,
        contribution: freelanceProjectTranslations.contribution,
        approach: freelanceProjectTranslations.approach,
        impact: freelanceProjectTranslations.impact,
        publishedAt: freelanceProjectTranslations.publishedAt,
      })
      .from(freelanceProjects)
      .innerJoin(
        freelanceProjectTranslations,
        eq(freelanceProjects.id, freelanceProjectTranslations.freelanceProjectId),
      )
      .where(
        and(
          isNull(freelanceProjects.deletedAt),
          eq(freelanceProjectTranslations.locale, locale),
          eq(freelanceProjectTranslations.status, 'published'),
        ),
      )
      .orderBy(
        asc(freelanceProjects.sortOrder),
        desc(freelanceProjects.featured),
        asc(freelanceProjects.id),
      );

    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      featured: Boolean(row.featured),
      isConfidential: Boolean(row.isConfidential),
      demoUrl: safeOptionalUrl(row.demoUrl),
      repoUrl: row.isConfidential ? null : safeOptionalUrl(row.repoUrl),
      sortOrder: row.sortOrder,
      techStack: parseTechStackJson(row.techStackJson),
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      contribution: row.contribution,
      approach: row.approach,
      impact: row.impact,
      publishedAt: row.publishedAt ?? null,
    }));
  } catch {
    return [];
  }
}
