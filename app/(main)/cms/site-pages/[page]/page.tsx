"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, FileText, Images } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { DEPLOY_STATUS_REFRESH_EVENT } from "@/components/cms/deploy-status";
import { AiJsonAssistant } from "@/components/cms/ai-json-assistant";
import { ShapeForm, type Json } from "@/components/cms/shape-form";
import {
  SitePageSheet,
  collectTextRows,
  filterOtherContent,
  filterTextRows,
  mergeOtherContent,
  type Language,
} from "@/components/cms/site-page-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/contexts/user-context";
import { cn } from "@/lib/utils";
import { getFamilyForPage } from "@/lib/page-families";
import type { JsonPath } from "@/lib/json-path";
import { buildPreviewUrl } from "@/lib/preview-url";

/**
 * Guest-page editor (Plans.md Phase 2). Multi-lang pages get a
 * spreadsheet-style grid — one row per text field, one column per language,
 * English pinned first — so translations can be scanned and edited
 * side-by-side instead of one language-tab at a time. Images and repeatable
 * groups (arrays) become numbered sheet rows. Image uploads and list
 * add/remove controls stay in a secondary view. Single-language pages
 * (multiLang: false, e.g. config rows) keep the plain form.
 */

type PageMeta = {
  page: string;
  label: string;
  description: string;
  multiLang: boolean;
  previewPaths: { label: string; path: string }[];
};

