import { HOME_LANGS, imageNameError, markupErrors, shapeErrors, translationFollowErrors, type HomeLang, type TextEdit } from "./vendor/homepage-guard.ts";

export const SITE_PAGES = ["explore", "about"] as const;
export type SitePage = (typeof SITE_PAGES)[number];

export const SITE_PAGE_CONFIG: Record<SitePage, { label: string; route: string; layout: string; copy: Record<HomeLang, string>; imageDir: string }> = {
  explore: {
    label: "Explore",
    route: "/life",
    layout: "src/components/pages/LifePage.astro",
    copy: Object.fromEntries(HOME_LANGS.map(lang => [lang, `src/i18n/pages/life/${lang}.ts`])) as Record<HomeLang, string>,
    imageDir: "public/editor-pages/explore",
  },
  about: {
    label: "About us",
    route: "/about",
    layout: "src/components/pages/AboutPage.astro",
    copy: Object.fromEntries(HOME_LANGS.map(lang => [lang, `src/i18n/pages/about/${lang}.ts`])) as Record<HomeLang, string>,
    imageDir: "public/editor-pages/about",
  },
};

export const sitePageFiles = (page: SitePage) => {
  const config = SITE_PAGE_CONFIG[page];
  return [config.layout, ...HOME_LANGS.map(lang => config.copy[lang])];
};
export const sitePageImagePath = (page: SitePage, path: string) => {
  const dir = SITE_PAGE_CONFIG[page].imageDir;
  return path.startsWith(`${dir}/`) && imageNameError(path.slice(dir.length + 1)) === null;
};
export const isSitePagePath = (page: SitePage, path: string) => sitePageFiles(page).includes(path) || sitePageImagePath(page, path);

type Token = { type: "string" | "id" | "symbol" | "number"; value: string; start: number; end: number };

function tokenize(source: string, start: number): Token[] {
  const tokens: Token[] = [];
  let index = start;
  let depth = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index++; continue; }
    if (source.startsWith("//", index)) { index = source.indexOf("\n", index); if (index < 0) break; continue; }
    if (source.startsWith("/*", index)) { const end = source.indexOf("*/", index + 2); if (end < 0) throw new Error("Unclosed comment."); index = end + 2; continue; }
    if (char === '"' || char === "'") {
      const quote = char;
      const tokenStart = index++;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const next = source[index++];
        if (next === quote) { closed = true; break; }
        if (next !== "\\") { value += next; continue; }
        const escaped = source[index++];
        if (escaped === undefined) break;
        if (escaped === "u" || escaped === "x") {
          const length = escaped === "u" ? 4 : 2;
          const hex = source.slice(index, index + length);
          if (!new RegExp(`^[a-fA-F0-9]{${length}}$`).test(hex)) throw new Error("Invalid string escape.");
          value += String.fromCharCode(Number.parseInt(hex, 16)); index += length;
        } else value += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0" } as Record<string, string>)[escaped] ?? escaped;
      }
      if (!closed) throw new Error("Unclosed string.");
      tokens.push({ type: "string", value, start: tokenStart, end: index });
      continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
    if (id) { tokens.push({ type: "id", value: id[0], start: index, end: index + id[0].length }); index += id[0].length; continue; }
    const number = /^-?\d+(?:\.\d+)?/.exec(source.slice(index));
    if (number) { tokens.push({ type: "number", value: number[0], start: index, end: index + number[0].length }); index += number[0].length; continue; }
    if ("{}[]:,;".includes(char)) {
      tokens.push({ type: "symbol", value: char, start: index, end: index + 1 }); index++;
      if (char === "{") depth++;
      if (char === "}" && --depth === 0) break;
      continue;
    }
    throw new Error(`Unsupported dictionary syntax near character ${index}.`);
  }
  return tokens;
}

