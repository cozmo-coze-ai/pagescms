import { requireGptAction } from "@/lib/gpt-action-auth";
import { toErrorResponse } from "@/lib/api-error";
import { getHomepageChange } from "@/lib/homepage-changes";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireGptAction(request, "homepage");
  if (denied) return denied;
  try {
    const { id } = await context.params;
    return Response.json(await getHomepageChange(id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
