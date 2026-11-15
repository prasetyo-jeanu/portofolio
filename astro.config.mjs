import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: process.env.SITE_URL || 'http://localhost:4321',
  output: 'server',
  outDir: process.env.ASTRO_OUT_DIR || './dist',
  adapter: node({
    mode: 'middleware',
  }),
  i18n: {
    defaultLocale: 'en',
    locales: ['id', 'en'],
    routing: 'manual',
  },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname.replace(/\/+$/, '') || '/';
        const excludedExactPaths = new Set([
          '/en',
          '/id/proyek',
          '/en/projects',
        ]);
        if (excludedExactPaths.has(pathname)) return false;

        const excludedPrefixes = [
          '/admin',
          '/api',
          '/id/tentang',
          '/en/about',
          '/id/kontak',
          '/en/contact',
          '/id/cari',
          '/en/search',
        ];
        return !excludedPrefixes.some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
        );
      },
      i18n: {
        defaultLocale: 'en',
        locales: {
          id: 'id-ID',
          en: 'en-US',
        },
      },
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark-default',
      },
    },
  },
  security: {
    checkOrigin: true,
  },
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      external: ['bun:sqlite'],
    },
    optimizeDeps: {
      exclude: ['bun:sqlite'],
    },
  },
});
