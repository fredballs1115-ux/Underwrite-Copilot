-- ============================================================================
-- 0032 — rent roll engine (Phase 3)
--
-- Three tables:
--
--   rent_roll_imports        one uploaded .csv/.xlsx rent roll, normalized to
--                            the canonical lease shape (lib/rentroll/schema.ts)
--                            plus the mapping used and the validation issues
--                            found. The FILE itself lives in Supabase storage
--                            under the deal's own path; only the normalized
--                            rows land here.
--
--   rent_roll_mappings       a user's saved column mapping, keyed on a
--                            signature of the file's header row. The second
--                            upload from the same broker is one click.
--
--   market_leasing_profiles  reusable market leasing assumptions (renewal
--                            probability, market rent, TI/LC split, downtime,
--                            free rent) the user applies across deals.
--
-- Rent rolls are client data. Every table is owner-scoped by RLS, the imports
-- ride the shared deal predicate, and nothing here is readable across tenants.
-- ============================================================================

create table if not exists public.rent_roll_imports (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_document_id uuid references public.deal_documents (id) on delete set null,
  filename text not null,
  /** the roll's as-of date, ISO — analysis start for WALT and rollover */
  as_of_date date,
  /** ColumnMapping: header row, canonical key → column index, monthly flags */
  mapping jsonb not null default '{}'::jsonb,
  /** Lease[] — the normalized rows, the only thing analytics ever reads */
  leases jsonb not null default '[]'::jsonb,
  /** ValidationIssue[] — surfaced, never swallowed */
  issues jsonb not null default '[]'::jsonb,
  /** building NRA the user stated, when they did; null = use the roll's sum */
  nra numeric,
  created_at timestamptz not null default now()
);

create index if not exists rent_roll_imports_deal_idx
  on public.rent_roll_imports (deal_id, created_at desc);

create table if not exists public.rent_roll_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  /** human label, usually the broker or the source system */
  name text not null,
  /** normalized header row joined with '|' — the match key for a re-upload */
  header_signature text not null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rent_roll_mappings_user_signature_idx
  on public.rent_roll_mappings (user_id, header_signature);

create table if not exists public.market_leasing_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  asset_class text not null default 'office',
  /** decimals throughout: 0.65 = 65% renewal probability */
  renewal_probability numeric not null,
  market_rent_psf numeric not null,
  escalation_pct numeric not null,
  term_years numeric not null,
  renewal_ti_psf numeric not null,
  new_ti_psf numeric not null,
  renewal_lc_pct numeric not null,
  new_lc_pct numeric not null,
  downtime_months numeric not null,
  renewal_free_rent_months numeric not null,
  new_free_rent_months numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_leasing_profiles_user_idx
  on public.market_leasing_profiles (user_id, created_at desc);

alter table public.rent_roll_imports enable row level security;
alter table public.rent_roll_mappings enable row level security;
alter table public.market_leasing_profiles enable row level security;

-- Imports: the shared deal predicate for reads, owner for writes. USING does
-- not apply to INSERT, so each verb carries its own policy.
drop policy if exists "read own rent roll imports" on public.rent_roll_imports;
drop policy if exists "create own rent roll imports" on public.rent_roll_imports;
drop policy if exists "update own rent roll imports" on public.rent_roll_imports;
drop policy if exists "delete own rent roll imports" on public.rent_roll_imports;

create policy "read own rent roll imports" on public.rent_roll_imports
  for select using (public.can_access_deal(deal_id));
create policy "create own rent roll imports" on public.rent_roll_imports
  for insert with check (auth.uid() = user_id and public.can_access_deal(deal_id));
create policy "update own rent roll imports" on public.rent_roll_imports
  for update using (public.can_access_deal(deal_id))
  with check (public.can_access_deal(deal_id));
create policy "delete own rent roll imports" on public.rent_roll_imports
  for delete using (public.can_access_deal(deal_id));

-- Mappings and profiles are personal, not per-deal: strictly own-row.
drop policy if exists "own rent roll mappings" on public.rent_roll_mappings;
create policy "own rent roll mappings" on public.rent_roll_mappings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own market leasing profiles" on public.market_leasing_profiles;
create policy "own market leasing profiles" on public.market_leasing_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
