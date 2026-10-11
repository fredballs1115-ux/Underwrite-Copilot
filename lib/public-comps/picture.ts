// What a recorded-sales pull looks like as pictures (the comps page and the
// deal page's panel): each sale on one price track, the sales by quarter
// across the search's window, and the tab-delimited table a "Copy" puts on
// the clipboard. Pure — no I/O, no React — so every position is tested.
//
// Three rules, each the comps readout's own:
//   - the middle is drawn only where it is one (MEDIAN_FLOOR): a single
//     sale gets no median tick, as it gets no "median" in the words;
//   - the subject is drawn only inside the band the readout compares it in
//     (a quarter to four times the middle), so a $68M asset never sits at
//     the end of a track of rowhouses;
//   - a track spanning more than SPREAD_FOR_LOG times its low end is drawn
//     on a log scale and says so, since a linear one would crush every sale
//     but the largest into its first tenth.

import { compactUsd } from "@/lib/money";
import { compEvidence, type RecordComp, type RecordCompsResult } from "./core";

/** The readout's own band for comparing the subject with the middle. */
export const SUBJECT_BAND: Readonly<{ low: number; high: number }> = { low: 0.25, high: 4 };

/** Past this ratio of the highest price to the lowest, the track is drawn
 *  on a log scale. */
export const SPREAD_FOR_LOG = 4;

const usd = (n: number) => compactUsd(n, { millions: 2, thousandsFrom: Infinity });

export interface PriceDot {
  /** the sale's pin number: its place in the nearest-first list, from 1 */
  n: number;
  price: number;
  /** 0–100 along the track */
  pct: number;
}

export interface PriceTrack {
  dots: PriceDot[];
  /** where the middle sits, or null below the floor */
  medianPct: number | null;
  /** where the subject's price sits, or null outside the band or unknown */
  subjectPct: number | null;
  log: boolean;
  lowLabel: string;
  highLabel: string;
}

/** Each sale on one track from the lowest price to the highest. Null with
 *  fewer than two priced sales, where a track has no length. */
export function priceTrack(
  comps: Pick<RecordComp, "price">[],
  medianPrice: number | null,
  subjectPrice: number | null,
): PriceTrack | null {
  const priced = comps
    .map((c, i) => ({ n: i + 1, price: c.price }))
    .filter((d) => Number.isFinite(d.price) && d.price > 0);
  if (priced.length < 2) return null;
  const low = Math.min(...priced.map((d) => d.price));
  const high = Math.max(...priced.map((d) => d.price));
  if (!(high > low)) return null;
  const log = high / low > SPREAD_FOR_LOG;
  const at = (v: number) => {
    const t = log ? Math.log(v / low) / Math.log(high / low) : (v - low) / (high - low);
    return Math.round(Math.min(1, Math.max(0, t)) * 1000) / 10;
  };
  const middleDrawn = medianPrice !== null && medianPrice > 0 && compEvidence(priced.length) !== "individual";
  const ratio = subjectPrice && medianPrice ? subjectPrice / medianPrice : null;
  const subjectIn =
    subjectPrice !== null &&
    ratio !== null &&
    ratio >= SUBJECT_BAND.low &&
    ratio <= SUBJECT_BAND.high &&
    subjectPrice >= low &&
    subjectPrice <= high;
  return {
    dots: priced.map((d) => ({ ...d, pct: at(d.price) })),
    medianPct: middleDrawn ? at(medianPrice as number) : null,
    subjectPct: subjectIn ? at(subjectPrice as number) : null,
    log,
    lowLabel: usd(low),
    highLabel: usd(high),
  };
}

export interface QuarterBar {
  /** "Q3 2026" */
  label: string;
  count: number;
}

const quarterOf = (iso: string): { y: number; q: number } | null => {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { y: Number(m[1]), q: Math.floor((month - 1) / 3) + 1 };
};

/**
 * The sales by calendar quarter, from the quarter of the earliest sale to
 * the quarter of the latest — empty quarters in between kept as zeros, since
 * a gap is part of the picture. The window is the sales' own: a search's
 * months back reach further than its first sale only where no sale fell
 * there, which a bar of zero would say no better than the axis does.
 * Empty below two dated sales.
 */
