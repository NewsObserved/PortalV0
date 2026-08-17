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
  // Per-story call to action, e.g. a comment prompt on a celebratory post.
  const outroArg = process.argv.find((a) => a.startsWith("--outro="))?.slice(8);
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
    .select("headline, dek, body, citations")
    .eq("submission_id", sub.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!draft?.body) throw new Error(`No draft body for ${refId} — run the agent first`);

  console.log(`Writing script for ${refId}…`);
  const script = await generateScript(draft);

  // Swap the standard closing sentence for a custom one when asked.
  const narration = outroArg
    ? script.narration.replace(
        /To submit your (news|story)[^]*$/,
        outroArg.replace(/newsobserved\.com/gi, "news observed dot com"),
      )
    : script.narration;

  console.log(`Synthesizing voice (${narration.split(" ").length} words)…`);
  const voice = await synthesizeVoice(narration, refId);
  console.log(`Voice: ${(voice.durationMs / 1000).toFixed(1)}s`);

  console.log("Planning visuals…");
  const { planVisuals } = await import("../lib/video");
  const plan = await planVisuals(draft, draft.citations ?? []);
  for (const s of plan) console.log(`  · ${s.kind}: ${s.purpose}`);

  console.log("Fetching visuals…");
  const { collectMedia } = await import("../lib/media");
  const media = await collectMedia(sub.id, refId, draft.citations ?? [], plan);
  console.log(
    `Visuals: ${media.length} (${media.filter((m) => m.kind === "photo").length} submitted, ${media.filter((m) => m.kind === "screenshot").length} sources)`,
  );

  const props = {
    headline: script.headline_short,
    kicker: script.kicker,
    words: voice.words,
    media,
    audioFile: voice.audioFile,
    durationMs: voice.durationMs,
    ...(outroArg ? { outroLine: outroArg.replace(/\s*newsobserved\.com\s*$/i, "").trim() } : {}),
  };
  const propsPath = join(process.cwd(), "out", `props-${refId}.json`);
  mkdirSync(join(process.cwd(), "out", "videos"), { recursive: true });
  writeFileSync(propsPath, JSON.stringify(props));

  const outPath = join("out", "videos", `${refId}.mp4`);
  console.log("Rendering video…");
  execFileSync(
    "npx",
    [
      "remotion",
      "render",
      "video/index.ts",
      "StoryShort",
      outPath,
      `--props=${propsPath}`,
      // Social platforms re-encode anyway; this keeps files under the
      // storage limit with no visible loss at phone size.
      "--crf=28",
    ],
    { stdio: "inherit" },
  );

  // Upload so the Editorial Desk can play it (renders happen on this machine).
  console.log("Uploading to the Editorial Desk…");
  try {
    const { readFileSync } = await import("node:fs");
    const bytes = readFileSync(join(process.cwd(), outPath));
    const { error: upErr } = await db.storage
      .from("videos")
      .upload(`${refId}.mp4`, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw upErr;
    console.log("Uploaded.");
  } catch (e) {
    console.warn(`! Upload failed (video still at ${outPath}): ${e instanceof Error ? e.message : e}`);
  }

  // Queue row is bookkeeping — never discard a rendered video over it.
  // Approval may already have created a row; fill that one in rather than
  // leaving a phantom "rendering" entry behind.
  const row = {
    submission_id: sub.id,
    ref_id: refId,
    narration,
    tiktok_caption: script.tiktok_caption,
    youtube_title: script.youtube_title,
    youtube_description: script.youtube_description,
    duration_ms: voice.durationMs,
    local_path: outPath,
    status: "ready_to_post",
  };
  const { data: pending } = await db
    .from("videos")
    .select("id")
    .eq("submission_id", sub.id)
    .limit(1);

  const { error: queueError } = pending?.length
    ? await db.from("videos").update(row).eq("id", pending[0].id)
    : await db.from("videos").insert(row);
  if (queueError) {
    console.warn(`\n! Video rendered but not queued: ${queueError.message}`);
  }

  console.log(`\nDone: ${outPath}`);
  console.log(`TikTok caption:\n${script.tiktok_caption}`);
  console.log(`YouTube title: ${script.youtube_title}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
