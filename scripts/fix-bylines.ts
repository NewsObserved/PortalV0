/**
 * Rewrite the byline on already-published WordPress posts. npm run wp:fix-bylines
 *
 * Earlier posts carry older byline wording; the disclosure text is fixed now,
 * so bring existing stories in line rather than leaving a mix on the site.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BYLINE } from "../lib/wordpress";

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

// Any prior wording of the disclosure, in its own trailing paragraph.
const OLD_BYLINE_RE =
  /<p><em>(?:Reported and drafted by[^<]*|AI assisted[^<]*|Drafted by News Observed Editorial AI[^<]*)<\/em><\/p>\s*$/;

async function main() {
  loadEnv();
  const base = process.env.WORDPRESS_BASE_URL!.replace(/\/$/, "");
  const auth =
    "Basic " +
    Buffer.from(
      `${process.env.WORDPRESS_USER}:${process.env.WORDPRESS_APP_PASSWORD}`,
    ).toString("base64");

  const res = await fetch(
    `${base}/wp-json/wp/v2/posts?per_page=50&status=draft,publish&context=edit`,
    { headers: { Authorization: auth } },
  );
  const posts = (await res.json()) as {
    id: number;
    title: { raw: string };
    content: { raw: string };
  }[];

  for (const p of posts) {
    const body = p.content.raw;
    if (!OLD_BYLINE_RE.test(body)) continue;

    const fixed = body.replace(OLD_BYLINE_RE, `<p><em>${BYLINE}</em></p>`);
    if (fixed === body) continue;

    const up = await fetch(`${base}/wp-json/wp/v2/posts/${p.id}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ content: fixed }),
    });
    console.log(`${up.ok ? "✓" : "✗"} ${p.id} — ${p.title.raw.slice(0, 56)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