export function salesByQuarter(
  comps: Pick<RecordComp, "saleDate">[],
  /** the day the evidence runs through — the search's day, or the property
   *  database's last ingest where that is earlier (`evidenceThrough`) — and
   *  the window's months: the bars run from the window's first quarter to
   *  that day's, so quarters after the last sale read as none sold rather
   *  than falling off the axis, and quarters after the day are never drawn
   *  as a freeze. Without it, the sales' own span, as before. */
  window?: { through: string; monthsBack: number | null } | null,
): QuarterBar[] {
  const qs = comps.map((c) => quarterOf(c.saleDate)).filter((q): q is { y: number; q: number } => q !== null);
  if (qs.length < 2) return [];
  const key = (q: { y: number; q: number }) => q.y * 4 + (q.q - 1);
  let first = Math.min(...qs.map(key));
  let last = Math.max(...qs.map(key));
  const end = window ? quarterOf(window.through) : null;
  if (end) {
    last = Math.max(last, key(end));
    if (window?.monthsBack) {
      const d = new Date(`${window.through.slice(0, 10)}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - window.monthsBack);
      const start = quarterOf(d.toISOString());
      if (start) first = Math.min(first, key(start));
    }
  }
  // A malformed year far from the rest would draw hundreds of empty bars;
  // past five years of quarters the picture is no longer the window's.
  if (last - first > 20) return [];
  const counts = new Map<number, number>();
  for (const q of qs) counts.set(key(q), (counts.get(key(q)) ?? 0) + 1);
  const out: QuarterBar[] = [];
  for (let k = first; k <= last; k++) {
    out.push({ label: `Q${(k % 4) + 1} ${Math.floor(k / 4)}`, count: counts.get(k) ?? 0 });
  }
  return out;
}

/**
 * The day a result's evidence runs through: the search's own day, or the
 * property database's last ingest where that is earlier — a database's
 * sales are only as fresh as the run that wrote them. ISO yyyy-mm-dd.
 */
export function evidenceThrough(r: Pick<RecordCompsResult, "retrievedAt" | "ingestedThrough">): string {
  const pulled = (r.retrievedAt ?? "").slice(0, 10);
  const ingested = (r.ingestedThrough ?? "").slice(0, 10);
  return ingested && (!pulled || ingested < pulled) ? ingested : pulled;
}

/** A sale's price a square foot, where the record states an area a sale of
 *  a building could have (over 200 SF, the stats' own floor), else null. */
export function perSqftOf(c: Pick<RecordComp, "price" | "sqft">): number | null {
  return c.sqft && c.sqft > 200 ? Math.round(c.price / c.sqft) : null;
}

/** A sale's price a unit, where the record states more than one unit,
 *  else null: a one-unit record's price is its whole price already. */
export function perUnitOf(c: Pick<RecordComp, "price" | "units">): number | null {
  return c.units != null && c.units > 1 ? Math.round(c.price / c.units) : null;
}

/**
 * For each sale, how many rows share its exact day, buyer and price — two or
 * more is a deed that may have been recorded once a parcel, each row at the
 * deed's whole price — or 0. Exact grouping only: a buyer the record leaves
 * blank groups with nothing, and nothing is merged or dropped; the rows are
 * flagged, never deduplicated. Display only: it says nothing of whether a
 * sale was at arm's length.
 */
export function sharedDeedCounts(comps: Pick<RecordComp, "saleDate" | "buyer" | "price">[]): number[] {
  const key = (c: Pick<RecordComp, "saleDate" | "buyer" | "price">) =>
    c.buyer && c.buyer.trim() && c.saleDate ? `${c.saleDate}|${c.buyer.trim().toUpperCase()}|${c.price}` : null;
  const counts = new Map<string, number>();
  for (const c of comps) {
    const k = key(c);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return comps.map((c) => {
    const k = key(c);
    const n = k ? (counts.get(k) ?? 0) : 0;
    return n >= 2 ? n : 0;
  });
}

/** Tabs and line breaks out of a cell, so a pasted row stays one row. */
const cell = (v: string) => v.replace(/[\t\r\n]+/g, " ").trim();

/**
 * The sales as a spreadsheet takes them: a header, then one row a sale,
 * tab-delimited, the numbers raw (a price, a distance in miles to two
 * places) so they paste as numbers, never "$1.2M".
 */
export function compsTableText(r: Pick<RecordCompsResult, "comps">): string {
  const head = ["#", "Sold", "Address", "Price", "$/SF", "Units", "$/unit", "Type", "Buyer", "Seller", "Deed type", "Miles", "Source"].join("\t");
  const rows = r.comps.map((c, i) =>
    [
      String(i + 1),
      cell(c.saleDate),
      cell(c.address),
      String(Math.round(c.price)),
      String(perSqftOf(c) ?? ""),
      String(c.units ?? ""),
      String(perUnitOf(c) ?? ""),
      cell(c.propertyType),
      cell(c.buyer ?? ""),
      cell(c.seller ?? ""),
      cell(c.deedType ?? ""),
      (c.distanceKm / 1.609344).toFixed(2),
      cell(c.sourceUrl),
    ].join("\t"),
  );
  return [head, ...rows].join("\n");
}
