import Link from "next/link";
import {
  SECTOR_JOBS_LABEL,
  formatValue,
  isSectorJobsMetric,
  metroSeriesFor,
  seriesUrl,
  type LiveRate,
  type MetroMetric,
  type MetroSeriesMeta,
} from "@/lib/live-rates";
import { monthOf } from "@/lib/zori";

/**
 * Where a sector's jobs are growing: the covered markets ranked by their
 * payrolls in the sector that fills this kind of building (all payrolls on
 * the apartment page), against a year ago — one picture under the sector
 * leaderboard, which ranks the same markets by vacancy. The two rankings
 * are different questions and both are named: the leaderboard says where
 * the space is tight, this says where the demand for it is growing.
 *
 * Pure: the page reads one metric across the metros (`liveMetricRates`)
 * and hands the rows in with the leaderboard's own markets. A suburb has
 * no series of its own and reads its MSA's (`metroSeriesFor`), so the row
 * says whose figure it is; two suburbs of one MSA therefore share a bar,
 * which is the truth rather than a duplicate. A market with no fresh
 * figure is listed last, unranked, with the reason, never dropped — and
 * nothing renders at all until the pull has written a row.
 */
export interface RankMarket {
  id: string;
  name: string;
}

export function SectorJobsRank({
  metric,
  markets,
  rates,
}: {
  metric: MetroMetric;
  /** the leaderboard's markets, in any order */
  markets: readonly RankMarket[];
  /** `liveMetricRates(metric)` — every metro's own series for the metric */
  rates: readonly LiveRate[];
}) {
  const byId = new Map(rates.map((r) => [r.meta.id, r]));
  const rows = markets.map((m) => {
    const meta = metroSeriesFor(m.id).series.find((s) => s.metric === metric) ?? null;
    const r = meta ? (byId.get(meta.id) ?? null) : null;
    return { market: m, meta, r, borrowed: meta !== null && meta.metro !== m.id };
  });
  const ranked = rows
    .filter((x): x is typeof x & { r: LiveRate } => x.r !== null && x.r.fresh && Number.isFinite(x.r.value))
    .sort((a, b) => b.r.value - a.r.value);
  if (ranked.length === 0) return null;
  const unranked = rows.filter((x) => !ranked.includes(x as (typeof ranked)[number]));
  const widest = Math.max(0.1, ...ranked.map((x) => Math.abs(x.r.value)));
  const newest = ranked.map((x) => x.r.obsDate).sort().at(-1) ?? ranked[0].r.obsDate;
  const what = isSectorJobsMetric(metric) ? SECTOR_JOBS_LABEL[metric] : "All payrolls";
  const heading = isSectorJobsMetric(metric)
    ? `Where ${what.toLowerCase()} jobs are growing`
    : "Where payrolls are growing";
  return (
    <div className="mt-4" data-qa="sector-jobs-rank">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{heading}</h3>
        <span className="text-[11px] text-muted">
          {`${what}, on a year ago · ranked fastest first · ${monthOf(newest)} · BLS payrolls via FRED`}
        </span>
      </div>
      <div className="mt-2 max-w-xl space-y-1">
        {ranked.map((x, i) => (
          <div key={x.market.id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted">{i + 1}</span>
            <span className="w-36 shrink-0 truncate text-[11px] sm:w-48">
              <Link
                href={`/market?metro=${x.market.id}`}
                prefetch={false}
                className="font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                {x.market.name}
              </Link>
              {x.borrowed && x.meta && (
                <span className="text-muted" title={`${x.market.name} has no series of its own; the figure is the metro area's`}>
                  {` · ${x.meta.area}`}
                </span>
              )}
            </span>
            <div className="relative h-3 flex-1 rounded-sm bg-faint" aria-hidden="true">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div
                data-bar="sectorrank"
                className={`absolute inset-y-0 ${x.r.value >= 0 ? "left-1/2 bg-brand" : "right-1/2 bg-brand"}`}
                style={{ width: `${(Math.abs(x.r.value) / widest) * 50}%` }}
              />
            </div>
            <a
              href={seriesUrl(x.r.meta.id)}
              target="_blank"
              rel="noreferrer"
              className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink underline decoration-dotted underline-offset-2 hover:text-brand"
              title={x.r.meta.label}
            >
              {formatValue(x.r)}
            </a>
          </div>
        ))}
      </div>
      {unranked.length > 0 && (
        <p className="mt-1.5 text-[11px] text-muted">
          {`Not ranked — ${unranked
            .map((x) => `${x.market.name} (${x.meta === null ? "no series on FRED" : x.r === null ? "no row yet" : "stale figure"})`)
            .join(", ")}.`}
        </p>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        {isSectorJobsMetric(metric)
          ? `The payroll count in the sector that fills this kind of building, each metro area's own (a suburb reads its metro area's, named), against the same month a year earlier. The table above ranks the same markets by how tight the space is; this ranks them by whether the demand for it is growing, and the two need not agree.`
          : `All payrolls, each metro area's own (a suburb reads its metro area's, named), against the same month a year earlier — the demand side a rental market runs on. The table above ranks by how tight the market is; this ranks by whether it is growing, and the two need not agree.`}
      </p>
    </div>
  );
}

/** The metro series meta a market's row would read for a metric, for tests and the page. */
export function marketSeriesFor(marketId: string, metric: MetroMetric): MetroSeriesMeta | null {
  return metroSeriesFor(marketId).series.find((s) => s.metric === metric) ?? null;
}
