import { readFileSync } from "node:fs";
import { join } from "node:path";

// site/index.html stays the single source of truth for the public page
// (GitHub Pages serves it from site/, Vercel serves it here at /).
// Static: the HTML is baked in at build time.
export const dynamic = "force-static";

export async function GET() {
  const html = readFileSync(join(process.cwd(), "site", "index.html"), "utf8");
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
