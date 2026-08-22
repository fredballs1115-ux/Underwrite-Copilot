import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "News" };
export const dynamic = "force-dynamic";

// The stories feed: every headline the weekday intel sweep gathered and
// scored for THIS buyer, newest day first, each linking straight to the
// source. Big law/regulation changes get the top strip (they also red-banner
// app-wide until dismissed). Nothing here is written by us — it's the
// news itself, scored and linked; a quiet feed means the cron hasn't run,
// and the empty state says exactly that.

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
          Every story the weekday sweep gathered for your markets and
          strategy, scored 0–10 for how much it matters to your buy box —
          each headline links straight to the source. Law and regulation
          changes get flagged here and as red banners app-wide.
        </p>
      </header>

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
        <section className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">
          No stories yet. The weekday intel cron gathers and scores the news
          each morning (migrations 0023/0024 + the cron with its env vars) —
          until it runs, this feed stays honestly empty rather than showing
          filler.
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
