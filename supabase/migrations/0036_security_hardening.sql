-- ============================================================================
-- 0036 — security hardening (the review of 2026-09-30)
--
-- Five places where the database trusted a value the caller chose, or checked
-- a rule on insert that an update could undo. Each part says what it closes
-- and why the app's own writes pass it unchanged.
--
-- Who is trusted. The web's server actions write with the signed-in user's
-- session, so auth.uid() is that user. The worker, the in-process pipeline,
-- the Stripe webhook and every other back-office writer use the service role,
-- and the SQL editor runs as postgres; both have auth.uid() null, and every
-- guard below leaves them alone — the rule protect_deal_identity (0007)
-- already follows. A signed-out visitor has no uid either, but row-level
-- security gives the anon role no write on any table guarded here.
--
--   1. The public-record RPCs. nearby_sales (0028) and nearest_property (0030)
--      are SECURITY DEFINER and were never revoked, so the public anon key
--      could run them (POST /rest/v1/rpc/nearest_property) and read the owner
--      names and mailing addresses that properties and recorded_sales show
--      only to signed-in users. Postgres grants EXECUTE on a new function to
--      PUBLIC, and Supabase's default privileges grant it to anon by name as
--      well, so both are revoked. The app's callers: nearest_property from the
--      deal page's public-record card, with the user's session
--      (app/(app)/deals/[id]/public-record-card.tsx) — authenticated keeps
--      it; nearby_sales only from the comps pull, with the service role
--      (lib/public-comps/run.ts) — the service role alone keeps it.
--
--   2. Share links. The insert policy (0017) took any expiry and any id, and
--      the id IS the link's token, so a link minted through PostgREST could
--      live forever or carry a token its minter picked. On a signed-in user's
--      insert the database now makes the token and the creation time and
--      holds the expiry to 30 days from now; the update guard refuses a
--      changed id too. The app's createShareLink supplies neither id nor
--      created_at and asks for now + 30 days by the web server's clock — so
--      the expiry is clamped, not refused: a web clock a few seconds ahead of
--      the database's shortens the link by those seconds instead of failing
--      the Share button. The app has no link without an expiry.
--
--   3. The free three-deal cap. The cap trigger (0006, 0007) runs on insert
--      only, so a deal inserted as a sample (exempt) and then flipped to
--      is_sample = false was a free slot, as often as the user liked (0007's
--      one-sample index limits samples held at once, not flips). A deal moved
--      between the personal pipeline and a team — protect_deal_identity lets
--      its creator or the team's owner move it — likewise escaped the cap it
--      moved into. The same trigger function now also runs before a
--      signed-in user's update of is_sample or team_id: is_sample may not
--      change at all (false → true would turn the one sample slot into a
--      fourth real deal), and a move is counted against the cap it lands in,
--      exactly as an insert there would be. The app sets both columns only on
--      insert (createSampleDeal; createDealCore and createManualDeal) and no
--      update it makes names either, so the new trigger never fires for it.
--      The service role — a team deletion's ON DELETE SET NULL included — is
--      trusted as before.
--
--   4. The worker's queue. analysis_jobs is writable by the deal's owner and
--      teammates (0007), and the worker takes the oldest queued row first
--      (worker/index.ts), so a backdated created_at jumped the queue. A
--      signed-in user's insert, and any update of theirs that changes
--      created_at, now get the database's now(). The app's writes: every
--      enqueue (lib/jobs newJobRow) leaves created_at to its default, and
--      claimJob restamps it with the web server's now, which becomes the
--      database's now — the same instant give or take the clocks' skew, and
--      still "when this run was asked for". The worker and the pipeline write
--      with the service role and never set created_at.
--
--   5. Ask's question cap. The 25-question cap (ask-actions.ts) counts
--      deals.qa, which the deal's owner could rewrite: PATCH qa = [] and the
--      cap was gone. A signed-in user's update of qa must now keep every
--      entry already there, in order, and may only add after them. Both of
--      Ask's writes do exactly that: append_deal_qa (0017, security invoker)
--      appends one entry, and the fallback, used only when that call fails,
--      writes the thread it read (parsed, which leaves every entry Ask wrote
--      as it was) plus the new entry. Nothing in the app edits or clears the
--      thread.
--
-- Rolling back: every part is one grant or one trigger — see the end of the
-- file for the statement that undoes each.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor, after 0035. Each
-- block checks that what it guards exists (as 0034 does), so the file is also
-- safe on a database missing an earlier migration — 0028 without PostGIS, say.
-- ============================================================================

