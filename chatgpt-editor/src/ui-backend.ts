import { z } from "zod";
import { downloadImage, proposalSchema } from "./backend.ts";
import { Git, SITE, liveCommit, previewBuild, productionBuild, type Write } from "./git.ts";
import { fail, sha256, type Env, type Store } from "./types.ts";
import { applyUiEdits, isUiTextPath, isUiWritePath, normalizePreviewPath, uiImageDirectory, uiPreviewCoverageError, uiTextErrors, uiTranslationErrors } from "./ui-guard.ts";

export const uiProposalSchema = proposalSchema.extend({ previewPath: z.string().max(200) });

type UiDraft = {
  id: string; owner: string; base: string; commit: string; previewPath: string; created: number; expires: number;
  state: "prepared" | "building" | "ready" | "publishing" | "published";
  summary: unknown; previewUrl?: string; publishedAt?: number; viewed?: boolean; viewToken?: string;
};

export class UiBackend {
  constructor(private env: Env, private store: Store, private git = new Git(env), private preview = previewBuild, private live = liveCommit, private production = productionBuild) {}

  async files(prefix = "") {
    if (prefix && (!/^[a-zA-Z0-9_./\[\]-]{1,100}$/.test(prefix) || prefix.includes(".."))) fail("Use a source directory prefix such as src/components/ or src/pages/.");
    const commit = await this.git.head();
    const files = (await this.git.uiFiles(commit)).filter(path => path.startsWith(prefix));
    return { commit, files, count: files.length, rules: "Existing non-manual public Astro markup, React JSX presentation, CSS and Git-owned page copy only. React state/handlers, Astro frontmatter/scripts, APIs, data access, payments and booking logic are locked. Homepage layout/copy and CMS itinerary content retain their dedicated tools. The selected route must exist in the isolated preview build before publishing." };
  }

  async file(path: string) {
    if (!isUiTextPath(path)) fail("That file is outside the public UI editor.");
    const commit = await this.git.head();
    if (!(await this.git.uiFiles(commit)).includes(path)) fail("UI edits can only change existing files.");
    return { commit, path, content: await this.git.readUiFile(path, commit) };
  }

  async prepare(owner: string, raw: unknown) {
    if (!this.env.PREVIEW_WORKER_TAG) fail("The isolated preview connection needs setup.", 503);
    const input = uiProposalSchema.parse(raw);
    let previewPath: string;
    try { previewPath = normalizePreviewPath(input.previewPath); }
    catch (error) { fail(error instanceof Error ? error.message : "Choose a valid public page path."); }
    if (await this.git.head() !== input.expectedCommit) fail("The site changed. Read the current UI files again.", 409);
    const listed = new Set(await this.git.uiFiles(input.expectedCommit));
    const changed = [...new Set(input.edits.map(edit => edit.path))];
    if (changed.length > 12) fail("Change at most 12 existing UI files in one preview.");
    for (const path of changed) if (!isUiTextPath(path) || !listed.has(path)) fail(`Cannot edit ${path}: use an existing public UI file.`);
    const required = new Set(changed);
    for (const path of changed.filter(path => path.endsWith(".ts"))) {
      const directory = path.slice(0, path.lastIndexOf("/") + 1);
      for (const lang of ["en", "ko", "ja", "zh"]) if (listed.has(`${directory}${lang}.ts`)) required.add(`${directory}${lang}.ts`);
    }
    const before = new Map(await Promise.all([...required].map(async path => [path, await this.git.readUiFile(path, input.expectedCommit)] as const)));
    const after = new Map(before);
    const editErrors = applyUiEdits(after, input.edits);
    if (editErrors.length) fail(editErrors.join("\n"));
    const writes: Write[] = await Promise.all(input.images.map(image => downloadImage(image.filename, image.downloadUrl, uiImageDirectory)));
    if (new Set(writes.map(write => write.path)).size !== writes.length) fail("Use distinct image filenames.");
    const images = new Set(await this.git.uiImages(input.expectedCommit));
    writes.forEach(write => images.add(write.path.slice(7)));
    const errors: string[] = [];
    for (const path of changed) {
      const coverage = uiPreviewCoverageError(path, previewPath, before.get(path)!);
      if (coverage) errors.push(coverage);
      errors.push(...uiTextErrors(path, before.get(path)!, after.get(path)!));
    }
    errors.push(...uiTranslationErrors(before, after));
    const changedText = changed.map(path => after.get(path) ?? "").join("\n");
    for (const match of changedText.matchAll(/\/editor-ui\/([a-z0-9-]+\.(?:jpe?g|png|webp))/g)) if (!images.has(`editor-ui/${match[1]}`)) errors.push(`Image /editor-ui/${match[1]} does not exist; attach it with this proposal.`);
    for (const write of writes) if (!changedText.includes(`/${write.path.slice(7)}`)) errors.push(`Attached photo ${write.path} must appear in the UI preview.`);
    if (errors.length) fail([...new Set(errors)].join("\n"));
    for (const path of changed) if (before.get(path) !== after.get(path)) writes.push({ path, content: after.get(path)! });
    if (!writes.length) fail("There is no UI change to preview.");
    if (writes.some(write => !isUiWritePath(write.path))) fail("A file is outside the public UI editor.");
    const requestKey = `ui-request:${await sha256(JSON.stringify([owner, input.expectedCommit, previewPath, writes]))}`;
    const previousId = await this.store.get<string>(requestKey);
    if (previousId) { const old = await this.store.get<UiDraft>(`ui-draft:${previousId}`); if (old && old.expires > Date.now() && old.state !== "prepared") return this.status(owner, old.id); }
    const recent = [...(await this.store.list<UiDraft>({ prefix: "ui-draft:" })).values()].filter(draft => draft.created > Date.now() - 3600_000);
    if (recent.length >= 10) fail("Ten UI previews were created this hour. Combine changes and try later.", 429);
    const id = crypto.randomUUID();
    const commit = await this.git.createCommit(input.expectedCommit, writes, `UI preview ${previewPath}: ${input.rationale}`, "ui");
    const draft: UiDraft = { id, owner, base: input.expectedCommit, commit, previewPath, state: "prepared", created: Date.now(), expires: Date.now() + 86400_000,
      summary: { previewPath, changedFiles: changed.filter(path => before.get(path) !== after.get(path)), newImages: writes.filter(write => write.base64).map(write => write.path.slice(7)), liveUrl: `${SITE}${previewPath}` } };
    await this.store.put(`ui-draft:${id}`, draft);
    await this.git.previewBranch(id, commit);
    draft.state = "building"; await this.store.put(`ui-draft:${id}`, draft);
    await this.store.put(requestKey, id);
    return { kind: "ui", changeId: id, state: "building", summary: draft.summary, next: "Check getUiChange until ready, then show the exact public-page preview before asking to publish." };
  }

