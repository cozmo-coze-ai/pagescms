/**
 * Pure formatting/classification helpers for guest-page field trees, shared
 * by the shape-driven form, the sheet grids and the Quick-updates registry.
 *
 * Kept free of React/CSS imports so any of those modules (and plain scripts)
 * can use them without pulling in the rich-text editor bundle.
 */

export type Json = string | number | boolean | Json[] | { [key: string]: Json };

// "bodyHtml" → "Body", "wifiRows" → "Wifi Rows", "igLabel" → "Ig Label"
export const humanize = (key: string) =>
  key
    .replace(/Src$/, "")
    .replace(/Html$/, "")
    .replace(/[-_]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

const IMAGE_EXT_RE = /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const IMAGE_KEY_RE = /(^image$|image|photo|cover|poster|thumbnail|avatar|heroSrc$|ogImage$|Src$)/i;

export const isImagePathString = (key: string, value: string) =>
  IMAGE_EXT_RE.test(value) || IMAGE_KEY_RE.test(key);

export const isImageObject = (
  key: string,
  value: Json,
): value is { src: string; alt: string } =>
  key === "image" &&
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as Record<string, Json>).src === "string" &&
  typeof (value as Record<string, Json>).alt === "string";
