"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EntryForm } from "@/components/entry/entry-form";
import { Button } from "@/components/ui/button";
import { cmsConfig } from "@/lib/cms-config";

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
    toast.success("Itinerary saved.");
    if (activeSlug !== slug) {
      router.push(`/cms/itineraries/${activeSlug}`);
    } else {
      setContentObject(json.data.contentObject);
    }
  };

  if (notFound) return <p className="text-sm text-muted-foreground">Itinerary not found.</p>;
  if (!contentObject) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium tracking-tight">Edit itinerary</h1>
      <EntryForm fields={itineraryFields as any} contentObject={contentObject} onSubmit={handleSubmit} />
      <Button type="submit" form="entry-form">
        Save
      </Button>
    </div>
  );
}
