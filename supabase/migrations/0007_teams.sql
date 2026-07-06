-- ============================================================================
-- Underwrite Copilot — migration 0007: teams (shared pipeline) + deal stages
--
-- Adds:
--   1. profiles.email (so team member lists can show who's who)
--   2. deals.stage — the user's own pipeline tracker (screening → reviewing →
--      pursuing → dead), independent of the screen's verdict
--   3. teams / team_members / team_invites — link accounts into one shared
--      pipeline. One team per user. Invites are links with expiring tokens.
--   4. deals.team_id — a deal in a team is visible and editable by every
--      member; deletable by its creator or the team owner
--   5. RLS across deals / analysis_jobs / deal_documents extended to teams via
--      security-definer helpers (avoids policy recursion)
--   6. Free-cap trigger v2: personal deals keep the 3-deal free cap; team
--      deals get a 3-deal team trial, then require an active team plan
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

-- 1. Emails on profiles (backfilled, kept fresh by the signup trigger) --------

alter table public.profiles add column if not exists email text;

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- 2. Deal stages ---------------------------------------------------------------

alter table public.deals add column if not exists stage text not null default 'screening';
alter table public.deals drop constraint if exists deals_stage_check;
alter table public.deals add constraint deals_stage_check
  check (stage in ('screening', 'reviewing', 'pursuing', 'dead'));

-- 3. Teams ---------------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- 'active' | 'inactive' — synced from Stripe by the webhook (service role)
  plan text not null default 'inactive',
  subscription_status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
-- One team per user keeps "whose pipeline am I looking at" unambiguous.
create unique index if not exists team_members_one_team_per_user
  on public.team_members (user_id);

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

alter table public.deals
  add column if not exists team_id uuid references public.teams (id) on delete set null;
create index if not exists deals_team_id_idx on public.deals (team_id);

-- 4. Security-definer helpers (safe to call from policies — no recursion) ------

create or replace function public.is_team_member(t uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = t and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(t uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = t and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function public.in_same_team(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.team_members a
    join public.team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

revoke execute on function public.is_team_member(uuid),
                          public.is_team_owner(uuid),
                          public.in_same_team(uuid) from public, anon;
grant execute on function public.is_team_member(uuid),
                          public.is_team_owner(uuid),
                          public.in_same_team(uuid) to authenticated;

-- 5. RLS -----------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

-- Teams are readable by their members. All writes go through the RPCs below or
-- the service role (billing columns must never be user-writable — same
-- posture as profiles in migration 0006).
drop policy if exists "team members read team" on public.teams;
create policy "team members read team" on public.teams
  for select using (public.is_team_member(id));
revoke insert, update, delete on public.teams from anon, authenticated;

-- Memberships: members see the roster; the owner can remove others; a member
-- can remove themself (leave). Joining happens only through the RPCs.
drop policy if exists "team roster visible to members" on public.team_members;
create policy "team roster visible to members" on public.team_members
  for select using (public.is_team_member(team_id));

drop policy if exists "owner removes members / member leaves" on public.team_members;
create policy "owner removes members / member leaves" on public.team_members
  for delete using (
    (public.is_team_owner(team_id) and user_id <> auth.uid())
    or (user_id = auth.uid() and role <> 'owner')
  );
revoke insert, update on public.team_members from anon, authenticated;

-- Invites: owner-only. The join flow never reads this table directly — it goes
-- through the security-definer RPC, so invitees can't enumerate tokens.
drop policy if exists "owner manages invites" on public.team_invites;
create policy "owner manages invites" on public.team_invites
  for all using (public.is_team_owner(team_id))
  with check (public.is_team_owner(team_id) and created_by = auth.uid());

-- Deals: split the single "own deals" policy into per-command policies that
-- include team visibility.
drop policy if exists "own deals" on public.deals;
drop policy if exists "read own or team deals" on public.deals;
create policy "read own or team deals" on public.deals
  for select using (
    user_id = auth.uid()
    or (team_id is not null and public.is_team_member(team_id))
  );
drop policy if exists "insert own deals" on public.deals;
create policy "insert own deals" on public.deals
  for insert with check (
    user_id = auth.uid()
    and (team_id is null or public.is_team_member(team_id))
  );
drop policy if exists "update own or team deals" on public.deals;
create policy "update own or team deals" on public.deals
  for update using (
    user_id = auth.uid()
    or (team_id is not null and public.is_team_member(team_id))
  ) with check (
    user_id is not null
    and (team_id is null or public.is_team_member(team_id))
  );
drop policy if exists "delete own deals or team owner" on public.deals;
create policy "delete own deals or team owner" on public.deals
  for delete using (
    user_id = auth.uid()
    or (team_id is not null and public.is_team_owner(team_id))
  );

-- Jobs + documents follow the deal they belong to.
drop policy if exists "own jobs" on public.analysis_jobs;
create policy "own jobs" on public.analysis_jobs
  for all using (
    exists (
      select 1 from public.deals d
      where d.id = analysis_jobs.deal_id
        and (d.user_id = auth.uid()
             or (d.team_id is not null and public.is_team_member(d.team_id)))
    )
  );

drop policy if exists "own deal documents" on public.deal_documents;
create policy "own deal documents" on public.deal_documents
  for all using (
    exists (
      select 1 from public.deals d
      where d.id = deal_documents.deal_id
        and (d.user_id = auth.uid()
             or (d.team_id is not null and public.is_team_member(d.team_id)))
    )
  );

-- Teammates can see each other's name/email on the roster.
drop policy if exists "teammates read profiles" on public.profiles;
create policy "teammates read profiles" on public.profiles
  for select using (public.in_same_team(id));

-- 6. RPCs: create + join (atomic, validated, definer) ---------------------------

create or replace function public.create_team(team_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.team_members where user_id = uid) then
    raise exception 'already_in_team';
  end if;
  if team_name is null or char_length(trim(team_name)) < 1 then
    raise exception 'team_name_required';
  end if;

  insert into public.teams (name, owner_id)
  values (left(trim(team_name), 80), uid)
  returning id into tid;

  insert into public.team_members (team_id, user_id, role)
  values (tid, uid, 'owner');

  return tid;
end;
$$;

create or replace function public.join_team_with_token(tok text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv record;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.team_members where user_id = uid) then
    raise exception 'already_in_team';
  end if;

  select * into inv from public.team_invites
   where token = tok and expires_at > now()
   limit 1;
  if inv is null then
    raise exception 'invalid_invite';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (inv.team_id, uid, 'member');

  return inv.team_id;
end;
$$;

revoke execute on function public.create_team(text),
                          public.join_team_with_token(text) from public, anon;
grant execute on function public.create_team(text),
                          public.join_team_with_token(text) to authenticated;

-- 7. Free-cap trigger v2: team-aware --------------------------------------------

create or replace function public.enforce_free_deal_cap()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_plan text;
  team_plan text;
  deal_count int;
begin
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
$$;

drop trigger if exists enforce_free_deal_cap on public.deals;
create trigger enforce_free_deal_cap
  before insert on public.deals
  for each row execute function public.enforce_free_deal_cap();
