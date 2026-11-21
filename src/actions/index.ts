import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db';
import {
  media,
  posts,
  postTags,
  postTranslations,
  projects,
  projectTags,
  projectTranslations,
  tags,
  urlRedirects,
  users,
} from '../db/schema';
import {
  checkLoginRateLimit,
  clearLoginFailures,
  clearSessionCookie,
  createSession,
  getClientIp,
  recordLoginFailure,
  revokeSessionToken,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  verifyPassword,
} from '../lib/auth';
import { getLocalizedSectionPath, getPostUrl, getProjectUrl } from '../lib/i18n';
import { removeUploadedFile } from '../lib/media';
import { renderSafeMdxPreview } from '../lib/mdx/preview';
import { estimateReadingTimeMinutes, validateRestrictedMdx } from '../lib/mdx/validator';
import { rollbackLastPublish, runPublishPipeline } from '../lib/publish';
import {
  archiveFreelanceProjectRecord,
  FreelanceServiceError,
  reorderFreelanceProjectRecords,
  saveFreelanceInputSchema,
  saveFreelanceProjectRecord,
  toggleFreelanceFeaturedRecord,
} from '../lib/freelance-service';
import { saveSiteSettings } from '../lib/settings';
import { isValidSlug, slugify } from '../lib/slug';

function requireAdmin(context: { locals: App.Locals }) {
  if (!context.locals.user) {
    throw new ActionError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required.',
    });
  }
  return context.locals.user;
}

async function syncTags(
  kind: 'topic' | 'tech',
  rawTagNames: string[],
): Promise<number[]> {
  const cleaned = Array.from(
    new Set(
      rawTagNames
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 48),
    ),
  );
  const tagIds: number[] = [];
  const now = new Date();

  for (const name of cleaned) {
    const tagSlug = slugify(name);
    if (!tagSlug) continue;
    const existing = await db.select().from(tags).where(eq(tags.slug, tagSlug)).limit(1);
    if (existing.length > 0) {
      tagIds.push(existing[0].id);
    } else {
      const [result] = await db
        .insert(tags)
        .values({ name, slug: tagSlug, kind, createdAt: now });
      tagIds.push(result.insertId);
    }
  }
  return tagIds;
}

const translationInputSchema = z.object({
  title: z.string().trim().max(200).optional().default(''),
  slug: z.string().trim().max(140).optional().default(''),
  summary: z.string().trim().max(500).optional().default(''),
  contentMdx: z.string().max(200000).optional().default(''),
  seoTitle: z.string().trim().max(160).optional().default(''),
  seoDescription: z.string().trim().max(320).optional().default(''),
  ogImageUrl: z.string().trim().max(300).optional().default(''),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});

const projectTranslationInputSchema = translationInputSchema.extend({
  role: z.string().trim().max(160).optional().default(''),
});

