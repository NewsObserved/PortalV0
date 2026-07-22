/**
 * Render a TikTok/Shorts video for a drafted or published story.
 *
 *   npm run video -- <ref_id>     # e.g. npm run video -- NO-SEED94
 *
 * Pipeline: latest draft → narration script (Claude) → voice + word timestamps
 * (ElevenLabs) → Remotion render → out/videos/<ref_id>.mp4, queued in the
 * `videos` table with the social copy for the editor to review and post.
 * Requires .env.local: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, Supabase keys.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* rely on ambient env */
  }
}

async function main() {
  loadEnv();
  const refId = process.argv[2];
  if (!refId) {
    console.error("Usage: npm run video -- <ref_id>");
    process.exit(1);
  }

  const { supabaseAdmin } = await import("../lib/supabase");
  const { generateScript, synthesizeVoice } = await import("../lib/video");
  const db = supabaseAdmin();

  const { data: sub, error } = await db
    .from("submissions")
    .select("id, ref_id, headline")
    .eq("ref_id", refId)
    .single();
  if (error || !sub) throw new Error(`Submission ${refId} not found`);

  const { data: draft } = await db
    .from("drafts")
    .select("headline, dek, body")
    .eq("submission_id", sub.id)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (!draft?.body) throw new Error(`No draft body for ${refId} — run the agent first`);

  console.log(`Writing script for ${refId}…`);
  const script = await generateScript(draft);

  console.log(`Synthesizing voice (${script.narration.split(" ").length} words)…`);
  const voice = await synthesizeVoice(script.narration, refId);
  console.log(`Voice: ${(voice.durationMs / 1000).toFixed(1)}s`);

  const props = {
    headline: script.headline_short,
    kicker: script.kicker,
    words: voice.words,
    audioFile: voice.audioFile,
    durationMs: voice.durationMs,
  };
  const propsPath = join(process.cwd(), "out", `props-${refId}.json`);
  mkdirSync(join(process.cwd(), "out", "videos"), { recursive: true });
  writeFileSync(propsPath, JSON.stringify(props));

  const outPath = join("out", "videos", `${refId}.mp4`);
  console.log("Rendering video…");
  execFileSync(
    "npx",
    ["remotion", "render", "video/index.ts", "StoryShort", outPath, `--props=${propsPath}`],
    { stdio: "inherit" },
  );

  await db.from("videos").insert({
    submission_id: sub.id,
    ref_id: refId,
    narration: script.narration,
    tiktok_caption: script.tiktok_caption,
    youtube_title: script.youtube_title,
    youtube_description: script.youtube_description,
    duration_ms: voice.durationMs,
    local_path: outPath,
    status: "ready_to_post",
  });

  console.log(`\nDone: ${outPath}`);
  console.log(`TikTok caption:\n${script.tiktok_caption}`);
  console.log(`YouTube title: ${script.youtube_title}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
