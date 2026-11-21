import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq } from "drizzle-orm";

const TEST_DB_PATH = path.resolve(process.cwd(), "data/test-integration.db");
const TEST_UPLOAD_DIR = path.join(
  os.tmpdir(),
  `portofilio-test-uploads-${process.pid}-${Date.now()}`,
);

import { getDb, getSqlite, closeDb } from "../src/db";
import {
  freelanceProjects,
  freelanceProjectTranslations,
  media,
  posts,
  postTranslations,
  projects,
  projectTranslations,
  users,
} from "../src/db/schema";
import { importPortfolioToDb } from "../src/lib/portfolio-importer";
import { importFreelanceEnToDb, importFreelanceToDb } from "../src/lib/freelance-importer";
import {
  archiveFreelanceProjectRecord,
  FreelanceServiceError,
  reorderFreelanceProjectRecords,
  saveFreelanceProjectRecord,
  toggleFreelanceFeaturedRecord,
} from "../src/lib/freelance-service";
import { getPublishedFreelanceProjectsByLocale } from "../src/lib/freelance-queries";
import {
  checkLoginRateLimit,
  createSession,
  hashPassword,
  recordLoginFailure,
  revokeSessionToken,
  validateSessionToken,
  verifyPassword,
} from "../src/lib/auth";

