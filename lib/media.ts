import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "./supabase";

/** An image the video can show, with the attribution shown on screen. */
export interface MediaItem {
  /** Filename inside public/ for Remotion's staticFile(). */
  file: string;
  /** On-screen credit, e.g. "City of Bakersfield" or "Submitted photo". */
  source: string;
  kind: "screenshot" | "photo" | "map" | "image";
  /** The agent's reason for this shot — surfaced to the editor, not the viewer. */
  purpose?: string;
}

const UA = "NewsObserved/1.0 (editorial@newsobserved.com)";

/** Screenshot one URL at portrait-ish dimensions. Retries once — slow pages
 * and cold CDNs fail the first attempt often enough to be worth it. */
function shoot(url: string, path: string): boolean {
  if (!existsSync(CHROME)) return false;
  for (const budget of [9000, 16000]) {
    try {
      execFileSync(
        CHROME,
        [
          "--headless",
          "--disable-gpu",
          "--hide-scrollbars",
          `--virtual-time-budget=${budget}`,
          "--window-size=1000,1250",
          `--screenshot=${path}`,
          url,
        ],
        { stdio: "ignore", timeout: 90_000 },
      );
      if (existsSync(path) && !looksBlank(path)) return true;
    } catch {
      /* try the longer budget */
    }
  }
  return false;
}

/**
 * Nominatim is literal — it misses on honorifics, punctuation, and street
 * addresses. Try progressively simpler forms of the same place.
 */
function geocodeVariants(query: string): string[] {
  const out = [query];
  const noHonorifics = query
    .replace(/\b(Dr|Jr|Sr|St|Mt)\.?\s/gi, (m) => (/\bSt\.?\s/i.test(m) ? m : ""))
    .replace(/\s{2,}/g, " ")
    .trim();
  if (noHonorifics !== query) out.push(noHonorifics);
  out.push(noHonorifics.replace(/,/g, " ").replace(/\s{2,}/g, " ").trim());

  const parts = query.split(",").map((p) => p.trim());
  // Place name + city/state, dropping a street address in the middle
  // ("MLK Jr. Park, 1000 S Owens St, Bakersfield, CA" -> "MLK Park, Bakersfield, CA").
  if (parts.length >= 3) {
    const head = parts[0]
      .replace(/\b(Dr|Jr|Sr|Mt)\.?\s/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    out.push(`${head}, ${parts.slice(-2).join(", ")}`);
    out.push(parts.slice(1).join(", "));
  }
  // Last resort: the city/state tail still establishes place.
  if (parts.length >= 2) out.push(parts.slice(-2).join(", "));

  return [...new Set(out.filter(Boolean))];
}

/** Geocode a place with OpenStreetMap, then screenshot a map centred on it. */
export function fetchMap(query: string, refId: string, index: number): MediaItem | null {
  try {
    let hit: { lat: string; lon: string } | undefined;
    for (const variant of geocodeVariants(query)) {
      const geo = execFileSync(
        "curl",
        [
          "-s",
          "-A",
          UA,
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(variant)}&format=json&limit=1`,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      hit = (JSON.parse(geo) as { lat: string; lon: string }[])[0];
      if (hit) break;
      execFileSync("sleep", ["1"]); // Nominatim asks for <=1 req/sec
    }
    if (!hit) return null;

    const name = `map-${refId}-${index}.png`;
    const path = join(publicDir(), name);
    execFileSync(
      "python3",
      [
        join(process.cwd(), "scripts", "make-map.py"),
        hit.lat,
        hit.lon,
        "15", // neighbourhood scale
        path,
      ],
      { stdio: "ignore", timeout: 90_000 },
    );
    if (!existsSync(path)) return null;
    return {
      file: `media/${name}`,
      source: "© OpenStreetMap contributors",
      kind: "map",
    };
  } catch {
    return null;
  }
}

/** Search Wikimedia Commons for an openly-licensed photo and download it. */
export async function fetchCommonsImage(
  query: string,
  refId: string,
  index: number,
  purpose: string,
): Promise<MediaItem | null> {
  try {
    const api =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=6` +
      `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1400&format=json`;
    const raw = execFileSync("curl", ["-s", "-A", UA, api], {
      encoding: "utf8",
      timeout: 30_000,
    });
    const pages = JSON.parse(raw)?.query?.pages ?? {};

    for (const page of Object.values(pages) as {
      title: string;
      imageinfo: {
        thumburl?: string;
        url: string;
        extmetadata?: Record<string, { value: string }>;
      }[];
    }[]) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata ?? {};
      const license = (meta.LicenseShortName?.value ?? "").toLowerCase();
      // Only clearly reusable licences.
      if (!/public domain|^cc|cc0|attribution/.test(license)) continue;

      const src = info.thumburl ?? info.url;
      if (!/\.(jpe?g|png)$/i.test(src.split("?")[0])) continue;

      const artist = (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();
      const name = `commons-${refId}-${index}.jpg`;
      const path = join(publicDir(), name);
      execFileSync("curl", ["-s", "-A", UA, "-o", path, src], { timeout: 45_000 });
      if (!existsSync(path) || looksBlank(path)) continue;

      // The agent looks at it before accepting — keyword search alone lies.
      const { imageFitsShot } = await import("./video");
      const mediaType = /\.png$/i.test(src.split("?")[0]) ? "image/png" : "image/jpeg";
      const b64 = readFileSync(path).toString("base64");
      if (!(await imageFitsShot(b64, mediaType, purpose))) {
        rmSync(path, { force: true });
        continue;
      }

      return {
        file: `media/${name}`,
        source: artist ? `${artist} / Wikimedia (${meta.LicenseShortName?.value})` : "Wikimedia Commons",
        kind: "image",
      };
    }
    return null;
  } catch {
    return null;
  }
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
      if (shoot(c.source_url, path)) {
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

/**
 * Build the visual sequence: the submitter's own photos lead, then the shots
 * the agent planned (map / documentary screenshot / openly-licensed photo),
 * in the order it chose. Falls back to plain citation screenshots if planning
 * produced nothing usable.
 */
export async function collectMedia(
  submissionId: string,
  refId: string,
  citations: { source_url: string; source_name: string }[],
  plan: import("./video").PlannedShot[] = [],
): Promise<MediaItem[]> {
  const photos = await fetchSubmitterPhotos(submissionId, refId);
  const planned: MediaItem[] = [];

  for (const [i, shot] of plan.entries()) {
    let item: MediaItem | null = null;
    if (shot.kind === "map") {
      item = fetchMap(shot.query, refId, i);
    } else if (shot.kind === "commons_image") {
      item = await fetchCommonsImage(shot.query, refId, i, shot.purpose);
    } else if (shot.kind === "source_page" && shot.source_url) {
      const [only] = captureSourceScreenshots(
        [
          {
            source_url: shot.source_url,
            source_name:
              citations.find((c) => c.source_url === shot.source_url)?.source_name ??
              new URL(shot.source_url).hostname.replace(/^www\./, ""),
          },
        ],
        `${refId}-p${i}`,
        1,
      );
      item = only ?? null;
    }
    if (item) planned.push({ ...item, purpose: shot.purpose });
    console.log(`  ${item ? "✓" : "✗"} ${shot.kind}: ${shot.query.slice(0, 52)}`);
  }

  const collected = [...photos, ...planned];
  if (collected.length >= 3) return collected;

  // Thin plan — top up with straight citation screenshots.
  return [...collected, ...captureSourceScreenshots(citations, refId, 6 - collected.length)];
}
