/** Smoke-test lead-image selection + WordPress upload. npm run image:test -- REF */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { findArticleImage } from "../lib/article-image";
import { publishDraft } from "../lib/wordpress";

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
  const ref = process.argv[2] ?? "NO-DESK01";
  const db = supabaseAdmin();
  const { data: sub } = await db.from("submissions").select("id").eq("ref_id", ref).single();
  const { data: d } = await db
    .from("drafts").select("headline,dek,body")
    .eq("submission_id", sub!.id).order("version", { ascending: false }).limit(1).single();

  console.log("story:", d!.headline.slice(0, 70));
  const image = await findArticleImage({ headline: d!.headline, dek: d!.dek, body: d!.body });
  if (!image) { console.log("NO IMAGE FOUND"); return; }
  console.log(`image: ${(image.bytes.length / 1024).toFixed(0)}KB\n  credit: ${image.credit}\n  alt: ${image.alt}`);

  const r = await publishDraft({
    title: "[IMAGE TEST] " + d!.headline,
    dek: d!.dek ?? "", body: d!.body, editorName: "Image test", image,
  });
  console.log("published:", JSON.stringify(r, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
