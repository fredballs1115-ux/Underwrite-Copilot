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
-- Every ❌ row names a file in supabase/migrations/. Run those files, TOP TO
-- BOTTOM IN THE ORDER THIS QUERY PRINTS THEM, one at a time, each one WHOLE.
-- (The SQL editor runs only the highlighted text if anything is selected —
-- click once at the end of the pasted text so nothing is highlighted.) Then
-- re-run this file: every row should read ✅.
--
-- ── TWO ORDERING TRAPS ──────────────────────────────────────────────────────
-- 1. **0028 needs PostGIS.** Its FIRST statement, on line 21, is
--    `create extension if not exists postgis;` (recorded_sales stores a
--    geography(Point) column, keeps it current with a trigger, GiST-indexes
--    it, and searches it with ST_DWithin). With the extension not enabled
--    that statement errors — and because it is first, nothing in the file
--    gets created at all, which is exactly what makes 0028 look like it was
--    never run even if you ran it. Fix: Supabase Dashboard → Database →
--    Extensions → search "postgis" → toggle it on, then run 0028 again.
--    (Every other migration applies to a stock Postgres 16 with no
--    extensions beyond pgcrypto.)
--
-- 2. **There are TWO files numbered 0030**, added by different branches:
--    `0030_deal_versions.sql` and `0030_public_data_layer.sql`. They are
--    unrelated and both are needed, but they are NOT interchangeable in
--    order: `0030_public_data_layer.sql` declares an RPC returning
--    `setof public.properties`, so it FAILS with
--    `type "public.properties" does not exist` unless 0028 ran first. This
--    query lists it after 0028 for that reason.
--
--    Worse, it fails HALFWAY. Verified by applying it to a database where
--    0028 was missing: `incentive_zones` and `deals.site_flags` were created
--    and kept, and only the RPC was lost. A table-only check would call that
--    migration done. So this query checks the function too — if you see the
--    RPC row ❌ while the other two read ✅, that is this exact half-applied
--    state: run 0028, then run 0030_public_data_layer again (it is
--    idempotent, so the parts that already landed are harmless).
--
-- ── WHAT THIS CANNOT SEE ────────────────────────────────────────────────────
-- Migrations that only add indexes, policies, functions or data changes leave
-- no table/column fingerprint, so they are not listed:
--   0002, 0004, 0005, 0006, 0008–0015, 0019, 0021, 0029
-- All of them are idempotent and safe to re-run. 0029 in particular is
-- DELETE-only (it trims regulatory rules to the 15-market scope) — if the
-- database was seeded before that cut, run 0029 again; it cannot double-delete.
--
-- 0036 adds no table or column either, so it is read four other ways: by the
-- four triggers it creates, by the grants it takes away, by what its
-- worker's-queue guard says, and by the alert banner's write it closes (any
-- role that can still update the two dismissal columns, and any write policy
-- left on the table, is named). On its grants row, "still_missing" names each
-- public-record RPC a signed-out caller can still run — the thing 0036
-- closes — or that does not exist yet, since a grant on a function 0028
-- never made has not been taken away: run 0028 and 0030_public_data_layer,
-- then 0036 again (it is idempotent). The queue guard's row reads the
-- trigger's and the function's definitions, not just their names: the
-- first draft of 0036 had both, fired only on a changed created_at, and let
-- a re-queued screen keep its old place in line. A ❌ there means the draft
-- is what ran — run 0036 again — or, with 0016's row ❌ too, that 0016 has
-- not run (the guard needs its payload column): run 0016, then 0036.
--
-- 0037 (a draft until the owner runs it, after 0036) is read the same way:
-- its one-live-job trigger by its definition and its function's body — a
-- trigger that does not fire on a change of status, deal, payload or last
-- write, or a function without the deal's lock or the ten-minute window, is
-- not 0037's guard — and the two public-record lookups by their bodies, each
-- holding its radius and its rows to the app's own asks. A lookup that does
-- not exist is named too, as on 0036's grants row: run 0028 and
-- 0030_public_data_layer, then 0036 and 0037 again.
-- ============================================================================

