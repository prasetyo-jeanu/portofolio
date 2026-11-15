import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';
import { eq, and, gt, lt } from 'drizzle-orm';
import { db } from '../db';
import { users, sessions } from '../db/schema';
import { env } from './env';

export const SESSION_COOKIE_NAME = 'portfolio_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// In-memory rate limiter for login attempts (sliding window)
const loginAttemptStore = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const record = loginAttemptStore.get(ip);

  if (!record || now > record.resetAt) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const record = loginAttemptStore.get(ip);
  if (!record || now > record.resetAt) {
    loginAttemptStore.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    record.count += 1;
  }
}

export function clearLoginFailures(ip: string): void {
  loginAttemptStore.delete(ip);
}

export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 19456,
    timeCost: 2,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

function hashSessionToken(token: string): string {
  return crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(token)
    .digest('hex');
}

export async function createSession(
  userId: number,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  // Clean up expired sessions opportunistically
  await db.delete(sessions).where(lt(sessions.expiresAt, now));

  await db.insert(sessions).values({
    id: tokenHash,
    userId,
    expiresAt,
    ipAddress,
    userAgent: userAgent ? userAgent.slice(0, 255) : null,
    createdAt: now,
  });

  return { rawToken, expiresAt };
}

export function setSessionCookie(cookies: AstroCookies, rawToken: string, expiresAt: Date): void {
  cookies.set(SESSION_COOKIE_NAME, rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.IS_PROD && env.SITE_URL.startsWith('https://'),
    expires: expiresAt,
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}

export async function validateSessionToken(rawToken: string | undefined) {
  if (!rawToken || rawToken.length < 32) return null;
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0];
}

export async function revokeSessionToken(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashSessionToken(rawToken);
  await db.delete(sessions).where(eq(sessions.id, tokenHash));
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}
