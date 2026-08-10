/**
 * Registry for the "Quick updates" view — the handful of things the team
 * actually changes week to week (WiFi, door codes, promotions, prices,
 * check-in/out times, arrival & parking), mapped to where they live in the
 * cms_guest_page documents. Client-safe (no DB imports).
 *
 * Two block modes:
 * - byLanguage: content from a multi-language page (manuals, hanbok,
 *   celebration) — grid columns are languages, rows are field paths.
 * - byProperty: content from a family's per-property config rows (en-only)
 *   — grid columns are the family's properties, rows are field paths and
 *   array items (WiFi rows, door codes).
 *
 * Key names below were verified against the live cms_guest_page rows on
 * 2026-08-10 — if a key is missing at runtime the row simply shows "—",
 * so a renamed key degrades visibly instead of crashing.
 */

import { humanize, isImagePathString } from "@/lib/field-format";
import { getAtPath, type Json, type JsonPath } from "@/lib/json-path";
import type { PageFamilyId } from "@/lib/page-families";

export type QuickRowDef = { label: string; path: JsonPath; isHtml?: boolean };

export type QuickArrayDef = {
  label: string;
  path: string[];
  // Which item fields to expose as rows; labels for each.
  itemFields: { key: string; label: string }[];
};

export type QuickBlock =
  | {
      mode: "byLanguage";
      title: string;
      page: string;
      rows?: QuickRowDef[];
      // Derive rows by walking these subtrees of the EN document (arrays
      // included); keep only string leaves whose key is in leafKeys (all
      // string leaves when omitted). Image paths are always skipped.
      subtrees?: { path: string[]; leafKeys?: string[] }[];
    }
  | {
      mode: "byProperty";
      title: string;
      family: PageFamilyId;
      rows?: QuickRowDef[];
      arrays?: QuickArrayDef[];
      // Derive scalar rows from the union of string leaves under these
      // subtrees across the family's config docs (skips images/arrays).
      subtrees?: { path: string[] }[];
    };

export type QuickTopic = {
  id: string;
  label: string;
  blurb: string;
  blocks: QuickBlock[];
};

const WIFI_ARRAY: QuickArrayDef = {
  label: "WiFi",
  path: ["wifiRows"],
  itemFields: [
    { key: "unit", label: "Unit" },
    { key: "id", label: "Network" },
    { key: "password", label: "Password" },
  ],
};

const DOOR_CODES_ARRAY: QuickArrayDef = {
  label: "Door codes",
  path: ["doorCodeRows"],
  itemFields: [
    { key: "label", label: "Door" },
    { key: "seq", label: "Code" },
    { key: "note", label: "Note" },
  ],
};

const PROMO_ROWS: QuickRowDef[] = [
  { label: "Promo title", path: ["concierge", "vanPromoTitle"] },
  { label: "Promo · 4-night stay", path: ["concierge", "vanPromo4Stay"] },
  { label: "Promo · 4-night reward", path: ["concierge", "vanPromo4Get"] },
  { label: "Promo · 8-night stay", path: ["concierge", "vanPromo8Stay"] },
  { label: "Promo · 8-night reward", path: ["concierge", "vanPromo8Get"] },
  { label: "Promo note", path: ["concierge", "vanPromoNote"] },
  { label: "Airport van title", path: ["concierge", "airportVanTitle"] },
  { label: "Airport van intro", path: ["concierge", "airportVanLede"] },
  { label: "Rates summary", path: ["concierge", "ratesSummary"] },
  { label: "Rate · Gimpo", path: ["concierge", "rateGimpo"] },
  { label: "Rate · Incheon", path: ["concierge", "rateIncheon"] },
  { label: "Rate · Seoul + luggage", path: ["concierge", "rateSeoulLuggage"] },
  { label: "Rate · flat note", path: ["concierge", "rateFlatHtml"], isHtml: true },
  { label: "Rate · 4-seater", path: ["concierge", "rateSeat4"] },
  { label: "Rate · 7-seater", path: ["concierge", "rateSeat7"] },
];

