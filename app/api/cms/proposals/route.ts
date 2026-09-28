import { requireApiUserSession } from "@/lib/session-server";
import { listProposals } from "@/lib/proposal-store";
import { toErrorResponse } from "@/lib/api-error";

export async function GET() {
  try {
    const session = await requireApiUserSession();
    if ("response" in session) return session.response;
    return Response.json({ items: await listProposals() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
