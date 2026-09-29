import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Dependency-free: usable locally and by the existing Cloudflare release check.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const catalog = await json(resolve(repo, '.agents/plugins/marketplace.json'));
assert.equal(catalog.name, 'coze-team');
assert.equal(catalog.plugins.length, 1, 'Review any extra company plugin before adding it.');
const [entry] = catalog.plugins;
assert.equal(entry.source.source, 'local');
assert.equal(entry.source.path, './chatgpt-editor/plugin/coze-editor');
assert.equal(entry.policy.installation, 'AVAILABLE');
assert.equal(entry.policy.authentication, 'ON_INSTALL');

const plugin = await realpath(resolve(repo, entry.source.path));
const fromRepo = relative(await realpath(repo), plugin);
assert(!fromRepo.startsWith('..') && !isAbsolute(fromRepo), 'Plugin source escapes the repository.');
const manifest = await json(resolve(plugin, 'plugin.json'));
const compatibility = await json(resolve(plugin, '.codex-plugin/plugin.json'));
assert.equal(entry.name, manifest.name, 'Catalog and plugin identity differ.');
for (const key of ['name', 'version', 'description', 'author']) {
  assert.deepEqual(manifest[key], compatibility[key], `Plugin manifests disagree on ${key}.`);
}
assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'Use a numbered plugin release.');
const extension = manifest.extensions['com.openai'];
assert.equal(extension.apps, './.app.json');
assert.equal(compatibility.apps, extension.apps);
assert.deepEqual(extension.interface, compatibility.interface);
assert.equal(compatibility.skills, './skills');

async function bundledFile(path) {
  assert(path.startsWith('./'), 'Bundle references must be relative paths.');
  const full = await realpath(resolve(plugin, path));
  const local = relative(plugin, full);
  assert(!local.startsWith('..') && !isAbsolute(local), 'Bundle reference escapes the plugin.');
  assert((await stat(full)).isFile(), `Missing bundled file: ${path}`);
  return full;
}
for (const path of [extension.apps, extension.interface.composerIcon, extension.interface.logo,
  './skills/instructions/SKILL.md', './skills/instructions/agents/openai.yaml']) {
  await bundledFile(path);
}
const apps = await json(resolve(plugin, extension.apps));
assert.deepEqual(Object.keys(apps.apps), ['coze-homepage']);
assert.equal(apps.apps['coze-homepage'].id, 'asdk_app_6abb1da4205c81919a0468aee3675954',
  'Changing the connected app requires verified workspace access and a reviewed connection update.');
// Inline MCP entries make imported plugins desktop-only. Keep the registered app.
for (const name of ['mcp.json', '.mcp.json']) {
  await assert.rejects(stat(resolve(plugin, name)), { code: 'ENOENT' });
}
assert(!manifest.mcpServers && !compatibility.mcpServers && !extension.mcpServers);
console.log(`[plugin] ${catalog.name}: ${manifest.name} ${manifest.version}; catalog, assets and app reference passed.`);
