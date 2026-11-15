import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { freelanceProjects, freelanceProjectTranslations } from '../db/schema';
import { normalizePortfolioTags } from './portfolio-data';
import { slugify } from './slug';

type DbClient = ReturnType<typeof getDb>;

export interface ParsedFreelanceEntry {
  title: string;
  slug: string;
  category: string;
  sortOrder: number;
  contribution: string;
  approach: string;
  impact: string;
  techStack: string[];
}

export interface FreelanceImportSummary {
  projectsCreated: number;
  projectsUpdated: number;
  translationsSynced: number;
}

export interface FreelanceEnImportSummary {
  projectsMatched: number;
  translationsCreated: number;
  translationsUpdated: number;
}

const DEFAULT_SOURCE_PATH = path.resolve(
  process.cwd(),
  'porto_prompt',
  'porto_tambahan_onlinenotepad.io.txt',
);

const DEFAULT_EN_SOURCE_PATH = path.resolve(
  process.cwd(),
  'porto_prompt',
  'portfolio_additional_projects_en.md',
);

function normalizeEnPunctuation(raw: string): string {
  return raw
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferFreelanceCategory(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('saas') || lower.includes('whatsapp bot')) return 'saas';
  if (lower.includes('ai-powered') || lower.includes('clipper')) return 'ai';
  if (lower.includes('gudang') || lower.includes('pengadaan')) return 'operations';
  if (lower.includes('android') || lower.includes('notification')) return 'mobile';
  if (lower.includes('pembelajaran') || lower.includes('perpustakaan')) return 'education';
  if (lower.includes('pemesanan') || lower.includes('pizza')) return 'ecommerce';
  if (lower.includes('scraper') || lower.includes('ekstraksi')) return 'automation';
  if (lower.includes('trading bot')) return 'trading-bot';
  return 'freelance';
}

function parseTechList(rawLine: string): string[] {
  const cleaned = rawLine
    .replace(/^Teknologi:\s*/i, '')
    .replace(/\.+$/, '')
    .trim();
  if (!cleaned) return [];
  const rawTokens = cleaned.split(/[,/]/).map((token) => token.trim());
  return normalizePortfolioTags(rawTokens);
}

/**
 * Parses freelance project entries from the bullet-delimited text format in
 * `porto_prompt/porto_tambahan_onlinenotepad.io.txt`.
 */
export function parseFreelanceSourceText(rawText: string): ParsedFreelanceEntry[] {
  const lines = rawText.split(/\r?\n/);
  const blocks: Array<{ title: string; bodyLines: string[] }> = [];
  let current: { title: string; bodyLines: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^=+$/.test(line)) continue;

    if (line.startsWith('•')) {
      if (current) blocks.push(current);
      current = {
        title: line.replace(/^•\s*/, '').trim(),
        bodyLines: [],
      };
      continue;
    }

    if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) blocks.push(current);

  const entries: ParsedFreelanceEntry[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.title) continue;

    let contribution = '';
    let approach = '';
    let impact = '';
    let techLine = '';

    for (const line of block.bodyLines) {
      if (/^Kontribusi:\s*/i.test(line)) {
        contribution = line.replace(/^Kontribusi:\s*/i, '').trim();
      } else if (/^Pendekatan:\s*/i.test(line)) {
        approach = line.replace(/^Pendekatan:\s*/i, '').trim();
      } else if (/^Dampak:\s*/i.test(line)) {
        impact = line.replace(/^Dampak:\s*/i, '').trim();
      } else {
        techLine = techLine ? `${techLine}, ${line}` : line;
      }
    }

    entries.push({
      title: block.title,
      slug: slugify(block.title),
      category: inferFreelanceCategory(block.title),
      sortOrder: i + 1,
      contribution,
      approach,
      impact,
      techStack: parseTechList(techLine),
    });
  }

  return entries;
}

/**
 * Loads and parses all freelance projects from disk.
 */
