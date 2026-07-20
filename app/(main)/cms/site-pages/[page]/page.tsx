"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { DEPLOY_STATUS_REFRESH_EVENT } from "@/components/cms/deploy-status";
import { ShapeForm, isImageObject, type Json } from "@/components/cms/shape-form";
import {
  SitePageSheet,
  filterOtherContent,
  mergeOtherContent,
  type Language,
} from "@/components/cms/site-page-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Guest-page editor (Plans.md Phase 2). Multi-lang pages get a
 * spreadsheet-style grid — one row per text field, one column per language,
 * English pinned first — so translations can be scanned and edited
 * side-by-side instead of one language-tab at a time. Images and repeatable
 * groups (arrays) don't fit a grid cell, so they render below via the
 * existing shape-driven form, one language at a time. Single-language pages
 * (multiLang: false, e.g. config rows) keep the plain form.
 */

type PageMeta = {
  page: string;
  label: string;
  description: string;
  multiLang: boolean;
  previewPaths: { label: string; path: string }[];
};

// coze_client puts the language code in the path for everything but English
// (/celebration vs /ko/celebration) — see coze_client/src/pages/[lang]/*.
const siteBaseUrl = (process.env.NEXT_PUBLIC_COZE_CLIENT_SITE_URL || "https://www.coze.care").replace(
  /\/+$/,
  "",
);
const buildPreviewUrl = (path: string, lang: string) =>
  `${siteBaseUrl}${lang === "en" ? "" : `/${lang}`}${path}`;

// Classifies the filtered "other content" tree so the panel heading matches
// what's actually in it — manuals has no images, hanbok has both, etc.
function describeOtherContent(value: Json, key = ""): { hasImages: boolean; hasLists: boolean } {
  if (isImageObject(key, value)) return { hasImages: true, hasLists: false };
  if (Array.isArray(value)) return { hasImages: false, hasLists: true };
  if (value && typeof value === "object") {
    let hasImages = false;
    let hasLists = false;
    for (const [k, v] of Object.entries(value)) {
      const child = describeOtherContent(v, k);
      hasImages ||= child.hasImages;
      hasLists ||= child.hasLists;
    }
    return { hasImages, hasLists };
  }
  return { hasImages: false, hasLists: false };
}

export default function SitePageEditor() {
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

  // Deep-linking a language (e.g. from an email or a bookmark) should land
  // on that language's tab in the images/lists panel below the sheet.
  useEffect(() => {
    setOtherLang(searchParams.get("lang") ?? "en");
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

  const handleCellChange = (lang: string, path: string[], value: string) => {
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

  const otherContentLabel = useMemo(() => {
    if (!otherFields) return "Photos & lists";
    const { hasImages, hasLists } = describeOtherContent(otherFields);
    if (hasImages && hasLists) return "Photos & lists";
    if (hasImages) return "Photos";
    return "Lists";
  }, [otherFields]);

  const handleOtherLangChange = (lang: string) => {
    setOtherLang(lang);
    router.replace(`/cms/site-pages/${page}?lang=${lang}`, { scroll: false });
  };

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
        <Button size="sm" onClick={handleSave} disabled={!fieldsByLang || !anyDirty || saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {!fieldsByLang ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : meta?.multiLang ? (
        <>
          <p className="text-xs text-muted-foreground">
            Click a cell to edit it. Tab/Shift+Tab moves between languages, Enter moves down a
            row. English is pinned as the reference column.
          </p>
          <SitePageSheet
            languages={languages}
            fieldsByLang={fieldsByLang}
            machineTranslatedByLang={machineTranslatedByLang}
            onCellChange={handleCellChange}
          />

          {otherFields && Object.keys(otherFields).length > 0 && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-serif text-sm tracking-tight">{otherContentLabel}</h2>
                <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-secondary/30 p-1">
                  {languages.map((language) => {
                    const active = language.code === otherLang;
                    return (
                      <button
                        key={language.code}
                        type="button"
                        onClick={() => handleOtherLangChange(language.code)}
                        className={cn(
                          "shrink-0 rounded-md px-3 py-1 text-[13px] transition-colors",
                          active
                            ? "bg-secondary font-medium text-foreground"
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
              />
            </div>
          )}
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
        />
      )}
    </div>
  );
}
