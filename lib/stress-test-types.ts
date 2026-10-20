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
  /** a basis row's piece judged on a yardstick other than the OM figure's
   *  (`omSays`) — per SF where the OM's figure is per unit, say: the OM's
   *  own figure on the piece's yardstick and that yardstick's word ("/SF").
   *  Its value is on that yardstick, so it is drawn on no track shared with
   *  the OM's figure. Absent on every other piece. */
  ownYardstick?: { om: number; per: string } | null;
}

/** The return's move when the OM's figure is replaced by the evidence's,
 *  computed with lib/underwrite/engine's `computeUnderwrite` on the deal's
 *  derived model. Null where the model's reads are withheld (a placeholder
 *  price, an assumed NOI), where the price buys no building, or where no
 *  evidence carries a figure the engine can take. */
/** The plan's two figures a yield-on-cost re-run swaps (a plan deal's
 *  `StressImpact.input`): the stabilized NOI, or the total cost (the price
 *  plus the plan's budget). */
export type PlanYieldInput = "stabilizedNoi" | "totalCost";

/** What a re-run measures: absent, the derived model's levered IRR; on a
 *  plan deal (a value-add, lease-up, conversion or development), the yield on
 *  total cost — the stabilized NOI over the price plus the plan's budget
 *  (lib/plan-sensitivity `yieldOnCost`), the figure a plan deal is judged on. */
export type StressMeasure = "yield_on_cost";

export interface StressImpact {
  /** "yield_on_cost" on a plan deal's re-run (the two runs are the plan's
   *  stabilized NOI over its total cost, ONE of the two figures moved, and
   *  `baseYocPct` / `altYocPct` carry them, the IRR fields null); absent on
   *  a levered-IRR re-run */
  measure?: StressMeasure;
  /** the model input swapped — on a plan deal's re-run, the plan's figure */
  input: keyof UnderwriteInputs | PlanYieldInput;
  /** which evidence supplied the alternative (an index into `evidence`) */
  evidenceIndex: number;
  /** the two figures in the engine's own unit (a decimal for a percent) */
  omValue: number;
  altValue: number;
  baseIrrPct: number | null;
  altIrrPct: number | null;
  baseMultiple: number | null;
  altMultiple: number | null;
  /** a plan deal's re-run: the yield on total cost at the OM's figure and at
   *  the evidence's, in percent; absent on a levered-IRR re-run */
  baseYocPct?: number | null;
  altYocPct?: number | null;
  /** "If vacancy is the T-12's 9.1%, not the OM's 6.0%, the levered IRR
   *  moves from 9.3% to 7.1%." */
  note: string;
}

/** How a row reads once the evidence is set against the OM's figure. Code
 *  decides it from the gap and the evidence's kind; the challenger's words
 *  ride beside it, never in its place. */
export type StressVerdict =
  /** the OM's figure sits at the one figure that decides (within its
   *  margin), or on its conservative side */
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
  /** the ONE piece of `evidence` the verdict was decided on (its index),
   *  picked by lib/stress-deciders' order for the row: every other piece is
   *  shown beside it and decides nothing. Null on a row nothing decided
   *  (unchecked); absent on a row built before the rule */
  decidedBy?: number | null;
  impact: StressImpact | null;
  /** the challenger's own words for this assumption, where it made one */
  challenge: { severity: "high" | "medium" | "low"; challenge: string; question: string } | null;
  /** one sentence, what was compared to what: "The OM's stabilized vacancy
   *  against the deal's rent roll, the one figure that decides; beside it,
   *  not deciding: the Census survey for the metro." */
  method: string;
  /** why the row is unchecked, where it is */
  unchecked?: string | null;
  /** why the row carries no re-run where the test re-runs others, in one
   *  whole sentence: on a plan deal, a row with no yield-on-cost meaning
   *  (rent growth, an exit cap, the debt) or one whose figure the plan's
   *  stated figures cannot carry; its verdict stands as struck. Absent
   *  elsewhere */
  noRerun?: string | null;
  /** the verdict was struck against a rule of thumb alone (the site's own
   *  screening default, no figure of the deal's, the market's or the OM's):
   *  the gap says so, and no surface draws such a row as a green "holds" */
  ruleOfThumbOnly?: boolean;
}

