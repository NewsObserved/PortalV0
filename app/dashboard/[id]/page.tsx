import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { approveSubmission, rejectSubmission, saveDraft } from "../actions";

export const dynamic = "force-dynamic";

const MARKER_COLORS: Record<string, string> = {
  CONFIRMED: "#4caf50",
  SUBMITTER: "#f5c543",
  UNCONFIRMED: "#9e1b15",
  CONTRADICTED: "#e0261c",
  OPEN: "#8ea4e8",
};

/** Render draft body with inline verification markers colour-coded. */
function renderBody(body: string) {
  const parts = body.split(/(\[(?:CONFIRMED|SUBMITTER|UNCONFIRMED|CONTRADICTED|OPEN)[^\]]*\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(CONFIRMED|SUBMITTER|UNCONFIRMED|CONTRADICTED|OPEN)/);
    if (m) {
      return (
        <span
          key={i}
          style={{
            color: MARKER_COLORS[m[1]],
            fontWeight: 700,
            fontSize: ".82em",
            whiteSpace: "nowrap",
          }}
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const label = { fontSize: ".66rem", fontWeight: 800, letterSpacing: ".2em", textTransform: "uppercase", color: "#8ea4e8", marginBottom: 8 } as const;
const card = { background: "#1d1a12", border: "1px solid #33302a", borderRadius: 12, padding: "18px 20px", marginBottom: 16 } as const;
const input = { width: "100%", padding: "12px 14px", fontSize: "1rem", borderRadius: 10, border: "2px solid #33302a", background: "#121009", color: "#f5f1e6", fontFamily: "inherit" } as const;

interface Citation { claim: string; source_url: string; source_name: string }
interface Outreach { party: string; rationale: string }

export default async function SubmissionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();

  const { data: sub } = await db.from("submissions").select("*").eq("id", id).single();
  if (!sub) notFound();

  const { data: drafts } = await db
    .from("drafts")
    .select("*")
    .eq("submission_id", id)
    .order("version", { ascending: false });
  const draft = drafts?.[0] ?? null;

  const { data: followUps } = await db
    .from("follow_ups")
    .select("*")
    .eq("submission_id", id)
    .order("round", { ascending: true });

  const privacyNote =
    sub.privacy === "anon"
      ? "ANONYMOUS — never print the submitter's name or identifying details."
      : sub.privacy === "ask"
        ? "ASK FIRST — confirm with the submitter before identifying them."
        : "Named — submitter is OK being identified as a source.";

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 96px" }}>
      <Link href="/dashboard" style={{ color: "#8ea4e8", textDecoration: "none", fontSize: ".85rem" }}>
        ← Desk
      </Link>

      <div style={{ display: "flex", gap: 10, alignItems: "baseline", margin: "12px 0 4px" }}>
        <code style={{ color: "#8ea4e8" }}>{sub.ref_id}</code>
        <span style={{ fontSize: ".78rem", color: "#9a958a" }}>· {sub.status}</span>
      </div>

      {draft?.recommend_rejection && (
        <div style={{ ...card, borderColor: "#9e1b15", background: "#2a1310" }}>
          <div style={{ ...label, color: "#e0261c" }}>⚑ Agent recommends rejection</div>
          <p style={{ margin: 0 }}>{draft.rejection_rationale}</p>
        </div>
      )}

      {/* Original submission */}
      <div style={card}>
        <div style={label}>The submission</div>
        <p style={{ fontFamily: "Georgia, serif", fontSize: "1.2rem", fontWeight: 700, marginTop: 0 }}>
          {sub.headline}
        </p>
        <p style={{ color: "#cfc9b8", whiteSpace: "pre-wrap" }}>{sub.story}</p>
        <p style={{ fontSize: ".82rem", color: "#9a958a" }}>
          {sub.category} · {sub.location}
          {sub.edition ? ` · ${sub.edition}` : ""} · evidence: {sub.evidence?.join(", ") || "none"}
          {sub.links ? ` · links: ${sub.links}` : ""}
        </p>
        <p style={{ fontSize: ".82rem", color: "#f5c543", marginBottom: 0 }}>
          Source protection: {privacyNote}
        </p>
        <p style={{ fontSize: ".78rem", color: "#6b675c", marginBottom: 0 }}>
          {sub.submitter_name} · {sub.submitter_email}
          {sub.submitter_phone ? ` · ${sub.submitter_phone}` : ""} · relation: {sub.relation || "—"}
        </p>
      </div>

      {/* Follow-up Q&A */}
      {(followUps?.length ?? 0) > 0 && (
        <div style={card}>
          <div style={label}>Submitter follow-ups</div>
          {followUps!.map((fu) => (
            <div key={fu.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: ".78rem", color: "#9a958a" }}>Round {fu.round}</div>
              <ul style={{ margin: "4px 0" }}>
                {(fu.questions as string[]).map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              <p style={{ margin: 0, color: fu.response_text ? "#cfc9b8" : "#6b675c" }}>
                {fu.response_text ? fu.response_text : "(awaiting reply)"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* The draft */}
      {draft ? (
        <>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={label}>AI draft · v{draft.version}</div>
              <span style={{ fontSize: ".75rem", color: "#9a958a" }}>
                confidence: {draft.confidence_level} · {draft.category}
              </span>
            </div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "1.35rem", fontWeight: 700, margin: "4px 0" }}>
              {draft.headline}
            </p>
            <p style={{ fontStyle: "italic", color: "#cfc9b8" }}>{draft.dek}</p>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{renderBody(draft.body ?? "")}</div>
            {(draft.tags?.length ?? 0) > 0 && (
              <p style={{ fontSize: ".78rem", color: "#9a958a", marginBottom: 0 }}>
                tags: {draft.tags.join(", ")}
              </p>
            )}
          </div>

          {/* Citations */}
          {(draft.citations as Citation[])?.length > 0 && (
            <div style={card}>
              <div style={label}>Citations</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {(draft.citations as Citation[]).map((c, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    <a href={c.source_url} target="_blank" rel="noreferrer" style={{ color: "#8ea4e8" }}>
                      {c.source_name}
                    </a>
                    <span style={{ color: "#9a958a" }}> — {c.claim}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Suggested outreach */}
          {(draft.suggested_third_party_outreach as Outreach[])?.length > 0 && (
            <div style={card}>
              <div style={label}>Suggested third-party outreach (editor does this)</div>
              <ul style={{ margin: 0 }}>
                {(draft.suggested_third_party_outreach as Outreach[]).map((o, i) => (
                  <li key={i}>
                    <b>{o.party}</b> — {o.rationale}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {draft.editor_notes && (
            <div style={card}>
              <div style={label}>Agent notes to editor</div>
              <p style={{ margin: 0, color: "#cfc9b8" }}>{draft.editor_notes}</p>
            </div>
          )}

          {/* Edit form */}
          <form action={saveDraft} style={card}>
            <div style={label}>Edit draft</div>
            <input type="hidden" name="draftId" value={draft.id} />
            <input type="hidden" name="submissionId" value={sub.id} />
            <input name="headline" defaultValue={draft.headline ?? ""} style={{ ...input, marginBottom: 8 }} />
            <input name="dek" defaultValue={draft.dek ?? ""} style={{ ...input, marginBottom: 8 }} />
            <textarea name="body" defaultValue={draft.body ?? ""} rows={12} style={{ ...input, marginBottom: 8 }} />
            <textarea name="editor_notes" defaultValue={draft.editor_notes ?? ""} rows={2} placeholder="Editor notes" style={{ ...input, marginBottom: 12 }} />
            <button type="submit" style={{ padding: "12px 24px", fontWeight: 700, background: "#2b418f", color: "#f5f1e6", border: "none", borderRadius: 999, cursor: "pointer" }}>
              Save edits
            </button>
          </form>

          {/* Approve / reject */}
          <div style={{ display: "flex", gap: 12 }}>
            <form action={approveSubmission}>
              <input type="hidden" name="submissionId" value={sub.id} />
              <button type="submit" style={{ padding: "14px 28px", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", background: "#4caf50", color: "#0d1a0d", border: "none", borderRadius: 999, cursor: "pointer" }}>
                Approve
              </button>
            </form>
            <form action={rejectSubmission}>
              <input type="hidden" name="submissionId" value={sub.id} />
              <button type="submit" style={{ padding: "14px 28px", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", background: "none", border: "2px solid #9e1b15", color: "#e0261c", borderRadius: 999, cursor: "pointer" }}>
                Reject
              </button>
            </form>
          </div>
          <p style={{ fontSize: ".78rem", color: "#6b675c", marginTop: 12 }}>
            Publishing to ognsc.com is wired in Phase 5. Approve to mark ready.
          </p>
        </>
      ) : (
        <div style={card}>
          <p style={{ color: "#9a958a", margin: 0 }}>
            No draft yet — this submission is <b>{sub.status}</b>. Run the agent to research and draft it.
          </p>
        </div>
      )}
    </main>
  );
}
