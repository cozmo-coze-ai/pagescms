import { z } from "zod";
import { readJson, requireGptAction, resolveGptActor } from "@/lib/gpt-action-auth";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { undoHomepageChange } from "@/lib/homepage-changes";

const requestSchema = z.object({
  rationale: z.string().trim().min(3).max(1000),
  // Set only after the user explicitly confirmed the undo.
  confirmedByUser: z.literal(true, { errorMap: () => ({ message: "Ask the user to confirm the undo first, then send confirmedByUser: true." }) }),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireGptAction(request, "homepage");
  if (denied) return denied;
  try {
    const parsed = requestSchema.safeParse(await readJson(request, 10_000));
    if (!parsed.success) throw createHttpError(parsed.error.issues.map((issue) => issue.message).join("; "), 400);
    const { id } = await context.params;
    const actor = await resolveGptActor(request);
    const result = await undoHomepageChange({ id, rationale: parsed.data.rationale, author: actor.author, actorId: actor.actorId });
    return Response.json({ ...result, next: "Poll getHomepageChange with the new changeId until build.state is live." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
