"use client";

/**
 * Spreadsheet-style editor for a guest page's text content across every
 * language at once (replaces the old one-language-at-a-time tabs+form for
 * multi-lang "Site pages"). Rows are the page's text fields, columns are
 * languages with English pinned first/left as the reference column — click a
 * cell to edit inline, Tab/Enter move between cells like a real sheet.
 *
 * Non-text content (images, repeatable card/list groups) doesn't fit a grid
 * cell, so it's filtered out of the sheet and rendered below via the
 * existing shape-driven `ShapeForm`, one language at a time.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Code2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { humanize, isImageObject, type Json } from "@/components/cms/shape-form";

export type Language = { code: string; label: string };

type TextRow = {
  id: string;
  sectionKey: string;
  sectionLabel: string;
  path: string[];
  label: string;
  isHtml: boolean;
};

const isHtmlKey = (key: string) => /Html$/.test(key);

const getAtPath = (root: Record<string, Json> | undefined, path: string[]): Json | undefined => {
  let node: Json | undefined = root as Json | undefined;
  for (const key of path) {
    if (node == null || typeof node !== "object" || Array.isArray(node)) return undefined;
    node = (node as Record<string, Json>)[key];
  }
  return node;
};

// Walks one language's field tree collecting only plain string leaves —
// arrays and { src, alt } image objects are left for the panel below.
function collectTextRows(fields: Record<string, Json>): TextRow[] {
  const rows: TextRow[] = [];
  const walk = (value: Json, path: string[], sectionKey: string, sectionLabel: string) => {
    if (typeof value === "string") {
      rows.push({
        id: path.join("."),
        sectionKey,
        sectionLabel,
        path,
        label: path.slice(1).map(humanize).join(" › ") || humanize(path[0]),
        isHtml: isHtmlKey(path[path.length - 1]),
      });
      return;
    }
    if (Array.isArray(value)) return;
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (isImageObject(key, child)) continue;
        walk(child, [...path, key], sectionKey, sectionLabel);
      }
    }
  };
  for (const [sectionKey, sectionValue] of Object.entries(fields)) {
    walk(sectionValue, [sectionKey], sectionKey, humanize(sectionKey));
  }
  return rows;
}

// Everything a text row skips (arrays, images) — kept as a nested tree so
// the existing ShapeForm can render it unchanged, section by section.
export function filterOtherContent(key: string, value: Json): Json | undefined {
  if (isImageObject(key, value)) return value;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const out: Record<string, Json> = {};
    let has = false;
    for (const [k, v] of Object.entries(value)) {
      const filtered = filterOtherContent(k, v);
      if (filtered !== undefined) {
        out[k] = filtered;
        has = true;
      }
    }
    return has ? out : undefined;
  }
  return undefined;
}

// Merges a change coming back from ShapeForm (scoped to the filtered
// other-content subtree) back into the full field tree for that language.
export function mergeOtherContent(key: string, original: Json | undefined, next: Json): Json {
  if (isImageObject(key, next) || Array.isArray(next)) return next;
  if (next && typeof next === "object") {
    const base =
      original && typeof original === "object" && !Array.isArray(original)
        ? (original as Record<string, Json>)
        : {};
    const merged: Record<string, Json> = { ...base };
    for (const [k, v] of Object.entries(next)) {
      merged[k] = mergeOtherContent(k, base[k], v);
    }
    return merged;
  }
  return next;
}

function SheetCellView({
  value,
  active,
  tinted,
  isHtml,
  onActivate,
  onChange,
  onMove,
  onClose,
  registerRef,
}: {
  value: string;
  active: boolean;
  tinted: boolean;
  isHtml: boolean;
  onActivate: () => void;
  onChange: (next: string) => void;
  onMove: (direction: "up" | "down" | "left" | "right") => void;
  onClose: () => void;
  registerRef: (el: HTMLTextAreaElement | null) => void;
}) {
  if (active) {
    return (
      <Textarea
        ref={registerRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.currentTarget.blur();
            return;
          }
          if (e.key === "Tab") {
            e.preventDefault();
            onMove(e.shiftKey ? "left" : "right");
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onMove("down");
          }
        }}
        rows={2}
        style={{ minHeight: 0 }}
        className={cn(
          "w-full resize-none rounded-none border-0 bg-background px-2 py-1.5 text-[13px] shadow-none ring-2 ring-inset ring-primary focus-visible:ring-2 focus-visible:ring-primary",
          isHtml && "font-mono text-[12px]",
        )}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onActivate}
      className={cn(
        "block w-full whitespace-pre-wrap break-words px-2 py-1.5 text-left text-[13px] leading-snug outline-none",
        "hover:bg-secondary/50 focus-visible:bg-secondary/50",
        tinted && "bg-amber-50/60",
        value === "" && "italic text-muted-foreground/70",
        isHtml && value !== "" && "font-mono text-[12px]",
      )}
    >
      {value || "Empty — click to add"}
    </button>
  );
}

export function SitePageSheet({
  languages,
  fieldsByLang,
  machineTranslatedByLang,
  onCellChange,
}: {
  languages: Language[];
  fieldsByLang: Record<string, Record<string, Json>>;
  machineTranslatedByLang: Record<string, boolean>;
  onCellChange: (lang: string, path: string[], value: string) => void;
}) {
  const en = languages.find((l) => l.code === "en");
  const otherLanguages = languages.filter((l) => l.code !== "en");
  const orderedLanguages = en ? [en, ...otherLanguages] : languages;

  const rows = useMemo(
    () => (fieldsByLang.en ? collectTextRows(fieldsByLang.en) : []),
    [fieldsByLang.en],
  );

  const [activeCell, setActiveCell] = useState<{ row: number; lang: number } | null>(null);
  const cellRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  const jumpToSection = (key: string) => {
    const el = sectionRefs.current.get(key);
    const container = scrollRef.current;
    if (!el || !container) return;
    container.scrollTop = el.offsetTop - 4;
  };

  useEffect(() => {
    if (!activeCell) return;
    const id = `${activeCell.row}:${activeCell.lang}`;
    const el = cellRefs.current.get(id);
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [activeCell]);

  const move = (direction: "up" | "down" | "left" | "right") => {
    setActiveCell((current) => {
      if (!current) return current;
      let { row, lang } = current;
      if (direction === "right") {
        lang += 1;
        if (lang >= orderedLanguages.length) {
          lang = 0;
          row = Math.min(row + 1, rows.length - 1);
        }
      } else if (direction === "left") {
        lang -= 1;
        if (lang < 0) {
          lang = orderedLanguages.length - 1;
          row = Math.max(row - 1, 0);
        }
      } else if (direction === "down") {
        row = Math.min(row + 1, rows.length - 1);
      } else {
        row = Math.max(row - 1, 0);
      }
      return { row, lang };
    });
  };

  if (rows.length === 0) return null;

  const sections: { key: string; label: string; rows: { row: TextRow; index: number }[] }[] = [];
  rows.forEach((row, index) => {
    const last = sections[sections.length - 1];
    if (last && last.key === row.sectionKey) {
      last.rows.push({ row, index });
    } else {
      sections.push({ key: row.sectionKey, label: row.sectionLabel, rows: [{ row, index }] });
    }
  });

  const gridTemplateColumns = `200px 220px repeat(${otherLanguages.length}, minmax(200px, 1fr))`;

  return (
    <div className="space-y-2">
      {sections.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => jumpToSection(section.key)}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {section.label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={scrollRef}
        className="relative max-h-[65vh] overflow-auto rounded-lg border border-border"
      >
        <div className="grid text-sm" style={{ gridTemplateColumns }}>
          {/* Header row */}
          <div className="sticky top-0 left-0 z-30 border-b border-r border-border bg-card px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Field
          </div>
          {orderedLanguages.map((language, langIndex) => (
            <div
              key={language.code}
              className={cn(
                "sticky top-0 z-20 border-b border-border bg-card px-2 py-2 text-[12px] font-medium",
                langIndex === 0 && "left-[200px] z-30 border-r-2 border-r-primary/50 bg-card",
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {language.label}
                {machineTranslatedByLang[language.code] && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                    title="Machine translated — needs review"
                  />
                )}
              </span>
            </div>
          ))}

          {sections.map((section) => (
            <div key={section.key} className="contents">
              <div
                ref={(el) => {
                  if (el) sectionRefs.current.set(section.key, el);
                  else sectionRefs.current.delete(section.key);
                }}
                className="sticky left-0 z-10 border-b border-border bg-secondary px-2 py-1 text-[11px] font-medium uppercase tracking-wide"
                style={{ gridColumn: `1 / span ${1 + orderedLanguages.length}` }}
              >
                {section.label}
              </div>
              {section.rows.map(({ row, index }) => (
                <div key={row.id} className="contents">
                  <div className="sticky left-0 z-10 flex items-center gap-1 border-b border-r border-border bg-card px-2 py-1.5 text-[12px] text-muted-foreground">
                    <span>{row.label}</span>
                    {row.isHtml && (
                      <Code2
                        className="h-3 w-3 shrink-0 text-primary/60"
                        aria-label="Supports HTML tags"
                      >
                        <title>Supports HTML tags like &lt;strong&gt; and &lt;a href&gt;</title>
                      </Code2>
                    )}
                  </div>
                  {orderedLanguages.map((language, langIndex) => {
                    const value =
                      (getAtPath(fieldsByLang[language.code], row.path) as string) ?? "";
                    const active = activeCell?.row === index && activeCell?.lang === langIndex;
                    return (
                      <div
                        key={language.code}
                        className={cn(
                          "border-b border-border bg-card",
                          langIndex === 0 &&
                            "sticky left-[200px] z-10 border-r-2 border-r-primary/50",
                          !active && langIndex > 0 && "border-r",
                        )}
                      >
                        <SheetCellView
                          value={value}
                          active={active}
                          tinted={machineTranslatedByLang[language.code] && langIndex > 0}
                          isHtml={row.isHtml}
                          onActivate={() => setActiveCell({ row: index, lang: langIndex })}
                          onChange={(next) => onCellChange(language.code, row.path, next)}
                          onMove={move}
                          onClose={() =>
                            setActiveCell((current) =>
                              current && current.row === index && current.lang === langIndex
                                ? null
                                : current,
                            )
                          }
                          registerRef={(el) => {
                            const id = `${index}:${langIndex}`;
                            if (el) cellRefs.current.set(id, el);
                            else cellRefs.current.delete(id);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
