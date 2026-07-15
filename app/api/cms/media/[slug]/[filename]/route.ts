import { requireApiUserSession } from "@/lib/session-server";
import { deleteMedia } from "@/lib/media-store";
import { toErrorResponse } from "@/lib/api-error";

/**
 * DELETE /api/cms/media/[slug]/[filename] — remove a media object
 */

export async function DELETE(_request: Request, context: { params: Promise<{ slug: string; filename: string }> }) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const { slug, filename } = await context.params;
    await deleteMedia(slug, decodeURIComponent(filename));
    return Response.json({ status: "success", data: { slug, filename } });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