export function parseDictionary(source: string, lang: HomeLang) {
  if (new TextEncoder().encode(source).length > 60_000) throw new Error(`${lang}.ts is larger than 60 KB.`);
  const declaration = new RegExp(`\\bconst\\s+${lang}(?:\\s*:\\s*[A-Za-z_$][\\w$]*)?\\s*=\\s*\\{`, "g").exec(source);
  if (!declaration) throw new Error(`${lang}.ts must keep its dictionary declaration.`);
  const start = declaration.index + declaration[0].lastIndexOf("{");
  const tokens = tokenize(source, start);
  let at = 0;
  const take = (value: string) => {
    if (tokens[at]?.value !== value) throw new Error(`Expected ${value} in ${lang}.ts dictionary.`);
    return tokens[at++];
  };
  const parseValue = (): unknown => {
    const token = tokens[at];
    if (!token) throw new Error(`Incomplete ${lang}.ts dictionary.`);
    if (token.value === "{") {
      at++;
      const object: Record<string, unknown> = {};
      while (tokens[at]?.value !== "}") {
        const key = tokens[at++];
        if (!key || !["id", "string"].includes(key.type) || Object.hasOwn(object, key.value)) throw new Error(`Invalid or duplicate key in ${lang}.ts.`);
        take(":"); object[key.value] = parseValue();
        if (tokens[at]?.value !== "}") take(",");
      }
      at++;
      return object;
    }
    if (token.value === "[") {
      at++;
      const values: unknown[] = [];
      while (tokens[at]?.value !== "]") {
        values.push(parseValue());
        if (tokens[at]?.value !== "]") take(",");
      }
      at++;
      return values;
    }
    at++;
    if (token.type === "string") return token.value;
    if (token.type === "number") return Number(token.value);
    if (token.value === "true") return true;
    if (token.value === "false") return false;
    if (token.value === "null") return null;
    throw new Error(`Only literal copy values are allowed in ${lang}.ts.`);
  };
  const value = parseValue();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${lang}.ts must export an object dictionary.`);
  const end = tokens[at - 1].end;
  const strings = tokens.slice(0, at).filter(token => token.type === "string");
  let cursor = 0;
  const masked = strings.map(token => {
    const segment = source.slice(cursor, token.start);
    cursor = token.end;
    return `${segment}${source[token.start]}__COPY__${source[token.start]}`;
  }).join("") + source.slice(cursor);
  return { value, masked, start, end };
}

function styleOnlyError(before: string, after: string, page: SitePage) {
  const blocks = (source: string) => [...source.matchAll(/<style>[^]*?<\/style>/g)];
  const old = blocks(before), next = blocks(after);
  if (old.length !== 1 || next.length !== 1) return "The page must keep exactly one CSS style block.";
  const marker = "<style>__EDITABLE_PAGE_CSS__</style>";
  if (before.replace(old[0][0], marker) !== after.replace(next[0][0], marker)) return "Page markup, scripts and executable frontmatter are locked; edit its CSS and four-language copy only.";
  const css = next[0][0].slice("<style>".length, -"</style>".length);
  if (new TextEncoder().encode(css).length > 80_000) return "Page CSS is larger than 80 KB.";
  if (/\\|@import\b|expression\s*\(|image-set\s*\(|javascript:|data:|https?:\/\/|\/\//i.test(css)) return "CSS imports, escapes and external or executable URLs are not allowed.";
  const imageUrl = `/editor-pages/${page}/`;
  const urls = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)];
  if ([...css.matchAll(/url\s*\(/gi)].length !== urls.length) return "Every CSS image URL must be a simple local url() reference.";
  for (const match of urls) {
    if (!match[2].startsWith(imageUrl) || imageNameError(match[2].slice(imageUrl.length))) return "CSS images must use an uploaded photo for this page.";
  }
  return null;
}

export function applySitePageEdits(page: SitePage, files: Map<string, string>, edits: TextEdit[]) {
  const errors: string[] = [];
  for (const [index, edit] of edits.entries()) {
    if (!sitePageFiles(page).includes(edit.path)) { errors.push(`edit ${index + 1}: ${edit.path} is not editable on ${page}`); continue; }
    if ("content" in edit) { files.set(edit.path, edit.content); continue; }
    const current = files.get(edit.path) ?? "";
    const count = edit.find ? current.split(edit.find).length - 1 : 0;
    if (count !== 1) { errors.push(`edit ${index + 1}: find text occurs ${count} times in ${edit.path}; re-read and use one exact match`); continue; }
    files.set(edit.path, current.replace(edit.find, () => edit.replace));
  }
  return errors;
}

export function sitePageErrors(page: SitePage, before: Map<string, string>, after: Map<string, string>, imageExists: (path: string) => boolean) {
  const config = SITE_PAGE_CONFIG[page];
  const errors: string[] = [];
  const styleError = styleOnlyError(before.get(config.layout) ?? "", after.get(config.layout) ?? "", page);
  if (styleError) errors.push(styleError);
  const previous = {} as Record<HomeLang, unknown>;
  const next = {} as Record<HomeLang, unknown>;
  for (const lang of HOME_LANGS) {
    try {
      const oldCopy = parseDictionary(before.get(config.copy[lang]) ?? "", lang);
      const newCopy = parseDictionary(after.get(config.copy[lang]) ?? "", lang);
      if (oldCopy.masked !== newCopy.masked) errors.push(`${lang}.ts code, keys and comments must stay unchanged; edit only existing string values.`);
      previous[lang] = oldCopy.value;
      next[lang] = newCopy.value;
      errors.push(...shapeErrors(oldCopy.value, newCopy.value).map(error => `${lang}.ts ${error}`));
      errors.push(...markupErrors(oldCopy.value, newCopy.value).map(error => `${lang}.ts ${error}`));
    } catch (error) { errors.push(error instanceof Error ? error.message : `${lang}.ts could not be read.`); }
  }
  if (HOME_LANGS.every(lang => next[lang] !== undefined)) {
    for (const lang of HOME_LANGS) if (lang !== "en") {
      errors.push(...shapeErrors(next.en, next[lang]).map(error => `${lang}.ts ${error}`));
      errors.push(...markupErrors(next.en, next[lang]).map(error => `${lang}.ts ${error}`));
    }
    if (HOME_LANGS.every(lang => previous[lang] !== undefined)) errors.push(...translationFollowErrors(previous, next));
  }
  const css = /<style>([^]*?)<\/style>/.exec(after.get(config.layout) ?? "")?.[1] ?? "";
  for (const match of css.matchAll(/url\(\s*(['"]?)(\/editor-pages\/[^)'"\s]+)\1\s*\)/gi)) {
    if (!imageExists(match[2])) errors.push(`CSS image ${match[2]} does not exist; attach it in the same proposal.`);
  }
  return errors;
}

export function summarizeSitePage(page: SitePage, before: Map<string, string>, after: Map<string, string>, newImages: string[]) {
  const config = SITE_PAGE_CONFIG[page];
  const changedFiles = sitePageFiles(page).filter(path => before.get(path) !== after.get(path));
  return {
    page, label: config.label, changedFiles, languagesUpdated: HOME_LANGS.filter(lang => before.get(config.copy[lang]) !== after.get(config.copy[lang])),
    layoutChanged: before.get(config.layout) !== after.get(config.layout), newImages,
    liveUrls: HOME_LANGS.map(lang => `https://www.coze.care${lang === "en" ? "" : `/${lang}`}${config.route}/`),
  };
}
