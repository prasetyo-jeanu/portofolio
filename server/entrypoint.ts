import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
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

function findStaticFile(urlPathname: string): string | null {
  // 1. Primary check: user's live published static directory (e.g. /data/dist-public)
  if (fs.existsSync(env.PUBLIC_DIST_DIR)) {
    const file = resolveStaticFile(env.PUBLIC_DIST_DIR, urlPathname);
    if (file) return file;
  }

  // 2. Fallback check: bundled client build directory (/app/dist/client)
  // Ensures hashed _astro/ CSS/JS, fonts, and assets for SSR pages (e.g. /admin/*)
  // are ALWAYS served even before the first static site publish.
  if (fs.existsSync(FALLBACK_DIST_CLIENT)) {
    const file = resolveStaticFile(FALLBACK_DIST_CLIENT, urlPathname);
    if (file) return file;
  }

  return null;
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
    const staticFile = findStaticFile(pathname);
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

// Automatic one-time cutover check: if SQLite file exists and .mysql-migrated sentinel does not exist
const dataDir = path.dirname(env.DATABASE_PATH);
const sentinelFile = path.join(dataDir, '.mysql-migrated');

if (fs.existsSync(env.DATABASE_PATH) && !fs.existsSync(sentinelFile)) {
  console.log('[entrypoint] Detected existing SQLite database and no .mysql-migrated marker.');
  console.log('[entrypoint] Executing automatic one-time migration to MySQL...');
  try {
    const { migrateSqliteToMysql } = await import('../scripts/migrate-sqlite-to-mysql');
    const result = await migrateSqliteToMysql(env.DATABASE_PATH);
    if (result.migrated) {
      fs.writeFileSync(sentinelFile, new Date().toISOString(), 'utf-8');
      console.log('[entrypoint] Auto-migration completed. Marker created at:', sentinelFile);
    }
  } catch (err) {
    console.error('[entrypoint] Auto-migration error:', err);
  }
}

server.listen(env.PORT, env.HOST, () => {
  console.log(`Portfolio server listening on http://${env.HOST}:${env.PORT}`);
  console.log(`Primary public dir: ${env.PUBLIC_DIST_DIR}`);
  console.log(`Fallback client dir: ${FALLBACK_DIST_CLIENT}`);
  if (env.DATABASE_URL) {
    const sanitizedUrl = env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
    console.log(`MySQL database URL: ${sanitizedUrl}`);
  } else {
    console.log(`MySQL host: ${env.MYSQL_HOST}:${env.MYSQL_PORT}`);
  }
});
