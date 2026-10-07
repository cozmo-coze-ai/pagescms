import { homepageStructureLock, imageNameError, markupErrors, shapeErrors, translationFollowErrors, type HomeLang, type TextEdit } from "./vendor/homepage-guard.ts";
import { parseDictionary } from "./site-page-guard.ts";
import { parse } from "@babel/parser";

const LOCALES = ["en", "ko", "ja", "zh"] as const;
const UI_IMAGE_DIR = "public/editor-ui";
// These short public paths are property guest manuals, not marketing pages.
const MANUAL_ROUTES = new Set(["ananda", "b9", "bs", "f9", "fb", "gk", "gka", "gkb", "ht", "hta", "htb", "jt", "jts", "l9", "prana", "sa", "sg", "sj", "yt"]);
const MANUAL_SOURCE = /(?:^|\/)manual(?:\/|$)|\[manual\]/i;
const SAFE_JSX_TAG = /^(?:[a-z][a-z0-9-]*|[A-Z][A-Za-z0-9_.]*)$/;
const FORBIDDEN_JSX_TAG = /^(?:script|iframe|object|embed|base|meta|link|form|foreignobject)$/i;
const SAFE_STATIC_JSX_ATTR = /^(?:className|id|title|alt|role|aria-[a-z0-9-]+|data-[a-z0-9-]+|loading|decoding|width|height|type|rel|target|href|src|srcSet|poster|tabIndex)$/;

type SyntaxNode = { type: string; start: number; end: number; [key: string]: any };
function walkSyntax(node: unknown, visit: (node: SyntaxNode, parent?: SyntaxNode) => void, parent?: SyntaxNode): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach(child => walkSyntax(child, visit, parent)); return; }
  const current = node as SyntaxNode;
  if (typeof current.type !== "string" || typeof current.start !== "number" || typeof current.end !== "number") return;
  visit(current, parent);
  for (const [key, value] of Object.entries(current)) if (!["loc", "extra", "comments", "leadingComments", "trailingComments", "innerComments", "tokens", "errors"].includes(key)) walkSyntax(value, visit, current);
}

export const isManualRoute = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  const route = ["ko", "ja", "zh"].includes(parts[0]) ? parts[1] : parts[0];
  return route === "manual" || MANUAL_ROUTES.has(route);
};

const isManualSource = (path: string) => MANUAL_SOURCE.test(path) || /^src\/pages\/(?:\[lang\]\/)?(?:[a-z0-9-]+)\.astro$/.test(path) && MANUAL_ROUTES.has(path.split("/").pop()!.slice(0, -6));

// A positive allowlist keeps operational screens out even when they have an
// innocuous-looking .astro/.tsx extension. Shared chrome is intentional: the
// same header/footer appears on excluded routes and must stay consistent.
export const isUiTextPath = (path: string) =>
  /^src\/components\/pages\/(?:About|Life|Celebration|HanbokPhotoShoot)Page\.astro$/.test(path) ||
  /^src\/pages\/(?:\[lang\]\/)?(?:about|life|celebration|hanbok-photo-shoot)\.astro$/.test(path) ||
  /^src\/pages\/itineraries\/(?:\[slug\]|places|experiences)\.astro$/.test(path) ||
  /^src\/components\/(?:SiteNav|SiteHeader|LegalFooter|FooterChannels|LanguageSwitcher|VanTourSection|PeopleSection|ContactCta|ContactFab|DiscountBanner)\.astro$/.test(path) ||
  path === "src/layouts/BaseLayout.astro" || path === "src/styles/global.css" ||
  /^platform\/components\/shell\/(?:SiteHeader|GuestFooter|GuestShellNav)\.tsx$/.test(path) ||
  path === "platform/components/shell/siteHeader.css" ||
  /^platform\/components\/home\/[A-Za-z0-9_-]+\.tsx$/.test(path) ||
  /^src\/i18n\/pages\/(?:life|about|celebration|hanbok)\/(?:en|ko|ja|zh)\.ts$/.test(path);

