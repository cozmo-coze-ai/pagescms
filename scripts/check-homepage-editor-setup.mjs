// Read-only setup checks. No keys, POSTs, Git writes, builds or migrations.
// Run from pagescms: node scripts/check-homepage-editor-setup.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  'client-root': { type: 'string', default: fileURLToPath(new URL('../../coze_client/', import.meta.url)) },
  'cms-url': { type: 'string', default: 'https://cms.coze.care' },
  'admin-url': { type: 'string', default: 'https://admin.coze.care' },
} });
let failures = 0;
function report(ok, message) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'BLOCKED'} ${message}`);
}
function origin(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('Use HTTPS, or HTTP on localhost; do not put credentials in URLs.');
  }
  return url.origin;
}
async function get(base, path) {
  try {
    const response = await fetch(new URL(path, base), {
      method: 'GET', redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    return { status: response.status, text: await response.text() };
  } catch {
    return { status: 0, text: '' };
  }
}
async function main() {
  const cms = origin(values['cms-url']);
  const admin = origin(values['admin-url']);
  const required = [
    'scripts/check-homepage.mjs', 'scripts/lib/homepage-rules.mjs',
    'src/i18n/pages/home/README.md',
    ...['en', 'ko', 'ja', 'zh'].map(lang => `src/i18n/pages/home/${lang}.json`),
  ];
  const missing = [];
  for (const file of required) {
    try { await readFile(resolve(values['client-root'], file)); } catch { missing.push(file); }
  }
  report(!missing.length, missing.length ? `Client feature files missing: ${missing.join(', ')}` : 'Client feature files present');
  let scripts = {};
  try { scripts = JSON.parse(await readFile(resolve(values['client-root'], 'package.json'), 'utf8')).scripts ?? {}; } catch { /* reported below */ }
  report(Boolean(scripts['check:homepage']) && /check:homepage/.test(scripts.prebuild ?? ''), 'Client must run check:homepage before builds');
  let layout = '';
  try { layout = await readFile(resolve(values['client-root'], 'src/layouts/BaseLayout.astro'), 'utf8'); } catch { /* reported below */ }
  report(/<meta\b[^>]*\bname=["']coze-build["']/.test(layout), 'Client must expose its coze-build marker');

  const [schema, homepage, cmsKeys, adminKeys] = await Promise.all([
    get(cms, '/gpt-actions-openapi.yaml'), get(cms, '/api/agent/homepage'),
    get(cms, '/api/agent/admin/keys'), get(admin, '/api/homepage-editor/keys'),
  ]);
  report(schema.status === 200 && /operationId:\s*getHomepage\b/.test(schema.text) && /operationId:\s*applyHomepageChange\b/.test(schema.text), `ChatGPT action schema reachable (HTTP ${schema.status || 'unreachable'})`);
  report(homepage.status === 401, `Homepage API rejects unauthenticated access (HTTP ${homepage.status || 'unreachable'})`);
  report(cmsKeys.status === 401, `CMS key API configured and protected (HTTP ${cmsKeys.status || 'unreachable'}; expected 401, 503 means setup is missing)`);
  report([401, 403].includes(adminKeys.status), `Admin key API deployed and protected (HTTP ${adminKeys.status || 'unreachable'}; expected 401/403)`);
  console.log('\nThese are prerequisite checks only. They do not verify credentials, database migrations, rule safety, publishing or undo.');
  console.log('Next: an authenticated test on an isolated CMS/database/Git branch/preview site.');
  process.exitCode = failures ? 1 : 0;
}
main().catch(() => {
  console.error('Setup check failed. Check the arguments and local file access.');
  process.exitCode = 1;
});
