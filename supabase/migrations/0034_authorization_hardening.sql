-- ============================================================================
-- 0034 — authorization hardening (the eleventh review)
--
-- Two faults with one shape — a value the user wrote is trusted by code that
-- runs with more authority than the user has:
--
--   1. Storage paths. deals.om_storage_path, deals.supplements[].files[].path,
--      deal_documents.storage_path, analysis_jobs.payload.model.path and
--      profiles.branding.logoPath are ordinary user-writable columns, and the
--      code that reads them hands the value to the service-role storage
--      client, which has no row-level security. The app now checks every path
--      against the row it belongs to before any read, write, signed URL or
--      delete (lib/storage-paths.ts). These triggers assert the same shapes at
--      the row, so a path naming another deal's object never reaches a table:
--        <folder>/<deal id>.pdf              the OM
--        <folder>/<deal id>.model-tmp        a parked reconcile model
--        documents/<deal id>/<file>          deal_documents.storage_path
--        supplements/<deal id>/<file>        deals.supplements[].files[].path
--        <profile id or team id>/branding-logo-<suffix>.<png|jpg>
--      Each field is checked only when it changes (or on insert), so a legacy
--      row is never blocked from unrelated edits.
--
--   2. regulatory_alerts. The dismiss policy (0023) is `using (true) with
--      check (true)` over the default whole-row grant, so any signed-in user
--      could rewrite the headline and link that every other user's screens
--      render. Users may now write exactly the two dismissal columns.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor. Every block
-- checks that the table or column it guards exists, so the file is safe on a
-- database that has not run every earlier migration yet.
-- ============================================================================

-- 1a. deals -------------------------------------------------------------------
create or replace function public.deals_storage_guard()
returns trigger
language plpgsql
as $$
declare
  tab jsonb;
  f jsonb;
begin
  if new.om_storage_path is not null
     and (tg_op = 'INSERT' or new.om_storage_path is distinct from old.om_storage_path)
     and new.om_storage_path !~ ('^[A-Za-z0-9][A-Za-z0-9._-]*/' || new.id::text || '\.pdf$') then
    raise exception 'deal_om_path_invalid'
      using hint = 'An OM is stored at <folder>/<this deal id>.pdf.';
  end if;

  if new.supplements is not null
     and jsonb_typeof(new.supplements) = 'object'
     and (tg_op = 'INSERT' or new.supplements is distinct from old.supplements) then
    for tab in select value from jsonb_each(new.supplements) loop
      if jsonb_typeof(tab->'files') = 'array' then
        for f in select value from jsonb_array_elements(tab->'files') loop
          if coalesce(f->>'path', '')
             !~ ('^supplements/' || new.id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$') then
            raise exception 'deal_supplement_path_invalid'
              using hint = 'A supplement is stored at supplements/<this deal id>/<file>.';
          end if;
        end loop;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_storage_guard on public.deals;
create trigger deals_storage_guard
  before insert or update on public.deals
  for each row execute function public.deals_storage_guard();

-- 1b. deal_documents ------------------------------------------------------------
create or replace function public.deal_documents_storage_guard()
returns trigger
language plpgsql
as $$
begin
  if new.storage_path is not null
     and (tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path)
     and new.storage_path !~ ('^documents/' || new.deal_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$') then
    raise exception 'document_path_invalid'
      using hint = 'A document is stored at documents/<its deal id>/<file>.';
  end if;
  return new;
end;
$$;

drop trigger if exists deal_documents_storage_guard on public.deal_documents;
create trigger deal_documents_storage_guard
  before insert or update on public.deal_documents
  for each row execute function public.deal_documents_storage_guard();

-- 1c. analysis_jobs.payload.model.path (the column arrives with 0016) ---------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analysis_jobs' and column_name = 'payload'
  ) then
    execute $fn$
      create or replace function public.analysis_jobs_storage_guard()
      returns trigger
      language plpgsql
      as $body$
      declare
        p text;
      begin
        p := new.payload #>> '{model,path}';
        if p is not null
           and (tg_op = 'INSERT' or new.payload is distinct from old.payload)
           and p !~ ('^[A-Za-z0-9][A-Za-z0-9._-]*/' || new.deal_id::text || '\.model-tmp$') then
          raise exception 'job_model_path_invalid'
            using hint = 'A parked model is stored at <folder>/<this deal id>.model-tmp.';
        end if;
        return new;
      end;
      $body$;
    $fn$;
    execute 'drop trigger if exists analysis_jobs_storage_guard on public.analysis_jobs';
    execute 'create trigger analysis_jobs_storage_guard
               before insert or update on public.analysis_jobs
               for each row execute function public.analysis_jobs_storage_guard()';
  end if;
end;
$$;

-- 1d. branding logos (the columns arrive with 0021) -----------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'branding'
  ) then
    execute $fn$
      create or replace function public.branding_logo_guard()
      returns trigger
      language plpgsql
      as $body$
      declare
        p text;
      begin
        p := new.branding ->> 'logoPath';
        if p is not null
           and (tg_op = 'INSERT' or new.branding is distinct from old.branding)
           and p !~ ('^' || new.id::text || '/branding-logo-[a-z0-9]+-[a-z0-9]+\.(png|jpg)$') then
          raise exception 'branding_logo_path_invalid'
            using hint = 'A logo is stored at <this profile or team id>/branding-logo-<suffix>.<png|jpg>.';
        end if;
        return new;
      end;
      $body$;
    $fn$;
    execute 'drop trigger if exists branding_logo_guard on public.profiles';
    execute 'create trigger branding_logo_guard
               before insert or update on public.profiles
               for each row execute function public.branding_logo_guard()';
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'teams' and column_name = 'branding'
    ) then
      execute 'drop trigger if exists branding_logo_guard on public.teams';
      execute 'create trigger branding_logo_guard
                 before insert or update on public.teams
                 for each row execute function public.branding_logo_guard()';
    end if;
  end if;
end;
$$;

-- 2. regulatory_alerts: dismiss, never rewrite (the table arrives with 0023) ---
do $$
begin
  if to_regclass('public.regulatory_alerts') is not null then
    execute 'revoke insert, update, delete on public.regulatory_alerts from anon, authenticated';
    execute 'grant update (dismissed_at, dismissed_by) on public.regulatory_alerts to authenticated';
  end if;
end;
$$;
