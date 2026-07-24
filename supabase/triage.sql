-- Triage columns + declined status — run once in the SQL Editor.

alter table public.submissions
  add column if not exists triage_category text
    check (triage_category is null or triage_category in
      ('decline_spam','decline_out_of_area','decline_not_news',
       'decline_unverifiable_accusation','research_standard','research_high_risk')),
  add column if not exists triage_rationale text,
  add column if not exists triage_risk_flags text[] not null default '{}';

alter table public.submissions drop constraint submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('new','researching','questions_sent','drafted','stalled',
                    'approved','rejected','published','declined'));

alter table public.agent_runs drop constraint agent_runs_phase_check;
alter table public.agent_runs add constraint agent_runs_phase_check
  check (phase in ('triage','research','draft'));
