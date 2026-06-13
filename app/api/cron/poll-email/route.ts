import { NextResponse, type NextRequest } from "next/server";
import { pollReplies, isGmailConfigured } from "@/lib/gmail";
import { checkCron } from "@/lib/cron-auth";

export const maxDuration = 300;

/** Ingest submitter email replies and re-run the agent for those submissions. */
export async function GET(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;
  if (!isGmailConfigured()) {
    return NextResponse.json({ skipped: "gmail not configured" });
  }
  try {
    const ingested = await pollReplies();
    return NextResponse.json({ ingested });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
