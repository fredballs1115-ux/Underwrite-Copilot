import Link from "next/link";

/** One story the weekday intel sweep scored, as the pipeline's strip reads
 *  it (a row of market_intel_items, migration 0024). */
export interface NewsStripItem {
  url: string;
  title: string;
  source: string | null;
  relevance: number | null;
  /** the story's own date, as its feed stated it; null where it stated none */
  published_at: string | null;
}

/** "Sep 29, 2026" — the day as the /news page reads days, in UTC; null for
 *  a value that is not a date. */
export function storyDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * The newest high-scored stories from the weekday sweep, under the pipeline.
 * The sweep's watch list is fixed (scripts/daily-intel.mjs: DC, Maryland,
 * Virginia and East Coast rules, and national sectors) and its rows carry no
 * market, so every account sees the same stories: the strip is "CRE news",
 * never "news for your markets". Each story carries its own date where its
 * feed stated one, so an old story does not read as today's. Pure: the page
 * reads the rows and hands them in; nothing renders without a story.
 */
export function NewsStrip({ items }: { items: NewsStripItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">CRE news</h2>
        <Link
          href="/news"
          className="text-xs font-medium text-brand underline decoration-dotted underline-offset-2"
        >
          All stories →
        </Link>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((it) => {
          const date = storyDate(it.published_at);
          return (
            <li key={it.url} className="text-sm leading-snug">
              {it.relevance !== null && (
                <>
                  <span className="mr-2 rounded bg-faint px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
                    {it.relevance}/10
                  </span>{" "}
                </>
              )}
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                {it.title}
              </a>
              {(it.source || date) && (
                <>
                  {" "}
                  <span className="ml-1.5 text-[11px] text-muted">
                    {it.source}
                    {it.source && date ? " · " : null}
                    {date && it.published_at && <time dateTime={it.published_at}>{date}</time>}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
