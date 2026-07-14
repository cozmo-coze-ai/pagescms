import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// Keeps the Neon free-tier compute from autosuspending (5 min idle timeout),
// which otherwise adds a cold-wake tax to the first request after any gap.
// Scheduled via vercel.json crons; Vercel signs the request with CRON_SECRET.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  await db.execute(sql`SELECT 1`);

  return NextResponse.json({ status: "success" });
}
