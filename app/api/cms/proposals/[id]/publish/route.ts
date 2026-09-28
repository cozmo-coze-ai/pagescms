import { requireAdminSession } from "@/lib/admin";
import { publishProposal } from "@/lib/proposal-store";
import { toErrorResponse } from "@/lib/api-error";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAdminSession();
    const { expectedVersion } = await request.json();
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      return Response.json({ error: "Expected version is required." }, { status: 400 });
    }
    const { id } = await context.params;
    return Response.json(await publishProposal(id, user.id, expectedVersion));
  } catch (error) {
    return toErrorResponse(error);
  }
}
