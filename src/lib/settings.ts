import { eq } from 'drizzle-orm';
import { db } from '../db';
import { siteSettings } from '../db/schema';

export interface HeroHeadlineSegment {
  text: string;
  accent: boolean;
}

export interface ExpertiseItem {
  title: string;
  description: string;
}

export interface ExperienceItem {
  period: string;
  role: string;
  company: string;
  logo: string;
  summary: string;
}

export interface SiteProfileSettings {
  siteName: string;
  developerName: string;
  headlineId: string;
  headlineEn: string;
  heroHeadlinesId: string[];
  heroHeadlinesEn: string[];
  introId: string;
  introEn: string;
  aboutBackgroundId: string;
  aboutBackgroundEn: string;
  aboutPhilosophyId: string;
  aboutPhilosophyEn: string;
  email: string;
  githubUrl: string;
  gitlabUrl: string;
  linkedinUrl: string;
  xUrl: string;
  coreStack: string[];
  expertiseId: Array<{ title: string; description: string }>;
  expertiseEn: Array<ExpertiseItem>;
  experienceId: Array<ExperienceItem>;
  experienceEn: Array<ExperienceItem>;
}

export const DEFAULT_SITE_SETTINGS: SiteProfileSettings = {
  siteName: 'DevPortfolio',
  developerName: 'Fullstack Engineer',
  headlineId: 'Membangun aplikasi web bisnis, sistem data, dan otomasi yang andal.',
  headlineEn: 'Building reliable business web applications, data systems, and workflow automation.',
  heroHeadlinesId: [
    'Halo, saya **Prasetyo**',
    'Senior **Fullstack Developer** 10+ tahun.',
    'Berfokus pada **arsitektur yang bersih**,',
    'sistem **backend yang skalabel**,',
    'serta **membimbing tim**',
    'untuk menghasilkan **perangkat lunak berkualitas tinggi**.',
  ],
  heroHeadlinesEn: [
    'Hi, I am **Prasetyo**',
    'Senior **Fullstack Developer** 10+ years.',
    'Focused on **clean architecture**,',
    '**scalable backend** systems,',
    'and **mentoring teams**',
    'to deliver **high-quality software**.',
  ],
  introId:
    'Saya merancang dan membangun perangkat lunak fullstack yang berfokus pada kejelasan arsitektur, kecepatan eksekusi, dan kemudahan pemeliharaan jangka panjang.',
  introEn:
    'I architect and ship fullstack software focused on structural clarity, fast execution, and long-term maintainability.',
  aboutBackgroundId:
    'Berpengalaman membangun platform B2B, sistem manajemen operasional, integrasi API pihak ketiga, serta pipeline otomasi dan pengolahan data untuk berbagai kebutuhan industri.',
  aboutBackgroundEn:
    'Experienced in building B2B platforms, operational management systems, third-party API integrations, and data automation pipelines across diverse domains.',
  aboutPhilosophyId:
    'Utamakan arsitektur sederhana yang terukur, pisahkan domain bisnis dari detail infrastruktur seperlunya, dan hindari kompleksitas yang tidak menyelesaikan masalah nyata.',
  aboutPhilosophyEn:
    'Prefer simple, measurable architectures, keep business logic clean and testable, and avoid complexity that does not solve a real problem.',
  email: 'hello@example.com',
  githubUrl: 'https://github.com/',
  gitlabUrl: 'https://gitlab.com/',
  linkedinUrl: 'https://linkedin.com/',
  xUrl: '',
  coreStack: ['TypeScript', 'Astro', 'Bun', 'Node.js', 'SQLite', 'PostgreSQL', 'Tailwind CSS', 'Docker'],
  expertiseId: [
    {
      title: 'Aplikasi Web Fullstack',
      description: 'Perancangan sistem end-to-end mulai dari skema basis data relasional, API, hingga antarmuka responsif.',
    },
    {
      title: 'Integrasi & Otomasi Sistem',
      description: 'Menghubungkan layanan internal maupun pihak ketiga, antrean pesan, dan alur kerja otomatis yang tahan gangguan.',
    },
    {
      title: 'Arsitektur Konten & SEO Teknis',
      description: 'Penerapan SSG/SSR modern, struktur metadata multibahasa, dan optimasi Core Web Vitals.',
    },
  ],
  expertiseEn: [
    {
      title: 'Fullstack Web Applications',
      description: 'End-to-end engineering from relational database modeling and API design to accessible interfaces.',
    },
    {
      title: 'System Integration & Automation',
      description: 'Connecting internal services and third-party APIs with resilient background processing and data pipelines.',
    },
    {
      title: 'Content Architecture & Technical SEO',
      description: 'Modern static/hybrid delivery, bilingual metadata architecture, and Core Web Vitals optimization.',
    },
  ],
  experienceId: [
    {
      period: '2022 – Sekarang',
      role: 'Fullstack Web Developer',
      company: '',
      logo: '',
      summary: 'Merancang dan memelihara aplikasi bisnis, API gateway, serta alat otomasi berbasis TypeScript dan Node.js/Bun.',
    },
  ],
  experienceEn: [
    {
      period: '2022 – Present',
      role: 'Fullstack Web Developer',
      company: '',
      logo: '',
      summary: 'Architecting and maintaining business applications, API gateways, and automation tooling with TypeScript and Node.js/Bun.',
    },
  ],
};