export const server = {
  login: defineAction({
    accept: 'form',
    input: z.object({
      email: z.string().trim().email(),
      password: z.string().min(1),
    }),
    handler: async (input, context) => {
      const ip = getClientIp(context.request);
      const limit = checkLoginRateLimit(ip);
      if (!limit.allowed) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many login attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
        });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .limit(1);

      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        recordLoginFailure(ip);
        throw new ActionError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password.',
        });
      }

      clearLoginFailures(ip);
      const { rawToken, expiresAt } = await createSession(
        user.id,
        ip,
        context.request.headers.get('user-agent'),
      );
      setSessionCookie(context.cookies, rawToken, expiresAt);

      return { success: true };
    },
  }),

  logout: defineAction({
    accept: 'form',
    handler: async (_input, context) => {
      const rawToken = context.cookies.get(SESSION_COOKIE_NAME)?.value;
      await revokeSessionToken(rawToken);
      clearSessionCookie(context.cookies);
      return { success: true };
    },
  }),

  previewMdx: defineAction({
    accept: 'json',
    input: z.object({
      contentMdx: z.string().max(200000),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      const result = await renderSafeMdxPreview(input.contentMdx);
      return result;
    },
  }),

  savePost: defineAction({
    accept: 'json',
    input: z.object({
      id: z.number().int().positive().nullable().optional(),
      category: z.string().trim().min(1).max(60).default('engineering'),
      featured: z.boolean().default(false),
      coverMediaId: z.number().int().positive().nullable().optional(),
      tags: z.array(z.string()).default([]),
      translations: z.object({
        id: translationInputSchema,
        en: translationInputSchema,
      }),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      const now = new Date();

      const locales = ['id', 'en'] as const;
      const activeLocales = locales.filter((loc) => input.translations[loc].title.trim().length > 0);
      if (activeLocales.length === 0) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'At least one language translation (Indonesian or English) must have a title.',
        });
      }

      // Validate MDX and slugs for active translations
      const prepared = new Map<'id' | 'en', {
        title: string;
        slug: string;
        summary: string;
        contentMdx: string;
        seoTitle: string | null;
        seoDescription: string | null;
        ogImageUrl: string | null;
        status: 'draft' | 'published' | 'archived';
        readingTimeMinutes: number;
      }>();

      for (const loc of activeLocales) {
        const t = input.translations[loc];
        const finalSlug = slugify(t.slug || t.title);
        if (!isValidSlug(finalSlug)) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `Invalid slug for ${loc.toUpperCase()}: "${finalSlug}". Use 2-120 lowercase alphanumeric characters and hyphens.`,
          });
        }
        const mdxValidation = validateRestrictedMdx(t.contentMdx);
        if (!mdxValidation.valid) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `MDX security validation failed (${loc.toUpperCase()}): ${mdxValidation.errors.join(' ')}`,
          });
        }

        // Check slug uniqueness across other posts
        const existingSlug = await db
          .select()
          .from(postTranslations)
          .where(
            input.id
              ? and(
                  eq(postTranslations.locale, loc),
                  eq(postTranslations.slug, finalSlug),
                  ne(postTranslations.postId, input.id),
                )
              : and(eq(postTranslations.locale, loc), eq(postTranslations.slug, finalSlug)),
          )
          .limit(1);

        if (existingSlug.length > 0) {
          throw new ActionError({
            code: 'CONFLICT',
            message: `Slug "${finalSlug}" is already used by another ${loc.toUpperCase()} post.`,
          });
        }

        prepared.set(loc, {
          title: t.title.trim(),
          slug: finalSlug,
          summary: t.summary.trim(),
          contentMdx: t.contentMdx,
          seoTitle: t.seoTitle.trim() || null,
          seoDescription: t.seoDescription.trim() || null,
          ogImageUrl: t.ogImageUrl.trim() || null,
          status: t.status,
          readingTimeMinutes: estimateReadingTimeMinutes(t.contentMdx),
        });
      }

      let postId = input.id || null;

      if (!postId) {
        const [result] = await db
          .insert(posts)
          .values({
            category: input.category,
            featured: input.featured,
            coverMediaId: input.coverMediaId ?? null,
            createdAt: now,
            updatedAt: now,
          });
        postId = result.insertId;
      } else {
        await db
          .update(posts)
          .set({
            category: input.category,
            featured: input.featured,
            coverMediaId: input.coverMediaId ?? null,
            updatedAt: now,
          })
          .where(eq(posts.id, postId));
      }

      // Upsert translations & record automatic 301 redirect if published slug changed
      for (const [loc, data] of prepared.entries()) {
        const existing = await db
          .select()
          .from(postTranslations)
          .where(and(eq(postTranslations.postId, postId), eq(postTranslations.locale, loc)))
          .limit(1);

        if (existing.length > 0) {
          const prev = existing[0];
          if (prev.status === 'published' && prev.slug !== data.slug) {
            const fromPath = getPostUrl(loc, prev.slug);
            const toPath = getPostUrl(loc, data.slug);
            await db
              .insert(urlRedirects)
              .values({
                locale: loc,
                contentType: 'post',
                fromPath,
                toPath,
                statusCode: 301,
                createdAt: now,
              })
              .onDuplicateKeyUpdate({
                set: { toPath },
              });
          }

          await db
            .update(postTranslations)
            .set({
              title: data.title,
              slug: data.slug,
              summary: data.summary,
              contentMdx: data.contentMdx,
              seoTitle: data.seoTitle,
              seoDescription: data.seoDescription,
              ogImageUrl: data.ogImageUrl,
              status: data.status,
              readingTimeMinutes: data.readingTimeMinutes,
              publishedAt:
                data.status === 'published'
                  ? prev.publishedAt || now
                  : prev.publishedAt,
              updatedAt: now,
            })
            .where(eq(postTranslations.id, prev.id));
        } else {
          await db.insert(postTranslations).values({
            postId,
            locale: loc,
            title: data.title,
            slug: data.slug,
            summary: data.summary,
            contentMdx: data.contentMdx,
            seoTitle: data.seoTitle,
            seoDescription: data.seoDescription,
            ogImageUrl: data.ogImageUrl,
            status: data.status,
            readingTimeMinutes: data.readingTimeMinutes,
            publishedAt: data.status === 'published' ? now : null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      // Sync tags
      const tagIds = await syncTags('topic', input.tags);
      await db.delete(postTags).where(eq(postTags.postId, postId));
      if (tagIds.length > 0) {
        await db.insert(postTags).values(tagIds.map((tagId) => ({ postId: postId!, tagId })));
      }

      return { success: true, postId };
    },
  }),

  deletePost: defineAction({
    accept: 'json',
    input: z.object({ id: z.number().int().positive() }),
    handler: async (input, context) => {
      requireAdmin(context);
      const now = new Date();
      await db
        .update(posts)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(posts.id, input.id));
      await db
        .update(postTranslations)
        .set({ status: 'archived', updatedAt: now })
        .where(eq(postTranslations.postId, input.id));
      return { success: true };
    },
  }),

  saveProject: defineAction({
    accept: 'json',
    input: z.object({
      id: z.number().int().positive().nullable().optional(),
      category: z.string().trim().min(1).max(60).default('fullstack'),
      featured: z.boolean().default(false),
      isConfidential: z.boolean().default(false),
      demoUrl: z.string().trim().max(300).optional().default(''),
      repoUrl: z.string().trim().max(300).optional().default(''),
      coverMediaId: z.number().int().positive().nullable().optional(),
      gallery: z
        .array(
          z.object({
            url: z.string().trim().min(1),
            alt: z.string().trim().default(''),
            caption: z.string().trim().optional(),
          }),
        )
        .default([]),
      sortOrder: z.number().int().default(0),
      tags: z.array(z.string()).default([]),
      translations: z.object({
        id: projectTranslationInputSchema,
        en: projectTranslationInputSchema,
      }),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      const now = new Date();

      const locales = ['id', 'en'] as const;
      const activeLocales = locales.filter((loc) => input.translations[loc].title.trim().length > 0);
      if (activeLocales.length === 0) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'At least one language translation must have a title.',
        });
      }

      const prepared = new Map<'id' | 'en', {
        title: string;
        slug: string;
        role: string;
        summary: string;
        contentMdx: string;
        seoTitle: string | null;
        seoDescription: string | null;
        ogImageUrl: string | null;
        status: 'draft' | 'published' | 'archived';
      }>();

      for (const loc of activeLocales) {
        const t = input.translations[loc];
        const finalSlug = slugify(t.slug || t.title);
        if (!isValidSlug(finalSlug)) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `Invalid slug for ${loc.toUpperCase()}: "${finalSlug}".`,
          });
        }
        const mdxValidation = validateRestrictedMdx(t.contentMdx);
        if (!mdxValidation.valid) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `MDX security validation failed (${loc.toUpperCase()}): ${mdxValidation.errors.join(' ')}`,
          });
        }

        const existingSlug = await db
          .select()
          .from(projectTranslations)
          .where(
            input.id
              ? and(
                  eq(projectTranslations.locale, loc),
                  eq(projectTranslations.slug, finalSlug),
                  ne(projectTranslations.projectId, input.id),
                )
              : and(eq(projectTranslations.locale, loc), eq(projectTranslations.slug, finalSlug)),
          )
          .limit(1);

        if (existingSlug.length > 0) {
          throw new ActionError({
            code: 'CONFLICT',
            message: `Slug "${finalSlug}" is already used by another ${loc.toUpperCase()} project.`,
          });
        }

        prepared.set(loc, {
          title: t.title.trim(),
          slug: finalSlug,
          role: t.role.trim(),
          summary: t.summary.trim(),
          contentMdx: t.contentMdx,
          seoTitle: t.seoTitle.trim() || null,
          seoDescription: t.seoDescription.trim() || null,
          ogImageUrl: t.ogImageUrl.trim() || null,
          status: t.status,
        });
      }

      let projectId = input.id || null;
      const galleryJson = JSON.stringify(input.gallery);

      if (!projectId) {
        const [result] = await db
          .insert(projects)
          .values({
            category: input.category,
            featured: input.featured,
            isConfidential: input.isConfidential,
            demoUrl: input.demoUrl || null,
            repoUrl: input.isConfidential ? null : input.repoUrl || null,
            coverMediaId: input.coverMediaId ?? null,
            galleryJson,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          });
        projectId = result.insertId;
      } else {
        await db
          .update(projects)
          .set({
            category: input.category,
            featured: input.featured,
            isConfidential: input.isConfidential,
            demoUrl: input.demoUrl || null,
            repoUrl: input.isConfidential ? null : input.repoUrl || null,
            coverMediaId: input.coverMediaId ?? null,
            galleryJson,
            sortOrder: input.sortOrder,
            updatedAt: now,
          })
          .where(eq(projects.id, projectId));
      }

      for (const [loc, data] of prepared.entries()) {
        const existing = await db
          .select()
          .from(projectTranslations)
          .where(and(eq(projectTranslations.projectId, projectId), eq(projectTranslations.locale, loc)))
          .limit(1);

        if (existing.length > 0) {
          const prev = existing[0];
          if (prev.status === 'published' && prev.slug !== data.slug) {
            const fromPath = getProjectUrl(loc, prev.slug);
            const toPath = getProjectUrl(loc, data.slug);
            await db
              .insert(urlRedirects)
              .values({
                locale: loc,
                contentType: 'project',
                fromPath,
                toPath,
                statusCode: 301,
                createdAt: now,
              })
              .onDuplicateKeyUpdate({
                set: { toPath },
              });
          }

          await db
            .update(projectTranslations)
            .set({
              title: data.title,
              slug: data.slug,
              role: data.role,
              summary: data.summary,
              contentMdx: data.contentMdx,
              seoTitle: data.seoTitle,
              seoDescription: data.seoDescription,
              ogImageUrl: data.ogImageUrl,
              status: data.status,
              publishedAt:
                data.status === 'published'
                  ? prev.publishedAt || now
                  : prev.publishedAt,
              updatedAt: now,
            })
            .where(eq(projectTranslations.id, prev.id));
        } else {
          await db.insert(projectTranslations).values({
            projectId,
            locale: loc,
            title: data.title,
            slug: data.slug,
            role: data.role,
            summary: data.summary,
            contentMdx: data.contentMdx,
            seoTitle: data.seoTitle,
            seoDescription: data.seoDescription,
            ogImageUrl: data.ogImageUrl,
            status: data.status,
            publishedAt: data.status === 'published' ? now : null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const tagIds = await syncTags('tech', input.tags);
      await db.delete(projectTags).where(eq(projectTags.projectId, projectId));
      if (tagIds.length > 0) {
        await db.insert(projectTags).values(tagIds.map((tagId) => ({ projectId: projectId!, tagId })));
      }

      return { success: true, projectId };
    },
  }),

  deleteProject: defineAction({
    accept: 'json',
    input: z.object({ id: z.number().int().positive() }),
    handler: async (input, context) => {
      requireAdmin(context);
      const now = new Date();
      await db
        .update(projects)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(projects.id, input.id));
      await db
        .update(projectTranslations)
        .set({ status: 'archived', updatedAt: now })
        .where(eq(projectTranslations.projectId, input.id));
      return { success: true };
    },
  }),

  toggleProjectFeatured: defineAction({
    accept: 'json',
    input: z.object({
      id: z.number().int().positive(),
      featured: z.boolean(),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      const now = new Date();
      const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, input.id)).limit(1);
      if (!existing) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Project not found.' });
      }
      await db
        .update(projects)
        .set({ featured: input.featured, updatedAt: now })
        .where(eq(projects.id, input.id));
      return { success: true, featured: input.featured };
    },
  }),

  reorderProjects: defineAction({
    accept: 'json',
    input: z.object({
      orderedIds: z.array(z.number().int().positive()).min(1).max(500),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      const now = new Date();
      const uniqueIds = Array.from(new Set(input.orderedIds));
      await db.transaction(async (tx) => {
        for (let i = 0; i < uniqueIds.length; i++) {
          await tx
            .update(projects)
            .set({ sortOrder: i + 1, updatedAt: now })
            .where(eq(projects.id, uniqueIds[i]));
        }
      });
      return { success: true };
    },
  }),

  saveFreelanceProject: defineAction({
    accept: 'json',
    input: saveFreelanceInputSchema,
    handler: async (input, context) => {
      requireAdmin(context);
      try {
        const result = await saveFreelanceProjectRecord(db, input);
        return { success: true, ...result };
      } catch (err) {
        if (err instanceof FreelanceServiceError) {
          throw new ActionError({ code: err.code, message: err.message });
        }
        throw err;
      }
    },
  }),

  deleteFreelanceProject: defineAction({
    accept: 'json',
    input: z.object({ id: z.number().int().positive() }),
    handler: async (input, context) => {
      requireAdmin(context);
      await archiveFreelanceProjectRecord(db, input.id);
      return { success: true };
    },
  }),

  toggleFreelanceFeatured: defineAction({
    accept: 'json',
    input: z.object({
      id: z.number().int().positive(),
      featured: z.boolean(),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      try {
        const result = await toggleFreelanceFeaturedRecord(db, input.id, input.featured);
        return { success: true, ...result };
      } catch (err) {
        if (err instanceof FreelanceServiceError) {
          throw new ActionError({ code: err.code, message: err.message });
        }
        throw err;
      }
    },
  }),

  reorderFreelanceProjects: defineAction({
    accept: 'json',
    input: z.object({
      orderedIds: z.array(z.number().int().positive()).min(1).max(500),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      await reorderFreelanceProjectRecords(db, input.orderedIds);
      return { success: true };
    },
  }),

  updateMediaAlt: defineAction({
    accept: 'json',
    input: z.object({
      id: z.number().int().positive(),
      altId: z.string().trim().max(240),
      altEn: z.string().trim().max(240),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      await db
        .update(media)
        .set({ altId: input.altId, altEn: input.altEn })
        .where(eq(media.id, input.id));
      return { success: true };
    },
  }),

  deleteMedia: defineAction({
    accept: 'json',
    input: z.object({ id: z.number().int().positive() }),
    handler: async (input, context) => {
      requireAdmin(context);
      const [row] = await db.select().from(media).where(eq(media.id, input.id)).limit(1);
      if (!row) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Media record not found.' });
      }
      removeUploadedFile(row.storagePath);
      await db.delete(media).where(eq(media.id, input.id));
      return { success: true };
    },
  }),

  updateSettings: defineAction({
    accept: 'json',
    input: z.object({
      siteName: z.string().trim().min(1).max(160),
      developerName: z.string().trim().min(1).max(160),
      headlineId: z.string().trim().min(1).max(2000),
      headlineEn: z.string().trim().min(1).max(2000),
      heroHeadlinesId: z.array(z.string().trim().min(1).max(1000)).min(1),
      heroHeadlinesEn: z.array(z.string().trim().min(1).max(1000)).min(1),
      introId: z.string().trim().min(1).max(3000),
      introEn: z.string().trim().min(1).max(3000),
      aboutBackgroundId: z.string().trim().max(10000),
      aboutBackgroundEn: z.string().trim().max(10000),
      aboutPhilosophyId: z.string().trim().max(10000),
      aboutPhilosophyEn: z.string().trim().max(10000),
      email: z.string().trim().email().max(160),
      githubUrl: z.string().trim().max(500),
      gitlabUrl: z.string().trim().max(500),
      linkedinUrl: z.string().trim().max(500),
      xUrl: z.string().trim().max(500),
      coreStack: z.array(z.string().trim().min(1).max(80)),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      await saveSiteSettings(input);
      return { success: true };
    },
  }),

  updateExpertise: defineAction({
    accept: 'json',
    input: (() => {
      const itemSchema = z.object({
        title: z.string().trim().min(1).max(300),
        description: z.string().trim().min(1).max(3000),
      });
      return z.object({
        expertiseId: z.array(itemSchema),
        expertiseEn: z.array(itemSchema),
      });
    })(),
    handler: async (input, context) => {
      requireAdmin(context);
      await saveSiteSettings(input);
      return { success: true };
    },
  }),

  updateExperience: defineAction({
    accept: 'json',
    input: (() => {
      const itemSchema = z.object({
        period: z.string().trim().min(1).max(160),
        role: z.string().trim().min(1).max(300),
        company: z.string().trim().max(300).optional().default(''),
        logo: z
          .string()
          .trim()
          .max(500)
          .optional()
          .default('')
          .refine(
            (val) => val === '' || (val.startsWith('/') && !val.startsWith('//')) || /^https?:\/\//i.test(val),
            'Logo URL must start with /, http://, or https://.',
          ),
        summary: z.string().trim().min(1).max(5000),
      });
      return z.object({
        experienceId: z.array(itemSchema),
        experienceEn: z.array(itemSchema),
      });
    })(),
    handler: async (input, context) => {
      requireAdmin(context);
      await saveSiteSettings(input);
      return { success: true };
    },
  }),

  createRedirect: defineAction({
    accept: 'json',
    input: z.object({
      locale: z.enum(['id', 'en']),
      contentType: z.enum(['post', 'project']),
      fromPath: z.string().trim().min(2).max(200),
      toPath: z.string().trim().min(2).max(200),
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      const fromPath = input.fromPath.startsWith('/') ? input.fromPath : `/${input.fromPath}`;
      const toPath = input.toPath.startsWith('/') ? input.toPath : `/${input.toPath}`;
      if (fromPath === toPath) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Source and target paths cannot match.' });
      }
      if (!fromPath.startsWith(getLocalizedSectionPath(input.locale, 'home').slice(0, 3))) {
        // Still allowed if intentional, just keep clean path
      }
      await db
        .insert(urlRedirects)
        .values({
          locale: input.locale,
          contentType: input.contentType,
          fromPath,
          toPath,
          statusCode: 301,
          createdAt: new Date(),
        })
        .onDuplicateKeyUpdate({
          set: { toPath },
        });
      return { success: true };
    },
  }),

  deleteRedirect: defineAction({
    accept: 'json',
    input: z.object({ id: z.number().int().positive() }),
    handler: async (input, context) => {
      requireAdmin(context);
      await db.delete(urlRedirects).where(eq(urlRedirects.id, input.id));
      return { success: true };
    },
  }),

  triggerPublish: defineAction({
    accept: 'json',
    handler: async (_input, context) => {
      const user = requireAdmin(context);
      try {
        const result = await runPublishPipeline(user.id, 'admin');
        if (result.status === 'failed') {
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message: result.errorMessage || 'Publish failed.',
          });
        }
        return result;
      } catch (err) {
        if (err instanceof ActionError) throw err;
        throw new ActionError({
          code: 'CONFLICT',
          message: err instanceof Error ? err.message : 'Unable to start publish job.',
        });
      }
    },
  }),

  triggerRollback: defineAction({
    accept: 'json',
    handler: async (_input, context) => {
      const user = requireAdmin(context);
      const result = await rollbackLastPublish(user.id);
      if (!result.success) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: result.message,
        });
      }
      return result;
    },
  }),
};
