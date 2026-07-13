-- ============================================================================
-- 0021 — custom report branding (Feature 6, Pro/Team)
--
-- `branding` on profiles and teams: { firmName, logoPath, footerText }.
-- Exports (IC memo, full report) render the firm's identity instead of the
-- default header when set. Personal accounts brand their own exports; a team
-- shares one branding, edited by the owner (service-role write, mirroring
-- the buy-box pattern from 0008).
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

alter table public.profiles add column if not exists branding jsonb;
alter table public.teams add column if not exists branding jsonb;

-- Personal branding is written by the signed-in user through RLS (own row —
-- policy from 0001); team branding goes through the owner-checked server
-- action with the service role, so no team grant is needed.
grant update (branding) on public.profiles to authenticated;
