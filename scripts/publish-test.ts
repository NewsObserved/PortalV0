/** Push the latest draft to ognsc.com as a WordPress draft. npm run publish:test */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "../lib/supabase";
import { publishDraft } from "../lib/wordpress";

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
  const db = supabaseAdmin();
  const { data: draft } = await db
    .from("drafts")
    .select("headline, dek, body")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!draft) throw new Error("no draft found");

  const result = await publishDraft({
    title: draft.headline,
    dek: draft.dek,
    body: draft.body,
    editorName: process.argv[2] ?? "Shiloh Luckey",
    status: "draft",
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
