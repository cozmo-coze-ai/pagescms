"use client";

/**
 * Per-property manual sheet for one building. Columns = Shared + each property
 * (in the selected language); rows = the shared manual's text fields. Editing a
 * property cell writes that property's sparse override document; editing Shared
 * writes the base manual. One Save writes every touched document.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { DEPLOY_STATUS_REFRESH_EVENT } from "@/components/cms/deploy-status";
import { BuildingSheet } from "@/components/cms/building-sheet";
import { type Json } from "@/components/cms/shape-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/contexts/user-context";
import { deleteAtPath, setAtPathCreate, setAtPath, type JsonPath } from "@/lib/json-path";
import { getFamily, overridePageFor } from "@/lib/page-families";
import { buildPreviewUrl } from "@/lib/preview-url";

type Language = { code: string; label: string };
type Doc = { fields: Record<string, Json>; machineTranslated: boolean };

const docKey = (page: string, lang: string) => `${page}:${lang}`;

export default function BuildingSheetPage() {
  const { canWrite } = useUser();
  const params = useParams<{ family: string }>();
  const router = useRouter();
  const family = getFamily(params.family);

  const [languages, setLanguages] = useState<Language[]>([]);
  const [lang, setLang] = useState("en");
  const [docs, setDocs] = useState<Record<string, Doc>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!family) router.replace("/cms/site-pages");
  }, [family, router]);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/cms/guest-pages");
      const json = await response.json();
      if (json.status === "success") setLanguages(json.data.languages);
    })();
  }, []);

  // Which documents does the current language need? The shared building manual
  // plus each property's override doc.
  const neededPages = useMemo(
    () =>
      family
        ? [family.manualPage, ...family.manualProperties.map((p) => overridePageFor(p.slug))]
        : [],
    [family],
  );

  useEffect(() => {
    if (!family || languages.length === 0) return;
    const missing = neededPages.filter((page) => !(docKey(page, lang) in docs));
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const results = await Promise.all(
        missing.map(async (page) => {
          const response = await fetch(`/api/cms/guest-pages/${page}/${lang}`);
          const json = await response.json();
          return { page, json };
        }),
      );
      if (cancelled) return;
      setDocs((prev) => {
        const next = { ...prev };
        for (const { page, json } of results) {
          if (json.status === "success") {
            next[docKey(page, lang)] = {
              fields: json.data.fields,
              machineTranslated: json.data.machineTranslated,
            };
          } else {
            toast.error(json.message || `Could not load ${page} (${lang}).`);
          }
        }
        return next;
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, languages, lang, neededPages]);

  const setDoc = useCallback((page: string, updater: (fields: Record<string, Json>) => Record<string, Json>) => {
    const key = docKey(page, lang);
    setDocs((prev) => {
      const doc = prev[key];
      if (!doc) return prev;
      return { ...prev, [key]: { ...doc, fields: updater(doc.fields) } };
    });
    setDirty((prev) => ({ ...prev, [key]: true }));
  }, [lang]);

  const handleSharedChange = useCallback((path: JsonPath, value: string) => {
    if (!family) return;
    setDoc(family.manualPage, (fields) => setAtPath(fields, path, value) as Record<string, Json>);
  }, [family, setDoc]);

  const handleOverrideSet = useCallback((slug: string, path: JsonPath, value: string) => {
    setDoc(overridePageFor(slug), (fields) => setAtPathCreate(fields, path, value) as Record<string, Json>);
  }, [setDoc]);

  const handleOverrideRevert = useCallback((slug: string, path: JsonPath) => {
    setDoc(overridePageFor(slug), (fields) => deleteAtPath(fields, path) as Record<string, Json>);
  }, [setDoc]);

  const dirtyKeys = useMemo(() => Object.keys(dirty).filter((k) => dirty[k]), [dirty]);

  const handleSave = async () => {
    if (dirtyKeys.length === 0) return;
    setSaving(true);
    try {
      const results = await Promise.all(
        dirtyKeys.map(async (key) => {
          const [page, docLang] = key.split(":");
          const response = await fetch(`/api/cms/guest-pages/${page}/${docLang}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: docs[key].fields,
              keepMachineTranslated: docLang !== "en",
            }),
          });
          return { key, page, json: await response.json() };
        }),
      );
      let failures = 0;
      setDocs((prev) => {
        const next = { ...prev };
        for (const { key, json } of results) {
          if (json.status === "success") {
            next[key] = { fields: json.data.fields, machineTranslated: json.data.machineTranslated };
          }
        }
        return next;
      });
      setDirty((prev) => {
        const next = { ...prev };
        for (const { key, json } of results) {
          if (json.status === "success") next[key] = false;
          else failures++;
        }
        return next;
      });
      for (const { page, json } of results) {
        if (json.status !== "success") toast.error(json.message || `Could not save ${page}.`);
      }
      if (failures === 0) {
        toast.success(dirtyKeys.length > 1 ? `Saved ${dirtyKeys.length} documents.` : "Saved.");
        window.dispatchEvent(new Event(DEPLOY_STATUS_REFRESH_EVENT));
      }
    } finally {
      setSaving(false);
    }
  };

  if (!family) return null;

  const sharedFields = docs[docKey(family.manualPage, lang)]?.fields;
  const overridesBySlug: Record<string, Record<string, Json> | undefined> = {};
  for (const p of family.manualProperties) {
    overridesBySlug[p.slug] = docs[docKey(overridePageFor(p.slug), lang)]?.fields;
  }
  const ready = Boolean(sharedFields) && family.manualProperties.every((p) => overridesBySlug[p.slug]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <DocumentTitle title={`${family.shortLabel} — per-property manual`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/cms/site-pages"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Site pages
          </Link>
          <h1 className="font-serif text-xl tracking-tight">{family.shortLabel} — per-property manual</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every property in its own column. A muted cell inherits the Shared copy; type to give that
            property its own wording. Editing Shared changes it for all that haven&apos;t diverged.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={handleSave} disabled={dirtyKeys.length === 0 || saving}>
            {saving
              ? "Saving…"
              : dirtyKeys.length > 0
                ? `Save ${dirtyKeys.length} change${dirtyKeys.length > 1 ? "s" : ""}`
                : "Save changes"}
          </Button>
        )}
      </div>

      {/* Language tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {languages.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            className={
              l.code === lang
                ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-[12px] font-medium text-foreground"
                : "rounded-full border border-border bg-card px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            }
          >
            {l.label}
          </button>
        ))}
        <span className="ml-1 flex flex-wrap items-center gap-1.5">
          {family.manualProperties.map((p) => (
            <a
              key={p.slug}
              href={buildPreviewUrl(p.path, lang)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {p.label}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ))}
        </span>
      </div>

      {loading || !ready ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <BuildingSheet
            family={family}
            sharedFields={sharedFields!}
            overridesBySlug={overridesBySlug}
            onSharedChange={handleSharedChange}
            onOverrideSet={handleOverrideSet}
            onOverrideRevert={handleOverrideRevert}
            readonly={!canWrite}
          />
          <p className="text-[11px] text-muted-foreground">
            Lists (e.g. walk-in steps) and photos stay shared per building. WiFi, door codes and unit
            numbers are edited in the{" "}
            <Link href={`/cms/site-pages/facts/${family.id}`} className="text-primary hover:underline">
              property facts sheet
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
