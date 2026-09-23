import { rentIndexFor } from "@/lib/live-market-brief";
import { monthOf } from "@/lib/zori";
import { seriesUrl, type LiveRate } from "@/lib/live-rates";

/**
 * The rents each kind of commercial lessor charges, nationally — one line
 * under a sector's fundamentals on the market brief: the BLS producer price
 * index for the sector's kind of lessor (lib/live-market-brief's
 * `rentIndexFor`), against a year ago, dated, with a link to the series.
 * The research layer's asking rent above it is the metro's and dated by the
 * tracker; this is the nation's and monthly, and the line says which. A
 * sector with no lessor index gets no line (apartments have the metro's own
 * rents on this page; lodging sells nights), and a stale index none rather
 * than an old figure. Pure: the page hands the national table in.
 */
export function LessorRentLine({ national, sector }: { national: readonly LiveRate[]; sector: string }) {
  const idx = rentIndexFor(sector);
  if (!idx) return null;
  const r = national.find((x) => x.meta.id === idx.id && x.fresh && Number.isFinite(x.value));
  if (!r) return null;
  const signed = `${r.value > 0 ? "+" : r.value < 0 ? "-" : ""}${Math.abs(r.value).toFixed(1)}%`;
  return (
    <p className="mt-1 text-[11px] leading-relaxed text-muted" data-qa="lessor-rent-line">
      {`Rents lessors charge, national (BLS producer price index, ${idx.lessor}): `}
      <span className="font-mono tabular-nums text-ink">{signed}</span>
      {` on a year ago, ${monthOf(r.obsDate)} — the nation's lessors, not the metro's · `}
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
