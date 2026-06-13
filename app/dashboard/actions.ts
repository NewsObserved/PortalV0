"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

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

/** Approve a submission (ready for publishing). */
export async function approveSubmission(formData: FormData) {
  const submissionId = String(formData.get("submissionId"));
  const db = await supabaseServer();
  await db.from("submissions").update({ status: "approved" }).eq("id", submissionId);
  revalidatePath(`/dashboard/${submissionId}`);
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
