// GET /api/news/health — which news feeds answer from THIS deployment, and
// what the live headlines section is about to show.
//
// The News page's live layer reads the publishers' own RSS/Atom feeds plus a
// few Google News topic searches. A publisher can block server fetches, move
// its feed, or time out, and every one of those looks the same from the
// page: a source quietly missing. This route names each source's outcome
// (HTTP status or error, item count, latency, whether a stale or a cached
// copy stood in) so a thin section can be diagnosed instead of guessed at.
//
// Public: nothing here is secret — publisher names, HTTP outcomes, latency,
// the top headlines with their links — and live-verify reads it after every
// deploy, so an empty section is diagnosed from the deployment's own
// network, not from a sandbox that cannot reach the publishers. Signed-in
// callers may add `?refresh=1` to drop this process's fresh copies first and
// exercise every feed; anonymous callers read what the page would show.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { fetchLiveHeadlines, forgetLiveHeadlines, lastWarmUp } from "@/lib/news/live";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (refresh) {
    const user = await getCurrentUser();
    if (user) forgetLiveHeadlines();
  }

  const live = await fetchLiveHeadlines();
  const answered = live.sources.filter((s) => s.ok).length;
  const stale = live.sources.filter((s) => s.stale).length;
  return NextResponse.json(
    {
      fetchedAt: live.fetchedAt,
      summary: `${answered} of ${live.sources.length} sources answered${stale ? ` (${stale} from an earlier copy)` : ""}; ${live.headlines.length} headlines ranked.`,
      // The boot warm-up's last run on this process (null before it finishes,
      // or when NEWS_WARM=0): live-verify prints it after a deploy.
      warm: lastWarmUp(),
      sources: live.sources,
      top: live.headlines.slice(0, 8).map((h) => ({
        title: h.title,
        publisher: h.publisher,
        publishedAt: h.publishedAt,
        score: Number(h.score.toFixed(2)),
        url: h.url,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
