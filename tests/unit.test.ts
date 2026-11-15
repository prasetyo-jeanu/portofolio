import { describe, expect, test } from 'bun:test';
import { slugify, isValidSlug } from '../src/lib/slug';
import {
  validateRestrictedMdx,
  estimateReadingTimeMinutes,
  extractHeadingsFromMdx,
} from '../src/lib/mdx/validator';
import { renderSafeMdxPreview } from '../src/lib/mdx/preview';
import { detectAllowedImageType, sanitizeBaseFilename } from '../src/lib/media';
import { buildProjectMdx, normalizePortfolioTags } from '../src/lib/portfolio-data';
import { loadPortfolioEntries } from '../src/lib/portfolio-importer';
import {
  loadFreelanceEntries,
  loadFreelanceEnEntries,
  parseFreelanceEnMarkdown,
  parseFreelanceSourceText,
} from '../src/lib/freelance-importer';
import { FreelanceServiceError, sanitizeOptionalUrl } from '../src/lib/freelance-service';
import { getProjectUrl, getTranslations } from '../src/lib/i18n';
import {
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  buildCollectionPageJsonLd,
  buildPersonJsonLd,
  buildProjectJsonLd,
} from '../src/lib/seo';
import {
  DEFAULT_SITE_SETTINGS,
  normalizeExperienceItems,
  normalizeExpertiseItems,
  normalizeHeroHeadlines,
  parseHeadlineSegments,
  splitSiteNameTokens,
  stripHeadlineMarkers,
} from '../src/lib/settings';

describe('Slug utilities', () => {
  test('slugify normalizes accents, punctuation, and whitespace', () => {
    expect(slugify('Membangun REST API dengan Bun & Astro!')).toBe('membangun-rest-api-dengan-bun-astro');
    expect(slugify('  Café Architecture — Part 1  ')).toBe('cafe-architecture-part-1');
  });

  test('isValidSlug enforces format and length bounds', () => {
    expect(isValidSlug('valid-slug-123')).toBe(true);
    expect(isValidSlug('a')).toBe(false);
    expect(isValidSlug('Invalid_Slug')).toBe(false);
    expect(isValidSlug('-leading-hyphen')).toBe(false);
  });
});

describe('Restricted MDX security validator', () => {
  test('accepts safe Markdown, allowlisted Callout/Figure, and imports inside fenced code blocks', () => {
    const safeMdx = `
## Architecture Overview

Here is how we import Astro helpers in code blocks:

\`\`\`ts
import { defineAction } from 'astro:actions';
const obj = { ok: true };
\`\`\`

<Callout type="tip" title="Production Tip">
Always enable SQLite WAL mode.
</Callout>

<Figure src="/uploads/arch.png" alt="System architecture" caption="Figure 1" />
`;
    const res = validateRestrictedMdx(safeMdx);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  test('rejects ESM imports/exports, scripts, event handlers, JSX expressions, and unknown components', () => {
    expect(validateRestrictedMdx("import fs from 'node:fs';\nHello").valid).toBe(false);
    expect(validateRestrictedMdx('export const secret = 1;\nHello').valid).toBe(false);
    expect(validateRestrictedMdx('<script>alert(1)</script>').valid).toBe(false);
    expect(validateRestrictedMdx('<div onclick="alert(1)">hi</div>').valid).toBe(false);
    expect(validateRestrictedMdx('Result: {process.env.SESSION_SECRET}').valid).toBe(false);
    expect(validateRestrictedMdx('<EvilWidget />').valid).toBe(false);
    expect(validateRestrictedMdx('[click](javascript:alert(1))').valid).toBe(false);
  });

  test('estimates reading time and extracts H2/H3 headings', () => {
    const mdx = `## Intro\n${'word '.repeat(250)}\n### Deep Dive\nMore text.`;
    expect(estimateReadingTimeMinutes(mdx)).toBe(2);
    const headings = extractHeadingsFromMdx(mdx);
    expect(headings).toEqual([
      { depth: 2, text: 'Intro', slug: 'intro' },
      { depth: 3, text: 'Deep Dive', slug: 'deep-dive' },
    ]);
  });

  test('renderSafeMdxPreview renders highlighted HTML and blocks unsafe MDX', async () => {
    const bad = await renderSafeMdxPreview('<script>alert(1)</script>');
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.html).toBe('');

    const good = await renderSafeMdxPreview('## Hello\n\n<Callout type="info" title="Hi">Safe body</Callout>');
    expect(good.errors).toEqual([]);
    expect(good.html).toContain('<h2>Hello</h2>');
    expect(good.html).toContain('mdx-callout-info');
  });
});

describe('Media upload validation', () => {
  test('detects PNG and JPEG magic bytes and rejects arbitrary text/SVG', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectAllowedImageType(pngBytes)).toEqual({ mime: 'image/png', ext: 'png' });

    const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectAllowedImageType(jpgBytes)).toEqual({ mime: 'image/jpeg', ext: 'jpg' });

    const svgBytes = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    expect(detectAllowedImageType(svgBytes)).toBeNull();
  });

  test('sanitizes filenames against path traversal', () => {
    expect(sanitizeBaseFilename('../../etc/passwd.png')).toBe('passwd');
    expect(sanitizeBaseFilename('My Screenshot (2026).PNG')).toBe('my-screenshot-2026');
  });
});

