import { RateTile } from "@/app/rates-strip";
import {
  formatMove,
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
 * - **Rent CPI, y/y** — the CPI's rent of primary residence for the area
 *   against a year ago: what SITTING tenants pay, across every lease the
 *   survey reaches, where the asking rent drawn above it is this month's
 *   new leases. The two are different numbers about different tenants, and
 *   an underwrite needs both — the in-place rent is what a rent roll grows
 *   at, the asking rent is what a vacant unit re-lets at. Eight metros'
 *   come from FRED; Washington's, Baltimore's, Los Angeles's and San
 *   Francisco's come from the BLS's own API, because FRED does not carry
 *   the CPI areas the BLS redrew in 2018 — and the tile says so.
 *
 * - **Rental vacancy**, twice: the Housing Vacancy Survey's own quarterly
 *   figure for the metro area, read out of the survey's workbook with the
 *   survey's MARGIN OF ERROR beside it — a sample's figure for one metro
 *   is wide (Richmond's ±5 points on a 7% rate), so a quarter's move inside
 *   the margin is noise and the tile says the margin rather than hiding
 *   it — and the same survey's rate for the Census region the metro sits
 *   in, the steadier figure, named as the region's.
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
  // Borrowed from the MSA — the region's rental vacancy is borrowed too, and
  // said in its own sentence, since "the metro area's" would be wrong of it.
  const borrowed = metas.filter((m) => m.metro !== metroId && m.metric !== "rental_vacancy");
  // The areas FRED names, for the heading — the metro's own, then the MSA
  // whose figures fill in.
  const areas = Array.from(new Set(metas.map((m) => m.area)));
  const fromBls = metas.some((m) => m.source === "bls");
  const fromCensus = metas.some((m) => m.source === "census");
  const hasRentIndex = metas.some((m) => m.metric === "rent_cpi_yoy");
  const hasRegionVacancy = metas.some((m) => m.metric === "rental_vacancy");
  const hasMsaVacancy = metas.some((m) => m.metric === "rental_vacancy_msa");
  // Every source a figure on the panel came from, and none it did not.
  const sources = ["FRED", fromBls ? "the BLS" : null, fromCensus ? "the Census Bureau" : null].filter(
    (s): s is string => s !== null,
  );
  const heading =
    sources.length === 1
      ? `Live from ${sources[0]}`
      : `Live from ${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]}`;

  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wide text-muted">
        {heading}
        <span className="ml-1.5 font-normal normal-case tracking-normal">
          · {areas.join(" · ")}
        </span>
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
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
          if (meta.metric === "rental_vacancy_msa" && r.moe !== null) {
            return (
              <RateTile
                key={r.meta.id}
                r={r}
                short={`${r.meta.short}${owner}`}
                sub={<VacancySub r={r} />}
              />
            );
          }
          return <RateTile key={r.meta.id} r={r} short={`${r.meta.short}${owner}`} />;
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Pulled every weekday; each figure links to its series.
        {hasRentIndex &&
          " The rent index is what sitting tenants pay across the area's leases; the asking rent above is this month's new ones."}
        {fromBls &&
          " Where FRED does not carry the area, the rent index comes from the BLS directly."}
        {borrowed.length > 0 &&
          ` Where FRED publishes nothing for ${metroName} itself, the figure is the metro area's, named on the tile.`}
        {hasMsaVacancy &&
          " The metro area's rental vacancy is the Housing Vacancy Survey's own figure for it, with the survey's margin of error beside it: the survey is a sample, so a quarter's move inside the margin is noise, and the region's figure is the steadier one."}
        {hasRegionVacancy &&
          (hasMsaVacancy
            ? " The region's rental vacancy is the same survey's, from FRED, named as the region's."
            : " The rental vacancy is the Census Bureau's Housing Vacancy Survey, which publishes no metro figure: the tile carries the region's and names it.")}
      </p>
    </div>
  );
}

/**
 * A survey figure's line under the tile: its move on the quarter before,
 * as every tile says it, then the survey's margin of error for THIS
 * quarter — one string, so the phrase live-verify greps has no separator
 * inside it. The tile's own link follows.
 */
function VacancySub({ r }: { r: LiveRate }) {
  const move = formatMove(r);
  return (
    <>
      {r.move !== null && move !== null && (
        <>
          <span aria-hidden="true">{r.move > 0 ? "▲" : r.move < 0 ? "▼" : "•"}</span>
          <span className="sr-only">{r.move > 0 ? "up " : r.move < 0 ? "down " : "unchanged, "}</span>
          <span className="tabular-nums">{move.split(" ")[0]}</span>
          {` ${move.split(" ")[1] ?? ""} on the quarter before · `}
        </>
      )}
      {r.moe !== null ? `±${r.moe} pts margin of error · ` : ""}
    </>
  );
}
