import { fredUrl, shortDate, type LiveRate } from "@/lib/live-rates";

/**
 * Today's rates — across the top of the calculators, and on `/market`.
 *
 * At the app root beside `place-band.tsx` because two pages draw it, and for
 * the same reason that one is: a second copy is how two surfaces come to
 * disagree about the same figure.
 *
 * Pure: the page reads the table and hands the rows in, so this renders on a
 * fixture in `lib/views.render.test.ts` without touching a database.
 *
 * `seeds` is the series that actually pre-fill a field below, and it is a
 * prop rather than something derived here on purpose. `contractRate` says a
 * loan document NAMES the rate, which is the standing fact; whether a card
 * on this page currently takes it is a different and changing one. Drawing
 * the emphasis from the second means the marked tiles are exactly the ones
 * an analyst will find already filled in — the picture cannot drift from
 * what the page does, because it is the same list.
 */
export function RatesStrip({
  rates,
  seeds = [],
}: {
  rates: readonly LiveRate[];
  seeds?: readonly string[];
}) {
  if (rates.length === 0) return null;
  const filling = rates.filter((r) => seeds.includes(r.meta.id));

  return (
    <section
      aria-labelledby="rates-today"
      className="shadow-card rounded-2xl border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="rates-today" className="text-sm font-semibold tracking-tight">
          Rates today
        </h2>
        <p className="text-[11px] text-muted">
          FRED, pulled every weekday. Each figure links to its series.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {rates.map((r) => (
          <div
            key={r.meta.id}
            className={`border-l-2 pl-3 ${
              seeds.includes(r.meta.id) ? "border-brand" : "border-line"
            }`}
          >
            <p
              className="text-[11px] uppercase tracking-wide text-muted"
              title={r.meta.label}
            >
              {r.meta.short}
            </p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-ink">
              {r.value.toFixed(2)}%
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {r.moveBps !== null && (
                <>
                  <span aria-hidden="true">
                    {r.moveBps > 0 ? "▲" : r.moveBps < 0 ? "▼" : "•"}
                  </span>
                  <span className="sr-only">
                    {r.moveBps > 0 ? "up " : r.moveBps < 0 ? "down " : "unchanged, "}
                  </span>
                  <span className="tabular-nums">{Math.abs(r.moveBps)}</span> bps{" "}
                </>
              )}
              <a
                href={fredUrl(r.meta.id)}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                {r.meta.short} as of {shortDate(r.obsDate)}
              </a>
              {!r.fresh && <span className="ml-1 text-amber-700">· not updating</span>}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
        {filling.length > 0 && (
          <>
            <span className="font-medium text-ink">
              {filling.map((r) => r.meta.short).join(" and ")}
            </span>{" "}
            {filling.length === 1 ? "starts a field" : "start fields"}{" "}
            below at today&apos;s figure — type over it.{" "}
          </>
        )}
        The 30-year survey is an owner-occupier residential rate, not a
        commercial quote, so it is shown here and never fills a box.
      </p>
    </section>
  );
}
