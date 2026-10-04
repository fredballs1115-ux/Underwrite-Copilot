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