  private async owned(owner: string, id: string) {
    const draft = await this.store.get<UiDraft>(`ui-draft:${id}`);
    if (!draft || draft.owner !== owner) fail("This UI preview is not available to your account.", 404);
    if (draft.expires < Date.now() && draft.state !== "published") fail("The preview expired. Prepare a fresh preview.", 410);
    return draft;
  }

  async status(owner: string, id: string) {
    const draft = await this.owned(owner, id);
    if (draft.state === "publishing" && await this.git.head() === draft.commit) { draft.state = "published"; draft.publishedAt = Date.now(); await this.store.put(`ui-draft:${id}`, draft); }
    if (draft.state === "published") {
      const live = await this.live(`${SITE}${draft.previewPath}`);
      const state = live === draft.commit ? "live" : live && await this.git.isAncestor(draft.commit, live) ? "superseded" : await this.production(this.env, draft.commit);
      return { kind: "ui", changeId: id, commit: draft.commit, state, liveUrl: `${SITE}${draft.previewPath}` };
    }
    const result = await this.preview(this.env, draft.commit);
    if (result.state === "ready" && await this.live(`${result.url}${draft.previewPath}`) !== draft.commit) {
      draft.state = "building"; draft.viewed = false; draft.viewToken = undefined;
      await this.store.put(`ui-draft:${id}`, draft);
      return { kind: "ui", changeId: id, commit: draft.commit, state: "failed", reason: `The isolated preview did not render ${draft.previewPath}. Choose a public page produced by the site build.` };
    }
    if (result.state === "ready") { draft.state = "ready"; draft.previewUrl = result.url; draft.viewToken ??= crypto.randomUUID(); await this.store.put(`ui-draft:${id}`, draft); }
    else if (draft.state === "ready") { draft.state = "building"; draft.viewed = false; draft.viewToken = undefined; await this.store.put(`ui-draft:${id}`, draft); }
    return { kind: "ui", previewPath: draft.previewPath, changeId: id, commit: draft.commit, state: result.state,
      previewUrl: result.state === "ready" ? result.url : undefined, summary: draft.summary,
      _viewToken: result.state === "ready" ? draft.viewToken : undefined,
      next: result.state === "ready" ? "Show the actual public-page preview, then ask: Publish this to www.coze.care?" : "The preview is not ready. Do not ask to publish yet." };
  }

  async viewed(owner: string, id: string, viewToken: string) {
    const draft = await this.owned(owner, id);
    if (draft.state !== "ready" || draft.viewToken !== viewToken) fail("Load the current preview first.", 428);
    draft.viewed = true; await this.store.put(`ui-draft:${id}`, draft);
    return { kind: "ui", changeId: id, previewShown: true, next: "Ask: Publish this to www.coze.care?" };
  }

  async publish(owner: string, id: string, confirmed: boolean) {
    if (confirmed !== true) fail("Ask the requester: Publish this to www.coze.care? Wait for yes.", 428);
    let draft = await this.owned(owner, id);
    if (draft.state === "published" || draft.state === "publishing") return this.status(owner, id);
    await this.status(owner, id); draft = await this.owned(owner, id);
    if (draft.state !== "ready" || !draft.viewed) fail("Show the actual UI preview before publishing.", 428);
    if (await this.git.head() !== draft.base) fail("The site source changed. Prepare and view a fresh preview.", 409);
    draft.state = "publishing"; await this.store.put(`ui-draft:${id}`, draft);
    try { await this.git.publish(draft.base, draft.commit); }
    catch (error) { if (await this.git.head() !== draft.commit) { draft.state = "ready"; await this.store.put(`ui-draft:${id}`, draft); throw error; } }
    draft.state = "published"; draft.publishedAt = Date.now(); await this.store.put(`ui-draft:${id}`, draft);
    return { kind: "ui", changeId: id, commit: draft.commit, state: "publishing", next: "Check getUiChange. Report live only when its state is live." };
  }

  async list(owner: string) {
    return [...(await this.store.list<UiDraft>({ prefix: "ui-draft:" })).values()].filter(draft => draft.owner === owner)
      .sort((a, b) => b.created - a.created).slice(0, 20)
      .map(draft => ({ changeId: draft.id, commit: draft.commit, previewPath: draft.previewPath, state: draft.state, created: draft.created, previewUrl: draft.expires > Date.now() ? draft.previewUrl : undefined }));
  }
}
