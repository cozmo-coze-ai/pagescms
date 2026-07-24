import { requireApiWriteAccess } from "@/lib/session-server";
import { renameItinerary } from "@/lib/content-store";
import { createHttpError, toErrorResponse } from "@/lib/api-error";

/**
 * POST /api/cms/itineraries/[slug]/rename — change an itinerary's slug.
 *
 * Kept separate from the plain save (PUT .../[slug]) since a slug change
 * breaks the itinerary's published URL — a distinct, deliberate operation.
 */

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const sessionResult = await requireApiWriteAccess();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { slug } = await context.params;
    const body = await request.json();
    const newSlug = typeof body.newSlug === "string" ? body.newSlug.trim() : "";
    if (!newSlug) throw createHttpError("newSlug is required.", 400);

    const row = await renameItinerary(slug, newSlug, user.id);
    return Response.json({ status: "success", data: { slug: row.slug } });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
