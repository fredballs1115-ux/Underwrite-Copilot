# The dedicated analysis worker

A 150–200 page OM plus several Claude calls takes minutes — too long for a web
request, and (until this service) it ran inside the web process, so **every
deploy interrupted whatever screens were in flight**. This worker fixes that:

- The web app (with `ANALYSIS_WORKER=1`) only **enqueues** a job row in
  `analysis_jobs` and returns instantly.
- The worker polls for the oldest `queued` job, **claims it atomically**
  (two workers can never grab the same row), and runs the pipeline:
  signal → extract → challenge → comps → market → verdict, or a reconcile.
- The pipeline **checkpoints each finished step** onto the job's `payload`.
- On a deploy, Render sends SIGTERM: the worker **re-queues the in-flight job
  and exits within a second**. The replacement instance claims it and
  **resumes after the last completed step** — a deploy costs seconds of delay,
  not a restarted screen.
- A job interrupted 3 times stops retrying and fails with an honest message.
- While the worker is alive it heartbeats the running row and every queued
  worker job, so a backlog never looks "stalled" to the deal page. If the
  worker actually dies, the rows go stale and the existing 10-minute stall
  recovery takes over, exactly as before.
- The worker only ever claims jobs carrying a worker payload — the handoff
  marker the web app writes in worker mode. Jobs from a flag-off web service
  (or in-process job types like comp search and model generation) are never
  touched, so a deployed worker is harmless in every mixed state.
- Jobs run ONE at a time, in order. A batch of four OMs completes serially
  (each screen a few minutes); the ones waiting show an honest "waiting for
  an open analyst slot" state rather than a fake progress bar.
- A run wedged past 30 minutes is re-queued and the process exits nonzero so
  Render restarts it clean (that also kills the wedged request).
- Reconciles: the web app parks the uploaded model file in the private
  Storage bucket (`…/<deal>.model-tmp`) and the worker deletes it the moment
  the run reaches a terminal state.

Everything above is exercised by a local end-to-end rig that runs this exact
binary against fake Supabase/Anthropic/Resend servers — including the
SIGTERM-resume and attempts-cap paths.

## Turning it on (order matters)

1. **Run migration `supabase/migrations/0016_worker_jobs.sql`** (Supabase →
   SQL Editor). Without it the worker idles with a loud log line instead of
   processing.
2. **Create the worker service** — Render dashboard → New → **Background
   Worker** → this repo, branch `main`:
   - Build command: `npm install && npm run build:worker`
   - Start command: `npm run start:worker`
   - Environment: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (same values as the
     web service), plus `RESEND_API_KEY` / `RESEND_FROM` if analysis emails
     are on — the worker is what sends them now.
   - One instance is the supported shape (claims are atomic, so a second
     instance is safe, just unnecessary).
3. Watch its logs until you see `schema OK — processing jobs`.
4. **Flip the web service**: add `ANALYSIS_WORKER=1` to the WEB service's
   environment (it redeploys). From then on screens run here.

If the flag is ever set without the migration, nothing breaks: the web app
probes for the 0016 columns, logs loudly, and keeps running screens
in-process until the migration lands.

**Rollback** is one step: remove `ANALYSIS_WORKER` from the web service.
Screens run in-process again immediately. The worker keeps polling but only
claims worker-payload jobs — new in-process screens are invisible to it — so
you can suspend or delete it whenever convenient.

> Do not set `ANALYSIS_WORKER=1` before the worker is live — jobs would sit
> queued with nobody to run them (the deal page would show them stalled after
> 10 minutes).

## The weekly digest

The Monday pipeline digest email sends FROM THIS SERVICE (the web app only
renders the Account toggle). It needs `RESEND_API_KEY` (+ `RESEND_FROM`) on
the WORKER's environment — set the same values as the web service. Sends at
13:00 UTC Mondays by default; if the worker was down for that hour it
catches up later the same day, and a per-user claim makes overlapping
workers and retries duplicate-safe.

## Tuning (env, all optional)

| Var | Default | Meaning |
| --- | --- | --- |
| `WORKER_POLL_MS` | 5000 | queue poll interval |
| `WORKER_HEARTBEAT_MS` | 45000 | running/queued row keep-alive |
| `WORKER_MAX_ATTEMPTS` | 3 | interruptions before a job stops retrying |
| `WORKER_JOB_TIMEOUT_MS` | 1800000 | wedged-run cutoff (re-queue + restart) |
| `WORKER_KEEPALIVE_AGE_MS` | 240000 | re-touch queued rows only past this age |
| `WORKER_DIGEST_DOW` | 1 | digest day (UTC, 0 = Sunday) |
| `WORKER_DIGEST_HOUR_UTC` | 13 | digest send hour (UTC) |
| `WORKER_DIGEST_CHECK_MS` | 900000 | how often the clock gate is checked |
