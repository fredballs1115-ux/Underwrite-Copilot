-- ============================================================================
-- 0025 — per-sector deal fields (research build, Phase 2 item 3)
--
-- One jsonb column, catalog-driven (lib/sector-fields.ts): NNN lease
-- term/tenant credit, storage unit mix/occupancy, industrial clear height/
-- IOS acreage — and for multifamily, the regulatory answers the rules engine
-- asks for (building permit year, RAD exemption registration, owner's other
-- units in the jurisdiction). The existing multifamily flow is unchanged:
-- every field is optional, and absence keeps the tri-state evaluator honest.
--
-- Idempotent. Run the WHOLE file in the Supabase SQL editor.
-- ============================================================================

alter table public.deals add column if not exists sector_fields jsonb;
