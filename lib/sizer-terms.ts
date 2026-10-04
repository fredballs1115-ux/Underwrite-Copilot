// The deal page's debt sizer's starting terms — PURE, and free of runtime
// imports, so the client components that read them (the sizer, and the
// sensitivity playground beside it) never pull the rates table or the
// model's derivation into the browser.
//
// THE STARTING RATE (#380's rule, carried to a day the rates table seeds
// nothing). A rate a loan's own paper states, read through the first-draft
// model (lib/model/stated-rate), comes first: a quote beats a benchmark.
// Then the day's seed, the derived screening model's own (its
// `meta.rateSeed`: the Treasury tenor nearest the hold plus the class
// spread). Where the table seeded nothing, the derived screening model's own
// rate: its flat placeholder, the figure the workbook and the report run on,
// so the sizer never prints a second rate for the same loan on the same day
// (it had started from 6.50% beside the model's 6.00%). Only where there is
// no derived model at all does the sizer's own flat placeholder remain.
// Every rate but a stated one says what it is under the field.

import type { RateSeed } from "@/lib/debt-index";

/** The sizer's own placeholder: only where the deal has no derived
 *  screening model to start from (no extraction yet) and nothing states a
 *  rate. */
export const FLAT_SIZER_RATE_PCT = 6.5;

/**
 * The card's opening sentence, true of every figure it starts from: the
 * ones the first-draft model or the OM gave, named as theirs, and the
 * lender tests — with the amortization where neither gave one — named as
 * the screening defaults they are, to replace with a lender's terms. A rate
 * that is not the documents' says what it is under its own field
 * (`sizerStartingRate`), so it is named here only where a loan's own paper
 * states it. It had said "its figures start from the OM's" over a 65% LTV,
 * a 1.25x DSCR, an 8% debt yield and a 30-year amortization that are not.
 */
export function sizerSourceLine(o: {
  from: "model" | "extraction" | "defaults";
  /** each figure the sizer took from that source */
  price: boolean;
  noi: boolean;
  /** the first-draft model's rate, as a loan's own paper states it */
  rate: boolean;
  /** the first-draft model's own amortization (else the 30-year default) */
  amortization: boolean;
}): string {
  const fromSource = o.from !== "defaults";
  const named = [
    fromSource && o.price ? "price" : null,
    fromSource && o.noi ? "NOI" : null,
    o.from === "model" && o.rate ? "rate" : null,
    o.from === "model" && o.amortization ? "amortization" : null,
  ].filter((w): w is string => w !== null);
  const amortTaken = named.includes("amortization");
  const defaults = `${amortTaken ? "the lender tests are" : "the amortization and lender tests are"} screening defaults — replace them with a lender's terms.`;
  if (named.length === 0) return `Enter the deal's figures; ${defaults}`;
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  const whose = o.from === "model" ? "the first-draft model" : "the OM";
  return `${list[0].toUpperCase()}${list.slice(1)} from ${whose}; ${defaults}`;
}

export type SizerRateSource = "stated" | "seed" | "model" | "flat";

export interface SizerRate {
  /** percent — 6.78 means 6.78% */
  pct: number;
  from: SizerRateSource;
  /** the sentence under the rate field saying where the rate came from;
   *  null for a rate a loan's own paper states, which the card's opening
   *  sentence names as the first-draft model's */
  note: string | null;
}

const toTwo = (n: number) => Math.round(n * 100) / 100;

export function sizerStartingRate(o: {
  /** the first-draft model's rate where a loan's own paper states it, percent */
  statedPct: number | null;
  /** the derived screening model's seed (`meta.rateSeed`), percent */
  seed: RateSeed | null;
  /** the derived screening model's own rate — a DECIMAL, as lib/underwrite
   *  keeps it (0.06 is 6%) */
  modelRateDec: number | null;
  /** whether the deal's class carries a permanent loan the model would seed
   *  (lib/asset-words `operating`, the model's own test: land does not) */
  operating: boolean;
}): SizerRate {
  if (o.statedPct != null && Number.isFinite(o.statedPct)) {
    return { pct: o.statedPct, from: "stated", note: null };
  }
  if (o.seed) {
    return { pct: o.seed.pct, from: "seed", note: `Rate seeded from the live curve: ${o.seed.note}.` };
  }
  if (o.modelRateDec != null && Number.isFinite(o.modelRateDec) && o.modelRateDec > 0) {
    const pct = toTwo(o.modelRateDec * 100);
    const at = `Rate starts from the screening model's ${pct.toFixed(2)}% placeholder`;
    return {
      pct,
      from: "model",
      note: o.operating
        ? `${at} — no fresh index seeded it; enter your quote.`
        : `${at} — land carries no permanent loan to seed a rate from; enter the land loan's rate.`,
    };
  }
  return {
    pct: FLAT_SIZER_RATE_PCT,
    from: "flat",
    note: `Rate starts from a flat ${FLAT_SIZER_RATE_PCT.toFixed(2)}% placeholder — there is no screening model to start from; enter your quote.`,
  };
}
