// What a recorded-sales pull looks like as pictures (the comps page and the
// deal page's panel): each sale on one price track, the sales by quarter
// across the search's window, and the tab-delimited table a "Copy" puts on
// the clipboard (and the CSV file "Download CSV" writes). Pure — no I/O, no React — so every position is tested.
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
import { csvNumber, csvText } from "@/lib/csv-cell";
import { MAX_COMPS } from "@/lib/tools/comp-grid";
import { compEvidence, MEDIAN_FLOOR, sharedDeedCounts, type RecordComp, type RecordCompsResult } from "./core";

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
 *  fewer than two priced sales, where a track has no length. The middle is
 *  drawn on the readout's own count (`salesCount`, compStats' — a deed
 *  recorded once a parcel counted once), never on the rows drawn. */
export function priceTrack(
  comps: Pick<RecordComp, "price">[],
  medianPrice: number | null,
  subjectPrice: number | null,
  salesCount?: number,
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
  const middleDrawn = medianPrice !== null && medianPrice > 0 && compEvidence(salesCount ?? priced.length) !== "individual";
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

/** Rows of one day, buyer and price — core's, re-exported for the pictures. */
export { sharedDeedCounts };

/** Whole months from a sale's day to the search's, never below zero. */
function monthsBetween(fromIso: string, toIso: string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(fromIso);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(toIso);
  if (!a || !b) return null;
  const m = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2])) - (Number(b[3]) < Number(a[3]) ? 1 : 0);
  return Math.max(0, m);
}

/**
 * The sales that state an area, as /tools' comp grid takes them through its
 * own link (app/tools: `cgr` the rows — name, price, size, months ago, then
 * the grid's three adjustments — `cgs` the subject's size, `cga` the ask,
 * `cgg` the market growth, `cgu` what a unit is called): each sale's
 * address, its price, its square feet and the months from its sale to the
 * search's day, every adjustment at 0 and the growth that times them at 0,
 * so the grid starts from the record and the judgement is the reader's.
 * The subject's size and ask are left blank: the search has neither. The
 * nearest MAX_COMPS of them, the most the card adjusts (it refuses more as
 * "a paste rather than a grid"). Null where fewer than MEDIAN_FLOOR sales
 * state an area — under three is not a grid.
 */
