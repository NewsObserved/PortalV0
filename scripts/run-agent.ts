/**
 * Local runner CLI — process the submission queue against live Supabase + Claude.
 *
 *   npm run agent:run            # process up to 3 'new' submissions
 *   npm run agent:run -- <id>    # process one submission by id
 *   npm run agent:run -- --seed  # insert a realistic test submission, then process it
 *
 * Requires .env.local with SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { processQueue, processSubmission } from "../lib/runner";
import { supabaseAdmin } from "../lib/supabase";

// Minimal .env.local loader (no dependency needed).
function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env.local — rely on the ambient environment */
  }
}

async function seed(): Promise<string> {
  const db = supabaseAdmin();
  const ref = "NO-SEED" + Math.floor(Math.random() * 90 + 10);
  const { data, error } = await db
    .from("submissions")
    .insert({
      ref_id: ref,
      headline: "City closed the only splash pad in Lakeview with no notice",
      story:
        "The splash pad at Martin Luther King Jr. Park in Lakeview has been chained shut since the first week of June with a paper sign that just says 'closed.' It's the only free water feature for kids in this part of town and it's been 95+ degrees. Nobody from the city has said why or when it reopens. Parents have been asking at the rec center and getting no answers.",
      category: "Local News",
      location: "Lakeview, Bakersfield",
      edition: "Bakersfield Edition",
      evidence: ["photos", "witness"],
      covered: "no",
      submitter_name: "Test Submitter",
      submitter_email: "test@example.com",
      relation: "It happened to someone I know",
      privacy: "anon",
      consent: true,
    })
    .select("id, ref_id")
    .single();
  if (error) throw error;
  console.log(`Seeded submission ${data.ref_id} (${data.id})`);
  return data.id as string;
}

async function main() {
  loadEnv();
  const arg = process.argv[2];

  if (arg === "--seed") {
    const id = await seed();
    console.log(JSON.stringify(await processSubmission(id), null, 2));
    return;
  }
  if (arg) {
    console.log(JSON.stringify(await processSubmission(arg), null, 2));
    return;
  }
  const results = await processQueue();
  console.log(JSON.stringify(results, null, 2));
  if (results.length === 0) console.log("(no 'new' submissions in the queue)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
