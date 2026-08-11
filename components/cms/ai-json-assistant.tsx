"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type AiJsonDocument = {
  code: string;
  label: string;
  fields: Record<string, Json>;
  sourceFields?: Record<string, Json>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const valueKind = (value: unknown) => (Array.isArray(value) ? "array" : typeof value);

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
// message before an AI response can replace keys, arrays, or non-text facts.
export function findJsonShapeProblem(
  original: Json,
  candidate: unknown,
  path = "content",
): string | null {
  if (typeof original === "string") {
    if (typeof candidate !== "string") return `${path} must remain text.`;
    const before = protectedTextParts(original);
    const after = protectedTextParts(candidate);
    for (const key of ["html", "placeholders", "urls", "numbers", "currency"] as const) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        return `${path} must keep its ${key} unchanged.`;
      }
    }
    if (before.imagePath && before.imagePath !== candidate) {
      return `${path} is an image path and must stay unchanged.`;
    }
    const missingName = before.names.find((name) => !after.names.includes(name));
    return missingName ? `${path} must keep the name ${missingName}.` : null;
  }

  if (typeof original === "number" || typeof original === "boolean") {
    return candidate === original ? null : `${path} is not editable text and must stay unchanged.`;
  }

  if (Array.isArray(original)) {
    if (!Array.isArray(candidate)) return `${path} must remain an array.`;
    if (candidate.length !== original.length) return `${path} must keep ${original.length} items.`;
    for (let index = 0; index < original.length; index++) {
      const problem = findJsonShapeProblem(original[index], candidate[index], `${path}[${index}]`);
      if (problem) return problem;
    }
    return null;
  }

  if (!isRecord(candidate)) return `${path} must remain an object, not ${valueKind(candidate)}.`;
  const originalKeys = Object.keys(original);
  const candidateKeys = Object.keys(candidate);
  const missing = originalKeys.find((key) => !candidateKeys.includes(key));
  if (missing) return `${path}.${missing} is missing.`;
  const extra = candidateKeys.find((key) => !originalKeys.includes(key));
  if (extra) return `${path}.${extra} is not an allowed key.`;
  for (const key of originalKeys) {
    const problem = findJsonShapeProblem(original[key], candidate[key], `${path}.${key}`);
    if (problem) return problem;
  }
  return null;
}

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function buildAiRequest(page: string, pageLabel: string, document: AiJsonDocument) {
  return JSON.stringify(
    {
      task: "Review and correct one coze.care CMS page",
      page,
      pageLabel,
      targetLanguage: { code: document.code, label: document.label },
      prompt: [
        "Correct translation errors, grammar, clarity, and natural guest-facing hospitality tone.",
        "Use sourceContent as the factual reference when it is included.",
        "Change text values only. Keep every key, object, array, item order, URL, image path, number, price, time, HTML tag, and placeholder unchanged.",
        "Do not translate these names: COZE, EVERPURE, HIMPEL, Coupang Eats, T-money, ARA, Wellness Suite, AERIES, and Rocket Global.",
        "Return JSON only. Put the corrected object in content and keep exactly the same structure as targetContent.",
      ],
      sourceLanguage: document.sourceFields ? "en" : document.code,
      sourceContent: document.sourceFields,
      targetContent: document.fields,
      requiredResponse: {
        page,
        language: document.code,
        content: "Corrected targetContent object with the exact same structure",
      },
    },
    null,
    2,
  );
}

export function AiJsonAssistant({
  page,
  pageLabel,
  documents,
  defaultLanguage,
  onApply,
}: {
  page: string;
  pageLabel: string;
  documents: AiJsonDocument[];
  defaultLanguage?: string;
  onApply: (language: string, fields: Record<string, Json>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(defaultLanguage ?? documents[0]?.code ?? "en");
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (open) return;
    const next = documents.some((document) => document.code === defaultLanguage)
      ? defaultLanguage
      : documents[0]?.code;
    if (next) setLanguage(next);
  }, [defaultLanguage, documents, open]);

  const document =
    documents.find((candidate) => candidate.code === language) ?? documents[0];
  const request = useMemo(
    () => (document ? buildAiRequest(page, pageLabel, document) : ""),
    [document, page, pageLabel],
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      const preferred = documents.find((candidate) => candidate.code === defaultLanguage);
      setLanguage(preferred?.code ?? documents[0]?.code ?? "en");
      setReply("");
    }
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
    if (!document || !reply.trim()) return;
    try {
      const parsed: unknown = JSON.parse(stripCodeFence(reply));
      let candidate = parsed;
      let problem = findJsonShapeProblem(document.fields, candidate);
      let wrapped = false;
      if (problem && isRecord(parsed)) {
        const nested = isRecord(parsed.content)
          ? parsed.content
          : isRecord(parsed.fields)
            ? parsed.fields
            : null;
        if (nested) {
          candidate = nested;
          problem = findJsonShapeProblem(document.fields, candidate);
          wrapped = !problem;
        }
      }
      if (problem) throw new Error(problem);
      if (
        wrapped &&
        isRecord(parsed) &&
        typeof parsed.page === "string" &&
        parsed.page !== page
      ) {
        throw new Error(`This reply is for ${parsed.page}, not ${page}.`);
      }
      if (
        wrapped &&
        isRecord(parsed) &&
        typeof parsed.language === "string" &&
        parsed.language !== document.code
      ) {
        throw new Error(`This reply is for ${parsed.language}, not ${document.code}.`);
      }
      onApply(document.code, candidate as Record<string, Json>);
      setOpen(false);
      toast.success("AI JSON applied. Review it, then save.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That reply is not valid JSON.");
    }
  };

  if (documents.length === 0) return null;

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
            Copy the request into any AI, then paste its JSON reply below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {documents.length > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ai-json-language">Language</Label>
              <Select value={document.code} onValueChange={setLanguage}>
                <SelectTrigger id="ai-json-language" size="sm" className="min-w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((candidate) => (
                    <SelectItem key={candidate.code} value={candidate.code}>
                      {candidate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
              placeholder='Paste the JSON reply with "page", "language", and "content" here.'
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
