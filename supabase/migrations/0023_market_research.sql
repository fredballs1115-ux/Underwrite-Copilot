-- ============================================================================
-- 0023 — market research layer (Phase 2 of the research build)
--
-- Four tables of GLOBAL reference data (not per-user):
--   benchmarks        — sector/metro metric ranges the vs-market panel reads
--   regulatory_rules  — machine-evaluable rent-control/TOPA/licensing rules
--   rates             — daily FRED pulls (10Y, SOFR, 30Y mortgage, CRE delinq)
--   regulatory_alerts — intel-detected likely law changes, red-banner until
--                       dismissed
--
-- Provenance is data, not prose: every row carries source, as_of, and a
-- two-tier status ('verified' = 2+ independent primary sources; 'sourced' =
-- one primary source; 'unverified_not_found' = known unknown — the UI must
-- render the gap, never silently pass). Seeded from /data/research/*.json by
-- scripts/seed-research.mjs (service role); the app treats empty tables as
-- "no data on file", so this migration is safe to run before seeding.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.benchmarks (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  -- '' = sector-wide/national. NOT NULL so (sector, metro, metric) can be the
  -- seeder's upsert key (a nullable column in a unique constraint would let
  -- duplicate sector-wide rows through — NULLs never conflict).
  metro text not null default '',
  metric text not null,
  low numeric,
  high numeric,
  unit text not null default 'usd' check (unit in ('usd','pct','ratio','months','count','usd_month')),
  source text not null,
  as_of date not null,
  status text not null check (status in ('verified','sourced','unverified_not_found')),
  note text,
  created_at timestamptz not null default now(),
  unique (sector, metro, metric)
);

create table if not exists public.regulatory_rules (
  -- Stable slug from the research JSON ('dc-rent-stab-coverage') — the natural
  -- upsert key, and what regulatory_alerts reference.
  id text primary key,
  jurisdiction_state text not null,
  jurisdiction_local text,          -- null = statewide rule
  rule_type text not null,
  applies_if jsonb,
  exempt_if jsonb,
  effect text not null,
  quote text,                        -- verbatim statutory text where captured
  source text,
  as_of date not null,
  status text not null check (status in ('verified','sourced','unverified_not_found')),
  verification text,                 -- how the status was earned
  created_at timestamptz not null default now()
);

create index if not exists regulatory_rules_jurisdiction_idx
  on public.regulatory_rules (jurisdiction_state, jurisdiction_local);

create table if not exists public.rates (
  series_id text not null,           -- FRED series id (DGS10, SOFR, ...)
  obs_date date not null,
  value numeric not null,
  label text,
  fetched_at timestamptz not null default now(),
  primary key (series_id, obs_date)
);

create table if not exists public.regulatory_alerts (
  id uuid primary key default gen_random_uuid(),
  rule_id text references public.regulatory_rules (id) on delete cascade,
  headline text not null,
  url text,
  detail text,
  detected_at timestamptz not null default now(),
  dismissed_at timestamptz,
  -- SET NULL for the same reason as deal_tasks.created_by: an account deletion
  -- must not resurrect a dismissed banner.
  dismissed_by uuid references auth.users (id) on delete set null
);

alter table public.benchmarks enable row level security;
alter table public.regulatory_rules enable row level security;
alter table public.rates enable row level security;
alter table public.regulatory_alerts enable row level security;

-- Reference data: any signed-in user can read; ONLY the service role writes
-- (seeder + cron bypass RLS). No insert/update/delete policies on the first
-- three tables — PostgREST writes from user sessions are denied outright.
drop policy if exists "read benchmarks" on public.benchmarks;
create policy "read benchmarks" on public.benchmarks
  for select to authenticated using (true);

drop policy if exists "read regulatory rules" on public.regulatory_rules;
create policy "read regulatory rules" on public.regulatory_rules
  for select to authenticated using (true);

drop policy if exists "read rates" on public.rates;
create policy "read rates" on public.rates
  for select to authenticated using (true);

drop policy if exists "read regulatory alerts" on public.regulatory_alerts;
create policy "read regulatory alerts" on public.regulatory_alerts
  for select to authenticated using (true);

-- Alerts are the one table users touch: dismissal. Any signed-in user may
-- dismiss (alerts are workspace-global, like the intel digest itself — the
-- single-operator/team model treats "seen it" as shared state).
drop policy if exists "dismiss regulatory alerts" on public.regulatory_alerts;
create policy "dismiss regulatory alerts" on public.regulatory_alerts
  for update to authenticated using (true) with check (true);
