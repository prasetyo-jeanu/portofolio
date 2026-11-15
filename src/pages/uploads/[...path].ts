import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';
import { env } from '../../lib/env';

export const prerender = false;

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

export const GET: APIRoute = async ({ params }) => {
  const relPath = params.path;
  if (!relPath) {
    return new Response('Not Found', { status: 404 });
  }

  const rootDir = path.resolve(env.UPLOAD_DIR);
  const resolved = path.resolve(rootDir, relPath);

  if (!resolved.startsWith(rootDir + path.sep) && resolved !== rootDir) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return new Response('Not Found', { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
  const data = fs.readFileSync(resolved);

  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
