// Rules for ChatGPT homepage changes (coze_client HomePageV3.astro, the four
// homepage copy files and public/home images). Pure functions — no I/O — so
// they run on Workers and in tests.
//
// This mirrors coze_client/scripts/lib/homepage-rules.mjs, which runs before
// every coze_client build as the backstop. Checking here first gives ChatGPT
// an immediate, specific error instead of a failed build. Keep the two in sync.

export const HOME_LANGS = ["en", "ko", "ja", "zh"] as const;
export type HomeLang = (typeof HOME_LANGS)[number];

export const HOME_PAGE_FILE = "src/components/pages/HomePageV3.astro";
export const HOME_COPY_FILES = Object.fromEntries(
  HOME_LANGS.map((lang) => [lang, `src/i18n/pages/home/${lang}.json`]),
) as Record<HomeLang, string>;
export const HOME_IMAGE_DIR = "public/home";
export const HOME_TEXT_FILES = [HOME_PAGE_FILE, ...Object.values(HOME_COPY_FILES)];

const IMAGE_NAME = /^[a-z0-9][a-z0-9-]{0,62}\.(jpe?g|png|webp)$/;
const MAX_PAGE_BYTES = 80_000;
const MAX_COPY_BYTES = 60_000;

export const isImagePath = (path: string) =>
  path.startsWith(`${HOME_IMAGE_DIR}/`) && IMAGE_NAME.test(path.slice(HOME_IMAGE_DIR.length + 1));

export const isEditablePath = (path: string) => HOME_TEXT_FILES.includes(path) || isImagePath(path);

export const imageNameError = (name: string) =>
  IMAGE_NAME.test(name) ? null : `Image filename "${name}" must be lowercase letters, digits and dashes, ending in .jpg, .png or .webp.`;

// Copy that other pages render too (site header/footer, About, Contact,
// Community, Life). The homepage editor must not change them — see
// coze_client/src/i18n/pages/home/README.md.
export const SHARED_COPY_PATHS = [
  "nav", "footer", "legal", "fab", "van", "hosts", "people", "places", "experiences",
  "journey.steps", "journey.peopleBody", "journey.aboutAction",
];

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function describe(value: unknown) {
  if (Array.isArray(value)) return "list";
  if (value === null) return "null";
  return typeof value;
}

export function shapeErrors(base: unknown, other: unknown, path = ""): string[] {
  const at = path || "(root)";
  if (describe(base) !== describe(other)) return [`${at}: expected ${describe(base)}, found ${describe(other)}`];
  const errors: string[] = [];
  if (Array.isArray(base) && Array.isArray(other)) {
    if (base.length !== other.length) errors.push(`${at}: list has ${other.length} items, English has ${base.length}`);
    for (let index = 0; index < Math.min(base.length, other.length); index++) {
      errors.push(...shapeErrors(base[index], other[index], `${path}[${index}]`));
    }
    return errors;
  }
  if (base && typeof base === "object" && other && typeof other === "object") {
    const left = base as Record<string, unknown>;
    const right = other as Record<string, unknown>;
    const join = (key: string) => (path ? `${path}.${key}` : key);
    for (const key of Object.keys(left)) if (!(key in right)) errors.push(`${join(key)}: missing`);
    for (const key of Object.keys(right)) if (!(key in left)) errors.push(`${join(key)}: not in English`);
    for (const key of Object.keys(left)) if (key in right) errors.push(...shapeErrors(left[key], right[key], join(key)));
  }
  return errors;
}

function leaves(value: unknown, path = "", out: [string, string][] = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, index) => leaves(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) leaves(item, path ? `${path}.${key}` : key, out);
  }
  return out;
}

const TAG_RE = /<\/?[a-z][^>]*>/gi;
const PLACEHOLDER_RE = /\{[a-zA-Z0-9_]+\}/g;
const tokens = (text: string, re: RegExp) =>
  (text.match(re) ?? []).map((token) => token.replace(/\s.*>$/, ">").toLowerCase()).sort().join(" ");

export function markupErrors(en: unknown, other: unknown) {
  const translated = new Map(leaves(other));
  const errors: string[] = [];
  for (const [path, text] of leaves(en)) {
    const value = translated.get(path);
    if (value === undefined) continue;
    if (tokens(text, TAG_RE) !== tokens(value, TAG_RE)) errors.push(`${path}: HTML tags differ from English`);
    if (tokens(text, PLACEHOLDER_RE) !== tokens(value, PLACEHOLDER_RE)) errors.push(`${path}: {placeholders} differ from English`);
  }
  return errors;
}

