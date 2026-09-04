-- ============================================================================
-- 0030 — public-data layer round 2: incentive zones + per-deal site flags +
-- nearest-parcel lookup. Additive only; companion to 0028's property DB.
--
--   incentive_zones  — tract-level designations (Opportunity Zones first;
--                      TIF/enterprise-zone rows later) from official state /
--                      federal datasets, with per-row provenance
--   deals.site_flags — the background site-check result (census tract, OZ
--                      membership, FEMA flood zone) stored like public_comps:
--                      every failure mode is an honest stored status
--   nearest_property — RPC for the deal page's public-record card: the
--                      closest ingested parcel to a point (properties has no
--                      geography column; small-radius planar math is fine)
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.incentive_zones (
  id uuid primary key default gen_random_uuid(),
  zone_type text not null check (zone_type in ('opportunity_zone','tif','enterprise_zone','abatement')),
  state text not null,                  -- 'MD', 'VA', ... ('' for federal-wide rows)
  tract_geoid text,                     -- 11-digit census tract GEOID (OZ rows)
  name text,                            -- district name where the source has one
  source_dataset text not null,
  source_url text not null,
  ingested_at timestamptz not null default now()
);

-- One row per designation per source; tract-keyed rows upsert on this.
create unique index if not exists incentive_zones_tract_key
  on public.incentive_zones (zone_type, tract_geoid, source_dataset)
  where tract_geoid is not null;
create index if not exists incentive_zones_geoid_idx
  on public.incentive_zones (tract_geoid);

alter table public.deals add column if not exists site_flags jsonb;

-- Closest ingested parcels to a point (deal page public-record card).
-- SECURITY DEFINER like nearby_sales: signed-in read via PostgREST rpc while
-- the table stays service-role-write-only. Planar degree math with a
-- latitude-corrected longitude term — fine at the sub-kilometre radii the
-- card uses.
create or replace function public.nearest_property(
  in_lat double precision,
  in_lng double precision,
  in_radius_m double precision default 120,
  in_limit int default 5
) returns setof public.properties
language sql stable security definer set search_path = public as $$
  select p.*
  from public.properties p
  where p.lat is not null and p.lng is not null
    and p.lat between in_lat - (in_radius_m / 111320.0)
                  and in_lat + (in_radius_m / 111320.0)
    and p.lng between in_lng - (in_radius_m / (111320.0 * greatest(cos(radians(in_lat)), 0.2)))
                  and in_lng + (in_radius_m / (111320.0 * greatest(cos(radians(in_lat)), 0.2)))
  order by ((p.lat - in_lat)^2 + ((p.lng - in_lng) * cos(radians(in_lat)))^2)
  limit least(in_limit, 20);
$$;

alter table public.incentive_zones enable row level security;
drop policy if exists "read incentive zones" on public.incentive_zones;
create policy "read incentive zones" on public.incentive_zones
  for select to authenticated using (true);
