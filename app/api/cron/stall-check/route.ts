import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { processSubmission } from "@/lib/runner";
import { checkCron } from "@/lib/cron-auth";

export const maxDuration = 300;

const STALL_DAYS = 5;

/**
 * Follow-ups with no reply after 5 days are marked stalled; the submission is
 * re-run to produce a best-effort draft from available info.
 */
export async function GET(request: NextRequest) {
  const denied = checkCron(request);
  if (denied) return denied;

  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - STALL_DAYS * 86400_000).toISOString();

  const { data: stale, error } = await db
    .from("follow_ups")
    .select("id, submission_id")
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .lt("sent_at", cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let stalledCount = 0;
  for (const fu of stale ?? []) {
    await db.from("follow_ups").update({ status: "stalled" }).eq("id", fu.id);
    await db.from("submissions").update({ status: "researching" }).eq("id", fu.submission_id);
    await processSubmission(fu.submission_id);
    stalledCount++;
  }
  return NextResponse.json({ stalled: stalledCount });
}
