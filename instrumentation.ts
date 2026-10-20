/**
 * Runs once when a Next server instance starts (the Node runtime only; the
 * build never calls it). Two jobs here.
 *
 * The stop handler (lib/in-process-runs): with ANALYSIS_WORKER unset, this
 * process runs screens itself inside `after()`, and a restart kills them
 * mid-run. On SIGTERM / SIGINT their job rows are marked failed at once, so
 * the deal page says the site restarted rather than spinning for ten minutes
 * until the stall rule notices. Nothing is registered in worker mode.
 *
 * The News warm-up: a fresh process that serves its first visitor sends
 * twelve feed requests at once — eight of them to one search host, which
 * answers a burst from one address with 503s and held connections — and the
 * page opens thin. The warm-up reads the sources one at a time in the
 * background instead, so the first visitor after a deploy finds every source
 * cached. NEWS_WARM=0 turns it off.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { registerRestartHandler } = await import("@/lib/in-process-runs");
    registerRestartHandler();
  } catch (err) {
    console.error(`[instrumentation] stop handler not registered: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (process.env.NEWS_WARM === "0") return;
  const { warmLiveHeadlines } = await import("@/lib/news/live");
  // Let the server come up first; the warm-up is a background courtesy and
  // must never hold the readiness of the process.
  const t = setTimeout(() => {
    void warmLiveHeadlines();
  }, 2_000);
  t.unref?.();
}
