// GET /api/news/health — which news feeds answer from THIS deployment, and
// what the live headlines section is about to show.
//
// The News page's live layer reads the publishers' own RSS/Atom feeds plus a
// few Google News topic searches. A publisher can block server fetches, move
// its feed, or time out, and every one of those looks the same from the
// page: a source quietly missing. This route names each source's outcome
// (HTTP status or error, item count, latency, whether a stale copy stood
// in) so a thin section can be diagnosed instead of guessed at.
//
// Signed-in users only. Nothing here is secret; it is simply not a public
// surface.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { fetchLiveHeadlines } from "@/lib/news/live";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const live = await fetchLiveHeadlines();
  const answered = live.sources.filter((s) => s.ok).length;
  return NextResponse.json(
    {
      fetchedAt: live.fetchedAt,
      summary: `${answered} of ${live.sources.length} sources answered; ${live.headlines.length} headlines ranked.`,
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
