import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "./supabase";

/** An image the video can show, with the attribution shown on screen. */
export interface MediaItem {
  /** Filename inside public/ for Remotion's staticFile(). */
  file: string;
  /** On-screen credit, e.g. "City of Bakersfield" or "Submitted photo". */
  source: string;
  kind: "screenshot" | "photo";
}

const CHROME = join(
  process.cwd(),
  "node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell",
);

function publicDir(): string {
  const dir = join(process.cwd(), "public", "media");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Sites that serve headless browsers a login wall or an empty skeleton. */
const UNSHOOTABLE = [
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
];

/**
 * A screenshot that's nearly one flat colour is a loading skeleton or a
 * cookie wall — visually useless. Rejects those so they never reach the video.
 */
function looksBlank(path: string): boolean {
  try {
    const stdout = execFileSync(
      "python3",
      [
        "-c",
        `from PIL import Image, ImageStat
im = Image.open(${JSON.stringify(path)}).convert("L").resize((160, 200))
print(ImageStat.Stat(im).stddev[0])`,
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    return Number(stdout.trim()) < 13; // near-uniform image (skeleton/wall)
  } catch {
    return false; // can't measure — keep it
  }
}

/**
 * Screenshot the pages behind our citations. These are documentary evidence —
 * the source's own page, shown as it appears — not lifted photography.
 */
export function captureSourceScreenshots(
  citations: { source_url: string; source_name: string }[],
  refId: string,
  limit = 6,
): MediaItem[] {
  if (!existsSync(CHROME)) {
    console.warn("! headless browser missing — run: npx remotion browser ensure");
    return [];
  }
  const out: MediaItem[] = [];
  const seen = new Set<string>();

  for (const c of citations) {
    if (out.length >= limit) break;
    if (!c.source_url?.startsWith("http") || seen.has(c.source_url)) continue;
    if (UNSHOOTABLE.some((d) => c.source_url.includes(d))) continue;
    seen.add(c.source_url);

    const name = `shot-${refId}-${out.length}.png`;
    const path = join(publicDir(), name);
    try {
      execFileSync(
        CHROME,
        [
          "--headless",
          "--disable-gpu",
          "--hide-scrollbars",
          "--virtual-time-budget=9000",
          "--window-size=1000,1250",
          `--screenshot=${path}`,
          c.source_url,
        ],
        { stdio: "ignore", timeout: 60_000 },
      );
      if (existsSync(path) && !looksBlank(path)) {
        out.push({ file: `media/${name}`, source: c.source_name, kind: "screenshot" });
      }
    } catch {
      /* a source that won't render is not worth failing the video over */
    }
  }
  return out;
}

/**
 * Pull image attachments the submitter emailed us (follow-up threads).
 * These are first-class visuals: the submitter's own evidence.
 */
export async function fetchSubmitterPhotos(
  submissionId: string,
  refId: string,
  limit = 6,
): Promise<MediaItem[]> {
  const { isGmailConfigured, gmailAttachments } = await import("./gmail");
  if (!isGmailConfigured()) return [];

  const db = supabaseAdmin();
  const { data: threads } = await db
    .from("follow_ups")
    .select("gmail_thread_id")
    .eq("submission_id", submissionId)
    .not("gmail_thread_id", "is", null);

  const out: MediaItem[] = [];
  for (const t of threads ?? []) {
    if (out.length >= limit) break;
    try {
      const images = await gmailAttachments(t.gmail_thread_id as string, limit - out.length);
      for (const img of images) {
        const name = `photo-${refId}-${out.length}.${img.ext}`;
        writeFileSync(join(publicDir(), name), img.data);
        out.push({ file: `media/${name}`, source: "Submitted photo", kind: "photo" });
      }
    } catch {
      /* attachments are a bonus, never a blocker */
    }
  }
  return out;
}

/** Submitter photos first (their evidence leads), then source screenshots. */
export async function collectMedia(
  submissionId: string,
  refId: string,
  citations: { source_url: string; source_name: string }[],
): Promise<MediaItem[]> {
  const photos = await fetchSubmitterPhotos(submissionId, refId);
  const shots = captureSourceScreenshots(citations, refId, Math.max(3, 8 - photos.length));
  return [...photos, ...shots];
}
