/**
 * Store for guest-page content (cms_guest_page / cms_language) — the
 * "Site pages" section of the editor (Plans.md, Phase 2).
 *
 * Unlike itineraries/homepage, guest pages are NOT described by a hand-written
 * field schema in cms-config.ts: their content is a deep JSON dictionary
 * (hundreds of keys for the manuals) whose shape is locked to what the
 * coze_client layout renders. The shape itself is the schema — the editor
 * renders a form from the stored JSON structure, and saves are validated
 * structurally against the existing row:
 *
 *   - same set of object keys (no additions/removals/renames)
 *   - leaves stay strings
 *   - arrays may grow/shrink, but every item must match the shape of the
 *     existing first item (so a list of cards stays a list of cards)
 *
 * This is what keeps "adding a page later is content work, not code work"
 * true: a new page is a migration-script run, not a new schema + UI.
 */

import { asc, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cmsGuestPageTable, cmsLanguageTable } from "@/db/schema";
import { triggerCozeClientDeploy } from "@/lib/content-store";
import { createHttpError } from "@/lib/api-error";
import { getSupabaseStorageClient } from "@/lib/supabase-storage";

export const PAGES_MEDIA_BUCKET = "pages-media";

// Editor-facing metadata for each page key present in cms_guest_page.
// `multiLang: false` marks language-independent config rows (stored under
// lang='en' by convention; the editor hides the language switcher).
export const GUEST_PAGES: {
  page: string;
  label: string;
  description: string;
  multiLang: boolean;
  // Live coze_client route(s) this page's content feeds, relative to the
  // site root (no language prefix — the editor adds `/<lang>` for
  // non-English). Most pages have exactly one; `manuals` is shared copy
  // rendered on two property pages, so it has two, each labeled.
  previewPaths: { label: string; path: string }[];
}[] = [
  {
    page: "manuals",
    label: "Guest manuals (Ananda & Prana)",
    description:
      "All text on the /gka and /gkb check-in manuals — shared copy with per-property names filled in automatically.",
    multiLang: true,
    previewPaths: [
      { label: "Ananda", path: "/gka" },
      { label: "Prana", path: "/gkb" },
    ],
  },
  {
    page: "hanbok",
    label: "Hanbok Photo Shoot",
    description: "The /hanbok-photo-shoot experience page — pricing, inclusions, rental info and photos.",
    multiLang: true,
    previewPaths: [{ label: "", path: "/hanbok-photo-shoot" }],
  },
  {
    page: "celebration",
    label: "COZE Celebration",
    description: "The /celebration party-styling page — packages, add-ons, notes and photos.",
    multiLang: true,
    previewPaths: [{ label: "", path: "/celebration" }],
  },
  {
    page: "gka-config",
    label: "Ananda — property facts",
    description: "Unit number, WiFi network & password and photo paths for /gka. Same in every language.",
    multiLang: false,
    previewPaths: [{ label: "", path: "/gka" }],
  },
  {
    page: "gkb-config",
    label: "Prana — property facts",
    description: "Unit number, WiFi network & password and photo paths for /gkb. Same in every language.",
    multiLang: false,
    previewPaths: [{ label: "", path: "/gkb" }],
  },
];

const listLanguages = async () =>
  db
    .select({
      code: cmsLanguageTable.code,
      label: cmsLanguageTable.label,
      htmlLang: cmsLanguageTable.htmlLang,
      enabled: cmsLanguageTable.enabled,
    })
    .from(cmsLanguageTable)
    .where(eq(cmsLanguageTable.enabled, true))
    .orderBy(asc(cmsLanguageTable.sortOrder));

// Public base URL for pages-media objects, so the editor can preview images
// from bucket-relative keys stored in the content.
const pagesMediaBaseUrl = () => {
  const client = getSupabaseStorageClient();
  const { data } = client.storage.from(PAGES_MEDIA_BUCKET).getPublicUrl("x");
  return data.publicUrl.replace(/\/x$/, "/");
};

type GuestPageStatus = {
  page: string;
  label: string;
  description: string;
  multiLang: boolean;
  langs: { lang: string; machineTranslated: boolean; updatedAt: Date }[];
};

const listGuestPages = async (): Promise<GuestPageStatus[]> => {
  const rows = await db
    .select({
      page: cmsGuestPageTable.page,
      lang: cmsGuestPageTable.lang,
      machineTranslated: cmsGuestPageTable.machineTranslated,
      updatedAt: cmsGuestPageTable.updatedAt,
    })
    .from(cmsGuestPageTable);
  return GUEST_PAGES.map((meta) => ({
    ...meta,
    langs: rows
      .filter((r) => r.page === meta.page)
      .map(({ lang, machineTranslated, updatedAt }) => ({ lang, machineTranslated, updatedAt })),
  }));
};

