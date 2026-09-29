"use client";

// Read actual Cloudflare build status. Elapsed time never implies success.

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export const DEPLOY_STATUS_REFRESH_EVENT = "cms:deploy-status-refresh";

const POLL_MS = 15_000;

type DeploymentState = "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED" | null;

type Snapshot = {
  dirtyAt: string | null;
  triggeredAt: string | null;
  serverNow: string;
  deployment: { state: DeploymentState; createdAt: string } | null;
};

type Phase = "loading" | "queued" | "building" | "idle" | "error" | "unknown";

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
  const [unavailable, setUnavailable] = useState(false);
  // Server-clock offset so the countdown isn't skewed by the local clock.
  const clockOffsetRef = useRef(0);
  // Wall clock lives in state (set from effects only — render stays pure).
  const [nowMs, setNowMs] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/cms/deploy-status");
      const json = await response.json();
      if (!response.ok || json.status !== "success") throw new Error("Status unavailable");
      clockOffsetRef.current = Date.now() - new Date(json.data.serverNow).getTime();
      setSnapshot(json.data);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
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
  const deploymentState = snapshot?.deployment?.state ?? null;
  const usingRealStatus = deploymentState !== null;

  const phase: Phase = unavailable ? "unknown" : !snapshot || nowMs === 0
    ? "loading"
    : dirtyAtMs > triggeredAtMs
      ? "queued"
      : usingRealStatus
        ? deploymentState === "READY"
          ? "idle"
          : deploymentState === "ERROR" || deploymentState === "CANCELED"
            ? "error"
            : deploymentState === "QUEUED" ? "queued" : "building"
        : hasBuilt || dirtyAtMs > 0 ? "unknown" : "idle";

  const label =
    phase === "loading" ? "Checking…"
    : phase === "queued" ? "Update queued"
    : phase === "building" ? "Publishing to coze.care"
    : phase === "error" ? "Publish failed"
    : phase === "unknown" ? "Publish status unavailable"
    : hasBuilt ? "Site up to date" : "Ready to edit";

  const timeText =
    phase === "queued" ? "build starts shortly"
    : phase === "building" ? "Updating the website"
    : phase === "error" ? "Please check the website build"
    : phase === "unknown" ? "Publication could not be confirmed"
    : phase === "idle" && hasBuilt ? `published ${relativeLabel(triggeredAtMs, serverNow)}`
    : "";

  const dotClass =
    phase === "queued" ? "bg-[var(--studio-clay)] animate-pulse"
    : phase === "building" ? "bg-primary animate-pulse"
    : phase === "idle" ? "bg-[var(--studio-sage)]"
    : phase === "error" ? "bg-destructive"
    : "bg-muted-foreground/40";

  const bar = (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      {phase === "queued" ? (
        <div className="studio-indeterminate h-full w-1/3 rounded-full bg-[var(--studio-clay)]" />
      ) : phase === "building" ? (
        <div className="studio-indeterminate h-full w-1/3 rounded-full bg-primary" />
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
      <div className={cn("flex flex-wrap items-center gap-2", className)} title={timeText || label}>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
        <span className="text-xs text-muted-foreground">{label}</span>
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
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
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
