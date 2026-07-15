"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { EntryForm } from "@/components/entry/entry-form";
import { WritingKit } from "@/components/cms/writing-kit";
import { Button } from "@/components/ui/button";
import { cmsConfig } from "@/lib/cms-config";

const itineraryFields = cmsConfig.content.find((item) => item.name === "itineraries")!.fields;

export default function NewItineraryPage() {
  const router = useRouter();

  const handleSubmit = async (values: Record<string, unknown>) => {
    const response = await fetch("/api/cms/itineraries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: values }),
    });
    const json = await response.json();
    if (json.status !== "success") {
      toast.error(json.message || "Could not create itinerary.");
      return;
    }
    toast.success("Itinerary created.");
    router.push(`/cms/itineraries/${json.data.slug}`);
  };

  return (
    <div className="space-y-4">
      <DocumentTitle title="New itinerary" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/cms/itineraries"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Itineraries
          </Link>
          <h1 className="mt-0.5 font-serif text-xl tracking-tight">New itinerary</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Type the URL slug early — photo uploads need it.
          </p>
        </div>
        <Button type="submit" form="entry-form" size="sm">
          Create itinerary
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <EntryForm fields={itineraryFields as any} onSubmit={handleSubmit} />
        </div>
        <div className="lg:sticky lg:top-16 lg:self-start">
          <WritingKit />
        </div>
      </div>
    </div>
  );
}
