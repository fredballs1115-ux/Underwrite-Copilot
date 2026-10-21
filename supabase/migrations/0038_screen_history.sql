-- ============================================================================
-- 0038 — every screen kept, so a scored row never vanishes (the owner's
-- decision of 2026-10-21)
--
-- A DRAFT, not yet run anywhere. Run it whole, in the Supabase SQL editor,
-- after 0037, then supabase/CHECK_MIGRATIONS.sql: its 0038 row should read
-- ✅. It is idempotent.
--
-- deals.prior_screen (0010) holds ONE earlier screen, and each re-screen
-- writes over it, so a third re-screen could drop a row the track record
-- (lib/track-record) had already scored against the first. screen_snapshots
-- keeps every one: each re-screen appends the screen it replaces — the same
-- shape prior_screen holds ({ at, extraction, verdict, challenges }) — one
-- row a screen, unique by the deal and the verdict's own stamp, so a retried
-- write never doubles one. prior_screen stays as it is (the screen diff reads
-- it); this sits beside it.
--
-- The app works before this runs: every write to the table is best-effort
-- (lib/screen-history `keepScreen` logs an error and moves on), and every
-- read falls back to prior_screen alone.
--
-- Who writes: the pipeline with the service role (past row-level security),
-- and a manual deal's facts edit with the signed-in user's session — so a
-- user may append a screen to a deal they can reach (the deal-child tables'
-- shared predicate, can_access_deal from 0017), read the screens of the
-- deals they can reach, and nothing else. The history is append-only: no
-- update or delete policy and no update or delete grant; a deal's deletion
-- takes its screens with it (on delete cascade).
-- ============================================================================

create table if not exists public.screen_snapshots (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  -- the kept screen's verdict stamp (its verdict's generatedAt)
  verdict_at timestamptz not null,
  -- the same shape deals.prior_screen holds
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  constraint screen_snapshots_deal_verdict_key unique (deal_id, verdict_at)
);

create index if not exists screen_snapshots_deal_idx
  on public.screen_snapshots (deal_id, created_at desc);

alter table public.screen_snapshots enable row level security;

-- USING does not apply to INSERT, so each verb gets its own policy, each
-- carrying the deal-access predicate.
drop policy if exists "read deal screen snapshots" on public.screen_snapshots;
drop policy if exists "keep deal screen snapshots" on public.screen_snapshots;

create policy "read deal screen snapshots" on public.screen_snapshots
  for select using (public.can_access_deal(deal_id));

create policy "keep deal screen snapshots" on public.screen_snapshots
  for insert with check (public.can_access_deal(deal_id));

-- Append-only, and nothing for a signed-out caller: Supabase's default
-- privileges grant a new table to anon and authenticated by name.
revoke all on public.screen_snapshots from anon, public;
revoke update, delete, truncate on public.screen_snapshots from authenticated;
grant select, insert on public.screen_snapshots to authenticated;
