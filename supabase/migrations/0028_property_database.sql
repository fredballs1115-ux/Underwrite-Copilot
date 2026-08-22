-- ============================================================================
-- 0028 — the property database + journal + data-steward layer (national
-- expansion). Additive only.
--
--   properties       — parcel/assessment rows from government bulk data
--   recorded_sales   — deed-recorded transactions (the comps fuel), PostGIS-
--                      indexed for radius queries
--   journal_entries  — one dated CRE journal entry per day (daily cron)
--   data_issues      — steward findings (dead links, stale data, checks)
--   data_changelog   — every correction, old→new, visible — never silent
--   steward_runs     — heartbeat: last run + result (footer trust marker)
--
-- Single-family is EXCLUDED at ingestion (normalizer drops it); the schema
-- stores what remains. Scale note: parcels are millions of rows nationally —
-- the free Supabase tier (500 MB) fits roughly Mid-Atlantic sales + one
-- metro's parcels; the plan decision lives in SHIPPED.md → YOUR TASKS.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

create extension if not exists postgis;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  market text not null,                 -- 'philadelphia', 'dc', 'md', ...
  parcel_id text not null,
  address text,
  lat double precision,
  lng double precision,
  land_use_raw text,                    -- the source's own code, verbatim
  asset_class text not null,            -- normalized; never 'sfr'
  units int,
  building_sf numeric,
  year_built int,
  assessed_value numeric,
  owner_name text,
  owner_mailing text,
  owner_absentee boolean,               -- mailing ≠ situs (off-market signal)
  source_dataset text not null,
  source_url text not null,
  ingested_at timestamptz not null default now(),
  unique (market, parcel_id)
);

create index if not exists properties_market_class_idx
  on public.properties (market, asset_class);
create index if not exists properties_year_built_idx
  on public.properties (market, year_built);
create index if not exists properties_owner_idx
  on public.properties (market, owner_name);

create table if not exists public.recorded_sales (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  parcel_id text,
  address text not null,
  sale_date date not null,
  price numeric not null,
  deed_type text,
  buyer text,
  seller text,
  asset_class text,                     -- normalized when the source carries use codes
  units int,
  building_sf numeric,
  lat double precision,
  lng double precision,
  geog geography(Point, 4326),          -- filled by trigger; GiST-indexed
  source_dataset text not null,
  source_url text not null,
  ingested_at timestamptz not null default now(),
  unique (market, parcel_id, sale_date, price)
);

create or replace function public.recorded_sales_set_geog()
returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geog := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  end if;
  return new;
end $$;

drop trigger if exists recorded_sales_geog on public.recorded_sales;
create trigger recorded_sales_geog
  before insert or update on public.recorded_sales
  for each row execute function public.recorded_sales_set_geog();

create index if not exists recorded_sales_geog_idx
  on public.recorded_sales using gist (geog);
create index if not exists recorded_sales_market_date_idx
  on public.recorded_sales (market, sale_date desc);

-- The comps engine's core query: nearby sales by radius/class/recency.
-- SECURITY DEFINER so signed-in users can call it through PostgREST rpc
-- while the tables stay service-role-write-only.
create or replace function public.nearby_sales(
  in_lat double precision,
  in_lng double precision,
  in_radius_m double precision default 1600,
  in_asset_class text default null,
  in_months int default 24,
  in_limit int default 80
) returns setof public.recorded_sales
language sql stable security definer set search_path = public as $$
  select *
  from public.recorded_sales s
  where s.geog is not null
    and ST_DWithin(
      s.geog,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      in_radius_m
    )
    and s.sale_date >= (current_date - make_interval(months => in_months))
    and (in_asset_class is null or s.asset_class = in_asset_class)
  order by s.geog <-> ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography
  limit least(in_limit, 200);
$$;

create table if not exists public.journal_entries (
  entry_date date primary key,
  title text not null,
  markdown text not null,
  topics text[] not null default '{}',
  markets text[] not null default '{}',
  sources jsonb not null default '[]',  -- [{title,url}]
  status text not null default 'ok' check (status in ('ok','fetch_failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.data_issues (
  id uuid primary key default gen_random_uuid(),
  kind text not null,        -- 'dead_link' | 'stale' | 'consistency' | 'disputed' | 'steward_error'
  subject text not null,     -- url / table+key / check name
  detail text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists data_issues_open_idx
  on public.data_issues (kind) where resolved_at is null;

create table if not exists public.data_changelog (
  id uuid primary key default gen_random_uuid(),
  subject text not null,     -- what changed (table/key or claim id)
  old_value text,
  new_value text,
  reason text not null,
  source_url text,
  changed_at timestamptz not null default now()
);

create table if not exists public.steward_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checks_run int not null default 0,
  issues_found int not null default 0,
  notes text
);

alter table public.properties enable row level security;
alter table public.recorded_sales enable row level security;
alter table public.journal_entries enable row level security;
alter table public.data_issues enable row level security;
alter table public.data_changelog enable row level security;
alter table public.steward_runs enable row level security;

-- All reference data: signed-in read, service-role write (no write policies).
drop policy if exists "read properties" on public.properties;
create policy "read properties" on public.properties for select to authenticated using (true);
drop policy if exists "read recorded sales" on public.recorded_sales;
create policy "read recorded sales" on public.recorded_sales for select to authenticated using (true);
drop policy if exists "read journal" on public.journal_entries;
create policy "read journal" on public.journal_entries for select to authenticated using (true);
drop policy if exists "read data issues" on public.data_issues;
create policy "read data issues" on public.data_issues for select to authenticated using (true);
drop policy if exists "read changelog" on public.data_changelog;
create policy "read changelog" on public.data_changelog for select to authenticated using (true);
drop policy if exists "read steward runs" on public.steward_runs;
create policy "read steward runs" on public.steward_runs for select to authenticated using (true);
