import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, EDITORIAL_MODEL, editorialSystemPrompt } from "./anthropic";
import { supabaseAdmin } from "./supabase";
import { EDITORIAL_SCHEMA, type EditorialDraft } from "./editorial-schema";

const MAX_FOLLOW_UP_ROUNDS = 2;

interface SubmissionRow {
  id: string;
  ref_id: string;
  headline: string;
  story: string;
  category: string;
  location: string;
  edition: string | null;
  evidence: string[];
  links: string | null;
  contacts: string | null;
  covered: string | null;
  submitter_name: string;
  submitter_email: string;
  relation: string | null;
  privacy: string;
  consent: boolean;
  status: string;
  triage_category: string | null;
}

interface FollowUpRow {
  round: number;
  questions: string[];
  response_text: string | null;
  status: string;
}

export interface RunResult {
  ref_id: string;
  outcome: "drafted" | "questions_recorded" | "stalled" | "skipped" | "error" | "declined";
  detail: string;
}

export type TriageCategory =
  | "decline_spam"
  | "decline_out_of_area"
  | "decline_not_news"
  | "decline_unverifiable_accusation"
  | "research_standard"
  | "research_high_risk";

interface TriageResult {
  category: TriageCategory;
  rationale: string;
  institutional_angle: string | null;
  risk_flags: string[];
}

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["category", "rationale", "institutional_angle", "risk_flags"],
  properties: {
    category: {
      type: "string",
      enum: [
        "decline_spam",
        "decline_out_of_area",
        "decline_not_news",
        "decline_unverifiable_accusation",
        "research_standard",
        "research_high_risk",
      ],
    },
    rationale: {
      type: "string",
      description: "1-3 sentences: why this category, per the triage criteria",
    },
    institutional_angle: {
      type: ["string", "null"],
      description:
        "The institution whose conduct could be examined (agency, business, public process), or null",
    },
    risk_flags: {
      type: "array",
      items: { type: "string" },
      description:
        "Short flags, e.g. names_private_individual, criminal_allegation, secondhand_source, social_media_claim",
    },
  },
} as const;

/** Process a single submission end-to-end: research → draft → branch. */
export async function processSubmission(submissionId: string): Promise<RunResult> {
  const db = supabaseAdmin();

  // 1. Claim the row (new submissions, or re-runs after a submitter reply).
  const { data: claimed, error: claimErr } = await db
    .from("submissions")
    .update({ status: "researching" })
    .eq("id", submissionId)
    .in("status", ["new", "researching"])
    .select()
    .single();

  if (claimErr || !claimed) {
    return { ref_id: submissionId, outcome: "skipped", detail: "already claimed or not found" };
  }
  const sub = claimed as SubmissionRow;

  // Prior follow-up rounds (for round counting + context on re-runs).
  const { data: priorFollowUps } = await db
    .from("follow_ups")
    .select("round, questions, response_text, status")
    .eq("submission_id", sub.id)
    .order("round", { ascending: true });
  const followUps = (priorFollowUps ?? []) as FollowUpRow[];
  const roundsUsed = followUps.length;
  // If a prior round was marked stalled (submitter didn't reply in time), force a draft.
  const stalled = followUps.some((f) => f.status === "stalled");

  try {
    // Triage once, on first contact. Declines end the pipeline here.
    let highRisk = sub.triage_category === "research_high_risk";
    if (!sub.triage_category) {
      const triage = await triagePhase(sub);
      await logRun(db, sub.id, "triage", triage.usage, "ok");
      await db
        .from("submissions")
        .update({
          triage_category: triage.result.category,
          triage_rationale: triage.result.rationale,
          triage_risk_flags: triage.result.risk_flags,
        })
        .eq("id", sub.id);
      if (triage.result.category.startsWith("decline_")) {
        await db.from("submissions").update({ status: "declined" }).eq("id", sub.id);
        return {
          ref_id: sub.ref_id,
          outcome: "declined",
          detail: `${triage.result.category}: ${triage.result.rationale}`,
        };
      }
      highRisk = triage.result.category === "research_high_risk";
    }

    const research = await researchPhase(sub, followUps, highRisk);
    await logRun(db, sub.id, "research", research.usage, "ok");

    const draft = await draftPhase(sub, followUps, research.memo, research.sources, stalled, highRisk);
    await logRun(db, sub.id, "draft", draft.usage, "ok");

    return await applyOutcome(db, sub, roundsUsed, draft.result, stalled);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logRun(db, sub.id, "draft", null, "error", message);
    // Return to the queue so a later run can retry.
    await db.from("submissions").update({ status: "new" }).eq("id", sub.id);
    return { ref_id: sub.ref_id, outcome: "error", detail: message };
  }
}

/** Process up to `limit` new submissions (the cron entry point). */
export async function processQueue(limit = 3): Promise<RunResult[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("submissions")
    .select("id")
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const results: RunResult[] = [];
  for (const row of data ?? []) {
    results.push(await processSubmission((row as { id: string }).id));
  }
  return results;
}