const CHECKIN_ROWS: QuickRowDef[] = [
  { label: "Check-in time", path: ["arrival", "checkInValue"] },
  { label: "Check-out time", path: ["arrival", "checkOutValue"] },
  { label: "Check-in note", path: ["arrival", "checkInCopy"] },
  { label: "Check-out note", path: ["arrival", "checkOutCopy"] },
];

const PARKING_COPY_ROWS: QuickRowDef[] = [
  { label: "Parking title", path: ["arrival", "parkingTitle"] },
  { label: "Parking intro", path: ["arrival", "parkingLede"] },
  { label: "Parking caption", path: ["arrival", "parkingCaption"] },
  { label: "Watch parking video", path: ["arrival", "watchParking"] },
  { label: "Gate key label", path: ["arrival", "gateKeyLabel"] },
  { label: "Gate key description", path: ["arrival", "gateKeyDesc"] },
  { label: "Additional parking label", path: ["arrival", "additionalParkingLabel"] },
  {
    label: "Additional parking details",
    path: ["arrival", "additionalParkingDescHtml"],
    isHtml: true,
  },
  { label: "Additional parking link", path: ["arrival", "additionalParkingLink"] },
];

export const QUICK_TOPICS: QuickTopic[] = [
  {
    id: "wifi",
    label: "WiFi & door codes",
    blurb: "Networks, passwords and door codes for every property.",
    blocks: [
      {
        mode: "byProperty",
        title: "Kelly Building",
        family: "gk",
        rows: [{ label: "Unit number", path: ["unitNumber"] }],
        arrays: [WIFI_ARRAY],
      },
      {
        mode: "byProperty",
        title: "Haebangchon",
        family: "ht",
        rows: [
          { label: "Unit number", path: ["unitNumber"] },
          { label: "Door suffix", path: ["doorSuffix"] },
        ],
        arrays: [WIFI_ARRAY, DOOR_CODES_ARRAY],
      },
    ],
  },
  {
    id: "promos",
    label: "Promotions & van rates",
    blurb: "Airport-van promotion copy and rates, in every language.",
    blocks: [
      { mode: "byLanguage", title: "Kelly manuals (GK · Ananda · Prana)", page: "manuals", rows: PROMO_ROWS },
      { mode: "byLanguage", title: "Haebangchon manuals (HT · HTA · HTB)", page: "manuals-ht", rows: PROMO_ROWS },
      {
        mode: "byProperty",
        title: "Per-property promo note",
        family: "ht",
        rows: [{ label: "Van promo note", path: ["concierge", "vanPromoNote"] }],
      },
    ],
  },
  {
    id: "prices",
    label: "Prices",
    blurb: "Hanbok Photo Shoot and Celebration pricing, in every language.",
    blocks: [
      {
        mode: "byLanguage",
        title: "Hanbok Photo Shoot",
        page: "hanbok",
        subtrees: [
          { path: ["pricing"], leafKeys: ["label", "value", "heading"] },
          { path: ["rental", "cards"], leafKeys: ["title", "price", "priceNote"] },
        ],
      },
      {
        mode: "byLanguage",
        title: "COZE Celebration",
        page: "celebration",
        subtrees: [
          { path: ["packages"], leafKeys: ["label", "title", "price"] },
          { path: ["addonCards"], leafKeys: ["title", "name", "price", "note"] },
        ],
      },
    ],
  },
  {
    id: "checkin",
    label: "Check-in / check-out",
    blurb: "Times and notes shown on every manual.",
    blocks: [
      { mode: "byLanguage", title: "Kelly manuals (GK · Ananda · Prana)", page: "manuals", rows: CHECKIN_ROWS },
      { mode: "byLanguage", title: "Haebangchon manuals (HT · HTA · HTB)", page: "manuals-ht", rows: CHECKIN_ROWS },
    ],
  },
  {
    id: "arrival-parking",
    label: "Arrival & parking",
    blurb: "Shared arrival/parking copy plus per-property links and codes.",
    blocks: [
      { mode: "byLanguage", title: "Kelly manuals (copy)", page: "manuals", rows: PARKING_COPY_ROWS },
      { mode: "byLanguage", title: "Haebangchon manuals (copy)", page: "manuals-ht", rows: PARKING_COPY_ROWS },
      { mode: "byProperty", title: "Kelly property facts", family: "gk", subtrees: [{ path: ["arrival"] }] },
      { mode: "byProperty", title: "Haebangchon property facts", family: "ht", subtrees: [{ path: ["arrival"] }] },
    ],
  },
];

