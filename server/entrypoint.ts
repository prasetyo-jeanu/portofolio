import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { urlRedirects } from '../src/db/schema';
import { env } from '../src/lib/env';

// Dynamically load the built Astro Node middleware handler so typechecking works even before `astro build`
const entryModuleUrl = new URL('../dist/server/entry.mjs', import.meta.url).href;
const { handler: astroHandler } = (await import(entryModuleUrl)) as {
  handler: (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.pf_meta': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pagefind': 'application/octet-stream',
};

const FALLBACK_DIST_CLIENT = path.resolve(process.cwd(), 'dist/client');

function resolvePublicDistRoot(): string {
  if (fs.existsSync(env.PUBLIC_DIST_DIR)) {
    return env.PUBLIC_DIST_DIR;
  }
  return FALLBACK_DIST_CLIENT;
}

function resolveStaticFile(distRoot: string, urlPathname: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(urlPathname);
  } catch {
    return null;
  }

  const safeRel = decodedPath.replace(/^\/+/, '');
  const candidate = path.resolve(distRoot, safeRel);
  if (!candidate.startsWith(distRoot)) {
    return null;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }

  const indexHtml = path.join(candidate, 'index.html');
  if (indexHtml.startsWith(distRoot) && fs.existsSync(indexHtml) && fs.statSync(indexHtml).isFile()) {
    return indexHtml;
  }

  return null;
}

function setSecurityHeaders(res: http.ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const rawUrl = req.url || '/';

  let pathname = '/';
  try {
    pathname = new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // Dynamic SSR routes go straight to Astro Node middleware handler
  const isDynamicRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_actions/') ||
    pathname.startsWith('/uploads/');

  if (!isDynamicRoute && (method === 'GET' || method === 'HEAD')) {
    // Check 301 redirects first
    try {
      const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`;
      const foundRedirect = await db
        .select()
        .from(urlRedirects)
        .where(eq(urlRedirects.fromPath, normalized))
        .limit(1);

      if (foundRedirect.length > 0) {
        res.writeHead(foundRedirect[0].statusCode, {
          Location: foundRedirect[0].toPath,
        });
        res.end();
        return;
      }
    } catch {
      // Continue if DB unavailable
    }

    const distRoot = resolvePublicDistRoot();
    const staticFile = resolveStaticFile(distRoot, pathname);
    if (staticFile) {
      const ext = path.extname(staticFile).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const isImmutable = pathname.startsWith('/_astro/') || pathname.startsWith('/pagefind/');

      setSecurityHeaders(res);
      res.setHeader('Content-Type', mime);
      res.setHeader(
        'Cache-Control',
        isImmutable ? 'public, max-age=31536000, immutable' : 'public, max-age=60, must-revalidate',
      );

      if (method === 'HEAD') {
        res.writeHead(200);
        res.end();
        return;
      }

      const stream = fs.createReadStream(staticFile);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Error reading file');
        }
      });
      res.writeHead(200);
      stream.pipe(res);
      return;
    }
  }

  // Fall back to Astro SSR handler (handles /admin, /_actions, /api, /uploads, and 404)
  astroHandler(req, res, () => {
    if (!res.headersSent) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });
});

server.listen(env.PORT, env.HOST, () => {
  console.log(`Portfolio server listening on http://${env.HOST}:${env.PORT}`);
  console.log(`Public static dir: ${resolvePublicDistRoot()}`);
  console.log(`SQLite database: ${env.DATABASE_PATH}`);
});
