import {
  mysqlTable,
  int,
  varchar,
  text,
  mediumtext,
  boolean,
  datetime,
  primaryKey,
  uniqueIndex,
  index,
  mysqlEnum,
} from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
});

export const sessions = mysqlTable(
  'sessions',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId), index('sessions_expires_at_idx').on(table.expiresAt)],
);

export const media = mysqlTable(
  'media',
  {
    id: int('id').autoincrement().primaryKey(),
    filename: varchar('filename', { length: 255 }).notNull(),
    storagePath: varchar('storage_path', { length: 255 }).notNull().unique(),
    publicUrl: varchar('public_url', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    sizeBytes: int('size_bytes').notNull(),
    width: int('width'),
    height: int('height'),
    altId: varchar('alt_id', { length: 512 }).notNull().default(''),
    altEn: varchar('alt_en', { length: 512 }).notNull().default(''),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [index('media_created_at_idx').on(table.createdAt)],
);

export const posts = mysqlTable(
  'posts',
  {
    id: int('id').autoincrement().primaryKey(),
    category: varchar('category', { length: 64 }).notNull().default('engineering'),
    featured: boolean('featured').notNull().default(false),
    coverMediaId: int('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    deletedAt: datetime('deleted_at', { mode: 'date', fsp: 3 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [index('posts_deleted_at_idx').on(table.deletedAt)],
);

export const postTranslations = mysqlTable(
  'post_translations',
  {
    id: int('id').autoincrement().primaryKey(),
    postId: int('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    locale: mysqlEnum('locale', ['id', 'en']).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    summary: text('summary').notNull(),
    contentMdx: mediumtext('content_mdx').notNull(),
    seoTitle: varchar('seo_title', { length: 255 }),
    seoDescription: text('seo_description'),
    ogImageUrl: varchar('og_image_url', { length: 512 }),
    status: mysqlEnum('status', ['draft', 'published', 'archived'])
      .notNull()
      .default('draft'),
    readingTimeMinutes: int('reading_time_minutes').notNull().default(1),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('post_translations_post_locale_uq').on(table.postId, table.locale),
    uniqueIndex('post_translations_locale_slug_uq').on(table.locale, table.slug),
    index('post_translations_locale_status_pub_idx').on(table.locale, table.status, table.publishedAt),
  ],
);

export const projects = mysqlTable(
  'projects',
  {
    id: int('id').autoincrement().primaryKey(),
    category: varchar('category', { length: 64 }).notNull().default('fullstack'),
    featured: boolean('featured').notNull().default(false),
    isConfidential: boolean('is_confidential').notNull().default(false),
    demoUrl: varchar('demo_url', { length: 512 }),
    repoUrl: varchar('repo_url', { length: 512 }),
    coverMediaId: int('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    galleryJson: text('gallery_json').notNull(),
    sortOrder: int('sort_order').notNull().default(0),
    deletedAt: datetime('deleted_at', { mode: 'date', fsp: 3 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [
    index('projects_featured_sort_idx').on(table.featured, table.sortOrder),
    index('projects_deleted_at_idx').on(table.deletedAt),
  ],
);

export const projectTranslations = mysqlTable(
  'project_translations',
  {
    id: int('id').autoincrement().primaryKey(),
    projectId: int('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    locale: mysqlEnum('locale', ['id', 'en']).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    role: varchar('role', { length: 255 }).notNull().default(''),
    summary: text('summary').notNull(),
    contentMdx: mediumtext('content_mdx').notNull(),
    seoTitle: varchar('seo_title', { length: 255 }),
    seoDescription: text('seo_description'),
    ogImageUrl: varchar('og_image_url', { length: 512 }),
    status: mysqlEnum('status', ['draft', 'published', 'archived'])
      .notNull()
      .default('draft'),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('project_translations_project_locale_uq').on(table.projectId, table.locale),
    uniqueIndex('project_translations_locale_slug_uq').on(table.locale, table.slug),
    index('project_translations_locale_status_pub_idx').on(table.locale, table.status, table.publishedAt),
  ],
);

export const freelanceProjects = mysqlTable(
  'freelance_projects',
  {
    id: int('id').autoincrement().primaryKey(),
    category: varchar('category', { length: 64 }).notNull().default('freelance'),
    featured: boolean('featured').notNull().default(false),
    isConfidential: boolean('is_confidential').notNull().default(false),
    demoUrl: varchar('demo_url', { length: 512 }),
    repoUrl: varchar('repo_url', { length: 512 }),
    coverMediaId: int('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    techStackJson: text('tech_stack_json').notNull(),
    sortOrder: int('sort_order').notNull().default(0),
    deletedAt: datetime('deleted_at', { mode: 'date', fsp: 3 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [
    index('freelance_projects_featured_sort_idx').on(table.featured, table.sortOrder),
    index('freelance_projects_deleted_at_idx').on(table.deletedAt),
  ],
);

export const freelanceProjectTranslations = mysqlTable(
  'freelance_project_translations',
  {
    id: int('id').autoincrement().primaryKey(),
    freelanceProjectId: int('freelance_project_id')
      .notNull()
      .references(() => freelanceProjects.id, { onDelete: 'cascade' }),
    locale: mysqlEnum('locale', ['id', 'en']).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    summary: text('summary').notNull(),
    contribution: text('contribution').notNull(),
    approach: text('approach').notNull(),
    impact: text('impact').notNull(),
    status: mysqlEnum('status', ['draft', 'published', 'archived'])
      .notNull()
      .default('published'),
    publishedAt: datetime('published_at', { mode: 'date', fsp: 3 }),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('freelance_translations_project_locale_uq').on(table.freelanceProjectId, table.locale),
    uniqueIndex('freelance_translations_locale_slug_uq').on(table.locale, table.slug),
    index('freelance_translations_locale_status_pub_idx').on(table.locale, table.status, table.publishedAt),
  ],
);

export const tags = mysqlTable(
  'tags',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    kind: mysqlEnum('kind', ['topic', 'tech']).notNull().default('topic'),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [index('tags_kind_idx').on(table.kind)],
);

export const postTags = mysqlTable(
  'post_tags',
  {
    postId: int('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tagId: int('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
);

export const projectTags = mysqlTable(
  'project_tags',
  {
    projectId: int('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tagId: int('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.tagId] })],
);

export const siteSettings = mysqlTable('site_settings', {
  key: varchar('key', { length: 191 }).primaryKey(),
  value: mediumtext('value').notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
});

export const publishingJobs = mysqlTable(
  'publishing_jobs',
  {
    id: int('id').autoincrement().primaryKey(),
    status: mysqlEnum('status', ['running', 'success', 'failed', 'rolled_back']).notNull(),
    triggerSource: varchar('trigger_source', { length: 64 }).notNull().default('admin'),
    triggeredByUserId: int('triggered_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    summary: text('summary'),
    logs: mediumtext('logs').notNull(),
    errorMessage: text('error_message'),
    startedAt: datetime('started_at', { mode: 'date', fsp: 3 }).notNull(),
    finishedAt: datetime('finished_at', { mode: 'date', fsp: 3 }),
  },
  (table) => [index('publishing_jobs_status_started_idx').on(table.status, table.startedAt)],
);

export const urlRedirects = mysqlTable(
  'url_redirects',
  {
    id: int('id').autoincrement().primaryKey(),
    locale: mysqlEnum('locale', ['id', 'en']).notNull(),
    contentType: mysqlEnum('content_type', ['post', 'project']).notNull(),
    fromPath: varchar('from_path', { length: 255 }).notNull().unique(),
    toPath: varchar('to_path', { length: 255 }).notNull(),
    statusCode: int('status_code').notNull().default(301),
    createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  },
  (table) => [index('url_redirects_locale_idx').on(table.locale)],
);

export type Locale = 'id' | 'en';
export type ContentStatus = 'draft' | 'published' | 'archived';
