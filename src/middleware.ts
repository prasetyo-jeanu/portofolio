import { defineMiddleware } from 'astro:middleware';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE_NAME, validateSessionToken } from './lib/auth';
import { db } from './db';
import { urlRedirects } from './db/schema';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) {
    return next();
  }

  const { pathname } = context.url;

  // Populate session user if cookie exists
  const rawToken = context.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    const session = await validateSessionToken(rawToken);
    if (session) {
      context.locals.user = {
        id: session.userId,
        email: session.email,
        name: session.name,
        sessionId: session.sessionId,
      };
    } else {
      context.locals.user = null;
    }
  } else {
    context.locals.user = null;
  }

  // Protect /admin routes (except /admin/login)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!context.locals.user) {
      return context.redirect('/admin/login');
    }
  }

  // Redirect already authenticated admin away from /admin/login
  if (pathname === '/admin/login' && context.locals.user) {
    return context.redirect('/admin');
  }

  // Check dynamic URL redirects for SSR / dev fallback
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/') && !pathname.startsWith('/_actions/')) {
    try {
      const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`;
      const redirectRow = await db
        .select()
        .from(urlRedirects)
        .where(eq(urlRedirects.fromPath, normalized))
        .limit(1);
      if (redirectRow.length > 0) {
        return context.redirect(redirectRow[0].toPath, redirectRow[0].statusCode as 301 | 302);
      }
    } catch {
      // Ignore before DB migration
    }
  }

  const response = await next();

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
});
