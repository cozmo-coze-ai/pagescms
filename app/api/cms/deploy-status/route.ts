import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cmsDeployTriggerTable } from "@/db/schema";
import { requireApiUserSession } from "@/lib/session-server";
import { toErrorResponse } from "@/lib/api-error";

/**
 * GET /api/cms/deploy-status — raw deploy-pipeline timestamps for the
 * status widget (components/cms/deploy-status.tsx). The client derives the
 * phase (queued / building / up to date) from these plus its own clock:
 * - dirtyAt > triggeredAt  -> a save is waiting for its build ("queued")
 * - triggeredAt recent     -> Vercel is building ("building", estimated)
 * - otherwise              -> up to date
 */
export async function GET() {
  try {
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;

    const row = (
      await db
        .select({
          dirtyAt: cmsDeployTriggerTable.dirtyAt,
          triggeredAt: cmsDeployTriggerTable.triggeredAt,
        })
        .from(cmsDeployTriggerTable)
        .where(eq(cmsDeployTriggerTable.id, 1))
        .limit(1)
    )[0];

    return Response.json({
      status: "success",
      data: {
        dirtyAt: row?.dirtyAt?.toISOString() ?? null,
        triggeredAt: row?.triggeredAt?.toISOString() ?? null,
        serverNow: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
