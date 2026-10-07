import { test } from "node:test";
import assert from "node:assert/strict";
import { SitePageBackend } from "../src/site-page-backend.ts";
import { SITE_PAGE_CONFIG, sitePageFiles, type SitePage } from "../src/site-page-guard.ts";
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
function fixture(page: SitePage = "about") {
  const config = SITE_PAGE_CONFIG[page];
  const files = new Map(sitePageFiles(page).map(path => [path, path === config.layout
    ? "---\nconst fixed = true\n---\n<BaseLayout><main>{t.head.title}</main></BaseLayout><style>.hero{gap:24px}</style>"
    : `const ${path.split("/").pop()!.slice(0, 2)} = { head: { title: "Hello" } };` ]));
  let head = base, published = 0, live: string | null = null;
  const store = new MemoryStore();
  const git = {
    head: async () => head,
    sitePageFiles: async () => files,
    sitePageImages: async () => [],
    readSitePage: async (_page: SitePage, path: string) => files.get(path),
    createCommit: async (_base: string, writes: { path: string }[], _message: string, selected: SitePage) => {
      assert.equal(selected, page); assert.ok(writes.every(write => write.path === config.layout)); return commit;
    },
    previewBranch: async () => {},
    publish: async (expected: string, next: string) => { assert.equal(expected, head); published++; head = next; },
    isAncestor: async () => false,
  } as unknown as Git;
  const backend = new SitePageBackend({ PREVIEW_WORKER_TAG: "preview" } as Env, store, git,
    async () => ({ state: "ready", url: "https://abcd-coze-homepage-preview.example.workers.dev" }), async () => live, async () => "building");
  const proposal = { page, expectedCommit: base, rationale: "Improve small-screen spacing", edits: [{ path: config.layout, find: "gap:24px", replace: "gap:16px" }] };
  return { backend, proposal, store, setLive: () => live = commit, setHead: (value: string) => head = value, counts: () => ({ published, head }) };
}

test("page changes remain private until the exact preview is shown and explicitly approved", async () => {
  const f = fixture();
  const prepared = await f.backend.prepare("alice", f.proposal);
  assert.equal(prepared.state, "building");
  assert.equal(f.counts().head, base);
  const repeated = await f.backend.prepare("alice", f.proposal);
  assert.equal(repeated.changeId, prepared.changeId);
  await assert.rejects(f.backend.publish("alice", "about", prepared.changeId, false), /Wait for yes/);
  await assert.rejects(f.backend.publish("alice", "about", prepared.changeId, true), /Show the actual page preview/);
  const ready = await f.backend.status("alice", "about", prepared.changeId);
  assert.equal(ready.pagePath, "/about");
  await assert.rejects(f.backend.viewed("alice", "about", prepared.changeId, "forged"), /Load the current preview/);
  await f.backend.viewed("alice", "about", prepared.changeId, ready._viewToken!);
  await f.backend.publish("alice", "about", prepared.changeId, true);
  assert.deepEqual(f.counts(), { published: 1, head: commit });
  f.setLive();
  assert.equal((await f.backend.status("alice", "about", prepared.changeId)).state, "live");
});

test("page and owner boundaries reject cross-page drafts and unrelated files", async () => {
  const f = fixture("explore");
  const { changeId } = await f.backend.prepare("alice", f.proposal);
  await assert.rejects(f.backend.status("alice", "about", changeId), /not available/);
  await assert.rejects(f.backend.status("bob", "explore", changeId), /not available/);
  await assert.rejects(f.backend.file("explore", SITE_PAGE_CONFIG.about.layout), /Read only files/);
  assert.deepEqual(await f.backend.list("bob", "explore"), []);
  assert.deepEqual(await f.backend.list("alice", "about"), []);
  f.setHead("c".repeat(40));
  await assert.rejects(f.backend.prepare("alice", f.proposal), /site changed/);
});
