import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import widget from '../src/widget.generated.ts';
const commit = 'b'.repeat(40), changeId = 'd819b686-6350-40ac-8d1a-5fffae9b5e09';
const previewUrl = 'https://abcd-coze-homepage-preview.example.workers.dev';
const result = { structuredContent: { changeId, commit, state: 'ready', previewUrl }, _meta: { viewToken: 'b3fe041e-2637-4c11-b3a2-7aaf641f3907' }, content: [] };
const host = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:730px;border:0}</style><iframe src="https://widget.example.test/"></iframe><script>
window.calls=[];addEventListener('message',e=>{
 const d=e.data;if(d?.jsonrpc!=='2.0')return;
 if(d.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:d.id,result:{protocolVersion:'2026-01-26',hostInfo:{name:'Local test host',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{}}},e.origin);
 if(d.method==='ui/notifications/initialized')e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:${JSON.stringify(result)}},e.origin);
 if(d.method==='tools/call'){window.calls.push(d.params);e.source.postMessage({jsonrpc:'2.0',id:d.id,result:{content:[],structuredContent:{previewShown:true}}},e.origin);}
});</script>`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  await mkdir('test-results', { recursive: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.setDefaultTimeout(10_000);
    page.on('pageerror', error => console.error('Browser error:', error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      const body = url.hostname === 'host.example.test' ? host : url.hostname === 'widget.example.test' ? widget : `<!doctype html><meta name="coze-build" content="${commit}"><h1>Test homepage preview</h1><script>addEventListener('load',()=>parent.postMessage({type:'coze-preview-loaded',commit:'${commit}'},'*'))</script>`;
      return route.fulfill({ status: 200, contentType: 'text/html', body });
    });
    await page.goto('https://host.example.test/');
    const frame = page.frameLocator('iframe').frameLocator('iframe');
    await frame.getByRole('heading').waitFor();
    const component = page.frameLocator('iframe');
    await component.getByRole('status').filter({ hasText: 'Preview ready' }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.length), 1);
    assert.equal(await component.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true, `No outer overflow at ${width}px`);
    for (const [name, size] of [['Phone', 390], ['Desktop', 1440], ['Small phone', 320]]) {
      await component.getByRole('button', { name, exact: true }).click();
      assert.equal(await component.locator('iframe').evaluate(el => el.clientWidth), size);
    }
    await component.getByLabel('Preview language').selectOption('ko');
    await page.waitForFunction(() => window.calls.length === 2);
    await page.screenshot({ path: `test-results/preview-${width}.png` });
    await page.close();
  }
  const pageResult = { ...result, structuredContent: { ...result.structuredContent, kind: 'site-page', page: 'explore', pagePath: '/life' } };
  const pageHost = host.replace(JSON.stringify(result), JSON.stringify(pageResult));
  const routes = [];
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'abcd-coze-homepage-preview.example.workers.dev') routes.push(url.pathname);
    const body = url.hostname === 'host.example.test' ? pageHost : url.hostname === 'widget.example.test' ? widget : `<!doctype html><meta name="coze-build" content="${commit}"><h1>Explore preview</h1><script>addEventListener('load',()=>parent.postMessage({type:'coze-preview-loaded',commit:'${commit}'},'*'))</script>`;
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  await page.goto('https://host.example.test/');
  const component = page.frameLocator('iframe');
  await component.getByRole('status').filter({ hasText: 'Preview ready' }).waitFor();
  assert.ok(routes.includes('/life/'));
  assert.deepEqual(await page.evaluate(() => ({ name: window.calls[0].name, arguments: window.calls[0].arguments })), { name: 'markSitePagePreviewViewed', arguments: { changeId, viewToken: result._meta.viewToken, page: 'explore' } });
  await component.getByLabel('Preview language').selectOption('ko');
  await page.waitForFunction(() => window.calls.length === 2);
  assert.ok(routes.includes('/ko/life/'));
  await page.close();
  const uiResult = { ...result, structuredContent: { ...result.structuredContent, kind: 'ui', previewPath: '/itineraries/experiences/' } };
  const uiHost = host.replace(JSON.stringify(result), JSON.stringify(uiResult));
  const uiRoutes = [];
  const uiPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await uiPage.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'abcd-coze-homepage-preview.example.workers.dev') uiRoutes.push(url.pathname);
    const body = url.hostname === 'host.example.test' ? uiHost : url.hostname === 'widget.example.test' ? widget : `<!doctype html><meta name="coze-build" content="${commit}"><h1>Experiences preview</h1><script>addEventListener('load',()=>parent.postMessage({type:'coze-preview-loaded',commit:'${commit}'},'*'))</script>`;
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  await uiPage.goto('https://host.example.test/');
  const uiComponent = uiPage.frameLocator('iframe');
  await uiComponent.getByRole('status').filter({ hasText: 'Preview ready' }).waitFor();
  assert.ok(uiRoutes.includes('/itineraries/experiences/'));
  assert.equal(await uiComponent.getByLabel('Preview language').isHidden(), true);
  assert.deepEqual(await uiPage.evaluate(() => ({ name: window.calls[0].name, arguments: window.calls[0].arguments })), { name: 'markUiPreviewViewed', arguments: { changeId, viewToken: result._meta.viewToken } });
  await uiPage.close();
  console.log('PASS: real MCP Apps handshake, verified homepage, Explore and public UI preview acknowledgements, page routes, language/size controls and no outer overflow at 320/390/768/1024/1440px. This is a local host simulation, not a ChatGPT installation test.');
} finally { await browser.close(); }
