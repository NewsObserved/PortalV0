/**
 * Re-record a video's narration after an editorial change, without
 * regenerating the whole script.
 *
 *   npm run video:revoice -- NO-DESK09          # writes the script to a file to edit
 *   npm run video:revoice -- NO-DESK09 --apply  # re-records and re-renders from it
 *
 * Keeps the visuals and social copy as they are — only the spoken words and
 * the captions change.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { supabaseAdmin } from "../lib/supabase";
import { synthesizeVoice } from "../lib/video";

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

async function main() {
  loadEnv();
  const ref = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!ref) throw new Error("usage: npm run video:revoice -- REF_ID [--apply]");

  const db = supabaseAdmin();
  const propsPath = join(process.cwd(), "out", `props-${ref}.json`);
  const scriptPath = join(process.cwd(), "out", `narration-${ref}.txt`);
  if (!existsSync(propsPath)) throw new Error(`No props for ${ref} — render it first.`);
  const props = JSON.parse(readFileSync(propsPath, "utf8"));

  if (!apply) {
    const current = props.words.map((w: { text: string }) => w.text).join(" ");
    writeFileSync(scriptPath, current);
    console.log(`Wrote the current script to:\n  ${scriptPath}\n`);
    console.log("Edit it, then re-run with --apply.");
    return;
  }

  if (!existsSync(scriptPath)) throw new Error(`No edited script at ${scriptPath}`);
  const narration = readFileSync(scriptPath, "utf8").trim();
  console.log(`Re-recording ${narration.split(/\s+/).length} words…`);

  const voice = await synthesizeVoice(narration, ref);
  console.log(`Voice: ${(voice.durationMs / 1000).toFixed(1)}s`);

  props.words = voice.words;
  props.audioFile = voice.audioFile;
  props.durationMs = voice.durationMs;
  writeFileSync(propsPath, JSON.stringify(props));

  const outPath = join("out", "videos", `${ref}.mp4`);
  console.log("Re-rendering…");
  execFileSync(
    "npx",
    ["remotion", "render", "video/index.ts", "StoryShort", outPath, `--props=${propsPath}`, "--crf=28"],
    { stdio: "inherit" },
  );

  const bytes = readFileSync(join(process.cwd(), outPath));
  const { error } = await db.storage
    .from("videos")
    .upload(`${ref}.mp4`, bytes, { contentType: "video/mp4", upsert: true });
  if (error) console.warn(`! upload failed: ${error.message}`);

  await db
    .from("videos")
    .update({ narration, duration_ms: voice.durationMs })
    .eq("ref_id", ref);

  console.log(`\nDone: ${outPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
