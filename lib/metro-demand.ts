import {
  SECTOR_JOBS_LABEL,
  formatValue,
  isSectorJobsMetric,
  seriesUrl,
  shortDate,
  type LiveRate,
  type MetroSeriesMeta,
  type SectorJobsMetric,
} from "@/lib/live-rates";
import { monthOf } from "@/lib/zori";

/**
 * The demand side of a deal's market, as a picture's rows: the metro
 * area's payrolls by sector against a year ago (the rows the market brief
 * draws under its tiles), read today, with the sector that fills this
 * building's kind marked — so the deal page's market section can draw the
 * same bars the brief draws, and single out the one that matters here.
 *
 * Pure, and the result is plain data: the deal view is a client component,
 * and handing it the rows rather than the series keeps the series table
 * out of the browser bundle. Null outside the covered markets or before
 * the pull has written a sector row. Widths are left to the picture; the
 * rows carry the signed figure, its text, its link and whether it is
 * fresh, and a stale row is kept and named rather than dropped.
 */
export interface MetroDemandRow {
  key: string;
  label: string;
  /** the change against a year ago, in points */
  valuePct: number;
  /** "1.3%" / "−0.4%", the strip's own convention */
  text: string;
  href: string;
  obsDate: string;
  fresh: boolean;
  /** all payrolls, the figure the sectors are read beside */
  all: boolean;
  /** the sector that fills this building's kind */
  mine: boolean;
}

export interface MetroDemand {
  /** what FRED's title calls the area ("Washington MSA") */
  area: string;
  /** the newest sector month, "Aug 2026" */
  newestMonth: string;
  rows: MetroDemandRow[];
  /** the labels of the sectors whose figure has stopped updating, with the date */
  stale: string[];
  /** the label of the building's own sector, or null for rental housing */
  mine: string | null;
}

export function metroDemand(rates: readonly LiveRate[], sectorMetric: SectorJobsMetric | null): MetroDemand | null {
  const sectors = rates.filter((r) => isSectorJobsMetric((r.meta as MetroSeriesMeta).metric));
  if (sectors.length === 0) return null;
  const allJobs = rates.find((r) => (r.meta as MetroSeriesMeta).metric === "jobs_yoy") ?? null;
  const row = (r: LiveRate, label: string, all: boolean, mine: boolean): MetroDemandRow => ({
    key: r.meta.id,
    label,
    valuePct: r.value,
    text: formatValue(r),
    href: seriesUrl(r.meta.id),
    obsDate: r.obsDate,
    fresh: r.fresh,
    all,
    mine,
  });
  const rows: MetroDemandRow[] = [
    ...(allJobs ? [row(allJobs, "All payrolls", true, false)] : []),
    ...sectors.map((r) => {
      const metric = (r.meta as MetroSeriesMeta).metric as SectorJobsMetric;
      return row(r, SECTOR_JOBS_LABEL[metric], false, sectorMetric !== null && metric === sectorMetric);
    }),
  ];
  const newest = sectors.map((r) => r.obsDate).sort().at(-1) ?? sectors[0].obsDate;
  const stale = sectors
    .filter((r) => !r.fresh)
    .map((r) => `${SECTOR_JOBS_LABEL[(r.meta as MetroSeriesMeta).metric as SectorJobsMetric]} as of ${shortDate(r.obsDate)}`);
  const mineRow = rows.find((x) => x.mine) ?? null;
  return {
    area: (sectors[0].meta as MetroSeriesMeta).area,
    newestMonth: monthOf(newest),
    rows,
    stale,
    mine: mineRow?.label ?? null,
  };
}
