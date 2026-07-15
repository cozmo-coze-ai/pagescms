"use client";

// The Writing kit: prompt "recipes" editors copy into ChatGPT (or any
// assistant), then paste the Markdown result back into the editor. Each
// prompt teaches the assistant the house style learned from the published
// itineraries (bold ### statements to open, "## emoji Place" sections, a
// bold kicker line, short breathing paragraphs).

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type Recipe = {
  id: string;
  name: string;
  blurb: string;
  prompt: string;
};

const HOUSE_STYLE = `Follow this exact house style:
- Open with 3-4 short, bold statements as "###" headings that set the feeling, e.g. ### **This isn't a sightseeing tour. It's a reset day!** — no introduction paragraph.
- Then one "##" section per stop, formatted as: ## <one emoji> <Place name>
- Under each section: one bold kicker line saying what the place is for, e.g. **A place to start the day—intentionally, slowly**, then short paragraphs of 1-2 sentences with blank lines between thoughts.
- Voice: calm, sensory, second person; "we" for the group. No tourist-brochure clichés ("hidden gem", "must-see", "bucket list").
- No closing summary section. Do not include images — photos are added in the editor.`;

const RECIPES: Recipe[] = [
  {
    id: "draft",
    name: "Draft a full itinerary",
    blurb: "Turn an idea into a complete page in the house style.",
    prompt: `You are the content writer for coze.care, a guest manual of curated Korea travel itineraries for international guests.

Write the full page for this itinerary idea:
[DESCRIBE YOUR IDEA — destination, season, vibe, who it's for]

${HOUSE_STYLE}

Before the body, also give me:
- Title: specific and quiet, under 70 characters
- Slug: lowercase words joined by hyphens
- Category: "tour" (destination-led) or "experience" (hands-on local moment)
- Badge: one of Popular, Always, Seasonal, Unique, Coze Original — or none

Return those four lines first, then the body as clean Markdown.`,
  },
  {
    id: "polish",
    name: "Polish my draft",
    blurb: "Rewrite rough notes into the house voice, facts untouched.",
    prompt: `You are the editor for coze.care, a guest manual of curated Korea travel itineraries. Polish the draft below into the house style without changing the facts, the stops, or their order.

${HOUSE_STYLE}
- Keep any existing image lines exactly as they are.

Return only the polished Markdown.

Draft:
[PASTE YOUR DRAFT HERE]`,
  },
  {
    id: "title",
    name: "Title & badge ideas",
    blurb: "Five quiet title options plus a slug and badge.",
    prompt: `You are naming a Korea travel itinerary for coze.care's guest manual. Based on the description below, give me:
- 5 title options under 70 characters: specific and quiet, no hype punctuation
- a slug for the best one (lowercase words joined by hyphens)
- one badge suggestion from: Popular, Always, Seasonal, Unique, Coze Original — or none

Description:
[DESCRIBE THE ITINERARY]`,
  },
];

export function WritingKit() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (recipe: Recipe) => {
    await navigator.clipboard.writeText(recipe.prompt);
    setCopiedId(recipe.id);
    toast.success("Prompt copied — paste it into ChatGPT.");
    window.setTimeout(() => {
      setCopiedId((current) => (current === recipe.id ? null : current));
    }, 2000);
  };

  return (
    <aside className="space-y-2.5">
      <div>
        <h2 className="font-serif text-sm tracking-tight">Writing kit</h2>
        <p className="text-[11px] text-muted-foreground">
          Draft with ChatGPT, paste the result back here.
        </p>
      </div>

      <div className="space-y-2">
        {RECIPES.map((recipe) => (
          <div
            key={recipe.id}
            className="studio-lift rounded-lg border border-border bg-card p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-tight">{recipe.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{recipe.blurb}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className="shrink-0"
                onClick={() => handleCopy(recipe)}
                aria-label={`Copy the "${recipe.name}" prompt`}
              >
                {copiedId === recipe.id ? <Check className="text-primary" /> : <Copy />}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ol className="space-y-0.5 pl-4 text-[11px] text-muted-foreground [list-style-type:decimal]">
        <li>Copy a recipe and paste it into ChatGPT.</li>
        <li>Fill in the [bracketed] part, send it.</li>
        <li>Paste the Markdown into Content, then save.</li>
      </ol>
    </aside>
  );
}
