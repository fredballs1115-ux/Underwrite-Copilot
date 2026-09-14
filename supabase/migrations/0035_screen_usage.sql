-- ============================================================================
-- 0035 — what each screen cost, measured
--
-- Every model call in a screen reports four token meters (uncached input,
-- cache writes, cache reads, output). The pipeline collects them per run and
-- writes the ledger here when the run ends — on success and on failure alike,
-- since a failed screen still spent tokens:
--
--   usage   {"calls":[{"what","model","input","cacheWrite","cacheRead",
--            "output","ms"}, …], "totals":{…}, "usd": 3.02 | null,
--            "unpriced":[…], "ms": 61200, "at": "<iso>"}
--
-- `usd` is a list-price estimate from lib/anthropic/models.ts (null when a
-- call's model is not in that table). The operator's page (/data-health)
-- reads the last screens' ledgers and draws the cost split by step.
--
-- Additive: the pipeline's write is best-effort, so a deployment without
-- this column keeps screening and simply records nothing.
-- ============================================================================

alter table public.analysis_jobs
  add column if not exists usage jsonb;
