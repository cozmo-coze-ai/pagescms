import { requireGptAction } from "@/lib/gpt-action-auth";
import { getItinerary } from "@/lib/content-store";
import { toErrorResponse } from "@/lib/api-error";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const denied = await requireGptAction(request);
  if (denied) return denied;
  try {
    const { slug } = await context.params;
    const item = await getItinerary(slug);
    if (!item) return Response.json({ error: "Itinerary not found." }, { status: 404 });
    return Response.json({ slug, updatedAt: item.row.updatedAt, content: item.contentObject });
  } catch (error) {
    return toErrorResponse(error);
  }
}
