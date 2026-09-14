/**
 * Runs once when a Next server instance starts (the Node runtime only; the
 * build never calls it). The one job here: warm the News page's live layer.
 * A fresh process that serves its first visitor sends twelve feed requests
 * at once — eight of them to one search host, which answers a burst from
 * one address with 503s and held connections — and the page opens thin.
 * The warm-up reads the sources one at a time in the background instead,
 * so the first visitor after a deploy finds every source cached.
 * NEWS_WARM=0 turns it off.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEWS_WARM === "0") return;
  const { warmLiveHeadlines } = await import("@/lib/news/live");
  // Let the server come up first; the warm-up is a background courtesy and
  // must never hold the readiness of the process.
  const t = setTimeout(() => {
    void warmLiveHeadlines();
  }, 2_000);
  t.unref?.();
}