export interface StressTest {
  rows: StressRow[];
  /** the day the published figures were read */
  readOn: string;
  /** whether the published evidence is TODAY's read (the model-vs-market
   *  read handed in, its figures read on `readOn`) — false where the only
   *  published figures are the stored market check's, read on the screen's
   *  day, so no surface dates them `readOn` */
  publishedRead: boolean;
  /** the model's reads are withheld, so no impact is struck: one whole
   *  sentence that says so and why ("No return is re-run: …"), printed as it
   *  stands on every surface */
  impactsWithheld: string | null;
  /** what the rows' re-runs and the headline measure: "yield_on_cost" on a
   *  plan deal, whose rows re-run the plan's yield on total cost; absent, the
   *  derived model's levered IRR */
  measure?: StressMeasure;
  /** the headline: the OM's case against the evidence's, the gap split by
   *  assumption (lib/stress-test `stressHeadline`). Null wherever no return
   *  is re-run (`impactsWithheld` says why, and the headline is withheld
   *  with it) or where no row carries a re-run; absent on a test built
   *  before the headline was struck */
  headline?: StressHeadline | null;
}

/** One assumption's share of the move from the OM's case to the
 *  evidence's: its Shapley value, in levered-IRR points and equity
 *  multiple. */
export interface StressHeadlinePart {
  key: StressKey;
  /** the row's own title */
  label: string;
  /** levered-IRR points, signed: negative where the evidence lowers the
   *  return — on a yield-on-cost headline, points of yield on cost */
  pts: number;
  /** the equity multiple's share, signed; null where a case's multiple is none */
  multiple: number | null;
  /** the row's verdict was struck against a rule of thumb alone
   *  (`StressRow.ruleOfThumbOnly`, the loan rate against a screening
   *  default): every surface marks the part so; absent where it was not */
  ruleOfThumb?: boolean;
}

/**
 * The stress test's headline: the derived model run ONCE on every tested
 * figure of the OM's (the OM's case) and ONCE with every figure read
 * stretched or unsupported swapped for its evidence (the evidence's case),
 * the gap between the two levered IRRs split by assumption with Shapley
 * values (lib/bridge/attribution), so the parts sum to the gap.
 */
export interface StressHeadline {
  /** "yield_on_cost" on a plan deal: the two cases are the plan's yield on
   *  total cost (`omYocPct`, `evidenceYocPct`), the parts in points of it,
   *  the IRRs and multiples null; absent, the levered IRR */
  measure?: StressMeasure;
  /** a plan deal's two cases: the stabilized NOI over the total cost on the
   *  OM's figures, and with every row past its evidence at the evidence's,
   *  in percent; absent on a levered-IRR headline */
  omYocPct?: number | null;
  evidenceYocPct?: number | null;
  /** a yield on cost the memorandum states in a row of its own, with its
   *  page — the OM's own figure, beside the two cases as the model's levered
   *  IRR is beside a stabilized deal's; null where it states none, absent on
   *  a levered-IRR headline */
  statedYoc?: { pct: number; label: string; page: number | null } | null;
  /** levered IRR in percent; null where that case's cash flows have no root */
  omIrrPct: number | null;
  evidenceIrrPct: number | null;
  omMultiple: number | null;
  evidenceMultiple: number | null;
  /** the rows whose OM figure the OM's case runs on, in the test's order */
  omKeys: StressKey[];
  /** the evidence's swaps, largest move first; empty where nothing is past
   *  its evidence, or where either case does not solve */
  parts: StressHeadlinePart[];
  /** a row past its evidence that the headline leaves out, with why */
  omitted: { key: StressKey; label: string; why: string }[];
  /** mixes of the swaps (coalitions) whose levered IRR had no root, each
   *  counted at the engine's floor in the split; 0 in the normal case */
  unsolved: number;
  /** the derived model as it runs, every input its own — the base each
   *  row's re-run starts from (`computeUnderwrite` on the model's inputs,
   *  the run every row's one-input swap is made on). Null where its
   *  cash flows have no root; absent on a headline struck before it was
   *  carried. Display only: neither case is changed by it. */
  modelIrrPct?: number | null;
  /** the rows the OM's case runs at the OM's figure and the evidence's case
   *  KEEPS there, where the model as it runs has another figure — why the
   *  evidence's case is not the model's own run. Each in the row's own unit
   *  (a percent as a percent; the year-one NOI, a tax bill or a premium in
   *  dollars), with why it stays: the row holds, is unchecked, is left out
   *  of the swaps, or its evidence is the OM's own figure. Absent where
   *  `modelIrrPct` is. */
  keptAtOm?: StressKept[];
  /** the rows the evidence's case runs at the evidence's figure where the
   *  model as it runs has another (the sample's reset tax bill against the
   *  model's seller's bill) — with `keptAtOm`, every input the evidence's
   *  case runs that the model does not. Absent where `modelIrrPct` is, and on
   *  a headline struck before it was carried. */
  atEvidence?: StressAtEvidence[];
  /** where the NOI is left out for its components (`HEADLINE_NOI_LEFT_OUT`),
   *  what the component swaps leave of the NOI row's gap: that gap (the OM's
   *  NOI less its evidence's) less the year-one NOI the component swaps move,
   *  in the model's own year-one terms, in dollars a year — positive where
   *  that much of the gap is in neither case, negative where the swaps move
   *  the year-one NOI past the NOI's own gap — with the swapped components.
   *  Null where the NOI is not left out for them, or where it is within
   *  1% of the OM's NOI; absent on a headline struck before it was carried. */
  noiRest?: { usd: number; components: StressKey[] } | null;
  /** what the headline does not test, where the deal's main risks are
   *  unchecked: the price, NOI and debt rows that stand unchecked (or that
   *  no row could be built for), and a tenant roster's worst year before the
   *  model's sale where it rolls 25% or more (lib/tenant-roster
   *  `readRoster`). Null where nothing is named; absent on a headline struck
   *  before it was carried. */
  untested?: StressUntested | null;
}

