import { closeDb } from '../src/db';
import { importFreelanceEnToDb, importFreelanceToDb } from '../src/lib/freelance-importer';

async function main() {
  if (process.argv.includes('--en')) {
    const enSummary = await importFreelanceEnToDb();
    console.log(
      `Freelance EN import complete: ${enSummary.projectsMatched} matched, ` +
        `${enSummary.translationsCreated} created, ${enSummary.translationsUpdated} updated.`,
    );
  } else {
    const summary = await importFreelanceToDb();
    console.log(
      `Freelance import complete: ${summary.projectsCreated} created, ${summary.projectsUpdated} updated, ` +
        `${summary.translationsSynced} translations synced.`,
    );
  }
  closeDb();
}

main().catch((err) => {
  console.error('Freelance import failed:', err);
  closeDb();
  process.exit(1);
});
