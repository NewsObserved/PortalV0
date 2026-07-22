-- News Observed — full schema for the izxsutkulehavwnxunwv project.
-- Combined from the four migrations applied to the original dev project.
-- Run once in: Supabase dashboard → SQL Editor → paste → Run.

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  ref_id text not null unique check (ref_id ~ '^NO-[A-Z0-9]{4,10}$'),
  headline text not null check (char_length(headline) between 1 and 120),
  story text not null check (char_length(story) between 30 and 5000),
  category text not null check (char_length(category) <= 40),
  location text not null check (char_length(location) <= 120),
  edition text check (char_length(edition) <= 40),
  evidence text[] not null default '{}',
  links text check (char_length(links) <= 2000),
  contacts text check (char_length(contacts) <= 1000),
  covered text check (covered in ('no','partial','yes')),
  submitter_name text not null check (char_length(submitter_name) <= 80),
  submitter_email text not null check (char_length(submitter_email) <= 120 and submitter_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  submitter_phone text check (char_length(submitter_phone) <= 20),
  relation text check (char_length(relation) <= 60),
  privacy text not null check (privacy in ('named','anon','ask')),
  consent boolean not null,
  -- editorial pipeline state, advanced by the agent runner / editor dashboard
  status text not null default 'new' check (status in ('new','researching','questions_sent','drafted','stalled','approved','rejected','published')),
  confirmation_sent_at timestamptz,
  confirmation_message_id text,
  created_at timestamptz not null default now()
);

alter table public.submissions enable row level security;

-- public form: insert only, consent required; no read/update/delete for anon
create policy "anon can file submissions"
  on public.submissions for insert
  to anon
  with check (consent = true);

-- newsroom tooling (service role bypasses RLS; authenticated editors read everything)
create policy "authenticated editors read submissions"
  on public.submissions for select
  to authenticated
  using (true);

create policy "editors update submissions"
  on public.submissions for update
  to authenticated
  using (true)
  with check (true);

create index submissions_status_idx on public.submissions (status, created_at desc);

-- Drafts: one row per AI draft version for a submission
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  version int not null default 1,
  status text not null default 'drafted'
    check (status in ('drafted','stalled','rejected_recommendation')),
  confidence_level text check (confidence_level in ('high','medium','low','unverifiable')),
  headline text,
  dek text,
  body text,
  category text,
  tags text[] not null default '{}',
  citations jsonb not null default '[]',
  follow_up_questions jsonb not null default '[]',
  suggested_third_party_outreach jsonb not null default '[]',
  editor_notes text,
  recommend_rejection boolean not null default false,
  rejection_rationale text,
  model text,
  created_at timestamptz not null default now()
);
create index drafts_submission_idx on public.drafts (submission_id, version desc);

-- Follow-ups: a round of questions emailed to the submitter and their reply
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  round int not null default 1,
  questions jsonb not null default '[]',
  gmail_thread_id text,
  gmail_message_id text,
  sent_at timestamptz,
  response_text text,
  responded_at timestamptz,
  status text not null default 'sent'
    check (status in ('sent','responded','stalled')),
  created_at timestamptz not null default now()
);
create index follow_ups_submission_idx on public.follow_ups (submission_id, round desc);
create index follow_ups_open_idx on public.follow_ups (status, sent_at);

-- Agent runs: audit log of each Claude invocation
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete cascade,
  phase text not null check (phase in ('research','draft')),
  model text,
  input_tokens int,
  output_tokens int,
  status text not null default 'ok' check (status in ('ok','error')),
  error text,
  created_at timestamptz not null default now()
);
create index agent_runs_submission_idx on public.agent_runs (submission_id, created_at desc);

-- Publications: record of a draft pushed to WordPress
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  draft_id uuid not null references public.drafts(id) on delete cascade,
  wordpress_post_id text,
  wordpress_url text,
  wp_status text not null default 'draft' check (wp_status in ('draft','publish')),
  byline text,
  editor_name text,
  published_at timestamptz not null default now()
);
create index publications_submission_idx on public.publications (submission_id);

-- RLS: enable on the rest
alter table public.drafts enable row level security;
alter table public.follow_ups enable row level security;
alter table public.agent_runs enable row level security;
alter table public.publications enable row level security;

-- Authenticated editors can read everything (service role bypasses RLS for the runner)
create policy "editors read drafts" on public.drafts for select to authenticated using (true);
create policy "editors update drafts" on public.drafts for update to authenticated using (true);
create policy "editors read follow_ups" on public.follow_ups for select to authenticated using (true);
create policy "editors read agent_runs" on public.agent_runs for select to authenticated using (true);
create policy "editors read publications" on public.publications for select to authenticated using (true);
create policy "editors write publications" on public.publications for insert to authenticated with check (true);
