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

/**
 * The version of the rules a row's verdict is struck by: its deciders and
 * their order (lib/stress-deciders), its thresholds and its row rules
 * (lib/stress-test). Bumped whenever any of them changes, and stamped on the
 * snapshot the verdict keeps (lib/stress-snapshot `rules`), so a verdict
 * struck under older rules is never set against today's as if the evidence
 * had moved (lib/stress-drift: "The test's method changed since the call").
 * 1 is the rules of 2026-10-28: the exit held to the going-in cap, a vacancy
 * scored by the door. `lib/stress-rules-version.test.ts` holds it to a
 * fingerprint of the deciders and thresholds, so a change to them fails
 * until this is bumped.
 */
export const STRESS_RULES_V = 1;

/** The assumptions the screen tests, each by one name on every surface. */
export const STRESS_KEYS = [
  "basis",
  "exit_cap",
  "debt",
  "noi",
  "vacancy",
  "rent_growth",
  "market_rent",
  "expense_growth",
  "taxes",
  "insurance",
  "opex",
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
  /** the memorandum's page the piece is read off, where it is the OM's own
   *  figure (`om_internal`) and the engine holds a page validated against the
   *  deck's length (lib/facts `locatedPage`): the going-in cap's row, the
   *  achieved premium's row, the clean comps' page where they share one.
   *  Absent where none is validated — never the model's raw page. */
  page?: number | null;
}

/** What a trailing year of a published growth figure is, said in a growth
 *  row's own words on every surface (the gap's sentence) and on the
 *  methodology page: the year the assumption is asked to beat, never a
 *  forecast of the hold. */
export const TRAILING_YEAR_NOT_FORECAST = "A trailing year is what the assumption is asked to beat, not a forecast.";

/** The same, where the series' longer average decides a growth row. */
export const AVERAGE_NOT_FORECAST = "An average of published years is what the assumption is asked to beat, not a forecast.";

/** What a growth row's one year stands beside (lib/growth-average), said on
 *  the methodology page: the trailing year is a single draw of a rate run
 *  every year of the hold, so where the site's stored history of that series
 *  holds two years or more, the more cautious of the year and their compound
 *  average a year decides (the review of 2026-10-23), the other beside it. */
export const GROWTH_HISTORY_LIMIT =
  "One year is a single draw of a rate run every year of the hold: where the series' stored history holds two years, the more cautious of its trailing year and its compound average decides (the lower for rent, the higher for expenses), the other beside it.";

/** What history is held for it (lib/growth-average; held to HISTORY_ROWS by
 *  lib/stress-test.test.ts). */
export const GROWTH_HISTORY_HELD =
  "40 observations a series are kept: four years of the CPI's or a lessor index's published changes, at least three of a metro's CPI rent. Zillow's asking rents keep the newest month alone, so no average is struck on them.";

/** What that means for the rows Zillow decides (lib/stress-test
 *  `averagePiece`: no average of a series that keeps none), said on the
 *  methodology page's rent-growth rules. */
