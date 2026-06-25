-- ============================================================================
-- Underwrite Copilot — migration 0002: per-section supplements
--
-- Lets the user add their own data to any analysis section — typed notes and
-- uploaded files (rent rolls, T-12s, comp sheets, etc.) — so "all the data is
-- there" even when the OM or the model misses something.
--
-- Idempotent: safe to run again. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

alter table public.deals
  add column if not exists supplements jsonb;

-- Shape (keyed by tab — "terms" | "challenger" | "comps" | "reconciler" |
-- "market" | "verdict" | "overview"):
--   {
--     "<tab>": {
--       "notes": [{ "id": "...", "text": "...", "createdAt": "..." }],
--       "files": [{ "id": "...", "name": "...", "path": "...", "createdAt": "..." }]
--     }
--   }
--
-- Files live in the existing private 'offering-memoranda' bucket under
-- supplements/<deal_id>/<file_id>-<name>. RLS on `deals` already restricts a
-- user to their own rows, so the supplements column inherits that protection.