-- 1. The public-record RPCs: nearest_property to signed-in callers, ----------
--    nearby_sales to the service role
do $$
begin
  if to_regprocedure('public.nearby_sales(double precision, double precision, double precision, text, integer, integer)') is not null then
    execute 'revoke execute on function public.nearby_sales(double precision, double precision, double precision, text, integer, integer) from public, anon, authenticated';
    execute 'grant execute on function public.nearby_sales(double precision, double precision, double precision, text, integer, integer) to service_role';
  end if;
  if to_regprocedure('public.nearest_property(double precision, double precision, double precision, integer)') is not null then
    execute 'revoke execute on function public.nearest_property(double precision, double precision, double precision, integer) from public, anon';
    execute 'grant execute on function public.nearest_property(double precision, double precision, double precision, integer) to authenticated';
  end if;
end;
$$;

-- 2. Share links: the database makes the token and holds the expiry ----------
create or replace function public.deal_shares_mint_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.id := gen_random_uuid();
  new.created_at := now();
  new.expires_at := least(new.expires_at, now() + interval '30 days');
  return new;
end;
$$;

-- 0017's update guard, with the id (the token) added to what may not change.
create or replace function public.deal_shares_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.deal_id is distinct from old.deal_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at
     or (old.revoked and not new.revoked) then
    raise exception 'share links can only be revoked';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.deal_shares') is not null then
    execute 'drop trigger if exists deal_shares_mint_guard on public.deal_shares';
    execute 'create trigger deal_shares_mint_guard
               before insert on public.deal_shares
               for each row execute function public.deal_shares_mint_guard()';
    execute 'drop trigger if exists deal_shares_guard on public.deal_shares';
    execute 'create trigger deal_shares_guard
               before update on public.deal_shares
               for each row execute function public.deal_shares_guard()';
  end if;
end;
$$;

-- 3. The free-deal cap on the updates that could dodge it --------------------
-- 0007's function, taught the two updates. The insert path below the UPDATE
-- branch is 0007's, line for line. Created inside the guard: on a database
-- without 0007's teams the body would break every deal insert.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'team_id'
  ) then
    execute $fn$
      create or replace function public.enforce_free_deal_cap()
      returns trigger
      language plpgsql
      security definer set search_path = public
      as $body$
      declare
        user_plan text;
        team_plan text;
        deal_count int;
      begin
        if tg_op = 'UPDATE' then
          -- The service role and the SQL editor are trusted, as in
          -- protect_deal_identity.
          if auth.uid() is null then
            return new;
          end if;
          -- A deal is a sample, or not, from its insert on: true -> false was
          -- a cap-free insert, false -> true a fourth real deal.
          if new.is_sample is distinct from old.is_sample then
            raise exception 'deal_sample_flag_immutable'
              using hint = 'A deal is created as a sample or not; delete it and create another instead.';
          end if;
          -- Only a move between pipelines can take a slot no insert counted.
          if new.team_id is not distinct from old.team_id then
            return new;
          end if;
        end if;

        -- Samples never count against (or get blocked by) any cap.
        if new.is_sample then
          return new;
        end if;

        -- Team deals: unlimited on an active team plan; otherwise a 3-deal trial
        -- shared by the whole team.
        if new.team_id is not null then
          select plan into team_plan from public.teams where id = new.team_id;
          if coalesce(team_plan, 'inactive') = 'active' then
            return new;
          end if;
          select count(*) into deal_count
            from public.deals
           where team_id = new.team_id and is_sample = false;
          if deal_count >= 3 then
            raise exception 'team_plan_required'
              using hint = 'Start the Team plan for unlimited shared deals.';
          end if;
          return new;
        end if;

        -- Personal deals: the existing free cap.
        select plan into user_plan from public.profiles where id = new.user_id;
        if coalesce(user_plan, 'free') = 'pro' then
          return new;
        end if;

        select count(*) into deal_count
          from public.deals
         where user_id = new.user_id and is_sample = false and team_id is null;

        if deal_count >= 3 then
          raise exception 'free_deal_limit_reached'
            using hint = 'Upgrade to Pro for unlimited deals.';
        end if;

        return new;
      end;
      $body$;
    $fn$;
    execute 'drop trigger if exists enforce_free_deal_cap on public.deals';
    execute 'create trigger enforce_free_deal_cap
               before insert on public.deals
               for each row execute function public.enforce_free_deal_cap()';
    -- "of is_sample, team_id": fires only for an update that names one of
    -- them, which no update the app makes does.
    execute 'drop trigger if exists enforce_free_deal_cap_update on public.deals';
    execute 'create trigger enforce_free_deal_cap_update
               before update of is_sample, team_id on public.deals
               for each row execute function public.enforce_free_deal_cap()';
  end if;