/** What a headline does not test (`StressHeadline.untested`). */
export interface StressUntested {
  /** of "basis", "noi" and "debt", in STRESS_KEYS' order */
  keys: StressKey[];
  /** the roster's worst year before the model's sale, where it rolls 25% or
   *  more: its share, what the share is of (the listed rent, else the listed
   *  area), and the month that year ends ("Oct 2028") */
  roll: { sharePct: number; basis: "rent" | "area"; through: string } | null;
}

/** One row the evidence's case keeps at the OM's figure (`keptAtOm`). */
export interface StressKept {
  key: StressKey;
  /** the row's own title */
  label: string;
  why: "holds" | "unchecked" | "left_out" | "same";
  /** the OM's figure the two cases run on, in the row's own unit — on the
   *  NOI row, the rent line (`inPlaceRentAnnual`) that makes the OM's NOI at
   *  the OM's own vacancy and expenses, which is what both cases keep (`noi`
   *  says which NOI it is struck to) */
  om: number;
  /** the model's own figure for the same input, in the same unit — on the
   *  NOI row, the model's own rent line */
  model: number;
  /** on the NOI row only: the OM's NOI the kept rent line is struck to. Where
   *  a vacancy, tax or insurance swap moves the evidence's case, its NOI
   *  moves from that rent line, so the NOI itself is not what is kept. */
  noi?: number;
}

/** One row the evidence's case runs at the evidence's figure where the
 *  model runs another (`atEvidence`), in the row's own unit. */
export interface StressAtEvidence {
  key: StressKey;
  /** the row's own title */
  label: string;
  /** the evidence's figure the evidence's case runs on */
  evidence: number;
  /** the model's own figure for the same input */
  model: number;
}

/** Why the NOI's own swap is left out of the headline where a component
 *  of it is swapped too: one clause, the omitted row's `why` and the
 *  method's own words. */
export const HEADLINE_NOI_LEFT_OUT =
  "the NOI already holds the vacancy, the taxes and the insurance, so swapping it beside one of them would count that line twice";

/** Why the price is in neither side of the headline's split: both cases pay
 *  the price the model runs on, so the headline is what that price earns on
 *  each set of figures. `price` names it: "the asking price", or what the
 *  model runs in the ask's place (a share's price grossed up to the whole,
 *  an auction's floor). */
export function headlineBasisLeftOut(price: string): string {
  return `both cases pay ${price}, so the headline says what that price earns on each set of figures; the price row says how far the ask sits from the comps and what the return is at their figure`;
}

/** The headline's price where the model runs the asking price as stated. */
export const HEADLINE_ASK = "the asking price";

/** `headlineBasisLeftOut` on a deal whose model runs the ask as stated. */
export const HEADLINE_BASIS_LEFT_OUT = headlineBasisLeftOut(HEADLINE_ASK);

/** The headline's method, as /how-we-test prints it and
 *  lib/stress-test.test.ts holds it to `stressHeadline`. */
