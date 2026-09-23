import { RateTile } from "@/app/rates-strip";
import {
  SECTOR_JOBS_LABEL,
  formatMove,
  formatValue,
  isSectorJobsMetric,
  permitsTrailingYear,
  seriesUrl,
  shortDate,
  type LiveRate,
  type MetroSeriesMeta,
  type SectorJobsMetric,
} from "@/lib/live-rates";
import { monthOf } from "@/lib/zori";
import { metroSupply, type MetroSupply } from "@/lib/metro-supply";

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
 * - **Jobs by sector** — the same payroll count taken apart: the BLS's
 *   supersector employment for the MSA, five sectors against a year ago,
 *   drawn as ONE PICTURE (signed bars from a centre line, beside all
 *   payrolls) rather than five more tiles, because the reading is the
 *   comparison — which sectors are growing — and a tile a sector would
 *   hide it in a grid. Each sector is the one that fills a kind of
 *   building: professional and business services fill offices,
 *   transportation and warehousing fill warehouses, retail trade fills
 *   stores, leisure and hospitality run hotels, education and health
 *   staff clinics. The market check reads the deal's own sector from the
 *   same rows (`sectorJobsFor`), so a visitor sees what a screen is
 *   handed.
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
  // The sector payrolls are one picture under the tiles, not five tiles.
  const sectors = rates.filter((r) => isSectorJobsMetric((r.meta as MetroSeriesMeta).metric));
  // The single-family permits feed the supply picture, never a tile of
  // their own: a month of permits is the season, and the figure that
  // matters is the multi-unit remainder over a year.
  const tiles = rates.filter((r) => {
    const metric = (r.meta as MetroSeriesMeta).metric;
    return !isSectorJobsMetric(metric) && metric !== "permits_1unit";
  });
  const allJobs = rates.find((r) => (r.meta as MetroSeriesMeta).metric === "jobs_yoy") ?? null;
  const supply = metroSupply(rates);
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
        {tiles.map((r) => {
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
      {sectors.length > 0 && <SectorJobsPicture sectors={sectors} allJobs={allJobs} metroId={metroId} />}
      {supply && <SupplyPicture supply={supply} metroId={metroId} />}
      <p className="mt-2 text-[11px] text-muted">
        Pulled every weekday; each figure links to its series.
        {sectors.length > 0 &&
          " Jobs by sector are the BLS's payroll counts for the metro area by supersector, each against a year ago beside all payrolls: the sector that fills a building's kind is the demand an underwrite of it is assuming, and a screen of a deal here is handed that sector's line."}
        {supply &&
          " Housing supply is the Census Bureau's building permits for the metro area, twelve months against the twelve before, because a month of permits is the season: the units in buildings of two or more are the total less the single-family series, the only split FRED publishes for a metro or a state, and they are the pipeline an apartment underwrite competes with."}
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
 * The metro's payrolls by sector, on a year ago — five signed bars from a
 * centre line on one scale, with all payrolls drawn first as the figure
 * each sector is read against. The widths are the real changes
 * (aria-hidden: each row's label and figure read as text, and the figure
 * links to its series). A stale sector is drawn with its date said, as the
 * strip shows a stale figure, so a dead series is worth seeing rather
 * than silently absent; the caption carries the newest month.
 */
function SectorJobsPicture({
  sectors,
  allJobs,
  metroId,
}: {
  sectors: readonly LiveRate[];
  allJobs: LiveRate | null;
  metroId: string;
}) {
  const first = sectors[0].meta as MetroSeriesMeta;
  const owner = first.metro === metroId ? "" : ` · ${first.area}`;
  const rows: { label: string; r: LiveRate; tone: string }[] = [
    ...(allJobs ? [{ label: "All payrolls", r: allJobs, tone: "bg-ink/40" }] : []),
    ...sectors.map((r) => ({
      label: SECTOR_JOBS_LABEL[(r.meta as MetroSeriesMeta).metric as SectorJobsMetric],
      r,
      tone: "bg-brand",
    })),
  ];
  const widest = Math.max(0.1, ...rows.map((x) => Math.abs(x.r.value)));
  const newest = sectors.map((r) => r.obsDate).sort().at(-1) ?? sectors[0].obsDate;
  const stale = sectors.filter((r) => !r.fresh);
  return (
    <div className="mt-4">
      <h4 className="text-[11px] uppercase tracking-wide text-muted">{`Jobs by sector, on a year ago${owner}`}</h4>
      <div className="mt-1.5 max-w-xl space-y-1">
        {rows.map(({ label, r, tone }) => (
          <div key={r.meta.id} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-[11px] text-muted sm:w-56" title={r.meta.label}>
              {label}
            </span>
            <div className="relative h-3 flex-1 rounded-sm bg-faint" aria-hidden="true">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div
                data-bar="sectorjobs"
                className={`absolute inset-y-0 ${r.value >= 0 ? "left-1/2" : "right-1/2"} ${tone}`}
                style={{ width: `${(Math.abs(r.value) / widest) * 50}%` }}
              />
            </div>
            <a
              href={seriesUrl(r.meta.id)}
              target="_blank"
              rel="noreferrer"
              className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink underline decoration-dotted underline-offset-2 hover:text-brand"
              title={`${label}: ${r.meta.label}`}
            >
              {formatValue(r)}
            </a>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {`${monthOf(newest)} · BLS payrolls via FRED · each figure links to its series`}
        {stale.length > 0 && ` · ${stale.length === 1 ? "one sector's figure is stale" : `${stale.length} sectors' figures are stale`}: ${stale.map((r) => `${SECTOR_JOBS_LABEL[(r.meta as MetroSeriesMeta).metric as SectorJobsMetric]} as of ${shortDate(r.obsDate)}`).join(", ")}`}
      </p>
    </div>
  );
}

/**
 * The supply side: the units the metro area permitted over the last twelve
 * months against the twelve before, each year one stacked bar on one scale
 * — single-family in the neutral tone, the units in buildings of two or
 * more in the brand tone, since those are the pipeline a rental underwrite
 * competes with — with the figures beside them and both counts linked to
 * their series. The multi-unit figure is the total less the single-family
 * series, and the caption says so: FRED publishes no other split for a
 * metro. A metro with one year and no year before draws one bar.
 */
function SupplyPicture({ supply, metroId }: { supply: MetroSupply; metroId: string }) {
  // A borrowed count wears the MSA's name on the heading, as a tile does.
  const owner = supply.metro === metroId ? "" : ` · ${supply.area}`;
  const years: { label: string; single: number; multi: number; total: number; changePct: number | null }[] = [
    { label: `Twelve months to ${supply.toMonth}`, single: supply.single, multi: supply.multi, total: supply.total, changePct: supply.multiChangePct },
    ...(supply.totalPrior !== null && supply.multiPrior !== null && supply.singlePrior !== null
      ? [{ label: "The twelve before", single: supply.singlePrior, multi: supply.multiPrior, total: supply.totalPrior, changePct: null }]
      : []),
  ];
  const widest = Math.max(1, ...years.map((y) => y.total));
  return (
    <div className="mt-4">
      <h4 className="text-[11px] uppercase tracking-wide text-muted">{`Housing supply — units permitted, single-family and in buildings of two or more${owner}`}</h4>
      <div className="mt-1.5 max-w-xl space-y-1">
        {years.map((y) => (
          <div key={y.label} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-[11px] text-muted sm:w-56">{y.label}</span>
            <div className="relative flex h-3 flex-1 overflow-hidden rounded-sm bg-faint" aria-hidden="true">
              <div data-bar="supply" className="h-full bg-ink/30" style={{ width: `${(Math.max(0, y.single) / widest) * 100}%` }} />
              <div data-bar="supply" className="h-full bg-brand" style={{ width: `${(Math.max(0, y.multi) / widest) * 100}%` }} />
            </div>
            <span className="w-28 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink">
              {`${y.multi.toLocaleString("en-US")} of ${y.total.toLocaleString("en-US")}`}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {`${supply.multi.toLocaleString("en-US")} units in buildings of two or more, twelve months to ${supply.toMonth}`}
        {supply.multiChangePct !== null && (
          <>
            {" ("}
            <span aria-hidden="true">{supply.multiChangePct > 0 ? "▲" : supply.multiChangePct < 0 ? "▼" : "•"}</span>
            <span className="sr-only">{supply.multiChangePct > 0 ? "up " : supply.multiChangePct < 0 ? "down " : "unchanged, "}</span>
            <span className="tabular-nums">{Math.abs(supply.multiChangePct).toFixed(1)}%</span>
            {" on the twelve months before)"}
          </>
        )}
        {supply.multiSharePct !== null && ` · ${supply.multiSharePct.toFixed(1)}% of the units permitted`}
        {supply.fresh ? "" : " · a stale figure: the pull has not updated it on its cadence"}
        {" · Census Bureau permits via FRED: "}
        <a href={supply.hrefTotal} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-brand">
          all units
        </a>
        {" less "}
        <a href={supply.hrefSingle} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-brand">
          single-family
        </a>
        {", the only split published for a metro or a state"}
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
