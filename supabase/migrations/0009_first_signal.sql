-- 0009 — the first signal: a fast headline read of the OM, stored the moment
-- it lands (~30s into a screen) so the deal page is never a blank progress bar.
-- Wiped and rewritten by each pipeline run; superseded by the full extraction.

alter table public.deals add column if not exists first_signal jsonb;