export const ZILLOW_TRAILING_ONLY =
  "So a rent growth Zillow's asking rents decide, an apartment building's or a rented house's, is held to its trailing year alone: the average never applies to it.";

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
  /** the part of the note that says what the re-run assumes, as a sentence
   *  of its own, where it assumes something the pair and the bars cannot
   *  show: the model's expense line read as carrying the OM's figure, or the
   *  base a plan's gap is struck on — the panel prints it under the bars,
   *  where the note itself is not printed */
  caveat?: string;
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
  /** `noRerun` in a few words, for a cell with no room for the sentence (the
   *  memo's move column): "no yield-on-cost re-run: a growth rate". Absent
   *  where the row carries no `noRerun`, or was built before it */
  noRerunShort?: string | null;
  /** the verdict was struck against a rule of thumb alone (the site's own
   *  screening default, no figure of the deal's, the market's or the OM's):
   *  the gap says so, and no surface draws such a row as a green "holds" */
  ruleOfThumbOnly?: boolean;
  /** on the vacancy row, "economic" where the OM states its figure as
   *  economic — dollars, not doors: a vacancy and credit loss, an economic
   *  occupancy — so only the T-12, the same measure, may decide it; absent
   *  where the figure counts doors (a stated occupancy, a vacancy), which the
   *  T-12's economic loss never decides */
  measure?: "economic";
  /** on the operating-expense row, the lines its figures leave out on both
   *  sides: the taxes and the insurance where the OM states each (each has a
   *  row of its own), so the OM's figure and the T-12's are on one footing
   *  and the track record scores a later T-12 on the same one. Absent
   *  elsewhere */
  footing?: { less: ("taxes" | "insurance")[] };
  /** on the vacancy row, the unit count the OM states: one door's share of
   *  it (one vacant door, or one door's rent of the gross potential rent) is
   *  the smallest move the vacancy can make, so the track record scores the
   *  row by no finer a margin (lib/stress-snapshot `rowThreshold`). Absent
   *  where the OM states no count, elsewhere, and on a row built before */
  doors?: number;
  /** on the market-rent row, the yardstick its figures stand on: "/mo", a
   *  month a unit, or "/SF", a square foot a year (the class's own). Absent
   *  elsewhere */
  yardstick?: "/mo" | "/SF";
  /** on the renovation-premium row where the OM's projected premium is past
   *  the achieved one: whether the program still pays for itself at the
   *  achieved premium (it clears the break-even, a door's cost at the model's
   *  exit cap). Display only — the verdict is struck as before. Absent
   *  elsewhere */
  paysAtAchieved?: boolean;
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
  /** a plan deal bought at delivery (lib/deal-strategy `planSummary`'s
   *  `forward`): its total cost is the price alone, the buyer's whole cost
   *  at delivery, never the price plus the developer's budget */
  forward?: true;
  /** the sample deal's test (lib/sample-stress): its model is pinned — its
   *  growth rates at the 3.0% default, its exit at the going-in cap, its loan
   *  at the flat 6.00% — and never seeded from today's figures, so where the
   *  evidence's case runs a figure the model does not, the words say the
   *  model's is pinned. Absent on every other deal */
  sample?: true;
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
  /** the condition the part's evidence rests on, where its figure holds only
   *  if something the screen cannot know comes true — the taxes' reset bill,
   *  "if the sale resets the assessment" — or what it is where it is the
   *  seller's history rather than a new owner's figure — the insurance
   *  premium "at the seller's actual T-12 premium, not a new owner's
   *  quote" — said beside the part on every
   *  surface, as a rule-of-thumb part is marked; absent where it rests on none */
  conditional?: string;
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
  statedYoc?: { pct: number; label: string; page: number | null; namesCost?: boolean } | null;
  /** what a plan deal's own yield on cost (`omYocPct`) is struck on, beside a
   *  stated one that differs: its total cost, and the price and the budget it
   *  adds, as the plan reads them (lib/deal-strategy `planSummary`); a
   *  forward purchase's is its price alone (`budget` null). Absent on a
   *  levered-IRR headline */
  planCost?: { total: number; price: number | null; budget: number | null } | null;
  /** an IRR the memorandum states in a row of its own, with its page and
   *  whether its own words call it levered (true), unlevered (false) or
   *  neither (null) — the OM's figure, beside the two cases on a
   *  levered-IRR headline and set against the OM's case only where it is
   *  levered. Null where it states none, or where the price buys no
   *  building (a note, a share, a position, the land); absent on a plan
   *  deal's headline and on one struck before it was carried. */
  statedIrr?: { pct: number; label: string; page: number | null; levered: boolean | null } | null;
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
   *  `readRoster`), and a hold the OM states that is not the model's. Null
   *  where nothing is named; absent on a headline struck before it was
   *  carried. */
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
  /** the hold the OM states where it differs from the model's (every re-run
   *  sells at the model's): its years and the model's, with the OM's page;
   *  absent where the OM states none or the model's own */
  hold?: { omYears: number; modelYears: number; page: number | null } | null;
}

