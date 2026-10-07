import { test } from "node:test";
import assert from "node:assert/strict";
import { UiBackend } from "../src/ui-backend.ts";
import { Git } from "../src/git.ts";
import type { Env, Store } from "../src/types.ts";

class MemoryStore implements Store {
  values = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, structuredClone(value)); }
  async delete(key: string) { this.values.delete(key); }
  async list<T>({ prefix = "" } = {}) { return new Map([...this.values].filter(([key]) => key.startsWith(prefix))) as Map<string, T>; }
}

const base = "a".repeat(40), commit = "b".repeat(40);
const path = "src/pages/itineraries/experiences.astro";
const content = "---\nconst title = 'Experience';\n---\n<main><h1>{title}</h1></main><style>.grid{gap:24px}</style>";
function fixture() {
  let head = base, publicLive = false, previewRendered = true, publishes = 0;
  const git = {
    head: async () => head,
    uiFiles: async () => [path],
    readUiFile: async () => content,
    uiImages: async () => [],
    createCommit: async (_base: string, writes: { path: string }[], _message: string, scope: string) => { assert.equal(scope, "ui"); assert.deepEqual(writes.map(write => write.path), [path]); return commit; },
    previewBranch: async () => {},
    publish: async () => { publishes++; head = commit; },
    isAncestor: async () => false,
  } as unknown as Git;
  const backend = new UiBackend({ PREVIEW_WORKER_TAG: "preview" } as Env, new MemoryStore(), git,
    async () => ({ state: "ready", url: "https://abcd-coze-homepage-preview.example.workers.dev" }),
    async url => url?.startsWith("https://www.coze.care") ? publicLive ? commit : null : previewRendered ? commit : null,
    async () => "building");
  const proposal = { expectedCommit: base, previewPath: "/itineraries/experiences/", rationale: "Improve the listing grid", edits: [{ path, find: "gap:24px", replace: "gap:16px" }] };
  return { backend, proposal, setLive: () => publicLive = true, setPreviewRendered: (value: boolean) => previewRendered = value, counts: () => ({ publishes, head }), setHead: (value: string) => head = value };
}

test("UI changes stay private until their real route preview loads and the requester confirms", async () => {
  const f = fixture();
  const overview = await f.backend.files("src/pages/itineraries/");
  assert.deepEqual(overview.files, [path]);
  assert.equal((await f.backend.file(path)).commit, base);
  const prepared = await f.backend.prepare("alice", f.proposal);
  assert.equal(prepared.state, "building");
  assert.equal(f.counts().head, base);
  await assert.rejects(f.backend.publish("alice", prepared.changeId, false), /Wait for yes/);
  await assert.rejects(f.backend.publish("alice", prepared.changeId, true), /Show the actual UI preview/);
  const ready = await f.backend.status("alice", prepared.changeId);
  assert.equal(ready.previewPath, "/itineraries/experiences/");
  await assert.rejects(f.backend.viewed("alice", prepared.changeId, "forged"), /Load the current preview/);
  await f.backend.viewed("alice", prepared.changeId, ready._viewToken!);
  await f.backend.publish("alice", prepared.changeId, true);
  assert.deepEqual(f.counts(), { publishes: 1, head: commit });
  f.setLive();
  assert.equal((await f.backend.status("alice", prepared.changeId)).state, "live");
});

test("a built preview without the selected public route cannot be acknowledged or published", async () => {
  const f = fixture();
  f.setPreviewRendered(false);
  const { changeId } = await f.backend.prepare("alice", f.proposal);
  assert.equal((await f.backend.status("alice", changeId)).state, "failed");
  await assert.rejects(f.backend.publish("alice", changeId, true), /Show the actual UI preview/);
  assert.equal(f.counts().publishes, 0);
});

test("UI drafts reject other owners, stale source and backend paths", async () => {
  const f = fixture();
  const { changeId } = await f.backend.prepare("alice", f.proposal);
  await assert.rejects(f.backend.status("bob", changeId), /not available/);
  await assert.rejects(f.backend.file("src/pages/api/payments/checkout.ts"), /outside/);
  await assert.rejects(f.backend.prepare("alice", { ...f.proposal, edits: [{ path: "src/pages/api/payments/checkout.ts", content: "unsafe" }] }), /Cannot edit/);
  await assert.rejects(f.backend.prepare("alice", { ...f.proposal, previewPath: "/about/" }), /Preview \/itineraries\/experiences\//);
  f.setHead("c".repeat(40));
  await assert.rejects(f.backend.prepare("alice", f.proposal), /site changed/);
});
