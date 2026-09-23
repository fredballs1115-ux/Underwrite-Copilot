import { assetWords, type AssetWords } from "@/lib/asset-words";
import { sectorJobsFor, type SectorJobs } from "@/lib/live-market-brief";
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
 *
 * It takes the deal's CLASS, not a sector, and writes the sentence under
 * the heading itself (`intro`), because the sentence is the class's:
 * rental housing runs on all payrolls; a class that reads no sector —
 * storage, land, a net lease, parking, a data centre — says so rather
 * than being called rental housing; a sector the metro has no row for is
 * named as missing; a kind nothing has read yet is said to be unread.
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
  /** the label of the building's own sector, or null where nothing is singled out */
  mine: string | null;
  /** the one sentence under the heading: what is drawn full, or why nothing is */
  intro: string;
}

function introFor(mine: string | null, sector: SectorJobs | null, words: AssetWords): string {
  if (mine) {
    return `${mine} is the sector that fills this building's kind, drawn full; the metro area's other sectors are beside it, faded, and all payrolls first.`;
  }
  if (sector) {
    return `The metro area has no figure for ${sector.sector}, ${sector.fills}, so nothing is drawn full: all payrolls first, then the sectors it does have.`;
  }
  if (words.residential) {
    return "Rental housing runs on all payrolls, drawn first; the sectors beneath say where the metro area's jobs are growing.";
  }
  if (words.label) {
    return `${words.label} reads no single sector — a sector picked for it would be a guess wearing a figure — so all payrolls are drawn first; the sectors beneath say where the metro area's jobs are growing.`;
  }
  return "No sector is singled out until the deal's kind is read; all payrolls are drawn first, and the sectors beneath say where the metro area's jobs are growing.";
}

export function metroDemand(rates: readonly LiveRate[], assetClass: string | null | undefined): MetroDemand | null {
  const sectors = rates.filter((r) => isSectorJobsMetric((r.meta as MetroSeriesMeta).metric));
  if (sectors.length === 0) return null;
  const sector = sectorJobsFor(assetClass);
  const words = assetWords(assetClass);
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
      return row(r, SECTOR_JOBS_LABEL[metric], false, sector !== null && metric === sector.metric);
    }),
  ];
  const newest = sectors.map((r) => r.obsDate).sort().at(-1) ?? sectors[0].obsDate;
  const stale = sectors
    .filter((r) => !r.fresh)
    .map((r) => `${SECTOR_JOBS_LABEL[(r.meta as MetroSeriesMeta).metric as SectorJobsMetric]} as of ${shortDate(r.obsDate)}`);
  const mine = rows.find((x) => x.mine)?.label ?? null;
  return {
    area: (sectors[0].meta as MetroSeriesMeta).area,
    newestMonth: monthOf(newest),
    rows,
    stale,
    mine,
    intro: introFor(mine, sector, words),
  };
}
