// Read-only browser verification of an existing isolated preview.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const draft = JSON.parse(await readFile('generated/hosted-check.json', 'utf8'));
assert.equal(draft.state, 'ready');
const origin = new URL(draft.previewUrl).origin;
assert.ok(new URL(origin).hostname.endsWith('-coze-homepage-preview.cozmo-ca1.workers.dev'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const evidence = [];
try {
  await mkdir('test-results', { recursive: true });
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'load', timeout: 45_000 });
    assert.equal(await page.locator('meta[name="coze-build"]').getAttribute('content'), draft.commit);
    await page.locator('h1').waitFor();
    const metrics = await page.evaluate(() => ({
      heading: document.querySelector('h1')?.textContent?.trim(),
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      visibleImages: [...document.images].filter(i => i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().bottom > 0).map(i => ({ loaded: i.complete && i.naturalWidth > 0, src: new URL(i.currentSrc || i.src, location.href).pathname })),
    }));
    assert.equal(metrics.scrollWidth <= width, true, `Homepage overflows at ${width}px`);
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    assert.ok(metrics.visibleImages.every(i => i.loaded), 'Visible homepage images loaded');
    await page.screenshot({ path: `test-results/hosted-homepage-${width}.png` });
    evidence.push(metrics);
    await page.close();
  }
  for (const language of ['ko', 'ja', 'zh']) {
    const response = await fetch(`${origin}/${language}/`, { redirect: 'manual' });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(`name="coze-build" content="${draft.commit}"`));
  }
  for (const path of ['/stay', '/api/stay/orders']) assert.equal((await fetch(`${origin}${path}`)).status, 404);
  assert.equal((await fetch(origin, { method: 'POST' })).status, 405);
  console.log(JSON.stringify({ verified: true, commit: draft.commit, languages: ['en', 'ko', 'ja', 'zh'], evidence }));
} finally { await browser.close(); }
