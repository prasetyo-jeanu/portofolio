import { z } from 'astro/zod';
import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '../db';
import { freelanceProjects, freelanceProjectTranslations } from '../db/schema';
import { normalizePortfolioTags } from './portfolio-data';
import { isValidSlug, slugify } from './slug';

type DbClient = ReturnType<typeof getDb>;

export type FreelanceErrorCode = 'BAD_REQUEST' | 'CONFLICT' | 'NOT_FOUND';

export class FreelanceServiceError extends Error {
  code: FreelanceErrorCode;

  constructor(code: FreelanceErrorCode, message: string) {
    super(message);
    this.name = 'FreelanceServiceError';
    this.code = code;
  }
}

export const freelanceTranslationInputSchema = z.object({
  title: z.string().trim().max(200).optional().default(''),
  slug: z.string().trim().max(140).optional().default(''),
  summary: z.string().trim().max(500).optional().default(''),
  contribution: z.string().trim().max(5000).optional().default(''),
  approach: z.string().trim().max(5000).optional().default(''),
  impact: z.string().trim().max(5000).optional().default(''),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
});

export const saveFreelanceInputSchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  category: z.string().trim().min(1).max(60).default('freelance'),
  featured: z.boolean().default(false),
  isConfidential: z.boolean().default(false),
  demoUrl: z.string().trim().max(300).optional().default(''),
  repoUrl: z.string().trim().max(300).optional().default(''),
  coverMediaId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().default(0),
  techStack: z.array(z.string()).default([]),
  translations: z.object({
    id: freelanceTranslationInputSchema,
    en: freelanceTranslationInputSchema.optional(),
  }),
});

export type SaveFreelanceInput = z.infer<typeof saveFreelanceInputSchema>;

/**
 * Validates optional URL fields, allowing only empty strings or `http://` / `https://` URLs.
 */
export function sanitizeOptionalUrl(raw: string): string | null {
  const clean = raw.trim();
  if (!clean) return null;
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new FreelanceServiceError('BAD_REQUEST', `Invalid URL: "${clean}". Must start with http:// or https://.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new FreelanceServiceError('BAD_REQUEST', `Unsafe URL scheme in "${clean}". Only http:// and https:// are allowed.`);
  }
  return clean;
}

/**
 * Safely parses stored `techStackJson` into a normalized string array.
 */
export function parseTechStackJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? normalizePortfolioTags(parsed.filter((v): v is string => typeof v === 'string'))
      : [];
  } catch {
    return [];
  }
}