describe("Database, Auth, and Content Integrity Integration Tests", () => {
  beforeAll(() => {
    process.env.DATABASE_PATH = TEST_DB_PATH;
    process.env.SESSION_SECRET =
      "integration-test-secret-at-least-32-chars-long";
    closeDb();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (fs.existsSync(`${TEST_DB_PATH}${suffix}`)) {
        fs.unlinkSync(`${TEST_DB_PATH}${suffix}`);
      }
    }
    try {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
    } catch {
      // Ignore transient Windows directory lock during cleanup
    }
    const db = getDb();
    migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  });

  afterAll(() => {
    closeDb();
    delete process.env.DATABASE_PATH;
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        if (fs.existsSync(`${TEST_DB_PATH}${suffix}`)) {
          fs.unlinkSync(`${TEST_DB_PATH}${suffix}`);
        }
      } catch {
        // Ignore transient Windows file lock during teardown; cleaned on next beforeAll
      }
    }
    try {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
    } catch {
      // Ignore transient Windows directory lock during teardown
    }
  });

  test("SQLite runs in WAL mode with foreign keys enabled", () => {
    const sqlite = getSqlite();
    const journalMode = sqlite.query("PRAGMA journal_mode;").get() as {
      journal_mode: string;
    };
    const fk = sqlite.query("PRAGMA foreign_keys;").get() as {
      foreign_keys: number;
    };
    expect(journalMode.journal_mode.toLowerCase()).toBe("wal");
    expect(fk.foreign_keys).toBe(1);
  });

  test("Password hashing, session lifecycle, and rate limiting work end-to-end", async () => {
    const db = getDb();
    const now = new Date();
    const passwordHash = await hashPassword("SuperSecretPass!23");
    expect(await verifyPassword("SuperSecretPass!23", passwordHash)).toBe(true);
    expect(await verifyPassword("WrongPass", passwordHash)).toBe(false);

    const [user] = await db
      .insert(users)
      .values({
        email: "tester@example.com",
        name: "Tester",
        passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const { rawToken } = await createSession(user.id, "127.0.0.1", "bun-test");
    const valid = await validateSessionToken(rawToken);
    expect(valid).not.toBeNull();
    expect(valid?.email).toBe("tester@example.com");

    await revokeSessionToken(rawToken);
    const revoked = await validateSessionToken(rawToken);
    expect(revoked).toBeNull();

    // Rate limiting check
    const ip = "10.0.0.99";
    for (let i = 0; i < 5; i++) recordLoginFailure(ip);
    const blocked = checkLoginRateLimit(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("Multilingual post_translations enforce UNIQUE(post_id, locale) and UNIQUE(locale, slug)", async () => {
    const db = getDb();
    const now = new Date();
    const [post] = await db
      .insert(posts)
      .values({
        category: "architecture",
        featured: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(postTranslations).values({
      postId: post.id,
      locale: "id",
      title: "Arsitektur SQLite",
      slug: "arsitektur-sqlite",
      summary: "Ringkasan",
      contentMdx: "## Konten",
      status: "published",
      readingTimeMinutes: 1,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(postTranslations).values({
      postId: post.id,
      locale: "en",
      title: "SQLite Architecture",
      slug: "sqlite-architecture",
      summary: "Summary",
      contentMdx: "## Content",
      status: "draft",
      readingTimeMinutes: 1,
      createdAt: now,
      updatedAt: now,
    });

    // Duplicate (post_id, locale) must fail
    expect(() =>
      db
        .insert(postTranslations)
        .values({
          postId: post.id,
          locale: "id",
          title: "Duplicate ID",
          slug: "duplicate-id",
          summary: "",
          contentMdx: "",
          status: "draft",
          readingTimeMinutes: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    ).toThrow();

    const rows = await db
      .select()
      .from(postTranslations)
      .where(eq(postTranslations.postId, post.id));
    expect(rows.length).toBe(2);
  });

  test("Idempotent portfolio importer syncs all 14 bilingual projects and media without duplicates", async () => {
    const db = getDb();
    const first = await importPortfolioToDb({ db, uploadDir: TEST_UPLOAD_DIR });
    expect(first.projectsCreated).toBe(14);
    expect(first.projectsUpdated).toBe(0);
    expect(first.mediaSynced).toBe(14);
    expect(first.translationsSynced).toBe(28);

    const second = await importPortfolioToDb({
      db,
      uploadDir: TEST_UPLOAD_DIR,
    });
    expect(second.projectsCreated).toBe(0);
    expect(second.projectsUpdated).toBe(14);

    const projRows = await db.select().from(projects);
    const transRows = await db.select().from(projectTranslations);
    const mediaRows = await db.select().from(media);
    expect(projRows.length).toBe(14);
    expect(transRows.length).toBe(28);
    expect(mediaRows.length).toBe(14);
  });

  test("freelanceProjects and freelanceProjectTranslations enforce unique slug per locale and cascade deletes", async () => {
    const db = getDb();
    const now = new Date();
    const [fp] = await db
      .insert(freelanceProjects)
      .values({
        category: "saas",
        featured: false,
        isConfidential: false,
        techStackJson: JSON.stringify(["NodeJs", "Fastify"]),
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(freelanceProjectTranslations).values({
      freelanceProjectId: fp.id,
      locale: "id",
      title: "Test Freelance",
      slug: "test-freelance",
      summary: "",
      contribution: "Kontribusi test",
      approach: "Pendekatan test",
      impact: "Dampak test",
      status: "published",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    expect(() =>
      db
        .insert(freelanceProjectTranslations)
        .values({
          freelanceProjectId: fp.id,
          locale: "id",
          title: "Dup",
          slug: "test-freelance",
          contribution: "x",
          approach: "y",
          impact: "z",
          status: "draft",
          createdAt: now,
          updatedAt: now,
        })
        .run(),
    ).toThrow();

    await db.delete(freelanceProjects).where(eq(freelanceProjects.id, fp.id));
    const remaining = await db
      .select()
      .from(freelanceProjectTranslations)
      .where(eq(freelanceProjectTranslations.freelanceProjectId, fp.id));
    expect(remaining).toHaveLength(0);
  });

  test("Idempotent freelance importer syncs all 12 Indonesian freelance projects without touching main projects", async () => {
    const db = getDb();
    const projectsBefore = await db.select().from(projects);

    const first = await importFreelanceToDb({ db });
    expect(first).toEqual({
      projectsCreated: 12,
      projectsUpdated: 0,
      translationsSynced: 12,
    });

    const second = await importFreelanceToDb({ db });
    expect(second).toEqual({
      projectsCreated: 0,
      projectsUpdated: 12,
      translationsSynced: 12,
    });

    const freelanceRows = await db.select().from(freelanceProjects);
    const freelanceTrans = await db.select().from(freelanceProjectTranslations);
    const projectsAfter = await db.select().from(projects);

    expect(freelanceRows).toHaveLength(12);
    expect(freelanceTrans).toHaveLength(12);
    expect(
      freelanceTrans.every(
        (tr) => tr.locale === "id" && tr.status === "published",
      ),
    ).toBe(true);
    expect(projectsAfter).toHaveLength(projectsBefore.length);
  });

  test("Freelance service CRUD, confidential URL clearing, slug conflict, featured toggle, reorder, and archive work reliably", async () => {
    const db = getDb();

    await expect(
      saveFreelanceProjectRecord(db, {
        category: "saas",
        featured: false,
        isConfidential: false,
        demoUrl: "",
        repoUrl: "",
        coverMediaId: null,
        sortOrder: 99,
        techStack: ["NodeJs"],
        translations: {
          id: {
            title: "",
            slug: "",
            summary: "",
            contribution: "",
            approach: "",
            impact: "",
            status: "draft",
          },
          en: {
            title: "",
            slug: "",
            summary: "",
            contribution: "",
            approach: "",
            impact: "",
            status: "draft",
          },
        },
      }),
    ).rejects.toThrow(FreelanceServiceError);

    const created = await saveFreelanceProjectRecord(db, {
      category: "saas",
      featured: false,
      isConfidential: true,
      demoUrl: "https://demo.example.com",
      repoUrl: "https://github.com/org/secret",
      coverMediaId: null,
      sortOrder: 99,
      techStack: ["TypeScript", "typescript", "Bun"],
      translations: {
        id: {
          title: "Proyek Freelance Uji",
          slug: "",
          summary: "Ringkasan uji",
          contribution: "Membangun sistem",
          approach: "Modular",
          impact: "Lebih cepat",
          status: "published",
        },
      },
    });

    const [row] = await db
      .select()
      .from(freelanceProjects)
      .where(eq(freelanceProjects.id, created.freelanceProjectId));
    expect(row.repoUrl).toBeNull();
    expect(row.demoUrl).toBe("https://demo.example.com");
    expect(JSON.parse(row.techStackJson)).toEqual(["TypeScript", "Bun"]);

    const trans = await db
      .select()
      .from(freelanceProjectTranslations)
      .where(
        eq(
          freelanceProjectTranslations.freelanceProjectId,
          created.freelanceProjectId,
        ),
      );
    expect(trans).toHaveLength(1);
    expect(trans[0].locale).toBe("id");
    expect(trans[0].slug).toBe("proyek-freelance-uji");

    await expect(
      saveFreelanceProjectRecord(db, {
        category: "saas",
        featured: false,
        isConfidential: false,
        demoUrl: "",
        repoUrl: "",
        coverMediaId: null,
        sortOrder: 100,
        techStack: [],
        translations: {
          id: {
            title: "Duplikat Slug",
            slug: "proyek-freelance-uji",
            summary: "",
            contribution: "Kontribusi",
            approach: "Pendekatan",
            impact: "Dampak",
            status: "draft",
          },
        },
      }),
    ).rejects.toThrow(FreelanceServiceError);

    const toggled = await toggleFreelanceFeaturedRecord(
      db,
      created.freelanceProjectId,
      true,
    );
    expect(toggled.featured).toBe(true);

    await reorderFreelanceProjectRecords(db, [created.freelanceProjectId]);
    const [reordered] = await db
      .select()
      .from(freelanceProjects)
      .where(eq(freelanceProjects.id, created.freelanceProjectId));
    expect(reordered.sortOrder).toBe(1);

    await archiveFreelanceProjectRecord(db, created.freelanceProjectId);
    const [archived] = await db
      .select()
      .from(freelanceProjects)
      .where(eq(freelanceProjects.id, created.freelanceProjectId));
    const [archivedTr] = await db
      .select()
      .from(freelanceProjectTranslations)
      .where(
        eq(
          freelanceProjectTranslations.freelanceProjectId,
          created.freelanceProjectId,
        ),
      );
    expect(archived.deletedAt).not.toBeNull();
    expect(archivedTr.status).toBe("archived");
  });

  test("saveFreelanceProjectRecord rejects unsafe repoUrl even when isConfidential is true", async () => {
    const db = getDb();
    await expect(
      saveFreelanceProjectRecord(db, {
        category: "saas",
        featured: false,
        isConfidential: true,
        demoUrl: "",
        repoUrl: "javascript:alert(1)",
        coverMediaId: null,
        sortOrder: 101,
        techStack: ["NodeJs"],
        translations: {
          id: {
            title: "Confidential Unsafe URL",
            slug: "confidential-unsafe-url",
            summary: "",
            contribution: "Kontribusi",
            approach: "Pendekatan",
            impact: "Dampak",
            status: "draft",
          },
        },
      }),
    ).rejects.toThrow(FreelanceServiceError);
  });

  test("saveFreelanceProjectRecord and archiveFreelanceProjectRecord roll back parent writes if translation write fails", async () => {
    const db = getDb();
    const sqlite = getSqlite();

    const created = await saveFreelanceProjectRecord(db, {
      category: "original-cat",
      featured: false,
      isConfidential: false,
      demoUrl: "",
      repoUrl: "",
      coverMediaId: null,
      sortOrder: 102,
      techStack: ["Bun"],
      translations: {
        id: {
          title: "Atomic Rollback Test",
          slug: "atomic-rollback-test",
          summary: "",
          contribution: "Kontribusi",
          approach: "Pendekatan",
          impact: "Dampak",
          status: "published",
        },
      },
    });

    sqlite.exec(`
      CREATE TRIGGER fail_freelance_trans_update
      BEFORE UPDATE ON freelance_project_translations
      WHEN NEW.freelance_project_id = ${created.freelanceProjectId}
      BEGIN
        SELECT RAISE(ABORT, 'simulated translation failure');
      END;
    `);

    try {
      await expect(
        saveFreelanceProjectRecord(db, {
          id: created.freelanceProjectId,
          category: "mutated-cat",
          featured: true,
          isConfidential: false,
          demoUrl: "",
          repoUrl: "",
          coverMediaId: null,
          sortOrder: 102,
          techStack: ["Bun"],
          translations: {
            id: {
              title: "Atomic Rollback Test Updated",
              slug: "atomic-rollback-test",
              summary: "",
              contribution: "Kontribusi",
              approach: "Pendekatan",
              impact: "Dampak",
              status: "published",
            },
          },
        }),
      ).rejects.toThrow();

      const [afterSaveFail] = await db
        .select()
        .from(freelanceProjects)
        .where(eq(freelanceProjects.id, created.freelanceProjectId));
      expect(afterSaveFail.category).toBe("original-cat");
      expect(afterSaveFail.featured).toBe(false);

      await expect(
        archiveFreelanceProjectRecord(db, created.freelanceProjectId),
      ).rejects.toThrow();
      const [afterArchiveFail] = await db
        .select()
        .from(freelanceProjects)
        .where(eq(freelanceProjects.id, created.freelanceProjectId));
      expect(afterArchiveFail.deletedAt).toBeNull();
    } finally {
      sqlite.exec("DROP TRIGGER IF EXISTS fail_freelance_trans_update;");
    }
  });

  test("getPublishedFreelanceProjectsByLocale filters published active rows per locale, respects order, and fails closed on unsafe URLs", async () => {
    const db = getDb();
    const now = new Date();

    const enBefore = await getPublishedFreelanceProjectsByLocale('en', db);
    expect(enBefore).toHaveLength(0);

    // Draft item must be excluded
    await saveFreelanceProjectRecord(db, {
      category: 'saas',
      featured: true,
      isConfidential: false,
      demoUrl: 'https://demo.example.com',
      repoUrl: 'https://github.com/example/draft',
      coverMediaId: null,
      sortOrder: 0,
      techStack: ['Bun'],
      translations: {
        id: {
          title: 'Draft Freelance Hidden',
          slug: 'draft-freelance-hidden',
          summary: '',
          contribution: 'Kontribusi',
          approach: 'Pendekatan',
          impact: 'Dampak',
          status: 'draft',
        },
      },
    });

    // Insert row directly with unsafe demoUrl and confidential repoUrl to test fail-closed read query
    const [unsafeRow] = await db
      .insert(freelanceProjects)
      .values({
        category: 'automation',
        featured: true,
        isConfidential: true,
        demoUrl: 'javascript:alert(1)',
        repoUrl: 'https://github.com/secret/repo',
        techStackJson: JSON.stringify(['Puppeteer', 'NodeJs']),
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(freelanceProjectTranslations).values({
      freelanceProjectId: unsafeRow.id,
      locale: 'id',
      title: 'Unsafe URL Masked Item',
      slug: 'unsafe-url-masked-item',
      summary: 'Ringkas',
      contribution: 'Kontribusi',
      approach: 'Pendekatan',
      impact: 'Dampak terukur',
      status: 'published',
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const idItems = await getPublishedFreelanceProjectsByLocale('id', db);
    expect(idItems.some((item) => item.slug === 'draft-freelance-hidden')).toBe(false);
    const masked = idItems.find((item) => item.slug === 'unsafe-url-masked-item');
    expect(masked).toBeDefined();
    expect(masked?.demoUrl).toBeNull();
    expect(masked?.repoUrl).toBeNull();
    expect(idItems[0].sortOrder).toBeLessThanOrEqual(idItems[idItems.length - 1].sortOrder);

    // Publish an EN translation on an existing item -> en query now returns it
    await db.insert(freelanceProjectTranslations).values({
      freelanceProjectId: unsafeRow.id,
      locale: 'en',
      title: 'English Freelance Item',
      slug: 'english-freelance-item',
      summary: 'Short',
      contribution: 'Built tool',
      approach: 'Automated pipeline',
      impact: 'Saved 80% time',
      status: 'published',
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const enAfter = await getPublishedFreelanceProjectsByLocale('en', db);
    expect(enAfter).toHaveLength(1);
    expect(enAfter[0].title).toBe('English Freelance Item');

    // Soft-deleted project must be excluded
    await archiveFreelanceProjectRecord(db, unsafeRow.id);
    const enAfterArchive = await getPublishedFreelanceProjectsByLocale('en', db);
    expect(enAfterArchive).toHaveLength(0);
  });

  test("Idempotent EN freelance importer attaches English translations in matching order to existing ID projects", async () => {
    const db = getDb();

    const first = await importFreelanceEnToDb({ db });
    expect(first).toEqual({
      projectsMatched: 12,
      translationsCreated: 12,
      translationsUpdated: 0,
    });

    const second = await importFreelanceEnToDb({ db });
    expect(second).toEqual({
      projectsMatched: 12,
      translationsCreated: 0,
      translationsUpdated: 12,
    });

    const idItems = await getPublishedFreelanceProjectsByLocale("id", db);
    const enItems = await getPublishedFreelanceProjectsByLocale("en", db);
    expect(enItems).toHaveLength(12);
    expect(enItems[0].title).toBe("SaaS WhatsApp Bot for SMEs");
    expect(enItems[11].title).toBe(
      "Binomo Trading Bot — Candlestick Analysis & Automated Bid Execution",
    );

    // Every EN item must map 1-to-1 in identical sort order to its Indonesian parent record
    for (let i = 0; i < 12; i++) {
      expect(enItems[i].sortOrder).toBe(idItems[i].sortOrder);
      expect(enItems[i].id).toBe(idItems[i].id);
    }
  });

  test("projects supports multi-image gallery with selectable coverMediaId", async () => {
    const db = getDb();
    const now = new Date();

    const [media1] = await db
      .insert(media)
      .values({
        filename: "screenshot-1.png",
        storagePath: "screenshots/screenshot-1.png",
        publicUrl: "/uploads/screenshots/screenshot-1.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        createdAt: now,
      })
      .returning();

    const [media2] = await db
      .insert(media)
      .values({
        filename: "screenshot-2.png",
        storagePath: "screenshots/screenshot-2.png",
        publicUrl: "/uploads/screenshots/screenshot-2.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: now,
      })
      .returning();

    const galleryData = [
      { url: media1.publicUrl, alt: "Dashboard View", caption: "Main dashboard overview" },
      { url: media2.publicUrl, alt: "Mobile View", caption: "Responsive mobile interface" },
    ];

    const [proj] = await db
      .insert(projects)
      .values({
        category: "fullstack",
        featured: true,
        coverMediaId: media1.id,
        galleryJson: JSON.stringify(galleryData),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    expect(proj.coverMediaId).toBe(media1.id);
    const parsedGallery1 = JSON.parse(proj.galleryJson);
    expect(parsedGallery1).toHaveLength(2);
    expect(parsedGallery1[0].url).toBe(media1.publicUrl);
    expect(parsedGallery1[1].url).toBe(media2.publicUrl);

    // Switch cover to media2
    await db
      .update(projects)
      .set({
        coverMediaId: media2.id,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, proj.id));

    const [updatedProj] = await db.select().from(projects).where(eq(projects.id, proj.id));
    expect(updatedProj.coverMediaId).toBe(media2.id);
    const parsedGallery2 = JSON.parse(updatedProj.galleryJson);
    expect(parsedGallery2).toHaveLength(2);
    expect(parsedGallery2[0].url).toBe(media1.publicUrl);
    expect(parsedGallery2[1].url).toBe(media2.publicUrl);
  });
});
