-- ============================================================================
-- 0033 — submarket supply & pipeline (Phase 4)
--
-- Exit cap and rent growth are the two assumptions that swing IRR the most,
-- and in most screening tools the user just types a number. These tables hold
-- what the submarket has ACTUALLY done, so those numbers can be checked
-- against it: a deal underwritten to 4% rent growth in a market with 18 months
-- of supply under construction is a bad deal that screens well.
--
-- Licensing: market data belongs to whoever licenses it. Every row here is
-- scoped to the user who imported it. There is deliberately NO shared or
-- cross-tenant market dataset, and no policy that would allow one.
-- ============================================================================

create table if not exists public.submarkets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  metro text,
  asset_class text not null default 'industrial',
  -- ExclusionRules (lib/market/exclusions.ts): subtypes, size band,
  -- owner-occupancy, name patterns. PERSISTENT — a data-center exclusion set
  -- once applies to every future import into this submarket.
  exclusion_rules jsonb not null default '{}'::jsonb,
  -- months of supply above which the exit-cap warning fires (default 24)
  supply_warning_months numeric not null default 24,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submarkets_user_idx on public.submarkets (user_id, created_at desc);

-- One row per reporting period (quarter or year end).
create table if not exists public.submarket_periods (
  id uuid primary key default gen_random_uuid(),
  submarket_id uuid not null references public.submarkets (id) on delete cascade,
  period date not null,
  inventory_sf numeric,
  vacancy_pct numeric,
  net_absorption_sf numeric,
  under_construction_sf numeric,
  asking_rent numeric,
  -- Overall rent and direct NNN rent are DIFFERENT SERIES. Sublease space
  -- contaminating an overall figure can make a trend meaningless, so the basis
  -- is recorded per period and a comparison that mixes bases is flagged.
  rent_basis text check (
    rent_basis in ('nnn_direct', 'nnn_overall', 'gross_direct', 'gross_overall', 'mg')
  ),
  -- where this row came from: the export's filename, 'manual', or a URL for a
  -- web-assisted fill. Never blank — no orphan numbers.
  source text,
  -- true when the figure came from a web search rather than a licensed export
  unverified boolean not null default false,
  source_url text,
  created_at timestamptz not null default now(),
  unique (submarket_id, period)
);

create index if not exists submarket_periods_submarket_idx
  on public.submarket_periods (submarket_id, period);

-- The property-level construction pipeline the summary grid should tie to.
create table if not exists public.pipeline_properties (
  id uuid primary key default gen_random_uuid(),
  submarket_id uuid not null references public.submarkets (id) on delete cascade,
  name text,
  address text,
  sf numeric,
  status text check (status in ('proposed', 'under_construction', 'delivered')),
  expected_delivery date,
  subtype text,
  owner_occupied boolean not null default false,
  excluded boolean not null default false,
  exclusion_reason text,
  -- a round-number placeholder, or a delivery date that has come and gone —
  -- flagged for manual review rather than trusted
  stale_flag boolean not null default false,
  stale_reason text,
  source text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_properties_submarket_idx
  on public.pipeline_properties (submarket_id);

-- Links a deal to a submarket, and records assumption warnings the analyst
-- dismissed. Overriding a check is normal; doing it silently is not — the
-- reason is required and lands in the deal memo.
create table if not exists public.deal_submarkets (
  deal_id uuid not null references public.deals (id) on delete cascade,
  submarket_id uuid not null references public.submarkets (id) on delete cascade,
  -- [{ code, reason, by, at }]
  dismissals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (deal_id)
);

alter table public.submarkets enable row level security;
alter table public.submarket_periods enable row level security;
alter table public.pipeline_properties enable row level security;
alter table public.deal_submarkets enable row level security;

-- Submarkets are personal: a user's imported market data is theirs alone.
drop policy if exists "own submarkets" on public.submarkets;
create policy "own submarkets" on public.submarkets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Children inherit the parent's ownership. Expressed as a security-invoker
-- helper so every policy asks the same question exactly once.
create or replace function public.owns_submarket(p_submarket uuid)
returns boolean
language sql
security invoker
stable
as $$
  select exists (
    select 1 from public.submarkets s
    where s.id = p_submarket and s.user_id = auth.uid()
  );
$$;

drop policy if exists "own submarket periods" on public.submarket_periods;
create policy "own submarket periods" on public.submarket_periods
  for all using (public.owns_submarket(submarket_id))
  with check (public.owns_submarket(submarket_id));

drop policy if exists "own pipeline properties" on public.pipeline_properties;
create policy "own pipeline properties" on public.pipeline_properties
  for all using (public.owns_submarket(submarket_id))
  with check (public.owns_submarket(submarket_id));

-- The link needs BOTH: access to the deal and ownership of the submarket, so a
-- teammate can't attach market data they can't see.
drop policy if exists "own deal submarkets" on public.deal_submarkets;
create policy "own deal submarkets" on public.deal_submarkets
  for all using (public.can_access_deal(deal_id) and public.owns_submarket(submarket_id))
  with check (public.can_access_deal(deal_id) and public.owns_submarket(submarket_id));
