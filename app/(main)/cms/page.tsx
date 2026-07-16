"use client";

// The studio dashboard: what's live, what's in progress, what to do next.
// Ghost/WordPress-style "at a glance" — stat cards up top, a recently-edited
// work queue as the main column, quick actions and drafts on the side.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpRight,
  FileText,
  ImageOff,
  Pencil,
  Plus,
  UserPlus,
  Zap,
} from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { mediaPublicUrl } from "@/lib/media-path";
import { SITE_URL } from "@/lib/cms-config";
import { useUser } from "@/contexts/user-context";
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

const todayLabel = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

const formatUpdated = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const Cover = ({ item }: { item: ItinerarySummary }) =>
  item.coverPath ? (
    <img
      src={mediaPublicUrl(item.coverPath)}
      alt=""
      loading="lazy"
      className={cn(
        "h-full w-full object-cover",
        !item.published && "opacity-80 saturate-50",
      )}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground">
      <ImageOff className="h-4 w-4" />
    </div>
  );

const StatCard = ({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) => (
  <Link
    href={href}
    className="studio-lift rounded-xl border border-border bg-card px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 font-serif text-2xl leading-none tracking-tight">{value}</p>
  </Link>
);

const ContentRow = ({ item }: { item: ItinerarySummary }) => (
  <Link
    href={`/cms/itineraries/${item.slug}`}
    className="group flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:bg-accent/40"
  >
    <div className="h-9 w-12 shrink-0 overflow-hidden rounded border border-border">
      <Cover item={item} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] font-medium leading-tight">{item.title}</p>
      <p className="truncate text-[11px] text-muted-foreground">
        {item.category === "experience" ? "Experience" : "Tour"} · updated {formatUpdated(item.updatedAt)}
      </p>
    </div>
    {item.published ? (
      <span className="studio-pill studio-pill-green">Published</span>
    ) : (
      <span className="studio-pill studio-pill-pink">Draft</span>
    )}
  </Link>
);

const QuickAction = ({
  href,
  external,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  external?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) => {
  const className =
    "group flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const body = (
    <>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors group-hover:text-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-tight">{title}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">
          {description}
        </span>
      </span>
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
};

const SectionHeader = ({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
}) => (
  <header className="flex items-center justify-between gap-2 px-3 pt-3">
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]">{title}</h2>
    </div>
    {action}
  </header>
);

export default function CmsDashboardPage() {
  const { user } = useUser();
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

  const stats = useMemo(() => {
    if (!items) return null;
    const published = items.filter((item) => item.published);
    return {
      published: published.length,
      drafts: items.length - published.length,
      tours: published.filter((item) => item.category === "tour").length,
      experiences: published.filter((item) => item.category === "experience").length,
      recent: items.slice(0, 8),
      draftItems: items.filter((item) => !item.published).slice(0, 5),
    };
  }, [items]);

  return (
    <div className="space-y-5">
      <DocumentTitle title="Dashboard" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl tracking-tight">
            {greeting()}
            {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{todayLabel()}</p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/cms/itineraries/new">
            <Plus className="h-4 w-4" />
            New itinerary
          </Link>
        </Button>
      </div>

      {stats === null ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[70px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 rounded-xl lg:col-span-2" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : items && items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
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
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Published" value={stats.published} href="/cms/itineraries" />
            <StatCard label="Drafts" value={stats.drafts} href="/cms/itineraries" />
            <StatCard label="Tours" value={stats.tours} href="/cms/itineraries" />
            <StatCard label="Experiences" value={stats.experiences} href="/cms/itineraries" />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border bg-card lg:col-span-2">
              <SectionHeader
                icon={FileText}
                title="Recently edited"
                action={
                  <Link
                    href="/cms/itineraries"
                    className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View all
                  </Link>
                }
              />
              <div className="mt-1.5 divide-y divide-border border-t border-border">
                {stats.recent.map((item) => (
                  <ContentRow key={item.slug} item={item} />
                ))}
              </div>
            </section>

            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-card pb-2">
                <SectionHeader icon={Zap} title="Quick actions" />
                <div className="mt-1.5 space-y-0.5 border-t border-border px-1 pt-1.5">
                  <QuickAction
                    href="/cms/homepage"
                    icon={Pencil}
                    title="Edit homepage"
                    description="Hero, featured itineraries and site copy"
                  />
                  {user?.isAdmin && (
                    <QuickAction
                      href="/cms/settings"
                      icon={UserPlus}
                      title="Invite a collaborator"
                      description="Send an invite link from Settings"
                    />
                  )}
                  <QuickAction
                    href={SITE_URL}
                    external
                    icon={ArrowUpRight}
                    title="View live site"
                    description="Open coze.care in a new tab"
                  />
                </div>
              </section>

              {stats.draftItems.length > 0 && (
                <section className="rounded-xl border border-border bg-card pb-1">
                  <SectionHeader
                    icon={Pencil}
                    title={`Drafts · ${stats.drafts}`}
                  />
                  <div className="mt-1.5 divide-y divide-border border-t border-border">
                    {stats.draftItems.map((item) => (
                      <Link
                        key={item.slug}
                        href={`/cms/itineraries/${item.slug}`}
                        className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:bg-accent/40"
                      >
                        <div className="h-8 w-10 shrink-0 overflow-hidden rounded border border-border">
                          <Cover item={item} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium leading-tight">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatUpdated(item.updatedAt)}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
