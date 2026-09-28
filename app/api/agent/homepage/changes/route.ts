import { requireGptAction, resolveGptActor } from "@/lib/gpt-action-auth";
import { toErrorResponse } from "@/lib/api-error";
import { applyHomepageChange, listHomepageChanges } from "@/lib/homepage-changes";
import { parseHomepageChange } from "@/lib/homepage-request";

export async function GET(request: Request) {
  const denied = await requireGptAction(request, "homepage");
  if (denied) return denied;
  try {
    return Response.json({ items: await listHomepageChanges() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// Deploy a change the designer confirmed: one commit on the production branch,
// which Cloudflare builds and deploys automatically.
export async function POST(request: Request) {
  const denied = await requireGptAction(request, "homepage");
  if (denied) return denied;
  try {
    const input = await parseHomepageChange(request, { requireConfirmation: true });
    const actor = await resolveGptActor(request);
    const result = await applyHomepageChange({ ...input, author: actor.author, actorId: actor.actorId });
    return Response.json({ ...result, next: "Deploying. Poll getHomepageChange until build.state is live (or failed). Do not call it live before then." }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
