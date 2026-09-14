import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { fetchLiveHeadlines } from "@/lib/news/live";
import { LiveHeadlinesView } from "./live-headlines";
import { ScoredFeedView, type AlertRow, type ItemRow } from "./scored-feed";

export const metadata: Metadata = { title: "News" };
export const dynamic = "force-dynamic";

// Two layers, both real news and both linked to the source:
//
//   1. LIVE HEADLINES — the publishers' own feeds (Commercial Observer, The
//      Real Deal, GlobeSt, Multi-Housing News, CPE, Connect CRE, REBusiness,
//      the Fed) plus Google News topic searches, fetched at request time with
//      a half-hour cache and ranked by recency and how much the headline
//      touches what moves a deal. Needs no key and no cron, so this page is
//      never empty. Drawn by the pure view in live-headlines.tsx.
//   2. THE SCORED FEED — every headline the weekday intel sweep gathered and
//      scored 0–10 for THIS buyer, newest day first. Big law/regulation
//      changes get the top strip (they also red-banner app-wide until
//      dismissed). Quiet until the cron has run, and it says so. Drawn by
//      the pure view in scored-feed.tsx.
//
// Both views render on fixtures in lib/views.render.test.ts; this file only
// reads (the session, the two tables, the live layer) and hands the rows in.
// Nothing here is written by us — it's the news itself, ranked and linked.

/** What the live section looks like while the feeds are still answering. */
function LiveHeadlinesFallback() {
  return (
    <section aria-busy="true" aria-label="Headlines loading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Headlines now</h2>
        <span className="text-[11px] text-muted">reading the publishers’ feeds…</span>
      </div>
      <ol className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex gap-3 px-3.5 py-3">
            <span className="mt-px w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 animate-pulse rounded bg-faint" style={{ width: `${62 + ((i * 13) % 30)}%` }} />
              <div className="h-3 w-1/3 animate-pulse rounded bg-faint" />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The live layer, fetched here and drawn by the pure view (live-headlines.tsx),
 * which the render tests draw on a fixture. Async so it streams in behind
 * the rest of the page (see the Suspense boundary in NewsPage).
 */
async function LiveHeadlinesSection() {
  const live = await fetchLiveHeadlines();
  return <LiveHeadlinesView live={live} />;
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ sector?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/news");
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  let items: ItemRow[] = [];
  let alerts: AlertRow[] = [];
  try {
    const [{ data: it }, { data: al }] = await Promise.all([
      supabase
        .from("market_intel_items")
        .select("url, title, source, sector, relevance, summary, action, published_at, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("regulatory_alerts")
        .select("id, rule_id, headline, url, detail, detected_at")
        // A dismissed banner must stay dismissed here too.
        .is("dismissed_at", null)
        .order("detected_at", { ascending: false })
        .limit(5),
    ]);
    items = (it as ItemRow[] | null) ?? [];
    alerts = (al as AlertRow[] | null) ?? [];
  } catch {
    // tables absent until migrations run — the view's empty line explains
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">News</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Live from the publishers&apos; own feeds, most decision-relevant first; every headline
          links to its source.
        </p>
      </header>

      {/* Streamed: the page paints at once and the headlines land when the
          slowest feed answers (or times out) — up to eight seconds on a cold
          cache, which no one should wait for staring at a blank page. */}
      <Suspense fallback={<LiveHeadlinesFallback />}>
        <LiveHeadlinesSection />
      </Suspense>

      <ScoredFeedView items={items} alerts={alerts} wantSector={params.sector ?? ""} />
    </div>
  );
}
