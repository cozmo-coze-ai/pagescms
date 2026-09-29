import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cmsDeployTriggerTable } from "@/db/schema";
import { requireApiUserSession } from "@/lib/session-server";
import { toErrorResponse } from "@/lib/api-error";
import { getCozeClientDeploymentState } from "@/lib/cloudflare-deploy-status";

/**
 * GET /api/cms/deploy-status — deploy-pipeline state for the status widget
 * (components/cms/deploy-status.tsx):
 * - dirtyAt/triggeredAt: our own debounce bookkeeping (dirtyAt > triggeredAt
 *   means a save has not asked Cloudflare to build yet).
 * - deployment: the actual production coze_client build from Cloudflare.
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

    const deployment = row?.triggeredAt
      ? await getCozeClientDeploymentState(row.triggeredAt)
      : null;

    return Response.json({
      status: "success",
      data: {
        dirtyAt: row?.dirtyAt?.toISOString() ?? null,
        triggeredAt: row?.triggeredAt?.toISOString() ?? null,
        serverNow: new Date().toISOString(),
        deployment,
      },
    });
  } catch (error) {
    console.error(error);
    return toErrorResponse(error);
  }
}