export const isUiImagePath = (path: string) => path.startsWith(`${UI_IMAGE_DIR}/`) && imageNameError(path.slice(UI_IMAGE_DIR.length + 1)) === null;
export const isUiWritePath = (path: string) => isUiTextPath(path) || isUiImagePath(path);
export const uiImageDirectory = UI_IMAGE_DIR;

export function normalizePreviewPath(value: string) {
  const approved = /^\/(?:ko\/|ja\/|zh\/)?(?:|about\/|life\/|celebration\/|hanbok-photo-shoot\/|itineraries\/(?:places|experiences|[a-z0-9-]+)\/)$/;
  if (!approved.test(value) || isManualRoute(value)) throw new Error("Choose an approved public page path ending in /, such as /about/ or /itineraries/experiences/. Stay, booking, community and manuals are excluded.");
  return value;
}

export function uiPreviewCoverageError(path: string, previewPath: string, source: string) {
  if (isManualSource(path) || isManualRoute(previewPath)) return "Guest manuals are outside the COZE public UI editor.";
  if (/^(?:src\/styles\/stay\.css|platform\/components\/stay\/|src\/styles\/community\.css|platform\/components\/community\/)/.test(path)) return `${path} needs a safe server-rendered preview; the static preview cannot publish changes to this screen yet.`;
  if (path.endsWith(".astro") && /\bexport\s+const\s+prerender\s*=\s*false\b/.test(source)) return `${path} is server-rendered and cannot be verified in the isolated static preview.`;
  if (/^platform\/components\/home\//.test(path) && !/^\/(?:ko\/|ja\/|zh\/)?$/.test(previewPath)) return `Preview the homepage to verify ${path}.`;
  const component = /^src\/components\/pages\/(About|Life|Contact|Community|Booking|Celebration|HanbokPhotoShoot)Page\.astro$/.exec(path)?.[1];
  const componentRoute: Record<string, string> = { About: "about", Life: "life", Contact: "contact", Community: "community", Booking: "booking", Celebration: "celebration", HanbokPhotoShoot: "hanbok-photo-shoot" };
  if (component && !new RegExp(`^/(?:ko/|ja/|zh/)?${componentRoute[component]}/$`).test(previewPath)) return `Preview ${componentRoute[component]} to verify ${path}.`;
  if (path === "src/pages/itineraries/[slug].astro" && !/^\/itineraries\/(?!experiences\/|places\/)[a-z0-9-]+\/$/.test(previewPath)) return "Preview one actual itinerary page to verify the itinerary template.";
  if (path === "src/pages/itineraries/experiences.astro" && previewPath !== "/itineraries/experiences/") return "Preview /itineraries/experiences/ for its listing layout.";
  if (path === "src/pages/itineraries/places.astro" && previewPath !== "/itineraries/places/") return "Preview /itineraries/places/ for its listing layout.";
  const directPage = /^src\/pages\/(?:\[lang\]\/)?([a-z0-9-]+)\.astro$/.exec(path)?.[1];
  if (directPage && !new RegExp(`^/(?:ko/|ja/|zh/)?${directPage}/$`).test(previewPath)) return `Preview ${directPage} to verify ${path}.`;
  return null;
}

function safeCss(before: string, after: string) {
  const errors: string[] = [];
  if (new TextEncoder().encode(after).length > 120_000) errors.push("A CSS file or style block is larger than 120 KB.");
  const unsafe = (text: string) => [...text.matchAll(/\\|@import\b|expression\s*\(|image-set\s*\(|javascript:|data:|https?:\/\/|\/\//gi)].map(match => match[0].toLowerCase()).sort();
  if (JSON.stringify(unsafe(before)) !== JSON.stringify(unsafe(after))) errors.push("New CSS imports, escapes and external or executable URLs are not allowed.");
  const urls = [...after.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map(match => match[2]);
  if ([...after.matchAll(/url\s*\(/gi)].length !== urls.length) errors.push("Every CSS URL must be a simple local url() reference.");
  const oldUrls = new Set([...before.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map(match => match[2]));
  for (const url of urls) if (!oldUrls.has(url) && (!url.startsWith("/editor-ui/") || imageNameError(url.slice("/editor-ui/".length)))) errors.push(`New CSS image ${url} must use an attached editor-ui photo.`);
  return errors;
}

function astroErrors(before: string, after: string) {
  const errors: string[] = [];
  if (new TextEncoder().encode(after).length > 180_000) errors.push("An Astro page is larger than 180 KB.");
  const previous = homepageStructureLock(before), next = homepageStructureLock(after);
  if (!previous || !next || previous.frontmatter !== next.frontmatter) errors.push("Astro frontmatter and server-side logic must stay unchanged.");
  if (previous && next && JSON.stringify(previous.expressions) !== JSON.stringify(next.expressions)) errors.push("Existing Astro data expressions must stay unchanged; rearrange them without adding code.");
  const scripts = (text: string) => [...text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(match => match[0]);
  if (JSON.stringify(scripts(before)) !== JSON.stringify(scripts(after))) errors.push("Scripts are locked; UI editing cannot add or change JavaScript.");
  const dangerous = /<\/?(?:script|iframe|object|embed|base|meta|link|form|foreignObject)\b|\son[a-z]+\s*=|\b(?:javascript|vbscript|data):|\bsrcdoc\s*=/gi;
  const occurrences = (text: string) => [...text.matchAll(dangerous)].map(match => match[0].toLowerCase()).sort();
  if (JSON.stringify(occurrences(before)) !== JSON.stringify(occurrences(after))) errors.push("New executable markup, event handlers, redirects or embedded frames are not allowed.");
  const rawHtml = (text: string) => [...text.matchAll(/\bset:html\s*=\s*\{[^}]*\}/g)].map(match => match[0]).sort();
  if (JSON.stringify(rawHtml(before)) !== JSON.stringify(rawHtml(after))) errors.push("Raw HTML bindings must stay unchanged.");
  const external = (text: string) => [...text.matchAll(/(?:https?:)?\/\/[^\s'"<>]+/gi)].map(match => match[0]).sort();
  if (JSON.stringify(external(before)) !== JSON.stringify(external(after))) errors.push("External links and origins must stay unchanged in UI proposals.");
  const attributes = (text: string) => [...text.matchAll(/\b(?:src|srcset|href|action|formaction|poster)\s*=\s*(["'])(.*?)\1/gi)].map(match => match[2]);
  const oldAttributes = new Set(attributes(before));
  for (const value of attributes(after)) if (!oldAttributes.has(value) && (/^\s*(?:\/api(?:\/|$)|\/\/|(?:javascript|vbscript|data):)/i.test(value) || /[&\u0000-\u001f]/.test(value))) errors.push("New UI links and images cannot target APIs, encoded or executable URLs.");
  const styles = (text: string) => [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]);
  const oldStyles = styles(before), newStyles = styles(after);
  for (let index = 0; index < newStyles.length; index++) errors.push(...safeCss(oldStyles[index] ?? "", newStyles[index]));
  return errors;
}

function tsxProjection(source: string) {
  const tree = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const editable = new Uint8Array(source.length);
  const dynamicAttributes: string[] = [];
  const unsafeUrls: string[] = [];
  const forbiddenTags: string[] = [];
  const mark = (start: number, end: number, value: number) => editable.fill(value, start, end);
  walkSyntax(tree, node => {
    if (node.type === "JSXOpeningElement" || node.type === "JSXClosingElement") {
      const tag = source.slice(node.name.start, node.name.end);
      if (!SAFE_JSX_TAG.test(tag)) throw new Error(`Unsafe JSX tag ${tag}.`);
      if (FORBIDDEN_JSX_TAG.test(tag)) forbiddenTags.push(`${node.type === "JSXClosingElement" ? "close" : "open"}:${tag}`);
      mark(node.start, node.end, 1);
      if (node.type === "JSXOpeningElement") for (const attr of node.attributes) {
        if (attr.type === "JSXSpreadAttribute") {
          dynamicAttributes.push(`${tag}:spread:${source.slice(attr.start, attr.end)}`);
          mark(attr.start, attr.end, 0);
          continue;
        }
        const name = source.slice(attr.name.start, attr.name.end);
        if (attr.value?.type === "JSXExpressionContainer") {
          dynamicAttributes.push(`${tag}:${name}:${source.slice(attr.value.start, attr.value.end)}`);
          mark(attr.value.start, attr.value.end, 0);
        } else if (!SAFE_STATIC_JSX_ATTR.test(name) || /^[A-Z]/.test(tag) && name !== "className") {
          // Existing functional props are allowed but may not be introduced or changed.
          dynamicAttributes.push(`${tag}:${name}:${source.slice(attr.start, attr.end)}`);
        } else if (attr.value?.type === "StringLiteral") {
          const value = attr.value.value as string;
          if (/^(?:href|src|srcSet|poster)$/.test(name) && /^(?:\s*(?:javascript|vbscript|data):|\s*\/\/|\s*\/api(?:\/|$))|(?:^|[\s,])https?:\/\//i.test(value)) unsafeUrls.push(`${tag}:${name}:${value}`);
        }
        if (/^(?:on[A-Z]|dangerouslySetInnerHTML|suppressHydrationWarning|srcDoc|ref|formAction|action)$/.test(name)) dynamicAttributes.push(`${tag}:${name}:${source.slice(attr.start, attr.end)}`);
      }
    } else if (["JSXText", "JSXOpeningFragment", "JSXClosingFragment"].includes(node.type)) mark(node.start, node.end, 1);
  });
  return { locked: [...source].filter((_, index) => !editable[index]).join(""), dynamicAttributes: dynamicAttributes.sort(), unsafeUrls: unsafeUrls.sort(), forbiddenTags: forbiddenTags.sort() };
}

function tsxErrors(before: string, after: string) {
  const errors: string[] = [];
  if (new TextEncoder().encode(after).length > 180_000) errors.push("A TSX component is larger than 180 KB.");
  try {
    const old = tsxProjection(before), next = tsxProjection(after);
    if (old.locked !== next.locked) errors.push("React imports, state, event logic and data expressions must stay unchanged; edit only JSX presentation.");
    if (JSON.stringify(old.dynamicAttributes) !== JSON.stringify(next.dynamicAttributes)) errors.push("React component props, event handlers and expression attributes must stay unchanged.");
    if (JSON.stringify(old.unsafeUrls) !== JSON.stringify(next.unsafeUrls)) errors.push("JSX links and images cannot add or change executable URLs or API targets.");
    if (JSON.stringify(old.forbiddenTags) !== JSON.stringify(next.forbiddenTags)) errors.push("Unsafe JSX tags cannot be added, removed or changed.");
  } catch (error) { errors.push(error instanceof Error ? error.message : "TSX could not be checked."); }
  return errors;
}

function leaves(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach(item => leaves(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach(item => leaves(item, output));
  return output;
}

function computedDictionaryProjection(source: string) {
  const tree = parse(source, { sourceType: "module", plugins: ["typescript"] });
  let dictionary: SyntaxNode | undefined;
  walkSyntax(tree, node => { if (node.type === "VariableDeclarator" && node.id?.type === "Identifier" && node.id.name === "en" && node.init?.type === "ObjectExpression") dictionary = node.init; });
  if (!dictionary) throw new Error("The English dictionary object is missing.");
  const editable = new Uint8Array(source.length);
  const values: string[] = [];
  walkSyntax(dictionary, (node, parent) => {
    if (node.type === "StringLiteral" && (parent?.type === "ArrayExpression" || parent?.type === "ObjectProperty" && parent.value === node)) {
      const key = parent?.type === "ObjectProperty" ? source.slice(parent.key.start, parent.key.end).replace(/["']/g, "") : "";
      if (!/^(?:src|href|url|igUrl|action|link|price)$/i.test(key)) {
        editable.fill(1, node.start + 1, node.end - 1);
        values.push(node.value as string);
      }
    }
  });
  return { locked: [...source].filter((_, index) => !editable[index]).join(""), values };
}

function computedDictionaryErrors(path: string, before: string, after: string) {
  try {
    const old = computedDictionaryProjection(before), next = computedDictionaryProjection(after);
    const errors = old.locked === next.locked ? [] : [`${path}: dictionary code, keys, URLs, image sources and prices are locked; edit existing display strings only.`];
    errors.push(...shapeErrors(old.values, next.values).map(error => `${path}: ${error}`));
    errors.push(...markupErrors(old.values, next.values).map(error => `${path}: ${error}`));
    return { errors, previous: old.values, next: next.values };
  } catch (error) { return { errors: [`${path}: ${error instanceof Error ? error.message : "Dictionary could not be read."}`] }; }
}

function dictionaryErrors(path: string, before: string, after: string) {
  if (/^src\/i18n\/pages\/(?:celebration|hanbok)\/en\.ts$/.test(path)) return computedDictionaryErrors(path, before, after);
  const lang = path.split("/").pop()!.slice(0, 2) as HomeLang;
  try {
    const old = parseDictionary(before, lang), next = parseDictionary(after, lang);
    const errors: string[] = [];
    if (old.masked !== next.masked) errors.push(`${path}: code, keys and comments are locked; edit only existing strings.`);
    errors.push(...shapeErrors(old.value, next.value).map(error => `${path}: ${error}`));
    errors.push(...markupErrors(old.value, next.value).map(error => `${path}: ${error}`));
    const oldTags = leaves(old.value).flatMap(text => text.match(/<\/?[a-z][^>]*>/gi) ?? []);
    const newTags = leaves(next.value).flatMap(text => text.match(/<\/?[a-z][^>]*>/gi) ?? []);
    if (JSON.stringify(oldTags) !== JSON.stringify(newTags)) errors.push(`${path}: existing HTML tags and attributes must stay unchanged.`);
    return { errors, previous: old.value, next: next.value };
  } catch (error) { return { errors: [`${path}: ${error instanceof Error ? error.message : "Dictionary could not be read."}`] }; }
}

export function uiTextErrors(path: string, before: string, after: string) {
  if (!isUiTextPath(path)) return [`${path} is outside the public UI editor.`];
  if (path.endsWith(".astro")) return astroErrors(before, after);
  if (path.endsWith(".css")) return safeCss(before, after);
  if (path.endsWith(".tsx")) return tsxErrors(before, after);
  return dictionaryErrors(path, before, after).errors;
}

export function uiTranslationErrors(before: Map<string, string>, after: Map<string, string>) {
  const errors: string[] = [];
  const groups = new Set([...after.keys()].filter(path => path.endsWith(".ts") && before.get(path) !== after.get(path)).map(path => path.slice(0, path.lastIndexOf("/") + 1)));
  for (const group of groups) {
    const old = {} as Record<HomeLang, unknown>, next = {} as Record<HomeLang, unknown>;
    for (const lang of LOCALES) {
      const path = `${group}${lang}.ts`;
      if (!before.has(path)) continue;
      const parsed = dictionaryErrors(path, before.get(path)!, after.get(path)!);
      errors.push(...parsed.errors);
      old[lang] = parsed.previous; next[lang] = parsed.next;
    }
    if (LOCALES.every(lang => old[lang] !== undefined && next[lang] !== undefined)) {
      for (const lang of LOCALES) if (lang !== "en") errors.push(...shapeErrors(next.en, next[lang]).map(error => `${group}${lang}.ts: ${error}`));
      errors.push(...translationFollowErrors(old, next));
    }
  }
  return errors;
}

export function applyUiEdits(files: Map<string, string>, edits: TextEdit[]) {
  const errors: string[] = [];
  for (const [index, edit] of edits.entries()) {
    if (!isUiTextPath(edit.path) || !files.has(edit.path)) { errors.push(`Edit ${index + 1}: file is outside the public UI editor.`); continue; }
    if ("content" in edit) { files.set(edit.path, edit.content); continue; }
    const current = files.get(edit.path)!;
    const count = edit.find ? current.split(edit.find).length - 1 : 0;
    if (count !== 1) { errors.push(`Edit ${index + 1}: find text occurs ${count} times. Re-read the file and use one exact match.`); continue; }
    files.set(edit.path, current.replace(edit.find, () => edit.replace));
  }
  return errors;
}
