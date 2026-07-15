/**
 * Media path/URL utilities for Supabase Storage-backed media, used by the
 * `fields/` system (image/file/rich-text editors) and thumbnails.
 *
 * Two path shapes exist in stored content:
 * - `cms_itinerary.cover_path`: bucket keys (`<slug>/<file>`) — the image
 *   field uses `media: false`, so values pass through read/write untouched.
 * - Inline body images: site paths (`/itineraries/<slug>/<file>`), matching
 *   what coze_client serves after materializing the bucket into
 *   `public/itineraries/` — rich-text swaps these to/from the media config's
 *   input space (`itineraries/<slug>/<file>`) around the helpers below.
 *
 * Both resolve to the same public Storage URL:
 *   `${SUPABASE_URL}/storage/v1/object/public/itineraries-media/<slug>/<file>`
 *
 * The old raw.githubusercontent.com-era signatures (owner/repo/branch args)
 * are kept so the `fields/` callers don't need signature churn — those args
 * are ignored now.
 */

// Single source of truth for the bucket name (re-exported by
// lib/supabase-storage.ts for server-side use) — this module must stay
// client-safe (no server-only imports).
export const ITINERARIES_MEDIA_BUCKET = "itineraries-media";

// NEXT_PUBLIC_SUPABASE_URL is inlined into the client bundle via
// next.config.mjs's `env` mapping of SUPABASE_URL — no separate env var to
// configure. The SUPABASE_URL fallback covers server-side callers.
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const MEDIA_PUBLIC_BASE = supabaseUrl
  ? `${supabaseUrl}/storage/v1/object/public/${ITINERARIES_MEDIA_BUCKET}`
  : "";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isExternalPath = (path: string) =>
  path.startsWith("//")
  || path.startsWith("http://")
  || path.startsWith("https://")
  || path.startsWith("data:image/");

// `<slug>/<file>` bucket key from either a bare key or an input-space path.
const toBucketKey = (path: string) => {
  const key = path.replace(/^\/+/, "");
  return key.startsWith("itineraries/") ? key.slice("itineraries/".length) : key;
};

// Public, directly-fetchable Storage URL for a media path. External URLs and
// data URIs pass through untouched.
const mediaPublicUrl = (path: string) => {
  if (!path || isExternalPath(path) || !MEDIA_PUBLIC_BASE) return path;
  return `${MEDIA_PUBLIC_BASE}/${encodePath(toBucketKey(path))}`;
};

const isMediaPublicUrl = (url: string) =>
  !!MEDIA_PUBLIC_BASE && url.startsWith(`${MEDIA_PUBLIC_BASE}/`);

// Public Storage URL -> input-space path (`itineraries/<slug>/<file>`).
// Anything else passes through untouched.
const mediaPathFromPublicUrl = (url: string) => {
  if (!isMediaPublicUrl(url)) return url;
  const key = url
    .slice(MEDIA_PUBLIC_BASE.length + 1)
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
  return `itineraries/${key}`;
};

// Swap the prefix of a media path (e.g. between a field's "input"/"output" convention).
const swapPrefix = (path: string, from: string, to: string, relative = false) => {
  if (
    path == null
    || from == null
    || to == null
    || from === to
    || path.startsWith("//")
    || path.startsWith("http://")
    || path.startsWith("https://")
    || path.startsWith("data:image/")
    || !path.startsWith(from)
  ) return path;

  let newPath;
  if (from === "" && to !== "/") {
    newPath = `${to}/${path}`;
  } else if (from === "" && to === "/") {
    newPath = `/${path}`;
  } else {
    const remainingPath = path.slice(from.length);
    newPath = to === "/" ? `/${remainingPath.replace(/^\//, "")}` : `${to}/${remainingPath.replace(/^\//, "")}`;
  }

  if (newPath && newPath.startsWith("/") && relative) newPath = newPath.substring(1);
  return newPath;
};

// Swap the prefix of all <img> sources in an HTML string.
const htmlSwapPrefix = (html: string, from: string, to: string, relative = false) => {
  if (from === to || html == null || from == null || to == null) return html;

  let newHtml = html;
  const matches = getImgSrcs(newHtml);

  matches.forEach((match) => {
    const src = match[1] || match[2];
    const quote = match[1] ? '"' : "'";
    const newSrc = swapPrefix(src, from, to, relative);
    if (newSrc !== src) {
      const regex = new RegExp(`src=${quote}${escapeRegex(src)}${quote}`, "g");
      newHtml = newHtml.replace(regex, `src=${quote}${newSrc}${quote}`);
    }
  });

  return newHtml;
};

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

const getImgSrcs = (html: string) => {
  const regex = /<img [^>]*src=(?:"([^"]+)"|'([^']+)')[^>]*>/g;
  return Array.from(html.matchAll(regex));
};

// Rewrite all <img> srcs in an HTML string through a mapper.
const mapImgSrcs = (html: string, mapSrc: (src: string) => string) => {
  if (html == null) return html;
  let newHtml = html;
  getImgSrcs(newHtml).forEach((match) => {
    const src = match[1] || match[2];
    const quote = match[1] ? '"' : "'";
    const newSrc = mapSrc(src);
    if (newSrc !== src) {
      const regex = new RegExp(`src=${quote}${escapeRegex(src)}${quote}`, "g");
      newHtml = newHtml.replace(regex, `src=${quote}${newSrc}${quote}`);
    }
  });
  return newHtml;
};

// Input-space path (or bucket key) -> public Storage URL.
const getRawUrl = async (
  _owner: string,
  _repo: string,
  _branch: string,
  _name: string,
  path: string,
  _isPrivate = false,
  _decode = false,
) => mediaPublicUrl(path);

// Public Storage URL -> input-space path.
const getRelativeUrl = (_owner: string, _repo: string, _branch: string, path: string, _encode = true) =>
  mediaPathFromPublicUrl(path);

// HTML <img> srcs: input-space paths -> public Storage URLs.
const relativeToRawUrls = async (
  _owner: string,
  _repo: string,
  _branch: string,
  _name: string,
  html: string,
  _isPrivate = false,
  _decode = false,
) => mapImgSrcs(html, mediaPublicUrl);

// HTML <img> srcs: public Storage URLs -> input-space paths.
const rawToRelativeUrls = (_owner: string, _repo: string, _branch: string, html: string, _encode = true) =>
  mapImgSrcs(html, mediaPathFromPublicUrl);

export {
  getRelativeUrl,
  getRawUrl,
  relativeToRawUrls,
  rawToRelativeUrls,
  swapPrefix,
  htmlSwapPrefix,
  encodePath,
  getImgSrcs,
  mediaPublicUrl,
  isMediaPublicUrl,
  mediaPathFromPublicUrl,
};
