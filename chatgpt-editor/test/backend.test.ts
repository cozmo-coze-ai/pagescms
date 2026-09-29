import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Backend } from "../src/backend.ts";
import { Git } from "../src/git.ts";
import { HOME_TEXT_FILES, HOME_PAGE_FILE } from "../src/vendor/homepage-guard.ts";
import { member, sha256, type Env, type Store } from "../src/types.ts";
import { boundedText } from "../src/http.ts";

class MemoryStore implements Store {
  values = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async delete(key: string) { this.values.delete(key); }
  async list<T>({ prefix = "" } = {}) { return new Map([...this.values].filter(([k]) => k.startsWith(prefix))) as Map<string, T>; }
}
const base = "a".repeat(40), commit = "b".repeat(40);
const page = "---\nimport BaseLayout from '../../layouts/BaseLayout.astro'\nimport { getHomeDict } from '../../i18n/pages/home'\n---\n<BaseLayout><main></main></BaseLayout><style>.hero{gap:24px}</style>";
function fixture() {
  const files = new Map(HOME_TEXT_FILES.map(p => [p, p === HOME_PAGE_FILE ? page : JSON.stringify({ hero: { heading: "COZE" }, nav: { home: "Home" } })]));
  let head = base; let publishes = 0; let creates = 0; let previewReady = true; let live: string | null = null; let failAfterWrite = false;
  const store = new MemoryStore();
  const git = { head: async () => head, files: async () => files, images: async () => [],
    createCommit: async () => { creates++; return commit; }, previewBranch: async () => {},
    publish: async (expected: string, next: string) => { assert.equal(expected, head); publishes++; head = next; if (failAfterWrite) throw new Error("response lost"); },
    isAncestor: async () => false,
  } as unknown as Git;
  const backend = new Backend({ PREVIEW_WORKER_TAG: "preview" } as Env, store, git,
    async () => previewReady ? { state: "ready", url: "https://abcd-coze-homepage-preview.example.workers.dev" } : { state: "failed" }, async () => live, async () => "failed");
  const proposal = { expectedCommit: base, rationale: "Reduce spacing on phones", edits: [{ path: HOME_PAGE_FILE, find: "gap:24px", replace: "gap:16px" }] };
  return { backend, store, proposal, setHead: (v: string) => head = v, failPreview: () => previewReady = false, setLive: () => live = commit, loseResponse: () => failAfterWrite = true,
    counts: () => ({ publishes, creates, head }) };
}
test("prepare creates only a preview; identical requests are idempotent", async () => {
  const f = fixture(); const draft = await f.backend.prepare("alice", f.proposal);
  const repeated = await f.backend.prepare("alice", f.proposal);
  assert.equal(draft.changeId, repeated.changeId);
  assert.deepEqual(f.counts(), { publishes: 0, creates: 1, head: base });
});
test("publication requires explicit true, a verified preview and the UI-only token", async () => {
  const f = fixture(); const { changeId } = await f.backend.prepare("alice", f.proposal);
  await assert.rejects(f.backend.publish("alice", changeId, false), /Wait for yes/);
  await assert.rejects(f.backend.publish("alice", changeId, true), /Show the actual preview/);
  await assert.rejects(f.backend.viewed("alice", changeId, "forged"), /Load the current preview/);
  const status = await f.backend.status("alice", changeId);
  await f.backend.viewed("alice", changeId, status._viewToken!);
  await f.backend.publish("alice", changeId, true);
  await f.backend.publish("alice", changeId, true);
  assert.equal(f.counts().publishes, 1);
  assert.equal((await f.backend.status("alice", changeId)).state, "failed");
  f.setLive(); assert.equal((await f.backend.status("alice", changeId)).state, "live");
});
test("other users cannot inspect, acknowledge, or publish a draft", async () => {
  const f = fixture(); const { changeId } = await f.backend.prepare("alice", f.proposal);
  await assert.rejects(f.backend.status("bob", changeId), /not available/);
  await assert.rejects(f.backend.viewed("bob", changeId, "anything"), /not available/);
  await assert.rejects(f.backend.publish("bob", changeId, true), /not available/);
  assert.deepEqual(await f.backend.list("bob"), []);
});
test("stale base and newly failed preview cannot overwrite the homepage", async () => {
  const f = fixture(); const { changeId } = await f.backend.prepare("alice", f.proposal);
  const s = await f.backend.status("alice", changeId); await f.backend.viewed("alice", changeId, s._viewToken!);
  f.setHead("c".repeat(40)); await assert.rejects(f.backend.publish("alice", changeId, true), /source changed/);
  f.setHead(base); f.failPreview(); await assert.rejects(f.backend.publish("alice", changeId, true), /Show the actual preview/);
  assert.equal(f.counts().publishes, 0);
});
test("lost publication response is recovered without a second commit", async () => {
  const f = fixture(); const { changeId } = await f.backend.prepare("alice", f.proposal);
  const s = await f.backend.status("alice", changeId); await f.backend.viewed("alice", changeId, s._viewToken!);
  f.loseResponse(); await f.backend.publish("alice", changeId, true);
  await f.backend.publish("alice", changeId, true); assert.equal(f.counts().publishes, 1);
});
test("expired preview, out-of-scope writes, injected code and shared copy are refused", async () => {
  const f = fixture(); const { changeId } = await f.backend.prepare("alice", f.proposal);
  const draft: any = await f.store.get(`draft:${changeId}`); draft.expires = 1; await f.store.put(`draft:${changeId}`, draft);
  await assert.rejects(f.backend.publish("alice", changeId, true), /expired/);
  for (const edit of [
    { path: "wrangler.jsonc", content: "{}" },
    { path: HOME_PAGE_FILE, find: "<main>", replace: "<main onclick='alert(1)'>" },
    { path: HOME_PAGE_FILE, find: "<main>", replace: "<main><script>alert(1)</script>" },
    { path: "src/i18n/pages/home/en.json", find: '"Home"', replace: '"Elsewhere"' },
  ]) await assert.rejects(f.backend.prepare("alice", { ...f.proposal, edits: [edit] }));
  assert.equal(f.counts().publishes, 0);
});
test("revocation is checked against current team membership", async () => {
  const record = { id: "alice", name: "Alice", keyHash: await sha256("test"), enabled: true };
  assert.ok(member({ TEAM_MEMBERS_JSON: JSON.stringify([record]) } as Env, "alice"));
  record.enabled = false; assert.equal(member({ TEAM_MEMBERS_JSON: JSON.stringify([record]) } as Env, "alice"), undefined);
});
test("streaming oversized requests are refused without trusting Content-Length", async () => {
  await assert.rejects(boundedText(new Request("https://example.test", { method: "POST", body: "x".repeat(20) }), 10), /too large/);
});
test("vendored rules match the CMS guard across checkout line endings", async () => {
  const [vendored, cms] = await Promise.all([
    readFile(new URL("../src/vendor/homepage-guard.ts", import.meta.url), "utf8"),
    readFile(new URL("../../lib/homepage-guard.ts", import.meta.url), "utf8"),
  ]);
  assert.equal(vendored.replace(/\r\n/g, "\n"), cms.replace(/\r\n/g, "\n"));
});
