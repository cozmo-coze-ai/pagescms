import { requireGptAction } from "@/lib/gpt-action-auth";
import { addProposalVersion, getProposal } from "@/lib/proposal-store";
import { toErrorResponse } from "@/lib/api-error";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const denied = await requireGptAction(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    return Response.json(await getProposal(id));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  const denied = await requireGptAction(request);
  if (denied) return denied;
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 150_000) return Response.json({ error: "Proposal too large." }, { status: 413 });
    const { id } = await context.params;
    return Response.json(await addProposalVersion(id, await request.json(), "ChatGPT"));
  } catch (error) {
    return toErrorResponse(error);
  }
}
