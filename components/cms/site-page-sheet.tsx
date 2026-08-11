"use client";

/**
 * Spreadsheet-style editor for a guest page's text content across every
 * language at once. Rows are the page's text fields, columns are languages
 * with English pinned first/left as the reference column — a thin wrapper
 * over the shared SheetGrid engine (components/cms/sheet-grid.tsx).
 *
 * Text nested inside repeatable cards/lists is flattened into numbered rows.
 * The separate media/list view keeps image uploads and add/remove controls.
 */

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAtPath, type JsonPath } from "@/lib/json-path";

export type Language = { code: string; label: string };

type TextRow = {
  id: string;
  sectionKey: string;
  sectionLabel: string;
  path: JsonPath;
  label: string;
  isHtml: boolean;
};

const isHtmlKey = (key: string) => /Html$/.test(key);

const singularize = (label: string) => {
  if (label.endsWith("ies")) return `${label.slice(0, -3)}y`;
  if (label.endsWith("xes")) return label.slice(0, -2);
  if (label.endsWith("s")) return label.slice(0, -1);
  return label;
};

const textRowLabel = (path: JsonPath) => {
  const labels: string[] = [];
  const segments = path.slice(1);
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (typeof segment === "number") {
      const parent = String(path[index]);
      labels.push(`${singularize(humanize(parent))} ${segment + 1}`);
      continue;
    }
    // The following numeric segment names this collection more clearly as
    // "Package 1" or "Item 2", so don't also render a redundant "Packages".
    if (typeof segments[index + 1] === "number") continue;
    labels.push(humanize(segment));
  }
  return labels.join(" › ") || humanize(String(path[0]));
};

// Walks one language's field tree collecting plain guest-facing text. The
// standalone page editor opts into array traversal so package/card/list copy
// stays in the sheet; building overrides keep arrays shared and opt out.
export function collectTextRows(
  fields: Record<string, Json>,
  options: { includeArrays?: boolean } = {},
): TextRow[] {
  const rows: TextRow[] = [];
  const walk = (value: Json, path: JsonPath, sectionKey: string, sectionLabel: string) => {
    const fieldKey = String(path[path.length - 1] ?? "");
    if (typeof value === "string") {
      if (isImagePathString(fieldKey, value)) return;
      rows.push({
        id: path.map(String).join("."),
        sectionKey,
        sectionLabel,
        path,
        label: textRowLabel(path),
        isHtml: isHtmlKey(fieldKey),
      });
      return;
    }
    if (isImageObject(fieldKey, value)) {
      // Alt text is guest-facing copy too. Keep the source path in the media
      // tab, but make the alt text reviewable beside every language.
      if (options.includeArrays) {
        walk(value.alt, [...path, "alt"], sectionKey, sectionLabel);
      }
      return;
    }
    if (Array.isArray(value)) {
      if (!options.includeArrays) return;
      value.forEach((child, index) => {
        walk(child, [...path, index], sectionKey, sectionLabel);
      });
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
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
  onCellChange: (lang: string, path: JsonPath, value: string) => void;
  readonly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const orderedLanguages = useMemo(() => {
    const en = languages.find((language) => language.code === "en");
    const others = languages.filter((language) => language.code !== "en");
    return en ? [en, ...others] : languages;
  }, [languages]);

  const rows = useMemo(
    () => (fieldsByLang.en ? collectTextRows(fieldsByLang.en, { includeArrays: true }) : []),
    [fieldsByLang.en],
  );

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return rows;

    return rows.filter((row) => {
      const values = orderedLanguages.map((language) => {
        const fields = fieldsByLang[language.code];
        return fields ? getAtPath(fields, row.path) : "";
      });
      return [row.id, row.sectionLabel, row.label, ...values]
        .filter((value): value is string => typeof value === "string")
        .join("\n")
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [fieldsByLang, orderedLanguages, query, rows]);

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
    for (const row of filteredRows) {
      const last = out[out.length - 1];
      const entry = { id: row.id, label: row.label, isHtml: row.isHtml };
      if (last && last.key === row.sectionKey) last.rows.push(entry);
      else out.push({ key: row.sectionKey, label: row.sectionLabel, rows: [entry] });
    }
    return out;
  }, [filteredRows]);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="relative min-w-0 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search fields or text"
            aria-label="Search fields or text"
            className="h-8 pl-8 pr-8 text-sm"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              title="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2"
            >
              <X />
            </Button>
          )}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {query.trim() ? `${filteredRows.length} of ${rows.length}` : `${rows.length} fields`}
        </span>
      </div>

      {filteredRows.length > 0 ? (
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
      ) : (
        <div className="rounded-md border border-border px-3 py-8 text-center text-sm text-muted-foreground">
          No matching fields
        </div>
      )}
    </div>
  );
}
