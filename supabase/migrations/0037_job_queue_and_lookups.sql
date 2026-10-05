-- ============================================================================
-- 0037 — one live job a deal (research pass 39)
--
-- A DRAFT, not yet run anywhere. Run it AFTER 0036, whole, in the Supabase
-- SQL editor, then supabase/CHECK_MIGRATIONS.sql: its 0037 rows should read
-- ✅. It is idempotent, and each block checks that what it guards exists.
--
-- Who is trusted, as in 0036: the web's server actions write with the
-- signed-in user's session, so auth.uid() is that user; the worker, the
-- in-process pipeline and every other back-office writer use the service
-- role, and the SQL editor runs as postgres — both have auth.uid() null, and
-- the guard below leaves them alone.
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
--      on every row of the deal) is refused for the older rows — the run
--      itself starts as before, and only that update's progress figure is
--      lost.
--
--      Needs 0016's payload column (the trigger names it); without it there
--      is no worker and nothing to queue, and the trigger is left off.
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

-- ── ROLLING BACK ─────────────────────────────────────────────────────────────
-- Each statement undoes one part. Run only the one for the part that broke
-- something, then tell whoever maintains the app which path it was.
--   1. drop trigger if exists analysis_jobs_one_live_run on public.analysis_jobs;
