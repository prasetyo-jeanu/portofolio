import { closeDb } from '../src/db';
import { importPortfolioToDb } from '../src/lib/portfolio-importer';

async function main() {
  const summary = await importPortfolioToDb();
  console.log(
    `Portfolio import complete: ${summary.projectsCreated} created, ${summary.projectsUpdated} updated, ` +
      `${summary.translationsSynced} translations synced, ${summary.mediaSynced} media synced, ` +
      `${summary.tagsLinked} tag links synced.`,
  );
  closeDb();
}

main().catch((err) => {
  console.error('Portfolio import failed:', err);
  closeDb();
  process.exit(1);
});
