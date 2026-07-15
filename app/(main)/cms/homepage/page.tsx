"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EntryForm } from "@/components/entry/entry-form";
import { Button } from "@/components/ui/button";
import { cmsConfig } from "@/lib/cms-config";

const homepageFields = cmsConfig.content.find((item) => item.name === "homepage")!.fields;

export default function HomepagePage() {
  const [contentObject, setContentObject] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/cms/homepage");
      const json = await response.json();
      if (json.status !== "success") {
        toast.error(json.message || "Could not load homepage content.");
        return;
      }
      setContentObject(json.data.contentObject);
    })();
  }, []);

  const handleSubmit = async (values: Record<string, unknown>) => {
    const response = await fetch("/api/cms/homepage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: values }),
    });
    const json = await response.json();
    if (json.status !== "success") {
      toast.error(json.message || "Could not save homepage content.");
      return;
    }
    toast.success("Homepage saved.");
    setContentObject(json.data.contentObject);
  };

  if (!contentObject) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium tracking-tight">Homepage</h1>
      <EntryForm fields={homepageFields as any} contentObject={contentObject} onSubmit={handleSubmit} />
      <Button type="submit" form="entry-form">
        Save
      </Button>
    </div>
  );
}
