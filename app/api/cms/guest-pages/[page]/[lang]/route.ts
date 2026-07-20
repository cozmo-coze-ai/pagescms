import { requireApiUserSession } from "@/lib/session-server";
import { getGuestPage, saveGuestPage } from "@/lib/guest-page-store";
import { createHttpError, toErrorResponse } from "@/lib/api-error";

/**
 * GET /api/cms/guest-pages/[page]/[lang] — fetch one guest page's content in
 *     one language (plus the pages-media public base URL for image previews)
 * PUT /api/cms/guest-pages/[page]/[lang] — save it; the payload must match
 *     the stored shape exactly (see lib/guest-page-store.ts), and a human
 *     save clears the machine_translated flag.
 */

type Params = { params: Promise<{ page: string; lang: string }> };

export async function GET(_request: Request, context: Params) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const { page, lang } = await context.params;
    const result = await getGuestPage(page, lang);
    if (!result) throw createHttpError(`No content for "${page}" in "${lang}".`, 404);

    return Response.json({ status: "success", data: result });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request, context: Params) {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { page, lang } = await context.params;
    const body = await request.json();
    const result = await saveGuestPage(page, lang, body.fields ?? {}, user.id);

    return Response.json({ status: "success", data: result });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
