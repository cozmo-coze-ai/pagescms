import { test } from "node:test";
import assert from "node:assert/strict";
import { Git, previewBuild } from "../src/git.ts";
import type { Env } from "../src/types.ts";
test("only the dedicated preview branch may be force-updated", async () => {
  const git = new Git({} as Env); const calls: any[] = [];
  git.request = async (path, method, body) => { calls.push({ path, method, body }); return { object: { sha: "a".repeat(40) } }; };
  await git.previewBranch(crypto.randomUUID(), "b".repeat(40));
  assert.deepEqual(calls[1], { path: "/git/refs/heads/coze-homepage-preview", method: "PATCH", body: { sha: "b".repeat(40), force: true } });
  calls.length = 0; await git.publish("a".repeat(40), "b".repeat(40));
  assert.deepEqual(calls[1], { path: "/git/refs/heads/main", method: "PATCH", body: { sha: "b".repeat(40), force: false } });
});

test("hosted build records without preview_url resolve exact URLs from paginated logs and verify the commit", async () => {
  const original = globalThis.fetch;
  const commit = 'a'.repeat(40), calls: string[] = [];
  const env = { CF_API_TOKEN: 'synthetic', CF_ACCOUNT_ID: 'account', PREVIEW_WORKER_TAG: 'tag', PREVIEW_HOST_SUFFIX: 'example.workers.dev' } as Env;
  let renderedCommit = commit;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    if (url.includes('/workers/tag/builds')) return Response.json({ result: [{ build_uuid: '3344d543-666e-4d44-b89f-91c15d6769aa', build_outcome: 'success', created_on: '2026-09-29T00:00:00Z', build_trigger_metadata: { commit_hash: commit } }] });
    if (url.endsWith('/logs')) return Response.json({ result: { lines: [[0, 'Building...']], truncated: true, cursor: 'next' } });
    if (url.includes('/logs?cursor=next')) return Response.json({ result: { lines: [[1, 'Version Preview URL: https://12345678-coze-homepage-preview.example.workers.dev'], [2, 'Version Preview Alias URL: https://branch-coze-homepage-preview.example.workers.dev']], truncated: false } });
    return new Response(`<meta name="coze-build" content="${renderedCommit}">`);
  }) as typeof fetch;
  try {
    assert.deepEqual(await previewBuild(env, commit), { state: 'ready', url: 'https://12345678-coze-homepage-preview.example.workers.dev' });
    assert.ok(calls.some(url => url.endsWith('/logs?cursor=next')));
    renderedCommit = 'b'.repeat(40);
    assert.deepEqual(await previewBuild(env, commit), { state: 'building' });
  } finally { globalThis.fetch = original; }
});
