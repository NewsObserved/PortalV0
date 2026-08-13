/**
 * Render the promo/boost video for News Observed itself.
 *
 *   npm run ad
 *
 * Not a news story — brand copy about what the paper is and how to submit.
 * Visuals are our own site plus openly-licensed imagery, so it is safe to
 * run as paid promotion.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { synthesizeVoice } from "../lib/video";
import {
  fetchCommonsFile,
  fetchCommonsImage,
  makeEvidenceCard,
  type MediaItem,
} from "../lib/media";

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* ambient env */
  }
}

// Written to be spoken, not read: longer connected phrases and commas rather
// than short sentences, which the model honours as hard stops and reads choppy.
interface Spot {
  ref: string;
  narration: string;
  headline: string;
  kicker: string;
  outroLine: string;
  outroDomain?: string;
  cardText: string;
  /** Exact Commons files — used when the shot must be a specific picture. */
  pinnedFiles?: string[];
  imageQueries: string[];
}

const SPOTS: Record<string, Spot> = {
  brand: {
    ref: "AD-BRAND01",
    headline: "The news they buried. Told by the people it happened to.",
    kicker: "Since 1974",
    outroLine: "Tell us what they buried",
    cardText:
      "Free. Anonymous if you want. Verified by real reporters. Reviewed by a human editor before a word runs.",
    // One shot per edition — LA, Kern, Antelope Valley. The city signs are
    // pinned by filename: a viewer should recognise their own town instantly,
    // and search results drift between runs.
    pinnedFiles: [
      "Ladera Heights neighborhood sign.jpg",
      "Bakersfield CA - sign.jpg",
    ],
    imageQueries: ["Lancaster California Antelope Valley"],
    narration: [
      "Most newsrooms were never built for us.",
      "Observer Group Newspapers has covered Black Southern California since 1974,",
      "and now News Observed takes the story straight from you.",
      "So if something happened in your neighborhood and nobody reported it, send it to us,",
      "because our newsroom checks it against public records and real sources,",
      "and a human editor reads every word before any of it runs.",
      "It's free, there's no account to make,",
      "and your name stays private unless you tell us otherwise.",
      "From Freedom's Journal to your feed, this is the press that shows up when nobody else does.",
      "So tell us what they buried, at news observed dot com.",
    ].join(" "),
  },

  donate: {
    ref: "AD-DONATE01",
    headline: "The Black press has never been free to run. Only free to read.",
    kicker: "Keep us here",
    outroLine: "Donate at the link in our bio",
    outroDomain: "Support the Black press",
    cardText:
      "Every story here is free to read and free to send. Reporting it is what costs money.",
    imageQueries: [
      "African American newspaper printing press",
      "newspaper newsroom desk work",
      "Los Angeles community neighborhood",
    ],
    narration: [
      "Reading News Observed is free, and sending us your story is free,",
      "and we intend to keep it that way.",
      "But checking a claim against public records takes time,",
      "and paying reporters and editors to do that work takes money.",
      "Observer Group Newspapers has published in Southern California since 1974,",
      "and like every Black paper before it, we have never survived on advertising alone.",
      "We are still here because the community keeps us here.",
      "So if this reporting matters to you, a donation of any size pays for the next story,",
      "the kind nobody else is going to tell.",
      "The link is in our bio. Thank you for keeping the lights on.",
    ].join(" "),
  },
};

/** Screenshot our own site — no rights questions, and it shows the product. */
function shootOwnSite(path: string, url: string): boolean {
  const root = join(process.cwd(), "node_modules/.remotion/chrome-headless-shell");
  if (!existsSync(root)) return false;
  const chrome = execFileSync(
    "find",
    [root, "-name", "chrome-headless-shell", "-type", "f", "-maxdepth", "4"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)[0];
  if (!chrome) return false;

  try {
    execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--virtual-time-budget=12000",
        "--window-size=1000,1250",
        `--screenshot=${path}`,
        url,
      ],
      { stdio: "ignore", timeout: 90_000 },
    );
    return existsSync(path);
  } catch {
    return false;
  }
}

async function main() {
  loadEnv();
  const key = process.argv[2] ?? "brand";
  const spot = SPOTS[key];
  if (!spot) throw new Error(`Unknown spot "${key}". Options: ${Object.keys(SPOTS).join(", ")}`);
  const REF = spot.ref;
  console.log(`Spot: ${key}`);
  const mediaDir = join(process.cwd(), "public", "media");
  mkdirSync(mediaDir, { recursive: true });

  console.log("Recording voiceover…");
  const voice = await synthesizeVoice(spot.narration, REF);
  console.log(`Voice: ${(voice.durationMs / 1000).toFixed(1)}s`);

  console.log("Gathering visuals…");
  const media: MediaItem[] = [];

  // Our own front page and the submission form.
  const site = join(mediaDir, `ad-site-${key}.png`);
  if (shootOwnSite(site, "https://www.newsobserved.com")) {
    media.push({ file: `media/ad-site-${key}.png`, source: "", kind: "screenshot" });
    console.log("  ✓ newsobserved.com");
  }

  const card = makeEvidenceCard("News Observed", spot.cardText, REF, 0);
  if (card) {
    media.push({ ...card, source: "" });
    console.log("  ✓ promise card");
  }

  for (const [i, title] of (spot.pinnedFiles ?? []).entries()) {
    const img = fetchCommonsFile(title, REF, i);
    console.log(`  ${img ? "✓" : "✗"} ${title}`);
    if (img) media.push(img);
  }

  for (const [i, query] of spot.imageQueries.entries()) {
    const img = await fetchCommonsImage(query, REF, i + 1, query);
    console.log(`  ${img ? "✓" : "✗"} ${query}`);
    if (img) media.push(img);
  }

  console.log(`Visuals: ${media.length}`);

  const props = {
    headline: spot.headline,
    kicker: spot.kicker,
    words: voice.words,
    media,
    audioFile: voice.audioFile,
    durationMs: voice.durationMs,
    outroLine: spot.outroLine,
    ...(spot.outroDomain ? { outroDomain: spot.outroDomain } : {}),
  };
  const propsPath = join(process.cwd(), "out", `props-${REF}.json`);
  mkdirSync(join(process.cwd(), "out", "videos"), { recursive: true });
  writeFileSync(propsPath, JSON.stringify(props));

  const outPath = join("out", "videos", `${REF}.mp4`);
  console.log("Rendering…");
  execFileSync(
    "npx",
    [
      "remotion",
      "render",
      "video/index.ts",
      "StoryShort",
      outPath,
      `--props=${propsPath}`,
      "--crf=28",
    ],
    { stdio: "inherit" },
  );

  console.log(`\nDone: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
