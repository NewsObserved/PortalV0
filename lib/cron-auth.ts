import { NextResponse, type NextRequest } from "next/server";

/**
 * Guard cron/runner endpoints. Accepts `?secret=` query param or
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron). Returns a 401 response if
 * the secret is set and doesn't match; returns null when authorized.
 */
export function checkCron(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) return null; // no secret configured (local/dev) — allow
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("secret");
  const fromHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (fromQuery === expected || fromHeader === expected) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
