-- Make team invites single-use.
--
-- Before this, join_team_with_token only checked that a token existed and
-- hadn't expired — so one leaked/forwarded invite link let any number of
-- account holders join the team and read every shared deal until it expired.
-- This adds a used marker and claims it atomically inside the join, so a
-- token works exactly once and concurrent joins can't both consume it.

alter table public.team_invites
  add column if not exists used_at timestamptz,
  add column if not exists used_by uuid references auth.users (id) on delete set null;

create or replace function public.join_team_with_token(tok text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  claimed_team uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from public.team_members where user_id = uid) then
    raise exception 'already_in_team';
  end if;

  -- Atomically claim the invite: the WHERE clause requires it to be unused and
  -- unexpired, and the UPDATE marks it used in the same statement. A second
  -- claimant matches zero rows and gets 'invalid_invite'.
  update public.team_invites
     set used_at = now(), used_by = uid
   where token = tok
     and expires_at > now()
     and used_at is null
   returning team_id into claimed_team;

  if claimed_team is null then
    raise exception 'invalid_invite';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (claimed_team, uid, 'member');

  return claimed_team;
end;
$$;

-- Re-assert the execute grants (function body was replaced).
revoke execute on function public.join_team_with_token(text) from public, anon;
grant execute on function public.join_team_with_token(text) to authenticated;