// ---------------------------------------------------------------------------

function submissionBrief(sub: SubmissionRow, followUps: FollowUpRow[]): string {
  const lines = [
    `Submitter's one-line headline: ${sub.headline}`,
    `Submitter's account: ${sub.story}`,
    `Category (submitter's pick): ${sub.category}`,
    `Location: ${sub.location}`,
    sub.edition ? `Closest Observer edition: ${sub.edition}` : "",
    `Evidence offered: ${sub.evidence.length ? sub.evidence.join(", ") : "none"}`,
    sub.links ? `Links provided: ${sub.links}` : "",
    sub.contacts ? `Suggested contacts: ${sub.contacts}` : "",
    sub.covered ? `Prior coverage (per submitter): ${sub.covered}` : "",
    sub.relation ? `How the submitter knows this: ${sub.relation}` : "",
    `Privacy preference: ${sub.privacy}`,
    `Consent to email follow-ups: ${sub.consent ? "yes" : "no"}`,
  ].filter(Boolean);

  for (const fu of followUps) {
    if (fu.response_text) {
      lines.push(
        `\nFollow-up round ${fu.round} questions:\n${fu.questions.map((q) => `- ${q}`).join("\n")}`,
        `Submitter's answers:\n${fu.response_text}`,
      );
    }
  }
  return lines.join("\n");
}