end;
$$;

-- 4. The worker's queue: a user's run is placed when it was asked for --------
create or replace function public.analysis_jobs_queue_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  elsif new.created_at is distinct from old.created_at then
    new.created_at := now();
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.analysis_jobs') is not null then
    execute 'drop trigger if exists analysis_jobs_queue_guard on public.analysis_jobs';
    execute 'create trigger analysis_jobs_queue_guard
               before insert or update of created_at on public.analysis_jobs
               for each row execute function public.analysis_jobs_queue_guard()';
  end if;
end;
$$;

-- 5. Ask's thread: a user may add to it, never rewrite it ---------------------
create or replace function public.deal_qa_append_only()
returns trigger
language plpgsql
as $$
declare
  kept jsonb;
  held int;
begin
  if auth.uid() is null or new.qa is not distinct from old.qa then
    return new;
  end if;
  -- What the thread held: an array, or nothing yet.
  kept := case when jsonb_typeof(old.qa) = 'array' then old.qa else '[]'::jsonb end;
  held := jsonb_array_length(kept);
  if jsonb_typeof(new.qa) is distinct from 'array' then
    raise exception 'deal_qa_append_only'
      using hint = 'Ask''s thread only grows: a new question goes after the ones already asked.';
  end if;
  if jsonb_array_length(new.qa) < held then
    raise exception 'deal_qa_append_only'
      using hint = 'Ask''s thread only grows: a new question goes after the ones already asked.';
  end if;
  if (select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
        from jsonb_array_elements(new.qa) with ordinality as t(e, i)
       where i <= held) is distinct from kept then
    raise exception 'deal_qa_append_only'
      using hint = 'Ask''s thread only grows: a new question goes after the ones already asked.';
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'qa'
  ) then
    execute 'drop trigger if exists deal_qa_append_only on public.deals';
    execute 'create trigger deal_qa_append_only
               before update of qa on public.deals
               for each row execute function public.deal_qa_append_only()';
  end if;
end;
$$;

-- ── ROLLING BACK ─────────────────────────────────────────────────────────────
-- Each statement undoes one part. Run only the one for the part that broke
-- something, then tell whoever maintains the app which path it was.
--   1. grant execute on function public.nearby_sales(double precision, double precision, double precision, text, integer, integer) to authenticated;
--      grant execute on function public.nearest_property(double precision, double precision, double precision, integer) to anon;
--      (the first restores 0028's signed-in access; the second reopens the
--      hole this part closes)
--   2. drop trigger if exists deal_shares_mint_guard on public.deal_shares;
--   3. drop trigger if exists enforce_free_deal_cap_update on public.deals;
--   4. drop trigger if exists analysis_jobs_queue_guard on public.analysis_jobs;
--   5. drop trigger if exists deal_qa_append_only on public.deals;
-- Part 2's id check lives in deal_shares_guard; running 0017's definition of
-- that function again removes it.
