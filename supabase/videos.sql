-- Video posting queue. Idempotent — safe to re-run.

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  ref_id text not null,
  narration text,
  tiktok_caption text,
  youtube_title text,
  youtube_description text,
  duration_ms int,
  local_path text,
  status text not null default 'ready_to_post'
    check (status in ('rendering','ready_to_post','posted_tiktok','posted_youtube','posted_all','skipped')),
  posted_tiktok_at timestamptz,
  posted_youtube_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists videos_status_idx on public.videos (status, created_at desc);

alter table public.videos enable row level security;

drop policy if exists "editors read videos" on public.videos;
create policy "editors read videos" on public.videos for select to authenticated using (true);

drop policy if exists "editors update videos" on public.videos;
create policy "editors update videos" on public.videos for update to authenticated using (true);

notify pgrst, 'reload schema';
