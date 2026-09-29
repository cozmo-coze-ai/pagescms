import "server-only";

// Request parsing shared by the homepage check (dry run) and apply routes, so
// what the designer confirms is exactly what gets deployed.

import { z } from "zod/v3";
import { createHttpError } from "@/lib/api-error";
import { readJson } from "@/lib/gpt-action-auth";
import { downloadChatGptImage, openaiFileRefSchema, textEditSchema, type NewImage } from "@/lib/homepage-changes";

const changeSchema = z.object({
  expectedCommit: z.string().regex(/^[a-f0-9]{40}$/, "expectedCommit must be the 40-character commit from getHomepage"),
  rationale: z.string().trim().min(5).max(3000),
  edits: z.array(textEditSchema).max(30).default([]),
  // Images attached in ChatGPT, saved as public/home/<imageFilenames[i]>.
  openaiFileIdRefs: z.array(openaiFileRefSchema).max(5).default([]),
  imageFilenames: z.array(z.string()).max(5).default([]),
  // Set only after the designer explicitly said yes to the checked summary.
  confirmedByUser: z.boolean().optional(),
}).strict();

export async function parseHomepageChange(request: Request, { requireConfirmation }: { requireConfirmation: boolean }) {
  const parsed = changeSchema.safeParse(await readJson(request, 400_000));
  if (!parsed.success) {
    throw createHttpError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; "), 400);
  }
  if (requireConfirmation && parsed.data.confirmedByUser !== true) {
    throw createHttpError("Not deployed. First call checkHomepageChange, show the user the summary, and deploy only after they explicitly confirm (then send confirmedByUser: true).", 428);
  }
  const { openaiFileIdRefs, imageFilenames } = parsed.data;
  if (openaiFileIdRefs.length !== imageFilenames.length) {
    throw createHttpError("Give one imageFilenames entry for each attached image, in the same order.", 400);
  }
  const images: NewImage[] = await Promise.all(openaiFileIdRefs.map(async (ref, index) => ({
    filename: imageFilenames[index],
    bytes: await downloadChatGptImage(ref.download_link),
  })));
  return { expectedCommit: parsed.data.expectedCommit, rationale: parsed.data.rationale, edits: parsed.data.edits, images };
}
