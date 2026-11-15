import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getPublishedPostsByLocale } from '../../lib/content-queries';
import { env } from '../../lib/env';
import { getPostUrl } from '../../lib/i18n';
import { getSiteSettings } from '../../lib/settings';

export const prerender = true;

export const GET: APIRoute = async () => {
  const settings = await getSiteSettings();
  const posts = await getPublishedPostsByLocale('en');

  return rss({
    title: `${settings.siteName} — Technical Blog (EN)`,
    description: settings.headlineEn,
    site: env.SITE_URL,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.publishedAt,
      description: post.data.summary,
      link: getPostUrl('en', post.data.slug),
    })),
    customData: '<language>en-us</language>',
  });
};
