import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { fetchLiveHeadlines } from "@/lib/news/live";
import { timeAgo } from "@/lib/news/feeds";

export const metadata: Metadata = { title: "News" };
export const dynamic = "force-dynamic";

// Two layers, both real news and both linked to the source:
//
//   1. LIVE HEADLINES — the publishers' own feeds (Commercial Observer, The
//      Real Deal, GlobeSt, Multi-Housing News, CPE, Connect CRE, REBusiness,
//      the Fed) plus Google News topic searches, fetched at request time with
//      a half-hour cache and ranked by recency and how much the headline
//      touches what moves a deal. Needs no key and no cron, so this page is
//      never empty.
//   2. THE SCORED FEED — every headline the weekday intel sweep gathered and
//      scored 0–10 for THIS buyer, newest day first. Big law/regulation
//      changes get the top strip (they also red-banner app-wide until
//      dismissed). Quiet until the cron has run, and it says so.
//
// Nothing here is written by us — it's the news itself, ranked and linked.

interface ItemRow {
  url: string;
  title: string;
  source: string | null;
  sector: string;
  relevance: number | null;
  summary: string | null;
  action: string | null;
  published_at: string | null;
  created_at: string;
}
interface AlertRow {
  id: string;
  rule_id: string | null;
  headline: string;
  url: string | null;
  detail: string | null;
  detected_at: string;
}

const SECTOR_LABEL: Record<string, string> = {
  "regulation-dc": "DC regulation",
  "regulation-md": "MD regulation",
  "regulation-va": "VA regulation",
  "regulation-east": "East Coast regulation",
  multifamily: "multifamily",
  "capital-markets": "capital markets",
  tax: "tax",
  "housing-policy": "housing policy",
  "national-markets": "national markets",
  "deal-flow": "deal flow",
  "construction-supply": "construction",
};

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

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
 * The live layer: ranked headlines with publisher, age and a one-line
 * snippet, then the sources — the ones that answered as links, the ones
 * that did not, named. Renders a plain sentence, never a fake list, when
 * every source is unreachable. Async so it streams in behind the rest of
 * the page (see the Suspense boundary in NewsPage).
 */
async function LiveHeadlinesSection() {
  const live = await fetchLiveHeadlines();
  const answered = live.sources.filter((s) => s.ok || s.stale);
  const missing = live.sources.filter((s) => !s.ok && !s.stale);
  const publishers = answered.filter((s) => s.kind === "publisher");
  const now = Date.parse(live.fetchedAt);
  return (
    <section aria-labelledby="live-news">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="live-news" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Headlines now
        </h2>
        <span className="text-[11px] text-muted">
          live from the sources · refreshed every 30 min
        </span>
      </div>

      {live.headlines.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          None of the publishers answered just now — their feeds are checked
          again on the next visit. <code className="text-[11px]">/api/news/health</code>{" "}
          shows what each one said.
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {live.headlines.map((h, i) => (
            <li key={h.url} className="flex gap-3 px-3.5 py-3 text-sm leading-snug">
              <span className="mt-px w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
                >
                  {h.title}
                </a>
                <span className="ml-2 whitespace-nowrap text-[11px] text-muted">
                  {h.publisherUrl ? (
                    <a href={h.publisherUrl} target="_blank" rel="noreferrer" className="hover:text-brand">
                      {h.publisher}
                    </a>
                  ) : (
                    h.publisher
                  )}
                  {h.publishedAt ? ` · ${timeAgo(h.publishedAt, now)}` : ""}
                </span>
                {h.snippet && (
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{h.snippet}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Sources:{" "}
        {publishers.length > 0
          ? publishers.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <a href={s.home} target="_blank" rel="noreferrer" className="hover:text-brand">
                  {s.name}
                </a>
                {s.stale ? " (earlier copy)" : ""}
              </span>
            ))
          : "no publisher feed answered"}
        {answered.some((s) => s.kind === "topic") && (
          <>
            {publishers.length > 0 ? ", plus " : ", "}
            <a
              href="https://news.google.com/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-brand"
            >
              Google News
            </a>{" "}
            topic searches naming each outlet
          </>
        )}
        .
        {missing.length > 0 && (
          <>
            {" "}
            Did not answer just now:{" "}
            {missing.map((s) => s.name.replace(/^Google News · /, "GN ")).join(", ")}.
          </>
        )}{" "}
        Ranked by recency and by how much the headline touches rates, cap
        rates, distress, regulation and supply — nothing here is written by us.
      </p>
    </section>
  );
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
    // tables absent until migrations run — empty state below explains
  }

  const sectors = [...new Set(items.map((i) => i.sector))].sort();
  const want = (params.sector ?? "").slice(0, 40);
  const active = sectors.includes(want) ? want : null;
  const shown = (active ? items.filter((i) => i.sector === active) : items)
    // High-signal first within the feed, but keep day order dominant below.
    .slice(0, 120);

  // Group by the day the sweep picked the story up.
  const byDay = new Map<string, ItemRow[]>();
  for (const it of shown) {
    const day = it.created_at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(it);
    byDay.set(day, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (b.relevance ?? -1) - (a.relevance ?? -1));
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

      {alerts.length > 0 && (
        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-red-600">
            Law &amp; rule changes
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {alerts.map((a) => (
              <li key={a.id} className="leading-snug">
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-brand"
                  >
                    {a.headline}
                  </a>
                ) : (
                  a.headline
                )}
                <span className="ml-2 text-[11px] text-muted">
                  {a.detected_at.slice(0, 10)}
                  {a.rule_id ? ` · affects ${a.rule_id}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sectors.length > 1 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Link
            href="/news"
            className={`rounded-full border px-2.5 py-1 transition-colors ${
              !active
                ? "border-brand bg-brand/10 text-brand"
                : "border-line text-muted hover:border-brand hover:text-brand"
            }`}
          >
            All
          </Link>
          {sectors.map((s) => (
            <Link
              key={s}
              href={`/news?sector=${encodeURIComponent(s)}`}
              className={`rounded-full border px-2.5 py-1 transition-colors ${
                active === s
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-line text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {SECTOR_LABEL[s] ?? s}
            </Link>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          <span className="font-medium text-ink">Scored for your markets — not yet.</span>{" "}
          The weekday sweep gathers the news each morning and scores every
          story 0–10 for your buy box, with law and rule changes flagged. It
          runs from GitHub Actions once its secrets are set; until then the
          live headlines above are the news, unscored.
        </section>
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <section key={day}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {fmtDay(day)}
            </h2>
            <ul className="mt-2 space-y-2.5">
              {list.map((it) => (
                <li
                  key={it.url}
                  className="rounded-xl border border-line bg-surface p-3.5 text-sm leading-snug"
                >
                  <div className="flex items-start gap-2.5">
                    {it.relevance !== null && (
                      <span
                        className={`mt-px shrink-0 rounded px-1.5 py-px font-mono text-[11px] tabular-nums ${
                          it.relevance >= 6
                            ? "bg-brand/10 text-brand"
                            : "bg-faint text-muted"
                        }`}
                      >
                        {it.relevance}/10
                      </span>
                    )}
                    <div className="min-w-0">
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
                      >
                        {it.title}
                      </a>
                      <span className="ml-2 text-[11px] text-muted">
                        {it.source ?? "source"}
                        {" · "}
                        {SECTOR_LABEL[it.sector] ?? it.sector}
                      </span>
                      {it.summary && (
                        <p className="mt-1 text-[13px] text-muted">{it.summary}</p>
                      )}
                      {it.action && (
                        <p className="mt-1 text-[13px] font-medium text-ink/80">
                          → {it.action}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
