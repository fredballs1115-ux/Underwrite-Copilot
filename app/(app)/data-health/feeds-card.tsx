import { feedStatusWord, type FeedStatus } from "@/lib/feed-health";

/**
 * What each feed last wrote (lib/feed-health), one row a feed: its
 * publisher, when it runs, the newest observation it holds and how old
 * that is, and whether every series in it is current for its own cadence
 * — with the stale ones named. A stale row is tinted; a feed with no rows
 * says so. Pure: the page reads, this draws, and the render test draws it
 * on fixtures.
 */
export function FeedsCard({ feeds, sample }: { feeds: readonly FeedStatus[]; sample: string }) {
  const stale = feeds.filter((f) => feedStatusWord(f) !== "current");
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
            ? `Every feed is current for its own cadence. Per-metro feeds are judged on ${sample}, the one market every source covers.`
            : `${stale.length} of ${feeds.length} feeds ${stale.length === 1 ? "is" : "are"} not current — the series are named below. Per-metro feeds are judged on ${sample}, the one market every source covers.`}
      </p>
      {feeds.length > 0 && (
        <div className="mt-3 overflow-x-auto">
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
                    <td className="py-1.5 pr-3 font-mono tabular-nums">{f.newest ? `${f.newest} · ${f.ageDays === 0 ? "today" : `${f.ageDays} days old`}` : "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-muted">{f.seriesTotal > 0 ? `${f.seriesFresh} of ${f.seriesTotal} current` : "—"}</td>
                    <td className="py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                          word === "current" ? "bg-pass/10 text-pass" : word === "stale" ? "bg-amber-500/15 text-amber-700" : "bg-kill/10 text-kill"
                        }`}
                      >
                        {word}
                      </span>
                      {f.stale.length > 0 && <span className="ml-2 text-muted">{f.stale.join(", ")}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
