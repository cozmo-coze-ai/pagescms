"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DocumentTitle } from "@/components/document-title";
import { ItineraryEditor } from "@/components/cms/itinerary-editor";
import { Button } from "@/components/ui/button";
import { SITE_URL } from "@/lib/cms-config";

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
    toast.success(
      values.published === true
        ? "Saved."
        : "Draft saved — not visible on the website.",
    );
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
    <>
      <DocumentTitle title={title} />
      <ItineraryEditor
        loading={!contentObject}
        contentObject={contentObject ?? undefined}
        onSubmit={handleSubmit}
        saveLabel="Save changes"
        statusPill={
          contentObject ? (
            <span className={isPublished ? "studio-pill studio-pill-green" : "studio-pill studio-pill-pink"}>
              {isPublished ? "Published" : "Draft"}
            </span>
          ) : null
        }
        viewUrl={isPublished ? `${SITE_URL}/itineraries/${slug}` : undefined}
      />
    </>
  );
}
