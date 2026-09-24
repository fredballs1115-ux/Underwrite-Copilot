import Link from "next/link";
import { Fragment } from "react";
import {
  SECTOR_JOBS_LABEL,
  SECTOR_JOBS_METRICS,
  formatValue,
  metroSeriesFor,
  shortDate,
  type LiveRate,
  type MetroMetric,
  type SectorJobsMetric,
} from "@/lib/live-rates";
import { monthOf } from "@/lib/zori";
import { heatShade } from "./heat-shade";

/**
 * The whole board, the other way round: every metro area × every sector's
 * payrolls against a year ago — all payrolls first, then the five sectors
 * that fill each kind of building — shaded WITHIN each column, fastest
 * first, so office-using jobs compare to office-using jobs and never to
 * retail's. The vacancy board above it says where the space is tight;
 * this says where the demand for each kind of it is growing, market by
 * market, on one screen.
 *
 * Pure: the page reads each metric across the metros (`liveMetricRates`,
 * six cached reads) and hands the rows in with the markets. Rows are the
 * metro areas that carry a series of their own; a suburb reads its metro
 * area's row and the note says so, rather than the same figure printed
 * three times under three names. A stale figure is shown with its date
 * and left out of the shading (a dead series is worth seeing, not worth
 * ranking); a metro with no series for a sector is a dash, never a zero;
 * and nothing renders until a pull has written a fresh row.
 *
 * The metro areas the site reads without a brief (#403) are rows too,
 * in their own block after the briefed markets and ranked in the same
 * columns — Phoenix's office-using jobs against Washington's is the
 * comparison the board exists for — with the name unlinked, because there
 * is no market page behind it, and the note saying what the block is.
 */
export interface BoardMarket {
  id: string;
  name: string;
  region?: string;
  /** False for a metro area the site reads without a brief (data/data-metros.json):
   *  the same series and the same shading, no market page to link to. */
  briefed?: boolean;
}

export const BOARD_METRICS: readonly MetroMetric[] = ["jobs_yoy", ...SECTOR_JOBS_METRICS];

/** The sector page a column links to, where one exists. */
const COLUMN_PAGE: Partial<Record<MetroMetric, string>> = {
  jobs_yoy: "multifamily",
  jobs_pbs_yoy: "office",
  jobs_transport_yoy: "industrial",
  jobs_retail_yoy: "retail",
};

function columnLabel(metric: MetroMetric): string {
  return metric === "jobs_yoy" ? "All payrolls" : SECTOR_JOBS_LABEL[metric as SectorJobsMetric];
}