const getGuestPage = async (page: string, lang: string) => {
  const [row] = await db
    .select()
    .from(cmsGuestPageTable)
    .where(and(eq(cmsGuestPageTable.page, page), eq(cmsGuestPageTable.lang, lang)))
    .limit(1);
  if (!row) return null;
  return {
    page: row.page,
    lang: row.lang,
    fields: row.fields as Record<string, unknown>,
    machineTranslated: row.machineTranslated,
    updatedAt: row.updatedAt,
    mediaBaseUrl: pagesMediaBaseUrl(),
  };
};

// ── structural validation ──

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Throws with a readable path when `next` deviates from `current`'s shape.
const assertSameShape = (current: unknown, next: unknown, path: string) => {
  if (typeof current === "string") {
    if (typeof next !== "string")
      throw createHttpError(`Expected text at ${path || "(root)"}.`, 400);
    return;
  }
  if (Array.isArray(current)) {
    if (!Array.isArray(next))
      throw createHttpError(`Expected a list at ${path || "(root)"}.`, 400);
    if (current.length === 0) return; // no template item to check against
    for (let i = 0; i < next.length; i++) {
      assertSameShape(current[0], next[i], `${path}[${i}]`);
    }
    return;
  }
  if (isPlainObject(current)) {
    if (!isPlainObject(next))
      throw createHttpError(`Expected a group of fields at ${path || "(root)"}.`, 400);
    const currentKeys = Object.keys(current);
    const nextKeys = new Set(Object.keys(next));
    for (const key of currentKeys) {
      if (!nextKeys.has(key))
        throw createHttpError(`Missing field "${path ? `${path}.` : ""}${key}".`, 400);
    }
    for (const key of nextKeys) {
      if (!currentKeys.includes(key))
        throw createHttpError(`Unknown field "${path ? `${path}.` : ""}${key}".`, 400);
    }
    for (const key of currentKeys) {
      assertSameShape(current[key], (next as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
    }
    return;
  }
  // Non-string scalars (numbers/booleans) don't occur in guest-page dicts
  // today; if one appears, require exact type match so nothing silently morphs.
  if (typeof next !== typeof current)
    throw createHttpError(`Unexpected value type at ${path || "(root)"}.`, 400);
};

const saveGuestPage = async (
  page: string,
  lang: string,
  fields: unknown,
  userId: string,
) => {
  const existing = await getGuestPage(page, lang);
  if (!existing)
    throw createHttpError(`No content for page "${page}" in language "${lang}".`, 404);

  assertSameShape(existing.fields, fields, "");

  const [row] = await db
    .update(cmsGuestPageTable)
    .set({
      fields: fields as Record<string, unknown>,
      // A human just touched this row — it is no longer a raw machine
      // translation awaiting review (Plans.md Phase 5 contract).
      machineTranslated: false,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(and(eq(cmsGuestPageTable.page, page), eq(cmsGuestPageTable.lang, lang)))
    .returning();

  await triggerCozeClientDeploy();
  return {
    page: row.page,
    lang: row.lang,
    fields: row.fields as Record<string, unknown>,
    machineTranslated: row.machineTranslated,
    updatedAt: row.updatedAt,
    mediaBaseUrl: existing.mediaBaseUrl,
  };
};

// Upload a replacement/new image into pages-media under this page's folder.
// Same filename-sanitization convention as media-store.ts / the migration
// script (Supabase Storage rejects non-ASCII keys). upsert: replacing an
// image in place (same name) is the common editor flow.
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;
const sanitizeFilename = (filename: string) => {
  if (SAFE_FILENAME.test(filename)) return filename;
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex > 0 ? filename.slice(dotIndex) : "";
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const safeBase = base
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safeBase || "file"}${ext}`;
};

const uploadPagesMedia = async (
  page: string,
  filename: string,
  buffer: Buffer,
  contentType?: string,
) => {
  if (!GUEST_PAGES.some((meta) => meta.page === page))
    throw createHttpError(`Unknown page "${page}".`, 404);
  const key = `${page}/${sanitizeFilename(filename)}`;
  const client = getSupabaseStorageClient();
  const { error } = await client.storage
    .from(PAGES_MEDIA_BUCKET)
    .upload(key, buffer, { contentType, upsert: true });
  if (error) throw createHttpError(`Upload failed: ${error.message}`, 500);
  return { key, publicUrl: pagesMediaBaseUrl() + key };
};

export {
  listLanguages,
  listGuestPages,
  getGuestPage,
  saveGuestPage,
  uploadPagesMedia,
  assertSameShape,
};
