/**
 * Supabase Storage-backed media CRUD, replacing the Octokit blob writes in
 * the old `[owner]/[repo]/[branch]/files/[path]` route's "media" case.
 *
 * Objects are keyed `<slug>/<filename>` in the `itineraries-media` bucket
 * (public-read) — this is also the exact value shape stored in
 * `cms_itinerary.cover_path` and referenced by inline body images, so no
 * path rewriting is needed between storage and content.
 */

import { getSupabaseStorageClient, ITINERARIES_MEDIA_BUCKET } from "@/lib/supabase-storage";
import { getFileExtension, extensionCategories } from "@/lib/utils/file";
import { createHttpError } from "@/lib/api-error";

const ALLOWED_EXTENSIONS = extensionCategories["image"] || [];

// Supabase Storage rejects object keys with non-ASCII/special characters
// (Korean text, fullwidth chars, parentheses, spaces...). Sanitize to a safe
// key, preserving the extension, only when the original name isn't already
// safe — mirrors scripts/migrate-content-to-supabase.mjs so editor uploads
// and migrated objects follow the same convention.
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

type MediaObject = {
  slug: string;
  filename: string;
  path: string;
  publicUrl: string;
  size: number | null;
  updatedAt: string | null;
};

const toPublicUrl = (path: string) => {
  const client = getSupabaseStorageClient();
  const { data } = client.storage.from(ITINERARIES_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

const listMedia = async (slug: string): Promise<MediaObject[]> => {
  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage.from(ITINERARIES_MEDIA_BUCKET).list(slug, {
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw createHttpError(`Could not list media for "${slug}": ${error.message}`, 500);

  return (data || [])
    .filter((item) => item.id) // Storage lists placeholder "folders" as entries without an id
    .map((item) => {
      const path = `${slug}/${item.name}`;
      return {
        slug,
        filename: item.name,
        path,
        publicUrl: toPublicUrl(path),
        size: item.metadata?.size ?? null,
        updatedAt: item.updated_at ?? null,
      };
    });
};

const uploadMedia = async (
  slug: string,
  filename: string,
  content: Buffer,
  contentType?: string
): Promise<MediaObject> => {
  filename = sanitizeFilename(filename);
  const extension = getFileExtension(filename);
  if (ALLOWED_EXTENSIONS.length > 0 && !ALLOWED_EXTENSIONS.includes(extension)) {
    throw createHttpError(`Invalid file extension ".${extension}". Allowed: ${ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(", ")}`, 400);
  }

  const path = `${slug}/${filename}`;
  const client = getSupabaseStorageClient();
  const { error } = await client.storage.from(ITINERARIES_MEDIA_BUCKET).upload(path, content, {
    contentType,
    upsert: true,
  });
  if (error) throw createHttpError(`Could not upload "${filename}": ${error.message}`, 500);

  return {
    slug,
    filename,
    path,
    publicUrl: toPublicUrl(path),
    size: content.byteLength,
    updatedAt: new Date().toISOString(),
  };
};

const deleteMedia = async (slug: string, filename: string) => {
  const path = `${slug}/${filename}`;
  const client = getSupabaseStorageClient();
  const { error } = await client.storage.from(ITINERARIES_MEDIA_BUCKET).remove([path]);
  if (error) throw createHttpError(`Could not delete "${filename}": ${error.message}`, 500);
};

// Moves every object under <oldSlug>/ to <newSlug>/ — used when an
// itinerary's slug changes (content-store.ts's renameItinerary).
const renameMediaFolder = async (oldSlug: string, newSlug: string) => {
  const objects = await listMedia(oldSlug);
  const client = getSupabaseStorageClient();
  for (const object of objects) {
    const newPath = `${newSlug}/${object.filename}`;
    const { error } = await client.storage.from(ITINERARIES_MEDIA_BUCKET).move(object.path, newPath);
    if (error) throw createHttpError(`Could not move "${object.path}" to "${newPath}": ${error.message}`, 500);
  }
};

export { listMedia, uploadMedia, deleteMedia, renameMediaFolder, toPublicUrl };
