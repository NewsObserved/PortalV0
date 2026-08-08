import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const STATUS_GROUPS: { key: string; label: string; color: string }[] = [
  { key: "drafted", label: "Ready for review", color: "#f5c543" },
  { key: "questions_sent", label: "Awaiting submitter reply", color: "#8ea4e8" },
  { key: "researching", label: "In research", color: "#9a958a" },
  { key: "new", label: "New / queued", color: "#9a958a" },
  { key: "stalled", label: "Stalled", color: "#9e1b15" },
  { key: "approved", label: "Approved", color: "#4caf50" },
  { key: "published", label: "Published", color: "#4caf50" },
  { key: "rejected", label: "Rejected", color: "#6b675c" },
  { key: "declined", label: "Declined by agent", color: "#6b675c" },
];

interface Sub {
  id: string;
  ref_id: string;
  headline: string;
  location: string;
  status: string;
  privacy: string;
  created_at: string;
  triage_category: string | null;
}
interface Draft {
  submission_id: string;
  confidence_level: string | null;
  recommend_rejection: boolean;
}

export default async function Dashboard() {
  const db = await supabaseServer();
  const { data: subs, error: subsError } = await db
    .from("submissions")
    .select("id, ref_id, headline, location, status, privacy, created_at, triage_category")
    .order("created_at", { ascending: false });
  const { data: drafts } = await db
    .from("drafts")
    .select("submission_id, confidence_level, recommend_rejection");

  const draftBySub = new Map<string, Draft>();
  for (const d of (drafts ?? []) as Draft[]) draftBySub.set(d.submission_id, d);

  const bucket = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) {
    const arr = bucket.get(s.status) ?? [];
    arr.push(s);
    bucket.set(s.status, arr);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px 80px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.9rem" }}>
          Editorial Desk
        </h1>
        <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
          <Link href="/dashboard/videos" style={{ color: "#8ea4e8", fontSize: ".85rem" }}>
            Videos →
          </Link>
          <span style={{ fontSize: ".8rem", color: "#9a958a" }}>
            {subs?.length ?? 0} submissions
          </span>
        </div>
      </div>

      {subsError && (
        <div
          style={{
            padding: "14px 16px",
            background: "#2a1310",
            border: "1px solid #9e1b15",
            borderRadius: 12,
            color: "#f5f1e6",
            marginTop: 16,
          }}
        >
          <b style={{ color: "#e0261c" }}>Couldn&apos;t load submissions:</b>{" "}
          {subsError.message}
          {subsError.message.includes("does not exist") && (
            <div style={{ fontSize: ".85rem", color: "#9a958a", marginTop: 6 }}>
              If a schema change was just applied, run{" "}
              <code>NOTIFY pgrst, &apos;reload schema&apos;;</code> in the Supabase SQL
              editor to refresh the API&apos;s schema cache.
            </div>
          )}
        </div>
      )}

      {STATUS_GROUPS.map((g) => {
        const items = bucket.get(g.key) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={g.key} style={{ marginTop: 32 }}>
            <h2
              style={{
                fontSize: ".72rem",
                fontWeight: 800,
                letterSpacing: ".18em",
                textTransform: "uppercase",
                color: g.color,
                marginBottom: 12,
              }}
            >
              {g.label} · {items.length}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((s) => {
                const d = draftBySub.get(s.id);
                return (
                  <Link
                    key={s.id}
                    href={`/dashboard/${s.id}`}
                    style={{
                      display: "block",
                      padding: "14px 16px",
                      background: "#1d1a12",
                      border: "1px solid #33302a",
                      borderRadius: 12,
                      textDecoration: "none",
                      color: "#f5f1e6",
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <code style={{ color: "#8ea4e8", fontSize: ".75rem" }}>
                        {s.ref_id}
                      </code>
                      <span style={{ fontWeight: 600 }}>{s.headline}</span>
                    </div>
                    <div style={{ fontSize: ".78rem", color: "#9a958a", marginTop: 4 }}>
                      {s.location} · {s.privacy}
                      {d?.confidence_level ? ` · confidence: ${d.confidence_level}` : ""}
                      {d?.recommend_rejection ? " · ⚑ recommends rejection" : ""}
                      {s.triage_category === "research_high_risk" && (
                        <span style={{ color: "#e0261c", fontWeight: 700 }}> · ⚠ high risk</span>
                      )}
                      {s.triage_category?.startsWith("decline_") && (
                        <span> · {s.triage_category.replace("decline_", "").replace(/_/g, " ")}</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
