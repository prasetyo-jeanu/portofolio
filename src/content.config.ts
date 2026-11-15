import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blogCollection = defineCollection({
  loader: glob({
    pattern: '**/*.mdx',
    base: './.generated-content/blog',
    generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
  }),
  schema: z.object({
    postId: z.number(),
    locale: z.enum(['id', 'en']),
    title: z.string(),
    slug: z.string(),
    summary: z.string().default(''),
    category: z.string().default('engineering'),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().nullable().default(null),
    coverAlt: z.string().default(''),
    seoTitle: z.string().nullable().default(null),
    seoDescription: z.string().nullable().default(null),
    ogImageUrl: z.string().nullable().default(null),
    readingTimeMinutes: z.number().default(1),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    alternateSlug: z.string().nullable().default(null),
  }),
});

const projectsCollection = defineCollection({
  loader: glob({
    pattern: '**/*.mdx',
    base: './.generated-content/projects',
    generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
  }),
  schema: z.object({
    projectId: z.number(),
    locale: z.enum(['id', 'en']),
    title: z.string(),
    slug: z.string(),
    role: z.string().default(''),
    summary: z.string().default(''),
    category: z.string().default('fullstack'),
    featured: z.boolean().default(false),
    isConfidential: z.boolean().default(false),
    demoUrl: z.string().nullable().default(null),
    repoUrl: z.string().nullable().default(null),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().nullable().default(null),
    coverAlt: z.string().default(''),
    gallery: z
      .array(
        z.object({
          url: z.string(),
          alt: z.string().default(''),
          caption: z.string().optional(),
        }),
      )
      .default([]),
    sortOrder: z.number().default(0),
    seoTitle: z.string().nullable().default(null),
    seoDescription: z.string().nullable().default(null),
    ogImageUrl: z.string().nullable().default(null),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    alternateSlug: z.string().nullable().default(null),
  }),
});

export const collections = {
  blog: blogCollection,
  projects: projectsCollection,
};
