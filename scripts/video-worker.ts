/**
 * Render videos for approved stories, automatically.
 *
 *   npm run video:watch          # poll forever (leave it running)
 *   npm run video:watch -- --once  # drain the queue and exit
 *
 * Approving a story in the Editorial Desk inserts a `videos` row with status
 * 'rendering'. Rendering itself needs a real machine (headless Chrome +
 * ffmpeg), which serverless can't provide — so this worker does the work
 * wherever it runs and uploads the result back for the desk to play.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { supabaseAdmin } from "../lib/supabase";

const POLL_MS = 30_000;

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

/** One pass over the queue. Returns how many videos were rendered. */
async function drain(): Promise<number> {
  const db = supabaseAdmin();
  const { data: queued, error } = await db
    .from("videos")
    .select("id, ref_id")
    .eq("status", "rendering")
    .is("local_path", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`queue read failed: ${error.message}`);
    return 0;
  }
  if (!queued?.length) return 0;

  let done = 0;
  for (const v of queued) {
    console.log(`\n▶ Rendering ${v.ref_id}…`);
    try {
      execFileSync("npx", ["tsx", "scripts/make-video.ts", v.ref_id], {
        stdio: "inherit",
        timeout: 20 * 60_000,
      });
      done++;
    } catch (e) {
      console.error(`✗ ${v.ref_id} failed: ${e instanceof Error ? e.message : e}`);
      // Leave it queued; a later pass retries. A story whose draft isn't
      // ready yet will simply keep failing until it is.
    }
  }
  return done;
}

async function main() {
  loadEnv();
  const once = process.argv.includes("--once");

  if (once) {
    const n = await drain();
    console.log(n ? `\nRendered ${n} video(s).` : "Nothing queued.");
    return;
  }

  console.log("Video worker running. Approve a story and its video renders here.");
  console.log("Ctrl+C to stop.\n");
  for (;;) {
    const n = await drain();
    if (n) console.log(`\n✓ ${n} rendered. Watching…\n`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
