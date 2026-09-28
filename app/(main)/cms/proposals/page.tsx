"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/contexts/user-context";

type Version = {
  version: number;
  content: Record<string, unknown>;
  rationale: string;
  author: string;
  createdAt: string;
};
type Proposal = {
  id: string;
  kind: "itinerary" | "homepage_design";
  target: string | null;
  status: "draft" | "published" | "closed";
  createdAt: string;
  updatedAt: string;
  versions?: Version[];
};

export default function ProposalsPage() {
  const { user } = useUser();
  const [items, setItems] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  async function loadList() {
    const response = await fetch("/api/cms/proposals");
    const json = await response.json();
    if (!response.ok) throw new Error(json.message ?? "Could not load proposals.");
    setItems(json.items);
  }

  useEffect(() => {
    loadList().catch((error) => toast.error(error.message)).finally(() => setLoading(false));
  }, []);

  async function select(id: string) {
    try {
      const response = await fetch(`/api/cms/proposals/${encodeURIComponent(id)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "Could not load proposal.");
      setSelected(json);
      setVersion(json.versions[0]?.version ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load proposal.");
    }
  }

  async function publish() {
    if (!selected || selected.kind !== "itinerary" || version !== selected.versions?.[0]?.version) return;
    if (!window.confirm(`Publish version ${version} of ${selected.target}? This updates the public itinerary and starts the site rebuild.`)) return;
    setPublishing(true);
    try {
      const response = await fetch(`/api/cms/proposals/${encodeURIComponent(selected.id)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? json.error ?? "Publish failed.");
      setSelected(json);
      await loadList();
      toast.success("Published. The website rebuild has been requested.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  const current = selected?.versions?.find((item) => item.version === version);
  const isAdmin = user?.role === "admin";

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-2">
      <div>
        <h1 className="font-serif text-2xl">Change proposals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Version history for ChatGPT itinerary and homepage changes, plus optional review drafts.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.35fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading proposals…</p>}
          {!loading && items.length === 0 && <p className="text-sm text-muted-foreground">No proposals yet.</p>}
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => select(item.id)}
              className={`w-full rounded-lg border p-3 text-left hover:bg-secondary/60 ${selected?.id === item.id ? "border-primary bg-secondary/50" : "border-border"}`}>
              <span className="block text-sm font-medium">{item.kind === "itinerary" ? item.target : "Homepage design"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.status} · {new Date(item.updatedAt).toLocaleString()}</span>
            </button>
          ))}
        </div>
        {selected ? (
          <article className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{selected.kind.replace("_", " ")} · {selected.status}</p>
                <h2 className="font-serif text-xl">{selected.target ?? "Homepage design request"}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.versions?.map((item) => (
                  <button key={item.version} type="button" onClick={() => setVersion(item.version)}
                    className={`rounded border px-3 py-1 text-xs ${version === item.version ? "border-primary bg-secondary" : "border-border"}`}>
                    v{item.version}
                  </button>
                ))}
              </div>
            </div>
            {current && <>
              <p className="text-xs text-muted-foreground">{current.author} · {new Date(current.createdAt).toLocaleString()}</p>
              <section><h3 className="text-sm font-semibold">Why this change</h3><p className="mt-1 whitespace-pre-wrap text-sm">{current.rationale}</p></section>
              {selected.kind === "homepage_design" && typeof current.content.commit === "string" ? (
                <section className="space-y-2 rounded-md bg-secondary/45 p-4 text-sm">
                  <p><b>Commit:</b> <a className="underline" href={String(current.content.url ?? "")} target="_blank" rel="noreferrer">{current.content.commit.slice(0, 7)}</a>{current.content.undoOf ? " (undo of an earlier change)" : ""}</p>
                  <p><b>Files:</b> {Array.isArray(current.content.files) ? current.content.files.join(", ") : ""}</p>
                  <p className="text-muted-foreground">{selected.status === "closed" ? "This change was undone from ChatGPT." : "Committed from ChatGPT to the production branch; Cloudflare deploys it."}</p>
                </section>
              ) : selected.kind === "homepage_design" ? (
                <section className="space-y-2 rounded-md bg-secondary/45 p-4 text-sm">
                  <p><b>Section:</b> {String(current.content.section ?? "")}</p>
                  <p className="whitespace-pre-wrap">{String(current.content.request ?? "")}</p>
                  <p className="text-muted-foreground">Design changes require a code preview and review; this request cannot publish from CMS.</p>
                </section>
              ) : (
                <section className="space-y-3 text-sm">
                  <p><b>Title:</b> {String(current.content.title ?? "")}</p>
                  <p><b>Category:</b> {String(current.content.category ?? "")}</p>
                  <p><b>Cover:</b> {String(current.content.cover ?? "None")}</p>
                  <div><b>Page content</b><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary/45 p-4 font-sans text-sm">{String(current.content.body ?? "")}</pre></div>
                </section>
              )}
            </>}
            {selected.kind === "itinerary" && selected.status === "draft" && isAdmin && (
              <button type="button" onClick={publish} disabled={publishing || version !== selected.versions?.[0]?.version}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
                {publishing ? "Publishing…" : "Publish reviewed version"}
              </button>
            )}
            {selected.kind === "itinerary" && !isAdmin && <p className="text-xs text-muted-foreground">Only Admins can publish.</p>}
          </article>
        ) : <p className="text-sm text-muted-foreground">Select a proposal to review its versions.</p>}
      </div>
    </div>
  );
}
