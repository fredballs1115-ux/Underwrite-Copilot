-- ============================================================================
-- 0026 — public-record comps (auto-comps v2)
--
-- Comparable SALES pulled automatically from government open-data portals the
-- moment a deal has an address: Philadelphia OPA (Carto SQL API), DC Open
-- Data (ArcGIS), Maryland SDAT (Socrata). Free, license-clean primary
-- sources — never CoStar or any paywalled database. Results are cached on
-- the deal as jsonb (shape: lib/public-comps/core.ts -> RecordCompsResult)
-- with provider, dataset URL, retrieval time, and an honesty note; rows are
-- public records, not appraisals.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

alter table public.deals
  add column if not exists public_comps jsonb;
