import { z } from "zod";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { fail, sha256 } from "./types.ts";

// Existing imported CMS addresses include trailing hyphens. Preserve them.
export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(180);
export const contentSchema = z.object({
  slug: slugSchema, title: z.string().trim().min(1).max(200),
  category: z.enum(["tour", "experience"]), tag: z.string().max(80).nullable(),
  tagColor: z.string().max(30).nullable(), cover: z.string().max(500).nullable(),
  published: z.boolean(), body: z.string().max(100_000),
}).strict();
export const itineraryInput = z.object({
  slug: slugSchema, expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  changes: contentSchema.omit({ slug: true }).partial().strict(),
  rationale: z.string().trim().min(3).max(1000),
}).strict();
export type ItineraryContent = z.infer<typeof contentSchema>;
export type ItineraryRecord = { content: ItineraryContent; revision: string; updatedAt: string };

// Same field order and null handling as the public site's content manifest.
export function canonicalContent(c: ItineraryContent) {
  return JSON.stringify([c.slug, c.title, c.category, c.tag ?? null, c.tagColor ?? null, c.cover ?? null, c.published, c.body]);
}
export const contentRevision = (c: ItineraryContent) => sha256(canonicalContent(c));
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const storageOrigin = "https://ihitnwzljfldctswwrsv.supabase.co";
export const bucket = "itineraries-media";
export function mediaKey(value: string) {
  let key = value.startsWith("/itineraries/") ? value.slice(13) : value;
  try { key=decodeURIComponent(key); } catch { fail("The itinerary photo path is not valid."); }
  const parts=key.split('/');
  if(key.length>500 || parts.length<2 || !/^[a-z0-9][a-z0-9-]*$/.test(parts[0]) || parts.some(p=>!p||p==='.'||p==='..'||/[\\\x00-\x1f\x7f?#:%]/.test(p)) || !/\.(?:jpe?g|png|webp|gif)$/i.test(parts.at(-1)!)) fail("Use an existing itinerary photo or upload a JPG, PNG or WebP in chat.");
  return key;
}
export function mediaUrl(key: string) { return `${storageOrigin}/storage/v1/object/public/${bucket}/${mediaKey(key).split("/").map(encodeURIComponent).join("/")}`; }
export function imageSource(value: string) {
  if (value.startsWith("/itineraries/")) return mediaUrl(value);
  const url = new URL(value, "https://www.coze.care");
  if (url.username || url.password || url.protocol !== "https:" ||
    !(url.origin === storageOrigin && url.pathname.startsWith(`/storage/v1/object/public/${bucket}/`) ||
      ["https://www.coze.care", "https://coze.care"].includes(url.origin))) fail("Use COZE itinerary photos or an attachment; external image hosts are not supported.");
  return url.href;
}
function safeLink(value: string) {
  if(/[\x00-\x1f\x7f]/.test(value)) return false;
  try { return ["http:","https:","mailto:","tel:"].includes(new URL(value,"https://www.coze.care/").protocol); }
  catch {return false;}
}

export function legacyPhotoIssues(body: string) {
  const paths: string[]=[];
  marked.walkTokens(marked.lexer(body),token=>{if(token.type==='image' && /^\/itineraries\/blob:https?:\//.test(token.href)) paths.push(token.href);});
  return paths;
}
export function validateContent(c: ItineraryContent, previous?: ItineraryContent) {
  contentSchema.parse(c);
  if (new TextEncoder().encode(JSON.stringify(c)).length > 115_000) fail("This itinerary is too large for one edit. Keep its content under 110 KB.");
  if (c.cover) mediaKey(c.cover);
  const tokens = marked.lexer(c.body); const existingBroken=previous?legacyPhotoIssues(previous.body):[];
  marked.walkTokens(tokens, token => {
    if (token.type === "html") {
      // Markdown is the CMS's stored format. Permit harmless legacy formatting,
      // never scripts, forms, executable attributes, frames, styles or embeds.
      const raw = token.raw;
      if (/<\s*\/?\s*(?:script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|link|meta|base)\b/i.test(raw) ||
        /\s(?:on[\w-]+|style|srcdoc)\s*=|(?:javascript|vbscript|data)\s*:/i.test(raw)) fail("Itinerary content cannot contain scripts, forms, embedded apps or executable HTML. Use Markdown text, photos and tables.");
      const tags = [...raw.matchAll(/<\/?([a-z][a-z0-9-]*)\b/gi)].map(m => m[1].toLowerCase());
      const allowed = new Set(["p","br","hr","strong","b","em","i","u","s","del","blockquote","h1","h2","h3","h4","h5","h6","ul","ol","li","a","img","table","thead","tbody","tr","th","td","pre","code","div","span","figure","figcaption","details","summary","aside"]);
      if (tags.some(t => !allowed.has(t))) fail("Use Markdown or simple text formatting in itinerary content.");
      // HTML images would bypass the Markdown image path checks and private
      // attachment replacement. Keep images in the CMS's Markdown form.
      if (/<\s*img\b/i.test(raw)) fail("Use Markdown image syntax: ![description](/itineraries/slug/photo.jpg).");
      if (/\s(?:href|src|action|background)\s*=\s*[^"'\s>]*&/i.test(raw) || /&#|&(?:colon|tab|newline);/i.test(raw)) fail("Use ordinary Markdown links instead of encoded HTML links.");
      sanitizeHtml(raw, { allowedTags: [...allowed], allowedAttributes: false, transformTags: {
        '*': (tagName, attribs) => {
          for (const [name,value] of Object.entries(attribs)) {
            if (!["href","title","colspan","rowspan","start","open","align"].includes(name)) fail("Use simple Markdown formatting instead of HTML attributes.");
            if (name === "href" && !safeLink(value)) fail("Use a safe Markdown link.");
          }
          return { tagName, attribs };
        },
      } });
    }
    if (token.type === "link") {
      const href = (token as { href: string }).href;
      if (!safeLink(href)) fail("Links must use https, http, email, telephone or a local page address.");
    }
    if (token.type === "image") {
      const href=(token as { href: string }).href; const old=existingBroken.indexOf(href);
      if(old>=0) existingBroken.splice(old,1); else imageSource(href);
    }
  });
}

export function renderBody(body: string, staged: Map<string, string> = new Map()) {
  const html = marked.parse(body, { async: false }) as string;
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "details", "summary", "figure", "figcaption", "s", "del"],
    allowedAttributes: { a: ["href","title"], img: ["src","alt","title","loading"], th: ["colspan","rowspan"], td: ["colspan","rowspan"], code: ["class"] },
    allowedSchemes: ["http","https","mailto","tel"], allowProtocolRelative: false,
    transformTags: {
      img: (_tag, attrs): {tagName:string;attribs:Record<string,string>;text?:string} => /^\/itineraries\/blob:https?:\//.test(attrs.src) ?
        {tagName:"span",attribs:{},text:"[Existing photo unavailable — ask to replace or remove it]"} :
        ({ tagName: "img", attribs: { src: staged.get(attrs.src) ?? imageSource(attrs.src), alt: attrs.alt || "", loading: "lazy" } }),
    },
  });
}

export function renderItinerary(c: ItineraryContent, revision: string, staged: Map<string,string> = new Map()) {
  const nonce = crypto.randomUUID();
  const cover = c.cover ? staged.get(`/itineraries/${c.cover}`) ?? mediaUrl(c.cover) : null;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.title)} — COZE preview</title><style nonce="${nonce}">
  *{box-sizing:border-box}body{margin:0;background:#f8f7f2;color:#28352e;font:17px/1.75 system-ui}aside{padding:10px 18px;border-bottom:1px solid #dde1d7;font-size:13px;color:#385b4c}main{max-width:800px;margin:auto;padding:24px 18px 56px;overflow-wrap:anywhere}h1{font-size:clamp(28px,5vw,44px);line-height:1.15;letter-spacing:-.035em;margin:18px 0 26px}h2{font-size:25px;line-height:1.3;margin-top:32px}h3{font-size:21px}img{display:block;max-width:100%;height:auto;border-radius:12px}img.cover{width:100%;max-height:350px;object-fit:cover}a{color:#245d46;text-decoration:underline;pointer-events:none}table{display:block;max-width:100%;overflow:auto;border-collapse:collapse;font-size:15px}td,th{border:1px solid #ced6cc;padding:8px 12px}pre{max-width:100%;overflow:auto}ul,ol{padding-left:24px}.badge{display:inline-block;font-size:13px;background:#e4eadf;padding:3px 10px;border-radius:30px;margin-top:20px}blockquote{margin-left:0;padding-left:16px;border-left:3px solid #80967e}@media(min-width:768px){main{padding:40px 28px 72px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style></head><body>
  <aside>Content preview · ${c.published ? "Will appear on the website after publishing" : "Will be saved as an unpublished draft"} · Site navigation is omitted</aside>
  <main>${cover ? `<img class="cover" src="${escapeHtml(cover)}" alt="">` : ""}${c.tag ? `<span class="badge">${escapeHtml(c.tag)}</span>` : ""}<h1>${escapeHtml(c.title)}</h1><article>${renderBody(c.body, staged)}</article></main>
  <script nonce="${nonce}">window.addEventListener('load',()=>parent.postMessage({type:'coze-preview-loaded',commit:${JSON.stringify(revision)}},'*'));document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault()});</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "content-security-policy": `default-src 'none'; img-src 'self' ${storageOrigin} https://www.coze.care https://coze.care; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'` } });
}
