import { NextResponse, type NextRequest } from "next/server";
import { processQueue } from "@/lib/runner";
import { sendPendingConfirmations } from "@/lib/gmail";
import { checkCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/** Process new submissions: research + draft. Vercel Cron + manual trigger. */
export async function GET(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;
  try {
    // Receipts go out before processing so submitters hear from us even if
    // the agent errors or the queue is longer than this run's batch.
    let confirmations = 0;
    try {
      confirmations = await sendPendingConfirmations();
    } catch {
      /* best-effort; unstamped rows retry next run */
    }
    const results = await processQueue(3);
    return NextResponse.json({ confirmations, processed: results.length, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
