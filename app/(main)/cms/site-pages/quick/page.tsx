"use client";

/**
 * Quick updates — the fields the team actually changes week to week (WiFi,
 * door codes, promotions, prices, check-in/out, arrival & parking) pulled
 * out of every manual and property-facts row into one place. Topics are
 * defined in lib/quick-fields.ts; each block renders as a SheetGrid whose
 * columns are either languages (manual/experience copy) or the properties
 * of a family (facts). One Save writes every touched document.
 *
 * Saves send keepMachineTranslated so fixing a single KO price doesn't
 * silently mark the whole KO document as human-reviewed.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { DEPLOY_STATUS_REFRESH_EVENT } from "@/components/cms/deploy-status";
import { type Json } from "@/components/cms/shape-form";
import {
  SheetGrid,
  type SheetColumn,
  type SheetSection,
} from "@/components/cms/sheet-grid";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/contexts/user-context";
import { getAtPath, resizeArrayAtPath, setAtPath, type JsonPath } from "@/lib/json-path";
import { getFamily } from "@/lib/page-families";
import { buildPreviewUrl } from "@/lib/preview-url";
import {
  QUICK_TOPICS,
  collectPropertyScalarRows,
  collectQuickRows,
  getQuickTopic,
  type QuickBlock,
  type QuickRow,
} from "@/lib/quick-fields";

type Language = { code: string; label: string };

type Doc = { fields: Record<string, Json>; machineTranslated: boolean };

const docKey = (page: string, lang: string) => `${page}:${lang}`;

// Which documents does a block need? byLanguage → its page in every
// language; byProperty → the family's config rows, en only.
const blockDocKeys = (block: QuickBlock, languages: Language[]): { page: string; lang: string }[] => {
  if (block.mode === "byLanguage") {
    return languages.map((language) => ({ page: block.page, lang: language.code }));
  }
  const family = getFamily(block.family);
  if (!family) return [];
  return family.properties.map((property) => ({ page: property.page, lang: "en" }));
};

function QuickBlockGrid({
  block,
  languages,
  docs,
  onCellChange,
  onArrayResize,
  readonly,
}: {
  block: QuickBlock;
  languages: Language[];
  docs: Record<string, Doc>;
  onCellChange: (page: string, lang: string, path: JsonPath, value: string) => void;
  onArrayResize: (page: string, lang: string, path: string[], nextLength: number) => void;
  readonly: boolean;
}) {
  const { columns, sections, resolve } = useMemo(() => {
    if (block.mode === "byLanguage") {
      const en = languages.find((l) => l.code === "en");
      const others = languages.filter((l) => l.code !== "en");
      const ordered = en ? [en, ...others] : languages;
      const columns: SheetColumn[] = ordered.map((language, index) => ({
        id: language.code,
        label: language.label,
        pinned: index === 0,
        tinted: Boolean(docs[docKey(block.page, language.code)]?.machineTranslated),
      }));
      const enFields = docs[docKey(block.page, "en")]?.fields;
      const rows = collectQuickRows(enFields, block);
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const sections: SheetSection[] = [
        {
          key: block.page,
          label: block.title,
          rows: rows.map(({ id, label, isHtml }) => ({ id, label, isHtml })),
        },
      ];
      return {
        columns,
        sections,
        resolve: (columnId: string, rowId: string) => {
          const row = rowsById.get(rowId);
          if (!row) return null;
          return { page: block.page, lang: columnId, path: row.path };
        },
      };
    }

    const family = getFamily(block.family);
    const properties = family?.properties ?? [];
    const columns: SheetColumn[] = properties.map((property) => ({
      id: property.page,
      label: property.label,
    }));
    const propertyDocs = properties.map((p) => docs[docKey(p.page, "en")]?.fields);

    const rowsById = new Map<string, QuickRow>();
    const sections: SheetSection[] = [];

    const scalarRows: QuickRow[] = [
      ...(block.rows ?? []).map((row) => ({
        id: row.path.join("."),
        label: row.label,
        path: row.path,
        isHtml: row.isHtml,
      })),
      ...(block.subtrees ? collectPropertyScalarRows(propertyDocs, block.subtrees) : []),
    ];
    if (scalarRows.length > 0) {
      for (const row of scalarRows) rowsById.set(row.id, row);
      sections.push({
        key: `${block.title}-facts`,
        label: block.title,
        rows: scalarRows.map(({ id, label, isHtml }) => ({ id, label, isHtml })),
      });
    }

    for (const arrayDef of block.arrays ?? []) {
      const arrayId = arrayDef.path.join(".");
      const maxLength = Math.max(
        0,
        ...propertyDocs.map((doc) => {
          const v = getAtPath(doc, arrayDef.path);
          return Array.isArray(v) ? v.length : 0;
        }),
      );
      const rows: { id: string; label: string; isHtml?: boolean }[] = [];
      for (let index = 0; index < maxLength; index++) {
        for (const field of arrayDef.itemFields) {
          const id = `${arrayId}.${index}.${field.key}`;
          const row: QuickRow = {
            id,
            label: `${arrayDef.label} ${index + 1} · ${field.label}`,
            path: [...arrayDef.path, index, field.key],
          };
          rowsById.set(id, row);
          rows.push({ id, label: row.label });
        }
      }
      sections.push({
        key: `${block.title}-${arrayId}`,
        label: `${block.title} — ${arrayDef.label}`,
        rows,
        footer: readonly
          ? undefined
          : (column: SheetColumn) => {
              const doc = docs[docKey(column.id, "en")]?.fields;
              const value = getAtPath(doc, arrayDef.path);
              if (!Array.isArray(value)) return null;
              return (
                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={value.length === 0}
                    title={
                      value.length > 0
                        ? `Add a ${arrayDef.label.toLowerCase()} row`
                        : "Empty list — no template row to copy"
                    }
                    onClick={() =>
                      onArrayResize(column.id, "en", arrayDef.path, value.length + 1)
                    }
                  >
                    + Add
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={value.length <= 1}
                    title="Remove the last row"
                    onClick={() =>
                      onArrayResize(column.id, "en", arrayDef.path, value.length - 1)
                    }
                  >
                    − Remove
                  </Button>
                </span>
              );
            },
      });
    }

    return {
      columns,
      sections,
      resolve: (columnId: string, rowId: string) => {
        const row = rowsById.get(rowId);
        if (!row) return null;
        return { page: columnId, lang: "en", path: row.path };
      },
    };
  }, [block, languages, docs, readonly, onArrayResize]);

  if (columns.length === 0 || sections.length === 0) return null;

  return (
    <SheetGrid
      columns={columns}
      sections={sections}
      readonly={readonly}
      getValue={(columnId, rowId) => {
        const target = resolve(columnId, rowId);
        if (!target) return undefined;
        const doc = docs[docKey(target.page, target.lang)];
        if (!doc) return undefined;
        const value = getAtPath(doc.fields, target.path);
        return typeof value === "string" ? value : undefined;
      }}
      onChange={(columnId, rowId, value) => {
        const target = resolve(columnId, rowId);
        if (target) onCellChange(target.page, target.lang, target.path, value);
      }}
    />
  );
}

function QuickUpdatesPageInner() {
  const { canWrite } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicId = searchParams.get("topic") ?? QUICK_TOPICS[0].id;
  const topic = getQuickTopic(topicId) ?? QUICK_TOPICS[0];

  const [languages, setLanguages] = useState<Language[]>([]);
  const [docs, setDocs] = useState<Record<string, Doc>>({});
  const [dirtyDocs, setDirtyDocs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/cms/guest-pages");
      const json = await response.json();
      if (json.status !== "success") {
        toast.error(json.message || "Could not load page info.");
        return;
      }
      setLanguages(json.data.languages);
    })();
  }, []);

  // Load the docs the active topic needs (skipping ones already cached).
  useEffect(() => {
    if (languages.length === 0) return;
    const needed = new Map<string, { page: string; lang: string }>();
    for (const block of topic.blocks) {
      for (const target of blockDocKeys(block, languages)) {
        needed.set(docKey(target.page, target.lang), target);
      }
    }
    const missing = [...needed.values()].filter(
      (target) => !(docKey(target.page, target.lang) in docs),
    );
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const results = await Promise.all(
        missing.map(async (target) => {
          const response = await fetch(
            `/api/cms/guest-pages/${target.page}/${target.lang}`,
          );
          const json = await response.json();
          return { target, json };
        }),
      );
      if (cancelled) return;
      setDocs((prev) => {
        const next = { ...prev };
        for (const { target, json } of results) {
          if (json.status === "success") {
            next[docKey(target.page, target.lang)] = {
              fields: json.data.fields,
              machineTranslated: json.data.machineTranslated,
            };
          }
        }
        return next;
      });
      for (const { target, json } of results) {
        if (json.status !== "success") {
          toast.error(json.message || `Could not load ${target.page} (${target.lang}).`);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, languages]);

  const handleCellChange = useCallback(
    (page: string, lang: string, path: JsonPath, value: string) => {
      const key = docKey(page, lang);
      setDocs((prev) => {
        const doc = prev[key];
        if (!doc) return prev;
        return {
          ...prev,
          [key]: {
            ...doc,
            fields: setAtPath(doc.fields, path, value) as Record<string, Json>,
          },
        };
      });
      setDirtyDocs((prev) => ({ ...prev, [key]: true }));
    },
    [],
  );

  const handleArrayResize = useCallback(
    (page: string, lang: string, path: string[], nextLength: number) => {
      const key = docKey(page, lang);
      setDocs((prev) => {
        const doc = prev[key];
        if (!doc) return prev;
        const next = resizeArrayAtPath(doc.fields, path, nextLength);
        if (next === doc.fields) return prev;
        return { ...prev, [key]: { ...doc, fields: next as Record<string, Json> } };
      });
      setDirtyDocs((prev) => ({ ...prev, [key]: true }));
    },
    [],
  );

  const dirtyKeys = useMemo(
    () => Object.keys(dirtyDocs).filter((key) => dirtyDocs[key]),
    [dirtyDocs],
  );

  const handleSave = async () => {
    if (dirtyKeys.length === 0) return;
    setSaving(true);
    try {
      const results = await Promise.all(
        dirtyKeys.map(async (key) => {
          const [page, lang] = key.split(":");
          const response = await fetch(`/api/cms/guest-pages/${page}/${lang}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: docs[key].fields,
              // A quick single-field edit is not a translation review.
              keepMachineTranslated: true,
            }),
          });
          const json = await response.json();
          return { key, page, lang, json };
        }),
      );
      let failures = 0;
      setDocs((prev) => {
        const next = { ...prev };
        for (const { key, json } of results) {
          if (json.status === "success") {
            next[key] = {
              fields: json.data.fields,
              machineTranslated: json.data.machineTranslated,
            };
          }
        }
        return next;
      });
      setDirtyDocs((prev) => {
        const next = { ...prev };
        for (const { key, json } of results) {
          if (json.status === "success") next[key] = false;
          else failures++;
        }
        return next;
      });
      for (const { page, lang, json } of results) {
        if (json.status !== "success") {
          toast.error(json.message || `Could not save ${page} (${lang}).`);
        }
      }
      if (failures === 0) {
        toast.success(
          dirtyKeys.length > 1 ? `Saved ${dirtyKeys.length} documents.` : "Saved.",
        );
        window.dispatchEvent(new Event(DEPLOY_STATUS_REFRESH_EVENT));
      }
    } finally {
      setSaving(false);
    }
  };

  const previewLinksForBlock = (block: QuickBlock) => {
    if (block.mode === "byProperty") {
      const family = getFamily(block.family);
      return (family?.properties ?? []).map((property) => ({
        label: property.label,
        url: buildPreviewUrl(property.path, "en"),
      }));
    }
    return [];
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <DocumentTitle title="Quick updates" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/cms/site-pages"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Site pages
          </Link>
          <h1 className="font-serif text-xl tracking-tight">Quick updates</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{topic.blurb}</p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={handleSave} disabled={dirtyKeys.length === 0 || saving}>
            {saving
              ? "Saving…"
              : dirtyKeys.length > 0
                ? `Save ${dirtyKeys.length} document${dirtyKeys.length > 1 ? "s" : ""}`
                : "Save changes"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_TOPICS.map((entry) => {
          const active = entry.id === topic.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => router.replace(`/cms/site-pages/quick?topic=${entry.id}`, { scroll: false })}
              className={
                active
                  ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-[12px] font-medium text-foreground"
                  : "rounded-full border border-border bg-card px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              }
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {topic.blocks.map((block, index) => {
            const previews = previewLinksForBlock(block);
            return (
              <div key={`${topic.id}-${index}`} className="space-y-2">
                {previews.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {previews.map((preview) => (
                      <a
                        key={preview.url}
                        href={preview.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        {preview.label}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ))}
                  </div>
                )}
                <QuickBlockGrid
                  block={block}
                  languages={languages}
                  docs={docs}
                  onCellChange={handleCellChange}
                  onArrayResize={handleArrayResize}
                  readonly={!canWrite}
                />
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            Amber-tinted languages are unreviewed machine translations — quick edits are saved
            but the review status is kept. Use the full page editors to review translations.
          </p>
        </div>
      )}
    </div>
  );
}

export default function QuickUpdatesPage() {
  return (
    <Suspense fallback={null}>
      <QuickUpdatesPageInner />
    </Suspense>
  );
}
