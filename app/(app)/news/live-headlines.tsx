import type { LiveHeadlines, SourceStatus } from "@/lib/news/live";
import { headlineSignals, searchHostsAnswering, timeAgo, type RankedHeadline } from "@/lib/news/feeds";
import { headlineMarkets } from "@/lib/news/markets";

/** The front page's shape: one lead, a grid of six, the rest as a list. */
const GRID = 6;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * The live layer of the News page as a newspaper's front page — a pure
 * view of one fetch. The top story leads with a kicker, a serif headline,
 * its dek and the publisher's own picture where the feed carries one; six
 * more stand in a three-column grid under rules; the rest run as a
 * two-column list; the sources close the page as one line, each in the
 * state it answered in. Renders a plain sentence, never a fake page, when
 * every source is unreachable. No I/O here: the page fetches and hands
 * the result in, and the render tests hand it a fixture.
 */
export function LiveHeadlinesView({ live }: { live: LiveHeadlines }) {
  const answered = live.sources.filter((s) => s.ok || s.stale);
  const searchHosts = searchHostsAnswering(live.sources);
  const now = Date.parse(live.fetchedAt);
  const [lead, ...rest] = live.headlines;
  const grid = rest.slice(0, GRID);
  const list = rest.slice(GRID);
  return (
    <section aria-labelledby="live-news">
      {/* The masthead line: the day, and how much of the press answered. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-y-2 border-ink py-1.5 text-[11px] uppercase tracking-[0.14em] text-muted">
        <h2 id="live-news" className="font-semibold text-ink">
          Today&apos;s headlines
        </h2>
        <span>{fmtDate(live.fetchedAt)}</span>
        <span>
          live from {answered.length} of {live.sources.length} sources · refreshed every 30 min
        </span>
      </div>

      {!lead ? (
        <p className="mt-4 text-sm text-muted">
          None of the publishers answered just now — their feeds are checked
          again on the next visit.{" "}
          <a href="/news" className="font-medium text-brand hover:text-brand-strong">
            Try again
          </a>
          . <code className="text-[11px]">/api/news/health</code> shows what each one said.
        </p>
      ) : (
        <>
          {/* The lead: the story the ranking put first, at the size it earns. */}
          <article className="mt-5 grid gap-5 border-b border-line pb-6 md:grid-cols-5 md:gap-8">
            <div className={lead.image ? "md:col-span-3" : "md:col-span-5"}>
              <Kicker h={lead} />
              <h3 className="mt-1.5 font-serif text-[28px] font-semibold leading-[1.15] tracking-tight text-ink md:text-[34px]">
                <Story h={lead} />
              </h3>
              {lead.snippet && (
                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink/80">{lead.snippet}</p>
              )}
              <Byline h={lead} now={now} />
            </div>
            {lead.image && <Picture src={lead.image} className="aspect-[3/2] md:col-span-2" />}
          </article>

          {grid.length > 0 && (
            <div className="grid md:grid-cols-3">
              {grid.map((h, i) => (
                <article
                  key={h.url}
                  className={`border-b border-line py-5 md:border-b-0 ${
                    i % 3 !== 0 ? "md:border-l md:border-line md:pl-6" : ""
                  } ${i % 3 !== 2 ? "md:pr-6" : ""} ${i >= 3 ? "md:border-t md:border-line" : ""}`}
                >
                  {h.image && <Picture src={h.image} className="mb-3 aspect-[16/9]" />}
                  <Kicker h={h} />
                  <h3 className="mt-1 font-serif text-[19px] font-semibold leading-snug text-ink">
                    <Story h={h} />
                  </h3>
                  {h.snippet && (
                    <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted">{h.snippet}</p>
                  )}
                  <Byline h={h} now={now} />
                </article>
              ))}
            </div>
          )}

          {list.length > 0 && (
            <div className="mt-2 border-t-2 border-ink pt-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">More headlines</h3>
              <ul className="mt-1 md:columns-2 md:gap-8">
                {list.map((h) => (
                  <li key={h.url} className="break-inside-avoid border-b border-line py-2.5">
                    <Kicker h={h} small />
                    <p className="font-serif text-[15px] font-semibold leading-snug text-ink">
                      <Story h={h} />
                    </p>
                    <Byline h={h} now={now} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* The sources as one line, each in the state it answered in — a dot
          for one that answered, an amber dot for a copy from earlier, a
          hollow one for a source that did not answer just now. */}
      <div className="mt-5 border-t border-line pt-3">
        <ul aria-label="Sources" className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-muted">
          <li className="font-semibold uppercase tracking-[0.14em] text-ink">Sources</li>
          {live.sources.map((s) => (
            <SourceChip key={s.id} source={s} />
          ))}
          {searchHosts.map((h) => (
            <li
              key={h.name}
              title={`${h.name} topic searches stand behind the sources that named it, each item naming its outlet`}
            >
              <a href={h.home} target="_blank" rel="noreferrer" className="hover:text-brand">
                via {h.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Ranked by recency and by what each headline touches; the publishers&apos; own words and
          pictures, nothing written here.
        </p>
      </div>
    </section>
  );
}

/** The headline as its link. */
function Story({ h }: { h: RankedHeadline }) {
  return (
    <a href={h.url} target="_blank" rel="noreferrer" className="hover:text-brand">
      {h.title}
    </a>
  );
}

/** The kicker above a headline — what the story touches, and the covered
 *  market it names, in the front page's small capitals. */
function Kicker({ h, small }: { h: RankedHeadline; small?: boolean }) {
  const tags = headlineSignals(h);
  const market = headlineMarkets(h)[0];
  const strong = tags.find((t) => t.strong) ?? tags[0];
  if (!strong && !market) return null;
  return (
    <p className={`${small ? "text-[10px]" : "text-[11px]"} font-semibold uppercase tracking-[0.14em]`}>
      {strong && <span className="text-brand">{strong.label}</span>}
      {strong && market && (
        <>
          {" "}
          <span aria-hidden className="text-line">
            |
          </span>{" "}
        </>
      )}
      {market && (
        <a href={market.href} title={`${market.name} — open the market brief`} className="text-ink hover:text-brand">
          {market.label}
        </a>
      )}
    </p>
  );
}

/** The publisher and the story's age, as a byline. */
function Byline({ h, now }: { h: RankedHeadline; now: number }) {
  return (
    <p className="mt-2 text-[11px] uppercase tracking-wide text-muted">
      {h.publisherUrl ? (
        <a href={h.publisherUrl} target="_blank" rel="noreferrer" className="hover:text-brand">
          {h.publisher}
        </a>
      ) : (
        h.publisher
      )}
      {h.publishedAt ? ` · ${timeAgo(h.publishedAt, now)}` : ""}
    </p>
  );
}

/** The publisher's picture for a story, decorative beside its headline. */
function Picture({ src, className }: { src: string; className: string }) {
  return (
    <div className={`overflow-hidden rounded-sm bg-faint ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the publisher's
          own host, read straight from its feed; nothing to optimise here */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    </div>
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
  const dot =
    state === "live"
      ? "bg-pass"
      : state === "stale"
        ? "bg-caution"
        : "bg-transparent ring-1 ring-inset ring-line";
  const inner = (
    <>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {label}
      {state === "stale" && <span className="sr-only"> (earlier copy)</span>}
      {state === "off" && <span className="sr-only"> (did not answer)</span>}
    </>
  );
  return (
    <li className={`inline-flex items-center ${state === "off" ? "text-muted/70" : "text-ink"}`} title={title}>
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
