"use client";

/**
 * Spreadsheet-style editor for a guest page's text content across every
 * language at once. Rows are the page's text fields, columns are languages
 * with English pinned first/left as the reference column — a thin wrapper
 * over the shared SheetGrid engine (components/cms/sheet-grid.tsx).
 *
 * Non-text content (images, repeatable card/list groups) doesn't fit a grid
 * cell, so it's filtered out of the sheet and rendered below via the
 * existing shape-driven `ShapeForm`, one language at a time.
 */

import { useMemo } from "react";
import {
  humanize,
  isImageObject,
  isImagePathString,
  type Json,
} from "@/lib/field-format";
import {
  SheetGrid,
  type SheetColumn,
  type SheetSection,
} from "@/components/cms/sheet-grid";
import { getAtPath } from "@/lib/json-path";

export type Language = { code: string; label: string };

type TextRow = {
  id: string;
  sectionKey: string;
  sectionLabel: string;
  path: string[];
  label: string;
  isHtml: boolean;
};

const isHtmlKey = (key: string) => /Html$/.test(key);

// Walks one language's field tree collecting only plain string leaves —
// arrays and { src, alt } image objects are left for the panel below.
export function collectTextRows(fields: Record<string, Json>): TextRow[] {
  const rows: TextRow[] = [];
  const walk = (value: Json, path: string[], sectionKey: string, sectionLabel: string) => {
    if (typeof value === "string") {
      if (isImagePathString(path[path.length - 1], value)) return;
      rows.push({
        id: path.join("."),
        sectionKey,
        sectionLabel,
        path,
        label: path.slice(1).map(humanize).join(" › ") || humanize(path[0]),
        isHtml: isHtmlKey(path[path.length - 1]),
      });
      return;
    }
    if (Array.isArray(value)) return;
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (isImageObject(key, child)) continue;
        walk(child, [...path, key], sectionKey, sectionLabel);
      }
    }
  };
  for (const [sectionKey, sectionValue] of Object.entries(fields)) {
    walk(sectionValue, [sectionKey], sectionKey, humanize(sectionKey));
  }
  return rows;
}

// Everything a text row skips (arrays, images) — kept as a nested tree so
// the existing ShapeForm can render it unchanged, section by section.
export function filterOtherContent(key: string, value: Json): Json | undefined {
  if (isImageObject(key, value)) return value;
  if (typeof value === "string" && isImagePathString(key, value)) return value;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const out: Record<string, Json> = {};
    let has = false;
    for (const [k, v] of Object.entries(value)) {
      const filtered = filterOtherContent(k, v);
      if (filtered !== undefined) {
        out[k] = filtered;
        has = true;
      }
    }
    return has ? out : undefined;
  }
  return undefined;
}

// Merges a change coming back from ShapeForm (scoped to the filtered
// other-content subtree) back into the full field tree for that language.
export function mergeOtherContent(key: string, original: Json | undefined, next: Json): Json {
  if (isImageObject(key, next) || Array.isArray(next)) return next;
  if (next && typeof next === "object") {
    const base =
      original && typeof original === "object" && !Array.isArray(original)
        ? (original as Record<string, Json>)
        : {};
    const merged: Record<string, Json> = { ...base };
    for (const [k, v] of Object.entries(next)) {
      merged[k] = mergeOtherContent(k, base[k], v);
    }
    return merged;
  }
  return next;
}

export function SitePageSheet({
  languages,
  fieldsByLang,
  machineTranslatedByLang,
  onCellChange,
  readonly = false,
}: {
  languages: Language[];
  fieldsByLang: Record<string, Record<string, Json>>;
  machineTranslatedByLang: Record<string, boolean>;
  onCellChange: (lang: string, path: string[], value: string) => void;
  readonly?: boolean;
}) {
  const en = languages.find((l) => l.code === "en");
  const otherLanguages = languages.filter((l) => l.code !== "en");
  const orderedLanguages = en ? [en, ...otherLanguages] : languages;

  const rows = useMemo(
    () => (fieldsByLang.en ? collectTextRows(fieldsByLang.en) : []),
    [fieldsByLang.en],
  );

  const rowsById = useMemo(() => {
    const map = new Map<string, TextRow>();
    rows.forEach((row) => map.set(row.id, row));
    return map;
  }, [rows]);

  const columns: SheetColumn[] = orderedLanguages.map((language, index) => ({
    id: language.code,
    label: language.label,
    pinned: index === 0,
    tinted: Boolean(machineTranslatedByLang[language.code]),
  }));

  const sections = useMemo(() => {
    const out: SheetSection[] = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      const entry = { id: row.id, label: row.label, isHtml: row.isHtml };
      if (last && last.key === row.sectionKey) last.rows.push(entry);
      else out.push({ key: row.sectionKey, label: row.sectionLabel, rows: [entry] });
    }
    return out;
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <SheetGrid
      columns={columns}
      sections={sections}
      readonly={readonly}
      getValue={(columnId, rowId) => {
        const row = rowsById.get(rowId);
        if (!row) return undefined;
        return (getAtPath(fieldsByLang[columnId], row.path) as string) ?? "";
      }}
      onChange={(columnId, rowId, value) => {
        const row = rowsById.get(rowId);
        if (row) onCellChange(columnId, row.path, value);
      }}
    />
  );
}
