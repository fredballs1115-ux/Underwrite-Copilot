# Background worker (Phase 2)

A 150–200 page OM plus several Claude calls can take a minute or more — too long
for a normal web request. So the web app enqueues a job and this separate
process does the slow work.

Planned flow:

1. Poll `analysis_jobs` for a `queued` job.
2. Run the pipeline: extract → challenge → reconcile → market → verdict.
3. Update `status` / `step` / `progress` as it goes (the deal page polls this).
4. Save each step's results onto the deal.

It runs as its own Render service (see the commented `worker` block in
`render.yaml`). Not wired up yet — `index.ts` is a placeholder.
