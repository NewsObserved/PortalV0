import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { markVideoPosted } from "../actions";
import CopyBox from "./CopyBox";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ready_to_post: { label: "Ready to post", color: "#f5c543" },
  posted_tiktok: { label: "Posted · TikTok", color: "#8ea4e8" },
  posted_youtube: { label: "Posted · YouTube", color: "#8ea4e8" },
  posted_all: { label: "Posted everywhere", color: "#4caf50" },
  rendering: { label: "Queued for rendering", color: "#f5c543" },
  skipped: { label: "Skipped", color: "#6b675c" },
};

const card = {
  background: "#1d1a12",
  border: "1px solid #33302a",
  borderRadius: 12,
  padding: "18px 20px",
  marginBottom: 20,
} as const;
const label = {
  fontSize: ".66rem",
  fontWeight: 800,
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "#8ea4e8",
  marginBottom: 8,
} as const;

interface VideoRow {
  id: string;
  ref_id: string;
  submission_id: string;
  tiktok_caption: string | null;
  youtube_title: string | null;
  youtube_description: string | null;
  duration_ms: number | null;
  status: string;
  created_at: string;
}

export default async function VideosPage() {
  const db = await supabaseServer();
  const { data: videos, error } = await db
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });

  // Signed URLs are minted server-side; the bucket stays private.
  const admin = supabaseAdmin();
  const urls = new Map<string, string>();
  for (const v of (videos ?? []) as VideoRow[]) {
    const { data } = await admin.storage
      .from("videos")
      .createSignedUrl(`${v.ref_id}.mp4`, 60 * 60);
    if (data?.signedUrl) urls.set(v.ref_id, data.signedUrl);
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 96px" }}>
      <Link href="/dashboard" style={{ color: "#8ea4e8", textDecoration: "none", fontSize: ".85rem" }}>
        ← Desk
      </Link>

      <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.9rem", margin: "12px 0 6px" }}>
        Videos
      </h1>
      <p style={{ color: "#9a958a", fontSize: ".85rem", marginBottom: 26 }}>
        Review, copy the caption, download for TikTok. Nothing posts without you.
      </p>

      {error && (
        <div style={{ ...card, borderColor: "#9e1b15", background: "#2a1310" }}>
          <b style={{ color: "#e0261c" }}>Couldn&apos;t load videos:</b> {error.message}
        </div>
      )}

      {!error && (videos?.length ?? 0) === 0 && (
        <div style={card}>
          <p style={{ margin: 0, color: "#9a958a" }}>
            No videos yet. Generate one with{" "}
            <code style={{ color: "#f5c543" }}>npm run video -- REF_ID</code> for any story
            that has a draft.
          </p>
        </div>
      )}

      {((videos ?? []) as VideoRow[]).map((v) => {
        const status = STATUS_LABELS[v.status] ?? { label: v.status, color: "#9a958a" };
        const url = urls.get(v.ref_id);
        return (
          <div key={v.id} style={card}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 12 }}>
              <Link href={`/dashboard/${v.submission_id}`} style={{ color: "#8ea4e8", fontSize: ".8rem" }}>
                <code>{v.ref_id}</code>
              </Link>
              <span style={{ color: status.color, fontSize: ".75rem", fontWeight: 700 }}>
                {status.label}
              </span>
              {v.duration_ms && (
                <span style={{ color: "#6b675c", fontSize: ".75rem" }}>
                  {(v.duration_ms / 1000).toFixed(0)}s
                </span>
              )}
            </div>

            {url ? (
              <video
                src={url}
                controls
                playsInline
                preload="metadata"
                style={{
                  width: "100%",
                  maxWidth: 320,
                  aspectRatio: "9 / 16",
                  borderRadius: 10,
                  background: "#000",
                  display: "block",
                  marginBottom: 16,
                }}
              />
            ) : (
              <p style={{ color: "#9a958a", fontSize: ".85rem" }}>
                {v.status === "rendering"
                  ? "Queued — this renders on the newsroom machine running the video worker, then appears here."
                  : "Video file not uploaded yet."}{" "}
                <code style={{ color: "#f5c543" }}>npm run video -- {v.ref_id}</code>{" "}
                renders it now.
              </p>
            )}

            {v.tiktok_caption && <CopyBox title="TikTok caption" text={v.tiktok_caption} />}
            {v.youtube_title && <CopyBox title="YouTube title" text={v.youtube_title} />}
            {v.youtube_description && (
              <CopyBox title="YouTube description" text={v.youtube_description} />
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              {url && (
                <a
                  href={url}
                  download={`${v.ref_id}.mp4`}
                  style={{
                    padding: "10px 18px",
                    background: "#e0261c",
                    color: "#f5f1e6",
                    borderRadius: 999,
                    textDecoration: "none",
                    fontWeight: 800,
                    fontSize: ".8rem",
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                  }}
                >
                  Download for TikTok
                </a>
              )}
              <a
                href="https://www.tiktok.com/tiktokstudio/upload"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "10px 18px",
                  background: "#121009",
                  color: "#f5f1e6",
                  border: "1px solid #33302a",
                  borderRadius: 999,
                  textDecoration: "none",
                  fontWeight: 800,
                  fontSize: ".8rem",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                }}
              >
                Upload to TikTok ↗
              </a>
              <a
                href="https://studio.youtube.com/channel/UC/videos/upload"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "10px 18px",
                  background: "#121009",
                  color: "#f5f1e6",
                  border: "1px solid #33302a",
                  borderRadius: 999,
                  textDecoration: "none",
                  fontWeight: 800,
                  fontSize: ".8rem",
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                }}
              >
                Upload to YouTube ↗
              </a>
              {(["posted_tiktok", "posted_youtube", "posted_all", "skipped"] as const).map((s) => (
                <form key={s} action={markVideoPosted}>
                  <input type="hidden" name="videoId" value={v.id} />
                  <input type="hidden" name="status" value={s} />
                  <button
                    type="submit"
                    style={{
                      padding: "10px 16px",
                      background: "transparent",
                      color: "#9a958a",
                      border: "1px solid #33302a",
                      borderRadius: 999,
                      cursor: "pointer",
                      fontSize: ".78rem",
                      fontFamily: "inherit",
                    }}
                  >
                    Mark {STATUS_LABELS[s].label.replace("Posted · ", "").toLowerCase()}
                  </button>
                </form>
              ))}
            </div>
          </div>
        );
      })}
    </main>
  );
}
