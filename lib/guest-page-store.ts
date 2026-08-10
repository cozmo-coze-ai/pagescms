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
import { assertSameShape, assertSubsetShape } from "@/lib/shape-validate";
import { getSupabaseStorageClient } from "@/lib/supabase-storage";
// Property-family metadata lives in lib/page-families.ts (client-safe);
// re-exported here for server-side consumers of the store.
import { PAGE_FAMILIES, sharedManualForOverride, type PageFamilyId } from "@/lib/page-families";

export { PAGE_FAMILIES };
export type { PageFamilyId };

export const PAGES_MEDIA_BUCKET = "pages-media";

// Editor-facing metadata for each page key present in cms_guest_page.
// `multiLang: false` marks language-independent config rows (stored under
// lang='en' by convention; the editor hides the language switcher).
export const GUEST_PAGES: {
  page: string;
  label: string;
  description: string;
  multiLang: boolean;
  // Which index block this page belongs to, and what it is within it.
  group: PageFamilyId | "experiences";
  role: "manual" | "facts" | "page";
  // Live coze_client route(s) this page's content feeds, relative to the
  // site root (no language prefix — the editor adds `/<lang>` for
  // non-English). Most pages have exactly one; `manuals` is shared copy
  // rendered on two property pages, so it has two, each labeled.
  previewPaths: { label: string; path: string }[];
}[] = [
  {
    page: "manuals",
    label: "Guest manuals (Kelly, Ananda & Prana)",
    description:
      "All text on the /gk, /gka and /gkb check-in manuals — shared copy with per-property names filled in automatically.",
    multiLang: true,
    group: "gk",
    role: "manual",
    previewPaths: [
      { label: "Kelly", path: "/gk" },
      { label: "Ananda", path: "/gka" },
      { label: "Prana", path: "/gkb" },
    ],
  },
  {
    page: "hanbok",
    label: "Hanbok Photo Shoot",
    description: "The /hanbok-photo-shoot experience page — pricing, inclusions, rental info and photos.",
    multiLang: true,
    group: "experiences",
    role: "page",
    previewPaths: [{ label: "", path: "/hanbok-photo-shoot" }],
  },
  {
    page: "celebration",
    label: "COZE Celebration",
    description: "The /celebration party-styling page — packages, add-ons, notes and photos.",
    multiLang: true,
    group: "experiences",
    role: "page",
    previewPaths: [{ label: "", path: "/celebration" }],
  },
  {
    page: "gka-config",
    label: "Ananda — property facts",
    description: "Unit number, WiFi network & password and photo paths for /gka. Same in every language.",
    multiLang: false,
    group: "gk",
    role: "facts",
    previewPaths: [{ label: "", path: "/gka" }],
  },
  {
    page: "gkb-config",
    label: "Prana — property facts",
    description: "Unit number, WiFi network & password and photo paths for /gkb. Same in every language.",
    multiLang: false,
    group: "gk",
    role: "facts",
    previewPaths: [{ label: "", path: "/gkb" }],
  },
  {
    page: "manuals-ht",
    label: "Guest manuals (COZE HT, HTA & HTB)",
    description:
      "All text on the /ht, /hta and /htb Haebangchon check-in manuals — shared copy (incl. the Wellness & Rooftop section) with per-property names filled in automatically.",
    multiLang: true,
    group: "ht",
    role: "manual",
    previewPaths: [
      { label: "HT", path: "/ht" },
      { label: "HTA", path: "/hta" },
      { label: "HTB", path: "/htb" },
    ],
  },
  {
    page: "ht-config",
    label: "COZE HT — property facts",
    description: "Unit label, WiFi network & password and photo paths for /ht. Same in every language.",
    multiLang: false,
    group: "ht",
    role: "facts",
    previewPaths: [{ label: "", path: "/ht" }],
  },
  {
    page: "hta-config",
    label: "COZE HTA — property facts",
    description: "Unit label, WiFi network & password and photo paths for /hta. Same in every language.",
    multiLang: false,
    group: "ht",
    role: "facts",
    previewPaths: [{ label: "", path: "/hta" }],
  },
  {
    page: "htb-config",
    label: "COZE HTB — property facts",
    description: "Unit label, WiFi network & password and photo paths for /htb. Same in every language.",
    multiLang: false,
    group: "ht",
    role: "facts",
    previewPaths: [{ label: "", path: "/htb" }],
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

// Structural validation (assertSameShape) lives in lib/shape-validate.ts —
// pure, so it can be shared/tested without this server graph.

const saveGuestPage = async (
  page: string,
  lang: string,
  fields: unknown,
  userId: string,
  options?: {
    // Quick-updates saves touch one field, not the whole document — that is
    // not a translation review, so the "needs review" flag must survive.
    keepMachineTranslated?: boolean;
  },
) => {
  const existing = await getGuestPage(page, lang);
  if (!existing)
    throw createHttpError(`No content for page "${page}" in language "${lang}".`, 404);

  // Per-property manual override pages (`<slug>-manual`) hold a SPARSE subset
  // of the shared building manual — only the fields that property has diverged.
  // Validate against the shared manual's shape (not the override's own prior
  // shape, which grows/shrinks as fields are overridden or reverted).
  const sharedManual = sharedManualForOverride(page);
  if (sharedManual) {
    const template = await getGuestPage(sharedManual, lang);
    if (!template)
      throw createHttpError(`Missing shared manual "${sharedManual}" (${lang}) to validate against.`, 500);
    assertSubsetShape(template.fields, fields, "");
  } else {
    assertSameShape(existing.fields, fields, "");
  }

  const [row] = await db
    .update(cmsGuestPageTable)
    .set({
      fields: fields as Record<string, unknown>,
      // A human just touched this row — it is no longer a raw machine
      // translation awaiting review (Plans.md Phase 5 contract), unless the
      // caller asked to preserve review status (quick single-field edits).
      machineTranslated: options?.keepMachineTranslated ? existing.machineTranslated : false,
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
