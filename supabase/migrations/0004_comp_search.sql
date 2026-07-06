-- ============================================================================
-- Underwrite Copilot — migration 0004: public-web comp search
--
-- Holds clearly-labeled, UNVERIFIED comparable sales found via public web
-- search, used as a fallback when the OM contains no comps. Never sourced from
-- CoStar or any licensed/paywalled database.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

alter table public.deals
  add column if not exists comp_search jsonb;

-- Shape (see lib/anthropic/comps-search.ts -> CompSearchResult):
--   { "searchedAt": "...", "summary": "...",
--     "candidates": [{ "name","location","detail","date","sourceName","sourceUrl","note" }] }
