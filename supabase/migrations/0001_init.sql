-- ============================================================================
-- Underwrite Copilot — initial schema (DRAFT)
--
-- Applied in Phase 1, when we add accounts. Review before running.
-- Run it in the Supabase dashboard (SQL Editor) or via the Supabase CLI.
--
-- Supabase gives every project an `auth.users` table out of the box. We build
-- our app tables alongside it and use Row-Level Security (RLS) so each user can
-- only ever see their own rows — enforced by the database itself, not just by
-- application code.
-- ============================================================================

-- One profile row per signed-up user.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- A deal = one offering memorandum the user is screening.
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  asset_class text not null default 'auto',
  -- Where the uploaded OM PDF lives in Supabase Storage (path within the bucket).
  om_storage_path text,
  -- Each pipeline step's result, stored as JSON (shapes mirror lib/anthropic/types.ts).
  extraction jsonb,
  challenges jsonb,
  comps jsonb,
  reconciliation jsonb,
  market jsonb,
  verdict jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per analysis run, so the UI can show live progress and we can retry.
create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  -- queued → running → done | error
  status text not null default 'queued',
  -- which step is in flight: 'extract' | 'challenge' | 'comps' | 'reconcile' | 'market' | 'verdict'
  step text,
  progress int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row-Level Security: lock every table to its owner.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.analysis_jobs enable row level security;

-- Profiles: a user can see and edit only their own profile.
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Deals: a user can do anything with their own deals, nothing with others'.
create policy "own deals" on public.deals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Jobs: reachable only through a deal the user owns.
create policy "own jobs" on public.analysis_jobs
  for all using (
    exists (
      select 1 from public.deals d
      where d.id = analysis_jobs.deal_id and d.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Storage (Phase 2): the OM PDFs go in a PRIVATE bucket named
-- 'offering-memoranda'. Create it in the dashboard (Storage → New bucket,
-- "Public" OFF), with policies that let a user read/write only files under
-- their own folder.
-- ----------------------------------------------------------------------------
