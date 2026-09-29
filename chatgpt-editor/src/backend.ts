import { z } from "zod";
import { Git, SITE, liveCommit, previewBuild, productionBuild, type Write } from "./git.ts";
import { fail, sha256, type Env, type Store } from "./types.ts";
import { HOME_TEXT_FILES, HOME_IMAGE_DIR, SHARED_COPY_PATHS, applyEdits, homepageErrors, imageInfo, imageNameError, summarizeChange } from "./vendor/homepage-guard.ts";

export const proposalSchema = z.object({
  expectedCommit: z.string().regex(/^[a-f0-9]{40}$/), rationale: z.string().min(3).max(1000),
  edits: z.array(z.union([
    z.object({ path: z.string().max(200), content: z.string().max(80_000) }).strict(),
    z.object({ path: z.string().max(200), find: z.string().min(1).max(20_000), replace: z.string().max(40_000) }).strict(),
  ])).max(30).default([]),
  images: z.array(z.object({ filename: z.string().max(150), downloadUrl: z.string().url() }).strict()).max(5).default([]),
}).strict();
type Draft = {
  id: string; owner: string; base: string; commit: string; created: number; expires: number;
  state: "prepared" | "building" | "ready" | "publishing" | "published";
  summary: unknown; previewUrl?: string; publishedAt?: number; viewed?: boolean; viewToken?: string;
};

async function downloadImage(filename: string, link: string) {
  const invalid = imageNameError(filename);
  if (invalid) fail(invalid);
  const url = new URL(link);
  if (url.protocol !== "https:" || url.username || url.password || !(url.hostname.endsWith(".oaiusercontent.com") || url.hostname === "files.openai.com")) fail("Attach the photo in ChatGPT; arbitrary image URLs are not accepted.");
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "manual" });
  if (!r.ok || !r.body) fail("Could not load the attached photo.");
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); fail("Photo must be under 2 MB."); } chunks.push(value); }
  const bytes = Buffer.concat(chunks);
  const info = imageInfo(bytes);
  if (!info || info.width > 4000 || info.height > 4000) fail("Use a JPG, PNG or WebP photo no larger than 4000px.");
  const ext = filename.split(".").pop();
  if (!(info.type === "jpeg" ? ["jpg", "jpeg"] : [info.type]).includes(ext!)) fail("Photo extension does not match its contents.");
  return { path: `${HOME_IMAGE_DIR}/${filename}`, base64: bytes.toString("base64") };
}

