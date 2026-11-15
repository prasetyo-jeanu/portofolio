import assert from 'node:assert/strict';

const PORT = 4399;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const proc = Bun.spawn(['bun', 'run', 'server/entrypoint.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    NODE_ENV: 'production',
  },
  stdout: 'pipe',
  stderr: 'pipe',
});

async function waitForHealth() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not become healthy in time.');
}

try {
  await waitForHealth();

  // 1. Health endpoint
  const health = await fetch(`${BASE_URL}/api/health`);
  assert.equal(health.status, 200);
  const healthJson = (await health.json()) as { status: string };
  assert.equal(healthJson.status, 'ok');

  // 2. Public ID & EN pages
  const idRes = await fetch(`${BASE_URL}/id/`);
  assert.equal(idRes.status, 200);
  const idHtml = await idRes.text();
  assert.match(idHtml, /<html lang="id"/);
  assert.match(idHtml, /hreflang="en"/);

  const enRes = await fetch(`${BASE_URL}/en/`);
  assert.equal(enRes.status, 200);
  const enHtml = await enRes.text();
  assert.match(enHtml, /<html lang="en"/);

  // 3. Robots & Sitemap
  const robots = await fetch(`${BASE_URL}/robots.txt`);
  assert.equal(robots.status, 200);
  const robotsTxt = await robots.text();
  assert.match(robotsTxt, /Disallow: \/admin/);

  const sitemap = await fetch(`${BASE_URL}/sitemap-index.xml`);
  assert.equal(sitemap.status, 200);

  // 4. Pagefind JS artifact
  const pf = await fetch(`${BASE_URL}/pagefind/pagefind.js`);
  assert.equal(pf.status, 200);

  // 5. Admin protection (unauthenticated redirect)
  const adminRes = await fetch(`${BASE_URL}/admin`, { redirect: 'manual' });
  assert.equal(adminRes.status, 302);
  assert.equal(adminRes.headers.get('location'), '/admin/login');

  // 6. Admin login page + security headers
  const loginRes = await fetch(`${BASE_URL}/admin/login`);
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(loginRes.headers.get('x-frame-options'), 'DENY');

  console.log('All production E2E HTTP smoke checks passed!');
} finally {
  proc.kill();
  await proc.exited;
}
