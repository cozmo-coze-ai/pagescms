"use client";

/**
 * Side-by-side facts sheet for one property family: columns are the family's
 * properties (Ananda · Prana / HT · HTA · HTB), rows are the facts stored in
 * their `*-config` guest-page rows — unit numbers, WiFi rows, door codes,
 * arrival links, addresses. Built on the shared SheetGrid engine.
 *
 * Array facts (WiFi, door codes, included/excluded lists) render one grid row
 * per item field per index, up to the longest array in the family; columns
 * whose array is shorter show "—". Per-column add/remove controls live in the
 * section footer. Images/photos stay out of the grid — each property links to
 * its full editor for those.
 */

import { useMemo } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { humanize, isImagePathString, type Json } from "@/lib/field-format";
import { SheetGrid, type SheetColumn, type SheetSection } from "@/components/cms/sheet-grid";
import { getAtPath, type JsonPath } from "@/lib/json-path";
import type { PageFamily } from "@/lib/page-families";

// Layout knobs, not guest-facing facts — hidden from the sheet (still
// editable in the per-property editor).
const EXCLUDED_KEYS = new Set(["heroSize", "heroPosition"]);

const isHtmlKey = (key: string) => /Html$/.test(key);

type RowWithPath = { id: string; label: string; isHtml?: boolean; path: JsonPath };

export function FamilyFactsSheet({
  family,
  docsByPage,
  onChange,
  onArrayResize,
  readonly = false,
}: {
  family: PageFamily;
  docsByPage: Record<string, Record<string, Json> | undefined>;
  onChange: (page: string, path: JsonPath, value: string) => void;
  onArrayResize: (page: string, arrayKey: string, nextLength: number) => void;
  readonly?: boolean;
}) {
  const { sections, pathsByRowId } = useMemo(() => {
    const docs = family.properties.map((p) => docsByPage[p.page]);
    const pathsByRowId = new Map<string, JsonPath>();
    const sections: SheetSection[] = [];

    // Union of top-level keys across the family's docs, first-seen order.
    const topKeys: string[] = [];
    for (const doc of docs) {
      if (!doc) continue;
      for (const key of Object.keys(doc)) {
        if (!topKeys.includes(key)) topKeys.push(key);
      }
    }

    for (const topKey of topKeys) {
      if (EXCLUDED_KEYS.has(topKey)) continue;
      const samples = docs
        .map((doc) => doc?.[topKey])
        .filter((v): v is Json => v !== undefined);
      if (samples.length === 0) continue;
      const sample = samples[0];

      if (Array.isArray(sample)) {
        // Array section: rows per index per item field, up to the longest
        // array across the family.
        const maxLength = Math.max(
          0,
          ...docs.map((doc) => {
            const v = doc?.[topKey];
            return Array.isArray(v) ? v.length : 0;
          }),
        );
        // Union of item keys across every property's array, so optional
        // per-item fields (e.g. a door row's `note`) always get a row; a
        // property whose item lacks the key shows "—".
        const itemKeys: string[] = [];
        let hasObjectItems = false;
        for (const arr of samples) {
          if (!Array.isArray(arr)) continue;
          for (const item of arr) {
            if (item && typeof item === "object" && !Array.isArray(item)) {
              hasObjectItems = true;
              for (const k of Object.keys(item as Record<string, Json>)) {
                if (!itemKeys.includes(k)) itemKeys.push(k);
              }
            }
          }
        }
        const rows: { id: string; label: string; isHtml?: boolean }[] = [];
        for (let index = 0; index < maxLength; index++) {
          if (hasObjectItems) {
            for (const itemKey of itemKeys) {
              const id = `${topKey}.${index}.${itemKey}`;
              pathsByRowId.set(id, [topKey, index, itemKey]);
              rows.push({
                id,
                label: `${humanize(topKey)} ${index + 1} · ${humanize(itemKey)}`,
                isHtml: isHtmlKey(itemKey),
              });
            }
          } else {
            const id = `${topKey}.${index}`;
            pathsByRowId.set(id, [topKey, index]);
            rows.push({ id, label: `${humanize(topKey)} ${index + 1}` });
          }
        }
        sections.push({
          key: topKey,
          label: humanize(topKey),
          rows,
          footer: readonly
            ? undefined
            : (column: SheetColumn) => {
                const doc = docsByPage[column.id];
                const value = doc?.[topKey];
                if (!Array.isArray(value)) return null;
                const canAdd = value.length > 0; // needs a template item to clone
                return (
                  <span className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={!canAdd}
                      title={
                        canAdd
                          ? `Add a ${humanize(topKey).toLowerCase()} row`
                          : "Empty list — no template row to copy"
                      }
                      onClick={() => onArrayResize(column.id, topKey, value.length + 1)}
                    >
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={value.length <= 1}
                      title="Remove the last row"
                      onClick={() => onArrayResize(column.id, topKey, value.length - 1)}
                    >
                      <Minus className="h-3 w-3" /> Remove
                    </Button>
                  </span>
                );
              },
        });
        continue;
      }

      // Scalar/object section: union of non-image string leaves across docs.
      const rows: RowWithPath[] = [];
      const seen = new Set<string>();
      const walk = (value: Json | undefined, path: JsonPath) => {
        if (value === undefined || value === null) return;
        if (typeof value === "string") {
          const key = String(path[path.length - 1]);
          if (isImagePathString(key, value)) return;
          const id = path.join(".");
          if (seen.has(id)) return;
          seen.add(id);
          rows.push({
            id,
            label: path.length === 1
              ? humanize(String(path[0]))
              : path.slice(1).map((s) => humanize(String(s))).join(" › "),
            isHtml: isHtmlKey(key),
            path,
          });
          return;
        }
        if (Array.isArray(value)) return; // nested arrays stay in the full editor
        if (typeof value === "object") {
          for (const [key, child] of Object.entries(value)) {
            walk(child, [...path, key]);
          }
        }
      };
      for (const doc of docs) {
        if (doc && topKey in doc) walk(doc[topKey], [topKey]);
      }
      if (rows.length === 0) continue;
      for (const row of rows) pathsByRowId.set(row.id, row.path);
      sections.push({
        key: topKey,
        label: humanize(topKey),
        rows: rows.map(({ id, label, isHtml }) => ({ id, label, isHtml })),
      });
    }

    return { sections, pathsByRowId };
  }, [family, docsByPage, readonly, onArrayResize]);

  const columns: SheetColumn[] = family.properties.map((property) => ({
    id: property.page,
    label: property.label,
  }));

  return (
    <SheetGrid
      columns={columns}
      sections={sections}
      readonly={readonly}
      getValue={(columnId, rowId) => {
        const path = pathsByRowId.get(rowId);
        if (!path) return undefined;
        const doc = docsByPage[columnId];
        if (!doc || !(String(path[0]) in doc)) return undefined;
        const value = getAtPath(doc, path);
        // Array rows beyond this property's length → "—"; other missing
        // leaves also render as non-editable.
        return typeof value === "string" ? value : undefined;
      }}
      onChange={(columnId, rowId, value) => {
        const path = pathsByRowId.get(rowId);
        if (path) onChange(columnId, path, value);
      }}
    />
  );
}
