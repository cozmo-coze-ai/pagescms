import { requireApiUserSession } from "@/lib/session-server";
import { getProposal } from "@/lib/proposal-store";
import { toErrorResponse } from "@/lib/api-error";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiUserSession();
    if ("response" in session) return session.response;
    const { id } = await context.params;
    return Response.json(await getProposal(id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
