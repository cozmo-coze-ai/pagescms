import { fail, type Env } from "./types.ts";
import { HOME_TEXT_FILES, HOME_IMAGE_DIR, isEditablePath } from "./vendor/homepage-guard.ts";
import { isSitePagePath, sitePageFiles, SITE_PAGE_CONFIG, type SitePage } from "./site-page-guard.ts";
import { isUiTextPath, isUiWritePath } from "./ui-guard.ts";

export const REPO = "cozmo-coze-ai/coze_client";
export const SITE = "https://www.coze.care";
export type Write = { path: string; content?: string; base64?: string };
export class Git {
  constructor(private env: Env) {}
  async request(path: string, method = "GET", body?: unknown, allowMissing = false): Promise<any> {
    if (!this.env.GITHUB_TOKEN) fail("The COZE GitHub connection needs setup.", 503);
    const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
      method, headers: { authorization: `Bearer ${this.env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "coze-homepage-editor", "content-type": "application/json", "x-github-api-version": "2022-11-28" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000), redirect: "manual",
    });
    if (r.status === 404 && allowMissing) return null;
    if (!r.ok) fail(`GitHub request failed (${r.status}). ${r.status === 409 || r.status === 422 ? "Read the current homepage and prepare a fresh preview." : "Ask the owner to check the connection."}`, r.status === 409 || r.status === 422 ? 409 : 502);
    return r.json();
  }
  async head() { return (await this.request("/git/ref/heads/main")).object.sha as string; }
  async read(path: string, commit: string): Promise<string> {
    if (!isEditablePath(path) || !/^[a-f0-9]{40}$/.test(commit)) fail("Only homepage files at an exact commit can be read.");
    return this.readFile(path, commit);
  }
  private async readFile(path: string, commit: string): Promise<string> {
    const file = await this.request(`/contents/${path}?ref=${commit}`);
    if (file.type !== "file") fail("Not a homepage file.");
    const blob = file.encoding === "base64" && file.content ? file : await this.request(`/git/blobs/${file.sha}`);
    return Buffer.from(blob.content.replace(/\s/g, ""), "base64").toString("utf8");
  }
  async files(commit: string) { return new Map(await Promise.all(HOME_TEXT_FILES.map(async p => [p, await this.read(p, commit)] as const))); }
  async readSitePage(page: SitePage, path: string, commit: string) {
    if (!sitePageFiles(page).includes(path) || !/^[a-f0-9]{40}$/.test(commit)) fail("Only the selected page's text files at an exact commit can be read.");
    return this.readFile(path, commit);
  }
  async sitePageFiles(page: SitePage, commit: string) {
    return new Map(await Promise.all(sitePageFiles(page).map(async path => [path, await this.readSitePage(page, path, commit)] as const)));
  }
  async images(commit: string): Promise<string[]> {
    const entries = await this.request(`/contents/${HOME_IMAGE_DIR}?ref=${commit}`);
    return entries.filter((e: any) => e.type === "file" && isEditablePath(e.path)).map((e: any) => e.path.slice(6));
  }
  async sitePageImages(page: SitePage, commit: string): Promise<string[]> {
    const directory = SITE_PAGE_CONFIG[page].imageDir;
    const entries = await this.request(`/contents/${directory}?ref=${commit}`, "GET", undefined, true);
    return Array.isArray(entries) ? entries.filter((entry: any) => entry.type === "file" && isSitePagePath(page, entry.path)).map((entry: any) => entry.path.slice(7)) : [];
  }
  async uiFiles(commit: string): Promise<string[]> {
    if (!/^[a-f0-9]{40}$/.test(commit)) fail("Read UI files at an exact commit.");
    const tree = await this.request(`/git/trees/${commit}?recursive=1`);
    if (tree.truncated) fail("The site file list is incomplete. Ask the owner to check the GitHub connection.", 502);
    return (tree.tree ?? []).filter((entry: any) => entry.type === "blob" && isUiTextPath(entry.path)).map((entry: any) => entry.path).sort();
  }
  async readUiFile(path: string, commit: string) {
    if (!isUiTextPath(path) || !/^[a-f0-9]{40}$/.test(commit)) fail("Only existing public UI files at an exact commit can be read.");
    return this.readFile(path, commit);
  }
  async uiImages(commit: string): Promise<string[]> {
    const entries = await this.request(`/contents/public/editor-ui?ref=${commit}`, "GET", undefined, true);
    return Array.isArray(entries) ? entries.filter((entry: any) => entry.type === "file" && isUiWritePath(entry.path)).map((entry: any) => entry.path.slice(7)) : [];
  }
  async createCommit(parent: string, writes: Write[], message: string, page?: SitePage | "ui") {
    if (writes.length === 0 || writes.some(w => !(page === "ui" ? isUiWritePath(w.path) : page ? isSitePagePath(page, w.path) : isEditablePath(w.path)))) fail("Only files allowed for this page may change.");
    const tree = await Promise.all(writes.map(async w => w.content !== undefined
      ? { path: w.path, mode: "100644", type: "blob", content: w.content }
      : { path: w.path, mode: "100644", type: "blob", sha: (await this.request("/git/blobs", "POST", { content: w.base64, encoding: "base64" })).sha }));
    const base = await this.request(`/git/commits/${parent}`);
    const next = await this.request("/git/trees", "POST", { base_tree: base.tree.sha, tree });
    return (await this.request("/git/commits", "POST", { message, parents: [parent], tree: next.sha })).sha as string;
  }
  async previewBranch(id: string, commit: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) fail("Invalid preview id.");
    // Workers Builds accepts an exact production branch, not prefix patterns.
    // Only this dedicated preview ref may be replaced. Drafts retain their
    // exact commits and version URLs; main always uses force:false below.
    const ref = "heads/coze-homepage-preview";
    const previous = await this.request(`/git/ref/${ref}`, "GET", undefined, true);
    if (previous) await this.request(`/git/refs/${ref}`, "PATCH", { sha: commit, force: true });
    else await this.request("/git/refs", "POST", { ref: `refs/${ref}`, sha: commit });
  }
  async publish(base: string, commit: string) {
    if (await this.head() !== base) fail("The homepage changed. Prepare and view a new preview before publishing.", 409);
    await this.request("/git/refs/heads/main", "PATCH", { sha: commit, force: false });
  }
  async isAncestor(ancestor: string, descendant: string) {
    if (!/^[a-f0-9]{40}$/.test(ancestor) || !/^[a-f0-9]{40}$/.test(descendant)) return false;
    const result = await this.request(`/compare/${ancestor}...${descendant}`);
    return result.status === "ahead" || result.status === "identical";
  }
}

export async function liveCommit(url = SITE) {
  const checkUrl = new URL(url);
  checkUrl.searchParams.set("coze-build-check", String(Date.now()));
  const r = await fetch(checkUrl, { signal: AbortSignal.timeout(15_000), redirect: "manual" });
  if (!r.ok) return null;
  const html = await r.text();
  return /<meta\s+name="coze-build"\s+content="([a-f0-9]{40})"/.exec(html)?.[1] ?? null;
}

export async function findBuild(env: Env, tag: string, commit: string) {
  if (!env.CF_API_TOKEN || !tag) fail("The Cloudflare build connection needs setup.", 503);
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/builds/workers/${tag}/builds?per_page=100`, {
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) fail("Could not read preview build status.", 502);
  const data: any = await r.json();
  return data.result?.filter((b: any) => b.build_trigger_metadata?.commit_hash === commit)
    .sort((a: any, b: any) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
}

export async function productionBuild(env: Env, commit: string) {
  const build = await findBuild(env, env.PRODUCTION_WORKER_TAG, commit);
  if (!build) return "queued";
  if (build.build_outcome && build.build_outcome !== "success") return "failed";
  return build.build_outcome === "success" ? "deployed" : "building";
}

export async function previewBuild(env: Env, commit: string) {
  if (!env.PREVIEW_HOST_SUFFIX) fail("The isolated preview build needs setup.", 503);
  const build = await findBuild(env, env.PREVIEW_WORKER_TAG, commit);
  if (!build) return { state: "queued" as const };
  if (build.build_outcome && build.build_outcome !== "success") return { state: "failed" as const };
  if (build.build_outcome !== "success") return { state: "building" as const };
  // Workers Builds does not currently return the version URL on a build record.
  // Read Wrangler's exact-version URL from this successful commit's build log;
  // never use the mutable branch alias. Verify its origin and HTML commit below.
  let previewUrl = build.preview_url;
  if (!previewUrl) {
    if (!/^[a-f0-9-]{36}$/.test(build.build_uuid)) fail("Invalid preview build record.", 502);
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/builds/builds/${build.build_uuid}/logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {
        headers: { authorization: `Bearer ${env.CF_API_TOKEN}` }, signal: AbortSignal.timeout(15_000), redirect: "manual",
      });
      if (!response.ok) fail("Could not read the preview version URL.", 502);
      const log: any = await response.json();
      for (const line of log.result?.lines ?? []) {
        const match = /^Version Preview URL:\s+(https:\/\/\S+)\s*$/.exec(String(line[1]));
        if (match) previewUrl = match[1];
      }
      if (!log.result?.truncated || !log.result.cursor || cursor === log.result.cursor) break;
      cursor = log.result.cursor;
    }
  }
  if (!previewUrl) fail("The preview built but its version URL is not configured.", 503);
  const url = new URL(previewUrl);
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(`-coze-homepage-preview.${env.PREVIEW_HOST_SUFFIX}`)) fail("Unexpected preview URL.", 502);
  const origin = url.origin;
  if (await liveCommit(origin) !== commit) return { state: "building" as const };
  return { state: "ready" as const, url: origin };
}
