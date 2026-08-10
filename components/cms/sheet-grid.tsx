"use client";

/**
 * Generic spreadsheet grid — the shared engine behind every "Google Sheet"
 * style editor in the CMS: SitePageSheet (columns = languages), the family
 * facts sheet (columns = properties) and the Quick updates blocks.
 *
 * Rows are grouped into sections; the first column is the sticky field-label
 * column, followed by one data column per `SheetColumn`. A column with
 * `pinned` stays visible while scrolling horizontally (used for the English
 * reference column). `getValue` returning `undefined` renders a non-editable
 * "—" cell (a property that doesn't have that field).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Code2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type SheetColumn = {
  id: string;
  label: string;
  pinned?: boolean;
  tinted?: boolean;
  headerExtra?: ReactNode;
};

export type SheetRow = { id: string; label: string; isHtml?: boolean };

export type SheetSection = {
  key: string;
  label: string;
  rows: SheetRow[];
  // Optional per-column footer cell (e.g. array add/remove controls).
  footer?: (column: SheetColumn) => ReactNode;
};

const LABEL_COL_WIDTH = 200;

function SheetCellView({
  value,
  active,
  tinted,
  isHtml,
  readonly,
  onActivate,
  onChange,
  onMove,
  onClose,
  registerRef,
}: {
  value: string | undefined;
  active: boolean;
  tinted: boolean;
  isHtml: boolean;
  readonly: boolean;
  onActivate: () => void;
  onChange: (next: string) => void;
  onMove: (direction: "up" | "down" | "left" | "right") => void;
  onClose: () => void;
  registerRef: (el: HTMLTextAreaElement | null) => void;
}) {
  if (value === undefined) {
    return (
      <div
        className="px-2 py-1.5 text-[13px] text-muted-foreground/50"
        title="Not available for this column"
      >
        —
      </div>
    );
  }
  if (readonly) {
    return (
      <div
        className={cn(
          "whitespace-pre-wrap break-words px-2 py-1.5 text-[13px] leading-snug",
          tinted && "bg-amber-50/60",
          value === "" && "italic text-muted-foreground/70",
          isHtml && value !== "" && "font-mono text-[12px]",
        )}
      >
        {value || "Empty"}
      </div>
    );
  }
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

export function SheetGrid({
  columns,
  sections,
  getValue,
  onChange,
  readonly = false,
  maxHeightClass = "max-h-[65vh]",
}: {
  columns: SheetColumn[];
  sections: SheetSection[];
  getValue: (columnId: string, rowId: string) => string | undefined;
  onChange: (columnId: string, rowId: string, value: string) => void;
  readonly?: boolean;
  maxHeightClass?: string;
}) {
  // Flatten rows across sections for cell addressing / keyboard navigation.
  const flatRows = useMemo(
    () => sections.flatMap((section) => section.rows),
    [sections],
  );
  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    flatRows.forEach((row, index) => map.set(row.id, index));
    return map;
  }, [flatRows]);

  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
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
    const id = `${activeCell.row}:${activeCell.col}`;
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
      let { row, col } = current;
      if (direction === "right") {
        col += 1;
        if (col >= columns.length) {
          col = 0;
          row = Math.min(row + 1, flatRows.length - 1);
        }
      } else if (direction === "left") {
        col -= 1;
        if (col < 0) {
          col = columns.length - 1;
          row = Math.max(row - 1, 0);
        }
      } else if (direction === "down") {
        row = Math.min(row + 1, flatRows.length - 1);
      } else {
        row = Math.max(row - 1, 0);
      }
      return { row, col };
    });
  };

  if (flatRows.length === 0 && !sections.some((s) => s.footer)) return null;

  const gridTemplateColumns = `${LABEL_COL_WIDTH}px ${columns
    .map((column) => (column.pinned ? "220px" : "minmax(200px, 1fr)"))
    .join(" ")}`;

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
        className={cn("relative overflow-auto rounded-lg border border-border", maxHeightClass)}
      >
        <div className="grid text-sm" style={{ gridTemplateColumns }}>
          {/* Header row */}
          <div className="sticky top-0 left-0 z-30 border-b border-r border-border bg-card px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Field
          </div>
          {columns.map((column) => (
            <div
              key={column.id}
              className={cn(
                "sticky top-0 z-20 border-b border-border bg-card px-2 py-2 text-[12px] font-medium",
                column.pinned && "z-30 border-r-2 border-r-primary/50 bg-card",
              )}
              style={column.pinned ? { left: LABEL_COL_WIDTH } : undefined}
            >
              <span className="inline-flex items-center gap-1.5">
                {column.label}
                {column.tinted && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                    title="Machine translated — needs review"
                  />
                )}
                {column.headerExtra}
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
                style={{ gridColumn: `1 / span ${1 + columns.length}` }}
              >
                {section.label}
              </div>
              {section.rows.map((row) => {
                const rowIndex = rowIndexById.get(row.id) ?? 0;
                return (
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
                    {columns.map((column, colIndex) => {
                      const value = getValue(column.id, row.id);
                      const active =
                        activeCell?.row === rowIndex && activeCell?.col === colIndex;
                      return (
                        <div
                          key={column.id}
                          className={cn(
                            "border-b border-border bg-card",
                            column.pinned && "sticky z-10 border-r-2 border-r-primary/50",
                            !active && !column.pinned && "border-r",
                          )}
                          style={column.pinned ? { left: LABEL_COL_WIDTH } : undefined}
                        >
                          <SheetCellView
                            value={value}
                            active={active}
                            tinted={Boolean(column.tinted) && !column.pinned}
                            isHtml={Boolean(row.isHtml)}
                            readonly={readonly}
                            onActivate={() => setActiveCell({ row: rowIndex, col: colIndex })}
                            onChange={(next) => onChange(column.id, row.id, next)}
                            onMove={move}
                            onClose={() =>
                              setActiveCell((current) =>
                                current && current.row === rowIndex && current.col === colIndex
                                  ? null
                                  : current,
                              )
                            }
                            registerRef={(el) => {
                              const id = `${rowIndex}:${colIndex}`;
                              if (el) cellRefs.current.set(id, el);
                              else cellRefs.current.delete(id);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {section.footer && (
                <div className="contents">
                  <div className="sticky left-0 z-10 border-b border-r border-border bg-card px-2 py-1" />
                  {columns.map((column) => (
                    <div
                      key={column.id}
                      className={cn(
                        "border-b border-r border-border bg-card px-2 py-1",
                        column.pinned && "sticky z-10 border-r-2 border-r-primary/50",
                      )}
                      style={column.pinned ? { left: LABEL_COL_WIDTH } : undefined}
                    >
                      {section.footer?.(column)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
