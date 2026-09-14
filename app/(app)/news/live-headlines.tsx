import type { LiveHeadlines, SourceStatus } from "@/lib/news/live";
import { searchHostsAnswering, timeAgo } from "@/lib/news/feeds";

/**
 * The live layer of the News page, as a pure view of one fetch: ranked
 * headlines with publisher, age and a one-line snippet, then the sources
 * as a row of chips — a dot in the call's colour for the ones that
 * answered, an amber one for a copy from earlier, a dashed grey chip for
 * the ones that did not answer just now — and the search hosts that stood
 * behind them. Renders a plain sentence, never a fake list, when every
 * source is unreachable. No I/O here: the page fetches and hands the
 * result in, and the render tests hand it a fixture.
 */
export function LiveHeadlinesView({ live }: { live: LiveHeadlines }) {
  const answered = live.sources.filter((s) => s.ok || s.stale);
  const searchHosts = searchHostsAnswering(live.sources);
  const now = Date.parse(live.fetchedAt);
  return (
    <section aria-labelledby="live-news">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="live-news" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Headlines now
        </h2>
        <span className="text-[11px] text-muted">
          live from {answered.length} of {live.sources.length} sources · refreshed every 30 min
        </span>
      </div>

      {live.headlines.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          None of the publishers answered just now — their feeds are checked
          again on the next visit.{" "}
          <a href="/news" className="font-medium text-brand hover:text-brand-strong">
            Try again
          </a>
          . <code className="text-[11px]">/api/news/health</code> shows what each one said.
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

      {/* The sources as a picture: one chip each, in the state it answered
          in, so the row says at a glance which publishers are live, which
          stood in from an earlier copy and which did not answer — what a
          paragraph used to list. */}
      <ul aria-label="Sources" className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {live.sources.map((s) => (
          <SourceChip key={s.id} source={s} />
        ))}
        {searchHosts.map((h) => (
          <li
            key={h.name}
            className="inline-flex items-center rounded-full border border-line bg-faint px-2 py-0.5 text-[11px] text-muted"
            title={`${h.name} topic searches stand behind the sources that named it, each item naming its outlet`}
          >
            <a href={h.home} target="_blank" rel="noreferrer" className="hover:text-brand">
              via {h.name}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Ranked by recency and by how much the headline touches rates, cap
        rates, distress, regulation and supply — nothing here is written by us.
      </p>
    </section>
  );
}

function SourceChip({ source: s }: { source: SourceStatus }) {
  const state: "live" | "stale" | "off" = s.ok && !s.stale ? "live" : s.stale ? "stale" : "off";
  // A topic search reads as its topic; the row already says the host.
  const label = s.name.replace(/^Google News · /, "");
  const title =
    state === "live"
      ? `${s.name} — ${s.count} item${s.count === 1 ? "" : "s"}${s.via ? `, via ${s.via}` : ""}`
      : state === "stale"
        ? `${s.name} — an earlier copy stands in (${s.error ?? "did not answer"})`
        : `${s.name} — did not answer just now (${s.error ?? "no answer"})`;
  const dot = state === "live" ? "bg-pass" : state === "stale" ? "bg-caution" : "bg-line";
  const inner = (
    <>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {label}
      {state === "stale" && <span className="sr-only"> (earlier copy)</span>}
      {state === "off" && <span className="sr-only"> (did not answer)</span>}
    </>
  );
  return (
    <li
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
        state === "off" ? "border-dashed border-line text-muted" : "border-line bg-surface text-ink"
      }`}
      title={title}
    >
      {state === "off" ? (
        <span className="inline-flex items-center gap-1.5">{inner}</span>
      ) : (
        <a href={s.home} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-brand">
          {inner}
        </a>
      )}
    </li>
  );
}
