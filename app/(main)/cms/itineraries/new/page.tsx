"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EntryForm } from "@/components/entry/entry-form";
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
      <h1 className="text-lg font-medium tracking-tight">New itinerary</h1>
      <EntryForm fields={itineraryFields as any} onSubmit={handleSubmit} />
      <Button type="submit" form="entry-form">
        Create
      </Button>
    </div>
  );
}
