import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db } from '../../db';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    await db.run(sql`SELECT 1`);
    return new Response(
      JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        status: 'error',
        error: err instanceof Error ? err.message : 'Database unreachable',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};