export const getQuickTopic = (id: string) => QUICK_TOPICS.find((t) => t.id === id);

export type QuickRow = { id: string; label: string; path: JsonPath; isHtml?: boolean };

const isHtmlKey = (key: string) => /Html$/.test(key);

// Human label for a derived row: prefix with the containing item's own
// title/label/name when walking arrays ("Premium Hanbok › Price").
const contextLabel = (container: Json | undefined, fallback: string) => {
  if (container && typeof container === "object" && !Array.isArray(container)) {
    const record = container as Record<string, Json>;
    for (const key of ["title", "label", "name"]) {
      const v = record[key];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return fallback;
};

// Derive rows for a byLanguage block from its explicit rows + subtrees,
// walking the EN document (arrays included).
export function collectQuickRows(
  enFields: Record<string, Json> | undefined,
  block: Extract<QuickBlock, { mode: "byLanguage" }>,
): QuickRow[] {
  const rows: QuickRow[] = (block.rows ?? []).map((row) => ({
    id: row.path.join("."),
    label: row.label,
    path: row.path,
    isHtml: row.isHtml ?? isHtmlKey(String(row.path[row.path.length - 1])),
  }));
  if (!enFields || !block.subtrees) return rows;

  for (const subtree of block.subtrees) {
    const rootLabel = humanize(String(subtree.path[subtree.path.length - 1]));
    const walk = (value: Json | undefined, path: JsonPath, crumb: string) => {
      if (value === undefined || value === null) return;
      if (typeof value === "string") {
        const key = String(path[path.length - 1]);
        if (isImagePathString(key, value)) return;
        if (subtree.leafKeys && !subtree.leafKeys.includes(key)) return;
        rows.push({
          id: path.join("."),
          label: `${crumb} › ${humanize(key)}`,
          path,
          isHtml: isHtmlKey(key),
        });
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          const itemCrumb = contextLabel(item, `${crumb} ${index + 1}`);
          walk(item, [...path, index], itemCrumb);
        });
        return;
      }
      if (typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          walk(child, [...path, key], crumb);
        }
      }
    };
    walk(getAtPath(enFields, subtree.path), subtree.path, rootLabel);
  }
  return rows;
}

// Derive scalar rows for a byProperty block: union of non-image string
// leaves under the subtrees across every property doc (arrays excluded —
// those are handled by QuickArrayDef sections).
export function collectPropertyScalarRows(
  docs: (Record<string, Json> | undefined)[],
  subtrees: { path: string[] }[],
): QuickRow[] {
  const seen = new Map<string, QuickRow>();
  for (const doc of docs) {
    if (!doc) continue;
    for (const subtree of subtrees) {
      const rootLabel = humanize(String(subtree.path[subtree.path.length - 1]));
      const walk = (value: Json | undefined, path: JsonPath) => {
        if (value === undefined || value === null) return;
        if (typeof value === "string") {
          const key = String(path[path.length - 1]);
          if (isImagePathString(key, value)) return;
          const id = path.join(".");
          if (!seen.has(id)) {
            seen.set(id, {
              id,
              label: `${rootLabel} › ${humanize(key)}`,
              path,
              isHtml: isHtmlKey(key),
            });
          }
          return;
        }
        if (Array.isArray(value)) return;
        if (typeof value === "object") {
          for (const [key, child] of Object.entries(value)) {
            walk(child, [...path, key]);
          }
        }
      };
      walk(getAtPath(doc, subtree.path), subtree.path);
    }
  }
  return [...seen.values()];
}
