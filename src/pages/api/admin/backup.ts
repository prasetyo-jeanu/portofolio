import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { createBackupArchive } from '../../../lib/backup-service';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const archivePath = await createBackupArchive();
    const filename = path.basename(archivePath);
    const fileBytes = fs.readFileSync(archivePath);

    // Cleanup temp archive from disk after reading into memory
    try {
      fs.unlinkSync(archivePath);
      fs.rmdirSync(path.dirname(archivePath));
    } catch {}

    return new Response(fileBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(fileBytes.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backup generation failed.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
