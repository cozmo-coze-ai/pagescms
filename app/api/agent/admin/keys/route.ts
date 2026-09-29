import { z } from "zod/v3";
import { createGptKey, listGptKeys, readJson, requireAdminPanel } from "@/lib/gpt-action-auth";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { setupKit } from "@/lib/gpt-setup-kit";

// Key management for admin.coze.care (server-to-server, COZE_ADMIN_PANEL_SECRET).
// Lives under /api/agent/ because those routes authenticate with bearer
// secrets instead of the CMS's same-origin browser check.

export async function GET(request: Request) {
  const denied = requireAdminPanel(request);
  if (denied) return denied;
  try {
    return Response.json({ keys: await listGptKeys(), kit: setupKit() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const createSchema = z.object({
  label: z.string().trim().min(2).max(80),
  createdBy: z.string().trim().min(3).max(200),
}).strict();

export async function POST(request: Request) {
  const denied = requireAdminPanel(request);
  if (denied) return denied;
  try {
    const parsed = createSchema.safeParse(await readJson(request, 5_000));
    if (!parsed.success) throw createHttpError("Give the person's name (2–80 characters).", 400);
    const created = await createGptKey(parsed.data.label, parsed.data.createdBy);
    return Response.json({ ...created, kit: setupKit() }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