export function loadFreelanceEntries(sourcePath = DEFAULT_SOURCE_PATH): ParsedFreelanceEntry[] {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Freelance source file not found: ${sourcePath}`);
  }
  const raw = fs.readFileSync(sourcePath, 'utf8');
  return parseFreelanceSourceText(raw);
}

/**
 * Parses English freelance project entries from the Markdown format in
 * `porto_prompt/portfolio_additional_projects_en.md`.
 */
export function parseFreelanceEnMarkdown(rawText: string): ParsedFreelanceEntry[] {
  const lines = rawText.split(/\r?\n/);
  const blocks: Array<{ title: string; bodyLines: string[] }> = [];
  let current: { title: string; bodyLines: string[] } | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('## ')) {
      if (current) blocks.push(current);
      current = {
        title: normalizeEnPunctuation(trimmed.slice(3)),
        bodyLines: [],
      };
      continue;
    }

    if (current) {
      current.bodyLines.push(trimmed);
    }
  }
  if (current) blocks.push(current);

  const entries: ParsedFreelanceEntry[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.title) continue;

    type EnFieldKey = 'contribution' | 'approach' | 'impact' | 'tech';
    let activeField: EnFieldKey | null = null;
    const buffers: Record<EnFieldKey, string[]> = {
      contribution: [],
      approach: [],
      impact: [],
      tech: [],
    };

    for (const line of block.bodyLines) {
      if (!line) continue;

      const labelMatch = line.match(/^\*\*(Contribution|Approach|Impact|Tech Stack):\*\*\s*(.*)$/i);
      if (labelMatch) {
        const label = labelMatch[1].toLowerCase();
        const rest = labelMatch[2].trim();
        activeField =
          label === 'contribution'
            ? 'contribution'
            : label === 'approach'
              ? 'approach'
              : label === 'impact'
                ? 'impact'
                : 'tech';
        if (rest) buffers[activeField].push(rest);
        continue;
      }

      if (activeField) {
        buffers[activeField].push(line);
      }
    }

    const techLine = normalizeEnPunctuation(buffers.tech.join(' '));
    entries.push({
      title: block.title,
      slug: slugify(block.title),
      category: inferFreelanceCategory(block.title),
      sortOrder: i + 1,
      contribution: normalizeEnPunctuation(buffers.contribution.join(' ')),
      approach: normalizeEnPunctuation(buffers.approach.join(' ')),
      impact: normalizeEnPunctuation(buffers.impact.join(' ')),
      techStack: parseTechList(techLine),
    });
  }

  return entries;
}

/**
 * Loads and parses all English freelance projects from disk.
 */
export function loadFreelanceEnEntries(sourcePath = DEFAULT_EN_SOURCE_PATH): ParsedFreelanceEntry[] {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`English freelance source file not found: ${sourcePath}`);
  }
  const raw = fs.readFileSync(sourcePath, 'utf8');
  return parseFreelanceEnMarkdown(raw);
}

/**
 * Idempotently imports all Indonesian freelance projects from the source text file
 * into `freelance_projects` and `freelance_project_translations`.
 */
export async function importFreelanceToDb(options?: {
  db?: DbClient;
  sourcePath?: string;
}): Promise<FreelanceImportSummary> {
  const db = options?.db ?? getDb();
  const entries = loadFreelanceEntries(options?.sourcePath);
  const now = new Date();

  const summary: FreelanceImportSummary = {
    projectsCreated: 0,
    projectsUpdated: 0,
    translationsSynced: 0,
  };

  for (const entry of entries) {
    const existingTrans = await db
      .select({
        id: freelanceProjectTranslations.id,
        freelanceProjectId: freelanceProjectTranslations.freelanceProjectId,
        publishedAt: freelanceProjectTranslations.publishedAt,
      })
      .from(freelanceProjectTranslations)
      .where(
        and(
          eq(freelanceProjectTranslations.locale, 'id'),
          eq(freelanceProjectTranslations.slug, entry.slug),
        ),
      )
      .limit(1);

    const techStackJson = JSON.stringify(entry.techStack);

    if (existingTrans.length > 0) {
      const prev = existingTrans[0];
      await db
        .update(freelanceProjects)
        .set({
          category: entry.category,
          techStackJson,
          sortOrder: entry.sortOrder,
          deletedAt: null,
          updatedAt: now,
        })
        .where(eq(freelanceProjects.id, prev.freelanceProjectId));

      await db
        .update(freelanceProjectTranslations)
        .set({
          title: entry.title,
          contribution: entry.contribution,
          approach: entry.approach,
          impact: entry.impact,
          status: 'published',
          publishedAt: prev.publishedAt || now,
          updatedAt: now,
        })
        .where(eq(freelanceProjectTranslations.id, prev.id));

      summary.projectsUpdated += 1;
      summary.translationsSynced += 1;
    } else {
      const [created] = await db
        .insert(freelanceProjects)
        .values({
          category: entry.category,
          featured: false,
          isConfidential: false,
          techStackJson,
          sortOrder: entry.sortOrder,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: freelanceProjects.id });

      await db.insert(freelanceProjectTranslations).values({
        freelanceProjectId: created.id,
        locale: 'id',
        title: entry.title,
        slug: entry.slug,
        summary: '',
        contribution: entry.contribution,
        approach: entry.approach,
        impact: entry.impact,
        status: 'published',
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      summary.projectsCreated += 1;
      summary.translationsSynced += 1;
    }
  }

  return summary;
}

/**
 * Idempotently imports English freelance project translations in the exact positional
 * order of the canonical Indonesian entries, attaching each EN translation to its
 * corresponding existing `freelance_projects` record without overwriting custom ordering
 * or visibility flags.
 */
export async function importFreelanceEnToDb(options?: {
  db?: DbClient;
  idSourcePath?: string;
  enSourcePath?: string;
}): Promise<FreelanceEnImportSummary> {
  const db = options?.db ?? getDb();
  const idEntries = loadFreelanceEntries(options?.idSourcePath);
  const enEntries = loadFreelanceEnEntries(options?.enSourcePath);

  if (idEntries.length !== enEntries.length) {
    throw new Error(
      `Freelance EN entry count (${enEntries.length}) does not match ID entry count (${idEntries.length}).`,
    );
  }

  const now = new Date();
  const summary: FreelanceEnImportSummary = {
    projectsMatched: 0,
    translationsCreated: 0,
    translationsUpdated: 0,
  };

  for (let i = 0; i < enEntries.length; i++) {
    const idEntry = idEntries[i];
    const enEntry = enEntries[i];

    const idTrans = await db
      .select({
        freelanceProjectId: freelanceProjectTranslations.freelanceProjectId,
      })
      .from(freelanceProjectTranslations)
      .where(
        and(
          eq(freelanceProjectTranslations.locale, 'id'),
          eq(freelanceProjectTranslations.slug, idEntry.slug),
        ),
      )
      .limit(1);

    if (idTrans.length === 0) {
      throw new Error(
        `Missing Indonesian freelance record for slug "${idEntry.slug}". Run freelance:import first.`,
      );
    }

    const parentId = idTrans[0].freelanceProjectId;
    summary.projectsMatched += 1;

    const existingEn = await db
      .select({
        id: freelanceProjectTranslations.id,
        publishedAt: freelanceProjectTranslations.publishedAt,
      })
      .from(freelanceProjectTranslations)
      .where(
        and(
          eq(freelanceProjectTranslations.freelanceProjectId, parentId),
          eq(freelanceProjectTranslations.locale, 'en'),
        ),
      )
      .limit(1);

    if (existingEn.length > 0) {
      await db
        .update(freelanceProjectTranslations)
        .set({
          title: enEntry.title,
          slug: enEntry.slug,
          contribution: enEntry.contribution,
          approach: enEntry.approach,
          impact: enEntry.impact,
          status: 'published',
          publishedAt: existingEn[0].publishedAt || now,
          updatedAt: now,
        })
        .where(eq(freelanceProjectTranslations.id, existingEn[0].id));
      summary.translationsUpdated += 1;
    } else {
      await db.insert(freelanceProjectTranslations).values({
        freelanceProjectId: parentId,
        locale: 'en',
        title: enEntry.title,
        slug: enEntry.slug,
        summary: '',
        contribution: enEntry.contribution,
        approach: enEntry.approach,
        impact: enEntry.impact,
        status: 'published',
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      summary.translationsCreated += 1;
    }
  }

  return summary;
}