export const HEADLINE_METHOD = {
  title: "The headline: the OM's case against the evidence's",
  claim: "The return the memorandum's figures make, all of them at once.",
  omCase: [
    "The OM's case: the deal's derived model with every assumption whose return is re-run at the OM's own figure, all at once.",
    "That is the price, the exit cap, the loan rate, vacancy, rent growth, expense growth, the taxes, insurance and the NOI.",
    "The NOI is the one the NOI row tests, its stabilized or pro forma figure where the OM states one, else the first it states, run as year one.",
    "It is struck as the rent line that makes that NOI at the OM's own vacancy and expenses.",
    "An assumption with no re-run keeps the model's own figure.",
  ],
  evidenceCase: [
    "The evidence's case: the same model with every assumption read stretched or unsupported at the figure its own row re-runs on.",
    "One that holds or is unchecked stays at the OM's figure.",
    "So the evidence's case is not the model as it runs: the headline draws the model's own levered IRR beside the two cases, and names each figure it keeps at the OM's, and each evidence figure it runs, where the model runs another.",
    "The price stays at the model's in both cases: the ask, a share's price grossed up to the whole, or an auction's floor.",
    "The headline asks what that price earns, and the price row says how far the ask sits from the comps.",
  ],
  split: [
    "The gap between the two levered IRRs is split by assumption with Shapley values, the Assumption Bridge's own arithmetic.",
    "Each swap's move is averaged over every order the swaps could be made in, so the parts add up to the gap, each rounded so the printed parts add up to the printed gap.",
    "With one assumption past its evidence, the whole gap is that assumption's, struck on the OM's case.",
    "That can differ from the row's own re-run, which starts from the model's own figures rather than the OM's.",
    "A part struck against a rule of thumb alone, such as the loan rate against a screening default, is marked so.",
  ],
  overlap: [
    `The NOI is left out where the vacancy, taxes or insurance row is past its evidence too: ${HEADLINE_NOI_LEFT_OUT}.`,
    "The NOI then stays at the OM's figure in both cases and the component swaps move it; with none of the three past its evidence, the NOI's own swap stands.",
    "What the component swaps leave of the NOI's gap, the NOI row's gap less the year-one NOI they move, is in neither case, and the headline says how much wherever it passes 1% of the OM's NOI.",
    "A tax bill or a premium the T-12 already carries in the model's expense line is swapped for the case's own figure, never added on top of it.",
    "A reset tax bill is struck on the building's price, which both cases pay.",
  ],
  plan: [
    "On a value-add, lease-up, conversion or development deal the headline is the yield on total cost: the stabilized NOI the OM states over the price plus the plan's budget.",
    "The OM's case is that yield on the OM's own figures; the evidence's case moves the stabilized NOI by each row past its evidence, the same move the row's own re-run makes.",
    "Vacancy moves it through the stabilized gross the OM states, a renovation premium through the doors to renovate, and a tax bill only where the OM states it as its pro forma's line.",
    "Rent growth, expense growth, the exit cap and the debt have no yield-on-cost meaning, and the NOI row tests today's income: each keeps its verdict and has no re-run.",
    "Both cases pay the total cost, so the price row is left out of the split, which is struck by Shapley values as above, in points of yield on cost.",
    "A yield on cost the OM states in a row of its own is drawn beside the two cases, as the OM's.",
    "No plan headline where the OM states no stabilized NOI or no total cost, where the yield is 25% or more, or where the all-in basis is outside the band any market delivers at.",
  ],
  limits: [
    "On a stabilized deal an assumption with no model input, such as a renovation premium, is not in the headline, and the headline names it.",
    "No headline on a placeholder price or an assumed NOI: no return is re-run there, and the headline is withheld with the reason.",
    "None either where the price buys no building: a note, a preferred equity position, a leased fee, a share no figure grosses up, or a share beside its entity's loan.",
    "A master lease's price buys the position between two rents, which the model runs as its own, so its headline is struck on that position.",
    "Neither case is a forecast: each is the model run once on one set of figures.",
    "Where the price, the NOI or the debt row stands unchecked, or a tenant roster rolls 25% or more of its listed rent in one year before the model's sale, the headline names what it does not test.",
  ],
} as const;

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
      "The memorandum's own sale comps, graded by the comps step, the first of these that carries a figure deciding and the rest shown beside it: a median only over three or more graded as supporting the ask, one or two named, never a median, and those graded favorable (leaning the seller's way) or stretched named and left out",
      "Recorded sales from public property records where the site has them and the comps page sets the deal against their price a foot, a median only from three sales that state an area, said thin under five",
      "Other memoranda's asking prices from your own past screens in the same market and class, a median only from three that state a basis: asks, not trades, a rule of thumb that decides only where nothing above carries a figure, and never on a shared screen or in the verdict's brief",
    ],
    engine: "The price is a direct input: the return is re-run at the evidence's price, each piece judged per unit where the class is, else per SF where it states only that. A plan deal's yield on cost is re-run at the evidence's all-in basis.",
    limits: [
      "No licensed sales or cap-rate database is read; a brokerage's published cap range speaks to the exit, not to the price.",
      "Replacement cost only where the memorandum states one.",
      "The price of a note, a preferred equity position, a leased fee, a master lease or a share of no stated percentage is not the building's, and no basis is struck on it.",
      "A basis outside the band any market trades at is the plausibility check's misread, never judged.",
      "A value-add, lease-up, conversion or development is judged on its all-in cost (the price plus the plan's budget), a forward purchase on its price, and its yield on cost is re-run at the evidence's basis.",
    ],
  },
  {
    key: "exit_cap",
    title: "The exit cap",
    claim: "A buyer will pay the pro forma's cap rate at the sale.",
    against: [
      "The going-in cap, the one figure that decides: an exit tighter than the entry is cap compression, said as such",
      "The exit's spread over the latest 10-year Treasury, dated, shown beside it and deciding nothing (a yield, not a cap), with the going-in cap's spread where the exit is held to it",
      "The research tracker's cap range for the class and market, with its period, where one is on file: its low end decides only where no going-in cap stands, and beside a going-in cap it is shown, deciding nothing",
    ],
    engine: "The exit cap is a direct input: the return is re-run at the going-in cap, or at the published cap range's low end where no going-in cap stands.",
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
      "Today's index (the Treasury tenor nearest the hold, from FRED, dated) plus the class's screening spread, said as a screening default: the one figure that decides, the bare index beside it setting only where a rate reads unsupported",
      "The lender tests: loan-to-value, debt service coverage and debt yield, with the binding one named, shown beside it",
      "Negative leverage: a going-in cap under the loan's rate, so each borrowed dollar lowers the year-one cash yield, shown beside it",
    ],
    // lib/stress-test's debtRow sizes the tests at the OM's stated rate
    // where one is read, else the derived model's `allInRatePct` (the seed,
    // or lib/underwrite/inputs' flat 0.06 where nothing fresh was read).
    engine: "The all-in rate is a direct input: the return is re-run at the index plus spread; the lender tests are sized on the model's year-one NOI at the OM's rate where it states one, else the model's (index plus spread, or a flat 6.00% placeholder).",
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
      "The deal's own T-12 NOI, the one figure that decides where one is on file, with its period printed beside it and the sign of every deduction read once",
      "The rent roll's in-place rent against the pro forma's, in words beside it",
      "The memorandum's own in-place figures against its stabilized ones, deciding only where no T-12 is on file",
    ],
    engine: "Year-one income and expenses are direct inputs: the return is re-run on the T-12's NOI where one is on file.",
    limits: [
      "The T-12's period is not matched to the OM's figure: it is printed beside the T-12's NOI, and neither figure is scaled to the other's period.",
      "A stated figure is never dropped for a derived one.",
    ],
  },
  {
    key: "vacancy",
    title: "Stabilized vacancy",
    claim: "The building runs at the pro forma's occupancy.",
    against: [
      "A stabilized vacancy on a deal read as stabilized is held to the market's published figure, the first present deciding and the rest shown beside it: the Census Bureau's rental vacancy for the metro area, inside its own margin of error, else the Census region's, then the state's",
      "For a commercial class, the research tracker's vacancy band, with its period, where the market check holds the model to it",
      "The deal's own rent roll, else its T-12, the occupancy the building runs at today: beside a stabilized assumption it is the gap a lease-up has to close (or support, where the building already runs at or under it); it decides an occupancy the OM states for today, a value-add, lease-up, conversion or development deal, and a stabilized assumption no fresh published figure speaks to, said so",
      "The class's own norm from the model's screening defaults, a rule of thumb named as one (an apartment building about 95% occupied), deciding only where nothing above carries a figure",
    ],
    engine: "Vacancy is a direct input: the return is re-run at the figure that decided — the market's for a stabilized assumption, else the documents'. On a plan deal the stabilized NOI moves by the OM's stabilized gross times the gap, and the yield on cost is re-run.",
    limits: [
      "A survey's quarterly move inside its margin is noise and is said so.",
      "A submarket's vacancy is not read: a metro figure is the metro's, its whole rental stock rather than this building's competitive set.",
      "The lease-up from today's vacancy to a stabilized one is modelled in neither run: where the deal's documents run more than 3 points over the assumption, the row says so.",
    ],
  },
  {
    key: "rent_growth",
    title: "Rent growth",
    claim: "Rents grow at the pro forma's rate every year.",
    against: [
      "One figure decides, the one for the deal's own kind of rent; every other is shown beside it. For an apartment building, Zillow's asking rents for the metro against a year ago: apartments alone, else all home types",
      "For a rented house, Zillow's asking rents across all home types first, houses among them; for a park, a student building or a mixed-use building's apartments, the closest of these decides, named as the closest published figure, not that kind of rent",
      "Where no Zillow asking rent was read, the rent sitting tenants pay (the CPI's rent of primary residence), where the BLS publishes it for the metro: it averages every lease in place, so it lags the rents new leases sign at",
      "For a commercial class, the national index of rents its kind of lessor charges (the BLS producer price indexes), said as the nation's",
      "A rent regulation's published allowance for the units it reaches, shown first and never the figure that decides",
    ],
    engine: "Rent growth is a direct input: the return is re-run at the trailing year of the figure that decided.",
    limits: [
      "A trailing year is what the assumption is asked to beat, not a forecast.",
      "The highest figure is not the test: where Zillow's asking rents are read, a sitting-tenant index running ahead of them is shown beside them, never held to.",
      "Lodging and licensed care read no rent index: they sell nights and care, not leases.",
    ],
  },
  {
    key: "expense_growth",
    title: "Expense growth",
    claim: "Expenses grow at the pro forma's rate.",
    against: [
      "Consumer prices, all items, against a year ago (BLS via FRED): the one figure that decides, the broad price level the expense base moves with",
      "Core CPI against a year ago, deciding only where the all-items figure is not fresh, else shown beside it and never the lower figure held to",
      "The producer price index for commercial property insurance premiums, shown beside the price indexes and never averaged into them",
      "The bond market's ten-year expected inflation (the breakeven), shown apart",
    ],
    engine: "Expense growth is a direct input: the return is re-run at the trailing year of the figure that decided.",
    limits: ["The insurance line's own repricing is read apart (below), not through the growth rate."],
  },
  {
    key: "taxes",
    title: "Real estate taxes",
    claim: "The tax line stays at the seller's bill.",
    against: [
      "The memorandum's own bill over its own assessed value: the rate it implies, on the price, is the bill if the sale resets the assessment, the one figure that decides where both are stated",
      "A stated tax abatement and when it ends, read against the model's sale: its unabated bill decides only where no reset bill can be struck, and the T-12's tax line is shown beside it",
    ],
    engine: "The tax line is an expense input: the return is re-run at the reset bill where the memorandum states both figures. On a plan deal the yield on cost is re-run where the bill is the OM's pro forma line.",
    limits: [
      "No assessment ratio or millage is assumed: with no bill and assessed value stated, the line says the rate is the assessor's to give.",
    ],
  },
  {
    key: "insurance",
    title: "Insurance",
    claim: "The premium stays at the seller's expiring policy.",
    against: [
      "Nothing: a new owner's quote would test the premium, and none is on file. Shown beside it, the producer price index for commercial multiple-peril premiums against a year ago, the nation's carriers, as the national move applied to the OM's own premium, not a test of it",
      "Shown beside it too: the deal's T-12 premium, the same seller's history, not a test of a new owner's quote",
    ],
    engine: "No figure decides the row. With a T-12 on file the return is re-run at its premium, said as the seller's history and no test, and both headline cases keep the OM's premium; with none, nothing is re-run.",
    limits: [
      "A quote is the carrier's: neither the seller's T-12 nor the national index says what this building will be quoted.",
      "No quote, binder or carrier's indication is read from the documents yet, so the row has nothing to test the premium against.",
    ],
  },
  {
    key: "renovation_premium",
    title: "The renovation premium",
    claim: "Each renovated unit rents for the stated premium.",
    against: [
      "An achieved premium the memorandum states, against the projected one: the one figure that decides",
      "The memorandum's own classic and renovated rents against its comps' rents, shown beside it",
    ],
    engine: "The premium is not a model input: its worth is struck at the exit cap against a door's cost, the break-even the program needs. On a value-add the gap is carried to the stabilized NOI on the doors to renovate, and the yield on cost is re-run.",
    limits: [
      "The model grows today's rent at one rate, so the premium is in none of its levered returns, said so.",
      "The program's pace against the building's turnover is not tested here.",
    ],
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
