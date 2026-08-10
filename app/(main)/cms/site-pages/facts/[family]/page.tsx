"use client";

/**
 * Family facts sheet — all of one building's property facts side by side
 * (columns = properties, rows = facts). Backed by the family's `*-config`
 * guest-page rows; saves PUT only the properties that changed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { DEPLOY_STATUS_REFRESH_EVENT } from "@/components/cms/deploy-status";
import { FamilyFactsSheet } from "@/components/cms/family-facts-sheet";
import { type Json } from "@/components/cms/shape-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/contexts/user-context";
import { resizeArrayAtPath, setAtPath, type JsonPath } from "@/lib/json-path";
import { getFamily } from "@/lib/page-families";
import { buildPreviewUrl } from "@/lib/preview-url";

export default function FamilyFactsPage() {
  const { canWrite } = useUser();
  const params = useParams<{ family: string }>();
  const router = useRouter();
  const family = getFamily(params.family);

  const [docsByPage, setDocsByPage] = useState<Record<string, Record<string, Json>> | null>(null);
  const [dirtyPages, setDirtyPages] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!family) router.replace("/cms/site-pages");
  }, [family, router]);

  const loadDocs = useCallback(async () => {
    if (!family) return;
    setDocsByPage(null);
    const results = await Promise.all(
      family.properties.map(async (property) => {
        const response = await fetch(`/api/cms/guest-pages/${property.page}/en`);
        const json = await response.json();
        return { page: property.page, json };
      }),
    );
    const next: Record<string, Record<string, Json>> = {};
    for (const { page, json } of results) {
      if (json.status !== "success") {
        toast.error(json.message || `Could not load ${page}.`);
        continue;
      }
      next[page] = json.data.fields;
    }
    setDocsByPage(next);
    setDirtyPages({});
  }, [family]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleChange = useCallback((page: string, path: JsonPath, value: string) => {
    setDocsByPage((prev) => {
      if (!prev?.[page]) return prev;
      return { ...prev, [page]: setAtPath(prev[page], path, value) as Record<string, Json> };
    });
    setDirtyPages((prev) => ({ ...prev, [page]: true }));
  }, []);

  const handleArrayResize = useCallback((page: string, arrayKey: string, nextLength: number) => {
    setDocsByPage((prev) => {
      const doc = prev?.[page];
      if (!doc) return prev;
      const next = resizeArrayAtPath(doc, [arrayKey], nextLength);
      if (next === doc) return prev;
      return { ...prev, [page]: next as Record<string, Json> };
    });
    setDirtyPages((prev) => ({ ...prev, [page]: true }));
  }, []);

  const handleSave = async () => {
    if (!family || !docsByPage) return;
    const pagesToSave = family.properties.filter((p) => dirtyPages[p.page]);
    if (pagesToSave.length === 0) return;
    setSaving(true);
    try {
      const results = await Promise.all(
        pagesToSave.map(async (property) => {
          const response = await fetch(`/api/cms/guest-pages/${property.page}/en`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields: docsByPage[property.page] }),
          });
          const json = await response.json();
          return { page: property.page, label: property.label, json };
        }),
      );
      let failures = 0;
      setDocsByPage((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        for (const { page, json } of results) {
          if (json.status === "success") next[page] = json.data.fields;
        }
        return next;
      });
      setDirtyPages((prev) => {
        const next = { ...prev };
        for (const { page, json } of results) {
          if (json.status === "success") next[page] = false;
          else failures++;
        }
        return next;
      });
      for (const { label, json } of results) {
        if (json.status !== "success") toast.error(json.message || `Could not save ${label}.`);
      }
      if (failures === 0) {
        toast.success(
          pagesToSave.length > 1 ? `Saved ${pagesToSave.length} properties.` : "Saved.",
        );
        window.dispatchEvent(new Event(DEPLOY_STATUS_REFRESH_EVENT));
      }
    } finally {
      setSaving(false);
    }
  };

  const anyDirty = useMemo(() => Object.values(dirtyPages).some(Boolean), [dirtyPages]);

  if (!family) return null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <DocumentTitle title={`${family.shortLabel} — property facts`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/cms/site-pages"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Site pages
          </Link>
          <h1 className="font-serif text-xl tracking-tight">
            {family.shortLabel} — property facts
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every property side by side: unit numbers, WiFi, door codes, arrival links. Photos
            live in each property&apos;s own editor.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {family.properties.map((property) => (
              <span key={property.page} className="inline-flex items-center gap-1">
                <a
                  href={buildPreviewUrl(property.path, "en")}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open the live ${property.label} page`}
                  className="inline-flex items-center gap-0.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {property.label}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
                <Link
                  href={`/cms/site-pages/${property.page}`}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  photos & more
                </Link>
              </span>
            ))}
          </div>
        </div>
        {canWrite && (
          <Button size="sm" onClick={handleSave} disabled={!docsByPage || !anyDirty || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>

      {!docsByPage ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Click a cell to edit it. Tab moves across properties, Enter moves down a row. A
            &ldquo;—&rdquo; cell means that property doesn&apos;t have this field.
          </p>
          <FamilyFactsSheet
            family={family}
            docsByPage={docsByPage}
            onChange={handleChange}
            onArrayResize={handleArrayResize}
            readonly={!canWrite}
          />
        </>
      )}
    </div>
  );
}
