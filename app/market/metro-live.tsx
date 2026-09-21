import { RateTile } from "@/app/rates-strip";
import {
  formatValue,
  permitsTrailingYear,
  shortDate,
  type LiveRate,
  type MetroSeriesMeta,
} from "@/lib/live-rates";

/**
 * A covered metro's own figures, live from FRED — the four things a metro
 * publishes that a screen actually turns on, under the market brief.
 *
 * Pure: the page reads the table and hands the rows in, so this renders on
 * a fixture in `lib/views.render.test.ts`. Nothing renders with no rows —
 * a metro FRED does not publish for gets no panel rather than an empty one.
 *
 * Four tiles, each the same thing the rates strip draws — a figure, its
 * path, its move, its date and its link — filed under a place:
 *
 * - **Unemployment**, the metro's rate (for a county that FRED publishes
 *   its own for, the county's).
 * - **Jobs, y/y** — nonfarm payrolls against a year ago, FRED's own
 *   transform, because the level (3.3 million people) says nothing a
 *   screen can use and the change is the whole demand story.
 * - **Permits, twelve months** — a metro's permits arrive as one month's
 *   count, not seasonally adjusted, so a single month is mostly the season;
 *   a year of them summed is the pipeline, and the year before is its
 *   direction. Drawn as the monthly path, said as the year.
 * - **House prices, y/y** — FHFA's all-transactions index against a year
 *   ago, quarterly.
 *
 * BORROWED IS SAID. A suburb of Washington has its own unemployment rate
 * and nothing else at this cadence — permits, payrolls and house prices
 * are published for the MSA — so those tiles carry the MSA's name in
 * their heading and the note says so. Passing an MSA's figure off as a
 * county's would be wrong in the direction that flatters whichever county
 * is weaker.
 */
export function MetroLive({
  rates,
  metroId,
  metroName,
}: {
  rates: readonly LiveRate[];
  /** The covered metro's id — a series filed under another metro is borrowed. */
  metroId: string;
  /** The covered metro's own name, for the note. */
  metroName: string;
}) {
  if (rates.length === 0) return null;
  const metas = rates.map((r) => r.meta as MetroSeriesMeta);
  const borrowed = metas.filter((m) => m.metro !== metroId);
  // The areas FRED names, for the heading — the metro's own, then the MSA
  // whose figures fill in.
  const areas = Array.from(new Set(metas.map((m) => m.area)));

  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wide text-muted">
        Live from FRED
        <span className="ml-1.5 font-normal normal-case tracking-normal">
          · {areas.join(" · ")}
        </span>
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {rates.map((r) => {
          const meta = r.meta as MetroSeriesMeta;
          // A borrowed figure wears the MSA's name on its own tile.
          const owner = meta.metro === metroId ? "" : ` · ${meta.area}`;
          if (meta.metric === "permits") {
            const year = permitsTrailingYear(r);
            if (!year) {
              return (
                <RateTile
                  key={r.meta.id}
                  r={r}
                  value={`${formatValue(r)} in ${shortDate(r.obsDate)}`}
                  short={`Permits, one month${owner}`}
                />
              );
            }
            const arrow =
              year.changePct === null ? null : year.changePct > 0 ? "▲" : year.changePct < 0 ? "▼" : "•";
            return (
              <RateTile
                key={r.meta.id}
                r={r}
                short={`Permits, 12 months${owner}`}
                value={`${year.units.toLocaleString("en-US")} units`}
                sub={
                  <>
                    {year.changePct !== null && arrow && (
                      <>
                        <span aria-hidden="true">{arrow}</span>
                        <span className="sr-only">
                          {year.changePct > 0 ? "up " : year.changePct < 0 ? "down " : "unchanged, "}
                        </span>
                        <span className="tabular-nums">{Math.abs(year.changePct).toFixed(1)}%</span>
                        {" on the year before · "}
                      </>
                    )}
                  </>
                }
              />
            );
          }
          return <RateTile key={r.meta.id} r={r} short={`${r.meta.short}${owner}`} />;
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Pulled every weekday; each figure links to its series.
        {borrowed.length > 0 &&
          ` Where FRED publishes nothing for ${metroName} itself, the figure is the metro area's, named on the tile.`}
      </p>
    </div>
  );
}
