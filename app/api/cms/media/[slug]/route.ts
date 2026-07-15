import { requireApiUserSession } from "@/lib/session-server";
import { listMedia, uploadMedia } from "@/lib/media-store";
import { createHttpError, toErrorResponse } from "@/lib/api-error";

/**
 * GET  /api/cms/media/[slug] — list media objects for an itinerary
 * POST /api/cms/media/[slug] — upload a new media object (multipart/form-data, field "file")
 */

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const { slug } = await context.params;
    const items = await listMedia(slug);
    return Response.json({ status: "success", data: items });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const { slug } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw createHttpError('Expected a "file" field.', 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const object = await uploadMedia(slug, file.name, buffer, file.type || undefined);

    return Response.json({ status: "success", data: object }, { status: 201 });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
