import { requireAdminPanel, revokeGptKey } from "@/lib/gpt-action-auth";
import { toErrorResponse } from "@/lib/api-error";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireAdminPanel(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    return Response.json({ revoked: await revokeGptKey(id) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
