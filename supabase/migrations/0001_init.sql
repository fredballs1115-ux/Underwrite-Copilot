-- ============================================================================
-- Underwrite Copilot — initial schema
--
-- Run this ONCE in the Supabase dashboard (SQL Editor) or via the Supabase CLI.
-- It is idempotent: safe to run again if a previous attempt only half-applied.
--
-- IMPORTANT: run the WHOLE file. The SQL editor only runs highlighted text if
-- anything is selected — click once at the end so nothing is highlighted.
--
-- Supabase gives every project an `auth.users` table out of the box. We build
-- our app tables alongside it and use Row-Level Security (RLS) so each user can
-- only ever see their own rows — enforced by the database itself.
-- ============================================================================

-- 1. Tables ------------------------------------------------------------------

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

-- 2. Row-Level Security ------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.analysis_jobs enable row level security;

-- Policies (drop-then-create so re-running this file is safe).
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own deals" on public.deals;
create policy "own deals" on public.deals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own jobs" on public.analysis_jobs;
create policy "own jobs" on public.analysis_jobs
  for all using (
    exists (
      select 1 from public.deals d
      where d.id = analysis_jobs.deal_id and d.user_id = auth.uid()
    )
  );

-- 3. Auto-create a profile row whenever a new user signs up ------------------
-- `security definer` lets the trigger insert past RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Storage (Phase 2): the OM PDFs go in a PRIVATE bucket named
-- 'offering-memoranda'. Create it in the dashboard (Storage → New bucket,
-- "Public" OFF), with policies that let a user read/write only files under
-- their own folder.
-- ----------------------------------------------------------------------------
