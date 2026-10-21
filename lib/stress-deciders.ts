// Which ONE figure decides each stress-test row (the owner's rule of
// 2026-10-20). A row is graded on one named figure, never on a range its
// pieces make together: the old reader measured "past the evidence" from the
// nearest edge across every piece, so the most lenient piece won (an expense
// growth of 2.5% held against core CPI's 2.4% while all-items CPI read 3.4%),
// which an investor would call grading on a curve. Each row now names its
// deciding figure and its fallbacks in order, here, as data; the picker
// takes the first piece in that order that is fresh and may be held to;
// every other piece stays on the row, shown beside it and not deciding.
//
// The orders, a row each:
//   - rent growth: lib/rent-growth-decider's, by the kind of rent the class
//     collects (as it was);
//   - vacancy: ONE measure decides its own kind (the review of 2026-10-21).
//     A physical figure — doors, the units or the area empty: a stated
//     occupancy, a plain vacancy allowance — is decided only by a physical
//     figure: on a stabilized assumption on a deal read as stabilized, the
//     market's published figure first (the metro survey, a commercial
//     class's tracker band at its low read, the Census region, the state),
//     then the deal's rent roll, then the class's norm; a plan deal's stated
//     stabilized vacancy, the market's figure in the same order, then the
//     class's norm — never the rent roll, which is the building before the
//     plan is done (shown beside it as the gap the plan closes); today's
//     occupancy, the rent roll, then the published figures in the same
//     order, then the class's norm. The T-12's vacancy and credit loss over
//     gross potential rent is an economic figure — dollars, not doors: what
//     the statement files in that line (credit loss, and concessions or loss
//     to lease where it nets them there) rides in it — so it never decides a
//     physical figure and is shown beside it, labelled economic. An economic
//     figure the OM states (an economic occupancy, a vacancy and credit loss
//     allowance) is decided by the T-12, the same measure, then the class's
//     norm (on a plan deal's stabilized figure, the norm alone); the rent
//     roll and the published vacancy count doors and are shown beside it;
//   - expense growth: all-items CPI (the broad price level the expense base
//     moves with), then core CPI only where all-items is not fresh; the
//     insurance premium index and the breakeven never decide;
//   - exit cap: the OM's own going-in cap (the cap the deal is bought at, and
//     the model's own exit), then the research tracker's cap range at its low
//     end where no going-in cap stands; the 10-year is a yield, never a cap;
//   - basis: lib/stress-basis-evidence's order — the memorandum's comps
//     graded clean (the class's yardstick, then per SF alone), then the
//     recorded sales, then the reader's own past asks;
//   - debt: today's index plus the class's screening spread, the one figure
//     (the bare index sets how far under it reads unsupported);
//   - NOI: the deal's T-12, then the OM's own in-place NOI;
//   - taxes: the bill the OM's own figures imply on the price, then the
//     stated unabated bill an abatement ends into inside the hold;
//   - renovation premium: the achieved premium the OM states;
//   - insurance: a new owner's quote would decide it, and none is read yet;
//     the deal's T-12 premium, the seller's own actual, decides only where
//     the OM's premium sits under it past SAME_SHARE (the OM against its own
//     building's history, a working floor and a rule of thumb, never a quote);
//     at or over it nothing decides;
//   - other: none — the challenger's words are not a figure.
//
// Pure: types and the rent-growth order only. A later step that runs the
// screening model on the deciding figures reads `decidingFigureOf` off a
// built row, or the per-row pickers off the same pieces the rows hold.

import { rentGrowthDecider } from "@/lib/rent-growth-decider";
import type { StressEvidence, StressKey, StressRow, StressTest } from "@/lib/stress-test-types";

/** The tags a built row's pieces wear, and the reader of them: in
 *  lib/stress-test-words, which the panel and the documents import without
 *  the class reader. */
export { BESIDE_TAG, DECIDES_TAG, decidesTag } from "@/lib/stress-test-words";

// The evidence labels lib/stress-test emits that an order names, one copy.
export const RENT_ROLL_VACANCY_LABEL = "The deal's rent roll: the occupancy it runs at";
/** The T-12's vacancy is economic — dollars, not doors — and its label says
 *  so wherever it is shown: it decides only a figure the OM states as
 *  economic. */
