import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Branded 404 — wears the studio identity via the `.studio` class so it
// looks like cms.coze.care even outside the CMS shell.
export default function NotFound() {
  return (
    <div className="studio flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="font-serif text-sm tracking-tight text-muted-foreground">
        cms<span className="text-primary">.coze.care</span>
      </p>
      <p className="mt-6 font-serif text-[88px] font-semibold leading-none tracking-tight text-primary/90">
        404
      </p>
      <h1 className="mt-4 font-serif text-xl tracking-tight">
        This page wandered off the itinerary
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        It may have been moved, renamed or unpublished. Let&apos;s get you back
        somewhere familiar.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link href="/cms" className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to the studio
        </Link>
        <a
          href="https://www.coze.care"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <Compass className="h-3.5 w-3.5" />
          Visit coze.care
        </a>
      </div>
    </div>
  );
}