/** One row the evidence's case keeps at the OM's figure (`keptAtOm`). */
export interface StressKept {
  key: StressKey;
  /** the row's own title */
  label: string;
  /** an unchecked row has no re-run (lib/stress-test), so it is never in
   *  either case and never kept */
  why: "holds" | "left_out" | "same";
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
  /** on the NOI row only: what the kept rent line is struck at, read off the
   *  OM's case — whose vacancy (the OM's where the vacancy row is in the
   *  case, else the model's own), which expense rows run at the OM's own
   *  figure, and where the rest of the model's expense line comes from
   *  ("t12": the T-12's expense ratio; "default": the class's screening
   *  ratio; null: not known). Display only; absent on a headline struck
   *  before it was carried */
  struckAt?: { vacancy: "om" | "model"; omExpenses: StressKey[]; rest: "t12" | "default" | null };
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
  "the NOI already holds the vacancy, the taxes, the insurance and the operating expenses, so swapping it beside one of them would count that line twice";

/** Why the price is in neither side of the headline's split: both cases pay
 *  the price the model runs on, so the headline is what that price earns on
 *  each set of figures. `price` names it: "the asking price", or what the
 *  model runs in the ask's place (a share's price grossed up to the whole,
 *  an auction's floor). */
export function headlineBasisLeftOut(price: string): string {
  return `both cases pay ${price}, so the headline says what that price earns on each set of figures; the price row says how far the ask sits from the comps and what the return is at their figure`;
}

/** The condition the taxes' reset bill holds on, said beside its part of the
 *  headline's split on every surface (`StressHeadlinePart.conditional`). */
export const TAX_RESET_CONDITION = "if the sale resets the assessment";

/** The headline's price where the model runs the asking price as stated. */
export const HEADLINE_ASK = "the asking price";

/** `headlineBasisLeftOut` on a deal whose model runs the ask as stated. */
export const HEADLINE_BASIS_LEFT_OUT = headlineBasisLeftOut(HEADLINE_ASK);

/** The headline's method, as /how-we-test prints it and
 *  lib/stress-test.test.ts holds it to `stressHeadline`. */
export const HEADLINE_METHOD = {
  title: "The headline: the OM's case against the evidence's",
  claim: "The site's own screening model, not the OM's: its own loan sizing, hold and cost of sale, and its own loan rate wherever the OM states none, run on the memorandum's tested figures all at once.",
  omCase: [
    "The OM's case: the deal's derived model with every assumption whose return is re-run at the OM's own figure, all at once.",
    "That is the exit cap, the loan rate, vacancy, rent growth, expense growth, the taxes, the insurance premium, the operating expenses and the NOI; the price is the model's own in both cases, below.",
    "The premium is re-run only where the seller's T-12 premium decides its row; else both cases keep the model's premium.",
    "The NOI is the one the NOI row tests, its stabilized or pro forma figure where the OM states one, else the first it states, run as year one.",
    "It is struck as the rent line that makes that NOI at the case's own vacancy and expenses: the OM's figure for each such row in the case, the model's own for the rest (with a T-12, its expense ratio), each named beside the kept rent line.",
    "An assumption with no re-run keeps the model's own figure.",
  ],
  evidenceCase: [
    "The evidence's case: the same model with every assumption read stretched or unsupported at the figure its own row re-runs on.",
    "One that holds stays at the OM's figure; an unchecked row has no re-run, so it keeps the model's own figure in both cases.",
    "So the evidence's case is not the model as it runs: the headline draws the model's own levered IRR beside the two cases, and names each figure it keeps at the OM's, and each evidence figure it runs, where the model runs another.",
    "Both cases pay the price the model runs: the ask, a share's price grossed up to the whole, or an auction's floor.",
    "The headline asks what that price earns, and the price row says how far the ask sits from the comps.",
  ],
  split: [
    "The gap between the two levered IRRs is split by assumption with Shapley values, the Assumption Bridge's own arithmetic.",
    "Each swap's move is averaged over every order the swaps could be made in, so the parts add up to the gap, each rounded so the printed parts add up to the printed gap.",
    "With one assumption past its evidence, the whole gap is that assumption's, struck on the OM's case.",
    "That can differ from the row's own re-run, which starts from the model's own figures rather than the OM's.",
    "A part struck against a rule of thumb alone, such as the loan rate against a screening default, is marked so.",
    "So is a part whose evidence holds only on a condition: the taxes' reset bill, struck if the sale resets the assessment to the price, which is the jurisdiction's to say.",
    "And the insurance part, struck at the seller's actual T-12 premium: the building's own history, not a new owner's quote.",
  ],
  overlap: [
    `The NOI is left out where the vacancy, taxes, insurance or operating-expense row is past its evidence too: ${HEADLINE_NOI_LEFT_OUT}.`,
    "The NOI then stays at the OM's figure in both cases and the component swaps move it; with none of the four past its evidence, the NOI's own swap stands.",
    "What the component swaps leave of the NOI's gap, the NOI row's gap less the year-one NOI they move, is in neither case, and the headline says how much wherever it passes 1% of the OM's NOI.",
    "A tax bill, a premium or the operating expenses the T-12 already carries in the model's expense line are swapped for the case's own figure, never added on top of it.",
    "A reset tax bill is struck on the building's price, which both cases pay.",
  ],
  plan: [
    "On a value-add, lease-up, conversion or development deal the headline is the yield on total cost: the stabilized NOI the OM states over the price plus the plan's budget, or on a forward purchase over the price, the buyer's whole cost at delivery.",
    "The OM's case is that yield on the OM's own figures; the evidence's case moves the stabilized NOI by each row past its evidence, the same move the row's own re-run makes.",
    "Vacancy moves it through the stabilized gross the OM states, at the market's published figure, which decides a plan's stated stabilized vacancy, else the class's norm.",
    "A rent roll or T-12 is the building before the plan is done: shown beside it as the gap the plan closes, never deciding.",
    "A renovation premium moves it through the doors to renovate, and a tax bill only where the OM states it as its pro forma's line, reset at today's bill over today's assessed value.",
    "An insurance premium the T-12's decides moves it only where the OM states the premium as its pro forma's line.",
    "No tax bill moves it on a development, a conversion or a forward purchase: the finished building is not assessed at the price, so the reset is a floor.",
    "Vacancy and a premium both past their evidence overlap a little: the vacancy's gap is struck on a gross that carries the projected premium, and the headline does not net it out.",
    "Vacancy and a market rent both past their evidence overlap the same way: the rent's gap is carried at the OM's own vacancy, and the vacancy's gap is struck on a gross carrying the OM's rent, so the two share a cross term the headline does not net out.",
    "A market rent beside a renovation premium past its evidence would carry the renovated doors' rent twice, so the market rent is left out of the split beside it.",
    "A re-run that moves the stabilized NOI to zero or under, or the yield to 25% or more, is struck nowhere: the figures do not tie.",
    "A row at its evidence whose re-run lowers the yield on cost 0.5 points or more reads stretched, as a 100-bps move in the levered IRR does on a stabilized deal.",
    "Rent growth, expense growth, the exit cap and the debt have no yield-on-cost meaning, and the NOI row tests today's income: each keeps its verdict and has no re-run. A market rent is re-run on a value-add alone.",
    "Both cases pay the total cost, so the price row is left out of the split, which is struck by Shapley values as above, in points of yield on cost.",
    "A yield on cost the OM states in a row of its own is drawn beside the two cases, as the OM's; where it differs from the plan's, the headline says what the plan's is struck on, the price plus the budget, and whether the OM's row names the cost it is struck on.",
    "No plan headline where the OM states no stabilized NOI or no total cost, where the yield is 25% or more, or where the all-in basis is outside the band any market delivers at.",
  ],
  limits: [
    "On a stabilized deal an assumption with no model input, such as a renovation premium or a market rent, is not in the headline, and the headline names it.",
    "No headline on a placeholder price or an assumed NOI: no return is re-run there, and the headline is withheld with the reason.",
    "None either where the price buys no building: a note, a preferred equity position, a leased fee, a share no figure grosses up, or a share beside its entity's loan.",
    "A master lease's price buys the position between two rents, which the model runs as its own, so its headline is struck on that position.",
    "On a plan deal it has none: the plan's stabilized NOI is the building's, and over the position's price it is no yield on cost.",
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
/** What one `against` item does for its row, as the panel tags a built
 *  row's pieces (lib/stress-test-words `DECIDES_TAG` / `BESIDE_TAG`): it
 *  decides at its place or places in the row's order (lib/stress-deciders
 *  `DECIDER_NAMES`, 1 the first), it decides in its class's own order (rent
 *  growth's houses, parks, student and mixed-use buildings), it stands
 *  beside the figure that decides and decides nothing, or — the vacancy's
 *  rent roll and T-12 — it stands beside a stabilized figure and decides one
 *  for today (lib/stress-deciders `VACANCY_ORDER.today` and `.economic`). */
export type AgainstRole = readonly number[] | "beside" | "by_class" | "today";

/** What the engine re-runs on a row's evidence: the levered IRR on a
 *  stabilized deal, the yield on total cost on a plan deal, or nothing. */
export interface StressReruns {
  stabilized: "irr" | "none";
  plan: "yoc" | "none";
}

export interface StressMethod {
  key: StressKey;
  title: string;
  /** the OM's claim, in a buyer's words */
  claim: string;
  /** what it is set against, best evidence first */
  against: string[];
  /** each `against` item's role, one a sentence */
  decides: readonly AgainstRole[];
  /** what the engine does with the evidence's figure */
  engine: string;
  /** what the engine re-runs (the `engine` sentence says it in words) */
  reruns: StressReruns;
  /** the rules the row is struck by, beyond its order and threshold */
  rules: string[];
  /** what is NOT checked, said plainly */
  limits: string[];
}

export const STRESS_METHODS: readonly StressMethod[] = [
  {
    key: "basis",
    title: "The price",
    claim: "The asking price per unit or per square foot is what the building is worth.",
    against: [
      "The memorandum's own sale comps as the comps step grades them, by how comparable each is to the subject, never by price: the median of three or more graded comparable decides; one or two are named with their count, deciding nothing",
      "Recorded sales from public property records where the site has them and the comps page sets the deal against their price a foot, a median only from three sales that state an area, said thin under five, deciding where the memorandum's comps carry no median",
      "Other memoranda's asking prices from your own past screens in the same market and class, a median only from three that state a basis: asks, not trades, a rule of thumb shown beside the price and never deciding it",
    ],
    decides: [[1], [2], "beside"],
    engine: "The price is a direct input: the return is re-run at the median's price, each piece judged per unit where the class is, else per SF where it states only that. A plan deal's yield on cost is re-run at the median's all-in basis.",
    reruns: { stabilized: "irr", plan: "yoc" },
    rules: [
      "Under three comps graded clean and no recorded sales' median, the row stands unchecked: one or two trades are sightings, not a market, the comps' own floor.",
      "The grades are the comps step's reading of each comp's comparability, the AI's; code takes the set it grades clean and strikes the median.",
      "A comp graded less comparable (flattering the ask) or not comparable is not a clean comparison, and is named and left out of the median; a screen made before the comps step graded by comparability may have meant its grades otherwise.",
      "Your past screens' asks are never read on a shared screen or in the verdict's brief.",
      "A value-add, lease-up, conversion or development is judged on its all-in cost (the price plus the plan's budget), a forward purchase on its price, and its yield on cost is re-run at the evidence's basis.",
    ],
    limits: [
      "No licensed sales or cap-rate database is read; a brokerage's published cap range speaks to the exit, not to the price.",
      "Replacement cost only where the memorandum states one.",
      "The price of a note, a preferred equity position, a leased fee, a master lease or a share of no stated percentage is not the building's, and no basis is struck on it.",
      "A basis outside the band any market trades at is the plausibility check's misread, never judged.",
    ],
  },
  {
    key: "exit_cap",
    title: "The exit cap",
    claim: "A buyer will pay the pro forma's cap rate at the sale.",
    against: [
      "The going-in cap, the one figure that decides: an exit tighter than the entry is cap compression, said as such",
      "The OM's pro forma cap, shown beside it and deciding nothing: the OM's stabilized yield on its price (it includes the OM's projected NOI growth), so compression is said only against the going-in cap",
      "The exit's spread over the latest 10-year Treasury, dated, shown beside it and deciding nothing (a yield, not a cap), with the going-in cap's spread where the exit is held to it",
      "The research tracker's cap range for the class and market, with its period, where one is on file: its low end decides only where no going-in cap stands, and beside a going-in cap it is shown, deciding nothing",
    ],
    decides: [[1], "beside", "beside", [2]],
    engine: "The exit cap is a direct input: the return is re-run at the going-in cap, or at the published cap range's low end where no going-in cap stands.",
    reruns: { stabilized: "irr", plan: "none" },
    rules: [
      "No expansion over the hold is added to the going-in cap: an exit flat to it holds, and the common rule of thumb that adds some is named, never held to.",
      "A stale tracker figure (over a year old by its own period) is shown and held against nothing.",
    ],
    limits: ["No forecast of where caps go: the test asks what the exit assumes against today's figures."],
  },
  {
    key: "debt",
    title: "The debt",
    claim: "The loan the pro forma assumes is available at that rate and that coverage.",
    against: [
      "The lender's quote on file: the rate the deal's own loan terms state, read where its model was built from them, the one figure that decides; a floating quote is shown as stated and priced on nothing",
      "Where no quote is on file, today's index (the Treasury tenor nearest the OM's stated loan term where read, else the hold's; FRED, dated) plus the class's screening spread, a screening default, the bare index setting only where a rate reads unsupported",
      "The lender tests: loan-to-value, debt service coverage and debt yield, with the binding one named, shown beside it",
      "Negative leverage: a going-in cap under the loan's rate, so each borrowed dollar lowers the year-one cash yield, shown beside it",
    ],
    // lib/stress-test's debtRow sizes the tests at the OM's stated rate
    // where one is read, else the derived model's `allInRatePct` (the seed,
    // or lib/underwrite/inputs' flat 0.06 where nothing fresh was read).
    decides: [[1], [2], "beside", "beside"],
    engine: "The all-in rate is a direct input: the return is re-run at the quote, else the index plus spread; the lender tests are sized on the model's year-one NOI at the OM's rate where stated, else the model's (index plus spread, or a flat 6.00% placeholder).",
    reruns: { stabilized: "irr", plan: "none" },
    rules: [
      "A benchmark is not a quote: only a rate a loan document states is treated as one, read off the model built from that term sheet; a model built before it carries none.",
      "The shared screen never reads the sender's documents, so a quote on file decides nothing there.",
      "A floating quote on file is shown as stated and priced on nothing too, but the OM's own fixed rate is still tested: the row is held to the screening default, the index plus the class's spread, as where no quote is on file.",
    ],
    limits: [
      "A floating rate the OM states (an index plus a spread, or a coupon that resets) or a supplemental loan is read as stated and priced on nothing: the row stands unchecked, and the lender tests run at the model's rate.",
    ],
  },
  {
    key: "noi",
    title: "The NOI",
    claim: "The pro forma's net operating income is what the building earns.",
    against: [
      "The deal's own T-12 NOI, the one figure that decides where one is on file, with its period printed beside it and the sign of every deduction read once",
      "The rent roll's in-place rent against the pro forma's, in words beside it, on the class's own yardstick: a month a unit, else per SF a year",
      "The memorandum's own in-place figures against its stabilized ones, deciding only where no T-12 is on file",
      "The OM's other income against the T-12's, where both state one, in words beside it and never deciding",
    ],
    decides: [[1], "beside", [2], "beside"],
    engine: "Year-one income and expenses are direct inputs: the return is re-run on the T-12's NOI where one is on file.",
    reruns: { stabilized: "irr", plan: "none" },
    rules: ["A stated figure is never dropped for a derived one."],
    limits: ["The T-12's period is not matched to the OM's figure: it is printed beside the T-12's NOI, and neither figure is scaled to the other's period."],
  },
  {
    key: "vacancy",
    title: "Stabilized vacancy",
    claim: "The building runs at the pro forma's occupancy.",
    against: [
      "A stabilized vacancy is held to the market's published figure, the first present deciding: the Census Bureau's rental vacancy for the metro area, inside its own margin of error; then the tracker's band (below); then the Census region's; then the state's",
      "For a commercial class, which the Census survey does not count, the research tracker's vacancy band at its low read, with its period, where the market check holds the model to it: second in that order, after the metro survey",
      "The deal's own rent roll, by its occupied doors (by area on a class priced by the foot): the building's occupancy today. It decides today's occupancy only; beside a stabilized assumption it is today's gap, the one a lease-up has to close, and never decides it",
      "The deal's T-12: its vacancy and credit loss over gross potential rent, an economic figure, dollars not doors, over a trailing year. It decides an economic figure for today only; beside a stabilized one it is today's gap, never deciding",
      "The class's own norm from the model's screening defaults, a rule of thumb named as one (an apartment building about 95% occupied), deciding only where nothing above may",
    ],
    decides: [[1, 3, 4], [2], "today", "today", [5]],
    engine: "Vacancy is a direct input: the return is re-run at the deciding figure, of the OM's own measure. A plan's yield on cost is re-run, moved by its stabilized gross times the gap to the market's figure, else the class's norm.",
    reruns: { stabilized: "irr", plan: "yoc" },
    rules: [
      "Doors and dollars are two measures: a figure for today counted by doors is decided by a count of doors, the rent roll or a published vacancy rate, and an economic one by the T-12.",
      "A stabilized figure in dollars (a pro forma's vacancy line, a vacancy and credit loss) meets the market's doors as a floor: economic vacancy is never below physical, so under it past the margin is stretched or unsupported, at or over it holds.",
      "The T-12's economic vacancy runs over the physical one wherever rent is lost to credit loss, concessions or loss to lease, so holding one to the other would call a sound occupancy unsupported.",
      "Beside a stabilized assumption the rent roll and the T-12 are today's gap, the one a lease-up has to close, or support where the building already runs at or under it: the building as it stands, never the test of the building stabilized.",
      "What the OM's figure counts is read off its own label: an occupancy, units or physical count doors; a pro forma's or underwritten vacancy line, a loss or a credit loss is dollars; a vacancy rate stated on its own counts doors.",
      "On a value-add, lease-up, conversion or development deal the documents are the gap the plan closes.",
      "A survey's quarterly move inside its margin is noise and is said so.",
    ],
    limits: [
      "A submarket's vacancy is not read: a metro figure is the metro's, its whole rental stock rather than this building's competitive set.",
      "The lease-up from today's vacancy to a stabilized one is modelled in neither run: where the deal's rent roll runs more than 3 points over the assumption, the row says so.",
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
    decides: [[1, 2], "by_class", [3], [4], "beside"],
    engine: "Rent growth is a direct input: the return is re-run at the figure that decided, the trailing year or the series' longer average.",
    reruns: { stabilized: "irr", plan: "none" },
    rules: [
      GROWTH_HISTORY_LIMIT,
      GROWTH_HISTORY_HELD,
      ZILLOW_TRAILING_ONLY,
      "The highest figure is not the test: where Zillow's asking rents are read, a sitting-tenant index running ahead of them is shown beside them, never held to.",
    ],
    limits: [TRAILING_YEAR_NOT_FORECAST, "Lodging and licensed care read no rent index: they sell nights and care, not leases."],
  },
  {
    key: "market_rent",
    title: "Pro forma rent against lease comps",
    claim: "The pro forma's market rent is what the building's units or space will lease for.",
    against: [
      "The memorandum's own lease comps as the comps step grades them: the median of three or more graded comparable, on the class's yardstick (a month a unit, else a square foot a year), the one figure that decides",
      "The deal's rent roll: its in-place rent on the same yardstick, the gap the OM claims to close, shown beside it and never deciding",
      "Zillow's asking rent for the metro, dated, the metro's and never the building's, shown beside it: apartments' beside an apartment building's rent (else all home types), all home types beside a rented house's, none beside a bed's or a pad's",
    ],
    decides: [[1], "beside", "beside"],
    engine: "No return is re-run on a stabilized deal: the model runs today's rent, which the NOI row carries. A value-add's yield on cost is re-run with the gap carried to its stabilized NOI on every unit it counts.",
    reruns: { stabilized: "none", plan: "yoc" },
    rules: [
      "Under three lease comps graded clean that state a rent, no median is struck and the row stands unchecked, the comps named: the comps' own floor.",
      "A comp graded less comparable (flattering the ask) or not comparable is named and left out of the median; a comp's rent is read only as its line states it, never inferred.",
      "On a class quoted by the foot, a comp's lease basis (net, full service, modified gross, gross) is read only as its line states it; comps graded clean on different bases strike no median, and the row stands unchecked.",
    ],
    limits: [
      "A comp's rent is for the unit it names, not the building's average mix, and no unit mix is weighted.",
      "How fast the in-place rent reaches the market rent is not tested.",
      "A comp that states no basis is read as stated, and the OM's rent's own basis is not checked against the comps'.",
    ],
  },
  {
    key: "expense_growth",
    title: "Expense growth",
    claim: "Expenses grow at the pro forma's rate.",
    against: [
      "Consumer prices, all items, against a year ago (BLS via FRED): the broad price level the expense base moves with; where its history holds two years or more, the higher of its trailing year and its compound average a year decides, the other beside it",
      "Core CPI against a year ago, deciding only where the all-items figure is not fresh, else shown beside it and never the lower figure held to",
      "The producer price index for commercial property insurance premiums, shown beside the price indexes and never averaged into them",
      "The bond market's ten-year expected inflation (the breakeven), shown apart",
    ],
    decides: [[1], [2], "beside", "beside"],
    engine: "Expense growth is a direct input: the return is re-run at the figure that decided, the trailing year or the series' longer average.",
    reruns: { stabilized: "irr", plan: "none" },
    rules: [GROWTH_HISTORY_LIMIT, GROWTH_HISTORY_HELD, "The insurance line's own repricing is read apart (below), not through the growth rate."],
    limits: [TRAILING_YEAR_NOT_FORECAST],
  },
  {
    key: "taxes",
    title: "Real estate taxes",
    claim: "The tax line stays at the seller's bill.",
    against: [
      "A scenario on the memorandum's own figures, not the OM contradicting itself: its bill over its assessed value is today's rate, and that rate on the price is the bill if the sale resets the assessment, the one figure that decides where both are stated",
      "A stated tax abatement and when it ends, read against the model's sale: its unabated bill decides only where no reset bill can be struck",
      "The deal's T-12 tax line, the seller's actual bill: it decides only where nothing above does and the OM's line sits more than 2% under it, the OM against its own building's history, stretched at most; else it is shown beside it",
    ],
    decides: [[1], [2], [3]],
    engine: "The tax line is an expense input: the return is re-run at the reset bill where the OM states both figures, else at the T-12's bill where it decides. A plan's yield on cost is re-run on its pro forma line; not on a development, conversion or forward purchase.",
    reruns: { stabilized: "irr", plan: "yoc" },
    rules: [
      "A bill over its assessed value past 5% is read as a misread or an assessment at a fraction of value, and no reset bill is struck on it.",
      "The seller's T-12 bill is the building's own history, not a new owner's bill, so a line under it reads stretched at most, and on a development or a conversion it decides nothing.",
    ],
    limits: ["No assessment ratio or millage is assumed: with no bill and assessed value stated, the line says the rate is the assessor's to give."],
  },
  {
    key: "insurance",
    title: "Insurance",
    claim: "The premium stays at the seller's expiring policy.",
    against: [
      "The deal's T-12 premium, the seller's own actual: it decides where the OM's premium sits more than 2% under it, the OM against its own building's history, stretched at most; at or over it, it is shown as the seller's history and nothing decides",
      "The producer price index for commercial multiple-peril premiums against a year ago, the nation's carriers, applied to the OM's premium as a national move, shown beside it and never deciding",
    ],
    decides: [[1], "beside"],
    engine: "Where the T-12's premium decides, the return is re-run at it, the seller's actual premium and not a new owner's quote, swapped into the expense line, never added on top; a plan's yield on cost is re-run where its pro forma states the premium.",
    reruns: { stabilized: "irr", plan: "yoc" },
    rules: [
      "The seller's T-12 premium is the building's own history, not a new owner's quote: a premium under it reads stretched at most, and the re-run at it is the seller's actual premium, not the premium a new owner will pay.",
      "A premium at or over the T-12's stays unchecked: the seller's history cannot say a new owner will pay less, and the national index says nothing of this building.",
      "On a development or a conversion the T-12 insures the building before the plan delivers a new one, so it decides nothing.",
    ],
    limits: ["A new owner's quote is what finally decides the premium: no quote, binder or carrier's indication is read from the documents yet."],
  },
  {
    key: "opex",
    title: "Operating expenses",
    claim: "The pro forma's operating expenses, less the taxes and the insurance, are what the building costs to run.",
    against: [
      "The deal's own T-12 operating expenses less its taxes and insurance, the one figure that decides, with its period printed beside it",
      "Each T-12 expense line a unit (a square foot on a class priced by the foot), the management fee as a share of the T-12's EGI, and the OM's own lines where it states them, shown beside it, never deciding",
      "The class's expense ratio from the model's screening defaults, a rule of thumb named as one, struck on the OM's own income, deciding only where no T-12 is on file",
    ],
    decides: [[1], "beside", [2]],
    engine: "The expense line is an input: the return is re-run at the deciding figure, swapped into the model's expense line, never added on top. A plan's yield on cost is re-run on its pro forma line.",
    reruns: { stabilized: "irr", plan: "yoc" },
    rules: [
      "The taxes and the insurance are left out on both sides wherever the OM states them, since each has a row of its own; a T-12 that breaks out neither line cannot be set on that footing.",
      "Where the OM states only a total or a ratio, that is what is read; a line the OM does not state is never inferred, and its own lines decide nothing.",
      "A rule of thumb reads stretched at most.",
    ],
    limits: [
      "The T-12's period is not matched to the OM's figure, and neither is scaled to the other's year.",
      "No row on a development or a conversion: no building runs today to have a T-12, and its pro forma is the finished building's.",
    ],
  },
  {
    key: "renovation_premium",
    title: "The renovation premium",
    claim: "Each renovated unit rents for the stated premium.",
    against: [
      "An achieved premium the memorandum states, against the projected one: the one figure that decides",
      "The memorandum's own classic and renovated rents against its comps' rents, shown beside it",
      "The program's pace, the memorandum against itself: the turnover its stated period needs against the turnover it states, shown beside it and deciding nothing",
    ],
    decides: [[1], "beside", "beside"],
    engine: "The premium is not a model input: its worth is struck at the exit cap against a door's cost, the break-even the program needs. On a value-add the gap is carried to the stabilized NOI on the doors to renovate, and the yield on cost is re-run.",
    reruns: { stabilized: "none", plan: "yoc" },
    rules: [],
    limits: [
      "The model grows today's rent at one rate, so the premium is in none of its levered returns, said so.",
      "Whether tenants leave at the stated turnover is not tested: the pace is the memorandum against itself, and the rent roll's lease ends are expiries, not move-outs.",
    ],
  },
  {
    key: "other",
    title: "Everything else the challenger raised",
    claim: "An assumption the challenger named that no reader above tests.",
    against: ["The challenger's own critique and its question for the broker"],
    decides: ["beside"],
    engine: "No figure is swapped: the row carries the words and says it is unchecked by the engine.",
    reruns: { stabilized: "none", plan: "none" },
    rules: [],
    limits: ["A challenge with no figure moves no return."],
  },
];
