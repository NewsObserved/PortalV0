import { google, type gmail_v1 } from "googleapis";
import { supabaseAdmin } from "./supabase";
import { processSubmission } from "./runner";

export function isGmailConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN &&
      process.env.EDITORIAL_EMAIL,
  );
}

function gmailClient(): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth });
}

function base64url(s: string): string {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildMessage(to: string, from: string, subject: string, body: string): string {
  const headers = [
    `From: News Observed Editorial <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
  ];
  return base64url(headers.join("\r\n") + "\r\n\r\n" + body);
}

interface ConfirmationEmail {
  submissionId: string;
  refId: string;
  to: string;
  name: string;
  headline: string;
}

/**
 * Send the submitter a receipt for their submission and stamp the row.
 * Returns false (no-op) if Gmail isn't configured.
 */
export async function sendSubmissionConfirmation(c: ConfirmationEmail): Promise<boolean> {
  if (!isGmailConfigured()) return false;
  const gmail = gmailClient();
  const from = process.env.EDITORIAL_EMAIL!;

  const firstName = c.name.split(/\s+/)[0] || "there";
  const body = [
    `Hi ${firstName},`,
    "",
    `We got your story: "${c.headline}"`,
    "",
    "Here's what happens next:",
    "",
    "1. Our newsroom digs in — we independently verify what we can.",
    "2. If we need details only you have, we'll email you a few short questions. Just reply to that email.",
    "3. A human editor reviews every draft before anything prints. Nothing publishes without that review.",
    "",
    "Your name stays private unless you've told us otherwise. There's nothing you need to do right now.",
    "",
    "Thank you for trusting News Observed with this.",
    "",
    "Warmly,",
    "Observed Editorial Team",
    "Observer Group Newspapers of Southern California",
    `(Reference: ${c.refId} — keep this for any questions about your submission)`,
  ].join("\n");

  const raw = buildMessage(c.to, from, `We received your story (${c.refId})`, body);
  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

  await supabaseAdmin()
    .from("submissions")
    .update({
      confirmation_sent_at: new Date().toISOString(),
      confirmation_message_id: res.data.id ?? null,
    })
    .eq("id", c.submissionId);
  return true;
}

/**
 * Send receipts for any submissions that haven't been confirmed yet.
 * Safe to call from any cron; returns the number of confirmations sent.
 */
export async function sendPendingConfirmations(limit = 20): Promise<number> {
  if (!isGmailConfigured()) return 0;
  const db = supabaseAdmin();
  const { data: pending } = await db
    .from("submissions")
    .select("id, ref_id, submitter_name, submitter_email, headline")
    .is("confirmation_sent_at", null)
    .not("submitter_email", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  let sent = 0;
  for (const sub of pending ?? []) {
    try {
      const ok = await sendSubmissionConfirmation({
        submissionId: sub.id,
        refId: sub.ref_id,
        to: sub.submitter_email,
        name: sub.submitter_name ?? "",
        headline: sub.headline,
      });
      if (ok) sent++;
    } catch {
      /* leave unstamped; next run retries */
    }
  }
  return sent;
}

interface FollowUpEmail {
  followUpId: string;
  refId: string;
  to: string;
  questions: string[];
}

/**
 * Send a round of follow-up questions to the submitter and stamp the follow_ups row
 * with the Gmail thread/message ids. Returns false (no-op) if Gmail isn't configured.
 */
export async function sendFollowUp(fu: FollowUpEmail): Promise<boolean> {
  if (!isGmailConfigured()) return false;
  const gmail = gmailClient();
  const from = process.env.EDITORIAL_EMAIL!;

  const body = [
    "Hi, and thank you for trusting News Observed with your story.",
    "",
    "A few specific questions would help us report it accurately:",
    "",
    ...fu.questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "Just reply to this email — a sentence or two each is plenty. Your name stays private unless you've told us otherwise.",
    "",
    "Warmly,",
    "Observed Editorial Team",
    `(Reference: ${fu.refId})`,
  ].join("\n");

  const raw = buildMessage(fu.to, from, `Your story to News Observed (${fu.refId})`, body);
  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

  await supabaseAdmin()
    .from("follow_ups")
    .update({
      gmail_thread_id: res.data.threadId ?? null,
      gmail_message_id: res.data.id ?? null,
      sent_at: new Date().toISOString(),
    })
    .eq("id", fu.followUpId);
  return true;
}

export interface GmailImage {
  data: Buffer;
  ext: string;
}

/** Collect image attachments from every message in a thread. */
export async function gmailAttachments(threadId: string, limit = 6): Promise<GmailImage[]> {
  if (!isGmailConfigured()) return [];
  const gmail = gmailClient();
  const thread = await gmail.users.threads.get({ userId: "me", id: threadId });

  const out: GmailImage[] = [];
  const walk = (part: gmail_v1.Schema$MessagePart | undefined): gmail_v1.Schema$MessagePart[] =>
    !part ? [] : [part, ...(part.parts ?? []).flatMap(walk)];

  for (const message of thread.data.messages ?? []) {
    for (const part of walk(message.payload)) {
      if (out.length >= limit) return out;
      const mime = part.mimeType ?? "";
      const attachmentId = part.body?.attachmentId;
      if (!mime.startsWith("image/") || !attachmentId) continue;

      const att = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: message.id!,
        id: attachmentId,
      });
      if (!att.data.data) continue;
      out.push({
        data: Buffer.from(att.data.data, "base64url"),
        ext: mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg",
      });
    }
  }
  return out;
}

function extractPlainText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  for (const part of payload.parts ?? []) {
    const t = extractPlainText(part);
    if (t) return t;
  }
  return "";
}

/** Strip quoted reply history so only the submitter's new text is stored. */
function stripQuoted(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*On .* wrote:/.test(line) || /^\s*>/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Poll tracked threads for submitter replies. For each new reply, store it,
 * mark the follow-up responded, and re-run the agent (next round). Returns
 * the number of replies ingested.
 */
export async function pollReplies(): Promise<number> {
  if (!isGmailConfigured()) return 0;
  const gmail = gmailClient();
  const db = supabaseAdmin();
  const editorial = process.env.EDITORIAL_EMAIL!.toLowerCase();

  const { data: open } = await db
    .from("follow_ups")
    .select("id, submission_id, gmail_thread_id, sent_at")
    .eq("status", "sent")
    .not("gmail_thread_id", "is", null);

  let ingested = 0;
  for (const fu of open ?? []) {
    const thread = await gmail.users.threads.get({ userId: "me", id: fu.gmail_thread_id! });
    const sentAt = fu.sent_at ? new Date(fu.sent_at).getTime() : 0;

    const reply = (thread.data.messages ?? [])
      .filter((m) => {
        const fromHeader =
          m.payload?.headers?.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
        const isInbound = !fromHeader.toLowerCase().includes(editorial);
        const after = Number(m.internalDate ?? 0) > sentAt;
        return isInbound && after;
      })
      .sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0))[0];

    if (!reply) continue;

    const text = stripQuoted(extractPlainText(reply.payload));
    if (!text) continue;

    await db
      .from("follow_ups")
      .update({ response_text: text, responded_at: new Date().toISOString(), status: "responded" })
      .eq("id", fu.id);
    await db.from("submissions").update({ status: "researching" }).eq("id", fu.submission_id);
    await processSubmission(fu.submission_id);
    ingested++;
  }
  return ingested;
}
