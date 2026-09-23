import { formatValue, seriesUrl, type LiveRate, type MetroSeriesMeta } from "@/lib/live-rates";
import { sectorJobsFor } from "@/lib/live-market-brief";
import { monthOf } from "@/lib/zori";

/**
 * The metro's own payrolls in the sector that fills this kind of building,
 * under a commercial sector's fundamentals on the market brief — the same
 * map the market check reads a deal's sector by (`sectorJobsFor`), so the
 * office panel carries professional and business services, the industrial
 * panel transportation and warehousing, the retail panel retail trade, and
 * the apartment panel nothing here, since all payrolls are on the tiles
 * above. The figure is the metro area's (a suburb's panel wears the MSA's
 * name, as its tiles do) and links to its series. Pure: the page hands in
 * the metro's cached rows. Nothing renders for a sector the table has no
 * series for, or a stale one — a figure is fresh or it is not said here.
 */
export function SectorJobsLine({
  rates,
  sector,
}: {
  /** the metro's own rows (`liveMetroRates`) */
  rates: readonly LiveRate[];
  /** the panel's sector key — "office", "industrial", "retail", "multifamily" */
  sector: string;
}) {
  const s = sectorJobsFor(sector);
  if (!s) return null;
  const r = rates.find(
    (x) => (x.meta as MetroSeriesMeta).metric === s.metric && x.fresh && Number.isFinite(x.value),
  );
  if (!r) return null;
  const meta = r.meta as MetroSeriesMeta;
  // Each phrase one string, so the served HTML carries no separator inside it.
  return (
    <p className="mt-1 text-[11px] leading-relaxed text-muted" data-qa="sector-jobs-line">
      {`Payrolls in ${s.sector}, ${meta.area} (${s.fills}): `}
      <span className="font-mono tabular-nums text-ink">{formatValue(r)}</span>
      {` on a year ago, ${monthOf(r.obsDate)} · `}
      <a
        href={seriesUrl(r.meta.id)}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        FRED
      </a>
    </p>
  );
}
