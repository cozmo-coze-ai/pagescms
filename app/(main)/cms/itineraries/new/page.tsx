"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DocumentTitle } from "@/components/document-title";
import { ItineraryEditor } from "@/components/cms/itinerary-editor";

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
    <>
      <DocumentTitle title="New itinerary" />
      <ItineraryEditor
        onSubmit={handleSubmit}
        saveLabel="Create itinerary"
        hint="Type the URL slug early — photo uploads need it."
      />
    </>
  );
}