export class Backend {
  constructor(private env: Env, private store: Store, private git = new Git(env), private preview = previewBuild, private live = liveCommit, private production = productionBuild) {}
  async read() {
    const commit = await this.git.head();
    return { commit, homepage: SITE, files: HOME_TEXT_FILES, images: await this.git.images(commit),
      rules: { homepageOnly: true, languages: ["en", "ko", "ja", "zh"], lockedCopy: SHARED_COPY_PATHS, mobileWidths: [320, 390],
        publishing: "Prepare a real preview. Show it to the requester. Ask 'Publish this to www.coze.care?' Call publishHomepage only after their explicit yes. No separate approver." } };
  }
  async file(path: string) {
    if (!HOME_TEXT_FILES.includes(path)) fail("Read only the listed homepage text files.");
    const commit = await this.git.head(); return { commit, path, content: await this.git.read(path, commit) };
  }
  async prepare(owner: string, raw: unknown) {
    if (!this.env.PREVIEW_WORKER_TAG) fail("The preview connection needs setup before creating changes.", 503);
    const input = proposalSchema.parse(raw);
    if (await this.git.head() !== input.expectedCommit) fail("The homepage changed. Read it again.", 409);
    const before = await this.git.files(input.expectedCommit); const after = new Map(before);
    const editErrors = applyEdits(after, input.edits); if (editErrors.length) fail(editErrors.join("\n"));
    const writes: Write[] = await Promise.all(input.images.map(i => downloadImage(i.filename, i.downloadUrl)));
    if (new Set(writes.map(w => w.path)).size !== writes.length) fail("Use distinct image filenames.");
    const existingImages = new Set(await this.git.images(input.expectedCommit));
    writes.forEach(w => existingImages.add(w.path.slice(6)));
    const errors = homepageErrors(before, after, p => existingImages.has(p)); if (errors.length) fail(errors.join("\n"));
    for (const path of HOME_TEXT_FILES) if (before.get(path) !== after.get(path)) writes.push({ path, content: after.get(path)! });
    if (!writes.length) fail("There is no change to preview.");
    const requestKey = `request:${await sha256(JSON.stringify([owner, input.expectedCommit, writes]))}`;
    const previousId = await this.store.get<string>(requestKey);
    if (previousId) { const old = await this.store.get<Draft>(`draft:${previousId}`); if (old && old.expires > Date.now() && old.state !== "prepared") return this.status(owner, old.id); }
    const recent = [...(await this.store.list<Draft>({ prefix: "draft:" })).values()].filter(d => d.created > Date.now() - 3600_000);
    if (recent.length >= 10) fail("Ten previews were created this hour. Combine changes into one preview and try later.", 429);
    const id = crypto.randomUUID();
    const commit = await this.git.createCommit(input.expectedCommit, writes, `Homepage preview: ${input.rationale}`);
    const draft: Draft = { id, owner, base: input.expectedCommit, commit, state: "prepared", created: Date.now(), expires: Date.now() + 86400_000,
      summary: summarizeChange(before, after, writes.filter(w => w.base64).map(w => w.path.slice(6))) };
    await this.store.put(`draft:${id}`, draft);
    await this.git.previewBranch(id, commit);
    draft.state = "building"; await this.store.put(`draft:${id}`, draft); await this.store.put(requestKey, id);
    return { changeId: id, state: "building", summary: draft.summary, next: "Call getHomepageChange until preview is ready. Show the actual preview before asking to publish." };
  }
  private async owned(owner: string, id: string) {
    const draft = await this.store.get<Draft>(`draft:${id}`);
    if (!draft || draft.owner !== owner) fail("This preview is not available to your account.", 404);
    if (draft.expires < Date.now() && draft.state !== "published") fail("The preview expired. Prepare a fresh preview.", 410);
    return draft;
  }
  async status(owner: string, id: string) {
    const draft = await this.owned(owner, id);
    if (draft.state === "publishing" && await this.git.head() === draft.commit) { draft.state = "published"; draft.publishedAt = Date.now(); await this.store.put(`draft:${id}`, draft); }
    if (draft.state === "published") {
      const live = await this.live();
      const state = live === draft.commit ? "live" : live && await this.git.isAncestor(draft.commit, live) ? "superseded" : await this.production(this.env, draft.commit);
      return { changeId: id, commit: draft.commit, state, homepage: SITE };
    }
    const result = await this.preview(this.env, draft.commit);
    if (result.state === "ready") { draft.state = "ready"; draft.previewUrl = result.url; draft.viewToken ??= crypto.randomUUID(); await this.store.put(`draft:${id}`, draft); }
    else if (draft.state === "ready") { draft.state = "building"; draft.viewed = false; draft.viewToken = undefined; await this.store.put(`draft:${id}`, draft); }
    return { changeId: id, commit: draft.commit, state: result.state, previewUrl: result.state === "ready" ? result.url : undefined, summary: draft.summary,
      _viewToken: result.state === "ready" ? draft.viewToken : undefined,
      next: result.state === "ready" ? "Show the actual preview, then ask: Publish this to www.coze.care?" : "The preview is not ready. Do not ask to publish yet." };
  }
  async viewed(owner: string, id: string, viewToken: string) {
    const draft = await this.owned(owner, id);
    if (draft.state !== "ready" || !draft.viewToken || draft.viewToken !== viewToken) fail("Load the current preview first.", 428);
    draft.viewed = true; await this.store.put(`draft:${id}`, draft);
    return { changeId: id, previewShown: true, next: "Ask: Publish this to www.coze.care?" };
  }
  async publish(owner: string, id: string, confirmed: boolean) {
    if (confirmed !== true) fail("Ask the requester: Publish this to www.coze.care? Wait for yes.", 428);
    let draft = await this.owned(owner, id);
    if (draft.state === "published" || draft.state === "publishing") return this.status(owner, id);
    await this.status(owner, id); draft = await this.owned(owner, id);
    if (draft.state !== "ready" || !draft.viewed) fail("Show the actual preview before publishing.", 428);
    if (await this.git.head() !== draft.base) fail("The live source changed. Prepare and view a fresh preview.", 409);
    draft.state = "publishing"; await this.store.put(`draft:${id}`, draft);
    try { await this.git.publish(draft.base, draft.commit); }
    catch (error) { if (await this.git.head() !== draft.commit) { draft.state = "ready"; await this.store.put(`draft:${id}`, draft); throw error; } }
    draft.state = "published"; draft.publishedAt = Date.now(); await this.store.put(`draft:${id}`, draft);
    return { changeId: id, commit: draft.commit, state: "publishing", next: "Call getHomepageChange. Report live only when its state is live." };
  }
  async list(owner: string) {
    return [...(await this.store.list<Draft>({ prefix: "draft:" })).values()].filter(d => d.owner === owner).sort((a, b) => b.created - a.created).slice(0, 20).map(d => ({ changeId: d.id, commit: d.commit, state: d.state, created: d.created, previewUrl: d.expires > Date.now() ? d.previewUrl : undefined }));
  }
}
