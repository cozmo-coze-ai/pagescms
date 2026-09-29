import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { allowedPreviewPath } from './worker.mjs';
import { prepareHomepagePreview } from '../prepare-homepage-preview.mjs';
import { mkdtemp, mkdir, writeFile, readFile, access, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
test('preview permits home locales and static design assets only', () => {
  for (const path of ['/', '/ko/', '/ja/', '/zh/', '/_astro/app.js', '/home/photo.webp']) assert.ok(allowedPreviewPath(path));
  for (const path of ['/stay', '/bookings/', '/api/booking.js', '/api/payment', '/guests/data.json', '/manual.pdf', '/secret.map']) assert.ok(!allowedPreviewPath(path));
});
test('preview blocks all mutations and non-homepage HTML before reaching assets', async () => {
  const env = { ASSETS: { fetch: () => { throw new Error('must not reach assets'); } } };
  assert.equal((await worker.fetch(new Request('https://preview.test/', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://preview.test/stay'), env)).status, 404);
});
test('preview assets disable indexing, forms and background API requests', async () => {
  const env = { ASSETS: { fetch: async () => new Response('body{}') } };
  const response = await worker.fetch(new Request('https://preview.test/style.css'), env);
  assert.match(response.headers.get('Content-Security-Policy'), /connect-src 'none'/);
  assert.match(response.headers.get('Content-Security-Policy'), /form-action 'none'/);
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
});
test('preview package requires exact commit and excludes APIs, other HTML and secrets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'coze-preview-test-'));
  const commit = 'a'.repeat(40);
  try {
    const files = ['index.html', 'ko/index.html', 'ja/index.html', 'zh/index.html', 'stay/index.html', 'guest/private.json', '.env', '_astro/page.js', 'home/hero.webp'];
    for (const file of files) {
      const target = path.join(root, 'dist/client', file); await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `<meta name="coze-build" content="${commit}">`);
    }
    await mkdir(path.join(root, 'scripts/homepage-preview'), { recursive: true });
    await copyFile(new URL('./worker.mjs', import.meta.url), path.join(root, 'scripts/homepage-preview/worker.mjs'));
    await assert.rejects(prepareHomepagePreview(root, 'b'.repeat(40)), /not built from this commit/);
    const output = await prepareHomepagePreview(root, commit);
    for (const file of ['index.html', 'ko/index.html', 'ja/index.html', 'zh/index.html', '_astro/page.js', 'home/hero.webp']) await access(path.join(output, 'assets', file));
    for (const file of ['stay/index.html', 'guest/private.json', '.env']) await assert.rejects(access(path.join(output, 'assets', file)));
    const config = JSON.parse(await readFile(path.join(root, 'dist/homepage-preview.wrangler.json'), 'utf8'));
    assert.equal(config.name, 'coze-homepage-preview');
    assert.equal(config.assets.run_worker_first, true);
    assert.equal(config.vars, undefined); assert.equal(config.routes, undefined);
  } finally {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('coze-preview-test-')) throw new Error('Unexpected temporary directory');
    await rm(resolved, { recursive: true, force: true });
  }
});