export function SectorJobsBoard({
  markets,
  rates,
}: {
  /** the covered markets, in the page's order, with their regions */
  markets: readonly BoardMarket[];
  /** `liveMetricRates(metric)` for each board metric */
  rates: Readonly<Partial<Record<MetroMetric, readonly LiveRate[]>>>;
}) {
  // The metro areas with a series of their own — a suburb reads its MSA's row.
  const rows = markets.filter((m) => metroSeriesFor(m.id).series.some((s) => s.metro === m.id && BOARD_METRICS.includes(s.metric)));
  const cell = (marketId: string, metric: MetroMetric): LiveRate | null => {
    const meta = metroSeriesFor(marketId).series.find((s) => s.metric === metric && s.metro === marketId);
    if (!meta) return null;
    return (rates[metric] ?? []).find((r) => r.meta.id === meta.id) ?? null;
  };
  // Rank within each column over the fresh figures only.
  const rank = new Map<string, number>();
  for (const metric of BOARD_METRICS) {
    const fresh = rows
      .map((m) => ({ id: m.id, r: cell(m.id, metric) }))
      .filter((x): x is { id: string; r: LiveRate } => x.r !== null && x.r.fresh && Number.isFinite(x.r.value))
      .sort((a, b) => b.r.value - a.r.value);
    fresh.forEach((x, i) => rank.set(`${metric}|${x.id}`, fresh.length > 1 ? i / (fresh.length - 1) : 0));
  }
  if (rank.size === 0) return null;
  const regions: string[] = [];
  for (const m of rows) {
    const r = m.region ?? "More markets";
    if (!regions.includes(r)) regions.push(r);
  }
  const newest = Array.from(rank.keys())
    .map((k) => {
      const [metric, id] = k.split("|");
      return cell(id, metric as MetroMetric)?.obsDate ?? "";
    })
    .sort()
    .at(-1);
  const total = rows.length * BOARD_METRICS.length;
  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5" data-qa="sector-jobs-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">The whole board — payroll growth by market and sector</h2>
        <span className="text-[11px] text-muted">
          {`${rank.size} of ${total} cells carry a fresh figure · shaded within each column, fastest first, so office-using jobs compare to office-using jobs`}
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3 font-medium">Market</th>
              {BOARD_METRICS.map((metric) => {
                const page = COLUMN_PAGE[metric];
                const label = columnLabel(metric);
                return (
                  <th key={metric} className="py-1.5 pr-2 text-center font-medium" title={`${label}, against the same month a year earlier`}>
                    {page ? (
                      <Link href={`/market?sector=${page}`} prefetch={false} className="transition-colors hover:text-brand">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {regions.map((region) => (
              <Fragment key={region}>
                <tr>
                  <td colSpan={BOARD_METRICS.length + 1} className="pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {region}
                  </td>
                </tr>
                {rows
                  .filter((m) => (m.region ?? "More markets") === region)
                  .map((m) => (
                    <tr key={m.id} className="border-b border-line/60">
                      <td className="py-1.5 pr-3">
                        {m.briefed === false ? (
                          <span
                            className="text-xs font-medium text-ink"
                            title="Read without a brief — the same published series, no market page, comps pull or tracker behind it"
                          >
                            {m.name}
                          </span>
                        ) : (
                          <Link
                            href={`/market?metro=${m.id}`}
                            prefetch={false}
                            className="text-xs font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
                          >
                            {m.name}
                          </Link>
                        )}
                      </td>
                      {BOARD_METRICS.map((metric) => {
                        const r = cell(m.id, metric);
                        const t = rank.get(`${metric}|${m.id}`);
                        if (r && t !== undefined) {
                          return (
                            <td key={metric} className="px-1 py-1">
                              <div
                                className="rounded-md px-1.5 py-1 text-center font-mono text-xs tabular-nums text-ink"
                                style={{ backgroundColor: heatShade(t) }}
                                title={`${r.meta.label} — ${monthOf(r.obsDate)}; shaded by rank within this column, fastest first`}
                              >
                                {formatValue(r)}
                              </div>
                            </td>
                          );
                        }
                        if (r) {
                          // Stale: the figure and its date, unshaded — seen, not ranked.
                          return (
                            <td key={metric} className="px-1 py-1">
                              <div
                                className="rounded-md border border-dashed border-amber-500/60 px-1.5 py-1 text-center font-mono text-[11px] tabular-nums text-muted"
                                title={`${r.meta.label} — not updating: the newest figure is for ${shortDate(r.obsDate)}`}
                              >
                                {`${formatValue(r)} · ${shortDate(r.obsDate)}`}
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={metric} className="px-1 py-1">
                            <div
                              className="rounded-md border border-dashed border-line/70 px-1.5 py-1 text-center text-[11px] text-muted"
                              title="No series on FRED for this market and sector — a recorded gap, never estimated."
                            >
                              —
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        {`BLS payrolls for each metro area by supersector, each against the same month a year earlier${newest ? `, newest ${monthOf(newest)}` : ""}, via FRED, pulled every weekday; a suburb reads its metro area's row. A dashed figure with a date is a series that stopped updating, shown rather than ranked; a dash is a series FRED does not carry. Each column is the sector that fills a kind of building — offices, warehouses, stores, hotels, clinics — and all payrolls is what rental housing runs on.`}
        {rows.some((m) => m.briefed === false)
          ? " The last block is the metro areas the site reads without a brief: the same series, ranked in the same columns, with no research brief, comps pull or tracker behind them and no market page to open."
          : ""}
      </p>
    </section>
  );
}
