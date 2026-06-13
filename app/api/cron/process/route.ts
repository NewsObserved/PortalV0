import { NextResponse, type NextRequest } from "next/server";
import { processQueue } from "@/lib/runner";
import { checkCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/** Process new submissions: research + draft. Vercel Cron + manual trigger. */
export async function GET(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;
  try {
    const results = await processQueue(3);
    return NextResponse.json({ processed: results.length, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