export async function saveFreelanceProjectRecord(
  db: DbClient,
  input: SaveFreelanceInput,
): Promise<{ freelanceProjectId: number }> {
  const now = new Date();
  const demoUrl = sanitizeOptionalUrl(input.demoUrl || '');
  const sanitizedRepo = sanitizeOptionalUrl(input.repoUrl || '');
  const repoUrl = input.isConfidential ? null : sanitizedRepo;
  const normalizedTech = normalizePortfolioTags(input.techStack);

  const localeEntries = {
    id: input.translations.id,
    en: input.translations.en ?? {
      title: '',
      slug: '',
      summary: '',
      contribution: '',
      approach: '',
      impact: '',
      status: 'draft' as const,
    },
  };

  const activeLocales = (['id', 'en'] as const).filter(
    (loc) => localeEntries[loc].title.trim().length > 0,
  );
  if (activeLocales.length === 0) {
    throw new FreelanceServiceError(
      'BAD_REQUEST',
      'Minimal satu bahasa (ID atau EN) harus memiliki judul proyek.',
    );
  }

  const prepared = new Map<
    'id' | 'en',
    {
      title: string;
      slug: string;
      summary: string;
      contribution: string;
      approach: string;
      impact: string;
      status: 'draft' | 'published' | 'archived';
    }
  >();

  for (const loc of activeLocales) {
    const t = localeEntries[loc];
    const finalSlug = slugify(t.slug || t.title);
    if (!isValidSlug(finalSlug)) {
      throw new FreelanceServiceError(
        'BAD_REQUEST',
        `Slug tidak valid untuk ${loc.toUpperCase()}: "${finalSlug}".`,
      );
    }

    const existingSlug = await db
      .select({ id: freelanceProjectTranslations.id })
      .from(freelanceProjectTranslations)
      .where(
        input.id
          ? and(
              eq(freelanceProjectTranslations.locale, loc),
              eq(freelanceProjectTranslations.slug, finalSlug),
              ne(freelanceProjectTranslations.freelanceProjectId, input.id),
            )
          : and(
              eq(freelanceProjectTranslations.locale, loc),
              eq(freelanceProjectTranslations.slug, finalSlug),
            ),
      )
      .limit(1);

    if (existingSlug.length > 0) {
      throw new FreelanceServiceError(
        'CONFLICT',
        `Slug "${finalSlug}" sudah dipakai oleh proyek freelance ${loc.toUpperCase()} lain.`,
      );
    }

    prepared.set(loc, {
      title: t.title.trim(),
      slug: finalSlug,
      summary: t.summary.trim(),
      contribution: t.contribution.trim(),
      approach: t.approach.trim(),
      impact: t.impact.trim(),
      status: t.status,
    });
  }

  let freelanceProjectId = input.id || null;
  const techStackJson = JSON.stringify(normalizedTech);

  return await db.transaction(async (tx) => {
    if (!freelanceProjectId) {
      const [created] = await tx
        .insert(freelanceProjects)
        .values({
          category: input.category.trim() || 'freelance',
          featured: input.featured,
          isConfidential: input.isConfidential,
          demoUrl,
          repoUrl,
          coverMediaId: input.coverMediaId ?? null,
          techStackJson,
          sortOrder: input.sortOrder,
          createdAt: now,
          updatedAt: now,
        });
      freelanceProjectId = created.insertId;
    } else {
      const existing = await tx
        .select({ id: freelanceProjects.id })
        .from(freelanceProjects)
        .where(eq(freelanceProjects.id, freelanceProjectId))
        .limit(1);
      if (existing.length === 0) {
        throw new FreelanceServiceError('NOT_FOUND', 'Freelance project not found.');
      }
      await tx.update(freelanceProjects)
        .set({
          category: input.category.trim() || 'freelance',
          featured: input.featured,
          isConfidential: input.isConfidential,
          demoUrl,
          repoUrl,
          coverMediaId: input.coverMediaId ?? null,
          techStackJson,
          sortOrder: input.sortOrder,
          updatedAt: now,
        })
        .where(eq(freelanceProjects.id, freelanceProjectId));
    }

    for (const [loc, data] of prepared.entries()) {
      const existing = await tx
        .select()
        .from(freelanceProjectTranslations)
        .where(
          and(
            eq(freelanceProjectTranslations.freelanceProjectId, freelanceProjectId),
            eq(freelanceProjectTranslations.locale, loc),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        const prev = existing[0];
        await tx.update(freelanceProjectTranslations)
          .set({
            title: data.title,
            slug: data.slug,
            summary: data.summary,
            contribution: data.contribution,
            approach: data.approach,
            impact: data.impact,
            status: data.status,
            publishedAt: data.status === 'published' ? prev.publishedAt || now : prev.publishedAt,
            updatedAt: now,
          })
          .where(eq(freelanceProjectTranslations.id, prev.id));
      } else {
        await tx.insert(freelanceProjectTranslations)
          .values({
            freelanceProjectId,
            locale: loc,
            title: data.title,
            slug: data.slug,
            summary: data.summary,
            contribution: data.contribution,
            approach: data.approach,
            impact: data.impact,
            status: data.status,
            publishedAt: data.status === 'published' ? now : null,
            createdAt: now,
            updatedAt: now,
          });
      }
    }

    return { freelanceProjectId };
  });
}

export async function archiveFreelanceProjectRecord(db: DbClient, id: number): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(freelanceProjects)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(freelanceProjects.id, id));
    await tx.update(freelanceProjectTranslations)
      .set({ status: 'archived', updatedAt: now })
      .where(eq(freelanceProjectTranslations.freelanceProjectId, id));
  });
}

export async function toggleFreelanceFeaturedRecord(
  db: DbClient,
  id: number,
  featured: boolean,
): Promise<{ featured: boolean }> {
  const now = new Date();
  const [existing] = await db
    .select({ id: freelanceProjects.id })
    .from(freelanceProjects)
    .where(eq(freelanceProjects.id, id))
    .limit(1);
  if (!existing) {
    throw new FreelanceServiceError('NOT_FOUND', 'Freelance project not found.');
  }
  await db
    .update(freelanceProjects)
    .set({ featured, updatedAt: now })
    .where(eq(freelanceProjects.id, id));
  return { featured };
}

export async function reorderFreelanceProjectRecords(
  db: DbClient,
  orderedIds: number[],
): Promise<void> {
  const now = new Date();
  const uniqueIds = Array.from(new Set(orderedIds));
  await db.transaction(async (tx) => {
    for (let i = 0; i < uniqueIds.length; i++) {
      await tx.update(freelanceProjects)
        .set({ sortOrder: i + 1, updatedAt: now })
        .where(eq(freelanceProjects.id, uniqueIds[i]));
    }
  });
}
