import { requireApiUserSession } from "@/lib/session-server";
import { getHomepage, saveHomepage } from "@/lib/content-store";
import { toErrorResponse } from "@/lib/api-error";

/**
 * GET /api/cms/homepage — fetch the singleton homepage content
 * PUT /api/cms/homepage — save it
 */

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const contentObject = await getHomepage();
    return Response.json({ status: "success", data: { contentObject } });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const body = await request.json();
    const contentObject = await saveHomepage(body.content ?? {}, user.id);
    return Response.json({ status: "success", data: { contentObject } });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
