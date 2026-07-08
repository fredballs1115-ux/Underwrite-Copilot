-- ============================================================================
-- 0016 — dedicated analysis worker (Phase 2 of the build roadmap)
--
-- The web app used to run the whole analysis inside its own process, which
-- meant every deploy interrupted in-flight screens. With ANALYSIS_WORKER=1 the
-- web app only ENQUEUES jobs and a separate worker service runs them. Two new
-- columns on analysis_jobs carry what the worker needs:
--
--   payload   what to run and how — {"kind":"screen"|"reconcile",
--             "snapshotPrior":bool, "model":{"name","path"},
--             "completed":["signal","extract",...]}. "completed" is the
--             per-step checkpoint: when a deploy restarts the worker mid-run,
--             the job is re-queued and the next attempt SKIPS the steps that
--             already finished instead of paying for them again.
--   attempts  how many times a worker has picked this job up. A job that
--             keeps getting interrupted stops retrying after 3 attempts and
--             fails with an honest message instead of looping forever.
--
-- Run this BEFORE setting ANALYSIS_WORKER=1 on the web service. Without the
-- flag, nothing reads these columns and behavior is unchanged.
-- ============================================================================

alter table public.analysis_jobs
  add column if not exists payload jsonb,
  add column if not exists attempts int not null default 0;

-- The worker claims the oldest queued job; give that scan an index instead of
-- a sequential pass once the table grows.
create index if not exists analysis_jobs_queued_idx
  on public.analysis_jobs (status, created_at);
