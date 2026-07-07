-- ============================================================================
-- Underwrite Copilot — migration 0008: the buy box + profile-read tightening
--
-- 1. `criteria` (the buy box) on profiles and teams: the buyer's standing
--    investment criteria — asset classes, markets, max basis, min cap/IRR.
--    Every screen is checked against it deterministically, and the verdict
--    synthesizer sees it too.
-- 2. Tightens profile reads: the 0007 "teammates read profiles" policy made
--    whole rows visible to teammates, including Stripe identifiers. Column
--    grants now limit user-client reads to identity fields (id/email/name);
--    billing state is read server-side with the service role.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

-- 1. The buy box --------------------------------------------------------------

alter table public.profiles add column if not exists criteria jsonb;
alter table public.teams add column if not exists criteria jsonb;

-- Members may read (not write) the team's buy box; writes go through the
-- owner-checked server action with the service role.
grant select (criteria) on public.teams to authenticated;

-- 2. Profile column grants ----------------------------------------------------
-- Reset, then grant exactly what user-context clients need:
--   select: identity columns (rosters, bylines) — never billing state
--   update: full_name (account page) and criteria (buy box page), own row
--   via the existing RLS policies.
revoke select, insert, update, delete on public.profiles from anon, authenticated;
grant select (id, email, full_name) on public.profiles to authenticated;
grant update (full_name, criteria) on public.profiles to authenticated;