with
  -- Migrations identified by the tables they create.
  tbl (seq, migration, unblocks, needs) as (
    values
      (10,  '0001_init.sql',
            'Accounts, saved deals, the analysis queue',
            array['profiles', 'deals', 'analysis_jobs']),
      (30,  '0003_model.sql',
            'OM upload + stored documents',
            array['deal_documents']),
      (70,  '0007_teams.sql',
            'Teams, seats and invites (the Team billing plan)',
            array['teams', 'team_members', 'team_invites']),
      (170, '0017_notes_share_qa_digest.sql',
            'Share links — and can_access_deal(), which 0033 depends on',
            array['deal_shares']),
      (180, '0018_deal_facts.sql',
            'Facts extracted from the OM',
            array['deal_facts']),
      (200, '0020_property_actuals.sql',
            'Rent roll + T-12 uploads against a deal',
            array['deal_rent_rolls', 'deal_t12_statements']),
      (220, '0022_deal_tasks.sql',
            'The deal task list',
            array['deal_tasks']),
      (230, '0023_market_research.sql',
            'Benchmarks, live rates, regulatory rules + alerts (and the rates cron)',
            array['benchmarks', 'rates', 'regulatory_rules', 'regulatory_alerts']),
      (240, '0024_intel.sql',
            'The daily market-intel cron (news digest + red-banner alerts)',
            array['market_intel_items', 'market_intel_digests']),
      (280, '0028_property_database.sql',
            'Property DB, journal, recorded sales, Data Health, the nightly steward',
            array['properties', 'recorded_sales', 'journal_entries',
                  'data_issues', 'data_changelog', 'steward_runs']),
      (290, '0030_public_data_layer.sql  ← run AFTER 0028',
            'Opportunity-zone / incentive-zone lookups + the nearest-parcel RPC',
            array['incentive_zones']),
      (300, '0030_deal_versions.sql',
            'Deal → Assumption Bridge',
            array['deal_versions', 'deal_version_bridges']),
      (310, '0031_valuations.sql',
            'Deal → Valuations (the BOV Reconciler)',
            array['valuations']),
      (320, '0032_rent_roll_engine.sql',
            'Deal → Rent roll + the live-formula Excel export',
            array['rent_roll_imports', 'rent_roll_mappings', 'market_leasing_profiles']),
      (330, '0033_submarkets.sql',
            'Submarkets + the deal-page supply card',
            array['submarkets', 'submarket_periods', 'pipeline_properties', 'deal_submarkets'])
  ),

  -- Migrations that only add columns, identified by table.column.
  col (seq, migration, unblocks, needs) as (
    values
      (160, '0016_worker_jobs.sql',
            'The background analysis worker — gates ANALYSIS_WORKER=1',
            array['analysis_jobs.payload', 'analysis_jobs.attempts']),
      (250, '0025_sector_fields.sql',
            'Per-sector deal fields (office/industrial/retail, not just multifamily)',
            array['deals.sector_fields']),
      (260, '0026_public_comps.sql',
            'Public-records comps stored on the deal',
            array['deals.public_comps']),
      (270, '0027_photos.sql',
            'Street View building photos on deal cards',
            array['deals.photo']),
      (291, '0030_public_data_layer.sql (site flags half)',
            'The deal page’s site-check card: census tract, OZ, FEMA flood zone',
            array['deals.site_flags'])
  ),

  -- Functions, so a migration that failed halfway can't read as done.
  fn (seq, migration, unblocks, needs) as (
    values
      (292, '0030_public_data_layer.sql (RPC half)',
            'nearest_property() — the deal page’s closest-parcel lookup. ❌ here with the two rows above ✅ means 0028 was missing when you ran it: run 0028, then this file again.',
            array['nearest_property']),
      (340, '0034_authorization_hardening.sql',
            'Storage-path guards on deals / deal_documents / jobs / branding, and the alerts column grant (the eleventh review)',
            array['deals_storage_guard', 'deal_documents_storage_guard'])
  ),

  -- Triggers, for a migration whose work is a guard on a table that exists.
  trg (seq, migration, unblocks, needs) as (
    values
      (360, '0036_security_hardening.sql',
            'Share links held to 30 days with a token the database makes; the free-deal cap on sample flips and team moves; the worker’s queue in the order runs were asked for; Ask’s question cap',
            array['deal_shares_mint_guard', 'enforce_free_deal_cap_update',
                  'analysis_jobs_queue_guard', 'deal_qa_append_only'])
  ),

  -- Grants: a function a signed-out caller must not be able to run.
  priv (seq, migration, unblocks, needs) as (
    values
      (361, '0036_security_hardening.sql (grants half)',
            'Owner names and mailing addresses kept behind sign-in: the public-record RPCs closed to the anon key. ❌ names each one a signed-out caller can still run — or that does not exist yet: then run 0028 and 0030_public_data_layer first, and 0036 again.',
            array['nearby_sales', 'nearest_property'])
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
  ),

  fn_res as (
    select
      f.seq,
      f.migration,
      f.unblocks,
      array(
        select x from unnest(f.needs) as x
        where to_regproc('public.' || x) is null
      ) as missing
    from fn f
  ),

  trg_res as (
    select
      t.seq,
      t.migration,
      t.unblocks,
      array(
        select x from unnest(t.needs) as x
        where not exists (
          select 1
          from pg_trigger g
          join pg_class c on c.oid = g.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and g.tgname = x and not g.tgisinternal
        )
      ) as missing
    from trg t
  ),

  priv_res as (
    select
      p.seq,
      p.migration,
      p.unblocks,
      array(
        select x from unnest(p.needs) as x
        where to_regproc('public.' || x) is null
           or has_function_privilege('anon', to_regproc('public.' || x)::oid, 'execute')
      ) as missing
    from priv p
  ),

  -- A guard read by what it says: the worker's-queue trigger must fire on a
  -- change of status or payload as well as created_at, and its function must
  -- restamp a row a user's write puts back in the queue.
  queue_res as (
    select
      362 as seq,
      '0036_security_hardening.sql (the queue guard''s rules)' as migration,
      'A re-queued screen goes to the back of the worker''s queue, never back to its old place in line. ❌ names the part still in its first draft: run 0036 again (and 0016 first, if its row above is ❌).' as unblocks,
      array_remove(array[
        case when not exists (
          select 1
          from pg_trigger g
          join pg_class c on c.oid = g.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'analysis_jobs'
            and g.tgname = 'analysis_jobs_queue_guard' and not g.tgisinternal
            and pg_get_triggerdef(g.oid) like '%BEFORE INSERT OR UPDATE OF created_at, status, payload ON %'
        ) then 'trigger analysis_jobs_queue_guard on created_at, status, payload' end,
        case when not exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'analysis_jobs_queue_guard'
            and regexp_replace(p.prosrc, '\s+', ' ', 'g')
                like '%(new.status = ''queued'' and old.status is distinct from ''queued'')%'
            and regexp_replace(p.prosrc, '\s+', ' ', 'g')
                like '%(new.status = ''queued'' and new.payload is not null and old.payload is null)%'
        ) then 'analysis_jobs_queue_guard() restamping a re-queued row' end
      ], null) as missing
  ),

  -- 0037's guard read by what it says: a user's write may not leave a deal
  -- with two live job rows, checked under the deal's lock against rows
  -- written in the last ten minutes (the app's stall rule).
  one_live_res as (
    select
      370 as seq,
      '0037_job_queue_and_lookups.sql (one live job a deal)' as migration,
      'A deal runs one screen at a time: no signed-in write can add a second queued or running job row beside a live one. ❌ names what is missing: run 0037 (after 0036; and 0016 first, if its row above is ❌).' as unblocks,
      array_remove(array[
        case when not exists (
          select 1
          from pg_trigger g
          join pg_class c on c.oid = g.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'analysis_jobs'
            and g.tgname = 'analysis_jobs_one_live_run' and not g.tgisinternal
            and pg_get_triggerdef(g.oid) like '%BEFORE INSERT OR UPDATE OF status, deal_id, payload, updated_at ON %'
        ) then 'trigger analysis_jobs_one_live_run on status, deal_id, payload, updated_at' end,
        case when not exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'analysis_jobs_one_live_run'
            and p.prosrc like '%pg_advisory_xact_lock%'
            and p.prosrc like '%interval ''10 minutes''%'
            and p.prosrc like '%auth.uid() is null%'
        ) then 'analysis_jobs_one_live_run() holding the deal''s lock and the ten-minute window' end
      ], null) as missing
  ),

  -- 0037's lookups read by what they say: each holds its radius and its rows
  -- to the most the app asks (lib/public-record-asks).
  lookups_res as (
    select
      371 as seq,
      '0037_job_queue_and_lookups.sql (the public-record lookups)' as migration,
      'The parcel and recorded-sale lookups answer no wider and no longer than the app ever asks: 120 m and one parcel, 4,800 m and 80 sales. ❌ names each lookup still taking any radius — or that does not exist yet: then run 0028 and 0030_public_data_layer first, and 0036 and 0037 again.' as unblocks,
      array(
        select x.name
        from (values
          ('nearest_property', array['least(in_radius_m, 120)', 'least(in_limit, 1)']),
          ('nearby_sales', array['least(in_radius_m, 4800)', 'least(in_limit, 80)'])
        ) as x(name, caps)
        where not exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = x.name
            and (select bool_and(p.prosrc like '%' || c || '%') from unnest(x.caps) as c)
        )
      ) as missing
  ),

  -- A write taken away: no signed-in session may update a regulatory alert,
  -- a row every user's banner reads. Names each role that still can, and
  -- each write policy still on the table.
  alerts_res as (
    select
      363 as seq,
      '0036_security_hardening.sql (the alert banner''s write)' as migration,
      'No signed-in user can stamp a regulatory alert every other user sees: 0034''s two-column grant taken back, 0023''s open update policy dropped. ❌ names what is still open: run 0036 again (0023 first, if the table is named).' as unblocks,
      case
        when to_regclass('public.regulatory_alerts') is null then array['regulatory_alerts (0023)']
        else array(
          select format('update (%s) for %s', c.col, r.role)
          from unnest(array['anon', 'authenticated']) as r(role)
          cross join unnest(array['dismissed_at', 'dismissed_by']) as c(col)
          where has_column_privilege(r.role, to_regclass('public.regulatory_alerts'), c.col, 'UPDATE')
          union all
          select format('policy "%s" for %s', p.policyname, lower(p.cmd))
          from pg_policies p
          where p.schemaname = 'public' and p.tablename = 'regulatory_alerts' and p.cmd <> 'SELECT'
        )
      end as missing
  )

select
  r.migration,
  case when cardinality(r.missing) = 0 then '✅ run' else '❌ NOT RUN' end as status,
  r.unblocks,
  coalesce(nullif(array_to_string(r.missing, ', '), ''), '—') as still_missing
from (
  select * from tbl_res
  union all select * from col_res
  union all select * from fn_res
  union all select * from trg_res
  union all select * from priv_res
  union all select * from queue_res
  union all select * from alerts_res
  union all select * from one_live_res
  union all select * from lookups_res
) r
order by r.seq;
