-- ============================================================================
-- 0037 — one live job a deal, and the public-record lookups held to the
-- app's own asks (research pass 39)
--
-- A DRAFT, not yet run anywhere. Run it AFTER 0036, whole, in the Supabase
-- SQL editor, then supabase/CHECK_MIGRATIONS.sql: its 0037 rows should read
-- ✅. After 0036 because part 2 replaces the two functions whose grants 0036
-- takes away, and a replaced function keeps the grants it has — run first,
-- 0037 would leave them as 0028 and 0030 granted them, until 0036 ran. It is
-- idempotent, and each block checks that what it guards exists.
--
-- Who is trusted, as in 0036: the web's server actions write with the
-- signed-in user's session, so auth.uid() is that user; the worker, the
-- in-process pipeline and every other back-office writer use the service
-- role, and the SQL editor runs as postgres — both have auth.uid() null, and
-- the guard in part 1 leaves them alone.
--
--   1. One live job a deal. analysis_jobs is writable by the deal's owner
--      and teammates (0007's "own jobs" policy, which says nothing about a
--      row's status or how many a deal has), and the worker runs the queued
--      rows that carry a payload; 0036 places a user's queued row at the
--      back of the line, and nothing held a deal to one run. The app keeps
--      one job row a deal and starts a run by claiming that row (lib/jobs
--      claimJob), answering "busy" while a run is live, so a second live
--      row is never the app's. A signed-in user's write that would leave a
--      deal with two live rows — queued or running — is now refused
--      ('analysis_job_already_live'): an insert of a live row, or an update
--      that makes a row live (its status, its deal, its payload or its last
--      write), while another row of the same deal is live. The worker holds
--      the same rule on its side today (lib/worker-queue), whatever rows it
--      finds; this keeps them from being written.
--
--      "Live" is the app's own stall rule (lib/screen-run STALE_MS): a row
--      that has written nothing for ten minutes is a run whose process
--      died, which claimJob reclaims, so it never blocks a new run. A user's
--      write of a live row is dated by the database (updated_at := now()),
--      so the ten minutes are the database's clock, never the writer's.
--      Writes for one deal take turns on a transaction lock keyed by the
--      deal, so two at the same moment are checked one after the other.
--
--      The app's writes pass it: a new deal's first row (createDealCore,
--      createManualDeal) has no other row beside it; claimJob reuses the
--      deal's one row, after finding it not live, or live and stalled; the
--      held row handed to the worker (a facts save, a replaced OM, a model
--      upload) is that same row; releaseClaim writes 'error', which is not
--      live. The worker's claims, its re-queue after a deploy and the
--      pipeline's progress writes run as the service role and are never
--      checked. One write can now fail where it did not: on a deal holding
--      more than one job row from before claimJob kept them to one, the
--      comp search's and model build's follow-up update (status 'running'
--      on every row of the deal) is refused as a whole, since it would make
--      the older rows live beside the claimed one — the run itself starts
--      as before on the row its claim took, and only that update's
--      progress figure is lost.
--
--      Needs 0016's payload column (the trigger names it); without it there
--      is no worker and nothing to queue, and the trigger is left off.
--
--   2. The public-record lookups. nearest_property (0030) and nearby_sales
--      (0028) are SECURITY DEFINER, so they read past the tables' own
--      policies, and each took any radius it was handed — nearest_property
--      capped its rows at 20 and nearby_sales at 200, and neither its
--      reach. Each now holds the radius and the rows to the most the app
--      itself ever asks for (lib/public-record-asks, which both callers
--      read): nearest_property 120 m and one parcel, the deal page's card;
--      nearby_sales 4,800 m — the comps pull's three-mile widening — and 80
--      sales. A larger ask is answered at the cap, never refused, so no
--      caller of the app sees a change. Everything else in each body is the
--      original's, line for line, and the arguments, their defaults and the
--      return type are unchanged, so the call is the same call. nearby_sales
--      needs 0028 (and PostGIS), nearest_property 0030_public_data_layer;
--      a database without one is left as it is.
--
-- Rolling back: see the end of the file.
-- ============================================================================

-- 1. One live job a deal -----------------------------------------------------
create or replace function public.analysis_jobs_one_live_run()
returns trigger
language plpgsql
as $$
begin
  -- The service role and the SQL editor are trusted, as in 0036.
  if auth.uid() is null then
    return new;
  end if;
  -- A row left queued or running is a live run; anything else makes none.
  if new.status is distinct from 'queued' and new.status is distinct from 'running' then
    return new;
  end if;
  -- A live row a user writes is written now: the ten-minute window below is
  -- the database's clock, never the writer's.
  new.updated_at := now();
  -- One user's write for this deal at a time: two at once are checked one
  -- after the other, the second seeing the first.
  perform pg_advisory_xact_lock(hashtextextended('analysis_jobs one live run ' || new.deal_id::text, 0));
  if exists (
    select 1
      from public.analysis_jobs j
     where j.deal_id = new.deal_id
       and j.id <> new.id
       and j.status in ('queued', 'running')
       and j.updated_at > now() - interval '10 minutes'
  ) then
    raise exception 'analysis_job_already_live'
      using hint = 'A deal runs one screen at a time: another run of this deal is queued or running.';
  end if;
  return new;
end;
$$;

-- "of status, deal_id, payload, updated_at": every column a write could make
-- a row live by, or move a live row onto another deal by. A step's progress
-- alone names none of them, so the guard does not run for it.
do $$
begin
  if to_regclass('public.analysis_jobs') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'analysis_jobs' and column_name = 'payload'
     ) then
    execute 'drop trigger if exists analysis_jobs_one_live_run on public.analysis_jobs';
    execute 'create trigger analysis_jobs_one_live_run
               before insert or update of status, deal_id, payload, updated_at on public.analysis_jobs
               for each row execute function public.analysis_jobs_one_live_run()';
  end if;
