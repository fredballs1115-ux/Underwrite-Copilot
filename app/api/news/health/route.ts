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
// network, not from a sandbox that cannot reach the publishers. Every caller
// reads what the page would show, this process's copies as they stand. Only
// the site's operators (OPERATOR_EMAILS, lib/operator-server) may add
// `?refresh=1` to drop those copies first and ask every feed again (research
// pass 22): any signed-in account could, and a loop of it sent every
// publisher and search host a request per source per ask from the site's
// own address. Anyone else's `refresh=1` is read as no refresh, and
// `refreshed` says which it was.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { isSiteOperator } from "@/lib/operator-server";
import { fetchLiveHeadlines, forgetLiveHeadlines, heldHosts, lastWarmUp } from "@/lib/news/live";

export const dynamic = "force-dynamic";

/** Whether the caller is one of the site's operators; a session that cannot
 *  be read is no operator's. */
async function operatorAsking(): Promise<boolean> {
  try {
    return isSiteOperator(await getCurrentUser());
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  // The session is read only for a refresh: the light read that live-verify
  // makes, with no session, asks the auth service nothing.
  const refresh = new URL(req.url).searchParams.get("refresh") === "1" && (await operatorAsking());
  if (refresh) forgetLiveHeadlines();

  const live = await fetchLiveHeadlines();
  const answered = live.sources.filter((s) => s.ok).length;
  const stale = live.sources.filter((s) => s.stale).length;
  return NextResponse.json(
    {
      fetchedAt: live.fetchedAt,
      summary: `${answered} of ${live.sources.length} sources answered${stale ? ` (${stale} from an earlier copy)` : ""}; ${live.headlines.length} headlines ranked.`,
      // Whether this process's copies were dropped and every feed asked
      // again first: an operator's `?refresh=1`, and nobody else's.
      refreshed: refresh,
      // Which process answered, and for how long it has been up: a `warm`
      // of null on a process minutes old is a defect, on one seconds old
      // it is the boot.
      process: { pid: process.pid, uptimeS: Math.round(process.uptime()) },
      // The boot warm-up on this process — its progress while it runs
      // (`done: false`), then its result; null before it starts or when
      // NEWS_WARM=0. live-verify prints it after a deploy.
      warm: lastWarmUp(),
      // The hosts this process is not asking right now: one that timed out
      // or answered 5xx three times inside a minute is held for 45 s, and
      // its doors are skipped so the next door gets the whole budget.
      held: heldHosts(),
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
