-- ============================================================================
-- Underwrite Copilot — migration 0006: billing hardening + sample-deal flag
--
-- Fixes two real vulnerabilities and one fairness bug:
--   1. profiles.plan was user-writable through the public REST API (RLS lets a
--      user update their own row), so anyone could self-upgrade to Pro with a
--      single PATCH. Billing columns must only be written by the service role
--      (the Stripe webhook / checkout actions).
--   2. The free 3-deal cap lived only in the server action — direct PostgREST
--      inserts bypassed it. A database trigger now enforces it.
--   3. Sample deals consumed free slots. They're now flagged and exempt.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

-- 1. Lock down profiles writes. Reads stay user-scoped via RLS; the
--    auto-create trigger is `security definer` so signup still works; all
--    billing-state writes go through the service-role client, which is
--    unaffected by these grants.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- 2. Flag sample deals so they don't consume free slots and the "try a sample"
--    action can be idempotent.
alter table public.deals
  add column if not exists is_sample boolean not null default false;

-- 3. Enforce the free cap in the database (backstop for the action-level
--    check; also closes the direct-REST bypass and the check-then-insert race).
create or replace function public.enforce_free_deal_cap()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_plan text;
  deal_count int;
begin
  -- Samples never count against (or get blocked by) the cap.
  if new.is_sample then
    return new;
  end if;

  select plan into user_plan from public.profiles where id = new.user_id;
  if coalesce(user_plan, 'free') = 'pro' then
    return new;
  end if;

  select count(*) into deal_count
    from public.deals
   where user_id = new.user_id and is_sample = false;

  if deal_count >= 3 then
    raise exception 'free_deal_limit_reached'
      using hint = 'Upgrade to Pro for unlimited deals.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_free_deal_cap on public.deals;
create trigger enforce_free_deal_cap
  before insert on public.deals
  for each row execute function public.enforce_free_deal_cap();
