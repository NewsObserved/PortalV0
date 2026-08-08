-- Triage columns + declined status. Idempotent — safe to re-run.
-- The Supabase SQL editor runs a script as ONE transaction: an unguarded
-- drop/add constraint failure rolls back the column additions too, so every
-- statement here is individually guarded.

alter table public.submissions
  add column if not exists triage_category text,
  add column if not exists triage_rationale text,
  add column if not exists triage_risk_flags text[] not null default '{}';

alter table public.submissions drop constraint if exists submissions_triage_category_check;
alter table public.submissions add constraint submissions_triage_category_check
  check (triage_category is null or triage_category in
    ('decline_spam','decline_out_of_area','decline_not_news',
     'decline_unverifiable_accusation','research_standard','research_high_risk'));

alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('new','researching','questions_sent','drafted','stalled',
                    'approved','rejected','published','declined'));

alter table public.agent_runs drop constraint if exists agent_runs_phase_check;
alter table public.agent_runs add constraint agent_runs_phase_check
  check (phase in ('triage','research','draft'));

-- PostgREST caches the schema; without this the new columns 404 via the API.
notify pgrst, 'reload schema';
