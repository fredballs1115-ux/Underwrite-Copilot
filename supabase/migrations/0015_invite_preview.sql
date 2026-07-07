-- 0015: let an invitee see WHICH team an invite joins before accepting.
--
-- Tokens are unguessable (128-bit) and invites are owner-only rows, so the
-- join page previously could not show the team name. This definer function
-- returns ONLY the name, only for a live (unused, unexpired) token — no
-- enumeration surface beyond what the token itself already grants.

create or replace function public.invite_team_name(tok text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select t.name
    from public.team_invites i
    join public.teams t on t.id = i.team_id
   where i.token = tok
     and i.used_at is null
     and i.expires_at > now()
   limit 1;
$$;

revoke all on function public.invite_team_name(text) from public;
grant execute on function public.invite_team_name(text) to authenticated, anon;
