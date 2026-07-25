/** One-time Gmail OAuth: prints an auth URL, catches the localhost redirect,
 * exchanges the code, appends env vars to .env.local, verifies the token. */
import { google } from "googleapis";
import { createServer } from "node:http";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];
const PORT = 8123;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = ["https://www.googleapis.com/auth/gmail.modify"];

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const url = auth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPE });

console.log("AUTH_URL_BELOW");
console.log(url);
console.log("AUTH_URL_ABOVE");

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", REDIRECT);
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error");
  if (!code && !err) {
    res.writeHead(404).end();
    return;
  }
  if (err) {
    res.end("Authorization was denied. You can close this tab.");
    console.log("AUTH_ERROR:", err);
    process.exit(1);
  }
  try {
    const { tokens } = await auth.getToken(code!);
    auth.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress ?? "";

    const envPath = join("/Users/shilohluckey/Observed News", ".env.local");
    const existing = readFileSync(envPath, "utf8");
    if (!existing.includes("GOOGLE_OAUTH_CLIENT_ID")) {
      appendFileSync(
        envPath,
        `GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}\nGOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}\nGOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\nEDITORIAL_EMAIL=${email}\n`,
      );
    }
    res.end(`Authorized as ${email} — you can close this tab. Claude has the rest.`);
    console.log("AUTH_OK:", email, "| refresh token captured, .env.local updated");
    process.exit(0);
  } catch (e) {
    res.end("Token exchange failed — tell Claude.");
    console.log("AUTH_EXCHANGE_ERROR:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
});
server.listen(PORT, () => console.log(`listening on ${REDIRECT}`));
setTimeout(() => {
  console.log("AUTH_TIMEOUT: no authorization within 15 minutes");
  process.exit(1);
}, 15 * 60 * 1000);
