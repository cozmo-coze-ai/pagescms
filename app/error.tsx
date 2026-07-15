"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Branded error page — wears the studio identity via the `.studio` class so
// it looks like cms.coze.care even outside the CMS shell.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="studio flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="font-serif text-sm tracking-tight text-muted-foreground">
        cms<span className="text-primary">.coze.care</span>
      </p>
      <p className="mt-6 font-serif text-5xl leading-none" aria-hidden>
        ⚠︎
      </p>
      <h1 className="mt-4 font-serif text-xl tracking-tight">
        Something went wrong
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Nothing was lost — your content is safe. Try again, and if it keeps
        happening let the team know.
      </p>
      {error.message && (
        <code className="mx-auto mt-4 max-w-md break-words rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          {error.message}
        </code>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </Button>
        <Link href="/cms" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to the studio
        </Link>
      </div>
    </div>
  );
}
