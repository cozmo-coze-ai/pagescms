import { z } from "zod";
import { type ItineraryRepository } from "./itinerary-db.ts";
import { itineraryInput, newItineraryInput, contentRevision, validateContent, slugSchema, renderItinerary, bucket, mediaKey, mediaUrl, storageOrigin, legacyPhotoIssues, type ItineraryContent, type ItineraryRecord } from "./itinerary-model.ts";
import { fail, PublicError, sha256, type Env, type Store } from "./types.ts";
import { imageInfo, imageNameError } from "./vendor/homepage-guard.ts";

type Photo = { id: string; owner: string; slug: string; key: string; mime: string; hash: string; expires: number };
type Draft = { id: string; owner: string; slug: string; revision: string; rationale: string; created: number; expires: number;
  operation?: "create" | "update" | "delete";
  state: "ready" | "publishing" | "published"; token: string; viewed: boolean; photos: Photo[]; summary: unknown;
  publishedAt?: string; affectsSite?: boolean; error?: string };
export type VersionManifest = { version: 1; fetchedAt: string; entries: Record<string,string> };
export const photoInput = z.object({ slug: slugSchema, filename: z.string().max(150), downloadUrl: z.string().url(), forNewItinerary: z.boolean().default(false) }).strict();

export async function liveVersions(): Promise<VersionManifest | null> {
  try {
    const r = await fetch(`https://www.coze.care/cms-itinerary-versions.json?check=${Date.now()}`, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000), cf: { cacheTtl: 0 } });
    if (!r.ok) return null;
    const raw = await r.text(); if (raw.length > 300_000) return null;
    const value = JSON.parse(raw);
    return value.version === 1 && typeof value.entries === "object" && value.entries !== null && Number.isFinite(Date.parse(value.fetchedAt)) ? value : null;
  } catch { return null; }
}
export async function itineraryBuildState(env:Env,savedAt:string) {
  if(!env.CF_API_TOKEN || !env.PUBLIC_BUILD_TRIGGER_ID) return "unknown";
  try {
    const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/builds/workers/${env.PRODUCTION_WORKER_TAG}/builds?per_page=100`,{headers:{authorization:`Bearer ${env.CF_API_TOKEN}`},redirect:"manual",signal:AbortSignal.timeout(10_000)});
    if(!r.ok)return "unknown";
    const data:any=await r.json();
    const build=data.result?.filter((b:any)=>(b.trigger?.trigger_uuid??b.trigger_uuid)===env.PUBLIC_BUILD_TRIGGER_ID && Date.parse(b.created_on)>=Date.parse(savedAt)).sort((a:any,b:any)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0];
    if(!build)return "queued";
    if(build.build_outcome==="success")return "deployed";
    return build.build_outcome && build.build_outcome!=="unknown" ? "failed":"building";
  }catch{return "unknown";}
}
export class ItineraryBackend {
  constructor(private env: Env, private store: Store, private db: ItineraryRepository, private live = liveVersions, private buildState=itineraryBuildState) {}
  async list(owner: string, raw: unknown) {
    const input = z.object({ search: z.string().max(100).default(""), offset: z.number().int().min(0).max(10000).default(0) }).strict().parse(raw);
    return this.db.list(owner, input.search, input.offset);
  }
  async read(owner: string, slug: string) {
    const item = await this.db.read(owner, slugSchema.parse(slug));
    return { ...item, url: `https://www.coze.care/itineraries/${slug}/`, existingPhotoIssues:legacyPhotoIssues(item.content.body).length,
      rules: { addressLocked: true, bodyFormat: "Markdown", noInventedFacts: true,
        publication: "Prepare changes, show the content preview, ask the requester to publish this exact change, then wait for yes.",
        photos: "Use existing /itineraries/slug/file paths. To add a photo, call uploadItineraryPhoto with the attached file, then use its photoRef in changes.cover or ![alt](photoRef) in changes.body." } };
  }
  private async budget(owner: string) {
    const key = `itinerary-budget:${owner}`;
    const old = await this.store.get<{ count: number; until: number }>(key);
    const current = old && old.until > Date.now() ? old : { count: 0, until: Date.now() + 3600_000 };
    if (current.count >= 30) fail("Thirty itinerary previews or photos were prepared this hour. Please try later.", 429);
    await this.store.put(key, { ...current, count: current.count + 1 });
  }
  async photo(owner: string, raw: unknown) {
    await this.db.authorize(owner, true);
    const input = photoInput.parse(raw);
    if (input.forNewItinerary) await this.db.ensureAvailable(owner,input.slug); else await this.db.read(owner,input.slug);
    if (imageNameError(input.filename)) fail(imageNameError(input.filename)!);
    await this.budget(owner);
    const url = new URL(input.downloadUrl);
    if (url.protocol !== "https:" || url.username || url.password || !(url.hostname.endsWith(".oaiusercontent.com") || url.hostname === "files.openai.com")) fail("Attach a photo in ChatGPT. Arbitrary download URLs are not accepted.");
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (!response.ok || !response.body) fail("Could not load the attached photo.");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); fail("Use a photo under 2 MB."); } chunks.push(value); }
    const bytes = Buffer.concat(chunks); const info = imageInfo(bytes);
    if (!info || info.width < 1 || info.height < 1 || info.width > 4000 || info.height > 4000 || !(info.type === "jpeg" ? ["jpg","jpeg"] : [info.type]).includes(input.filename.split(".").pop()!)) fail("Use a JPG, PNG or WebP, at most 4000px, with a matching filename.");
    const hash = await sha256(bytes); const id = crypto.randomUUID();
    const photo: Photo = { id, owner, slug: input.slug, key: `${input.slug}/chatgpt-${hash.slice(0,24)}-${input.filename}`, mime: `image/${info.type}`, hash, expires: Date.now()+86400_000 };
    await this.env.OAUTH_KV.put(`itinerary-photo:${id}`, bytes, { expirationTtl: 172800 });
    await this.store.put(`itinerary-photo:${id}`,photo);
    return { photoRef: `@photo:${id}`, filename: input.filename, state: "private_draft", next: "Use photoRef in the itinerary preview. No public photo or content has been changed." };
  }
  async prepare(owner: string, raw: unknown) {
    await this.db.authorize(owner,true);
    const input = itineraryInput.parse(raw); const before = await this.db.read(owner,input.slug);
    if (input.expectedRevision !== before.revision) fail("The itinerary changed. Read it again before preparing a preview.",409);
    const after = { ...before.content,...input.changes };
    const photos = await this.resolvePhotos(owner, after);
    if(Object.hasOwn(input.changes,"cover") && after.cover) after.cover=mediaKey(after.cover);
    validateContent(after,before.content);
    const revision = await contentRevision(after); if (revision === before.revision) fail("There is no change to preview.");
    return this.saveDraft(owner, "update", after, revision, input.rationale, photos, before);
  }
  async prepareNew(owner: string, raw: unknown) {
    await this.db.authorize(owner,true);
    const parsed = newItineraryInput.parse(raw);
    const { rationale, ...after } = parsed;
    await this.db.ensureAvailable(owner,after.slug);
    const photos = await this.resolvePhotos(owner,after);
    if (after.cover) after.cover=mediaKey(after.cover);
    validateContent(after);
    const revision=await contentRevision(after);
    return this.saveDraft(owner,"create",after,revision,rationale,photos);
  }
  async prepareDelete(owner: string, raw: unknown) {
    await this.db.authorize(owner,true);
    const input = z.object({ slug:slugSchema, expectedRevision:z.string().regex(/^[a-f0-9]{64}$/), rationale:z.string().trim().min(3).max(1000) }).strict().parse(raw);
    const before=await this.db.read(owner,input.slug);
    if(input.expectedRevision!==before.revision) fail("The itinerary changed. Read it again before preparing a deletion preview.",409);
    // Retain the old content only for the private preview and audit trail. The
    // confirmed operation removes the CMS row; photos remain in storage.
    const after={...before.content,published:false};
    return this.saveDraft(owner,"delete",after,await contentRevision(after),input.rationale,[],before);
  }
  private async resolvePhotos(owner: string, after: ItineraryContent) {
    const photos: Photo[] = [];
    for (const ref of new Set((JSON.stringify(after).match(/@photo:[a-f0-9-]{36}/g) ?? []))) {
      const id = ref.slice(7); const photo = await this.store.get<Photo>(`itinerary-photo:${id}`);
      if (!photo || photo.owner !== owner || photo.slug !== after.slug || photo.expires < Date.now()) fail("That photo expired or belongs to another itinerary. Attach it again.",403);
      photos.push(photo); if (after.cover === ref) after.cover = photo.key;
      after.body = after.body.split(ref).join(`/itineraries/${photo.key}`);
    }
    if (photos.length > 5) fail("Use up to five new photos in one change.");
    return photos;
  }
  private async saveDraft(owner:string,operation:"create"|"update"|"delete",after:ItineraryContent,revision:string,rationale:string,photos:Photo[],before?:ItineraryRecord) {
    const requestKey = `itinerary-request:${await sha256(JSON.stringify([owner,operation,before?.revision,before?.updatedAt,revision]))}`;
    const prior = await this.store.get<string>(requestKey);
    if (prior) { const previous = await this.store.get<Draft>(`itinerary:${prior}`); if (previous && previous.expires > Date.now() && previous.state === "ready") return this.status(owner,prior); }
    await this.budget(owner);
    const id = crypto.randomUUID();
    const draft: Draft = { id,owner,slug: after.slug,revision,rationale,operation,created: Date.now(),expires: Date.now()+86400_000,
      state:"ready",token:crypto.randomUUID(),viewed:false,photos,
      summary: { operation, title: after.title, changedFields: operation === "create" ? Object.keys(after) : operation === "delete" ? ["delete"] : Object.keys(after).filter(k => after[k as keyof ItineraryContent] !== before!.content[k as keyof ItineraryContent]), publishedBefore:before?.content.published ?? null,publishedAfter:after.published } };
    if(before) await this.store.put(`itinerary-before:${id}`,before);
    await this.store.put(`itinerary-after:${id}`,after);
    await this.store.put(`itinerary:${id}`,draft); await this.store.put(requestKey,id);
    return this.status(owner,id);
  }
  private async owned(owner: string, id: string) {
    z.string().uuid().parse(id); await this.db.authorize(owner);
    const draft = await this.store.get<Draft>(`itinerary:${id}`);
    if (!draft || draft.owner !== owner) fail("Change not found for this editor.",404);
    return draft;
  }
  private async content(draft: Draft) {
    const after = await this.store.get<ItineraryContent>(`itinerary-after:${draft.id}`);
    if (!after || await contentRevision(after) !== draft.revision) fail("This preview could not be verified. Prepare a new preview.",409);
    return after;
  }
  async status(owner: string, id: string, exposePreview = false) {
    const draft = await this.owned(owner,id);
    if (draft.state === "publishing") {
      const saved = await this.db.published(owner,id);
      if (saved) { Object.assign(draft,saved,{state:"published"}); await this.store.put(`itinerary:${id}`,draft); }
    }
    if (draft.state !== "published") {
      const expired = draft.expires < Date.now();
      return { changeId:id,kind:"itinerary",state:expired?"expired":draft.error?"needs_attention":draft.state,revision:draft.revision,summary:draft.summary,...(draft.error?{message:draft.error}:{}),
        ...(exposePreview && !expired ? { _previewUrl: `${this.env.PUBLIC_ORIGIN}/itinerary-preview/${id}?token=${draft.token}`, _viewToken: draft.token } : {}),
        next:expired?"Read the itinerary and prepare a fresh preview.":draft.operation==="delete"?"Call showItineraryPreview. After it loads, ask: Delete this itinerary from the CMS and www.coze.care?":"Call showItineraryPreview. After the preview loads, ask: Publish this itinerary change to www.coze.care?" };
    }
    const after = await this.content(draft);
    if(draft.operation==="delete") {
      try { await this.db.read(owner,draft.slug); return {changeId:id,kind:"itinerary",state:"superseded",message:"An itinerary exists at this address again. Check it before making another change."}; }
      catch(error) { if(!(error instanceof PublicError) || error.status!==404) throw error; }
    } else {
      const current=await this.db.read(owner,draft.slug);
      if(current.revision!==draft.revision) return {changeId:id,kind:"itinerary",state:"superseded",message:"A newer CMS edit replaced this saved version. Read it before editing again."};
    }
    if (!draft.affectsSite) return draft.operation==="delete"
      ? {changeId:id,kind:"itinerary",state:"deleted",message:"The unpublished itinerary was removed from the CMS. It was never on the website."}
      : {changeId:id,kind:"itinerary",state:"saved_draft",message:"Saved in CMS as an unpublished draft. It is not on the website."};
    const manifest = await this.live();
    const match = manifest && Date.parse(manifest.fetchedAt) >= Date.parse(draft.publishedAt!) &&
      (after.published ? manifest.entries[draft.slug] === draft.revision : !Object.hasOwn(manifest.entries,draft.slug));
    if (match) return {changeId:id,kind:"itinerary",state:"live",url:after.published?`https://www.coze.care/itineraries/${draft.slug}/`:undefined,published:after.published,deleted:draft.operation==="delete"};
    const build=await this.buildState(this.env,draft.publishedAt!);
    const delayed=Date.now()-Date.parse(draft.publishedAt!)>600_000;
    return {changeId:id,kind:"itinerary",state:build==="failed"?"failed":delayed?"needs_attention":"publishing",build,savedAt:draft.publishedAt,
      message:build==="failed"?"Saved in CMS, but the website build failed. Ask the owner to check the build; do not publish duplicate content.":delayed?"Saved in CMS, but the exact public version is still unconfirmed after ten minutes. Check the website build and CMS deploy sweep.":"Saved in CMS. The public website has not yet confirmed this exact content. Check again shortly; do not publish it twice."};
  }
  async viewed(owner: string, id: string, token: string) {
    await this.db.authorize(owner,true); const draft = await this.owned(owner,id);
    if (draft.state !== "ready" || draft.expires < Date.now() || draft.token !== token) fail("Load the current itinerary preview first.",428);
    draft.viewed = true; await this.store.put(`itinerary:${id}`,draft);
    return {changeId:id,previewShown:true,next:draft.operation==="delete"?"Ask: Delete this itinerary from the CMS and www.coze.care? Wait for the requester's yes.":"Ask: Publish this itinerary change to www.coze.care? Wait for the requester's yes."};
  }
  async publish(owner: string, id: string, confirmed: boolean) {
    if (confirmed !== true) fail("Wait for the requester to confirm publishing this exact preview.",428);
    await this.db.authorize(owner,true); const draft = await this.owned(owner,id);
    if (draft.state === "published") return this.status(owner,id);
    if (draft.state === "publishing") {
      const saved = await this.db.published(owner,id);
      if (saved) { Object.assign(draft,saved,{state:"published"}); await this.store.put(`itinerary:${id}`,draft); return this.status(owner,id); }
    }
    if (!draft.viewed || draft.expires < Date.now()) fail("Show a fresh itinerary preview before publishing.",428);
    const before = await this.store.get<ItineraryRecord>(`itinerary-before:${id}`); const after = await this.content(draft);
    const operation=draft.operation ?? "update";
    if (operation !== "create") {
      if (!before) fail("The original content is unavailable. Prepare another preview.",409);
      const current = await this.db.read(owner,draft.slug);
      if (current.revision !== before.revision || current.updatedAt !== before.updatedAt) fail("The itinerary changed in CMS. Read it and prepare a fresh preview.",409);
    } else await this.db.ensureAvailable(owner,draft.slug);
    // The existing CMS cron consumes the transactional dirty marker, including
    // when this Worker crashes after COMMIT. No extra deploy hook is necessary.
    draft.state = "publishing"; delete draft.error; await this.store.put(`itinerary:${id}`,draft);
    try {
      await this.publishPhotos(draft);
      const saved = operation === "create" ? await this.db.create(owner,id,after,draft.rationale) : operation === "delete" ? await this.db.delete(owner,id,before!,draft.rationale) : await this.db.publish(owner,id,before!,after,draft.rationale);
      Object.assign(draft,saved,{state:"published"}); await this.store.put(`itinerary:${id}`,draft);
    } catch(error) {
      draft.error=error instanceof PublicError?error.message:"The save could not be confirmed. Check this change's status before retrying.";
      await this.store.put(`itinerary:${id}`,draft); throw error;
    }
    return this.status(owner,id);
  }
  private async publishPhotos(draft: Draft) {
    if (!draft.photos.length) return;
    if (this.env.SUPABASE_URL !== storageOrigin || !this.env.SUPABASE_SERVICE_ROLE_KEY) fail("Itinerary photo storage needs setup.",503);
    for (const photo of draft.photos) {
      const bytes: ArrayBuffer | null = await this.env.OAUTH_KV.get(`itinerary-photo:${photo.id}`,"arrayBuffer");
      if (!bytes || await sha256(new Uint8Array(bytes)) !== photo.hash) fail("The staged photo expired. Prepare a new preview.",409);
      const url = `${storageOrigin}/storage/v1/object/${bucket}/${photo.key.split('/').map(encodeURIComponent).join('/')}`;
      const r = await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,"content-type":photo.mime,"x-upsert":"false"},body:bytes,redirect:"manual",signal:AbortSignal.timeout(20_000)});
      if (!r.ok) {
        // A retry may find the exact immutable photo already uploaded. Verify
        // bytes rather than overwriting an existing public object.
        const existing = await fetch(mediaUrl(photo.key),{redirect:"manual",signal:AbortSignal.timeout(10_000)});
        if (!existing.ok || await sha256(new Uint8Array(await existing.arrayBuffer())) !== photo.hash) fail("The photo could not be saved. No itinerary content was changed.",503);
      }
    }
  }
  async preview(id: string, token: string, photoId?: string): Promise<Response> {
    const draft = await this.store.get<Draft>(`itinerary:${id}`);
    if (!draft || draft.token !== token || draft.expires < Date.now()) return new Response("Preview expired. Ask ChatGPT for a new preview.",{status:404,headers:{"cache-control":"no-store"}});
    await this.db.authorize(draft.owner);
    if (photoId) {
      const photo = draft.photos.find(p=>p.id===photoId); if (!photo) return new Response("Not found",{status:404});
      const bytes = await this.env.OAUTH_KV.get(`itinerary-photo:${photoId}`,"arrayBuffer");
      if (!bytes) return new Response("Photo expired",{status:404});
      return new Response(bytes,{headers:{"content-type":photo.mime,"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
    }
    const staged = new Map(draft.photos.map(p=>[`/itineraries/${p.key}`,`${this.env.PUBLIC_ORIGIN}/itinerary-preview/${id}/${p.id}?token=${token}`]));
    return renderItinerary(await this.content(draft),draft.revision,staged,draft.operation==="delete");
  }
}
