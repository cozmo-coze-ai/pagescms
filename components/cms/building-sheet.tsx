"use client";

/**
 * One sheet per building for per-property manual copy. Columns are a pinned
 * "Shared" reference plus one per property (gk/gka/gkb or ht/hta/htb); rows are
 * the shared manual's text fields, for the selected language. A property cell
 * shows its own override when set (accent bar) or the inherited shared value
 * (muted). Typing into a property cell sets that property's override; typing
 * the shared value back reverts it to inherited. Editing the Shared column
 * changes the base copy for every property that hasn't diverged.
 *
 * Only string fields are editable here (lists/images stay shared per building);
 * facts like WiFi and door codes live in the property facts sheet.
 */

import { useMemo } from "react";
import { collectTextRows } from "@/components/cms/site-page-sheet";
import {
  SheetGrid,
  type CellVariant,
  type SheetColumn,
  type SheetSection,
} from "@/components/cms/sheet-grid";
import { getAtPath, type Json, type JsonPath } from "@/lib/json-path";
import type { PageFamily } from "@/lib/page-families";

const SHARED_COL = "__shared__";

export function BuildingSheet({
  family,
  sharedFields,
  overridesBySlug,
  searchDocs,
  onSharedChange,
  onOverrideSet,
  onOverrideRevert,
  readonly = false,
  query,
  onQueryChange,
  onVisibleRowsChange,
}: {
  family: PageFamily;
  sharedFields: Record<string, Json>;
  overridesBySlug: Record<string, Record<string, Json> | undefined>;
  // Field documents in every language (shared + overrides) — search haystack
  // only; the visible cells still come from sharedFields/overridesBySlug.
  searchDocs?: Record<string, Json>[];
  onSharedChange: (path: JsonPath, value: string) => void;
  onOverrideSet: (slug: string, path: JsonPath, value: string) => void;
  onOverrideRevert: (slug: string, path: JsonPath) => void;
  readonly?: boolean;
  // Lifted search (see SheetGrid) so "Fix with AI" shares the visible scope.
  query?: string;
  onQueryChange?: (query: string) => void;
  onVisibleRowsChange?: (rowIds: string[]) => void;
}) {
  const rows = useMemo(() => collectTextRows(sharedFields), [sharedFields]);
  const rowsById = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>();
    rows.forEach((row) => map.set(row.id, row));
    return map;
  }, [rows]);

  const columns: SheetColumn[] = [
    { id: SHARED_COL, label: "All units", pinned: true },
    ...family.manualProperties.map((p) => ({ id: p.slug, label: p.label })),
  ];

  const sections: SheetSection[] = useMemo(() => {
    const out: SheetSection[] = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      const entry = { id: row.id, label: row.label, isHtml: row.isHtml };
      if (last && last.key === row.sectionKey) last.rows.push(entry);
      else out.push({ key: row.sectionKey, label: row.sectionLabel, rows: [entry] });
    }
    return out;
  }, [rows]);

  const overrideAt = (slug: string, path: JsonPath) =>
    getAtPath(overridesBySlug[slug], path);

  return (
    <SheetGrid
      columns={columns}
      sections={sections}
      readonly={readonly}
      query={query}
      onQueryChange={onQueryChange}
      onVisibleRowsChange={onVisibleRowsChange}
      getValue={(columnId, rowId) => {
        const row = rowsById.get(rowId);
        if (!row) return undefined;
        const sharedVal = (getAtPath(sharedFields, row.path) as string) ?? "";
        if (columnId === SHARED_COL) return sharedVal;
        const ov = overrideAt(columnId, row.path);
        return typeof ov === "string" ? ov : sharedVal; // inherited → shared value
      }}
      getSearchText={(rowId) => {
        const row = rowsById.get(rowId);
        if (!row || !searchDocs) return undefined;
        const parts: string[] = [];
        for (const doc of searchDocs) {
          const value = getAtPath(doc, row.path);
          if (typeof value === "string" && value) parts.push(value);
        }
        return parts.join("\n");
      }}
      getCellVariant={(columnId, rowId): CellVariant | undefined => {
        if (columnId === SHARED_COL) return undefined;
        const row = rowsById.get(rowId);
        if (!row) return undefined;
        // "overridden" = this unit has its own wording (accent bar); "inherited"
        // = grey, showing the shared "All units" text until someone changes it.
        return typeof overrideAt(columnId, row.path) === "string" ? "overridden" : "inherited";
      }}
      onChange={(columnId, rowId, value) => {
        const row = rowsById.get(rowId);
        if (!row) return;
        if (columnId === SHARED_COL) {
          onSharedChange(row.path, value);
          return;
        }
        const sharedVal = (getAtPath(sharedFields, row.path) as string) ?? "";
        // Typing the shared value back into a property cell = inherit again.
        if (value === sharedVal) onOverrideRevert(columnId, row.path);
        else onOverrideSet(columnId, row.path, value);
      }}
    />
  );
}
