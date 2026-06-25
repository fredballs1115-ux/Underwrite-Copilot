/**
 * Background worker — turned on in Phase 2.
 *
 * Why this exists: analyzing a 150–200 page OM with several Claude calls can
 * take a minute or more — too long to run inside a normal web request. So the
 * web app will just enqueue a job, and THIS process (a separate Render "worker"
 * service) picks it up and does the slow work:
 *
 *   poll `analysis_jobs` for a queued job
 *     → run the pipeline: extract → challenge → comps → reconcile → market → verdict
 *     → update progress as each step finishes
 *     → save results back onto the deal
 *
 * Not wired up yet — this is a placeholder so the structure is visible.
 */
async function main(): Promise<void> {
  console.log(
    "[worker] placeholder — the OM analysis pipeline runs here in Phase 2.",
  );
}

void main();
