"use client";

/**
 * Shape-driven form for guest-page content ("Site pages", Plans.md Phase 2).
 *
 * Renders a form directly from a JSON dictionary's structure instead of a
 * hand-written field schema: the coze_client layout locks the shape, so the
 * shape is the schema. Rules:
 *
 *   - string leaf     → Input, or Textarea when the key ends in "Html" /
 *                       the value is long or multi-line. *Html fields get a
 *                       "supports HTML" hint.
 *   - { src, alt }    → image editor: preview + replace-upload + alt text.
 *     under an `image` key (src is a pages-media bucket key or a URL)
 *   - array           → repeatable group; new items clone the first item.
 *   - object          → titled group (top level renders as section cards).
 *
 * The server re-validates structurally on save, so this form only has to be
 * honest, not defensive.
 */

import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown, ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type Json = string | number | boolean | Json[] | { [key: string]: Json };

// "bodyHtml" → "Body", "wifiRows" → "Wifi Rows", "igLabel" → "Ig Label"
export const humanize = (key: string) =>
  key
    .replace(/Html$/, "")
    .replace(/[-_]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

const isHtmlKey = (key: string) => /Html$/.test(key);

export const isImageObject = (key: string, value: Json): value is { src: string; alt: string } =>
  key === "image" &&
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as Record<string, Json>).src === "string" &&
  typeof (value as Record<string, Json>).alt === "string";

const previewUrl = (src: string, mediaBaseUrl: string) =>
  /^https?:\/\//.test(src) || src.startsWith("/") ? src : mediaBaseUrl + src;

type Ctx = {
  page: string;
  mediaBaseUrl: string;
  onChange: (path: (string | number)[], value: Json) => void;
  // English source content, shown as muted reference text under each field
  // when editing a translation (the "side-by-side" review aid).
  reference?: Record<string, Json> | null;
};

const getAtPath = (root: Record<string, Json> | null | undefined, path: (string | number)[]) => {
  let node: Json | undefined = root as Json | undefined;
  for (const key of path) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, Json>)[key];
  }
  return node;
};

function StringField({
  fieldKey,
  value,
  path,
  ctx,
}: {
  fieldKey: string;
  value: string;
  path: (string | number)[];
  ctx: Ctx;
}) {
  const long = isHtmlKey(fieldKey) || value.length > 70 || value.includes("\n");
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {humanize(fieldKey)}
        {isHtmlKey(fieldKey) && (
          <span className="ml-1.5 font-normal opacity-70">
            (supports HTML tags like &lt;strong&gt;)
          </span>
        )}
      </Label>
      {long ? (
        <Textarea
          value={value}
          rows={Math.min(6, Math.max(2, Math.ceil(value.length / 80)))}
          onChange={(e) => ctx.onChange(path, e.target.value)}
        />
      ) : (
        <Input value={value} onChange={(e) => ctx.onChange(path, e.target.value)} />
      )}
      {(() => {
        const reference = getAtPath(ctx.reference, path);
        return typeof reference === "string" && reference !== "" && reference !== value ? (
          <p className="text-[11px] leading-snug text-muted-foreground/80">
            <span className="font-medium">EN:</span> {reference}
          </p>
        ) : null;
      })()}
    </div>
  );
}

