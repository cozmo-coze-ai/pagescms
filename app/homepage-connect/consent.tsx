"use client";
import { useState } from "react";
import { HOMEPAGE_AUTH_PATH } from "@/lib/homepage-mcp-config";

export function HomepageConsent({ query, allowed }: { query: string; allowed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(accept: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${HOMEPAGE_AUTH_PATH}/oauth2/consent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accept, oauth_query: query }) });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") throw new Error("This connection request expired or could not be completed. Return to ChatGPT and connect again.");
      const target = new URL(data.url, window.location.origin);
      if (target.origin !== "https://chatgpt.com" && target.origin !== window.location.origin) throw new Error("The connection returned an unexpected address.");
      window.location.assign(target.href);
    } catch (e) { setError(e instanceof Error ? e.message : "Please reconnect from ChatGPT."); setBusy(false); }
  }
  return <div className="mt-6">
    {!allowed && <p role="alert" className="mb-3 text-sm text-destructive">Ask a COZE admin for editor access before connecting.</p>}
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    <div className="flex flex-col gap-2 sm:flex-row-reverse">
      <button className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy || !allowed} onClick={() => submit(true)}>{busy ? "Connecting…" : "Connect"}</button>
      <button className="min-h-11 flex-1 rounded-lg border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={() => submit(false)}>Cancel</button>
    </div>
  </div>;
}
