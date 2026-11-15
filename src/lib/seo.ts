import type { Locale } from '../db/schema';
import { env } from './env';

export interface HreflangLink {
  locale: 'id' | 'en' | 'x-default';
  url: string;
}

export function buildAbsoluteUrl(pathname: string): string {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${env.SITE_URL}${cleanPath}`;
}

function filterProfileUrls(urls: string[]): string[] {
  return urls
    .map((raw) => raw.trim())
    .filter((raw) => {
      if (!raw) return false;
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        const path = parsed.pathname.replace(/\/+$/, '');
        // Exclude bare placeholder domain roots such as https://github.com/
        return path.length > 0;
      } catch {
        return false;
      }
    });
}

export function buildPersonJsonLd(params: {
  name: string;
  jobTitle: string;
  description: string;
  url: string;
  sameAs: string[];
  knowsAbout?: string[];
  image?: string | null;
}) {
  const knowsAbout = (params.knowsAbout || []).map((item) => item.trim()).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: params.name,
    jobTitle: params.jobTitle,
    description: params.description,
    url: params.url,
    ...(params.image ? { image: params.image.startsWith('http') ? params.image : buildAbsoluteUrl(params.image) } : {}),
    sameAs: filterProfileUrls(params.sameAs),
    ...(knowsAbout.length > 0 ? { knowsAbout } : {}),
  };
}

export function buildWebsiteJsonLd(params: {
  name: string;
  url: string;
  locale: Locale;
  description: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: params.name,
    url: params.url,
    inLanguage: params.locale === 'id' ? 'id-ID' : 'en-US',
    description: params.description,
  };
}

export function buildBlogPostingJsonLd(params: {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  publishedAt: Date;
  updatedAt: Date;
  authorName: string;
  locale: Locale;
  tags: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: params.title,
    description: params.description,
    url: params.url,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': params.url,
    },
    ...(params.image ? { image: [params.image.startsWith('http') ? params.image : buildAbsoluteUrl(params.image)] } : {}),
    datePublished: params.publishedAt.toISOString(),
    dateModified: params.updatedAt.toISOString(),
    author: {
      '@type': 'Person',
      name: params.authorName,
    },
    inLanguage: params.locale === 'id' ? 'id-ID' : 'en-US',
    keywords: params.tags.join(', '),
  };
}

export function buildProjectJsonLd(params: {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  publishedAt: Date;
  updatedAt: Date;
  authorName: string;
  locale: Locale;
  category: string;
  tags: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: params.title,
    headline: params.title,
    description: params.description,
    url: params.url,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': params.url,
    },
    ...(params.image ? { image: [params.image.startsWith('http') ? params.image : buildAbsoluteUrl(params.image)] } : {}),
    datePublished: params.publishedAt.toISOString(),
    dateModified: params.updatedAt.toISOString(),
    author: {
      '@type': 'Person',
      name: params.authorName,
    },
    inLanguage: params.locale === 'id' ? 'id-ID' : 'en-US',
    genre: params.category,
    keywords: params.tags.join(', '),
    about: params.tags.map((tag) => ({ '@type': 'Thing', name: tag })),
  };
}

export function buildCollectionPageJsonLd(params: {
  name: string;
  description: string;
  url: string;
  locale: Locale;
  items: Array<{ name: string; url: string }>;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: params.name,
    description: params.description,
    url: params.url,
    inLanguage: params.locale === 'id' ? 'id-ID' : 'en-US',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: params.items.map((item, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: item.name,
        url: item.url.startsWith('http') ? item.url : buildAbsoluteUrl(item.url),
      })),
    },
  };
}

export function buildBreadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : buildAbsoluteUrl(item.url),
    })),
  };
}