/**
 * Splits a brand site name on spaces into rotating ticker tokens when multi-word.
 */
export function splitSiteNameTokens(siteName: string): string[] {
  return siteName
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function normalizeHeroHeadlines(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const cleaned = raw
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return cleaned.length > 0 ? cleaned : fallback;
}

const strField = (item: unknown, key: string): string => {
  if (!item || typeof item !== 'object') return '';
  const val = (item as Record<string, unknown>)[key];
  return typeof val === 'string' ? val.trim() : '';
};

/**
 * Allows only relative `/...` or `http(s)://...` image URLs to block `javascript:` / unsafe schemes.
 */
export function sanitizeImageUrl(raw: string): string {
  const clean = raw.trim();
  if (!clean) return '';
  if (clean.startsWith('/') && !clean.startsWith('//')) return clean;
  if (/^https?:\/\//i.test(clean)) return clean;
  return '';
}

/**
 * Normalizes stored expertise items while preserving intentionally saved lists.
 */
export function normalizeExpertiseItems(raw: unknown, fallback: ExpertiseItem[]): ExpertiseItem[] {
  if (!Array.isArray(raw)) return fallback;
  return raw
    .map((item) => ({
      title: strField(item, 'title'),
      description: strField(item, 'description'),
    }))
    .filter((item) => item.title.length > 0 || item.description.length > 0);
}

/**
 * Normalizes stored experience highlights while preserving intentionally saved lists.
 */
export function normalizeExperienceItems(raw: unknown, fallback: ExperienceItem[]): ExperienceItem[] {
  if (!Array.isArray(raw)) return fallback;
  return raw
    .map((item) => ({
      period: strField(item, 'period'),
      role: strField(item, 'role'),
      company: strField(item, 'company'),
      logo: sanitizeImageUrl(strField(item, 'logo')),
      summary: strField(item, 'summary'),
    }))
    .filter(
      (item) =>
        item.period.length > 0 ||
        item.role.length > 0 ||
        item.company.length > 0 ||
        item.logo.length > 0 ||
        item.summary.length > 0,
    );
}

/**
 * Splits a hero headline into normal and accent segments using `**highlight**` markers,
 * falling back to highlighting `fallbackAccentPhrase` if no markers are present.
 */
export function parseHeadlineSegments(raw: string, fallbackAccentPhrase?: string): HeroHeadlineSegment[] {
  const input = raw.trim();
  if (!input) return [];

  const tokenRegex = /\*\*([^*]+)\*\*/g;
  if (tokenRegex.test(input)) {
    tokenRegex.lastIndex = 0;
    const segments: HeroHeadlineSegment[] = [];
    let cursor = 0;
    for (const match of input.matchAll(tokenRegex)) {
      const idx = match.index ?? 0;
      if (idx > cursor) {
        segments.push({ text: input.slice(cursor, idx), accent: false });
      }
      if (match[1]) {
        segments.push({ text: match[1], accent: true });
      }
      cursor = idx + match[0].length;
    }
    if (cursor < input.length) {
      segments.push({ text: input.slice(cursor), accent: false });
    }
    return segments.filter((seg) => seg.text.length > 0);
  }

  if (fallbackAccentPhrase) {
    const idx = input.toLowerCase().indexOf(fallbackAccentPhrase.toLowerCase());
    if (idx >= 0) {
      const segments: HeroHeadlineSegment[] = [];
      if (idx > 0) segments.push({ text: input.slice(0, idx), accent: false });
      segments.push({ text: input.slice(idx, idx + fallbackAccentPhrase.length), accent: true });
      if (idx + fallbackAccentPhrase.length < input.length) {
        segments.push({ text: input.slice(idx + fallbackAccentPhrase.length), accent: false });
      }
      return segments;
    }
  }

  return [{ text: input, accent: false }];
}

export function stripHeadlineMarkers(raw: string): string {
  return parseHeadlineSegments(raw)
    .map((seg) => seg.text)
    .join('');
}

export async function getSiteSettings(): Promise<SiteProfileSettings> {
  try {
    const rows = await db.select().from(siteSettings);
    const map = new Map<string, string>(rows.map((r) => [r.key, r.value]));

    const parseJson = <T>(key: string, fallback: T): T => {
      const raw = map.get(key);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    };

    return {
      siteName: map.get('siteName') || DEFAULT_SITE_SETTINGS.siteName,
      developerName: map.get('developerName') || DEFAULT_SITE_SETTINGS.developerName,
      headlineId: map.get('headlineId') || DEFAULT_SITE_SETTINGS.headlineId,
      headlineEn: map.get('headlineEn') || DEFAULT_SITE_SETTINGS.headlineEn,
      heroHeadlinesId: normalizeHeroHeadlines(
        parseJson<unknown>('heroHeadlinesId', DEFAULT_SITE_SETTINGS.heroHeadlinesId),
        DEFAULT_SITE_SETTINGS.heroHeadlinesId,
      ),
      heroHeadlinesEn: normalizeHeroHeadlines(
        parseJson<unknown>('heroHeadlinesEn', DEFAULT_SITE_SETTINGS.heroHeadlinesEn),
        DEFAULT_SITE_SETTINGS.heroHeadlinesEn,
      ),
      introId: map.get('introId') || DEFAULT_SITE_SETTINGS.introId,
      introEn: map.get('introEn') || DEFAULT_SITE_SETTINGS.introEn,
      aboutBackgroundId: map.get('aboutBackgroundId') || DEFAULT_SITE_SETTINGS.aboutBackgroundId,
      aboutBackgroundEn: map.get('aboutBackgroundEn') || DEFAULT_SITE_SETTINGS.aboutBackgroundEn,
      aboutPhilosophyId: map.get('aboutPhilosophyId') || DEFAULT_SITE_SETTINGS.aboutPhilosophyId,
      aboutPhilosophyEn: map.get('aboutPhilosophyEn') || DEFAULT_SITE_SETTINGS.aboutPhilosophyEn,
      email: map.get('email') || DEFAULT_SITE_SETTINGS.email,
      githubUrl: map.get('githubUrl') ?? DEFAULT_SITE_SETTINGS.githubUrl,
      gitlabUrl: map.get('gitlabUrl') ?? DEFAULT_SITE_SETTINGS.gitlabUrl,
      linkedinUrl: map.get('linkedinUrl') ?? DEFAULT_SITE_SETTINGS.linkedinUrl,
      xUrl: map.get('xUrl') ?? DEFAULT_SITE_SETTINGS.xUrl,
      coreStack: parseJson('coreStack', DEFAULT_SITE_SETTINGS.coreStack),
      expertiseId: normalizeExpertiseItems(parseJson<unknown>('expertiseId', DEFAULT_SITE_SETTINGS.expertiseId), DEFAULT_SITE_SETTINGS.expertiseId),
      expertiseEn: normalizeExpertiseItems(parseJson<unknown>('expertiseEn', DEFAULT_SITE_SETTINGS.expertiseEn), DEFAULT_SITE_SETTINGS.expertiseEn),
      experienceId: normalizeExperienceItems(parseJson<unknown>('experienceId', DEFAULT_SITE_SETTINGS.experienceId), DEFAULT_SITE_SETTINGS.experienceId),
      experienceEn: normalizeExperienceItems(parseJson<unknown>('experienceEn', DEFAULT_SITE_SETTINGS.experienceEn), DEFAULT_SITE_SETTINGS.experienceEn),
    };
  } catch {
    // Fallback gracefully before first migration/seed
    return DEFAULT_SITE_SETTINGS;
  }
}

export async function saveSiteSettings(partial: Partial<SiteProfileSettings>): Promise<void> {
  const now = new Date();
  for (const [key, val] of Object.entries(partial)) {
    if (val === undefined) continue;
    const serialized = typeof val === 'string' ? val : JSON.stringify(val);
    const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(siteSettings).set({ value: serialized, updatedAt: now }).where(eq(siteSettings.key, key));
    } else {
      await db.insert(siteSettings).values({ key, value: serialized, updatedAt: now });
    }
  }
}