export default function SitePageEditor() {
  const { canWrite } = useUser();
  const params = useParams<{ page: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = params.page;

  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [mediaBaseUrl, setMediaBaseUrl] = useState("");

  const [fieldsByLang, setFieldsByLang] = useState<Record<string, Record<string, Json>> | null>(
    null,
  );
  const [machineTranslatedByLang, setMachineTranslatedByLang] = useState<Record<string, boolean>>(
    {},
  );
  const [dirtyLangs, setDirtyLangs] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [otherLang, setOtherLang] = useState(() => searchParams.get("lang") ?? "en");
  const [editorView, setEditorView] = useState<"text" | "media">(() =>
    searchParams.get("lang") ? "media" : "text",
  );
  const [query, setQuery] = useState("");

  // Deep-linking a language (e.g. from an email or a bookmark) should land
  // on that language's tab in the images/lists panel below the sheet.
  useEffect(() => {
    setOtherLang(searchParams.get("lang") ?? "en");
    setEditorView(searchParams.get("lang") ? "media" : "text");
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/cms/guest-pages");
      const json = await response.json();
      if (json.status !== "success") {
        toast.error(json.message || "Could not load page info.");
        return;
      }
      const found = json.data.pages.find((p: PageMeta) => p.page === page);
      if (!found) {
        toast.error(`Unknown page "${page}".`);
        router.replace("/cms/site-pages");
        return;
      }
      setMeta(found);
      setLanguages(json.data.languages);
    })();
  }, [page, router]);

  const loadContent = useCallback(async () => {
    if (!meta) return;
    setFieldsByLang(null);
    const langsToLoad = meta.multiLang ? languages : languages.filter((l) => l.code === "en");
    if (langsToLoad.length === 0) return;
    const results = await Promise.all(
      langsToLoad.map(async (language) => {
        const response = await fetch(`/api/cms/guest-pages/${page}/${language.code}`);
        const json = await response.json();
        return { lang: language.code, json };
      }),
    );
    const nextFields: Record<string, Record<string, Json>> = {};
    const nextMachineTranslated: Record<string, boolean> = {};
    let base = "";
    for (const { lang, json } of results) {
      if (json.status !== "success") {
        toast.error(json.message || `Could not load ${lang} content.`);
        continue;
      }
      nextFields[lang] = json.data.fields;
      nextMachineTranslated[lang] = json.data.machineTranslated;
      base = json.data.mediaBaseUrl;
    }
    setFieldsByLang(nextFields);
    setMachineTranslatedByLang(nextMachineTranslated);
    setMediaBaseUrl(base);
    setDirtyLangs({});
  }, [meta, languages, page]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleCellChange = (lang: string, path: JsonPath, value: string) => {
    setFieldsByLang((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      let node: any = next[lang];
      for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
      node[path[path.length - 1]] = value;
      return next;
    });
    setDirtyLangs((prev) => ({ ...prev, [lang]: true }));
  };

  const handleOtherContentChange = (lang: string, next: Record<string, Json>) => {
    setFieldsByLang((prev) => {
      if (!prev) return prev;
      const merged = mergeOtherContent("", prev[lang], next) as Record<string, Json>;
      return { ...prev, [lang]: merged };
    });
    setDirtyLangs((prev) => ({ ...prev, [lang]: true }));
  };

  const handleSave = async () => {
    if (!fieldsByLang) return;
    const langsToSave = languages.filter((l) => dirtyLangs[l.code]);
    if (langsToSave.length === 0) return;
    setSaving(true);
    try {
      const results = await Promise.all(
        langsToSave.map(async (language) => {
          const response = await fetch(`/api/cms/guest-pages/${page}/${language.code}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields: fieldsByLang[language.code] }),
          });
          const json = await response.json();
          return { lang: language.code, json };
        }),
      );
      let failures = 0;
      setFieldsByLang((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        for (const { lang, json } of results) {
          if (json.status === "success") next[lang] = json.data.fields;
        }
        return next;
      });
      setMachineTranslatedByLang((prev) => {
        const next = { ...prev };
        for (const { lang, json } of results) {
          if (json.status === "success") next[lang] = json.data.machineTranslated;
        }
        return next;
      });
      setDirtyLangs((prev) => {
        const next = { ...prev };
        for (const { lang, json } of results) {
          if (json.status === "success") next[lang] = false;
          else failures++;
        }
        return next;
      });
      for (const { lang, json } of results) {
        if (json.status !== "success") toast.error(json.message || `Could not save ${lang}.`);
      }
      if (failures === 0) {
        toast.success(
          langsToSave.length > 1 ? `Saved ${langsToSave.length} languages.` : "Saved.",
        );
        window.dispatchEvent(new Event(DEPLOY_STATUS_REFRESH_EVENT));
      }
    } finally {
      setSaving(false);
    }
  };

  const anyDirty = Object.values(dirtyLangs).some(Boolean);

  const otherFields = useMemo(() => {
    if (!fieldsByLang?.[otherLang]) return null;
    const filtered = filterOtherContent("", fieldsByLang[otherLang]);
    return (filtered as Record<string, Json> | undefined) ?? null;
  }, [fieldsByLang, otherLang]);

  const handleOtherLangChange = (lang: string) => {
    setOtherLang(lang);
    router.replace(`/cms/site-pages/${page}?lang=${lang}`, { scroll: false });
  };

  // The sheet's rows and search subset, shared with the AI assistant so a
  // search-narrowed sheet copies (and applies) exactly what's on screen.
  const rows = useMemo(
    () => (fieldsByLang?.en ? collectTextRows(fieldsByLang.en, { includeArrays: true }) : []),
    [fieldsByLang],
  );
  const aiLanguages = useMemo(
    () => languages.filter((language) => fieldsByLang?.[language.code]),
    [fieldsByLang, languages],
  );
  const filteredRows = useMemo(
    () => filterTextRows(rows, query, fieldsByLang ?? {}, aiLanguages),
    [rows, query, fieldsByLang, aiLanguages],
  );

  // When this page belongs to a property family, offer sideways links to the
  // family's manual, its facts sheet, and each sibling property's editor.
  const family = getFamilyForPage(page);
  const isFactsPage = meta ? !meta.multiLang && family?.properties.some((p) => p.page === page) : false;

  return (
    <div className={cn("mx-auto space-y-4", meta?.multiLang ? "max-w-[1400px]" : "max-w-2xl")}>
      <DocumentTitle title={meta ? meta.label : "Site pages"} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/cms/site-pages"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Site pages
          </Link>
          <h1 className="font-serif text-xl tracking-tight">{meta?.label ?? "…"}</h1>
          {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>}
          {meta && family && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-medium uppercase tracking-wide">{family.shortLabel}:</span>
              <Link
                href={`/cms/site-pages/building/${family.id}`}
                className="text-primary hover:underline"
              >
                Manual &amp; translations
              </Link>
              <Link
                href={`/cms/site-pages/facts/${family.id}`}
                className="hover:text-foreground hover:underline"
              >
                Property details
              </Link>
              {family.properties
                .filter((property) => property.page !== page)
                .map((property) => (
                  <Link
                    key={property.page}
                    href={`/cms/site-pages/${property.page}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {property.label}
                  </Link>
                ))}
            </div>
          )}
          {meta && isFactsPage && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Change every {family?.shortLabel} unit in one place on the{" "}
              <Link href={`/cms/site-pages/facts/${family?.id}`} className="text-primary hover:underline">
                Property details
              </Link>{" "}
              page.
            </p>
          )}
          {meta && languages.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {meta.previewPaths.map((entry) => (
                <div key={entry.path} className="flex flex-wrap items-center gap-1">
                  {entry.label && (
                    <span className="text-[11px] text-muted-foreground">{entry.label}</span>
                  )}
                  {languages.map((language) => (
                    <a
                      key={language.code}
                      href={buildPreviewUrl(entry.path, language.code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open the live ${language.label} page in a new tab`}
                      className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {language.code.toUpperCase()}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <AiJsonAssistant
              page={page}
              pageLabel={meta?.label ?? page}
              languages={aiLanguages}
              fieldsByLang={fieldsByLang ?? {}}
              rows={rows}
              requestRows={filteredRows}
              searchQuery={query.trim() || undefined}
              onApplyCell={handleCellChange}
            />
            <Button size="sm" onClick={handleSave} disabled={!fieldsByLang || !anyDirty || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </div>

      {!fieldsByLang ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : meta?.multiLang ? (
        <>
          <div className="border-b border-border">
            <div className="flex items-center gap-5" role="tablist" aria-label="Page editor view">
              <button
                type="button"
                role="tab"
                aria-selected={editorView === "text"}
                onClick={() => setEditorView("text")}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 py-2 text-xs font-medium transition-colors",
                  editorView === "text"
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Text
              </button>
              {otherFields && Object.keys(otherFields).length > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorView === "media"}
                  onClick={() => setEditorView("media")}
                  className={cn(
                    "-mb-px inline-flex items-center gap-1.5 border-b-2 px-1 py-2 text-xs font-medium transition-colors",
                    editorView === "media"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Images className="h-3.5 w-3.5" />
                  Media &amp; lists
                </button>
              )}
            </div>
          </div>

          {editorView === "text" ? (
            <SitePageSheet
              languages={languages}
              fieldsByLang={fieldsByLang}
              machineTranslatedByLang={machineTranslatedByLang}
              onCellChange={handleCellChange}
              readonly={!canWrite}
              query={query}
              onQueryChange={setQuery}
              rows={rows}
              filteredRows={filteredRows}
            />
          ) : otherFields && Object.keys(otherFields).length > 0 ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <div className="flex items-center gap-1 overflow-x-auto rounded-md border border-border bg-secondary/30 p-1">
                  {languages.map((language) => {
                    const active = language.code === otherLang;
                    return (
                      <button
                        key={language.code}
                        type="button"
                        onClick={() => handleOtherLangChange(language.code)}
                        className={cn(
                          "shrink-0 rounded px-3 py-1 text-[13px] transition-colors",
                          active
                            ? "bg-background font-medium text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {language.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <ShapeForm
                page={page}
                fields={otherFields}
                mediaBaseUrl={mediaBaseUrl}
                onChange={(next) => handleOtherContentChange(otherLang, next)}
                readonly={!canWrite}
              />
            </div>
          ) : null}
        </>
      ) : (
        <ShapeForm
          page={page}
          fields={fieldsByLang.en ?? {}}
          mediaBaseUrl={mediaBaseUrl}
          onChange={(next) => {
            setFieldsByLang((prev) => ({ ...(prev ?? {}), en: next }));
            setDirtyLangs((prev) => ({ ...prev, en: true }));
          }}
          readonly={!canWrite}
        />
      )}
    </div>
  );
}
