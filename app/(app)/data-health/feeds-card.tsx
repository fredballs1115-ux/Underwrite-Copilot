import { Fragment } from "react";
import { feedStatusWord, type FeedStatus } from "@/lib/feed-health";

type StatusWord = ReturnType<typeof feedStatusWord>;

/** A feed's newest observation and how old it is, or a dash for none. */
const newestText = (f: FeedStatus) =>
  f.newest ? `${f.newest} · ${f.ageDays === 0 ? "today" : `${f.ageDays} ${f.ageDays === 1 ? "day" : "days"} old`}` : "—";

/** How many of a feed's series are current, or a dash where it has none. */
const seriesText = (f: FeedStatus) => (f.seriesTotal > 0 ? `${f.seriesFresh} of ${f.seriesTotal} current` : "—");

/** The series a feed holds stale, named, comma between — a hyphenated word
 *  ("5-yr", "2026-06-30") kept whole, since a line broken at its hyphen
 *  reads as two names. */
function StaleNames({ names }: { names: readonly string[] }) {
  return names.map((name, i) => (
    <Fragment key={`${name}-${i}`}>
      {i > 0 && ", "}
      {name.split(/(\s+)/).map((word, j) =>
        word.includes("-") ? (
          <span key={j} className="whitespace-nowrap">
            {word}
          </span>
        ) : (
          word
        ),
      )}
    </Fragment>
  ));
}

function StatusChip({ word }: { word: StatusWord }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
        word === "current" ? "bg-pass/10 text-pass" : word === "stale" ? "bg-amber-500/15 text-amber-700" : "bg-kill/10 text-kill"
      }`}
    >
      {word}
    </span>
  );
}

/**
 * What each feed last wrote (lib/feed-health), one row a feed: its
 * publisher, when it runs, the newest observation it holds and how old
 * that is, and whether every series in it is current for its own cadence
 * — with the stale ones named. A stale row is tinted; a feed with no rows
 * says so. On a phone each feed is a stacked entry rather than a table row:
 * the table's six columns scrolled its last two — the series and the
 * stale series' names — out of view at 390px. Pure: the page reads, this
 * draws, and the render test draws it on fixtures.
 */
export function FeedsCard({ feeds, sample }: { feeds: readonly FeedStatus[]; sample: string }) {
  const stale = feeds.filter((f) => feedStatusWord(f) !== "current");
  // The states' series are judged on one state's rows, named beside the metro.
  const stateSample = feeds.find((f) => f.spec.id === "state_fred")?.sample ?? null;
  return (
    <section
      className={`rounded-xl border p-4 ${stale.length ? "border-amber-500/40 bg-amber-500/5" : "border-line bg-surface"}`}
      data-qa="feeds-card"
    >
      <h2 className="text-sm font-semibold">Feeds — what each pull last wrote</h2>
      <p className="mt-1 text-sm text-muted">
        {feeds.length === 0
          ? "The rates and benchmarks tables could not be read just now, so nothing here can be judged."
          : stale.length === 0
            ? `Every feed is current for its own cadence. Per-metro feeds are judged on ${sample}, the one market every source covers${stateSample ? `, and the states' series on ${stateSample}` : ""}.`
            : `${stale.length} of ${feeds.length} feeds ${stale.length === 1 ? "is" : "are"} not current — the series are named below. Per-metro feeds are judged on ${sample}, the one market every source covers${stateSample ? `, and the states' series on ${stateSample}` : ""}.`}
      </p>
      {feeds.length > 0 && (
        <>
          <ul className="mt-3 divide-y divide-line/60 text-xs sm:hidden" data-qa="feeds-list">
            {feeds.map((f) => {
              const word = feedStatusWord(f);
              return (
                <li key={f.spec.id} className={`-mx-2 px-2 py-2 ${word === "current" ? "" : "bg-amber-500/10"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium">{f.spec.name}</span>
                    <StatusChip word={word} />
                  </div>
                  <p className="mt-0.5 text-muted">
                    {f.spec.publisher} · {f.spec.schedule} <span className="font-mono text-[10px]">({f.spec.workflow})</span>
                  </p>
                  <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                    <dt className="text-muted">Newest observation</dt>
                    <dd className="font-mono tabular-nums">{newestText(f)}</dd>
                    <dt className="text-muted">Series</dt>
                    <dd className="tabular-nums">{seriesText(f)}</dd>
                    {f.stale.length > 0 && (
                      <>
                        <dt className="text-muted">Not current</dt>
                        <dd>
                          <StaleNames names={f.stale} />
                        </dd>
                      </>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted">
                  <th scope="col" className="py-1 pr-3 font-medium">Feed</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Publisher</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Runs</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Newest observation</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Series</th>
                  <th scope="col" className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {feeds.map((f) => {
                  const word = feedStatusWord(f);
                  return (
                    <tr key={f.spec.id} className={`border-t border-line/60 ${word === "current" ? "" : "bg-amber-500/10"}`}>
                      <td className="py-1.5 pr-3 font-medium">{f.spec.name}</td>
                      <td className="py-1.5 pr-3 text-muted">{f.spec.publisher}</td>
                      <td className="py-1.5 pr-3 text-muted">{f.spec.schedule} <span className="font-mono text-[10px]">({f.spec.workflow})</span></td>
                      <td className="py-1.5 pr-3 font-mono tabular-nums">{newestText(f)}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-muted">{seriesText(f)}</td>
                      <td className="py-1.5">
                        <StatusChip word={word} />
                        {f.stale.length > 0 && (
                          <span className="ml-2 text-muted">
                            <StaleNames names={f.stale} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
