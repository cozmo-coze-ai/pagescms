import { requireGptAction } from "@/lib/gpt-action-auth";
import { listItineraries } from "@/lib/content-store";
import { toErrorResponse } from "@/lib/api-error";

export async function GET(request: Request) {
  const denied = await requireGptAction(request);
  if (denied) return denied;
  try {
    return Response.json({ items: await listItineraries() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