export function compGridHref(r: Pick<RecordCompsResult, "comps" | "retrievedAt">): string | null {
  const day = (r.retrievedAt ?? "").slice(0, 10);
  const rows = r.comps
    .filter((c) => perSqftOf(c) !== null)
    .map((c) => {
      const months = monthsBetween(c.saleDate, day);
      return months === null
        ? null
        : [cell(c.address), String(Math.round(c.price)), String(Math.round(c.sqft as number)), String(months), "0", "0", "0"].join("\t");
    })
    .filter((row): row is string => row !== null)
    .slice(0, MAX_COMPS);
  if (rows.length < MEDIAN_FLOOR) return null;
  const q = new URLSearchParams({ cgr: rows.join("\n"), cgs: "", cga: "", cgg: "0", cgu: "SF" });
  return `/tools?${q.toString()}#comp-grid`;
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

/** The provenance and the sales a "Download CSV" writes. */
export type CompsCsvSource = Pick<RecordCompsResult, "comps" | "providerName" | "datasetUrl" | "retrievedAt" | "subject">;

/** A UTC day, yyyy-mm-dd, off a stored timestamp, or "" where it is none. */
const isoDay = (iso: string | null | undefined): string => {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(iso ?? "");
  return m ? m[0] : "";
};

/**
 * The recorded sales as a CSV file (the "Download CSV" beside "Copy as
 * table"): a header row, then one row a sale in the order given — the list's
 * current order, as indexes into the nearest-first list (`salesOrder`), each
 * row keeping its pin number — and nothing else, since a CSV is a table and a
 * note above or below it is a row a spreadsheet reads as data. The table's
 * columns, then the record's link, a flag on a row that may be one deed
 * across parcels (`sharedDeedCounts`: how many rows share its day, buyer and
 * price; blank where none does), and the dataset with the day it was
 * retrieved (its UTC day, the header says so), on every row so a filtered or
 * pasted row keeps its source. The numbers are raw (no $, no commas: a
 * price, a distance in miles to two places) and every text cell goes
 * through lib/csv-cell's escaper, the pipeline CSV's own, so a deed's buyer
 * that opens on "=" never runs.
 */
export function compsCsv(r: CompsCsvSource, order: ReadonlyArray<number> = r.comps.map((_, i) => i)): string {
  const head = [
    "#",
    "Sold",
    "Address",
    "Price",
    "$/SF",
    "Units",
    "$/unit",
    "Type",
    "Buyer",
    "Seller",
    "Deed type",
    "Miles",
    "Record",
    "Possibly one deed across parcels (rows sharing its day, buyer and price)",
    "Dataset",
    "Dataset URL",
    "Retrieved (UTC)",
  ];
  const shared = sharedDeedCounts(r.comps);
  const retrieved = isoDay(r.retrievedAt);
  const rows = order
    .filter((at) => Number.isInteger(at) && at >= 0 && at < r.comps.length)
    .map((at) => {
      const c = r.comps[at];
      return [
        csvNumber(at + 1),
        csvText(c.saleDate ?? ""),
        csvText(c.address ?? ""),
        csvNumber(Math.round(c.price)),
        csvNumber(perSqftOf(c)),
        csvNumber(c.units),
        csvNumber(perUnitOf(c)),
        csvText(c.propertyType ?? ""),
        csvText(c.buyer ?? ""),
        csvText(c.seller ?? ""),
        csvText(c.deedType ?? ""),
        csvNumber(Number((c.distanceKm / 1.609344).toFixed(2))),
        csvText(c.sourceUrl ?? ""),
        csvNumber(shared[at] >= 2 ? shared[at] : null),
        csvText(r.providerName ?? ""),
        csvText(r.datasetUrl ?? ""),
        csvText(retrieved),
      ].join(",");
    });
  return [head.map(csvText).join(","), ...rows].join("\n");
}

/** The address as a file name's words: lowercase letters and digits, a
 *  hyphen between, accents dropped, at most 60 characters; "address" where
 *  nothing is left. */
export function addressSlug(label: string | null | undefined): string {
  const slug = (label ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "address";
}

/** The download's name: the address searched and the UTC day the sales were
 *  retrieved — "recorded-sales-1500-walnut-st-philadelphia-pa-2026-10-08.csv". */
export function compsCsvFileName(r: Pick<RecordCompsResult, "subject" | "retrievedAt">): string {
  const day = isoDay(r.retrievedAt);
  return `recorded-sales-${addressSlug(r.subject?.label)}${day ? `-${day}` : ""}.csv`;
}

/** The orders the sales table offers. Nearest first is the search's own
 *  order (and each sale's pin number); the others run the way an analyst
 *  reads them: the most recent, the dearest, the dearest a square foot. */
export type SalesSort = "nearest" | "newest" | "price" | "perSf";

export const SALES_SORTS: ReadonlyArray<{ key: SalesSort; label: string }> = [
  { key: "nearest", label: "Nearest" },
  { key: "newest", label: "Newest" },
  { key: "price", label: "Price" },
  { key: "perSf", label: "$/SF" },
];

/** The /comps page's query parameter that keeps the order the reader chose,
 *  so a reload or a shared link opens on it (nearest first is the bare
 *  link). The deal page's panel keeps no order in its address. */
export const SALES_SORT_PARAM = "sort";

/** Whether "$/SF" is an order the list offers: two sales or more state an
 *  area. Under that there is nothing to rank by the foot. */
export function perSfSortOffered(comps: ReadonlyArray<Pick<RecordComp, "price" | "sqft">>): boolean {
  return comps.filter((c) => perSqftOf(c) !== null).length >= 2;
}

/**
 * The order a link asks for, held to the orders offered: one of the
 * SALES_SORTS keys, exactly, else nearest first — a value anyone edited in
 * the address is never a fifth order, and "$/SF" stands only where it is
 * offered (`perSfSortOffered`). A repeated parameter reads its first.
 */
export function readSalesSort(
  raw: string | ReadonlyArray<string> | null | undefined,
  perSfOffered: boolean,
): SalesSort {
  const value = (Array.isArray(raw) ? raw[0] : raw) as string | null | undefined;
  const hit = SALES_SORTS.find((s) => s.key === value?.trim())?.key ?? "nearest";
  return hit === "perSf" && !perSfOffered ? "nearest" : hit;
}

/**
 * The sales' places in the order asked, as indexes into the nearest-first
 * list (so each row keeps its pin number). Ties keep the nearest first. On
 * $/SF a sale stating no area sorts last, nearest first among them — it is
 * listed, never dropped. A day that does not parse sorts last on "newest".
 */
export function salesOrder(
  comps: ReadonlyArray<Pick<RecordComp, "saleDate" | "price" | "sqft">>,
  by: SalesSort,
): number[] {
  const idx = comps.map((_, i) => i);
  if (by === "nearest") return idx;
  const key = (i: number): number | null => {
    const c = comps[i];
    if (by === "price") return Number.isFinite(c.price) ? c.price : null;
    if (by === "perSf") return perSqftOf(c);
    const t = Date.parse(`${(c.saleDate ?? "").slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(t) ? t : null;
  };
  return idx.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return a - b;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return kb - ka || a - b;
  });
}

/** The table's heading for an order: "The 12 nearest" where the rest fold
 *  behind "Show all", else "The sales, nearest first". */
export function salesHeading(by: SalesSort, total: number, shown: number): string {
  if (total > shown) {
    return {
      nearest: `The ${shown} nearest`,
      newest: `The ${shown} most recent`,
      price: `The ${shown} highest-priced`,
      perSf: `The ${shown} highest a square foot`,
    }[by];
  }
  return {
    nearest: "The sales, nearest first",
    newest: "The sales, most recent first",
    price: "The sales, highest price first",
    perSf: "The sales, highest a square foot first",
  }[by];
}

export interface PerSfBars {
  /** each sale's $/SF as a share of the widest (0–1), null where it states
   *  no area — indexed as the nearest-first list */
  shares: (number | null)[];
  /** the widest $/SF in the set, the bars' scale */
  max: number;
  /** the $/SF median's place on the scale, only where the readout names a
   *  median (MEDIAN_FLOOR sales stating an area), else null */
  medianShare: number | null;
  /** how many sales state an area: the bars drawn */
  drawn: number;
  /** sales that state an area but draw no bar: rows sharing a day, buyer
   *  and price (`sharedDeedCounts`), possibly one deed across parcels */
  leftOut: number;
}

/**
 * Each sale's price a square foot as a bar from zero on one scale (the
 * widest in the set), so the spread reads without a column of figures —
 * and the $/SF median as a tick, only where the readout names one (the
 * same floor as `perSqftPhrase`). Null under two sales stating an area:
 * one bar is scaled to nothing but itself.
 *
 * A row `sharedDeedCounts` flags (`shared`, indexed as the list) may be one
 * deed recorded across parcels at the deed's whole price, so its price a
 * foot may be the deed's over one parcel's area: it sets no scale and draws
 * no bar (`leftOut`). Its figure stays in the list with its flag.
 */
export function perSfBars(
  comps: ReadonlyArray<Pick<RecordComp, "price" | "sqft">>,
  medianPerSqft: number | null,
  shared: readonly number[] = [],
): PerSfBars | null {
  const stated = comps.map((c) => perSqftOf(c));
  const values = stated.map((v, i) => ((shared[i] ?? 0) >= 2 ? null : v));
  const leftOut = stated.filter((v, i) => v !== null && values[i] === null).length;
  const drawn = values.filter((v) => v !== null).length;
  if (drawn < 2) return null;
  const max = Math.max(...values.map((v) => v ?? 0));
  if (!(max > 0)) return null;
  const ev = compEvidence(drawn);
  const middle = medianPerSqft !== null && medianPerSqft > 0 && ev !== "individual" && ev !== "none";
  return {
    shares: values.map((v) => (v === null ? null : Math.min(1, v / max))),
    max,
    medianShare: middle ? Math.min(1, (medianPerSqft as number) / max) : null,
    drawn,
    leftOut,
  };
}