describe('SEO JSON-LD builders', () => {
  test('builds accurate BlogPosting, Person, and BreadcrumbList schemas', () => {
    const person = buildPersonJsonLd({
      name: 'Alex',
      jobTitle: 'Fullstack Web Developer',
      description: 'Engineer',
      url: 'https://example.com/id/',
      image: '/og-default.png',
      knowsAbout: ['TypeScript', 'Kafka', ''],
      sameAs: ['https://github.com/alex', 'https://linkedin.com/', ''],
    });
    expect(person['@type']).toBe('Person');
    expect(person.sameAs).toEqual(['https://github.com/alex']);
    expect(person.knowsAbout).toEqual(['TypeScript', 'Kafka']);
    expect(person.image).toBe('http://localhost:4321/og-default.png');

    const projectSchema = buildProjectJsonLd({
      title: 'IndiHome Loyalty',
      description: 'Event-driven CRM',
      url: 'https://example.com/en/projects/indihome-loyalty-platform/',
      image: '/uploads/portfolio/indihome-loyalty-platform.webp',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      authorName: 'Alex',
      locale: 'en',
      category: 'CRM',
      tags: ['Node.js', 'Kafka'],
    });
    expect(projectSchema['@type']).toBe('CreativeWork');
    expect(projectSchema.inLanguage).toBe('en-US');
    expect(projectSchema.genre).toBe('CRM');

    const collectionSchema = buildCollectionPageJsonLd({
      name: 'Blog',
      description: 'Articles',
      url: 'https://example.com/id/blog/',
      locale: 'id',
      items: [{ name: 'Post 1', url: '/id/blog/post-1/' }],
    });
    expect(collectionSchema['@type']).toBe('CollectionPage');
    expect(collectionSchema.mainEntity.itemListElement.length).toBe(1);

    expect(getProjectUrl('en', 'indihome')).toBe('/en/projects/indihome/');
    expect(getProjectUrl('id', 'indihome')).toBe('/id/proyek/indihome/');

    const post = buildBlogPostingJsonLd({
      title: 'Astro + SQLite',
      description: 'Guide',
      url: 'https://example.com/id/blog/astro-sqlite/',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      authorName: 'Alex',
      locale: 'id',
      tags: ['astro', 'sqlite'],
    });
    expect(post['@type']).toBe('BlogPosting');
    expect(post.inLanguage).toBe('id-ID');

    const bc = buildBreadcrumbJsonLd([
      { name: 'Beranda', url: '/id/' },
      { name: 'Blog', url: '/id/blog/' },
    ]);
    expect(bc.itemListElement.length).toBe(2);
    expect(bc.itemListElement[0].position).toBe(1);
  });
});

describe('Structured portfolio dataset', () => {
  test('builds restricted-MDX sections and normalizes stack tags cleanly', () => {
    const mdx = buildProjectMdx([
      { label: 'What I Built', text: 'Built a gateway.' },
      { label: 'Impact', text: 'Reduced latency.' },
    ]);
    expect(mdx).toBe('## What I Built\n\nBuilt a gateway.\n\n## Impact\n\nReduced latency.');
    expect(validateRestrictedMdx(mdx).valid).toBe(true);
    expect(normalizePortfolioTags(['Node.js', ' node.js ', 'Kafka', ''])).toEqual(['Node.js', 'Kafka']);
  });

  test('loads all 14 bilingual project.json files with 1:1 WebP images', () => {
    const entries = loadPortfolioEntries();
    expect(entries.length).toBe(14);
    expect(entries[0].data.sort_order).toBe(1);
    for (const entry of entries) {
      expect(entry.data.status).toBe('published');
      expect(entry.data.image.aspect_ratio).toBe('1:1');
      expect(entry.data.translations.en.title.length).toBeGreaterThan(0);
      expect(entry.data.translations.id.title.length).toBeGreaterThan(0);
    }
  });
});