/** Cheap classification pass — no web search, small budget. */
async function triagePhase(
  sub: SubmissionRow,
): Promise<{ result: TriageResult; usage: UsageTotals }> {
  const client = anthropic();
  const response = await client.messages.create({
    model: EDITORIAL_MODEL,
    max_tokens: 1000,
    system: editorialSystemPrompt(),
    output_config: { format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `You are in the TRIAGE phase. Categorize this submission per the triage criteria in your instructions. Do not research it yet — judge eligibility only.\n\n--- SUBMISSION ---\n${submissionBrief(sub, [])}`,
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const usage: UsageTotals = { input: 0, output: 0 };
  addUsage(usage, response.usage);
  const result = JSON.parse(collectText(response.content).trim()) as TriageResult;
  return { result, usage };
}

const HIGH_RISK_NOTE =
  "\n\nTRIAGE FLAG — this submission is research_high_risk. Apply the high-risk rules: never name private individuals absent court records or official filings; examine the institutional angle; list the institution in suggested_third_party_outreach; keep secondhand/social-media claims [UNCONFIRMED]; lead your editor_notes with the risk.";

async function researchPhase(
  sub: SubmissionRow,
  followUps: FollowUpRow[],
  highRisk = false,
): Promise<{ memo: string; sources: { title: string; url: string }[]; usage: UsageTotals }> {
  const client = anthropic();
  const userPrompt = `You are in the RESEARCH phase for the following community submission. Use web_search to verify names, events, dates, numbers, quotes, and whether this is already widely covered. Produce a concise research memo: what you independently verified (with sources), what you could not verify, any contradictions, and whether mainstream outlets are already covering it. Do NOT write the article yet.${highRisk ? HIGH_RISK_NOTE : ""}\n\n--- SUBMISSION ---\n${submissionBrief(sub, followUps)}`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const usage: UsageTotals = { input: 0, output: 0 };

  let response = await client.messages.create({
    model: EDITORIAL_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: editorialSystemPrompt(),
    tools: [{ type: "web_search_20260209", name: "web_search" }],
    messages,
  });
  addUsage(usage, response.usage);

  let guard = 0;
  while (response.stop_reason === "pause_turn" && guard++ < 6) {
    messages.push({ role: "assistant", content: response.content });
    response = await client.messages.create({
      model: EDITORIAL_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: editorialSystemPrompt(),
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages,
    });
    addUsage(usage, response.usage);
  }
  messages.push({ role: "assistant", content: response.content });

  const memo = collectText(response.content);
  const sources = collectSources(messages);
  return { memo, sources, usage };
}

async function draftPhase(
  sub: SubmissionRow,
  followUps: FollowUpRow[],
  memo: string,
  sources: { title: string; url: string }[],
  stalled: boolean,
  highRisk = false,
): Promise<{ result: EditorialDraft; usage: UsageTotals }> {
  const client = anthropic();
  const sourceList = sources.length
    ? sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")
    : "(no external sources surfaced during research)";

  const canFollowUp = sub.consent && followUps.length < MAX_FOLLOW_UP_ROUNDS && !stalled;
  const budgetNote = stalled
    ? "The submitter did NOT respond to follow-up questions within 5 days. Set needs_follow_up=false, set status='stalled', and write the best draft you can from available information, flagging the unanswered gaps inline."
    : canFollowUp
      ? `available — round ${followUps.length + 1} of ${MAX_FOLLOW_UP_ROUNDS}. Set needs_follow_up=true with 3-5 questions only if they would materially improve accuracy.`
      : "exhausted or no consent — set needs_follow_up=false and write the best draft you can, flagging any gaps inline.";
  const userPrompt = `You are in the DRAFTING phase. Using the submission, any submitter answers, and the research memo below, produce your structured editorial output exactly per your instructions (inline markers, attributions, citations).${highRisk ? HIGH_RISK_NOTE : ""}\n\nFollow-up budget: ${budgetNote}\n\n--- SUBMISSION ---\n${submissionBrief(sub, followUps)}\n\n--- RESEARCH MEMO ---\n${memo}\n\n--- SOURCES SURFACED ---\n${sourceList}`;

  const response = await client.messages.create({
    model: EDITORIAL_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: editorialSystemPrompt(),
    output_config: {
      format: { type: "json_schema", schema: EDITORIAL_SCHEMA },
    },
    messages: [{ role: "user", content: userPrompt }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const usage: UsageTotals = { input: 0, output: 0 };
  addUsage(usage, response.usage);

  const jsonText = collectText(response.content).trim();
  const result = JSON.parse(jsonText) as EditorialDraft;
  return { result, usage };
}

async function applyOutcome(
  db: ReturnType<typeof supabaseAdmin>,
  sub: SubmissionRow,
  roundsUsed: number,
  draft: EditorialDraft,
  stalled: boolean,
): Promise<RunResult> {
  const wantsFollowUp =
    !stalled &&
    draft.needs_follow_up &&
    draft.follow_up_questions.length > 0 &&
    sub.consent &&
    roundsUsed < MAX_FOLLOW_UP_ROUNDS;

  if (wantsFollowUp) {
    const { data: fu } = await db
      .from("follow_ups")
      .insert({
        submission_id: sub.id,
        round: roundsUsed + 1,
        questions: draft.follow_up_questions,
        status: "sent",
      })
      .select("id")
      .single();
    await db.from("submissions").update({ status: "questions_sent" }).eq("id", sub.id);

    // Send the email if Gmail is configured; otherwise the questions are recorded
    // for the editor to send manually (or a later poll-email run picks them up).
    let sent = false;
    try {
      const { sendFollowUp } = await import("./gmail");
      sent = await sendFollowUp({
        followUpId: (fu as { id: string }).id,
        refId: sub.ref_id,
        to: sub.submitter_email,
        questions: draft.follow_up_questions,
      });
    } catch {
      /* email send is best-effort; questions remain recorded */
    }

    return {
      ref_id: sub.ref_id,
      outcome: "questions_recorded",
      detail: `${draft.follow_up_questions.length} question(s) for round ${roundsUsed + 1}${sent ? " · emailed" : " · not emailed (Gmail unconfigured)"}`,
    };
  }

  const nextVersion = roundsUsed + 1;
  await db.from("drafts").insert({
    submission_id: sub.id,
    version: nextVersion,
    status: draft.status,
    confidence_level: draft.confidence_level,
    headline: draft.headline,
    dek: draft.dek,
    body: draft.body,
    category: draft.category,
    tags: draft.tags,
    citations: draft.citations,
    follow_up_questions: draft.follow_up_questions,
    suggested_third_party_outreach: draft.suggested_third_party_outreach,
    editor_notes: draft.editor_notes,
    recommend_rejection: draft.recommend_rejection,
    rejection_rationale: draft.rejection_rationale,
    model: EDITORIAL_MODEL,
  });

  const subStatus = draft.status === "stalled" ? "stalled" : "drafted";
  await db.from("submissions").update({ status: subStatus }).eq("id", sub.id);

  return {
    ref_id: sub.ref_id,
    outcome: draft.status === "stalled" ? "stalled" : "drafted",
    detail: `confidence=${draft.confidence_level}${draft.recommend_rejection ? " · recommends rejection" : ""}`,
  };
}

// ---------------------------------------------------------------------------

interface UsageTotals {
  input: number;
  output: number;
}

function addUsage(totals: UsageTotals, usage: Anthropic.Usage | undefined) {
  if (!usage) return;
  totals.input += usage.input_tokens ?? 0;
  totals.output += usage.output_tokens ?? 0;
}

function collectText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function collectSources(messages: Anthropic.MessageParam[]): { title: string; url: string }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string }[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const block of m.content) {
      const b = block as { type?: string; content?: unknown };
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content as { url?: string; title?: string }[]) {
          if (r.url && !seen.has(r.url)) {
            seen.add(r.url);
            out.push({ title: r.title ?? r.url, url: r.url });
          }
        }
      }
    }
  }
  return out;
}

async function logRun(
  db: ReturnType<typeof supabaseAdmin>,
  submissionId: string,
  phase: "triage" | "research" | "draft",
  usage: UsageTotals | null,
  status: "ok" | "error",
  error?: string,
) {
  await db.from("agent_runs").insert({
    submission_id: submissionId,
    phase,
    model: EDITORIAL_MODEL,
    input_tokens: usage?.input ?? null,
    output_tokens: usage?.output ?? null,
    status,
    error: error ?? null,
  });
}
