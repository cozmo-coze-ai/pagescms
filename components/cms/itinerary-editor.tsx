"use client";

// Shared editor shell for creating and editing itineraries. Lays the
// EntryForm out like a document editor: naked serif title + borderless body
// canvas on the left, a sticky "Page settings" rail and the Writing kit on
// the right, and a sticky action bar with dirty state, ⌘S save and a
// leave-page guard. The zone classes (.editor-title, .editor-doc,
// .editor-settings) are styled in app/globals.css.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Loader2, Settings2 } from "lucide-react";
import { EntryForm } from "@/components/entry/entry-form";
import { WritingKit } from "@/components/cms/writing-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cmsConfig } from "@/lib/cms-config";
import { Field } from "@/types/field";

const itineraryFields = cmsConfig.content.find((item) => item.name === "itineraries")!
  .fields as Field[];

const GRID = "grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]";
const CANVAS = "min-w-0 lg:mx-auto lg:w-full lg:max-w-3xl";

export function ItineraryEditor({
  contentObject,
  loading = false,
  onSubmit,
  saveLabel,
  statusPill,
  viewUrl,
  hint,
}: {
  contentObject?: Record<string, unknown>;
  loading?: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void;
  saveLabel: string;
  statusPill?: React.ReactNode;
  viewUrl?: string;
  hint?: string;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await onSubmit(values);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  // ⌘S / Ctrl+S saves instead of opening the browser's save dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (isSavingRef.current) return;
        (document.getElementById("entry-form") as HTMLFormElement | null)?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  return (
    <div>
      <div className="sticky top-11 z-30 -mx-4 -mt-4 mb-6 border-b border-border/70 bg-background/85 backdrop-blur-md md:-mx-6 md:-mt-6">
        <div className="flex h-12 items-center gap-3 px-4 md:px-6">
          <Link
            href="/cms/itineraries"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Itineraries
          </Link>
          {statusPill}
          <div className="ml-auto flex items-center gap-2.5">
            {isSaving ? (
              <span className="hidden text-xs text-muted-foreground sm:block">Saving…</span>
            ) : isDirty ? (
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--studio-clay)]" />
                Unsaved changes
              </span>
            ) : hint ? (
              <span className="hidden text-xs text-muted-foreground sm:block">{hint}</span>
            ) : contentObject ? (
              <span className="hidden text-xs text-muted-foreground sm:block">Saved</span>
            ) : null}
            {viewUrl && (
              <Button asChild variant="outline" size="sm" className="gap-1">
                <a href={viewUrl} target="_blank" rel="noopener noreferrer">
                  View on site
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button
              type="submit"
              form="entry-form"
              size="sm"
              disabled={loading || isSaving}
              className="gap-1.5"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saveLabel}
              <kbd className="hidden rounded bg-primary-foreground/20 px-1 font-sans text-[10px] font-medium sm:inline-block">
                ⌘S
              </kbd>
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <EditorSkeleton />
      ) : (
        <EntryForm
          fields={itineraryFields}
          contentObject={contentObject}
          onSubmit={handleSubmit}
          onDirtyChange={setIsDirty}
          layout={(f) => (
            <div className={GRID}>
              {/* On mobile the settings rail stacks above the document. */}
              <aside className="order-1 min-w-0 space-y-5 lg:order-none lg:sticky lg:top-[6.75rem] lg:max-h-[calc(100dvh-7.75rem)] lg:self-start lg:overflow-y-auto lg:pb-4 lg:col-start-2 lg:row-start-1">
                <section className="editor-settings space-y-4 rounded-xl border border-border bg-card p-4">
                  <header className="flex items-center gap-1.5 text-muted-foreground">
                    <Settings2 className="h-3.5 w-3.5" />
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]">
                      Page settings
                    </h2>
                  </header>
                  <div className="editor-field-published">{f.published}</div>
                  <div className="h-px bg-border" />
                  <div className="editor-field-slug">{f.slug}</div>
                  {f.category}
                  <div className="grid grid-cols-2 gap-3">
                    {f.tag}
                    {f.tagColor}
                  </div>
                  {f.cover}
                </section>
                <div className="hidden lg:block">
                  <WritingKit />
                </div>
              </aside>
              <div className={`${CANVAS} order-2 lg:order-none lg:col-start-1 lg:row-start-1`}>
                <div className="rounded-xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-8">
                  <div className="editor-title">{f.title}</div>
                  <div className="editor-doc mt-4">{f.body}</div>
                </div>
              </div>
              <div className="order-3 min-w-0 lg:hidden">
                <WritingKit />
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}

const EditorSkeleton = () => (
  <div className={GRID}>
    <div className="order-1 space-y-5 lg:order-none lg:col-start-2 lg:row-start-1">
      <Skeleton className="h-80 w-full rounded-xl" />
      <Skeleton className="hidden h-40 w-full rounded-xl lg:block" />
    </div>
    <div className={`${CANVAS} order-2 lg:order-none lg:col-start-1 lg:row-start-1`}>
      <div className="space-y-6 rounded-xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-8">
        <Skeleton className="h-10 w-2/3" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  </div>
);
