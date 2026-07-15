"use client";

import { useState } from "react";
import { mediaPublicUrl } from "@/lib/media-path";
import { cn } from "@/lib/utils";
import { Ban, ImageOff } from "lucide-react";

// Renders a media path (`<slug>/<file>` bucket key or input-space path) as
// its public Supabase Storage URL — no async resolution step needed anymore
// (the bucket is public-read). `name` (the old media-config name) is kept in
// the signature so callers don't churn, but is unused.
export function Thumbnail({
  name,
  path,
  className
}: {
  name?: string,
  path: string | null;
  className?: string;
}) {
  void name;
  const [failed, setFailed] = useState<string | null>(null);
  const url = path ? mediaPublicUrl(path) : null;

  return (
    <div
      className={cn(
        "bg-muted w-full aspect-square overflow-hidden relative",
        className
      )}
    >
      {url
        ? failed === url
          ? <div className="flex justify-center items-center absolute inset-0 text-muted-foreground" title="Could not load image">
              <Ban className="h-4 w-4"/>
            </div>
          : <img
              src={url}
              alt={path?.split("/").pop() || "thumbnail"}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setFailed(url)}
            />
        : <div className="flex justify-center items-center absolute inset-0 text-muted-foreground" title="No image">
            <ImageOff className="h-4 w-4"/>
          </div>
      }
    </div>
  );
};
