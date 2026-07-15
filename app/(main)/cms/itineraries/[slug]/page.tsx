"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { EntryForm } from "@/components/entry/entry-form";
import { WritingKit } from "@/components/cms/writing-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cmsConfig, SITE_URL } from "@/lib/cms-config";

const itineraryFields = cmsConfig.content.find((item) => item.name === "itineraries")!.fields;

export default function EditItineraryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const [contentObject, setContentObject] = useState<Record<string, unknown> | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const response = await fetch(`/api/cms/itineraries/${slug}`);
      const json = await response.json();
      if (json.status !== "success") {
        setNotFound(true);
        return;
      }
      setContentObject(json.data.contentObject);
    })();
  }, [slug]);

  const handleSubmit = async (values: Record<string, unknown>) => {
    // Slug changes go through the dedicated rename endpoint.
    const { slug: newSlug, ...rest } = values;
    if (newSlug && newSlug !== slug) {
      const renameResponse = await fetch(`/api/cms/itineraries/${slug}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newSlug }),
      });
      const renameJson = await renameResponse.json();
      if (renameJson.status !== "success") {
        toast.error(renameJson.message || "Could not rename itinerary.");
        return;
      }
    }

    const activeSlug = newSlug && newSlug !== slug ? newSlug : slug;
    const response = await fetch(`/api/cms/itineraries/${activeSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { ...rest, slug: activeSlug } }),
    });
    const json = await response.json();
    if (json.status !== "success") {
      toast.error(json.message || "Could not save itinerary.");
      return;
    }
    toast.success("Saved.");
    if (activeSlug !== slug) {
      router.push(`/cms/itineraries/${activeSlug}`);
    } else {
      setContentObject(json.data.contentObject);
    }
  };

  if (notFound) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-serif text-lg">Itinerary not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been renamed or deleted.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/cms/itineraries">Back to itineraries</Link>
        </Button>
      </div>
    );
  }

  const title = typeof contentObject?.title === "string" && contentObject.title
    ? contentObject.title
    : slug;
  const isPublished = contentObject?.published === true;

  return (
    <div className="space-y-4">
      <DocumentTitle title={title} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/cms/itineraries"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Itineraries
          </Link>
          {contentObject ? (
            <h1 className="mt-0.5 truncate font-serif text-xl tracking-tight">{title}</h1>
          ) : (
            <Skeleton className="mt-1.5 h-6 w-64" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {contentObject && (
            <span className={isPublished ? "studio-pill studio-pill-green" : "studio-pill studio-pill-pink"}>
              {isPublished ? "Published" : "Draft"}
            </span>
          )}
          {isPublished && (
            <Button asChild variant="outline" size="sm" className="gap-1">
              <a href={`${SITE_URL}/itineraries/${slug}`} target="_blank" rel="noopener noreferrer">
                View on site
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <Button type="submit" form="entry-form" size="sm" disabled={!contentObject}>
            Save changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {contentObject ? (
            <EntryForm fields={itineraryFields as any} contentObject={contentObject} onSubmit={handleSubmit} />
          ) : (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
        </div>
        <div className="lg:sticky lg:top-16 lg:self-start">
          <WritingKit />
        </div>
      </div>
    </div>
  );
}
