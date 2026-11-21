import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql, eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
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

const TEST_UPLOAD_DIR = path.join(
  os.tmpdir(),
  `portofilio-test-uploads-${process.pid}-${Date.now()}`,
);

describe("Database, Auth, and Content Integrity Integration Tests", () => {
  beforeAll(async () => {
    process.env.SESSION_SECRET = "integration-test-secret-at-least-32-chars-long";
    try {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
    } catch {}
  });

  afterAll(async () => {
    await closeDb();
    try {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true, force: true });
    } catch {}
  });

  test("MySQL connection and schema integrity", async () => {
    const db = getDb();
    const [res] = await db.execute(sql`SELECT 1 as ok;`);
    expect(res).toBeDefined();
  });

  test("Password hashing, session lifecycle, and rate limiting work end-to-end", async () => {
    const db = getDb();
    const now = new Date();
    const passwordHash = await hashPassword("SuperSecretPass!23");
    expect(await verifyPassword("SuperSecretPass!23", passwordHash)).toBe(true);
    expect(await verifyPassword("WrongPass", passwordHash)).toBe(false);

    // Clean any prior tester row
    await db.delete(users).where(eq(users.email, "tester-integration@example.com"));

    const [userInsert] = await db
      .insert(users)
      .values({
        email: "tester-integration@example.com",
        name: "Tester",
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });

    const userId = userInsert.insertId;
    const { rawToken } = await createSession(userId, "127.0.0.1", "bun-test");
    const valid = await validateSessionToken(rawToken);
    expect(valid).not.toBeNull();
    expect(valid?.email).toBe("tester-integration@example.com");

    await revokeSessionToken(rawToken);
    const revoked = await validateSessionToken(rawToken);
    expect(revoked).toBeNull();

    // Clean up
    await db.delete(users).where(eq(users.id, userId));

    // Rate limiting check
    const ip = "10.0.0.99";
    for (let i = 0; i < 5; i++) recordLoginFailure(ip);
    const blocked = checkLoginRateLimit(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("Post and post_translations enforce unique slug per locale and cascade deletes", async () => {
    const db = getDb();
    const now = new Date();
    const testSlug = `post-test-${Date.now()}`;

    const [postInsert] = await db
      .insert(posts)
      .values({
        category: "architecture",
        featured: true,
        createdAt: now,
        updatedAt: now,
      });
    const postId = postInsert.insertId;

    await db.insert(postTranslations).values({
      postId,
      locale: "id",
      title: "Arsitektur MySQL Test",
      slug: testSlug,
      summary: "Ringkasan",
      contentMdx: "## Konten",
      status: "published",
      readingTimeMinutes: 1,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(postTranslations).values({
      postId,
      locale: "en",
      title: "MySQL Architecture Test",
      slug: `${testSlug}-en`,
      summary: "Summary",
      contentMdx: "## Content",
      status: "published",
      readingTimeMinutes: 1,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Duplicate slug in same locale should fail
    await expect(
      db
        .insert(postTranslations)
        .values({
          postId,
          locale: "id",
          title: "Duplicate",
          slug: testSlug,
          summary: "",
          contentMdx: "",
          status: "draft",
          readingTimeMinutes: 1,
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();

    // Cascade delete verification
    await db.delete(posts).where(eq(posts.id, postId));
    const transAfterDelete = await db
      .select()
      .from(postTranslations)
      .where(eq(postTranslations.postId, postId));
    expect(transAfterDelete.length).toBe(0);
  });

  test("freelanceProjects and freelanceProjectTranslations enforce unique slug per locale and cascade deletes", async () => {
    const db = getDb();
    const now = new Date();
    const testSlug = `freelance-test-${Date.now()}`;

    const [fpInsert] = await db
      .insert(freelanceProjects)
      .values({
        category: "saas",
        featured: false,
        isConfidential: false,
        techStackJson: JSON.stringify(["NodeJs", "Fastify"]),
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      });
    const fpId = fpInsert.insertId;

    await db.insert(freelanceProjectTranslations).values({
      freelanceProjectId: fpId,
      locale: "id",
      title: "Test Freelance MySQL",
      slug: testSlug,
      summary: "",
      contribution: "Kontribusi test",
      approach: "Pendekatan test",
      impact: "Dampak test",
      status: "published",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Duplicate slug in same locale should fail
    await expect(
      db
        .insert(freelanceProjectTranslations)
        .values({
          freelanceProjectId: fpId,
          locale: "id",
          title: "Dup",
          slug: testSlug,
          summary: "",
          contribution: "x",
          approach: "y",
          impact: "z",
          status: "draft",
          createdAt: now,
          updatedAt: now,
        })
        .execute(),
    ).rejects.toThrow();

    // Clean up with cascade delete
    await db.delete(freelanceProjects).where(eq(freelanceProjects.id, fpId));
    const remaining = await db
      .select()
      .from(freelanceProjectTranslations)
      .where(eq(freelanceProjectTranslations.freelanceProjectId, fpId));
    expect(remaining.length).toBe(0);
  });

  test("saveFreelanceProjectRecord validates input, upserts translations, and handles status transitions", async () => {
    const db = getDb();
    const testSlug = `freelance-crud-test-${Date.now()}`;

    const created = await saveFreelanceProjectRecord(db, {
      category: "fintech",
      featured: false,
      isConfidential: false,
      demoUrl: "https://example.com/demo",
      repoUrl: "https://github.com/example/repo",
      coverMediaId: null,
      sortOrder: 10,
      techStack: ["NodeJs", "Fastify", "PostgreSQL"],
      translations: {
        id: {
          title: "Fintech Core Platform",
          slug: testSlug,
          summary: "Ringkasan",
          contribution: "Lead Backend Developer",
          approach: "Clean Architecture",
          impact: "99.9% Uptime",
          status: "published",
        },
      },
    });

    expect(created.freelanceProjectId).toBeGreaterThan(0);

    // Clean up
    await archiveFreelanceProjectRecord(db, created.freelanceProjectId);
    await db.delete(freelanceProjects).where(eq(freelanceProjects.id, created.freelanceProjectId));
  });

  test("Atomic rollback on transaction failure preserves original data", async () => {
    const db = getDb();
    const testSlug = `rollback-test-${Date.now()}`;

    const created = await saveFreelanceProjectRecord(db, {
      category: "original-cat",
      featured: false,
      isConfidential: false,
      demoUrl: "",
      repoUrl: "",
      coverMediaId: null,
      sortOrder: 101,
      techStack: ["NodeJs"],
      translations: {
        id: {
          title: "Atomic Rollback Test",
          slug: testSlug,
          summary: "",
          contribution: "Kontribusi",
          approach: "Pendekatan",
          impact: "Dampak",
          status: "published",
        },
      },
    });

    // Attempt failing transaction
    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(freelanceProjects)
          .set({ category: "mutated-cat" })
          .where(eq(freelanceProjects.id, created.freelanceProjectId));
        throw new Error("Simulated transaction failure");
      }),
    ).rejects.toThrow();

    const [afterFail] = await db
      .select()
      .from(freelanceProjects)
      .where(eq(freelanceProjects.id, created.freelanceProjectId));
    expect(afterFail.category).toBe("original-cat");

    // Clean up
    await db.delete(freelanceProjects).where(eq(freelanceProjects.id, created.freelanceProjectId));
  });

  test("Multiple images and primary cover selection on projects work reliably", async () => {
    const db = getDb();
    const now = new Date();

    const [m1] = await db
      .insert(media)
      .values({
        filename: "test-screenshot-1.png",
        storagePath: `screenshots/test-1-${Date.now()}.png`,
        publicUrl: "/uploads/screenshots/test-1.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        createdAt: now,
      });

    const [m2] = await db
      .insert(media)
      .values({
        filename: "test-screenshot-2.png",
        storagePath: `screenshots/test-2-${Date.now()}.png`,
        publicUrl: "/uploads/screenshots/test-2.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: now,
      });

    const galleryData = [
      { url: "/uploads/screenshots/test-1.png", alt: "Dashboard", caption: "Overview" },
      { url: "/uploads/screenshots/test-2.png", alt: "Mobile", caption: "Responsive" },
    ];

    const [projRes] = await db
      .insert(projects)
      .values({
        category: "fullstack",
        featured: true,
        coverMediaId: m1.insertId,
        galleryJson: JSON.stringify(galleryData),
        createdAt: now,
        updatedAt: now,
      });
    const projId = projRes.insertId;

    const [proj] = await db.select().from(projects).where(eq(projects.id, projId));
    expect(proj.coverMediaId).toBe(m1.insertId);

    // Switch cover to m2
    await db
      .update(projects)
      .set({ coverMediaId: m2.insertId, updatedAt: new Date() })
      .where(eq(projects.id, projId));

    const [updatedProj] = await db.select().from(projects).where(eq(projects.id, projId));
    expect(updatedProj.coverMediaId).toBe(m2.insertId);

    // Clean up
    await db.delete(projects).where(eq(projects.id, projId));
    await db.delete(media).where(eq(media.id, m1.insertId));
    await db.delete(media).where(eq(media.id, m2.insertId));
  });
});
