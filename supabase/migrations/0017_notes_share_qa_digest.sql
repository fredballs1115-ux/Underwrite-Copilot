-- ============================================================================
-- 0017 — deal notes, share links, ask-the-deal, weekly digest
--
-- Four features in one additive migration (safe to run once, idempotent):
--   deals.notes           the decision log — [{at, by, text}]
--   deals.qa              ask-the-deal thread — [{at, q, answer, cites}]
--   deal_shares           expiring read-only share links for a deal
--   profiles.email_weekly_digest / last_digest_at
--                         the Monday pipeline digest toggle + dupe guard
-- ============================================================================

alter table public.deals
  add column if not exists notes jsonb,
  add column if not exists qa jsonb;

alter table public.profiles
  add column if not exists email_weekly_digest boolean not null default true,
  add column if not exists last_digest_at timestamptz;

-- One row per share link. The public /share page reads via the service role
-- (token = the row id, unguessable uuid); RLS below is for the OWNER managing
-- their links in the app.
create table if not exists public.deal_shares (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked boolean not null default false
);

create index if not exists deal_shares_deal_idx on public.deal_shares (deal_id);

alter table public.deal_shares enable row level security;

-- Owners (and teammates who can see the deal) manage its links. The access
-- predicate appears in EVERY policy — Postgres does not apply USING to
-- INSERT, so a single "for all" policy would let any authenticated user who
-- learned a deal id mint a share for it straight through PostgREST.
create or replace function public.can_access_deal(p_deal uuid)
returns boolean
language sql
security invoker
stable
as $$
  select exists (
    select 1 from public.deals d
    where d.id = p_deal
      and (
        d.user_id = auth.uid()
        or (d.team_id is not null and exists (
          select 1 from public.team_members m
          where m.team_id = d.team_id and m.user_id = auth.uid()
        ))
      )
  );
$$;

drop policy if exists "own deal shares" on public.deal_shares;
drop policy if exists "read own deal shares" on public.deal_shares;
drop policy if exists "create own deal shares" on public.deal_shares;
drop policy if exists "update own deal shares" on public.deal_shares;

create policy "read own deal shares" on public.deal_shares
  for select using (public.can_access_deal(deal_id));

create policy "create own deal shares" on public.deal_shares
  for insert with check (
    auth.uid() = created_by and public.can_access_deal(deal_id)
  );

create policy "update own deal shares" on public.deal_shares
  for update using (public.can_access_deal(deal_id))
  with check (public.can_access_deal(deal_id));

-- Updates may only REVOKE: a deliberately killed link must never silently
-- come back to life, and a share must never be repointed or extended.
create or replace function public.deal_shares_guard()
returns trigger
language plpgsql
as $$
begin
  if new.deal_id is distinct from old.deal_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at
     or (old.revoked and not new.revoked) then
    raise exception 'share links can only be revoked';
  end if;
  return new;
end;
$$;

drop trigger if exists deal_shares_guard on public.deal_shares;
create trigger deal_shares_guard before update on public.deal_shares
  for each row execute function public.deal_shares_guard();

-- Atomic note append — concurrent teammates must never lose each other's
-- notes to a read-modify-write race. SECURITY INVOKER: the caller's RLS
-- (own-or-team deals) still gates the update.
create or replace function public.append_deal_note(p_deal uuid, p_note jsonb)
returns void
language sql
security invoker
as $$
  update public.deals
     set notes = coalesce(notes, '[]'::jsonb) || jsonb_build_array(p_note),
         updated_at = now()
   where id = p_deal;
$$;

revoke all on function public.append_deal_note(uuid, jsonb) from public;
grant execute on function public.append_deal_note(uuid, jsonb) to authenticated;

-- Same atomicity for the ask-the-deal thread — a lost entry here is a paid
-- Claude answer silently vanishing.
create or replace function public.append_deal_qa(p_deal uuid, p_entry jsonb)
returns void
language sql
security invoker
as $$
  update public.deals
     set qa = coalesce(qa, '[]'::jsonb) || jsonb_build_array(p_entry),
         updated_at = now()
   where id = p_deal;
$$;

revoke all on function public.append_deal_qa(uuid, jsonb) from public;
grant execute on function public.append_deal_qa(uuid, jsonb) to authenticated;
