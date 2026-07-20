"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight, Languages } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * "Site pages" index — the guest pages whose text/images editors can change
 * (Plans.md Phase 2). Each card links to the per-language editor; language
 * chips show which translations exist and which are still unreviewed machine
 * translations (dot).
 */

type PageStatus = {
  page: string;
  label: string;
  description: string;
  multiLang: boolean;
  langs: { lang: string; machineTranslated: boolean; updatedAt: string }[];
};

type Language = { code: string; label: string };

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

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <DocumentTitle title="Site pages" />
      <div>
        <h1 className="font-serif text-xl tracking-tight">Site pages</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Text and photos on the guest pages of coze.care. The page layout is fixed —
          you edit the words and images, in every language.
        </p>
      </div>

      {pages ? (
        <div className="space-y-2">
          {pages.map((page) => {
            const needsReview = page.langs.filter((l) => l.machineTranslated);
            return (
              <Link
                key={page.page}
                href={`/cms/site-pages/${page.page}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{page.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {page.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {page.multiLang ? (
                      page.langs
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
                        ))
                    ) : (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        same in every language
                      </Badge>
                    )}
                    {needsReview.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                        <Languages className="h-3 w-3" />
                        {needsReview.length} translation{needsReview.length > 1 ? "s" : ""} to review
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
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
