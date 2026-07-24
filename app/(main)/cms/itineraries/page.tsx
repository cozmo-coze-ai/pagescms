"use client";

// The collection wall: every itinerary as its cover photo, in the public
// site's own card language (frosted status pills, hover lift). The most
// recently updated piece sits featured at 2x2 — recency is real signal
// (it's what the team is working on). Toggle to a compact list for
// fast scanning; search filters both.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpRight,
  ImageOff,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Rows3,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DocumentTitle } from "@/components/document-title";
import { useUser } from "@/contexts/user-context";
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

type ViewMode = "wall" | "list";
type StatusFilter = "all" | "published" | "draft";

// Same mapping as the site's "curator tag palette".
const pillClass = (color: string | null) => {
  switch (color) {
    case "gray": return "studio-pill-gray";
    case "brown":
    case "pink": return "studio-pill-pink";
    case "green": return "studio-pill-green";
    case "blue": return "studio-pill-blue";
    case "purple": return "studio-pill-purple";
    default: return ""; // red / yellow / orange / default -> gold
  }
};

const formatUpdated = (iso: string) => {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const Cover = ({ item, className }: { item: ItinerarySummary; className?: string }) => (
  item.coverPath ? (
    <img
      src={mediaPublicUrl(item.coverPath)}
      alt=""
      loading="lazy"
      className={cn(
        "h-full w-full object-cover",
        !item.published && "opacity-80 saturate-50",
        className,
      )}
    />
  ) : (
    <div className={cn("flex h-full w-full items-center justify-center bg-secondary text-muted-foreground", className)}>
      <ImageOff className="h-5 w-5" />
    </div>
  )
);

const CardMenu = ({
  item,
  onDelete,
  className,
}: {
  item: ItinerarySummary;
  onDelete: () => void;
  className?: string;
}) => {
  const { canWrite } = useUser();
  return (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn("bg-card/90 text-muted-foreground backdrop-blur-sm hover:text-foreground", className)}
        aria-label={`Options for ${item.title}`}
      >
        <MoreHorizontal />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem asChild>
        <Link href={`/cms/itineraries/${item.slug}`}>{canWrite ? "Edit" : "Open"}</Link>
      </DropdownMenuItem>
      {item.published && (
        <DropdownMenuItem asChild>
          <a href={`${SITE_URL}/itineraries/${item.slug}`} target="_blank" rel="noopener noreferrer">
            View on site
            <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
          </a>
        </DropdownMenuItem>
      )}
      {canWrite && (
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          Delete
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
  );
};

export default function ItinerariesListPage() {
  const { canWrite } = useUser();
  const [items, setItems] = useState<ItinerarySummary[] | null>(null);
  const [view, setView] = useState<ViewMode>("wall");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<ItinerarySummary | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("cms-itineraries-view");
    if (saved === "list" || saved === "wall") setView(saved);
  }, []);

  const changeView = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem("cms-itineraries-view", next);
  };

  const load = async () => {
    const response = await fetch("/api/cms/itineraries");
    const json = await response.json();
    if (json.status !== "success") {
      toast.error(json.message || "Could not load itineraries.");
      return;
    }
    setItems(json.data);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (status === "published" && !item.published) return false;
      if (status === "draft" && item.published) return false;
      if (!q) return true;
      return [item.title, item.slug, item.tag ?? "", item.category]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [items, query, status]);

  const publishedCount = items?.filter((item) => item.published).length ?? 0;
  const draftCount = (items?.length ?? 0) - publishedCount;

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const { slug, title } = pendingDelete;
    setPendingDelete(null);
    const response = await fetch(`/api/cms/itineraries/${slug}`, { method: "DELETE" });
    const json = await response.json();
    if (json.status !== "success") {
      toast.error(json.message || "Could not delete itinerary.");
      return;
    }
    toast.success(`Deleted "${title}".`);
    load();
  };

  // Featured 2x2 slot only when the wall shows the full, unfiltered set.
  const showFeatured = view === "wall" && !query.trim() && status === "all";

  return (
    <div className="space-y-4">
      <DocumentTitle title="Itineraries" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-xl tracking-tight">Itineraries</h1>
          {items && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "piece" : "pieces"} · {publishedCount} published
              {draftCount > 0 && <> · {draftCount} {draftCount === 1 ? "draft" : "drafts"}</>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(
              [
                { value: "all", label: "All" },
                { value: "published", label: "Published" },
                { value: "draft", label: "Drafts" },
              ] as const
            ).map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={status === option.value ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setStatus(option.value)}
                aria-pressed={status === option.value}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search itineraries"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 w-40 pl-8 text-sm sm:w-48"
            />
          </div>
          <div className="flex rounded-md border border-border p-0.5">
            <Button
              type="button"
              variant={view === "wall" ? "secondary" : "ghost"}
              size="icon-xs"
              onClick={() => changeView("wall")}
              aria-label="Wall view"
              aria-pressed={view === "wall"}
            >
              <LayoutGrid />
            </Button>
            <Button
              type="button"
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon-xs"
              onClick={() => changeView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
            >
              <Rows3 />
            </Button>
          </div>
          {canWrite && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/cms/itineraries/new">
                <Plus className="h-4 w-4" />
                New itinerary
              </Link>
            </Button>
          )}
        </div>
      </div>

      {filtered === null ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <Skeleton className="col-span-2 row-span-2 rounded-lg" />
          {Array.from({ length: 10 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[4/3] rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          {query.trim() ? (
            <p className="text-sm text-muted-foreground">No itineraries match “{query.trim()}”.</p>
          ) : status !== "all" ? (
            <p className="text-sm text-muted-foreground">
              No {status === "draft" ? "drafts" : "published itineraries"} right now.
            </p>
          ) : (
            <>
              <p className="font-serif text-lg">Start the collection</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Every itinerary begins as a draft. Create the first one, or copy a
                Writing kit prompt from the editor to draft it with ChatGPT.
              </p>
              <Button asChild className="mt-4 gap-1.5">
                <Link href="/cms/itineraries/new">
                  <Plus className="h-4 w-4" />
                  New itinerary
                </Link>
              </Button>
            </>
          )}
        </div>
      ) : view === "wall" ? (
        <div className="grid grid-cols-3 gap-2 [grid-auto-flow:dense] sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((item, index) => {
            const featured = showFeatured && index === 0;
            return (
              <div
                key={item.slug}
                className={cn(
                  "studio-lift studio-rise group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card",
                  featured && "col-span-2 row-span-2",
                )}
                style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
              >
                <Link
                  href={`/cms/itineraries/${item.slug}`}
                  className="absolute inset-0 z-[1] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Edit ${item.title}`}
                />
                <div className={cn("relative", featured ? "min-h-0 flex-1" : "aspect-[4/3]")}>
                  <div className="absolute inset-0">
                    <Cover item={item} />
                  </div>
                  <div className="absolute left-1.5 top-1.5 flex gap-1">
                    {item.tag && (
                      <span className={cn("studio-pill", pillClass(item.tagColor))}>{item.tag}</span>
                    )}
                  </div>
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                    {!item.published && (
                      <span className="studio-pill studio-pill-pink">Draft</span>
                    )}
                    <span className="z-[2] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <CardMenu item={item} onDelete={() => setPendingDelete(item)} />
                    </span>
                  </div>
                </div>
                <div className={cn("px-2 pb-2 pt-1.5", featured && "px-3 pb-2.5 pt-2")}>
                  <h2
                    className={cn(
                      "font-medium leading-snug",
                      featured ? "font-serif text-base" : "line-clamp-1 text-xs",
                    )}
                  >
                    {item.title}
                  </h2>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.category === "experience" ? "Experience" : "Tour"} · {formatUpdated(item.updatedAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {filtered.map((item) => (
            <div key={item.slug} className="group relative flex items-center gap-2.5 px-2.5 py-1.5">
              <Link
                href={`/cms/itineraries/${item.slug}`}
                className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:bg-accent/40"
                aria-label={`Edit ${item.title}`}
              />
              <div className="h-8 w-11 shrink-0 overflow-hidden rounded border border-border">
                <Cover item={item} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-tight">{item.title}</p>
                <p className="truncate font-mono text-[11px] leading-tight text-muted-foreground">{item.slug}</p>
              </div>
              {item.tag && (
                <span className={cn("studio-pill hidden sm:inline-flex", pillClass(item.tagColor))}>
                  {item.tag}
                </span>
              )}
              {!item.published && <span className="studio-pill studio-pill-pink">Draft</span>}
              <span className="hidden w-16 text-right text-[11px] text-muted-foreground md:block">
                {formatUpdated(item.updatedAt)}
              </span>
              <span className="z-[2]">
                <CardMenu item={item} onDelete={() => setPendingDelete(item)} />
              </span>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the itinerary from the site and cannot be undone. Its
              photos stay in storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