describe('Hero rotating headlines settings helpers', () => {
  test('parses **accent** markers and falls back to phrase matching', () => {
    expect(parseHeadlineSegments('Hi, I am **Prasetyo**')).toEqual([
      { text: 'Hi, I am ', accent: false },
      { text: 'Prasetyo', accent: true },
    ]);
    expect(stripHeadlineMarkers('Senior **Fullstack Developer** 10+ years.')).toBe(
      'Senior Fullstack Developer 10+ years.',
    );
    expect(
      parseHeadlineSegments('Building reliable business web applications daily', 'business web applications'),
    ).toEqual([
      { text: 'Building reliable ', accent: false },
      { text: 'business web applications', accent: true },
      { text: ' daily', accent: false },
    ]);
  });

  test('normalizes headline arrays cleanly and seeds 6 default hero slides', () => {
    expect(normalizeHeroHeadlines(['  Hi  ', '', '   '], ['Fallback'])).toEqual(['Hi']);
    expect(normalizeHeroHeadlines([], ['Fallback'])).toEqual(['Fallback']);
    expect(DEFAULT_SITE_SETTINGS.heroHeadlinesEn.length).toBe(6);
    expect(DEFAULT_SITE_SETTINGS.heroHeadlinesId.length).toBe(6);
  });

  test('splits brand site name tokens on spaces only for multi-word names', () => {
    expect(splitSiteNameTokens('DevPortfolio')).toEqual(['DevPortfolio']);
    expect(splitSiteNameTokens('  DevPortfolio   Prasetyo  ')).toEqual(['DevPortfolio', 'Prasetyo']);
    expect(splitSiteNameTokens('Prasetyo Fullstack Studio')).toEqual(['Prasetyo', 'Fullstack', 'Studio']);
    expect(splitSiteNameTokens('   ')).toEqual([]);
  });

  test('normalizes expertise and experience lists while preserving saved arrays', () => {
    expect(normalizeExpertiseItems(null, DEFAULT_SITE_SETTINGS.expertiseId)).toEqual(
      DEFAULT_SITE_SETTINGS.expertiseId,
    );
    expect(
      normalizeExpertiseItems(
        [
          { title: '  APIs  ', description: '  Fast APIs  ' },
          { title: '', description: '' },
        ],
        DEFAULT_SITE_SETTINGS.expertiseEn,
      ),
    ).toEqual([{ title: 'APIs', description: 'Fast APIs' }]);
    expect(normalizeExperienceItems('bad', DEFAULT_SITE_SETTINGS.experienceEn)).toEqual(
      DEFAULT_SITE_SETTINGS.experienceEn,
    );
    expect(
      normalizeExperienceItems(
        [
          {
            period: ' 2020 - 2024 ',
            role: ' Lead Engineer ',
            company: ' PT Tech ',
            logo: ' /uploads/2026-11/logo.png ',
            summary: ' Built core platform. ',
          },
          {
            period: ' 2018 - 2020 ',
            role: ' Freelance Developer ',
            logo: 'javascript:alert(1)',
            summary: ' Delivered client apps. ',
          },
        ],
        DEFAULT_SITE_SETTINGS.experienceId,
      ),
    ).toEqual([
      {
        period: '2020 - 2024',
        role: 'Lead Engineer',
        company: 'PT Tech',
        logo: '/uploads/2026-11/logo.png',
        summary: 'Built core platform.',
      },
      {
        period: '2018 - 2020',
        role: 'Freelance Developer',
        company: '',
        logo: '',
        summary: 'Delivered client apps.',
      },
    ]);
  });
});

