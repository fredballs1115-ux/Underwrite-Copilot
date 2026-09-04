-- ============================================================================
-- WHICH MIGRATIONS HAVE ACTUALLY RUN?
--
-- Paste this whole file into the Supabase SQL editor and press Run. It reads
-- the live schema and reports one row per migration: ✅ run, or ❌ NOT RUN
-- with the exact tables/columns that are missing.
--
-- It changes NOTHING. It is a read-only query — safe to run any time, on any
-- environment, as often as you like.
--
-- Why this file exists: the repo's own notes have disagreed about whether
-- migration 0028 was ever run. Documents go stale; the schema cannot. Run
-- this and the answer is a fact rather than an inference.
--
-- Validated against a real Postgres 16: run on an empty database it reports
-- every row ❌; after applying supabase/migrations/*.sql in order it reports
-- every row ✅ except 0028, which fails on its PostGIS prerequisite — see the
-- note below. So both the positive and the negative case are exercised, not
-- assumed.
--
-- ── HOW TO READ THE RESULT ──────────────────────────────────────────────────
-- Every ❌ row names a file in supabase/migrations/. Run those files, in
-- ascending order, one at a time, each one WHOLE. (The SQL editor runs only
-- the highlighted text if anything is selected — click once at the end of the
-- pasted text so nothing is highlighted.) Then re-run this file: every row
-- should read ✅.
--
-- ── IF 0028 COMES BACK ❌, READ THIS FIRST ──────────────────────────────────
-- 0028 is the only migration with an outside prerequisite: its line 21 is
-- `create extension if not exists postgis;` (recorded_sales stores a
-- geography(Point) column, keeps it current with a trigger, GiST-indexes it,
-- and searches it with ST_DWithin). If PostGIS is not enabled, that line
-- errors and Postgres ROLLS THE WHOLE FILE BACK — so 0028 leaves behind
-- exactly nothing, and looks like it was never run even if you ran it.
--
-- Fix: Supabase Dashboard → Database → Extensions → search "postgis" →
-- toggle it on. Then run 0028 again. (Every other migration applies to a
-- stock Postgres 16 with no extensions beyond pgcrypto.)
--
-- ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────────
-- Migrations that only add indexes, policies, functions or data changes leave
-- no table/column fingerprint, so they are not listed:
--   0002, 0004, 0005, 0006, 0008–0015, 0019, 0021, 0029
-- All of them are idempotent and safe to re-run. 0029 in particular is
-- DELETE-only (it trims regulatory rules to the 15-market scope) — if the
-- database was seeded before that cut, run 0029 again; it cannot double-delete.
-- ============================================================================

with
  -- Migrations identified by the tables they create.
  tbl (seq, migration, unblocks, needs) as (
    values
      (1,  '0001_init.sql',
           'Accounts, saved deals, the analysis queue',
           array['profiles', 'deals', 'analysis_jobs']),
      (3,  '0003_model.sql',
           'OM upload + stored documents',
           array['deal_documents']),
      (7,  '0007_teams.sql',
           'Teams, seats and invites (the Team billing plan)',
           array['teams', 'team_members', 'team_invites']),
      (17, '0017_notes_share_qa_digest.sql',
           'Share links — and can_access_deal(), which 0033 depends on',
           array['deal_shares']),
      (18, '0018_deal_facts.sql',
           'Facts extracted from the OM',
           array['deal_facts']),
      (20, '0020_property_actuals.sql',
           'Rent roll + T-12 uploads against a deal',
           array['deal_rent_rolls', 'deal_t12_statements']),
      (22, '0022_deal_tasks.sql',
           'The deal task list',
           array['deal_tasks']),
      (23, '0023_market_research.sql',
           'Benchmarks, live rates, regulatory rules + alerts (and the rates cron)',
           array['benchmarks', 'rates', 'regulatory_rules', 'regulatory_alerts']),
      (24, '0024_intel.sql',
           'The daily market-intel cron (news digest + red-banner alerts)',
           array['market_intel_items', 'market_intel_digests']),
      (28, '0028_property_database.sql',
           'Property DB, journal, recorded sales, Data Health, the nightly steward',
           array['properties', 'recorded_sales', 'journal_entries',
                 'data_issues', 'data_changelog', 'steward_runs']),
      (30, '0030_deal_versions.sql',
           'Deal → Assumption Bridge',
           array['deal_versions', 'deal_version_bridges']),
      (31, '0031_valuations.sql',
           'Deal → Valuations (the BOV Reconciler)',
           array['valuations']),
      (32, '0032_rent_roll_engine.sql',
           'Deal → Rent roll + the live-formula Excel export',
           array['rent_roll_imports', 'rent_roll_mappings', 'market_leasing_profiles']),
      (33, '0033_submarkets.sql',
           'Submarkets + the deal-page supply card',
           array['submarkets', 'submarket_periods', 'pipeline_properties', 'deal_submarkets'])
  ),

  -- Migrations that only add columns, identified by table.column.
  col (seq, migration, unblocks, needs) as (
    values
      (16, '0016_worker_jobs.sql',
           'The background analysis worker — gates ANALYSIS_WORKER=1',
           array['analysis_jobs.payload', 'analysis_jobs.attempts']),
      (25, '0025_sector_fields.sql',
           'Per-sector deal fields (office/industrial/retail, not just multifamily)',
           array['deals.sector_fields']),
      (26, '0026_public_comps.sql',
           'Public-records comps stored on the deal',
           array['deals.public_comps']),
      (27, '0027_photos.sql',
           'Street View building photos on deal cards',
           array['deals.photo'])
  ),

  tbl_res as (
    select
      t.seq,
      t.migration,
      t.unblocks,
      array(
        select x from unnest(t.needs) as x
        where to_regclass('public.' || x) is null
      ) as missing
    from tbl t
  ),

  col_res as (
    select
      c.seq,
      c.migration,
      c.unblocks,
      array(
        select x from unnest(c.needs) as x
        where not exists (
          select 1
          from information_schema.columns ic
          where ic.table_schema = 'public'
            and ic.table_name = split_part(x, '.', 1)
            and ic.column_name = split_part(x, '.', 2)
        )
      ) as missing
    from col c
  )

select
  r.migration,
  case when cardinality(r.missing) = 0 then '✅ run' else '❌ NOT RUN' end as status,
  r.unblocks,
  coalesce(nullif(array_to_string(r.missing, ', '), ''), '—') as still_missing
from (select * from tbl_res union all select * from col_res) r
order by r.seq;
