import { NextRequest, NextResponse } from "next/server";
import { sweepDeployTrigger } from "@/lib/content-store";

// Durable backstop for the coze_client deploy pipeline: if a save marked
// content dirty but its build never fired (crashed function, lost trailing
// re-fire, raced debounce), this sweep fires the catch-up build. No-op when
// content is clean, so it costs nothing between edits.
// No longer on a schedule (the vercel.json cron was removed — the Hobby
// plan only allows daily crons). Call it manually if the site looks stale:
//   curl -H "Authorization: Bearer $CRON_SECRET" <base-url>/api/cron/deploy-sweep
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepDeployTrigger();
  return NextResponse.json({ status: "success", result });
}
