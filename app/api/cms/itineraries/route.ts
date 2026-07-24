import { requireApiUserSession, requireApiWriteAccess } from "@/lib/session-server";
import { listItineraries, createItinerary } from "@/lib/content-store";
import { toErrorResponse } from "@/lib/api-error";

/**
 * GET  /api/cms/itineraries — list all itineraries (summary fields only)
 * POST /api/cms/itineraries — create a new itinerary
 *
 * Requires authentication. Supabase-backed replacement for the old
 * GitHub-era `collections/[name]` (GET) and `entries|files/[path]` (POST) routes.
 */

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const items = await listItineraries();
    return Response.json({ status: "success", data: items });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const sessionResult = await requireApiWriteAccess();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const body = await request.json();
    const { row, contentObject } = await createItinerary(body.content ?? {}, user.id);
    return Response.json({ status: "success", data: { slug: row.slug, contentObject } }, { status: 201 });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
