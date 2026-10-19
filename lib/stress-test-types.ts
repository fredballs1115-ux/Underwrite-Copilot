// The stress test's contract (2026-10-19, the refocus): the product is the
// test of the memorandum's assumptions, and a test a buyer can trust shows
// its work. Each assumption the screen tests is ONE row: what the OM says
// (with its page), what the figure was set against (each piece of evidence
// typed, dated and attributed), the gap, and what the gap does to the
// return — the engine run again with the OM's figure swapped for the
// evidence's, in code, never by the model. The reader of a row is
// lib/stress-test (pure); the methodology page and the track record read
// the same keys. No imports, so a client module can take the types.

import type { UnderwriteInputs } from "@/lib/underwrite/engine";

/** The assumptions the screen tests, each by one name on every surface. */
export const STRESS_KEYS = [
  "basis",
  "exit_cap",
  "debt",
  "noi",
  "vacancy",
  "rent_growth",
  "expense_growth",
  "taxes",
  "insurance",
  "renovation_premium",
  "other",
] as const;
export type StressKey = (typeof STRESS_KEYS)[number];

/** What a piece of evidence is. The kind is said beside the figure on every
 *  surface: a published figure is the metro's, the state's or the nation's,
 *  never the building's; a document is the deal's own; a rule of thumb is
 *  named as one; an internal figure is the memorandum contradicting itself. */
export type EvidenceKind = "published" | "document" | "rule_of_thumb" | "om_internal";

export interface StressEvidence {
  kind: EvidenceKind;
  /** "Rental vacancy, metro area" / "The deal's T-12" / "Apartment occupancy, a rule of thumb" */
  label: string;
  /** the figure as it is said: "6.2% ±2.2 pts (Q2 2026)" */
  text: string;
  /** the figure in the assumption's own unit (a percent as a percent, a
   *  dollar as a dollar), null where the evidence is words alone */
  value: number | null;
  /** the day or period the figure is for, ISO or as published; null for a rule of thumb */
  asOf: string | null;
  /** "Census Bureau", "Zillow Research", "the deal's rent roll", "a rule of thumb" */
  publisher: string;
  /** whose figure it is — a Census region's (the survey's regional vacancy,
   *  which every metro borrows) is the region's, never the metro's */
  scope: "deal" | "metro" | "region" | "state" | "nation" | "class";
  /** a link to the source where one exists */
  href?: string | null;
}

/** The return's move when the OM's figure is replaced by the evidence's,
 *  computed with lib/underwrite/engine's `computeUnderwrite` on the deal's
 *  derived model. Null where the model's reads are withheld (a placeholder
 *  price, an assumed NOI), where the price buys no building, or where no
 *  evidence carries a figure the engine can take. */
export interface StressImpact {
  /** the model input swapped */
  input: keyof UnderwriteInputs;
  /** which evidence supplied the alternative (an index into `evidence`) */
  evidenceIndex: number;
  /** the two figures in the engine's own unit (a decimal for a percent) */
  omValue: number;
  altValue: number;
  baseIrrPct: number | null;
  altIrrPct: number | null;
  baseMultiple: number | null;
  altMultiple: number | null;
  /** "If vacancy is the T-12's 9.1%, not the OM's 6.0%, the levered IRR
   *  moves from 9.3% to 7.1%." */
  note: string;
}

/** How a row reads once the evidence is set against the OM's figure. Code
 *  decides it from the gap and the evidence's kind; the challenger's words
 *  ride beside it, never in its place. */
export type StressVerdict =
  /** the OM's figure sits inside the evidence, or on its conservative side */
  | "holds"
  /** past the evidence by a margin a buyer should price */
  | "stretched"
  /** past it by a margin the evidence cannot support at all */
  | "unsupported"
  /** no evidence with a figure could be read for this deal */
  | "unchecked";

