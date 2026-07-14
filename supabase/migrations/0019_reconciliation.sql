-- ============================================================================
-- 0019 — multi-document reconciliation (Feature 3)
--
--   deals.discrepancies    the stored ReconcileResult for the deal's document
--                          set: { discrepancies[], counts, summary }. Null when
--                          there's nothing to reconcile (OM only).
--   deals.recon_overrides  per-fact precedence overrides {factKey: docKind} —
--                          which source the user chose to trust for a line.
--
-- Additive and nullable; deals screened before this simply have no panel.
-- ============================================================================

alter table public.deals
  add column if not exists discrepancies jsonb,
  add column if not exists recon_overrides jsonb;
