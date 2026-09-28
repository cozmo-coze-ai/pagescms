"use client";

/**
 * "Fix with AI" for the sheet editors. The copied request is a flat map of
 * field id → current text in every language, scoped to the rows the editor is
 * currently showing (so an active search copies only the matched fields). The
 * pasted reply may contain any subset of those fields/languages — each entry
 * is looked up by its field id and only those cells are updated, never the
 * whole document.
 */

import { useMemo, useState } from "react";
import { Check, Copy, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { type Json } from "@/lib/field-format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAtPath, type JsonPath } from "@/lib/json-path";

export type AiSheetLanguage = { code: string; label: string };
export type AiSheetRow = { id: string; path: JsonPath };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const protectedTextParts = (value: string) => ({
  html: value.match(/<[^>]+>/g) ?? [],
  placeholders: value.match(/\{[^{}]+\}/g) ?? [],
  urls: value.match(/https?:\/\/[^\s"'<>]+/g) ?? [],
  numbers: value.match(/\d+(?:[.,:]\d+)*/g) ?? [],
  currency: value.match(/[₩$€£¥]/g) ?? [],
  imagePath: /(?:^|\/)\S+\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]\S*)?$/i.test(value)
    ? value
    : "",
  names: [
    "COZE",
    "EVERPURE",
    "HIMPEL",
    "Coupang Eats",
    "T-money",
    "ARA",
    "Wellness Suite",
    "AERIES",
    "Rocket Global",
  ].filter((name) => value.includes(name)),
});

// The CMS server validates again on save. This early check gives a useful
// message before an AI reply can drop a tag, placeholder, or non-text fact.
// An empty original is a translation being filled in — nothing to protect.
export function findTextProblem(original: string, candidate: string): string | null {
  if (original === "") return null;
  const before = protectedTextParts(original);
  const after = protectedTextParts(candidate);
  for (const key of ["html", "placeholders", "urls", "numbers", "currency"] as const) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      return `must keep its ${key} unchanged`;
    }
  }
  if (before.imagePath && before.imagePath !== candidate) {
    return "is an image path and must stay unchanged";
  }
  const missingName = before.names.find((name) => !after.names.includes(name));
  return missingName ? `must keep the name ${missingName}` : null;
}

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function AiJsonAssistant({
  page,
  pageLabel,
  languages,
  editableLanguages,
  fieldsByLang,
  rows,
  requestRows,
  searchQuery,
  onApplyCell,
}: {
  page: string;
  pageLabel: string;
  // Languages included in the copied request; en first is the reference.
  languages: AiSheetLanguage[];
  // Languages a pasted reply may change. Defaults to every request language —
  // the building sheet narrows this to the open tab (en stays reference-only).
  editableLanguages?: string[];
  fieldsByLang: Record<string, Record<string, Json> | undefined>;
  // Every field the editor knows — pasted replies are matched against these.
  rows: AiSheetRow[];
  // The subset the copied request contains (e.g. the current search matches).
  // Defaults to all rows.
  requestRows?: AiSheetRow[];
  searchQuery?: string;
  onApplyCell: (lang: string, path: JsonPath, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");

  const editable = editableLanguages ?? languages.map((language) => language.code);
  const scopedRows = requestRows ?? rows;

  const request = useMemo(() => {
    const fields: Record<string, Record<string, string>> = {};
    for (const row of scopedRows) {
      const perLang: Record<string, string> = {};
      for (const language of languages) {
        const value = getAtPath(fieldsByLang[language.code], row.path);
        perLang[language.code] = typeof value === "string" ? value : "";
      }
      fields[row.id] = perLang;
    }
    return JSON.stringify(
      {
        task: "Review and correct guest-page text for one coze.care CMS page",
        page,
        pageLabel,
        ...(searchQuery
          ? { note: `Only the fields matching the editor search "${searchQuery}" are included.` }
          : {}),
        // The language objects from the API carry extra internal keys — send
        // the AI only what it needs.
        languages: languages.map(({ code, label }) => ({ code, label })),
        editableLanguages: editable,
        prompt: [
          "fields maps each field id to that field's current text in every language listed in languages.",
          "English (en) is the factual reference. Correct translation errors, grammar, clarity, and natural guest-facing hospitality tone.",
          "Keep every HTML tag, {placeholder}, URL, image path, number, price, time, and currency symbol unchanged inside each text.",
          "Do not translate these names: COZE, EVERPURE, HIMPEL, Coupang Eats, T-money, ARA, Wellness Suite, AERIES, and Rocket Global.",
          "Only languages in editableLanguages may be changed.",
          "Return JSON only, shaped like requiredResponse. Include only the fields you changed, and for each field only the languages you changed. Leave out everything that is already fine.",
        ],
        fields,
        requiredResponse: {
          page,
          fields: '{ "<field id>": { "<language code>": "corrected full text" } } — changed entries only',
        },
      },
      null,
      2,
    );
  }, [scopedRows, languages, fieldsByLang, page, pageLabel, searchQuery, editable]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setReply("");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(request);
      toast.success("AI request copied.");
    } catch {
      toast.error("Could not copy automatically. Select the JSON and copy it.");
    }
  };

  const handleApply = () => {
    if (!reply.trim()) return;
    try {
      const parsed: unknown = JSON.parse(stripCodeFence(reply));
      let fieldsReply: unknown = parsed;
      if (isRecord(parsed) && isRecord(parsed.fields)) {
        if (typeof parsed.page === "string" && parsed.page !== page) {
          throw new Error(`This reply is for ${parsed.page}, not ${page}.`);
        }
        fieldsReply = parsed.fields;
      }
      if (!isRecord(fieldsReply)) {
        throw new Error("The reply must be a JSON object mapping field ids to languages.");
      }

      const rowsById = new Map(rows.map((row) => [row.id, row]));
      let applied = 0;
      const appliedLangs = new Set<string>();
      const skipped: string[] = [];

      for (const [id, perLang] of Object.entries(fieldsReply)) {
        const row = rowsById.get(id);
        if (!row) {
          skipped.push(`${id}: no such field on this page`);
          continue;
        }
        if (!isRecord(perLang)) {
          skipped.push(`${id}: must map language codes to text`);
          continue;
        }
        for (const [lang, value] of Object.entries(perLang)) {
          if (!editable.includes(lang)) {
            skipped.push(`${id}.${lang}: not editable here`);
            continue;
          }
          if (typeof value !== "string") {
            skipped.push(`${id}.${lang}: must be text`);
            continue;
          }
          const current = getAtPath(fieldsByLang[lang], row.path);
          const currentText = typeof current === "string" ? current : "";
          if (value === currentText) continue;
          const problem = findTextProblem(currentText, value);
          if (problem) {
            skipped.push(`${id}.${lang}: ${problem}`);
            continue;
          }
          onApplyCell(lang, row.path, value);
          applied++;
          appliedLangs.add(lang);
        }
      }

      if (skipped.length > 0) {
        toast.error(
          `Skipped ${skipped.length} — ${skipped[0]}${skipped.length > 1 ? " (and more)" : ""}`,
        );
      }
      if (applied > 0) {
        setOpen(false);
        toast.success(
          `Applied ${applied} change${applied > 1 ? "s" : ""} (${[...appliedLangs].join(", ")}). Review, then save.`,
        );
      } else if (skipped.length === 0) {
        toast.info("That reply contains no changes.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That reply is not valid JSON.");
    }
  };

  if (languages.length === 0 || rows.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <WandSparkles />
          Fix with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fix this page with AI</DialogTitle>
          <DialogDescription>
            Copy the request into any AI, then paste its JSON reply below. The reply
            can contain just the fields it changed — only those are updated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {scopedRows.length} field{scopedRows.length === 1 ? "" : "s"} ·{" "}
            {languages.map((language) => language.label).join(", ")}
            {searchQuery ? (
              <>
                {" "}
                · filtered by search &ldquo;{searchQuery}&rdquo;
              </>
            ) : null}
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ai-json-request">1. Copy this request</Label>
              <Button type="button" variant="outline" size="xs" onClick={handleCopy}>
                <Copy />
                Copy JSON
              </Button>
            </div>
            <Textarea
              id="ai-json-request"
              value={request}
              readOnly
              spellCheck={false}
              className="max-h-52 min-h-32 resize-y overflow-auto font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-json-reply">2. Paste the AI reply</Label>
            <Textarea
              id="ai-json-reply"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder='Paste the JSON reply with "page" and "fields" here.'
              spellCheck={false}
              className="max-h-52 min-h-32 resize-y overflow-auto font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleApply} disabled={!reply.trim()}>
            <Check />
            Apply JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
