# Observed — Community Submission Newsroom

Observed turns community story tips into editor-reviewed, published journalism for
Observer Group Newspapers of Southern California. A submitter files a story, an AI
editorial agent researches it and drafts it, the submitter answers follow-up questions
by email, a human editor reviews the draft, and approved stories publish to ognsc.com.

## Pipeline

```
site/index.html (public form) ──▶ Supabase: submissions (status=new)
        │
   /api/cron/process ──▶ agent runner (lib/runner.ts)
        │   Phase 1: Fable 5 + web_search  → research + sources
        │   Phase 2: Fable 5 + JSON schema → validated editorial draft
        ├─ needs follow-up → follow_ups + Gmail email → questions_sent
        └─ enough          → drafts → drafted
        │
   /api/cron/poll-email ──▶ submitter reply re-runs the agent (round 2)
   /api/cron/stall-check ─▶ no reply in 5 days → best-effort draft (stalled)
        │
   /dashboard (editors) ──▶ edit / approve / reject
        └─ publish ──▶ ognsc.com WordPress (lib/wordpress.ts) → published
```

## Layout

| Path | What |
|---|---|
| `site/index.html` | Public submission landing page (static; posts to Supabase REST). |
| `prompts/editorial-system-prompt.md` | The editorial agent's system prompt. |
| `lib/runner.ts` | Two-phase research + drafting agent (the keystone). |
| `lib/editorial-schema.ts` | JSON Schema enforcing the structured draft output. |
| `lib/gmail.ts` | Submitter follow-up email send + reply polling. |
| `lib/wordpress.ts` | Publish a draft to ognsc.com. |
| `app/dashboard/**` | Editor review UI (Supabase Auth). |
| `app/api/cron/**` | Runner / email-poll / stall-check endpoints. |
| `scripts/run-agent.ts` | Local CLI to run the agent (`npm run agent:run`). |

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in:
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings → API → `service_role`.
   - `ANTHROPIC_API_KEY` — console.anthropic.com.
   - Gmail (`GOOGLE_OAUTH_*`, `EDITORIAL_EMAIL`) — a Google Cloud OAuth client + refresh token for the editorial mailbox. *(Phase 4)*
   - WordPress (`WORDPRESS_*`) — an ognsc.com application password. *(Phase 5)*
   - `CRON_SECRET` — any random string (guards the cron endpoints in production).
3. In Supabase Auth settings, **disable open sign-ups** so only invited editors can log in.

## Run & verify locally

```bash
npm run agent:run -- --seed   # seed a test submission and process it end-to-end
npm run agent:run             # process up to 3 'new' submissions
npm run dev                   # http://localhost:3000/dashboard (after editor login)
```

Inspect results in Supabase (`agent_runs`, `drafts`, `follow_ups`).

## Production (after the Vercel upgrade)

- Deploy to Vercel; point `newsobserved.com` at it.
- Set the same env vars in Vercel project settings (incl. `CRON_SECRET`).
- `vercel.json` registers the three cron jobs (process / poll-email / stall-check).
  Adjust frequencies to your Vercel plan's cron limits.
- The landing page can stay static (`site/`) or be ported into the Next app.

> Security: bump `next` to the latest patched release before exposing the app publicly
> (the current pin carries the standard Next.js advisories).
