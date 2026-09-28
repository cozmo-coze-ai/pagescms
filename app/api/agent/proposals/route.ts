import { requireGptAction } from "@/lib/gpt-action-auth";
import { createProposal, listProposals } from "@/lib/proposal-store";
import { toErrorResponse } from "@/lib/api-error";

export async function GET(request: Request) {
  const denied = await requireGptAction(request);
  if (denied) return denied;
  try {
    return Response.json({ items: await listProposals() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const denied = await requireGptAction(request);
  if (denied) return denied;
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 150_000) return Response.json({ error: "Proposal too large." }, { status: 413 });
    const result = await createProposal(await request.json(), "ChatGPT");
    return Response.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
