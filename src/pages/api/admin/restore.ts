import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { restoreFromArchive } from '../../../lib/backup-service';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File) || file.size === 0) {
      return new Response(JSON.stringify({ error: 'No backup file provided.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Max 100MB
    if (file.size > 100 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File size exceeds 100MB limit.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-restore-'));
    const tempFilePath = path.join(tempDir, file.name);

    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(tempFilePath, Buffer.from(arrayBuffer));

    const result = await restoreFromArchive(tempFilePath, file.name);

    // Cleanup temp upload
    try {
      fs.unlinkSync(tempFilePath);
      fs.rmdirSync(tempDir);
    } catch {}

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Restore process failed.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
