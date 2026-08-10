"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight, Languages, Zap } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_FAMILIES } from "@/lib/page-families";
import { QUICK_TOPICS } from "@/lib/quick-fields";

/**
 * "Site pages" index — grouped by property family so the shared manual and
 * its per-property facts read as one building, with the frequently-changed
 * fields promoted into a "Quick updates" shortcut at the top. Language chips
 * show which translations exist and which are still unreviewed machine
 * translations (dot).
 */

type PageStatus = {
  page: string;
  label: string;
  description: string;
  multiLang: boolean;
  group: string;
  role: string;
  langs: { lang: string; machineTranslated: boolean; updatedAt: string }[];
};

type Language = { code: string; label: string };

function LanguageChips({
  page,
  languages,
}: {
  page: PageStatus;
  languages: Language[];
}) {
  if (!page.multiLang) {
    return (
      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
        same in every language
      </Badge>
    );
  }
  const needsReview = page.langs.filter((l) => l.machineTranslated);
  return (
    <>
      {page.langs
        .slice()
        .sort(
          (a, b) =>
            languages.findIndex((l) => l.code === a.lang) -
            languages.findIndex((l) => l.code === b.lang),
        )
        .map((l) => (
          <Badge
            key={l.lang}
            variant="secondary"
            className="gap-1 px-1.5 py-0 text-[10px] uppercase"
          >
            {l.lang}
            {l.machineTranslated && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-amber-500"
                title="Machine translated — needs review"
              />
            )}
          </Badge>
        ))}
      {needsReview.length > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
          <Languages className="h-3 w-3" />
          {needsReview.length} to review
        </span>
      )}
    </>
  );
}

function PageCard({
  page,
  languages,
  compact = false,
}: {
  page: PageStatus;
  languages: Language[];
  compact?: boolean;
}) {
  return (
    <Link
      href={`/cms/site-pages/${page.page}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{page.label}</p>
        {!compact && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{page.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <LanguageChips page={page} languages={languages} />
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default function SitePagesPage() {
  const [pages, setPages] = useState<PageStatus[] | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/cms/guest-pages");
      const json = await response.json();
      if (json.status !== "success") {
        toast.error(json.message || "Could not load site pages.");
        return;
      }
      setPages(json.data.pages);
      setLanguages(json.data.languages);
    })();
  }, []);

  const byPage = (id: string) => pages?.find((p) => p.page === id);
  const experiences = pages?.filter((p) => p.group === "experiences") ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DocumentTitle title="Site pages" />
      <div>
        <h1 className="font-serif text-xl tracking-tight">Site pages</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Text and photos on the guest pages of coze.care. The page layout is fixed — you edit
          the words and images, in every language.
        </p>
      </div>

      {pages ? (
        <>
          {/* Quick updates shortcut */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-medium">Quick updates</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Jump straight to the things that change often — no hunting through the full page.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {QUICK_TOPICS.map((topic) => (
                <Link
                  key={topic.id}
                  href={`/cms/site-pages/quick?topic=${topic.id}`}
                  className="rounded-full border border-border bg-card px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {topic.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Property families */}
          {PAGE_FAMILIES.map((family) => {
            const manual = byPage(family.manualPage);
            return (
              <div key={family.id} className="space-y-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {family.label}
                </h2>
                {manual && <PageCard page={manual} languages={languages} />}
                <Link
                  href={`/cms/site-pages/facts/${family.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">Property facts — edit side by side</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      WiFi, door codes, unit numbers &amp; arrival links for{" "}
                      {family.properties.map((p) => p.label).join(", ")} in one sheet.
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
                <div className="grid gap-2 sm:grid-cols-2">
                  {family.properties.map((property) => {
                    const page = byPage(property.page);
                    if (!page) return null;
                    return (
                      <Link
                        key={property.page}
                        href={`/cms/site-pages/${property.page}`}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/40"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {property.label} facts
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Experiences */}
          {experiences.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Experiences
              </h2>
              {experiences.map((page) => (
                <PageCard key={page.page} page={page} languages={languages} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </div>
  );
}
