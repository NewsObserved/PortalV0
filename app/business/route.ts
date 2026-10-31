import { readFileSync } from "node:fs";
import { join } from "node:path";

// site/business.html is the public Holiday Business Spotlight page, served the
// same way as site/index.html at /. Static: baked in at build time.
export const dynamic = "force-static";

export async function GET() {
  const html = readFileSync(join(process.cwd(), "site", "business.html"), "utf8");
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