const PRICE_PATHS = [
  ["van", "staria", "price"], ["van", "staria", "overtime"],
  ["van", "county", "price"], ["van", "county", "overtime"],
  ["van", "fine", "surcharge", "amount"],
];
const pick = (dict: unknown, keys: string[]) =>
  keys.reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), dict);
const digits = (value: unknown) => (typeof value === "string" ? value.replace(/\D/g, "") : "");

export function copyErrors(dicts: Record<HomeLang, unknown>) {
  const errors: string[] = [];
  for (const lang of HOME_LANGS) {
    if (lang === "en") continue;
    errors.push(...shapeErrors(dicts.en, dicts[lang]).map((error) => `${lang}.json ${error}`));
    errors.push(...markupErrors(dicts.en, dicts[lang]).map((error) => `${lang}.json ${error}`));
  }
  for (const keys of PRICE_PATHS) {
    const english = digits(pick(dicts.en, keys));
    for (const lang of HOME_LANGS) {
      if (lang !== "en" && digits(pick(dicts[lang], keys)) !== english) {
        errors.push(`${lang}: ${keys.join(".")} must show the same figure as English (${String(pick(dicts.en, keys))})`);
      }
    }
  }
  return errors;
}

// English never moves alone: when an English string changes, the same string
// must change in every translation too — unless that translation was
// deliberately identical to English (brand names, language lists).
export function translationFollowErrors(before: Record<HomeLang, unknown>, after: Record<HomeLang, unknown>) {
  const errors: string[] = [];
  const oldEnglish = new Map(leaves(before.en));
  const changed = leaves(after.en).filter(([path, text]) => oldEnglish.has(path) && oldEnglish.get(path) !== text);
  for (const lang of HOME_LANGS) {
    if (lang === "en") continue;
    const oldTranslation = new Map(leaves(before[lang]));
    const newTranslation = new Map(leaves(after[lang]));
    for (const [path] of changed) {
      const previous = oldTranslation.get(path);
      if (previous === undefined || previous === oldEnglish.get(path)) continue;
      if (newTranslation.get(path) === previous) errors.push(`${lang}.json ${path}: English changed but this translation did not — update all four languages`);
    }
  }
  return errors;
}

// Shared copy must be byte-for-byte unchanged in every language.
export function sharedCopyErrors(before: Record<HomeLang, unknown>, after: Record<HomeLang, unknown>) {
  const errors: string[] = [];
  for (const lang of HOME_LANGS) {
    for (const path of SHARED_COPY_PATHS) {
      const keys = path.split(".");
      if (JSON.stringify(pick(before[lang], keys)) !== JSON.stringify(pick(after[lang], keys))) {
        errors.push(`${lang}.json ${path} is shared with other pages and cannot be changed from the homepage editor`);
      }
    }
  }
  return errors;
}

