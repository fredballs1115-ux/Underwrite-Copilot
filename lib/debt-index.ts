import {
  rateSeeds,
  seedRate,
  treasuryForTerm,
  type LiveRate,
} from "@/lib/live-rates";

/**
 * The index a loan is quoted over, read off today's rates table — the half
 * of a screening rate that is a fact. Pure; the server read beside it
 * (`lib/debt-index-read.ts`) hands it the table.
 *
 * A screening model needs a rate before anyone has a quote, and the honest
 * way to make one is the way a lender does: the INDEX a loan document
 * names, plus a SPREAD. The index is public and dated — a Treasury tenor
 * for a fixed-rate permanent loan, SOFR for a floating construction or
 * bridge loan — and the rates cron writes it every weekday. The spread is
 * a judgment about the borrower, the building and the lender's appetite,
 * so it stays an assumption with a class default the analyst overwrites,
 * and the note names both halves with the index's date. Before this the
 * model's rate was 6.00% on every deal on every day, the debt sizer's
 * 6.50% and the construction panel's 8.00%: three numbers wearing decimal
 * points, none of them a fact about the day the deal was screened.
 *
 * WHICH TENOR: the one NEAREST the hold, the rule the prepayment card
 * already applies to a yield-maintenance clause (`treasuryForTerm`, the
 * shorter on a tie) — a five-year hold is financed with a five-year loan,
 * priced off the five-year Treasury. A BENCHMARK IS NOT A QUOTE: only a
 * series a loan document names may seed a field (`contractRate` in the
 * series table), and `seedRate` holds every candidate to that, to
 * freshness and to a plausible range, so a stale table seeds nothing and
 * every surface falls back to its old flat default with the old note. The
 * 30-year mortgage survey is never an index here for the same reason it
 * never seeds `/tools`: it is an owner-occupier rate.
 *
 * WHICH FLOATING INDEX: 30-day average SOFR, the index a floating-rate CRE
 * note names ("30-day Average SOFR plus 350"), and overnight SOFR only
 * where the average is not fresh. Term SOFR is CME's and is not on FRED.
 */
export type IndexKind = "treasury" | "sofr";

export interface DebtIndex {
  /** the series id — "DGS5", "SOFR30DAYAVG" */
  id: string;
  /** what the strip calls it — "5-yr", "30-day avg SOFR" */
  short: string;
  /** percent, as published */
  pct: number;
  /** the observation date, ISO */
  asOf: string;
  kind: IndexKind;
}

export interface DebtSeeds {
  /** the Treasury tenor nearest the hold — a fixed-rate permanent loan's index */
  permanent: DebtIndex | null;
  /** 30-day average SOFR (overnight SOFR where the average is not fresh) —
   *  a floating construction or bridge loan's index */
  floating: DebtIndex | null;
}

export const NO_DEBT_SEEDS: DebtSeeds = { permanent: null, floating: null };

/** The construction lender's spread over its floating index — a screening
 *  default (bank construction debt has priced at SOFR + 300 to 400 through
 *  the cycle), marked as an assumption wherever it is used. */
export const CONSTRUCTION_SPREAD_BPS = 350;

export function debtSeeds(rates: readonly LiveRate[], holdMonths: number): DebtSeeds {
  const seeds = rateSeeds(rates);
  const tenor = treasuryForTerm(seeds.curve, holdMonths);
  const permanent: DebtIndex | null = tenor
    ? { id: tenor.id, short: tenor.short, pct: tenor.pct, asOf: tenor.asOf, kind: "treasury" }
    : null;
  return { permanent, floating: floatingIndex(rates) };
}

function floatingIndex(rates: readonly LiveRate[]): DebtIndex | null {
  for (const id of ["SOFR30DAYAVG", "SOFR"]) {
    const pct = seedRate(rates, id);
    const r = rates.find((x) => x.meta.id === id);
    if (pct !== null && r) return { id, short: r.meta.short, pct, asOf: r.obsDate, kind: "sofr" };
  }
  return null;
}

/** Index plus spread, as a percent to two places — the figure a term sheet prints. */
export function allInPct(index: DebtIndex, spreadBps: number): number {
  return Math.round((index.pct + spreadBps / 100) * 100) / 100;
}

/** "Sep 17, 2026" — a model's note outlives the week the strip is drawn for,
 *  so unlike the strip it carries the year. */
export function datedLong(obsDate: string): string {
  const at = Date.parse(`${obsDate}T00:00:00Z`);
  if (!Number.isFinite(at)) return obsDate;
  return new Date(at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** What the index is called in a sentence: "5-yr Treasury", "10-yr Treasury"
 *  (the strip's own short already says so), "30-day avg SOFR". */
export function indexName(index: DebtIndex): string {
  if (index.kind !== "treasury" || /treasury/i.test(index.short)) return index.short;
  return `${index.short} Treasury`;
}

/**
 * The note a seeded rate carries, one string, so every surface prints the
 * same sentence: "5-yr Treasury 4.78% (FRED, Sep 17, 2026) + 200 bps
 * multifamily spread, a screening default — enter your quote". The index
 * half is the fact and the spread half is named as the assumption it is.
 */
export function debtRateNote(index: DebtIndex, spreadBps: number, spreadLabel: string): string {
  return `${indexName(index)} ${index.pct.toFixed(2)}% (FRED, ${datedLong(index.asOf)}) + ${spreadBps} bps ${spreadLabel}, a screening default — enter your quote`;
}

/** A rate a surface starts from, with the sentence that says where it came from. */
export interface RateSeed {
  /** percent — 6.78 means 6.78% */
  pct: number;
  note: string;
}

/** The deal page's two starting rates: the permanent loan's (the model's
 *  own seeded rate, so the sizer and the workbook agree) and the
 *  construction loan's. Either is null where the table seeded nothing. */
export interface DealRateSeeds {
  permanent: RateSeed | null;
  construction: RateSeed | null;
}

/** The construction panel's starting rate: the floating index plus the
 *  construction spread. Null when the table seeds nothing. */
export function constructionSeed(seeds: DebtSeeds): RateSeed | null {
  if (!seeds.floating) return null;
  return {
    pct: allInPct(seeds.floating, CONSTRUCTION_SPREAD_BPS),
    note: debtRateNote(seeds.floating, CONSTRUCTION_SPREAD_BPS, "construction spread"),
  };
}