function ImageField({
  value,
  path,
  ctx,
}: {
  value: { src: string; alt: string };
  path: (string | number)[];
  ctx: Ctx;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/cms/guest-pages/${ctx.page}/media`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json();
      if (json.status !== "success") {
        toast.error(json.message || "Upload failed.");
        return;
      }
      ctx.onChange([...path, "src"], json.data.key);
      toast.success("Image uploaded — remember to save.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex gap-2 rounded-md border border-border bg-secondary/30 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl(value.src, ctx.mediaBaseUrl)}
        alt={value.alt}
        className="h-14 w-20 shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <Input
          value={value.alt}
          placeholder="Alt text"
          className="h-7 px-1.5 text-[13px]"
          onChange={(e) => ctx.onChange([...path, "alt"], e.target.value)}
        />
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-[10px] text-muted-foreground" title={value.src}>
            {value.src}
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="ml-auto h-6 shrink-0 gap-1 px-2 text-[11px]"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3 w-3" />
            {uploading ? "Uploading…" : "Replace"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ShapeNode({
  fieldKey,
  value,
  path,
  ctx,
  depth,
}: {
  fieldKey: string;
  value: Json;
  path: (string | number)[];
  ctx: Ctx;
  depth: number;
}) {
  if (typeof value === "string") {
    return <StringField fieldKey={fieldKey} value={value} path={path} ctx={ctx} />;
  }

  if (isImageObject(fieldKey, value)) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{humanize(fieldKey)}</Label>
        <ImageField value={value} path={path} ctx={ctx} />
      </div>
    );
  }

  if (Array.isArray(value)) {
    // Plain-string arrays (chip lists, step lists) are short and repetitive
    // enough that the full card-per-item layout is mostly whitespace — a
    // compact numbered row reads much faster than a full card per item.
    const isStringArray = value.every((item) => typeof item === "string");
    return (
      <div className="space-y-2">
        <Label className="text-xs font-medium">{humanize(fieldKey)}</Label>
        {isStringArray ? (
          <div className="space-y-1.5">
            {value.map((item, index) => {
              const text = item as string;
              const short = !isHtmlKey(fieldKey) && text.length <= 60 && !text.includes("\n");
              return (
                <div
                  key={index}
                  className="flex items-center gap-1.5 rounded-md border border-border p-1.5"
                >
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  {short ? (
                    <Input
                      value={text}
                      className="h-7 px-1.5 text-[13px]"
                      onChange={(e) => ctx.onChange([...path, index], e.target.value)}
                    />
                  ) : (
                    <Textarea
                      value={text}
                      rows={2}
                      className={cn("min-h-0", isHtmlKey(fieldKey) && "font-mono text-[12px]")}
                      onChange={(e) => ctx.onChange([...path, index], e.target.value)}
                    />
                  )}
                  {value.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove item"
                      onClick={() => {
                        const next = value.filter((_, i) => i !== index);
                        ctx.onChange(path, next);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // coze_client's own "gap method" card grid (see coze_client
          // CLAUDE.md): 1px background gap between cells reads as a hairline
          // divider — matches how these items actually render on the live
          // guest pages, instead of looking like unrelated stacked boxes.
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            {value.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "space-y-2 bg-card p-3",
                  // last item spans both columns when the count is odd, so
                  // it doesn't leave a lone empty cell beside it
                  value.length % 2 === 1 && index === value.length - 1 && "sm:col-span-2",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {index + 1}
                    </span>
                    {humanize(fieldKey)}
                  </span>
                  {value.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove item"
                      onClick={() => {
                        const next = value.filter((_, i) => i !== index);
                        ctx.onChange(path, next);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <ShapeNode
                  fieldKey={fieldKey}
                  value={item}
                  path={[...path, index]}
                  ctx={ctx}
                  depth={depth + 1}
                />
              </div>
            ))}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="gap-1"
          onClick={() => {
            // New items clone the first item so the shape stays valid; the
            // editor then overwrites the copied text.
            const template = structuredClone(value[0]);
            ctx.onChange(path, [...value, template]);
          }}
          disabled={value.length === 0}
        >
          <Plus className="h-3 w-3" />
          Add {humanize(fieldKey).toLowerCase().replace(/s$/, "")}
        </Button>
      </div>
    );
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    // When this object node was reached from an array item, its key equals
    // the array's key — don't repeat the heading, just render the fields.
    const isArrayItem = typeof path[path.length - 1] === "number";
    return (
      <div className={cn("space-y-3", depth > 0 && !isArrayItem && "border-l-2 border-border pl-3")}>
        {!isArrayItem && depth > 0 && (
          <p className="text-xs font-medium">{humanize(fieldKey)}</p>
        )}
        {entries.map(([key, child]) => (
          <ShapeNode
            key={key}
            fieldKey={key}
            value={child}
            path={[...path, key]}
            ctx={ctx}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  // Non-string scalar (number/boolean) — not expected in guest-page dicts;
  // render read-only so nothing is silently editable into a wrong type.
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{humanize(fieldKey)}</Label>
      <Input value={String(value)} disabled />
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-lg border-2 border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 border-l-4 border-l-primary bg-secondary px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 font-serif text-base font-semibold tracking-tight text-foreground">
          {title}
          {count !== null && (
            <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] font-sans font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </section>
  );
}

export function ShapeForm({
  page,
  fields,
  mediaBaseUrl,
  reference,
  onChange,
}: {
  page: string;
  fields: Record<string, Json>;
  mediaBaseUrl: string;
  reference?: Record<string, Json> | null;
  onChange: (next: Record<string, Json>) => void;
}) {
  const handleChange = (path: (string | number)[], value: Json) => {
    const next = structuredClone(fields);
    let node: any = next;
    for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
    node[path[path.length - 1]] = value;
    onChange(next);
  };

  const ctx: Ctx = { page, mediaBaseUrl, onChange: handleChange, reference };

  const renderSection = ([key, value]: [string, Json]) => (
    <CollapsibleSection
      key={key}
      title={humanize(key)}
      count={Array.isArray(value) ? value.length : null}
    >
      <ShapeNode fieldKey={key} value={value} path={[key]} ctx={ctx} depth={0} />
    </CollapsibleSection>
  );

  // Two independent side-by-side stacks (sections alternate left/right by
  // position), not a CSS grid/columns reflow — each column just sizes to
  // its own content, so a tall card never strands a short one next to it
  // and nothing jumps between columns as content changes.
  const entries = Object.entries(fields);
  const left = entries.filter((_, i) => i % 2 === 0);
  const right = entries.filter((_, i) => i % 2 === 1);

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <div className="flex-1 space-y-3">{left.map(renderSection)}</div>
      {right.length > 0 && <div className="flex-1 space-y-3">{right.map(renderSection)}</div>}
    </div>
  );
}
