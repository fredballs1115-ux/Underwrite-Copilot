// /market in outline while its sections are read — the page runs some ten
// reads (the reader's memory and submarkets, the metro's live figures, the
// boards over every metro area), and a hard load stayed white until they
// had all answered. The outline is the page's own: its heading, the metro
// explorer's chips over the market's photograph band, then the cards and
// the boards below. The .skeleton sweep runs only where motion is welcome.
export default function MarketLoading() {
  return (
    <div role="status" aria-label="Loading the markets" className="space-y-6">
      <div className="space-y-2.5">
        <div className="skeleton h-8 w-64 max-w-full rounded-lg" />
        <div className="skeleton h-3.5 w-96 max-w-full rounded" />
      </div>

      {/* The metro explorer: its heading, a row of market chips, the
          market's band (15rem, 21rem from sm, as MarketBand draws it) and
          the lines of its brief. */}
      <div className="shadow-card rounded-2xl border border-line bg-surface p-5">
        <div className="skeleton h-3.5 w-32 rounded" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton h-7 w-24 rounded-full" />
          ))}
        </div>
        <div className="skeleton mt-4 h-60 w-full rounded-2xl sm:h-84" />
        <div className="mt-4 space-y-2">
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-11/12 rounded" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>
      </div>

      {/* The cards and the boards beneath. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-40 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-96 w-full rounded-2xl" />
    </div>
  );
}
