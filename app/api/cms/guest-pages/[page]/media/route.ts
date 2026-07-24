import { requireApiWriteAccess } from "@/lib/session-server";
import { uploadPagesMedia } from "@/lib/guest-page-store";
import { createHttpError, toErrorResponse } from "@/lib/api-error";

/**
 * POST /api/cms/guest-pages/[page]/media — upload an image into the
 * pages-media bucket under this page's folder (multipart/form-data, field
 * "file"). Returns the bucket-relative key to store in the content plus the
 * public URL for immediate preview.
 */

export async function POST(request: Request, context: { params: Promise<{ page: string }> }) {
  try {
    const sessionResult = await requireApiWriteAccess();
    if ("response" in sessionResult) return sessionResult.response;

    const { page } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw createHttpError('Expected a "file" field.', 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const object = await uploadPagesMedia(page, file.name, buffer, file.type || undefined);

    return Response.json({ status: "success", data: object }, { status: 201 });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