export const T12_VACANCY_LABEL = "The deal's T-12 economic vacancy (vacancy and credit loss over gross potential rent)";
export const METRO_VACANCY_LABEL = "Rental vacancy, metro area";
export const CPI_ALL_ITEMS_LABEL = "Consumer prices (CPI, all items)";
export const CORE_CPI_LABEL = "Core CPI";
export const GOING_IN_CAP_LABEL = "The OM's going-in cap";
export const SALE_COMPS_LABEL = "The memorandum's sale comps";
export const SALE_COMPS_SF_LABEL = "The memorandum's sale comps stating a price per SF alone";
export const SEEDED_RATE_LABEL = "The class's screening spread over it, a rule of thumb";
export const SEEDED_RATE_ONLY_LABEL = "The index the model prices off, plus the class's screening spread";
export const T12_NOI_LABEL = "The deal's T-12 NOI";
export const T12_INSURANCE_LABEL = "The deal's T-12 insurance line";
export const T12_TAX_LABEL = "The deal's T-12 tax line";
export const OM_IN_PLACE_NOI_LABEL = "The OM's in-place NOI against its pro forma";
export const RESET_BILL_LABEL = "The bill the OM's own figures imply on the price";
export const ABATEMENT_LABEL = "The stated tax abatement and when it ends";
export const ACHIEVED_PREMIUM_LABEL = "Achieved premium on the doors already renovated";
export const PAST_SCREENS_PUBLISHER = "your past screens";

/** One step of a row's order: how a sentence names the figure, why it
 *  decides where it does, and which piece it is. */
export interface DeciderStep {
  name: string;
  why: string;
  is: (e: StressEvidence) => boolean;
}

/** A piece a row holds, with whether it may decide: fresh, with a figure,
 *  and one the row may hold the OM's figure to (a stale or narrower-stock
 *  tracker figure, a yield beside a cap, words alone may not). */
export interface DeciderCandidate {
  evidence: StressEvidence;
  held: boolean;
}

/** The figure that decides a row. */
export interface DecidingFigure {
  /** its index in the pieces handed in (on a built row, in `evidence`) */
  index: number;
  /** in the assumption's own unit */
  figure: number;
  label: string;
  /** whose figure it is: the evidence's publisher */
  source: string;
  asOf: string | null;
  /** how a sentence names it, and why it decides; absent where read off a
   *  built row */
  name?: string;
  why?: string;
}

const isLabel = (label: string) => (e: StressEvidence) => e.label === label;
const usable = (c: DeciderCandidate) => c.held && c.evidence.value != null && Number.isFinite(c.evidence.value);

/** The first piece, in the order's steps, that may decide. */
export function pickDecider(order: readonly DeciderStep[], candidates: readonly DeciderCandidate[]): DecidingFigure | null {
  for (const step of order) {
    const index = candidates.findIndex((c) => usable(c) && step.is(c.evidence));
    if (index >= 0) return found(candidates, index, step.name, step.why);
  }
  return null;
}

function found(candidates: readonly DeciderCandidate[], index: number, name?: string, why?: string): DecidingFigure {
  const e = candidates[index].evidence;
  return { index, figure: e.value!, label: e.label, source: e.publisher, asOf: e.asOf, ...(name ? { name } : {}), ...(why ? { why } : {}) };
}

// — Vacancy —

const MARKET_VACANCY: readonly DeciderStep[] = [
  { name: "the Census Bureau's rental vacancy for the metro area", why: "the market's own vacancy, inside its margin", is: isLabel(METRO_VACANCY_LABEL) },
  {
    name: "the research tracker's vacancy band, at its low read",
    why: "a commercial class's own vacancy, which the Census survey does not count",
    is: (e) => /vacancy \(research tracker\)/i.test(e.label) && !/, high read$/.test(e.label),
  },
  { name: "the Census region's rental vacancy", why: "where the survey has no metro figure", is: (e) => e.kind === "published" && /census region/i.test(e.label) },
  { name: "the state's annual rental vacancy", why: "where the survey has neither", is: (e) => e.kind === "published" && /^Rental vacancy, /.test(e.label) },
];
/** The rent roll's occupancy: physical, by its count of doors (by area
 *  where the class is priced by the foot). */
const RENT_ROLL_VACANCY: DeciderStep = { name: "the deal's rent roll", why: "the occupancy the building runs at today, by its doors", is: isLabel(RENT_ROLL_VACANCY_LABEL) };
/** The T-12's vacancy and credit loss over gross potential rent: economic. */
const T12_VACANCY: DeciderStep = {
  name: "the deal's T-12",
  why: "the economic vacancy the building ran at over its trailing year, the same measure as the OM's",
  is: isLabel(T12_VACANCY_LABEL),
};
const RULE_VACANCY: DeciderStep = { name: "the class's norm, a rule of thumb", why: "where nothing else carries a figure", is: (e) => e.kind === "rule_of_thumb" };

/** Each order holds only figures of the OM figure's own measure: a physical
 *  figure (doors) is never decided by the T-12's economic loss (dollars), and
 *  an economic one never by a count of doors. */
