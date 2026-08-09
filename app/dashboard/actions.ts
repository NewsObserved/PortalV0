"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { publishDraft } from "@/lib/wordpress";

/** Save editor edits to a draft. */
export async function saveDraft(formData: FormData) {
  const draftId = String(formData.get("draftId"));
  const submissionId = String(formData.get("submissionId"));
  const db = await supabaseServer();
  await db
    .from("drafts")
    .update({
      headline: String(formData.get("headline") ?? ""),
      dek: String(formData.get("dek") ?? ""),
      body: String(formData.get("body") ?? ""),
      editor_notes: String(formData.get("editor_notes") ?? ""),
    })
    .eq("id", draftId);
  revalidatePath(`/dashboard/${submissionId}`);
}

/** Approve a submission (ready for publishing) and queue its video. */
export async function approveSubmission(formData: FormData) {
  const submissionId = String(formData.get("submissionId"));
  const db = await supabaseServer();
  await db.from("submissions").update({ status: "approved" }).eq("id", submissionId);

  // Queue the short automatically. Rendering needs a real machine (headless
  // Chrome + ffmpeg), so the worker picks this up — see scripts/video-worker.ts.
  const admin = supabaseAdmin();
  const { data: sub } = await admin
    .from("submissions")
    .select("ref_id")
    .eq("id", submissionId)
    .single();
  const { data: existing } = await admin
    .from("videos")
    .select("id")
    .eq("submission_id", submissionId)
    .limit(1);

  if (sub && !existing?.length) {
    await admin.from("videos").insert({
      submission_id: submissionId,
      ref_id: sub.ref_id,
      status: "rendering",
    });
  }

  revalidatePath(`/dashboard/${submissionId}`);
  revalidatePath("/dashboard/videos");
  revalidatePath("/dashboard");
}

/** Reject a submission. */
export async function rejectSubmission(formData: FormData) {
  const submissionId = String(formData.get("submissionId"));
  const db = await supabaseServer();
  await db.from("submissions").update({ status: "rejected" }).eq("id", submissionId);
  revalidatePath(`/dashboard/${submissionId}`);
  revalidatePath("/dashboard");
}

export interface PublishState {
  error?: string;
  url?: string;
}

/**
 * Publish the latest draft to the ognsc.com WordPress site (as a WP draft for
 * final human publish there). Records a publications row and marks the
 * submission published. useActionState-compatible so the editor sees the result.
 */
export async function publishSubmission(
  _prev: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const submissionId = String(formData.get("submissionId"));
  const session = await supabaseServer();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Read with the editor's RLS session; write the publications/status with admin.
  const { data: drafts } = await session
    .from("drafts")
    .select("*")
    .eq("submission_id", submissionId)
    .order("version", { ascending: false })
    .limit(1);
  const draft = drafts?.[0];
  if (!draft) return { error: "No draft to publish." };

  try {
    const result = await publishDraft({
      title: draft.headline ?? "",
      dek: draft.dek ?? "",
      body: draft.body ?? "",
      editorName: user.email ?? "Observed editor",
    });
    const admin = supabaseAdmin();
    await admin.from("publications").insert({
      submission_id: submissionId,
      draft_id: draft.id,
      wordpress_post_id: result.postId,
      wordpress_url: result.url,
      wp_status: result.status === "publish" ? "publish" : "draft",
      byline: `Reviewed and published by ${user.email ?? "Observed editor"}`,
      editor_name: user.email ?? null,
    });
    await admin.from("submissions").update({ status: "published" }).eq("id", submissionId);
    revalidatePath(`/dashboard/${submissionId}`);
    revalidatePath("/dashboard");
    return { url: result.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Record where a video was posted (or that we skipped it). */
export async function markVideoPosted(formData: FormData) {
  const videoId = String(formData.get("videoId"));
  const status = String(formData.get("status"));
  const stamp = new Date().toISOString();
  const patch: Record<string, string> = { status };
  if (status === "posted_tiktok" || status === "posted_all") patch.posted_tiktok_at = stamp;
  if (status === "posted_youtube" || status === "posted_all") patch.posted_youtube_at = stamp;

  const db = await supabaseServer();
  await db.from("videos").update(patch).eq("id", videoId);
  revalidatePath("/dashboard/videos");
}

/** Undo an approve/reject — puts the story back in review. */
export async function reopenSubmission(formData: FormData) {
  const submissionId = String(formData.get("submissionId"));
  const db = await supabaseServer();
  await db.from("submissions").update({ status: "drafted" }).eq("id", submissionId);
  revalidatePath(`/dashboard/${submissionId}`);
}