describe('Freelance portfolio parser', () => {
  test('parses all 12 freelance entries from porto_tambahan_onlinenotepad.io.txt cleanly', () => {
    const entries = loadFreelanceEntries();
    expect(entries).toHaveLength(12);
    entries.forEach((entry, idx) => {
      expect(entry.sortOrder).toBe(idx + 1);
      expect(entry.title.length).toBeGreaterThan(2);
      expect(isValidSlug(entry.slug)).toBe(true);
      expect(entry.contribution.length).toBeGreaterThan(10);
      expect(entry.approach.length).toBeGreaterThan(10);
      expect(entry.impact.length).toBeGreaterThan(10);
      expect(entry.techStack.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('splits Fastify/Express, strips Teknologi: prefix and trailing periods, and ignores divider lines', () => {
    const sample = [
      '• Platform Pembelajaran Bahasa Jepang N5–N4',
      'Kontribusi: Mengembangkan aplikasi.',
      'Pendekatan: Menyusun materi.',
      'Dampak: Mengintegrasikan 30 modul.',
      'NodeJs, Fastify/Express, VueJs, SPA, Vuetify, PostgreSQL, Git.',
      '• Binomo Trading Bot — Analisis Candlestick dan Eksekusi Bid Otomatis',
      'Kontribusi: Mengembangkan bot.',
      'Pendekatan: Menyusun alur.',
      'Dampak: Mengurangi kebutuhan manual.',
      'Teknologi: Puppeteer, NodeJs.',
      '',
      '=========================================',
      '',
    ].join('\n');

    const parsed = parseFreelanceSourceText(sample);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].techStack).toEqual([
      'NodeJs',
      'Fastify',
      'Express',
      'VueJs',
      'SPA',
      'Vuetify',
      'PostgreSQL',
      'Git',
    ]);
    expect(parsed[1].techStack).toEqual(['Puppeteer', 'NodeJs']);
  });

  test('parses all 12 English freelance entries from portfolio_additional_projects_en.md in matching order', () => {
    const idEntries = loadFreelanceEntries();
    const enEntries = loadFreelanceEnEntries();
    expect(enEntries).toHaveLength(12);
    expect(enEntries.length).toBe(idEntries.length);

    expect(enEntries[0].title).toBe('SaaS WhatsApp Bot for SMEs');
    expect(enEntries[2].title).toBe('bebibon.com — Apparel Inventory and Procurement System');
    expect(enEntries[4].title).toBe('Japanese Learning Platform (JLPT N5–N4)');
    expect(enEntries[11].title).toBe('Binomo Trading Bot — Candlestick Analysis & Automated Bid Execution');

    enEntries.forEach((entry, idx) => {
      expect(entry.sortOrder).toBe(idx + 1);
      expect(isValidSlug(entry.slug)).toBe(true);
      expect(entry.contribution).not.toContain('\n');
      expect(entry.approach).not.toContain('\n');
      expect(entry.impact).not.toContain('\n');
      expect(entry.impact).not.toContain('Tech Stack');
      expect(entry.techStack.length).toBeGreaterThanOrEqual(2);
    });

    const sampleMd = [
      '# Additional Portfolio Projects',
      '',
      '## Test Project --- Demo',
      '',
      '**Contribution:** Built a wrapped',
      'multi-line tool.',
      '',
      '**Approach:** Kept stages N5--N4',
      'cleanly aligned.',
      '',
      '**Impact:** Cut time 50%---faster delivery.',
      '',
      '**Tech Stack:** Node.js, Fastify, React.js.',
    ].join('\n');
    const parsedSample = parseFreelanceEnMarkdown(sampleMd);
    expect(parsedSample).toHaveLength(1);
    expect(parsedSample[0].title).toBe('Test Project — Demo');
    expect(parsedSample[0].contribution).toBe('Built a wrapped multi-line tool.');
    expect(parsedSample[0].approach).toBe('Kept stages N5–N4 cleanly aligned.');
    expect(parsedSample[0].impact).toBe('Cut time 50%—faster delivery.');
    expect(parsedSample[0].techStack).toEqual(['Node.js', 'Fastify', 'React.js']);
  });
});

describe('Freelance service URL sanitization', () => {
  test('accepts empty or http/https URLs and rejects unsafe schemes', () => {
    expect(sanitizeOptionalUrl('')).toBeNull();
    expect(sanitizeOptionalUrl('  https://example.com/demo  ')).toBe('https://example.com/demo');
    expect(() => sanitizeOptionalUrl('javascript:alert(1)')).toThrow(FreelanceServiceError);
    expect(() => sanitizeOptionalUrl('data:text/html,hi')).toThrow(FreelanceServiceError);
    expect(() => sanitizeOptionalUrl('not-a-url')).toThrow(FreelanceServiceError);
  });
});

describe('Freelance UI translations', () => {
  test('provides complete freelance tab, ledger, and modal copy for id and en', () => {
    const requiredKeys = [
      'mainTabLabel',
      'freelanceTabLabel',
      'contributionLabel',
      'approachLabel',
      'impactLabel',
      'detailButton',
      'noFilterMatch',
      'closeModalLabel',
      'tabGroupLabel',
      'filterGroupLabel',
    ] as const;

    for (const loc of ['id', 'en'] as const) {
      const tr = getTranslations(loc);
      expect(tr.freelance).toBeDefined();
      for (const key of requiredKeys) {
        expect(tr.freelance[key].length).toBeGreaterThan(0);
      }
    }
  });
});