const FORBIDDEN: [RegExp, string][] = [
  [/set:html/, "set:html is not allowed (raw HTML injection)"],
  [/<iframe\b/i, "<iframe> is not allowed"],
  [/<script\b/i, "scripts are not allowed in the homepage layout"],
  [/\bclient:[a-z-]+/i, "client directives are not allowed in the homepage layout"],
  [/\son[a-z]+\s*=/i, "event-handler attributes are not allowed in the homepage layout"],
  [/\bfetch\s*\(/, "fetch() is not allowed"],
  [/process\s*(?:\.\s*env|\[\s*["']env["']\s*\])|import\s*\.\s*meta\s*\.\s*env/, "environment variables are not allowed"],
  [/\bimport\s*\(/, "dynamic imports are not allowed"],
  [/Astro\.(locals|cookies|request|redirect)/, "request-time Astro APIs are not allowed"],
  [/javascript:/i, "javascript: URLs are not allowed"],
  [/<link\b[^>]*rel\s*=\s*["']?stylesheet/i, "external stylesheets are not allowed"],
  [/@import\b/, "@import is not allowed"],
];

export type PageStructureLock = { frontmatter: string; expressions: string[]; staticText: string[] };

function splitPage(source: string) {
  const normalized = source.replace(/\r\n/g, "\n");
  const match = /^(---\n[\s\S]*?\n---)\n([\s\S]*)$/.exec(normalized);
  return match ? { frontmatter: match[1], body: match[2] } : null;
}

function withoutStyles(body: string) {
  return body.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

// Extract top-level Astro expressions while respecting strings and nested
// braces. CSS is removed first, so its declaration blocks are not expressions.
function expressions(body: string) {
  const source = withoutStyles(body);
  const result: string[] = [];
  for (let start = 0; start < source.length; start++) {
    if (source[start] !== "{") continue;
    let depth = 1, quote = "", escaped = false;
    for (let index = start + 1; index < source.length; index++) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
      if (char === "{") depth++;
      if (char === "}" && --depth === 0) {
        result.push(source.slice(start, index + 1).replace(/\s+/g, " ").trim());
        start = index;
        break;
      }
    }
  }
  return result.sort();
}

function staticText(body: string) {
  let source = withoutStyles(body).replace(/<!--([\s\S]*?)-->/g, "");
  for (const expression of expressions(source)) source = source.replace(expression, "\n");
  return source.replace(/<[^>]+>/g, "\n").split("\n")
    .map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean).sort();
}

export function homepageStructureLock(source: string): PageStructureLock | null {
  const page = splitPage(source);
  return page ? { frontmatter: page.frontmatter, expressions: expressions(page.body), staticText: staticText(page.body) } : null;
}

function importErrors(source: string) {
  const errors: string[] = [];
  for (const match of source.matchAll(/\bimport\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith("../") && !specifier.startsWith("./")) {
      errors.push(`import "${specifier}" is not allowed; only the site's own components, layouts, lib and i18n`);
      continue;
    }
    const resolved = new URL(specifier, "file:///src/components/pages/").pathname;
    if (!/^\/src\/(components|layouts|lib|i18n)(\/|$)/.test(resolved) || /^\/src\/lib\/stay\/(?!env$)/.test(resolved)) {
      errors.push(`import "${specifier}" is outside the allowed folders`);
    }
  }
  return errors;
}

export function pageErrors(source: string, imageExists: (sitePath: string) => boolean, expected?: PageStructureLock | null) {
  const errors: string[] = [];
  if (new TextEncoder().encode(source).length > MAX_PAGE_BYTES) errors.push(`HomePageV3.astro is larger than ${MAX_PAGE_BYTES / 1000} KB`);
  const structure = homepageStructureLock(source);
  if (!structure) errors.push("HomePageV3.astro must keep its --- frontmatter block");
  if (!/<BaseLayout\b/.test(source)) errors.push("HomePageV3.astro must render <BaseLayout>");
  for (const [re, message] of FORBIDDEN) if (re.test(source)) errors.push(message);
  errors.push(...importErrors(source));
  if (expected && structure) {
    if (structure.frontmatter !== expected.frontmatter) errors.push("HomePageV3.astro executable frontmatter cannot be changed by the homepage editor");
    if (JSON.stringify(structure.expressions) !== JSON.stringify(expected.expressions)) errors.push("HomePageV3.astro data expressions cannot be added, removed or changed; rearrange the existing sections or edit CSS instead");
    if (JSON.stringify(structure.staticText) !== JSON.stringify(expected.staticText)) errors.push("Visible homepage text must be edited in the four language JSON files, not written directly in the layout");
  }
  const body = splitPage(source)?.body ?? source;
  if (/https?:\/\/|(?:["'(])\/\//i.test(body)) errors.push("external URLs are not allowed in the homepage layout");
  for (const match of source.matchAll(/["'(](\/home\/[^"')\s?#]+)/g)) {
    if (!imageExists(match[1])) errors.push(`image ${match[1]} does not exist in public/home/ (upload it in the same change)`);
  }
  return errors;
}

export function parseCopy(lang: HomeLang, text: string): { value?: Json; error?: string } {
  if (new TextEncoder().encode(text).length > MAX_COPY_BYTES) return { error: `${lang}.json is larger than ${MAX_COPY_BYTES / 1000} KB` };
  try {
    const value = JSON.parse(text) as Json;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: `${lang}.json must be a JSON object` };
    return { value };
  } catch (error) {
    return { error: `${lang}.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export type TextEdit = { path: string; content: string } | { path: string; find: string; replace: string };

// Apply edits in order. `find` must match exactly once, so an edit can never
// silently land in the wrong place.
export function applyEdits(files: Map<string, string>, edits: TextEdit[]) {
  const errors: string[] = [];
  for (const [index, edit] of edits.entries()) {
    if (!HOME_TEXT_FILES.includes(edit.path)) {
      errors.push(`edit ${index + 1}: "${edit.path}" is not an editable homepage file`);
      continue;
    }
    if ("content" in edit) {
      files.set(edit.path, edit.content);
      continue;
    }
    const current = files.get(edit.path) ?? "";
    const count = edit.find ? current.split(edit.find).length - 1 : 0;
    if (count !== 1) {
      errors.push(`edit ${index + 1}: the "find" text occurs ${count} times in ${edit.path}; it must occur exactly once (re-read the file)`);
      continue;
    }
    files.set(edit.path, current.replace(edit.find, () => edit.replace));
  }
  return errors;
}

// Full check of the homepage state a change would produce.
export function homepageErrors(
  before: Map<string, string>,
  after: Map<string, string>,
  imageExists: (sitePath: string) => boolean,
) {
  const errors: string[] = [];
  const parse = (files: Map<string, string>, report: boolean) => {
    const dicts = {} as Record<HomeLang, unknown>;
    for (const lang of HOME_LANGS) {
      const parsed = parseCopy(lang, files.get(HOME_COPY_FILES[lang]) ?? "");
      if (parsed.error && report) errors.push(parsed.error);
      dicts[lang] = parsed.value;
    }
    return dicts;
  };
  // Only the proposed state is reported; the current files are what is live.
  const previous = parse(before, false);
  const next = parse(after, true);
  if (errors.length === 0) {
    errors.push(...copyErrors(next));
    errors.push(...sharedCopyErrors(previous, next));
    errors.push(...translationFollowErrors(previous, next));
  }
  errors.push(...pageErrors(
    after.get(HOME_PAGE_FILE) ?? "",
    imageExists,
    homepageStructureLock(before.get(HOME_PAGE_FILE) ?? ""),
  ));
  return errors;
}

// A plain-language description of a change, for ChatGPT to show the designer
// before they confirm the deploy.
export function summarizeChange(before: Map<string, string>, after: Map<string, string>, newImages: string[], siteUrl = "https://www.coze.care") {
  const parse = (text: string | undefined) => { try { return JSON.parse(text ?? ""); } catch { return undefined; } };
  const oldEnglish = new Map(leaves(parse(before.get(HOME_COPY_FILES.en))));
  const newEnglish = leaves(parse(after.get(HOME_COPY_FILES.en)));
  const textChanges = newEnglish
    .filter(([path, text]) => oldEnglish.get(path) !== text)
    .map(([path, text]) => ({ key: path, before: oldEnglish.get(path) ?? null, after: text }));
  const newKeys = new Set(newEnglish.map(([path]) => path));
  const removedText = [...oldEnglish.keys()].filter((path) => !newKeys.has(path));
  const lines = (text: string | undefined) => (text ?? "").split("\n");
  const oldLines = lines(before.get(HOME_PAGE_FILE));
  const newLines = lines(after.get(HOME_PAGE_FILE));
  const count = (list: string[]) => list.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map<string, number>());
  const oldCounts = count(oldLines);
  const newCounts = count(newLines);
  const added = [...newCounts].reduce((sum, [line, n]) => sum + Math.max(0, n - (oldCounts.get(line) ?? 0)), 0);
  const removed = [...oldCounts].reduce((sum, [line, n]) => sum + Math.max(0, n - (newCounts.get(line) ?? 0)), 0);
  const translated = HOME_LANGS.filter((lang) => lang !== "en" && before.get(HOME_COPY_FILES[lang]) !== after.get(HOME_COPY_FILES[lang]));
  return {
    textChanges: textChanges.slice(0, 40),
    moreTextChanges: Math.max(0, textChanges.length - 40),
    removedText,
    languagesUpdated: translated.length ? ["en", ...translated] : textChanges.length ? ["en"] : [],
    layout: added || removed ? { linesAdded: added, linesRemoved: removed } : null,
    newImages,
    liveUrls: ["/", "/ko/", "/ja/", "/zh/"].map((path) => new URL(path, siteUrl).href),
  };
}

// Image type from magic bytes, plus pixel dimensions read from the header —
// pure JS so this works on Cloudflare Workers (no sharp).
export function imageInfo(bytes: Uint8Array): { type: "png" | "jpeg" | "webp"; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length > 24 && bytes[0] === 0x89 && ascii(1, 3) === "PNG") {
    return { type: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "jpeg", height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  }
  if (bytes.length > 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ") return { type: "webp", width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { type: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      const read24 = (offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
      return { type: "webp", width: read24(24) + 1, height: read24(27) + 1 };
    }
  }
  return null;
}
