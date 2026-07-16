"use client";

// Live view of the coze.care publish pipeline, driven by
// /api/cms/deploy-status (the cms_deploy_trigger timestamps):
//
//   queued    a save is waiting out the debounce for its build to fire
//   building  the deploy hook fired; Vercel is rebuilding the site
//             (no build API — progress is estimated against ~3 min)
//   idle      everything published
//
// Polls every 15s; anything that saves content can dispatch
// DEPLOY_STATUS_REFRESH_EVENT to update it instantly. Two variants:
// "card" (dashboard box) and "compact" (editor toolbar strip).

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export const DEPLOY_STATUS_REFRESH_EVENT = "cms:deploy-status-refresh";

const BUILD_ESTIMATE_SECONDS = 180;
const POLL_MS = 15_000;

type Snapshot = {
  dirtyAt: string | null;
  triggeredAt: string | null;
  serverNow: string;
};

type Phase = "loading" | "queued" | "building" | "idle";

const relativeLabel = (thenMs: number, nowMs: number) => {
  const minutes = Math.floor((nowMs - thenMs) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export function DeployStatus({
  variant = "card",
  className,
}: {
  variant?: "card" | "compact";
  className?: string;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  // Server-clock offset so the countdown isn't skewed by the local clock.
  const clockOffsetRef = useRef(0);
  // Wall clock lives in state (set from effects only — render stays pure).
  const [nowMs, setNowMs] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/cms/deploy-status");
      const json = await response.json();
      if (json.status !== "success") return;
      clockOffsetRef.current = Date.now() - new Date(json.data.serverNow).getTime();
      setSnapshot(json.data);
    } catch {
      // Transient network error — keep showing the last snapshot.
    }
  }, []);

  useEffect(() => {
    refresh();
    setNowMs(Date.now());
    const poll = setInterval(refresh, POLL_MS);
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    window.addEventListener(DEPLOY_STATUS_REFRESH_EVENT, refresh);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener(DEPLOY_STATUS_REFRESH_EVENT, refresh);
    };
  }, [refresh]);

  const serverNow = nowMs - clockOffsetRef.current;
  const dirtyAtMs = snapshot?.dirtyAt ? new Date(snapshot.dirtyAt).getTime() : 0;
  const triggeredAtMs = snapshot?.triggeredAt ? new Date(snapshot.triggeredAt).getTime() : 0;
  // triggered_at defaults to epoch 0 before the first ever build.
  const hasBuilt = triggeredAtMs > 86_400_000;
  const buildElapsedSeconds = hasBuilt ? (serverNow - triggeredAtMs) / 1000 : Infinity;

  const phase: Phase = !snapshot || nowMs === 0
    ? "loading"
    : dirtyAtMs > triggeredAtMs
      ? "queued"
      : buildElapsedSeconds < BUILD_ESTIMATE_SECONDS
        ? "building"
        : "idle";

  const buildProgress = Math.min(buildElapsedSeconds / BUILD_ESTIMATE_SECONDS, 1);
  const remainingSeconds = Math.max(0, Math.round(BUILD_ESTIMATE_SECONDS - buildElapsedSeconds));

  const label =
    phase === "loading" ? "Checking…"
    : phase === "queued" ? "Update queued"
    : phase === "building" ? "Publishing to coze.care"
    : "Site up to date";

  const timeText =
    phase === "queued" ? "build starts shortly"
    : phase === "building" ? `≈ ${remainingSeconds >= 60 ? `${Math.ceil(remainingSeconds / 60)}m` : `${remainingSeconds}s`} left`
    : phase === "idle" && hasBuilt ? `published ${relativeLabel(triggeredAtMs, serverNow)}`
    : "";

  const dotClass =
    phase === "queued" ? "bg-[var(--studio-clay)] animate-pulse"
    : phase === "building" ? "bg-primary animate-pulse"
    : phase === "idle" ? "bg-[var(--studio-sage)]"
    : "bg-muted-foreground/40";

  const bar = (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      {phase === "queued" ? (
        <div className="studio-indeterminate h-full w-1/3 rounded-full bg-[var(--studio-clay)]" />
      ) : phase === "building" ? (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.max(4, buildProgress * 100)}%` }}
        />
      ) : (
        <div
          className={cn(
            "h-full w-full rounded-full",
            phase === "idle" ? "bg-[var(--studio-sage)]/50" : "bg-transparent",
          )}
        />
      )}
    </div>
  );

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)} title={timeText || label}>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
        <span className="whitespace-nowrap text-xs text-muted-foreground">{label}</span>
        {(phase === "queued" || phase === "building") && (
          <span className="w-16">{bar}</span>
        )}
      </div>
    );
  }

  return (
    <section className={cn("space-y-3 rounded-xl border border-border bg-card p-4", className)}>
      <header className="flex items-center gap-1.5 text-muted-foreground">
        <Globe className="h-3.5 w-3.5" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]">Site status</h2>
      </header>
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-medium leading-tight">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
          {label}
        </p>
        {timeText && <p className="text-[11px] text-muted-foreground">{timeText}</p>}
      </div>
      {bar}
    </section>
  );
}
