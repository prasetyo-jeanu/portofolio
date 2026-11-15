import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { media } from '../../../db/schema';
import { saveUploadedImage } from '../../../lib/media';

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
    const altId = String(formData.get('altId') || '').trim().slice(0, 240);
    const altEn = String(formData.get('altEn') || '').trim().slice(0, 240);

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'Missing image file.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const saved = await saveUploadedImage(file);
    const [inserted] = await db
      .insert(media)
      .values({
        filename: saved.filename,
        storagePath: saved.storagePath,
        publicUrl: saved.publicUrl,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        altId,
        altEn,
        createdAt: new Date(),
      })
      .returning();

    return new Response(JSON.stringify({ media: inserted }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
