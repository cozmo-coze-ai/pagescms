import { NextRequest, NextResponse } from "next/server";
import { sweepDeployTrigger } from "@/lib/content-store";

// Durable backstop for the coze_client deploy pipeline: if a save marked
// content dirty but its build never fired (crashed function, lost trailing
// re-fire, raced debounce), this sweep fires the catch-up build. No-op when
// content is clean, so it starts no builds between edits.
// Cloudflare invokes it every minute via cloudflare/worker.ts. An authenticated
// manual call is also available if the site looks stale:
//   curl -H "Authorization: Bearer $CRON_SECRET" <base-url>/api/cron/deploy-sweep
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  if (process.env.CMS_READ_ONLY === "true") {
    return NextResponse.json({ status: "success", result: "disabled" });
  }
  const result = await sweepDeployTrigger();
  return NextResponse.json({ status: "success", result });
}
