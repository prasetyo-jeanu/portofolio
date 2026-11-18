import { z } from 'astro/zod';

export const PORTFOLIO_SECTION_MAX_ITEMS = 10;

export const portfolioCopyItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(2000),
});

export const portfolioLocaleEntrySchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
  role: z.string().trim().max(160).default(''),
  summary: z.string().trim().min(1).max(360),
  portfolio_copy: z.array(portfolioCopyItemSchema).min(1).max(PORTFOLIO_SECTION_MAX_ITEMS),
  seo_title: z.string().trim().max(120).optional(),
  seo_description: z.string().trim().max(220).optional(),
});

export const portfolioProjectFileSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  project_name: z.string().trim().min(1).max(180),
  category: z.string().trim().min(1).max(60),
  featured: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
  is_confidential: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
  demo_url: z.url().nullable().optional(),
  repo_url: z.url().nullable().optional(),
  tech_stack_tags: z.array(z.string().trim().min(1).max(50)).min(1),
  image: z.object({
    file: z.string().trim().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    aspect_ratio: z.enum(['1:1', '16:9']),
    alt: z.object({
      en: z.string().trim().min(1).max(240),
      id: z.string().trim().min(1).max(240),
    }),
  }),
  translations: z.object({
    en: portfolioLocaleEntrySchema,
    id: portfolioLocaleEntrySchema,
  }),
});

export type PortfolioCopyItem = z.infer<typeof portfolioCopyItemSchema>;
export type PortfolioLocaleEntry = z.infer<typeof portfolioLocaleEntrySchema>;
export type PortfolioProjectFile = z.infer<typeof portfolioProjectFileSchema>;

/**
 * Converts structured portfolio sections (`What I Built`, `My Approach`, `Impact`)
 * into safe Markdown/MDX headings validated by `validateRestrictedMdx`.
 */
export function buildProjectMdx(sections: PortfolioCopyItem[]): string {
  return sections
    .map((section) => `## ${section.label.trim()}\n\n${section.text.trim()}`)
    .join('\n\n');
}

/**
 * Normalizes and deduplicates stack tags case-insensitively while preserving display casing.
 */
export function normalizePortfolioTags(rawTags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of rawTags) {
    const clean = tag.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(clean);
  }
  return normalized;
}