export const VACANCY_ORDER = {
  /** a stabilized physical assumption on a deal read as stabilized */
  stabilized: [...MARKET_VACANCY, RENT_ROLL_VACANCY, RULE_VACANCY],
  /** a plan deal's stated stabilized figure: the market's, then the class's
   *  norm; the deal's documents are today's building, never its figure */
  plan: [...MARKET_VACANCY, RULE_VACANCY],
  /** an occupancy for today, by its doors */
  today: [RENT_ROLL_VACANCY, ...MARKET_VACANCY, RULE_VACANCY],
  /** a figure the OM states as economic: the T-12, the same measure, then
   *  the class's norm */
  economic: [T12_VACANCY, RULE_VACANCY],
  /** a plan deal's stated economic allowance: the class's norm alone — the
   *  T-12 is the building before the plan is done */
  economicPlan: [RULE_VACANCY],
} as const;

/** `stabilized`: the OM's figure is a stated stabilized vacancy; `plan`: on
 *  a value-add, lease-up, conversion or development deal; `economic`: the
 *  OM states its figure as economic (dollars, not doors). */
export function vacancyDecider(candidates: readonly DeciderCandidate[], opts: { stabilized: boolean; plan?: boolean; economic?: boolean }): DecidingFigure | null {
  if (opts.economic) return pickDecider(opts.stabilized && opts.plan ? VACANCY_ORDER.economicPlan : VACANCY_ORDER.economic, candidates);
  return pickDecider(opts.stabilized ? (opts.plan ? VACANCY_ORDER.plan : VACANCY_ORDER.stabilized) : VACANCY_ORDER.today, candidates);
}

// — Rent growth —

/** lib/rent-growth-decider's order, among the pieces that may decide; a
 *  regulation's allowance is never handed in as one that may. */
export function rentGrowthDeciding(assetClass: string | null | undefined, candidates: readonly DeciderCandidate[]): DecidingFigure | null {
  const open = candidates.map((c, i) => ({ c, i })).filter((x) => usable(x.c));
  const d = rentGrowthDecider(assetClass, open.map((x) => x.c.evidence.label));
  return d ? found(candidates, open[d.index].i, d.name, d.why) : null;
}

// — Expense growth —

export const EXPENSE_GROWTH_ORDER: readonly DeciderStep[] = [
  { name: "consumer prices, all items (the CPI)", why: "the broad price level the expense base moves with", is: isLabel(CPI_ALL_ITEMS_LABEL) },
  { name: "core CPI", why: "where the all-items figure is not fresh", is: isLabel(CORE_CPI_LABEL) },
];

export function expenseGrowthDecider(candidates: readonly DeciderCandidate[]): DecidingFigure | null {
  return pickDecider(EXPENSE_GROWTH_ORDER, candidates);
}

// — Exit cap —

export const EXIT_CAP_ORDER: readonly DeciderStep[] = [
  { name: "the OM's going-in cap", why: "the cap the deal is bought at: an exit tighter than it is cap compression", is: isLabel(GOING_IN_CAP_LABEL) },
  {
    name: "the research tracker's cap range, at its low end",
    why: "where no going-in cap stands",
    is: (e) => /cap \(research tracker\)/i.test(e.label) && !/, high end$/.test(e.label),
  },
];

export function exitCapDecider(candidates: readonly DeciderCandidate[]): DecidingFigure | null {
  return pickDecider(EXIT_CAP_ORDER, candidates);
}

// — Basis —

export const BASIS_ORDER: readonly DeciderStep[] = [
  { name: "the memorandum's sale comps graded clean", why: "sales of the building's own kind the memorandum names", is: (e) => e.label === SALE_COMPS_LABEL || e.label === SALE_COMPS_SF_LABEL },
  { name: "the recorded sales' median", why: "where the memorandum's comps carry no figure", is: (e) => e.label.startsWith("Recorded sales (") },
  { name: "your past screens' asking prices", why: "asks, not trades, deciding only where nothing above carries a figure", is: (e) => e.publisher === PAST_SCREENS_PUBLISHER },
];

export function basisDecider(candidates: readonly DeciderCandidate[]): DecidingFigure | null {
  return pickDecider(BASIS_ORDER, candidates);
}

// — Debt —

export const DEBT_ORDER: readonly DeciderStep[] = [
  {
    name: "today's index plus the class's screening spread",
    why: "the rate a loan priced off today's index would carry, a screening default",
    is: (e) => e.label === SEEDED_RATE_LABEL || e.label === SEEDED_RATE_ONLY_LABEL,
  },
];

export function debtDecider(candidates: readonly DeciderCandidate[]): DecidingFigure | null {
  return pickDecider(DEBT_ORDER, candidates);
}

// — NOI —

export const NOI_ORDER: readonly DeciderStep[] = [
  { name: "the deal's T-12 NOI", why: "what the building earned over its trailing year", is: isLabel(T12_NOI_LABEL) },
  { name: "the OM's own in-place NOI", why: "where no T-12 is on file and the figure under test is the pro forma", is: isLabel(OM_IN_PLACE_NOI_LABEL) },
];

