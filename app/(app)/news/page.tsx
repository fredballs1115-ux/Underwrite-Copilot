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

/** What the front page looks like while the feeds are still answering:
 *  the masthead line, a lead block, three columns. */
function LiveHeadlinesFallback() {
  return (
    <section aria-busy="true" aria-label="Headlines loading">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-y-2 border-ink py-1.5 text-[11px] uppercase tracking-[0.14em] text-muted">
        <h2 className="font-semibold text-ink">Today&apos;s headlines</h2>
        <span>reading the publishers’ feeds…</span>
      </div>
      <div className="mt-5 grid gap-5 border-b border-line pb-6 md:grid-cols-5 md:gap-8">
        <div className="space-y-3 md:col-span-3">
          <div className="h-3 w-24 animate-pulse rounded bg-faint" />
          <div className="h-8 w-11/12 animate-pulse rounded bg-faint" />
          <div className="h-8 w-2/3 animate-pulse rounded bg-faint" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-faint" />
        </div>
        <div className="aspect-[3/2] animate-pulse rounded-sm bg-faint md:col-span-2" />
      </div>
      <div className="grid gap-6 py-5 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[16/9] animate-pulse rounded-sm bg-faint" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-faint" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-faint" />
          </div>
        ))}
      </div>
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
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">News</h1>
        <p className="text-sm text-muted">
          The publishers&apos; own feeds, most decision-relevant first; every headline opens its
          source.
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
