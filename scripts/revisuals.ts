/** Re-plan and re-fetch visuals for an existing video's props. npm run video:revisuals -- REF */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { planVisuals } from "../lib/video";
import { collectMedia } from "../lib/media";

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}

async function main() {
  loadEnv();
  const ref = process.argv[2];
  if (!ref) throw new Error("usage: npm run video:revisuals -- REF_ID");

  const db = supabaseAdmin();
  const { data: sub } = await db.from("submissions").select("id").eq("ref_id", ref).single();
  const { data: d } = await db
    .from("drafts").select("headline,dek,body,citations")
    .eq("submission_id", sub!.id).order("version", { ascending: false }).limit(1).single();

  const plan = await planVisuals(d as never, (d as { citations?: [] }).citations ?? []);
  for (const s of plan) console.log(`  · ${s.kind}: ${s.purpose.slice(0, 80)}`);

  const media = await collectMedia(sub!.id, ref, (d as { citations?: [] }).citations ?? [], plan);
  console.log("\nFINAL VISUALS:");
  for (const m of media) console.log(" -", m.kind.padEnd(10), m.source.slice(0, 54));

  const propsPath = join(process.cwd(), "out", `props-${ref}.json`);
  const props = JSON.parse(readFileSync(propsPath, "utf8"));
  props.media = media;
  writeFileSync(propsPath, JSON.stringify(props));
  console.log(`\nprops updated: ${media.length} shots`);
}

main().catch((e) => { console.error(e); process.exit(1); });
