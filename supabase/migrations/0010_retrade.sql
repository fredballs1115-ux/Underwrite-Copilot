-- 0010 — retrade watch: before each re-screen, the pipeline snapshots the
-- previous run's extraction + verdict here, so the deal page can show exactly
-- what moved since the last screen (price cuts, cap drift, verdict flips).

alter table public.deals add column if not exists prior_screen jsonb;
