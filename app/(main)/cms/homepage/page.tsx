"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight } from "lucide-react";
import { DocumentTitle } from "@/components/document-title";
import { DEPLOY_STATUS_REFRESH_EVENT } from "@/components/cms/deploy-status";
import { EntryForm } from "@/components/entry/entry-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/contexts/user-context";
import { cmsConfig, SITE_URL } from "@/lib/cms-config";

const homepageFields = cmsConfig.content.find((item) => item.name === "homepage")!.fields;

export default function HomepagePage() {
  const { canWrite } = useUser();
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
    toast.success("Saved.");
    setContentObject(json.data.contentObject);
    window.dispatchEvent(new Event(DEPLOY_STATUS_REFRESH_EVENT));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <DocumentTitle title="Homepage" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl tracking-tight">Homepage</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The title and description guests see first on coze.care.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a href={SITE_URL} target="_blank" rel="noopener noreferrer">
              View site
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
          {canWrite && (
            <Button type="submit" form="entry-form" size="sm" disabled={!contentObject}>
              Save changes
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        {contentObject ? (
          <EntryForm fields={homepageFields as any} contentObject={contentObject} onSubmit={handleSubmit} readonly={!canWrite} />
        ) : (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
