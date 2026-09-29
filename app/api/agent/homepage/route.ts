import { requireGptAction } from "@/lib/gpt-action-auth";
import { toErrorResponse } from "@/lib/api-error";
import { getHomepageSnapshot } from "@/lib/homepage-read";

// Start here: the commit to base a change on, what can be edited, and the rules.
export async function GET(request: Request) {
  const denied = await requireGptAction(request, "homepage");
  if (denied) return denied;
  try {
    return Response.json(await getHomepageSnapshot());
  } catch (error) {
    return toErrorResponse(error);
  }
}
