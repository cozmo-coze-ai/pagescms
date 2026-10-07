import { z } from "zod";
import { downloadImage, proposalSchema } from "./backend.ts";
import { Git, SITE, liveCommit, previewBuild, productionBuild, type Write } from "./git.ts";
import { fail, sha256, type Env, type Store } from "./types.ts";
import { applySitePageEdits, isSitePagePath, sitePageErrors, sitePageFiles, SITE_PAGE_CONFIG, SITE_PAGES, summarizeSitePage, type SitePage } from "./site-page-guard.ts";

export const sitePageSchema = proposalSchema.extend({ page: z.enum(SITE_PAGES) });

type PageDraft = {
  id: string; owner: string; page: SitePage; base: string; commit: string; created: number; expires: number;
  state: "prepared" | "building" | "ready" | "publishing" | "published";
  summary: unknown; previewUrl?: string; publishedAt?: number; viewed?: boolean; viewToken?: string;
};

export class SitePageBackend {
  constructor(private env: Env, private store: Store, private git = new Git(env), private preview = previewBuild, private live = liveCommit, private production = productionBuild) {}

  async read(page: SitePage) {
    const config = SITE_PAGE_CONFIG[page];
    const commit = await this.git.head();
    return {
      page, label: config.label, commit, liveUrls: ["en", "ko", "ja", "zh"].map(lang => `${SITE}${lang === "en" ? "" : `/${lang}`}${config.route}/`),
      files: sitePageFiles(page), images: await this.git.sitePageImages(page, commit),
      rules: { languages: ["en", "ko", "ja", "zh"], layout: "Only the page's CSS <style> block may change. Frontmatter, markup and scripts stay locked.",
        copy: "Edit existing strings in all affected language dictionaries; keep keys, list lengths, code and comments unchanged.",
        photos: "Attached JPG/PNG/WebP files may be added to this page's editor-pages folder and referenced from its CSS.",
        publishing: "Show the exact isolated page preview, ask the requester for explicit confirmation, then publish. No other pages or operations may change." },
    };
  }

  async file(page: SitePage, path: string) {
    if (!sitePageFiles(page).includes(path)) fail("Read only files listed for the selected page.");
    const commit = await this.git.head();
    return { page, commit, path, content: await this.git.readSitePage(page, path, commit) };
  }

