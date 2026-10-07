import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Git checkouts may use CRLF on Windows while Cloudflare builds use LF.
// The immutable asset and trigger hash must be identical in both places.
const normalizeLines = value => value.replace(/\r\n/g, '\n');
const worker = normalizeLines(await readFile('infrastructure/homepage-preview/worker.mjs', 'utf8'));
const packager = normalizeLines(await readFile('infrastructure/prepare-homepage-preview.mjs', 'utf8'));
const copyWorker = "await cp(path.join(root, 'scripts/homepage-preview/worker.mjs'), path.join(output, 'worker.mjs'));";
if (packager.split(copyWorker).length !== 2) throw new Error('Preview package entry changed; review bootstrap generation.');
const script = packager.replace(copyWorker, () => `await writeFile(path.join(output, 'worker.mjs'), ${JSON.stringify(worker)});`);
const hash = createHash('sha256').update(script).digest('hex');
const pathname = `/build-assets/${hash}/prepare-homepage-preview.mjs`;
await writeFile('src/preview-assets.generated.ts', `// Generated; served as immutable build tooling. Contains no credentials.\nexport const previewAsset = ${JSON.stringify({ pathname, hash, script })};\n`);
await mkdir('generated', { recursive: true });
await writeFile('generated/preview-trigger.json', JSON.stringify({
  build_command: `npm run build && mkdir -p .coze-preview && curl -fsS --max-time 30 https://coze-homepage-editor.cozmo-ca1.workers.dev${pathname} -o .coze-preview/prepare.mjs && echo '${hash}  .coze-preview/prepare.mjs' | sha256sum -c && node .coze-preview/prepare.mjs`,
  deploy_command: 'npx wrangler versions upload --config dist/homepage-preview.wrangler.json',
  asset_sha256: hash,
}, null, 2));
