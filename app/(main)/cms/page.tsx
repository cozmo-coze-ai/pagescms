"use client";

// The studio home: what to pick up next. Horizontal shelves of cover
// photos — recently edited first, then the collection by category, drafts
// last — plus one-tap actions. Same card language as the wall.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, ImageOff, Pencil, Plus } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mediaPublicUrl } from "@/lib/media-path";
import { SITE_URL } from "@/lib/cms-config";
import { cn } from "@/lib/utils";

type ItinerarySummary = {
  slug: string;
  title: string;
  category: string;
  tag: string | null;
  tagColor: string | null;
  coverPath: string | null;
  published: boolean;
  updatedAt: string;
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const formatUpdated = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const ShelfCard = ({ item }: { item: ItinerarySummary }) => (
  <Link
    href={`/cms/itineraries/${item.slug}`}
    className="studio-lift group w-36 shrink-0 snap-start overflow-hidden rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <div className="relative aspect-[4/3]">
      {item.coverPath ? (
        <img
          src={mediaPublicUrl(item.coverPath)}
          alt=""
          loading="lazy"
          className={cn("h-full w-full object-cover", !item.published && "opacity-80 saturate-50")}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground">
          <ImageOff className="h-4 w-4" />
        </div>
      )}
      {!item.published && (
        <span className="studio-pill studio-pill-pink absolute left-1.5 top-1.5">Draft</span>
      )}
    </div>
    <div className="px-2 pb-1.5 pt-1">
      <p className="truncate text-xs font-medium leading-tight">{item.title}</p>
      <p className="text-[10px] text-muted-foreground">{formatUpdated(item.updatedAt)}</p>
    </div>
  </Link>
);

const Shelf = ({ title, items }: { title: string; items: ItinerarySummary[] }) => {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <h2 className="font-serif text-sm tracking-tight">{title}</h2>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1.5">
        {items.map((item) => (
          <ShelfCard key={item.slug} item={item} />
        ))}
      </div>
    </section>
  );
};

export default function CmsHomePage() {
  const [items, setItems] = useState<ItinerarySummary[] | null>(null);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/cms/itineraries");
      const json = await response.json();
      if (json.status !== "success") {
        toast.error(json.message || "Could not load itineraries.");
        setItems([]);
        return;
      }
      setItems(json.data);
    })();
  }, []);

  const shelves = useMemo(() => {
    if (!items) return null;
    return {
      recent: items.slice(0, 12),
      tours: items.filter((item) => item.published && item.category === "tour"),
      experiences: items.filter((item) => item.published && item.category === "experience"),
      drafts: items.filter((item) => !item.published),
    };
  }, [items]);

  return (
    <div className="space-y-6">
      <DocumentTitle title="Home" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl tracking-tight">{greeting()}</h1>
          {items && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {items.length} itineraries · {items.filter((item) => item.published).length} live on coze.care
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/cms/itineraries/new">
              <Plus className="h-4 w-4" />
              New itinerary
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/cms/homepage">
              <Pencil className="h-3.5 w-3.5" />
              Edit homepage
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
              View site
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      {shelves === null ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, section) => (
            <div key={section} className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <div className="flex gap-2 overflow-hidden">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="aspect-[4/3] w-36 shrink-0 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : items && items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <p className="font-serif text-lg">Start the collection</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Create the first itinerary — the Writing kit in the editor can draft it with ChatGPT.
          </p>
          <Button asChild size="sm" className="mt-4 gap-1.5">
            <Link href="/cms/itineraries/new">
              <Plus className="h-4 w-4" />
              New itinerary
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <Shelf title="Drafts" items={shelves!.drafts} />
          <Shelf title="Recently edited" items={shelves!.recent} />
          <Shelf title="Tours" items={shelves!.tours} />
          <Shelf title="Experiences" items={shelves!.experiences} />
        </div>
      )}
    </div>
  );
}
