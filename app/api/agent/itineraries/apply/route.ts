import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { getItinerary } from "@/lib/content-store";
import { requireGptAction } from "@/lib/gpt-action-auth";
import { createProposal, proposalInput, publishProposal } from "@/lib/proposal-store";

const requestSchema = z.object({
  expectedUpdatedAt: z.string().datetime().nullable(),
  content: proposalInput.options[0].shape.content,
  rationale: z.string().trim().min(1).max(3000),
});

export async function POST(request: Request) {
  const denied = await requireGptAction(request);
  if (denied) return denied;
  try {
    // Never save content if the production rebuild path is not deliberately
    // configured for Cloudflare. The legacy hook may still point elsewhere.
    const hook = process.env.COZE_CLIENT_CLOUDFLARE_DEPLOY_HOOK_URL;
    if (!hook || !/^https:\/\/api\.cloudflare\.com\/client\/v4\/workers\/builds\/deploy_hooks\/[A-Za-z0-9_-]+$/.test(hook)) {
      throw createHttpError("Cloudflare deploy hook is not configured.", 503);
    }
    const actorEmail = process.env.COZE_GPT_ACTION_ACTOR_EMAIL?.trim().toLowerCase();
    if (!actorEmail) throw createHttpError("GPT Action editor identity is not configured.", 503);
    const [actor] = await db.select({ id: userTable.id }).from(userTable)
      .where(eq(userTable.email, actorEmail)).limit(1);
    if (!actor) throw createHttpError("GPT Action editor identity was not found in CMS.", 503);

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) throw createHttpError(parsed.error.issues.map((issue) => issue.message).join("; "), 400);
    const current = await getItinerary(parsed.data.content.slug);
    if ((current?.row.updatedAt.toISOString() ?? null) !== parsed.data.expectedUpdatedAt) {
      throw createHttpError("The itinerary changed. Read the latest version before applying an edit.", 409);
    }
    const proposal = await createProposal({
      kind: "itinerary", content: parsed.data.content, rationale: parsed.data.rationale,
    }, `ChatGPT (${actorEmail})`);
    const applied = await publishProposal(proposal.id, actor.id, 1);
    return Response.json({
      changeId: applied.id,
      status: "saved",
      version: 1,
      itinerary: applied.target,
      deployment: "requested; verify Cloudflare build and public site before claiming live",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