  async prepare(owner: string, raw: unknown) {
    if (!this.env.PREVIEW_WORKER_TAG) fail("The preview connection needs setup before creating changes.", 503);
    const input = sitePageSchema.parse(raw);
    const config = SITE_PAGE_CONFIG[input.page];
    if (await this.git.head() !== input.expectedCommit) fail("The site changed. Read this page again.", 409);
    const before = await this.git.sitePageFiles(input.page, input.expectedCommit);
    const after = new Map(before);
    const editErrors = applySitePageEdits(input.page, after, input.edits);
    if (editErrors.length) fail(editErrors.join("\n"));
    const writes: Write[] = await Promise.all(input.images.map(image => downloadImage(image.filename, image.downloadUrl, config.imageDir)));
    if (new Set(writes.map(write => write.path)).size !== writes.length) fail("Use distinct image filenames.");
    const existingImages = new Set(await this.git.sitePageImages(input.page, input.expectedCommit));
    writes.forEach(write => existingImages.add(write.path.slice(7)));
    const errors = sitePageErrors(input.page, before, after, path => existingImages.has(path.replace(/^\//, "")));
    const stylesheet = /<style>([^]*?)<\/style>/.exec(after.get(config.layout) ?? "")?.[1] ?? "";
    for (const write of writes) if (!stylesheet.includes(`/${write.path.slice(7)}`)) errors.push(`Attached photo ${write.path} must be used in this page's CSS preview.`);
    if (errors.length) fail(errors.join("\n"));
    for (const path of sitePageFiles(input.page)) if (before.get(path) !== after.get(path)) writes.push({ path, content: after.get(path)! });
    if (!writes.length) fail("There is no change to preview.");
    if (writes.some(write => !isSitePagePath(input.page, write.path))) fail("A proposed file is outside this page.");
    const requestKey = `page-request:${await sha256(JSON.stringify([owner, input.page, input.expectedCommit, writes]))}`;
    const previousId = await this.store.get<string>(requestKey);
    if (previousId) { const old = await this.store.get<PageDraft>(`page-draft:${previousId}`); if (old && old.expires > Date.now() && old.state !== "prepared") return this.status(owner, input.page, old.id); }
    const recent = [...(await this.store.list<PageDraft>({ prefix: "page-draft:" })).values()].filter(draft => draft.created > Date.now() - 3600_000);
    if (recent.length >= 10) fail("Ten page previews were created this hour. Combine changes into one preview and try later.", 429);
    const id = crypto.randomUUID();
    const commit = await this.git.createCommit(input.expectedCommit, writes, `${config.label} preview: ${input.rationale}`, input.page);
    const draft: PageDraft = {
      id, owner, page: input.page, base: input.expectedCommit, commit, state: "prepared", created: Date.now(), expires: Date.now() + 86400_000,
      summary: summarizeSitePage(input.page, before, after, writes.filter(write => write.base64).map(write => write.path.slice(7))),
    };
    await this.store.put(`page-draft:${id}`, draft);
    await this.git.previewBranch(id, commit);
    draft.state = "building";
    await this.store.put(`page-draft:${id}`, draft);
    await this.store.put(requestKey, id);
    return { kind: "site-page", page: input.page, changeId: id, state: "building", summary: draft.summary, next: "Check getSitePageChange until ready, then show the exact page preview before asking to publish." };
  }

  private async owned(owner: string, page: SitePage, id: string) {
    const draft = await this.store.get<PageDraft>(`page-draft:${id}`);
    if (!draft || draft.owner !== owner || draft.page !== page) fail("This page preview is not available to your account.", 404);
    if (draft.expires < Date.now() && draft.state !== "published") fail("The preview expired. Prepare a fresh preview.", 410);
    return draft;
  }

  async status(owner: string, page: SitePage, id: string) {
    const draft = await this.owned(owner, page, id);
    const route = SITE_PAGE_CONFIG[page].route;
    if (draft.state === "publishing" && await this.git.head() === draft.commit) { draft.state = "published"; draft.publishedAt = Date.now(); await this.store.put(`page-draft:${id}`, draft); }
    if (draft.state === "published") {
      const live = await this.live(`${SITE}${route}/`);
      const state = live === draft.commit ? "live" : live && await this.git.isAncestor(draft.commit, live) ? "superseded" : await this.production(this.env, draft.commit);
      return { kind: "site-page", page, changeId: id, commit: draft.commit, state, liveUrl: `${SITE}${route}/` };
    }
    const result = await this.preview(this.env, draft.commit);
    if (result.state === "ready") { draft.state = "ready"; draft.previewUrl = result.url; draft.viewToken ??= crypto.randomUUID(); await this.store.put(`page-draft:${id}`, draft); }
    else if (draft.state === "ready") { draft.state = "building"; draft.viewed = false; draft.viewToken = undefined; await this.store.put(`page-draft:${id}`, draft); }
    return { kind: "site-page", page, pagePath: route, changeId: id, commit: draft.commit, state: result.state,
      previewUrl: result.state === "ready" ? result.url : undefined, summary: draft.summary,
      _viewToken: result.state === "ready" ? draft.viewToken : undefined,
      next: result.state === "ready" ? `Show the actual ${SITE_PAGE_CONFIG[page].label} preview, then ask: Publish this to www.coze.care?` : "The preview is not ready. Do not ask to publish yet." };
  }

  async viewed(owner: string, page: SitePage, id: string, viewToken: string) {
    const draft = await this.owned(owner, page, id);
    if (draft.state !== "ready" || !draft.viewToken || draft.viewToken !== viewToken) fail("Load the current preview first.", 428);
    draft.viewed = true; await this.store.put(`page-draft:${id}`, draft);
    return { kind: "site-page", page, changeId: id, previewShown: true, next: "Ask: Publish this to www.coze.care?" };
  }

  async publish(owner: string, page: SitePage, id: string, confirmed: boolean) {
    if (confirmed !== true) fail("Ask the requester: Publish this to www.coze.care? Wait for yes.", 428);
    let draft = await this.owned(owner, page, id);
    if (draft.state === "published" || draft.state === "publishing") return this.status(owner, page, id);
    await this.status(owner, page, id); draft = await this.owned(owner, page, id);
    if (draft.state !== "ready" || !draft.viewed) fail("Show the actual page preview before publishing.", 428);
    if (await this.git.head() !== draft.base) fail("The live source changed. Prepare and view a fresh preview.", 409);
    draft.state = "publishing"; await this.store.put(`page-draft:${id}`, draft);
    try { await this.git.publish(draft.base, draft.commit); }
    catch (error) { if (await this.git.head() !== draft.commit) { draft.state = "ready"; await this.store.put(`page-draft:${id}`, draft); throw error; } }
    draft.state = "published"; draft.publishedAt = Date.now(); await this.store.put(`page-draft:${id}`, draft);
    return { kind: "site-page", page, changeId: id, commit: draft.commit, state: "publishing", next: "Check getSitePageChange. Report live only when its state is live." };
  }

  async list(owner: string, page: SitePage) {
    return [...(await this.store.list<PageDraft>({ prefix: "page-draft:" })).values()]
      .filter(draft => draft.owner === owner && draft.page === page).sort((a, b) => b.created - a.created).slice(0, 20)
      .map(draft => ({ page, changeId: draft.id, commit: draft.commit, state: draft.state, created: draft.created, previewUrl: draft.expires > Date.now() ? draft.previewUrl : undefined }));
  }
}
