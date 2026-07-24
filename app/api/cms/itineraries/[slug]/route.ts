import { requireApiUserSession, requireApiWriteAccess } from "@/lib/session-server";
import { getItinerary, saveItinerary, deleteItinerary } from "@/lib/content-store";
import { createHttpError, toErrorResponse } from "@/lib/api-error";

/**
 * GET    /api/cms/itineraries/[slug] — fetch one itinerary for editing
 * PUT    /api/cms/itineraries/[slug] — save changes (slug itself is immutable here, see rename/route.ts)
 * DELETE /api/cms/itineraries/[slug] — delete
 */

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const { slug } = await context.params;
    const result = await getItinerary(slug);
    if (!result) throw createHttpError(`Itinerary "${slug}" not found.`, 404);

    return Response.json({
      status: "success",
      data: { slug: result.row.slug, updatedAt: result.row.updatedAt, contentObject: result.contentObject },
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const sessionResult = await requireApiWriteAccess();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { slug } = await context.params;
    const body = await request.json();
    const { row, contentObject } = await saveItinerary(slug, body.content ?? {}, user.id);

    return Response.json({
      status: "success",
      data: { slug: row.slug, updatedAt: row.updatedAt, contentObject },
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const sessionResult = await requireApiWriteAccess();
    if ("response" in sessionResult) return sessionResult.response;

    const { slug } = await context.params;
    await deleteItinerary(slug);

    return Response.json({ status: "success", data: { slug } });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