export interface StressRow {
  key: StressKey;
  /** "Stabilized vacancy", "Exit cap", "Basis per unit" */
  title: string;
  omSays: {
    text: string;
    /** in the assumption's own unit; null where the OM states no figure */
    value: number | null;
    /** validated against the deck's length (lib/facts), else null */
    page: number | null;
  };
  evidence: StressEvidence[];
  /** the gap in the assumption's own unit, signed from the buyer's side
   *  (positive = the OM is more optimistic than the evidence), with its
   *  sentence; null where nothing carries a figure */
  gap: { value: number; unit: "pts" | "pct" | "bps" | "usd"; text: string } | null;
  verdict: StressVerdict;
  impact: StressImpact | null;
  /** the challenger's own words for this assumption, where it made one */
  challenge: { severity: "high" | "medium" | "low"; challenge: string; question: string } | null;
  /** one sentence, what was compared to what: "The OM's stabilized vacancy
   *  against the deal's rent roll, then the Census survey for the metro." */
  method: string;
  /** why the row is unchecked, where it is */
  unchecked?: string | null;
}

export interface StressTest {
  rows: StressRow[];
  /** the day the published figures were read */
  readOn: string;
  /** the model's reads are withheld, so no impact is struck (the reason) */
  impactsWithheld: string | null;
}

/**
 * What each assumption is set against, as the methodology page says it and
 * a test holds it to the reader. Every sentence here must be true of
 * lib/stress-test: a source named here is one the reader reads, a limit
 * named here is one it has.
 */
export interface StressMethod {
  key: StressKey;
  title: string;
  /** the OM's claim, in a buyer's words */
  claim: string;
  /** what it is set against, best evidence first */
  against: string[];
  /** what the engine does with the evidence's figure */
  engine: string;
  /** what is NOT checked, said plainly */
  limits: string[];
}

