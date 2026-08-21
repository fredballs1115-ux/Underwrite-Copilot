-- ============================================================================
-- 0027 — building photos (site-polish)
--
-- Caches the Street View METADATA check per deal so the imagery-exists
-- question is asked once, not on every page view. The image itself is never
-- stored — it streams through /api/deals/[id]/photo (the API key stays
-- server-side). Shape: { status: 'ok'|'none'|'unconfigured', checkedAt,
-- attribution }. No photo -> the page renders its clean address-only look;
-- nothing fake ever stands in.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

alter table public.deals add column if not exists photo jsonb;
