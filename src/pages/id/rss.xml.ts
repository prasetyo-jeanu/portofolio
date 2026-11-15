import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getPublishedPostsByLocale } from '../../lib/content-queries';
import { env } from '../../lib/env';
import { getPostUrl } from '../../lib/i18n';
import { getSiteSettings } from '../../lib/settings';

export const prerender = true;

export const GET: APIRoute = async () => {
  const settings = await getSiteSettings();
  const posts = await getPublishedPostsByLocale('id');

  return rss({
    title: `${settings.siteName} — Blog Teknis (ID)`,
    description: settings.headlineId,
    site: env.SITE_URL,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.publishedAt,
      description: post.data.summary,
      link: getPostUrl('id', post.data.slug),
    })),
    customData: '<language>id-id</language>',
  });
};
