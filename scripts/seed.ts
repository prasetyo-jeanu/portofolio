import { eq } from 'drizzle-orm';
import { db, closeDb } from '../src/db';
import { users, siteSettings } from '../src/db/schema';
import { hashPassword } from '../src/lib/auth';
import { env } from '../src/lib/env';
import { DEFAULT_SITE_SETTINGS, saveSiteSettings } from '../src/lib/settings';

async function main() {
  const now = new Date();
  const existingAdmin = await db.select().from(users).where(eq(users.email, env.ADMIN_EMAIL)).limit(1);

  if (existingAdmin.length === 0) {
    const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
    await db.insert(users).values({
      email: env.ADMIN_EMAIL,
      name: env.ADMIN_NAME,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Seeded admin user: ${env.ADMIN_EMAIL}`);
  } else {
    console.log(`Admin user already exists: ${env.ADMIN_EMAIL}`);
  }

  const existingSettings = await db.select().from(siteSettings).limit(1);
  if (existingSettings.length === 0) {
    await saveSiteSettings(DEFAULT_SITE_SETTINGS);
    console.log('Seeded default site settings (without importing existing portfolio assets).');
  } else {
    console.log('Site settings already exist; skipping default seed.');
  }

  await closeDb();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
