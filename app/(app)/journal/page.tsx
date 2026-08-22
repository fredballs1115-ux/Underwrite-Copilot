import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { SimpleMarkdown } from "@/lib/simple-markdown";

export const metadata: Metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

interface EntryHead {
  entry_date: string;
  title: string;
  topics: string[];
  markets: string[];
  status: "ok" | "fetch_failed";
}
interface Entry extends EntryHead {
  markdown: string;
  sources: { title: string; url: string; source: string | null }[];
}

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * The Daily Journal: one dated CRE entry per weekday, written by the intel
 * cron from that morning's sourced sweep — every claim linked, failed days
 * visibly marked, never a fabricated quiet day.
 */
export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; topic?: string; market?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/journal");
  const params = await searchParams;

  const supabase = await createSupabaseServerClient();
  let heads: EntryHead[] = [];
  try {
    const { data } = await supabase
      .from("journal_entries")
      .select("entry_date, title, topics, markets, status")
      .order("entry_date", { ascending: false })
      .limit(90);
    heads = (data as EntryHead[] | null) ?? [];
  } catch {
    // table absent until migration 0028 — the empty state below explains
  }

  const topic = (params.topic ?? "").slice(0, 30);
  const market = (params.market ?? "").slice(0, 30);
  const filtered = heads.filter(
    (h) =>
      (!topic || h.topics.includes(topic)) && (!market || h.markets.includes(market))
  );

  const wantDate = /^\d{4}-\d{2}-\d{2}$/.test(params.d ?? "") ? params.d : null;
  const selectedDate =
    (wantDate && filtered.some((h) => h.entry_date === wantDate) ? wantDate : null) ??
    filtered[0]?.entry_date ??
    null;

  let entry: Entry | null = null;
  if (selectedDate) {
    const { data } = await supabase
      .from("journal_entries")
      .select("entry_date, title, markdown, topics, markets, sources, status")
      .eq("entry_date", selectedDate)
      .maybeSingle();
    entry = (data as Entry | null) ?? null;
  }

  const allTopics = [...new Set(heads.flatMap((h) => h.topics))].sort();
  const allMarkets = [...new Set(heads.flatMap((h) => h.markets))].sort();
  const filterHref = (t: string, m: string) => {
    const qs = new URLSearchParams();
    if (t) qs.set("topic", t);
    if (m) qs.set("market", m);
    const s = qs.toString();
    return s ? `/journal?${s}` : "/journal";
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">The Daily Journal</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          One entry per weekday, written from that morning&apos;s sourced news
          sweep — markets, deal flow, policy &amp; rates, and your markets.
          Every claim carries its link; a day the pipeline failed says so
          instead of pretending it was quiet.
        </p>
      </header>

      {(allTopics.length > 0 || allMarkets.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Link
            href={filterHref("", "")}
            className={`rounded-full border px-2.5 py-1 transition-colors ${
              !topic && !market
                ? "border-brand bg-brand/10 text-brand"
                : "border-line text-muted hover:border-brand hover:text-brand"
            }`}
          >
            All
          </Link>
          {allTopics.map((t) => (
            <Link
              key={`t-${t}`}
              href={filterHref(topic === t ? "" : t, market)}
              className={`rounded-full border px-2.5 py-1 transition-colors ${
                topic === t
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-line text-muted hover:border-brand hover:text-brand"
              }`}
            >
              {t}
            </Link>
          ))}
          {allMarkets.length > 0 && <span className="mx-1 text-line">|</span>}
          {allMarkets.map((m) => (
            <Link
              key={`m-${m}`}
              href={filterHref(topic, market === m ? "" : m)}
              className={`rounded-full border px-2.5 py-1 transition-colors ${
                market === m
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {m}
            </Link>
          ))}
        </div>
      )}

      {heads.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">
          No journal entries yet. The weekday intel cron writes one per
          morning once migration 0028 has run and the cron is scheduled —
          until then this page stays honestly empty rather than showing a
          sample.
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
          <div>
            {entry ? (
              <article className="shadow-card rounded-2xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold tracking-tight">{entry.title}</h2>
                  <span className="text-[11px] text-muted">{fmtDate(entry.entry_date)}</span>
                </div>
                {entry.status === "fetch_failed" ? (
                  <p className="mt-3 rounded-lg border border-caution/40 bg-caution/5 p-3 text-sm text-caution">
                    {entry.markdown}
                  </p>
                ) : (
                  <div className="mt-3">
                    <SimpleMarkdown text={entry.markdown} />
                  </div>
                )}
                {entry.sources.length > 0 && (
                  <details className="mt-4 border-t border-line pt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">
                      Sourced from {entry.sources.length} item
                      {entry.sources.length === 1 ? "" : "s"} gathered that morning
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                      {entry.sources.slice(0, 60).map((s) => (
                        <li key={s.url}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-dotted underline-offset-2 hover:text-brand"
                          >
                            {s.title}
                          </a>
                          {s.source ? ` — ${s.source}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            ) : (
              <section className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">
                No entry matches this filter.
              </section>
            )}
          </div>

          <aside>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Archive
            </h3>
            <ul className="mt-2 space-y-1">
              {filtered.slice(0, 45).map((h) => {
                const qs = new URLSearchParams();
                qs.set("d", h.entry_date);
                if (topic) qs.set("topic", topic);
                if (market) qs.set("market", market);
                return (
                  <li key={h.entry_date}>
                    <Link
                      href={`/journal?${qs.toString()}`}
                      aria-current={h.entry_date === selectedDate ? "page" : undefined}
                      className={`block rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        h.entry_date === selectedDate
                          ? "bg-brand/10 text-brand"
                          : "text-muted hover:bg-faint hover:text-ink"
                      }`}
                    >
                      <span className="font-mono tabular-nums">{h.entry_date}</span>
                      {h.status === "fetch_failed" && (
                        <span className="ml-1.5 rounded bg-caution/15 px-1 py-px text-[10px] text-caution">
                          failed
                        </span>
                      )}
                      <span className="mt-0.5 block truncate">{h.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
