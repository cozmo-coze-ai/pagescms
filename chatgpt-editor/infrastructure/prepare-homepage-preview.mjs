import { readdir, readFile, mkdir, copyFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function prepareHomepagePreview(root, commit) {
const source = path.join(root, 'dist/client');
// A new directory for each exact build avoids stale assets without deleting files.
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full Git commit.');
const output = path.join(root, 'dist', `homepage-preview-${commit}`);
const assets = path.join(output, 'assets');
const homeHtml = new Set(['index.html', 'ko/index.html', 'ja/index.html', 'zh/index.html']);
for (const relative of homeHtml) {
  const html = await readFile(path.join(source, relative), 'utf8');
  if (!html.includes(`name="coze-build" content="${commit}"`)) throw new Error(`Homepage ${relative} was not built from this commit.`);
}
async function copy(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { await copy(path.join(directory, entry.name), name); continue; }
    if (!entry.isFile()) continue;
    if (!homeHtml.has(name) && !/\.(?:css|js|mjs|png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|webmanifest)$/i.test(name)) continue;
    await mkdir(path.dirname(path.join(assets, name)), { recursive: true });
    await copyFile(path.join(directory, entry.name), path.join(assets, name));
  }
}
await copy(source);
await cp(path.join(root, 'scripts/homepage-preview/worker.mjs'), path.join(output, 'worker.mjs'));
const config = { name: 'coze-homepage-preview', main: 'worker.mjs', compatibility_date: '2026-09-24', workers_dev: true, preview_urls: true,
  assets: { directory: './assets', binding: 'ASSETS', run_worker_first: true } };
await writeFile(path.join(output, 'wrangler.json'), JSON.stringify(config, null, 2));
// A stable deploy config pointer: relative paths must stay relative to this file.
await writeFile(path.join(root, 'dist/homepage-preview.wrangler.json'), JSON.stringify({ ...config,
  main: `./homepage-preview-${commit}/worker.mjs`, assets: { ...config.assets, directory: `./homepage-preview-${commit}/assets` } }, null, 2));
console.log(`Homepage-only preview prepared for ${commit}. No APIs or production bindings included.`);
return output;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  await prepareHomepagePreview(root, commit);
}