export const STRESS_METHODS: readonly StressMethod[] = [
  {
    key: "basis",
    title: "The price",
    claim: "The asking price per unit or per square foot is what the building is worth.",
    against: [
      "The memorandum's own sale comps, each graded for how hard it supports the ask",
      "Recorded sales from public property records where the site has them, a median only from three sales up",
      "Your own past screens and pipeline in the same market and class, each at its ask",
      "The band of prices per unit or per square foot the class trades in, a rule of thumb named as one",
    ],
    engine: "The price is a direct input: the return is re-run at the evidence's price.",
    limits: [
      "No broker cap-rate survey: they are licensed, so none is read.",
      "Replacement cost only where the memorandum states one.",
      "A note's, a share's or a leased fee's price is not the building's, and no basis is struck on it.",
    ],
  },
  {
    key: "exit_cap",
    title: "The exit cap",
    claim: "A buyer will pay the pro forma's cap rate at the sale.",
    against: [
      "The going-in cap: an exit tighter than the entry is cap compression, said as such",
      "The exit's spread over the latest 10-year Treasury, dated, beside the going-in cap's spread",
      "The research tracker's cap range for the class and market, with its period, where one is on file",
    ],
    engine: "The exit cap is a direct input: the return is re-run at the going-in cap, and at the evidence's cap where one is published.",
    limits: [
      "No forecast of where caps go: the test asks what the exit assumes against today's figures.",
      "A stale tracker figure (over a year old by its own period) is shown and held against nothing.",
    ],
  },
  {
    key: "debt",
    title: "The debt",
    claim: "The loan the pro forma assumes is available at that rate and that coverage.",
    against: [
      "Today's index (the Treasury tenor nearest the hold, from FRED, dated) plus the class's screening spread, said as a screening default",
      "The lender tests: loan-to-value, debt service coverage and debt yield, with the binding one named",
      "Negative leverage: a going-in cap under the all-in rate loses money on every borrowed dollar until growth bails it out",
    ],
    engine: "The all-in rate is a direct input: the return is re-run at the index plus spread, and the year-one coverage is read at it.",
    limits: [
      "A benchmark is not a quote: only a rate a loan document states is treated as one.",
      "A floating-rate or supplemental loan is read as stated and priced on nothing.",
    ],
  },
  {
    key: "noi",
    title: "The NOI",
    claim: "The pro forma's net operating income is what the building earns.",
    against: [
      "The deal's own T-12, read in the same period, with the sign of every deduction read once",
      "The rent roll's in-place rent against the pro forma's",
      "The memorandum's own in-place figures against its stabilized ones",
    ],
    engine: "Year-one income and expenses are direct inputs: the return is re-run on the T-12's NOI where one is on file.",
    limits: [
      "A T-12 and a pro forma for different periods are said to differ, never scaled to one another.",
      "A stated figure is never dropped for a derived one.",
    ],
  },
  {
    key: "vacancy",
    title: "Stabilized vacancy",
    claim: "The building runs at the pro forma's occupancy.",
    against: [
      "The deal's own rent roll or T-12: the occupancy it actually ran at",
      "The Census Bureau's rental vacancy for the metro area, inside its own margin of error, then the region's and the state's",
      "The research tracker's vacancy band for a commercial class, with its period",
      "The class's own norm from the model's screening defaults, a rule of thumb named as one (an apartment building about 95% occupied)",
    ],
    engine: "Vacancy is a direct input: the return is re-run at the evidence's vacancy.",
    limits: [
      "A survey's quarterly move inside its margin is noise and is said so.",
      "A submarket's vacancy is not read: a metro figure is the metro's.",
    ],
  },
  {
    key: "rent_growth",
    title: "Rent growth",
    claim: "Rents grow at the pro forma's rate every year.",
    against: [
      "Zillow's asking rents against a year ago, all homes and apartments alone, for the metro",
      "The rent sitting tenants pay (the CPI's rent of primary residence), where the BLS publishes it for the metro",
      "For a commercial class, the national index of rents its kind of lessor charges (the BLS producer price indexes), said as the nation's",
      "A rent regulation's published allowance for the units it reaches, shown first and never folded into the market's range",
    ],
    engine: "Rent growth is a direct input: the return is re-run at the evidence's trailing year.",
    limits: [
      "A trailing year is what the assumption is asked to beat, not a forecast.",
      "Lodging and licensed care read no rent index: they sell nights and care, not leases.",
    ],
  },
  {
    key: "expense_growth",
    title: "Expense growth",
    claim: "Expenses grow at the pro forma's rate.",
    against: [
      "Consumer prices, all items and core, against a year ago (BLS via FRED)",
      "The producer price index for commercial property insurance premiums, shown beside the price indexes and never averaged into them",
      "The bond market's ten-year expected inflation (the breakeven), shown apart",
    ],
    engine: "Expense growth is a direct input: the return is re-run at the evidence's rate.",
    limits: ["The insurance line's own repricing is read apart (below), not through the growth rate."],
  },
  {
    key: "taxes",
    title: "Real estate taxes",
    claim: "The tax line stays at the seller's bill.",
    against: [
      "The memorandum's own bill over its own assessed value: the rate it implies, on the price, is the bill if the sale resets the assessment",
      "A stated tax abatement and when it ends, read against the model's sale",
    ],
    engine: "The tax line is an expense input: the return is re-run at the reset bill where the memorandum states both figures.",
    limits: [
      "No assessment ratio or millage is assumed: with no bill and assessed value stated, the line says the rate is the assessor's to give.",
    ],
  },
  {
    key: "insurance",
    title: "Insurance",
    claim: "The premium stays at the seller's expiring policy.",
    against: [
      "The producer price index for commercial multiple-peril premiums against a year ago, the nation's carriers",
      "The deal's T-12 premium against the pro forma's",
    ],
    engine: "The insurance line is an expense input: the return is re-run with the premium moved by the index's year.",
    limits: ["A quote is the carrier's: the index says how far the market moved, not what this building is quoted."],
  },
  {
    key: "renovation_premium",
    title: "The renovation premium",
    claim: "Each renovated unit rents for the stated premium.",
    against: [
      "An achieved premium the memorandum states, against the projected one",
      "The memorandum's own classic and renovated rents against its comps' rents",
      "The break-even premium at the model's exit cap: the premium that pays for a door's cost",
    ],
    engine: "The premium is not a model input: its worth is struck at the exit cap against a door's cost, and the pace against the building's turnover.",
    limits: ["The model grows today's rent at one rate, so the premium is in none of its returns, said so."],
  },
  {
    key: "other",
    title: "Everything else the challenger raised",
    claim: "An assumption the challenger named that no reader above tests.",
    against: ["The challenger's own critique and its question for the broker"],
    engine: "No figure is swapped: the row carries the words and says it is unchecked by the engine.",
    limits: ["A challenge with no figure moves no return."],
  },
];