end;
$$;

-- 2. The public-record lookups, held to the app's own asks -------------------
do $$
begin
  if to_regprocedure('public.nearest_property(double precision, double precision, double precision, integer)') is not null then
    execute $fn$
      create or replace function public.nearest_property(
        in_lat double precision,
        in_lng double precision,
        in_radius_m double precision default 120,
        in_limit int default 5
      ) returns setof public.properties
      language sql stable security definer set search_path = public as $body$
        select p.*
        from public.properties p
        where p.lat is not null and p.lng is not null
          and p.lat between in_lat - (least(in_radius_m, 120) / 111320.0)
                        and in_lat + (least(in_radius_m, 120) / 111320.0)
          and p.lng between in_lng - (least(in_radius_m, 120) / (111320.0 * greatest(cos(radians(in_lat)), 0.2)))
                        and in_lng + (least(in_radius_m, 120) / (111320.0 * greatest(cos(radians(in_lat)), 0.2)))
        order by ((p.lat - in_lat)^2 + ((p.lng - in_lng) * cos(radians(in_lat)))^2)
        limit least(in_limit, 1);
      $body$;
    $fn$;
  end if;
  if to_regprocedure('public.nearby_sales(double precision, double precision, double precision, text, integer, integer)') is not null then
    execute $fn$
      create or replace function public.nearby_sales(
        in_lat double precision,
        in_lng double precision,
        in_radius_m double precision default 1600,
        in_asset_class text default null,
        in_months int default 24,
        in_limit int default 80
      ) returns setof public.recorded_sales
      language sql stable security definer set search_path = public as $body$
        select *
        from public.recorded_sales s
        where s.geog is not null
          and ST_DWithin(
            s.geog,
            ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
            least(in_radius_m, 4800)
          )
          and s.sale_date >= (current_date - make_interval(months => in_months))
          and (in_asset_class is null or s.asset_class = in_asset_class)
        order by s.geog <-> ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography
        limit least(in_limit, 80);
      $body$;
    $fn$;
  end if;
end;
$$;

-- ── ROLLING BACK ─────────────────────────────────────────────────────────────
-- Each statement undoes one part. Run only the one for the part that broke
-- something, then tell whoever maintains the app which path it was.
--   1. drop trigger if exists analysis_jobs_one_live_run on public.analysis_jobs;
--   2. run 0028's definition of nearby_sales and 0030_public_data_layer's of
--      nearest_property again (each file is idempotent; a replaced function
--      keeps 0036's grants).