export function noiDecider(candidates: readonly DeciderCandidate[]): DecidingFigure | null {
  return pickDecider(NOI_ORDER, candidates);
}

// — Taxes —

export const TAXES_ORDER: readonly DeciderStep[] = [
  { name: "the bill the OM's own figures imply on the price", why: "the bill if the sale resets the assessment to the price", is: isLabel(RESET_BILL_LABEL) },
  { name: "the unabated bill the OM states", why: "where an abatement ends inside the model's hold", is: isLabel(ABATEMENT_LABEL) },
  // The seller's own bill decides only where the row hands it in as one that
  // may (lib/stress-test: no reset bill, no abatement ending in the hold, and
  // the OM's line under it past SAME_SHARE on a building already delivered):
  // a working floor and a rule of thumb, never the bill a new owner pays.
  {
    name: "the deal's T-12 tax line",
    why: "the seller's own bill, where the OM's sits under it and no reset bill can be struck: a working floor and a rule of thumb, not a new owner's bill",
    is: isLabel(T12_TAX_LABEL),
  },
];

export function taxesDecider(candidates: readonly DeciderCandidate[]): DecidingFigure | null {
  return pickDecider(TAXES_ORDER, candidates);
}

// — Renovation premium —

export const PREMIUM_ORDER: readonly DeciderStep[] = [
  { name: "the achieved premium the OM states", why: "what the doors already renovated rent for", is: isLabel(ACHIEVED_PREMIUM_LABEL) },
];

export function renovationPremiumDecider(candidates: readonly DeciderCandidate[]): DecidingFigure | null {
  return pickDecider(PREMIUM_ORDER, candidates);
}

// — Insurance —

/** A new owner's quote would decide the premium, and none is read from the
 *  documents yet. The deal's T-12 premium — the seller's own actual — decides
 *  only where the row hands it in as one that may (lib/stress-test: the OM's
 *  premium under it past SAME_SHARE, on a building already delivered): the
 *  OM against its own building's history, a working floor and a rule of
 *  thumb (a new owner is rarely quoted under it), never a quote. The index moves the OM's own figure and never decides. */
export const INSURANCE_ORDER: readonly DeciderStep[] = [
  {
    name: "the deal's T-12 premium",
    why: "the seller's own premium, where the OM's sits under it: a working floor and a rule of thumb (a new owner is rarely quoted under it), not a quote",
    is: isLabel(T12_INSURANCE_LABEL),
  },
];

export function insuranceDecider(candidates: readonly DeciderCandidate[] = []): DecidingFigure | null {
  return pickDecider(INSURANCE_ORDER, candidates);
}

// — The challenger's rows —

/** Each row's order in words, best first, as /how-we-test and the tests read
 *  it: the deciding figure and its fallbacks. Rent growth's order is the
 *  class's own (lib/rent-growth-decider); the challenger's rows have none. */
export const DECIDER_NAMES: Record<StressKey, readonly string[]> = {
  basis: BASIS_ORDER.map((s) => s.name),
  exit_cap: EXIT_CAP_ORDER.map((s) => s.name),
  debt: DEBT_ORDER.map((s) => s.name),
  noi: NOI_ORDER.map((s) => s.name),
  vacancy: VACANCY_ORDER.stabilized.map((s) => s.name),
  rent_growth: ["Zillow's apartment asking rents", "Zillow's asking rents across all home types", "the rent sitting tenants pay (CPI rent)", "the national index of rents its kind of lessor charges"],
  expense_growth: EXPENSE_GROWTH_ORDER.map((s) => s.name),
  taxes: TAXES_ORDER.map((s) => s.name),
  insurance: INSURANCE_ORDER.map((s) => s.name),
  renovation_premium: PREMIUM_ORDER.map((s) => s.name),
  other: [],
};

// — Off a built row —

/** The figure that decided a built row, read off its `decidedBy`: null on a
 *  row nothing decided (unchecked) or one built before the field. */
export function decidingFigureOf(row: StressRow | null | undefined): DecidingFigure | null {
  if (!row || row.decidedBy == null) return null;
  const e = row.evidence[row.decidedBy];
  if (!e || e.value == null) return null;
  return { index: row.decidedBy, figure: e.value, label: e.label, source: e.publisher, asOf: e.asOf };
}

/** Every row's deciding figure in a built test, by key (the first row of a
 *  key; the challenger's own rows decide nothing). */
export function decidingFigures(test: StressTest | null | undefined): Partial<Record<StressKey, DecidingFigure>> {
  const out: Partial<Record<StressKey, DecidingFigure>> = {};
  for (const r of test?.rows ?? []) {
    if (r.key === "other" || out[r.key]) continue;
    const d = decidingFigureOf(r);
    if (d) out[r.key] = d;
  }
  return out;
}

