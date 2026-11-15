import {
  sqliteTable,
  integer,
  text,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId), index('sessions_expires_at_idx').on(table.expiresAt)],
);

export const media = sqliteTable(
  'media',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    filename: text('filename').notNull(),
    storagePath: text('storage_path').notNull().unique(),
    publicUrl: text('public_url').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    altId: text('alt_id').notNull().default(''),
    altEn: text('alt_en').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('media_created_at_idx').on(table.createdAt)],
);

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    category: text('category').notNull().default('engineering'),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    coverMediaId: integer('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('posts_deleted_at_idx').on(table.deletedAt)],
);

export const postTranslations = sqliteTable(
  'post_translations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    locale: text('locale', { enum: ['id', 'en'] }).notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    summary: text('summary').notNull().default(''),
    contentMdx: text('content_mdx').notNull().default(''),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    ogImageUrl: text('og_image_url'),
    status: text('status', { enum: ['draft', 'published', 'archived'] })
      .notNull()
      .default('draft'),
    readingTimeMinutes: integer('reading_time_minutes').notNull().default(1),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('post_translations_post_locale_uq').on(table.postId, table.locale),
    uniqueIndex('post_translations_locale_slug_uq').on(table.locale, table.slug),
    index('post_translations_locale_status_pub_idx').on(table.locale, table.status, table.publishedAt),
  ],
);

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    category: text('category').notNull().default('fullstack'),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    isConfidential: integer('is_confidential', { mode: 'boolean' }).notNull().default(false),
    demoUrl: text('demo_url'),
    repoUrl: text('repo_url'),
    coverMediaId: integer('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    galleryJson: text('gallery_json').notNull().default('[]'),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('projects_featured_sort_idx').on(table.featured, table.sortOrder),
    index('projects_deleted_at_idx').on(table.deletedAt),
  ],
);

export const projectTranslations = sqliteTable(
  'project_translations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    locale: text('locale', { enum: ['id', 'en'] }).notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    role: text('role').notNull().default(''),
    summary: text('summary').notNull().default(''),
    contentMdx: text('content_mdx').notNull().default(''),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    ogImageUrl: text('og_image_url'),
    status: text('status', { enum: ['draft', 'published', 'archived'] })
      .notNull()
      .default('draft'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('project_translations_project_locale_uq').on(table.projectId, table.locale),
    uniqueIndex('project_translations_locale_slug_uq').on(table.locale, table.slug),
    index('project_translations_locale_status_pub_idx').on(table.locale, table.status, table.publishedAt),
  ],
);

export const freelanceProjects = sqliteTable(
  'freelance_projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    category: text('category').notNull().default('freelance'),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    isConfidential: integer('is_confidential', { mode: 'boolean' }).notNull().default(false),
    demoUrl: text('demo_url'),
    repoUrl: text('repo_url'),
    coverMediaId: integer('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    techStackJson: text('tech_stack_json').notNull().default('[]'),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('freelance_projects_featured_sort_idx').on(table.featured, table.sortOrder),
    index('freelance_projects_deleted_at_idx').on(table.deletedAt),
  ],
);

export const freelanceProjectTranslations = sqliteTable(
  'freelance_project_translations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    freelanceProjectId: integer('freelance_project_id')
      .notNull()
      .references(() => freelanceProjects.id, { onDelete: 'cascade' }),
    locale: text('locale', { enum: ['id', 'en'] }).notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    summary: text('summary').notNull().default(''),
    contribution: text('contribution').notNull().default(''),
    approach: text('approach').notNull().default(''),
    impact: text('impact').notNull().default(''),
    status: text('status', { enum: ['draft', 'published', 'archived'] })
      .notNull()
      .default('published'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('freelance_translations_project_locale_uq').on(table.freelanceProjectId, table.locale),
    uniqueIndex('freelance_translations_locale_slug_uq').on(table.locale, table.slug),
    index('freelance_translations_locale_status_pub_idx').on(table.locale, table.status, table.publishedAt),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    kind: text('kind', { enum: ['topic', 'tech'] }).notNull().default('topic'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('tags_kind_idx').on(table.kind)],
);

export const postTags = sqliteTable(
  'post_tags',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
);

export const projectTags = sqliteTable(
  'project_tags',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.tagId] })],
);

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const publishingJobs = sqliteTable(
  'publishing_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    status: text('status', { enum: ['running', 'success', 'failed', 'rolled_back'] }).notNull(),
    triggerSource: text('trigger_source').notNull().default('admin'),
    triggeredByUserId: integer('triggered_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    summary: text('summary'),
    logs: text('logs').notNull().default(''),
    errorMessage: text('error_message'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('publishing_jobs_status_started_idx').on(table.status, table.startedAt)],
);

export const urlRedirects = sqliteTable(
  'url_redirects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    locale: text('locale', { enum: ['id', 'en'] }).notNull(),
    contentType: text('content_type', { enum: ['post', 'project'] }).notNull(),
    fromPath: text('from_path').notNull().unique(),
    toPath: text('to_path').notNull(),
    statusCode: integer('status_code').notNull().default(301),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('url_redirects_locale_idx').on(table.locale)],
);

export type Locale = 'id' | 'en';
export type ContentStatus = 'draft' | 'published' | 'archived';
