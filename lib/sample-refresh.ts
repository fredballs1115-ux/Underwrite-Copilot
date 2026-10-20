// The stored sample deal, kept to the fixture it was seeded from.
//
// The "Try a sample deal" action (app/(app)/deals/actions.ts) writes the
// fixture (lib/sample-deal `SAMPLE_DEAL`) into the reader's own row once.
// A fixture change after that never reached the row: a sample seeded before
// one went on showing the old stress test, the old challenger sentences, a
// "Per the quoted term sheet" on the model's 6.00% rate (which the debt
// sizer reads as a lender's quote) and none of the tax, insurance and
// renovation rows the memorandum states now — beside a homepage walkthrough
// and a /demo that drew the fixture as it stands. So every stored sample
// carries the fixture's EDITION (`SAMPLE_EDITION`, a hash of every column
// the seed writes, so no change to the fixture can forget to bump it),
// stamped inside its extraction (`sampleEdition`, no migration), and a row
// whose stamp is not the current one is rewritten whole: the deal page does
// it on view (lib/sample-refresh-run, bounded and never throwing), the
// action on open, and every reader of the row in between reads the fixture
// over it (`currentSampleRow`).
//
// Pure: no I/O.
import { SAMPLE_DEAL } from "@/lib/sample-deal";

/** FNV-1a, 32 bits, over a string's UTF-16 code units: a fingerprint, not a
 *  secret. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Everything the seed writes, in one fixed order. */
const FIXTURE = {
  name: SAMPLE_DEAL.name,
  asset_class: SAMPLE_DEAL.asset_class,
  address: SAMPLE_DEAL.address,
  extraction: SAMPLE_DEAL.extraction,
  challenges: SAMPLE_DEAL.challenges,
  comps: SAMPLE_DEAL.comps,
  reconciliation: SAMPLE_DEAL.reconciliation,
  market: SAMPLE_DEAL.market,
  verdict: SAMPLE_DEAL.verdict,
  model: SAMPLE_DEAL.model,
  rentRoll: SAMPLE_DEAL.rentRoll,
  t12: SAMPLE_DEAL.t12,
};

/** The fixture's edition: changes whenever any column the seed writes does. */
export const SAMPLE_EDITION = `e${fnv1a(JSON.stringify(FIXTURE))}`;

/** The edition a stored row's extraction carries, or null for none (a row
 *  seeded before the stamp, or no extraction at all). */
export function sampleEditionOf(extraction: unknown): string | null {
  if (!extraction || typeof extraction !== "object") return null;
  const e = (extraction as { sampleEdition?: unknown }).sampleEdition;
  return typeof e === "string" ? e : null;
}

/** Whether a row is a sample whose stored fixture is not the current one. */
export function sampleRowOutdated(row: { is_sample?: boolean | null; extraction?: unknown } | null | undefined): boolean {
  return !!row?.is_sample && sampleEditionOf(row.extraction) !== SAMPLE_EDITION;
}

/** The deal row's fixture columns as the seed writes them, the extraction
 *  stamped with the edition. */
export function sampleFixtureColumns() {
  return {
    name: SAMPLE_DEAL.name,
    asset_class: SAMPLE_DEAL.asset_class,
    address: SAMPLE_DEAL.address,
    extraction: { ...SAMPLE_DEAL.extraction, sampleEdition: SAMPLE_EDITION },
    challenges: SAMPLE_DEAL.challenges,
    comps: SAMPLE_DEAL.comps,
    reconciliation: SAMPLE_DEAL.reconciliation,
    market: SAMPLE_DEAL.market,
    verdict: SAMPLE_DEAL.verdict,
    model: SAMPLE_DEAL.model,
  };
}

/** The sample's rent roll and T-12 rows as the seed writes them. */
export function sampleActualsRows() {
  return {
    rentRoll: {
      as_of_date: SAMPLE_DEAL.rentRoll.as_of_date,
      extraction: SAMPLE_DEAL.rentRoll.extraction,
      summary: SAMPLE_DEAL.rentRoll.summary,
    },
    t12: {
      period_end_date: SAMPLE_DEAL.t12.period_end_date,
      extraction: SAMPLE_DEAL.t12.extraction,
      summary: SAMPLE_DEAL.t12.summary,
    },
  };
}

/** A deal row as it should read: an outdated sample with the current
 *  fixture over its stored columns, anything else as it is. */
export function currentSampleRow<T extends { is_sample?: boolean | null; extraction?: unknown }>(row: T): T {
  return sampleRowOutdated(row) ? { ...row, ...sampleFixtureColumns() } : row;
}
