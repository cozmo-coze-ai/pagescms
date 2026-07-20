import { requireApiUserSession } from "@/lib/session-server";
import { listGuestPages, listLanguages } from "@/lib/guest-page-store";
import { toErrorResponse } from "@/lib/api-error";

/**
 * GET /api/cms/guest-pages — the "Site pages" index: every editable guest
 * page with its per-language rows (incl. machine-translated flags), plus the
 * enabled language list that drives the editor's language switcher.
 */

export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const [pages, languages] = await Promise.all([listGuestPages(), listLanguages()]);
    return Response.json({ status: "success", data: { pages, languages } });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
