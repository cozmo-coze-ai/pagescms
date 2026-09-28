"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_FAMILIES } from "@/lib/page-families";

/**
 * "Website pages" index — deliberately plain: two choices per building (the
 * guest manual, and property details) plus the standalone experience pages.
 * No insider language, no overlapping entry points.
 */

type PageStatus = { page: string; label: string; description: string; group: string };
type Language = { code: string; label: string };

function BigCard({
  href,
  title,
  subtitle,
}: {
  href: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default function SitePagesPage() {
  const [pages, setPages] = useState<PageStatus[] | null>(null);
  const [, setLanguages] = useState<Language[]>([]);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/cms/guest-pages");
      const json = await response.json();
      if (json.status !== "success") {
        toast.error(json.message || "Could not load pages.");
        return;
      }
      setPages(json.data.pages);
      setLanguages(json.data.languages);
    })();
  }, []);

  const experiences = pages?.filter((p) => p.group === "experiences") ?? [];
  const units = (family: (typeof PAGE_FAMILIES)[number]) =>
    family.manualProperties.map((p) => p.label).join(", ");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DocumentTitle title="Choose what to change" />
      <div>
        <h1 className="font-serif text-xl tracking-tight">Choose what to change</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Choose a building, then choose manual text or property details.
        </p>
      </div>

      {pages ? (
        <>
          {PAGE_FAMILIES.map((family) => (
            <div key={family.id} className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {family.shortLabel} — {units(family)}
              </h2>
              <BigCard
                href={`/cms/site-pages/building/${family.id}`}
                title="Manual & translations"
                subtitle="Directions, check-in, house rules and concierge in every language."
              />
              <BigCard
                href={`/cms/site-pages/facts/${family.id}`}
                title="Property details"
                subtitle="WiFi, door codes, parking and photos for each unit."
              />
            </div>
          ))}

          {experiences.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Other pages
              </h2>
              {experiences.map((page) => (
                <BigCard
                  key={page.page}
                  href={`/cms/site-pages/${page.page}`}
                  title={page.label}
                  subtitle="Prices, photos and details."
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
    </div>
  );
}
