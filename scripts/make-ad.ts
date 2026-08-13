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
import { fetchCommonsImage, makeEvidenceCard, type MediaItem } from "../lib/media";

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

const NARRATION = [
  "Most newsrooms were never built for us.",
  "Observer Group Newspapers has covered Black Southern California since 1974.",
  "Now News Observed takes the story straight from you.",
  "See something nobody is reporting? Send it.",
  "Our newsroom checks it against public records and real sources.",
  "A human editor reviews every word before it runs.",
  "It is free. You do not need an account. And your name stays private unless you say otherwise.",
  "Freedom's Journal to your feed — the press that shows up when nobody else does.",
  "Tell us what they buried, at news observed dot com.",
].join(" ");

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
  const REF = "AD-BRAND01";
  const mediaDir = join(process.cwd(), "public", "media");
  mkdirSync(mediaDir, { recursive: true });

  console.log("Recording voiceover…");
  const voice = await synthesizeVoice(NARRATION, REF);
  console.log(`Voice: ${(voice.durationMs / 1000).toFixed(1)}s`);

  console.log("Gathering visuals…");
  const media: MediaItem[] = [];

  // Our own front page and the submission form.
  const site = join(mediaDir, `ad-site.png`);
  if (shootOwnSite(site, "https://www.newsobserved.com")) {
    media.push({ file: "media/ad-site.png", source: "", kind: "screenshot" });
    console.log("  ✓ newsobserved.com");
  }

  const card = makeEvidenceCard(
    "News Observed",
    "Free. Anonymous if you want. Verified by real reporters. Reviewed by a human editor before a word runs.",
    REF,
    0,
  );
  if (card) {
    media.push({ ...card, source: "" });
    console.log("  ✓ promise card");
  }

  for (const [i, query] of [
    "African American newspaper history",
    "Los Angeles California neighborhood street",
    "community meeting people talking",
  ].entries()) {
    const img = await fetchCommonsImage(query, REF, i + 1, query);
    console.log(`  ${img ? "✓" : "✗"} ${query}`);
    if (img) media.push(img);
  }

  console.log(`Visuals: ${media.length}`);

  const props = {
    headline: "The news they buried. Told by the people it happened to.",
    kicker: "Since 1974",
    words: voice.words,
    media,
    audioFile: voice.audioFile,
    durationMs: voice.durationMs,
    outroLine: "Tell us what they buried",
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
