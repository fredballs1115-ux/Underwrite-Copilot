// A fully-populated demo deal so a new user can explore the whole product
// without an OM in hand. Pure data + deterministic math — no AI calls, no file.
// Seeded into the user's pipeline by the "Try a sample deal" action.

import { computeModel, type ModelInputs } from "@/lib/model/compute";
import { compactUsd } from "@/lib/money";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import type { UnderwritingModel, ReconciledMetric } from "@/lib/model/types";
import type {
  RentRollExtraction,
  RentRollSummary,
  T12Extraction,
  T12Summary,
} from "@/lib/actuals/types";
import type { BuyBox } from "@/lib/criteria";
import type { AskEntry, DealNote } from "@/lib/deals";
import { normalizeTaskTitle } from "@/lib/deal-tasks";
import { withArticle } from "@/lib/article";
import { SAMPLE_AUTHOR } from "@/lib/note-remove";

/** The hypothetical mandate the PUBLIC sample is judged against — the
 *  homepage's chip, /demo's buy-box tab, and the public memo and full
 *  report (lib/sample-cover `sampleDocumentChecks`). It tells one story
 *  beside the Caution verdict: in scope and the right size (the class
 *  passes, and the count band at 248 units), short of the return floors.
 *  The going-in cap misses its floor outright, so the header's chip reads
 *  "Outside box" whatever the score (lib/fit-label `fitScoreLabel`), in
 *  the kill tone, with the count of criteria checked beside the score —
 *  the target return and the cash-on-cash cannot be checked from the
 *  documents, and lib/buy-box-chip's `buyBoxRead` says so in the chip's
 *  note. The signed-in sample is judged against this box too, whoever
 *  reads it (lib/deal-buy-box), never the reader's own: the three surfaces
 *  say one thing. */
export const SAMPLE_DEMO_BOX: BuyBox = {
  assetClasses: ["multifamily"],
  unitsMin: 100,
  unitsMax: 400,
  minCapPct: 5.75,
  minIrrPct: 13,
  minCoCPct: 5,
};

export const SAMPLE_DEAL_NAME = "Sample — The Maddox at Brewerytown";

const inputs: ModelInputs = {
  units: 248,
  purchasePrice: 68000000,
  closingCostPct: 2,
  loanFeePct: 1,
  year1Gpr: 7150000,
  vacancyPct: 9,
  otherIncomeAnnual: 300000,
  year1Opex: 3100000,
  capexReserveAnnual: 74400,
  rentGrowthPct: 3,
  expenseGrowthPct: 3,
  otherIncomeGrowthPct: 3,
  exitCapPct: 5.5,
  sellingCostPct: 2,
  holdYears: 5,
  loan: { ltvPct: 60, ratePct: 6.0, amortYears: 30, ioYears: 1 },
};

const { cashFlow, returns } = computeModel(inputs);

// The sample's sentences quote its own model: each move below is the
// first-draft model's, run on the inputs above, so a sentence can never drift
// from the figures printed beside it (the first version said "roughly 8%" and
// "roughly 200 bps" of a model that returns 8.7% and moves 185 and 237).
const irrWith = (over: Partial<ModelInputs>): number | null =>
  computeModel({ ...inputs, ...over }).returns.leveredIrrPct;
/** A move in IRR to the nearest 10 bps, from the model's own return. */
const bpsFrom = (v: number | null): string => {
  const base = returns.leveredIrrPct;
  return v == null || base == null ? "—" : `${Math.round(Math.abs(v - base) * 10) * 10} bps`;
};
/** The OM's stated NOI less the T-12's, the gap the reconciliation names. */
const NOI_GAP = 3_880_000 - 3_706_500;
/** The model's exit against its own going-in cap, read off the model and
 *  said as a figure, never as "flat": the exit is 5.50% and the going-in
 *  5.45%, 5 bps of expansion (research pass 40, L8: "Held flat to
 *  going-in"). The going-in figure itself stays on the tab's own tile, where
 *  a price that buys no building withholds it. */
const EXIT_OVER_ENTRY = `${inputs.exitCapPct.toFixed(2)}%, ${Math.round((inputs.exitCapPct - returns.goingInCapPct) * 100)} bps over the going-in cap`;

/**
 * The stress test's re-run of the exit on the sample (lib/stress-test's
 * exit-cap row, on the sample's one derivation, lib/sample-derive): the
 * engine run twice, ONE input apart — the OM's 5.25% exit, then the 5.70%
 * pro forma cap that decides the row (the higher of the OM's own going-in
 * and pro forma caps, the review of 2026-10-23) — each levered IRR in
 * percent; and the model's own case, the 5.45% going-in cap the derived
 * model exits at, with its levered IRR. The verdict's "breaks if" and its
 * scenarios quote these. They are written here because this module cannot
 * load the derivation (it imports this one, and the homepage's client bundle
 * loads this module), and lib/sample-figures.test.ts holds each to the
 * engine's own figure, so the sentence cannot drift from the row printed
 * beside it.
 */
export const SAMPLE_EXIT_RERUN = {
  omExitPct: 5.25,
  proFormaExitPct: 5.7,
  omIrrPct: 10.75,
  proFormaIrrPct: 7.42,
  goingInExitPct: 5.45,
  goingInIrrPct: 9.25,
} as const;

const modelMetrics: ReconciledMetric[] = [
  {
    key: "price",
    label: "Purchase price",
    chosenValue: "$68,000,000",
    unit: "$",
    sources: [{ doc: "OM", value: "$68,000,000", locator: "p.3", basis: "ask" }],
    authority: "OM",
    rationale: "Stated asking price.",
    confidence: "high",
    isConflict: false,
  },
  {
    key: "year1Noi",
    label: "Year-1 NOI",
    chosenValue: "$3,706,500",
    unit: "$",
    sources: [
      { doc: "OM", value: "$3,880,000", locator: "p.8", basis: "pro forma" },
      { doc: "T-12", value: "$3,706,500", locator: "trailing", basis: "actual" },
    ],
    authority: "T-12",
    // The OM states no expense total: the gap is its 6% vacancy against the
    // building's, which more than covers it (the reconciliation below).
    rationale: "Actuals beat the pro forma; the building's vacancy against the OM's 6% more than covers the gap, and the OM states no expense total.",
    confidence: "medium",
    isConflict: true,
  },
  {
    key: "vacancy",
    label: "Vacancy",
    chosenValue: "9.0%",
    unit: "%",
    sources: [
      { doc: "OM", value: "6.0%", locator: "p.8", basis: "pro forma" },
      { doc: "Rent roll", value: "9.1%", locator: "sheet", basis: "actual" },
    ],
    authority: "Rent roll",
    rationale: "In-place vacancy runs higher than the stabilized pro forma.",
    confidence: "high",
    isConflict: true,
  },
  {
    key: "exitCap",
    label: "Exit cap",
    chosenValue: "5.50%",
    unit: "%",
    sources: [{ doc: "Market", value: "5.5%", locator: "", basis: "market norm" }],
    authority: "Market",
    rationale: `${EXIT_OVER_ENTRY} — no compression thesis.`,
    confidence: "medium",
    isConflict: false,
  },
  {
    key: "ltv",
    label: "Loan-to-value",
    chosenValue: "60%",
    unit: "%",
    // The memorandum's own financing page (the extraction's p. 44 row): a
    // broker's pro forma assumption. No term sheet is among the documents.
    sources: [{ doc: "OM", value: "60%", locator: "p.44", basis: "pro forma" }],
    authority: "OM",
    rationale: "The memorandum's own financing assumption — no lender has quoted the loan.",
    confidence: "medium",
    isConflict: false,
  },
  {
    key: "units",
    label: "Units",
    chosenValue: "248",
    unit: "",
    sources: [
      { doc: "Rent roll", value: "248", locator: "sheet", basis: "actual" },
      { doc: "OM", value: "248", locator: "p.3", basis: "stated" },
    ],
    authority: "Rent roll",
    rationale: "Rent roll and OM agree.",
    confidence: "high",
    isConflict: false,
  },
  {
    key: "avgRent",
    label: "Avg monthly rent",
    chosenValue: "$2,400/unit",
    unit: "$",
    sources: [
      { doc: "OM", value: "$2,600/unit", locator: "p.12", basis: "pro forma" },
      { doc: "Rent roll", value: "$2,400/unit", locator: "sheet", basis: "actual" },
    ],
    authority: "Rent roll",
    rationale:
      "In-place rents, not the OM's post-renovation target — the $200 gap IS the business plan, not the starting point.",
    confidence: "high",
    isConflict: true,
  },
  {
    key: "rentGrowth",
    label: "Rent growth",
    chosenValue: "3.0%/yr",
    unit: "%",
    sources: [
      { doc: "OM", value: "4.0%/yr", locator: "p.40", basis: "pro forma" },
      { doc: "Market", value: "3.0%/yr", locator: "", basis: "market norm" },
    ],
    authority: "Market",
    rationale:
      "The submarket has averaged ~3% over the long run; 4% assumes the top of the band every year.",
    confidence: "medium",
    isConflict: true,
  },
  {
    key: "expenseGrowth",
    label: "Expense growth",
    chosenValue: "3.0%/yr",
    unit: "%",
    sources: [{ doc: "Market", value: "3.0%/yr", locator: "", basis: "market norm" }],
    authority: "Market",
    rationale: "Held at inflation — taxes and insurance argue against less.",
    confidence: "medium",
    isConflict: false,
  },
  {
    key: "otherIncome",
    label: "Other income",
    chosenValue: "$300,000/yr",
    unit: "$",
    sources: [{ doc: "T-12", value: "$300,000", locator: "trailing", basis: "actual" }],
    authority: "T-12",
    rationale: "Parking, fees, and laundry as actually collected.",
    confidence: "high",
    isConflict: false,
  },
  {
    key: "capexReserve",
    label: "Capital reserve",
    chosenValue: "$300/unit/yr",
    unit: "$",
    sources: [
      { doc: "OM", value: "$250/unit/yr", locator: "p.43", basis: "pro forma" },
      { doc: "Rule of thumb", value: "$300/unit/yr", locator: "", basis: "screening default" },
    ],
    authority: "Rule of thumb",
    rationale:
      "1990s vintage with original roofs and chillers — the sample's own call that $250 underfunds them; a rule of thumb, not a lender's requirement.",
    confidence: "medium",
    isConflict: true,
  },
  {
    key: "rate",
    label: "Interest rate",
    chosenValue: "6.00%",
    unit: "%",
    // No document states a rate (the OM, the rent roll and the T-12 are the
    // documents): a screening default, never seeded from today's rates on
    // the sample (lib/model-market), so lib/model/stated-rate reads it as
    // no quote.
    sources: [{ doc: "Screening default", value: "6.00%", locator: "", basis: "assumption" }],
    authority: "Screening default",
    // The model amortizes over 30 years from the first month, no
    // interest-only period (lib/underwrite/inputs `ioMonths: 0`), as the
    // verdict's debt read says.
    rationale: "No document states a rate: a flat 6.00% screening default, 30-yr amortizing from the first month, no interest-only period — enter your quote.",
    confidence: "low",
    isConflict: false,
  },
  {
    key: "sellingCost",
    label: "Selling costs at exit",
    chosenValue: "2.0%",
    unit: "%",
    sources: [{ doc: "Market", value: "2.0%", locator: "", basis: "market norm" }],
    authority: "Market",
    // The model's cost of sale carries no transfer tax a seller may owe
    // (lib/underwrite/cost-note `costAssumptionsLine`, lib/not-tested).
    rationale: "Broker and closing costs on disposition; no transfer tax is modelled.",
    confidence: "medium",
    isConflict: false,
  },
];

const model: UnderwritingModel = {
  generatedFrom: [
    "Offering memorandum: Maddox-OM.pdf",
    "Rent roll: Maddox-RentRoll.xlsx",
    "T-12: Maddox-T12.pdf",
  ],
  holdYears: inputs.holdYears,
  metrics: modelMetrics,
  conflicts: modelMetrics.filter((m) => m.isConflict),
  inputs,
  cashFlow,
  returns,
  summary:
    `Reconciled across the OM, rent roll, and T-12. Actuals set the in-place income and expense load, rent growth is haircut to the market norm, the capital reserve is funded at $300/unit, a rule of thumb, and the exit is ${EXIT_OVER_ENTRY}, with no compression assumed.`,
  caveats: [
    "Single-tranche debt and straight-line growth — a screening model, not a full build.",
    "Capital reserve is a flat annual figure; confirm against a real engineering budget.",
  ],
};

const extraction: ExtractionResult = {
  dealName: SAMPLE_DEAL_NAME,
  assetClass: "multifamily",
  market: "Brewerytown, Philadelphia, PA",
  metrics: [
    // basis mirrors what each label already states — in-place figures vs the
    // OM's projection — so the report's Basis column reads meaningfully on
    // the sample (facts and financing terms carry "na").
    { label: "Asking price", value: "$68,000,000", flagged: false, page: "p. 3", basis: "na" },
    { label: "Going-in cap", value: "5.45%", flagged: false, page: "p. 8", basis: "in_place" },
    { label: "Pro forma cap", value: "5.7%", flagged: true, page: "p. 8", basis: "pro_forma" },
    { label: "Exit cap", value: "5.25%", flagged: true, page: "p. 41", basis: "pro_forma" },
    // The OM's own p.8 figure — the pro forma the reconciliation (below) and
    // the T-12 actual ($3,706,500) both push back on. Storing the OM's stated
    // number here keeps the OM-vs-T-12 note honest: +4.7%, not a self-compare.
    { label: "NOI (pro forma)", value: "$3,880,000", flagged: true, page: "p. 8", basis: "pro_forma" },
    { label: "Units", value: "248", flagged: false, page: "p. 3", basis: "na" },
    { label: "Avg in-place rent", value: "$2,400/mo", flagged: false, page: "p. 12", basis: "in_place" },
    { label: "Pro forma rent", value: "$2,600/mo", flagged: true, page: "p. 12", basis: "pro_forma" },
    { label: "Rent growth", value: "4.0%/yr", flagged: true, page: "p. 40", basis: "pro_forma" },
    { label: "Vacancy (pro forma)", value: "6.0%", flagged: true, page: "p. 8", basis: "pro_forma" },
    // The renovation program (p. 25), in the extraction's own row labels
    // (lib/value-add). The 56 doors done and the 192 to go are the 248; the
    // classic rent with the achieved premium on the doors done averages
    // $2,407 ((192 × $2,375 + 56 × $2,515) / 248), within a dollar of the
    // rent roll's in-place rent and the memorandum's "$2,400/mo"; the
    // renovated units in place rent at $2,515, beside the renovated lease
    // comp's $2,520, while the program is priced on $200.
    { label: "Classic rent", value: "$2,375/mo", flagged: false, page: "p. 25", basis: "in_place" },
    { label: "Renovated rent", value: "$2,575/mo", flagged: false, page: "p. 25", basis: "pro_forma" },
    { label: "Renovation premium", value: "$200/mo", flagged: true, page: "p. 25", basis: "pro_forma" },
    { label: "Achieved renovation premium", value: "$140/mo", flagged: false, page: "p. 25", basis: "in_place" },
    { label: "Units renovated", value: "56", flagged: false, page: "p. 25", basis: "na" },
    { label: "Units to renovate", value: "192", flagged: false, page: "p. 25", basis: "na" },
    { label: "Renovation cost per unit", value: "$18,000", flagged: false, page: "p. 25", basis: "na" },
    // The seller's tax bill and the assessment it is struck on (p. 27) —
    // the T-12's own tax line — and the pro forma's insurance (p. 28), under
    // the T-12's $385,000. The stress test re-strikes the bill on the price
    // at the rate the two stated figures imply, only because the memorandum
    // states both: nothing here asserts what the city does on a sale.
    { label: "Real estate taxes (2026)", value: "$727,896", flagged: false, page: "p. 27", basis: "in_place" },
    { label: "Assessed value (2026)", value: "$52,000,000", flagged: false, page: "p. 27", basis: "na" },
    { label: "Insurance (pro forma)", value: "$310,000", flagged: true, page: "p. 28", basis: "pro_forma" },
    // The pro forma's reserve, on the memorandum's "Reserves" page: the
    // figure the first-draft model's capital reserve is set against.
    { label: "Replacement reserve (pro forma)", value: "$250/unit/yr", flagged: false, page: "p. 43", basis: "pro_forma" },
    { label: "Loan-to-value", value: "60%", flagged: false, page: "p. 44", basis: "na" },
  ],
  // The memorandum sells a stabilized building on its in-place income, with
  // the renovation program as the upside on turnover: read as stabilized, so
  // the screen judges the price as a building's (a value-add is a plan deal,
  // judged on yield on total cost) and the model carries none of the program.
  strategy: {
    kind: "stabilized",
    summary: "A stabilized apartment building sold on its in-place income, with an interior program renovating the classic units as they turn.",
    capitalBudget: "",
    timeline: "",
  },
  // The fictional memorandum's length, at or past its last cited page
  // (p. 44): a citation prints only inside the page count (lib/facts), and
  // without one the demo report's page column was dashes on every row
  // beside the "(p. 14)" its own memo page cites (research pass 35).
  totalPages: 48,
};

/** The T-12's insurance line (the statement below carries it): the seller's
 *  own actual premium. The pro forma's $310,000 sits under it, so the stress
 *  test holds the pro forma to it — the seller's actual premium, the
 *  building's own history, never a new owner's quote; a new owner's quote would decide it, and the sample states none. */
const T12_INSURANCE = 385_000;

/** The T-12's collected rent and its vacancy loss (the statement below
 *  carries both), and the rent roll's units and those occupied (its summary
 *  below): the two ways the building's vacancy is said. */
const T12_COLLECTED = 6_499_500;
const T12_VACANCY_LOSS = 650_500;
const ROLL_UNITS = 248;
const ROLL_OCCUPIED_UNITS = 225;

/** The building's vacancy today, said the two ways the documents state it,
 *  never one for the other: `inPlace` is the T-12's vacancy loss over gross
 *  potential rent — the building's operating figure, and the 9.1% the
 *  derived model runs (lib/sample-derive: the rent roll's 90.9% occupancy by
 *  area, the same figure) — and `unitsPct` the rent roll's units empty, by
 *  count, the 9.3% the stress test's vacancy row shows as today's gap. The
 *  T-12's figure is a trailing year's, so the prose says it over the
 *  trailing twelve months, never as today's; "today" is the rent roll's.
 *  The stabilized 6% is the OM's: the prose sets it against a rule of thumb
 *  only, since the stress test reads today's published vacancy on its own. */
const VACANCY = {
  inPlace: `${((T12_VACANCY_LOSS / (T12_COLLECTED + T12_VACANCY_LOSS)) * 100).toFixed(1)}%`,
  unitsEmpty: ROLL_UNITS - ROLL_OCCUPIED_UNITS,
  units: ROLL_UNITS,
  unitsPct: `${(((ROLL_UNITS - ROLL_OCCUPIED_UNITS) / ROLL_UNITS) * 100).toFixed(1)}%`,
};

const dollarsOf = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The memorandum's tax bill re-struck on its price at the rate its own two
 *  stated figures imply — the stress test's taxes row's arithmetic
 *  (lib/stress-test), said here by the challenger and the verdict. It is
 *  conditional, as the row is: the bill if the sale resets the assessment
 *  to the price, never a claim about what the city does. */
const TAX = (() => {
  const billRow = memoFact("Real estate taxes (2026)");
  const bill = numberOf(billRow.value);
  const assessed = numberOf(memoFact("Assessed value (2026)").value);
  const price = numberOf(memoFact("Asking price").value);
  const reset = Math.round((bill / assessed) * price);
  return { bill, assessed, price, ratePct: (bill / assessed) * 100, reset, more: reset - bill, page: billRow.page };
})();

/** The program's premium as priced and as achieved (p. 25). */
const PREMIUM = (() => {
  const row = memoFact("Renovation premium");
  return {
    priced: numberOf(row.value),
    achieved: numberOf(memoFact("Achieved renovation premium").value),
    done: numberOf(memoFact("Units renovated").value),
    page: row.page,
  };
})();

/** The pro forma's insurance against the T-12's. */
const INSURANCE = (() => {
  const row = memoFact("Insurance (pro forma)");
  return { proForma: numberOf(row.value), page: row.page };
})();

/** The pro forma's rent over the in-place rent (p. 12). */
const RENT_JUMP = (() => {
  const inPlace = numberOf(memoFact("Avg in-place rent").value);
  const proForma = numberOf(memoFact("Pro forma rent").value);
  return { inPlace, proForma, pct: ((proForma - inPlace) / inPlace) * 100 };
})();

const challenges: ChallengerResult = {
  challenges: [
    {
      assumption: "Exit cap compression to 5.25%",
      severity: "high",
      challenge:
        "The OM's pro forma exits 20 bps tighter than going-in and states no thesis for the compression.",
      question:
        "What thesis supports buying at a 5.45% cap and selling five years later at 5.25%?",
    },
    {
      assumption: `${dollarsOf(PREMIUM.priced)}/mo renovation premium`,
      severity: "high",
      challenge:
        `Pro forma rents jump ${RENT_JUMP.pct.toFixed(1)}%, ${dollarsOf(RENT_JUMP.inPlace)} to ${dollarsOf(RENT_JUMP.proForma)}, on a program priced at ${dollarsOf(PREMIUM.priced)} a month more a door, while the ${PREMIUM.done} doors already renovated achieve ${dollarsOf(PREMIUM.achieved)} (${PREMIUM.page}).`,
      question: `Which leases on the ${PREMIUM.done} renovated doors make the ${dollarsOf(PREMIUM.achieved)}, and which renovated comps achieved ${dollarsOf(PREMIUM.priced)} at this basis?`,
    },
    {
      assumption: "Real estate taxes carried at the seller's bill",
      severity: "high",
      challenge:
        `The pro forma carries the seller's 2026 bill, ${dollarsOf(TAX.bill)} on ${withArticle(`${compactUsd(TAX.assessed, { trim: true })} assessment`)} (${TAX.page}), ${TAX.ratePct.toFixed(2)}% of it. Struck at that rate on the ${compactUsd(TAX.price, { trim: true })} price, the bill is ${dollarsOf(TAX.reset)} a year if the sale resets the assessment, ${dollarsOf(TAX.more)} more.`,
      question: `What bill does the seller expect once the ${compactUsd(TAX.price, { trim: true })} sale reaches the assessor, and is the 2026 assessment under appeal?`,
      key: "taxes",
      page: TAX.page,
      omFigure: TAX.bill,
      altFigure: TAX.reset,
      altBasis: "the memorandum's own bill over its assessed value, struck on the price",
    },
    {
      assumption: "6% stabilized vacancy",
      severity: "medium",
      challenge: `The building ran ${VACANCY.inPlace} vacant over the trailing twelve months (T-12), with ${VACANCY.unitsEmpty} of ${VACANCY.units} units empty on the rent roll today; the 6% stabilized figure assumes a lease-up the OM never schedules.`,
      question: `What's the absorption schedule to get from ${VACANCY.inPlace} to 6%?`,
    },
    {
      assumption: `Insurance at ${dollarsOf(INSURANCE.proForma)}`,
      severity: "medium",
      challenge: `The pro forma carries insurance at ${dollarsOf(INSURANCE.proForma)} (${INSURANCE.page}), ${dollarsOf(T12_INSURANCE - INSURANCE.proForma)} under the ${dollarsOf(T12_INSURANCE)} the T-12 shows; a new owner's quote, not the building's history, sets the line.`,
      question: `Is ${dollarsOf(INSURANCE.proForma)} a quote bound for a new owner, and on what limits and deductibles?`,
      key: "insurance",
      page: INSURANCE.page,
      omFigure: INSURANCE.proForma,
      altFigure: T12_INSURANCE,
      altBasis: "the T-12's insurance line",
    },
  ],
  // The challenger's downside scenario, in words: which of its three
  // challenges break together, and no return figure — the returns are
  // re-run in code by the stress test (lib/sample-stress), and a figure
  // here had been the first-draft model's, beside the engine's other
  // figures for the same levers (2026-10-20).
  stressTest:
    `The three assumptions fail together. The 6% vacancy needs a lease-up from the ${VACANCY.inPlace} the building ran over the trailing twelve months (T-12) that the OM never schedules,` +
    " and the $200 premium arrives only as renovated units lease, so a slow lease-up delays both and leaves less income in year five. That smaller income is what the 5.25% exit capitalises, and a buyer five years out has no stated reason to pay a tighter cap than today's 5.45%.",
};

/** The ask a unit over each of the two sale comps graded `supports` (p. 14),
 *  The Brixton's $252k and Parkside's $261k, in percent to one place. Two
 *  comps are too few for a median, so the stress test's price row strikes
 *  no figure on them and stands unchecked (lib/sample-figures.test.ts). */
const askOver = (perUnit: number) => ((TAX.price / numberOf(memoFact("Units").value) / perUnit - 1) * 100).toFixed(1);
const CLEAN_COMP_GAP_PCT = { brixton: askOver(252_000), parkside: askOver(261_000) } as const;

// The memorandum's three sale comps sit on its p. 14, the page the
// verdict's basis range cites for the $252k and $261k trades.
const comps: BrokerCompsResult = {
  saleComps: [
    {
      name: "The Brixton — 2.1 mi",
      detail: "$252k/unit · 5.6% cap · Q3'25",
      support: "supports",
      note: "Comparable vintage and submarket; supports a sub-$260k basis.",
      page: "p. 14",
    },
    {
      name: "Vue at Girard — 4.0 mi",
      detail: "$298k/unit · 4.9% cap · Q1'25",
      support: "stretched",
      note: "Newer, amenitized asset in a stronger submarket — not a clean comp.",
      page: "p. 14",
    },
    {
      name: "Parkside — 1.4 mi",
      detail: "$261k/unit · 5.4% cap · Q4'25",
      // Graded by comparability, never by its price against the ask or
      // another comp (the review of 2026-10-23: it had been left out for
      // trading richer than The Brixton, grading by direction): the closest
      // and the newest of the three, so it supports. Every fact here is the
      // memorandum's own (p. 14).
      support: "supports",
      note: "Closest by distance (1.4 mi) and the newest trade (Q4'25) — the most comparable of the three.",
      page: "p. 14",
    },
  ],
  leaseComps: [
    {
      name: "The Brixton (renovated)",
      detail: "$2,520/mo · 2BR",
      support: "favorable",
      note: "Renovated units clear $2,520 — below the $2,600 pro forma.",
    },
  ],
  redFlags: [
    "One of three sale comps, Vue at Girard, is a newer asset in a stronger submarket, inflating the implied basis.",
    // No trade the memorandum does not itself state is named: the set's
    // gap is read off its own dates (Q1'25 to Q4'25, p. 14).
    "The newest of the three trades is Q4'25: the set states no 2026 sale.",
  ],
  // The ask against the two comps graded `supports`: two trades, too few for
  // a median, so the stress test's price row strikes no verdict on them
  // (lib/sample-figures.test.ts holds the shares to the comps' figures).
  summary: `The comp set leans on its strongest trade — sell-side selections usually do. The $274k ask is ${CLEAN_COMP_GAP_PCT.brixton}% over The Brixton's $252k a unit and ${CLEAN_COMP_GAP_PCT.parkside}% over Parkside's $261k, the two comps graded clean: two trades, too few for a median.`,
};

/** The OM's stabilized vacancy (its p. 8 row), against which the first-draft
 *  model's 9.0% is the reconciliation's 300 bps. */
const OM_VACANCY_PCT = 6;
/** What the first-draft model's vacancy over the OM's costs on its own rent
 *  line: 300 bps of $7.15M, $214,500 — more than the whole $173,500 NOI gap.
 *  The OM states no expense total, so the gap is never laid on an expense
 *  load it does not state (an investor's walkthrough, 2026-10-20: the row
 *  had said "heavier expense load"); lib/sample-figures.test.ts holds the
 *  sentence to these figures. */
const VACANCY_GAP_USD = ((inputs.vacancyPct - OM_VACANCY_PCT) / 100) * inputs.year1Gpr;
const VACANCY_GAP_WORDS = `${Math.round((inputs.vacancyPct - OM_VACANCY_PCT) * 100)} bps more vacancy, ${dollarsOf(VACANCY_GAP_USD)} on ${compactUsd(inputs.year1Gpr, { millions: 2 })} of rent`;

const reconciliation: ReconciliationResult = {
  // The sample's "your model" is the first-draft model built from its
  // documents, said so on every surface (lib/reconciliation-words).
  against: "first_draft",
  rows: [
    {
      metric: "Year-1 NOI",
      omValue: "$3,880,000",
      myValue: "$3,706,500",
      gap: `${compactUsd(NOI_GAP)} below the OM — the ${VACANCY_GAP_WORDS}, more than covers it`,
      direction: "unfavorable",
    },
    {
      metric: "Vacancy",
      omValue: "6.0%",
      myValue: "9.0%",
      // "Your model" is the first-draft model, which runs 9.0%; the
      // building's own figure is the T-12's, a trailing year's.
      gap: `300 bps higher, in line with the T-12's trailing ${VACANCY.inPlace}`,
      direction: "unfavorable",
    },
    {
      metric: "Going-in cap",
      omValue: "5.45%",
      myValue: "5.45%",
      gap: "In agreement",
      direction: "neutral",
    },
  ],
  takeaway: `The first-draft model lands ~${compactUsd(NOI_GAP)} light on NOI, roughly ${bpsFrom(irrWith({ year1Opex: inputs.year1Opex - NOI_GAP }))} of IRR versus the OM: its ${VACANCY_GAP_WORDS} more than covers the gap, and the OM states no expense total to set the rest against.`,
};

const market: MarketResult = {
  checks: [
    {
      assumption: "Exit cap 5.25%",
      omSays: "5.25%",
      typicalRange: "5.25–5.75%",
      assessment: "aggressive",
      note: "At the tight end of the range with no compression catalyst.",
    },
    // The stored check is fixed prose, so it reads each assumption against a
    // rule of thumb alone and says so. Which published figure the 4.0% is
    // held to, and how that comes out, is the stress test's to decide from
    // today's feeds (lib/rent-growth-decider: Zillow's apartment rents
    // first); a fixed sentence never states that verdict
    // (lib/sample-stress.test.ts fails on one that does).
    {
      assumption: "Rent growth 4.0%/yr",
      omSays: "4.0%",
      typicalRange: "2.5–3.5%",
      assessment: "aggressive",
      note: "Above the top of a rule of thumb for apartment rent growth, not a published figure; the stress test is where the 4.0% is held to a published rent figure, when today's read has one.",
    },
    {
      assumption: "Vacancy 6%",
      omSays: "6.0%",
      typicalRange: "5–7%",
      assessment: "in-line",
      // The range is the market check's rule of thumb, never the stress
      // test's verdict: the stress test holds the 6% to the
      // market's published vacancy as a floor for the pro forma's vacancy
      // line (dollars, never below the doors empty), else the class's norm —
      // never to the T-12 or the rent roll, the building today
      // (lib/sample-stress.test.ts).
      note: `Inside the market check's rule-of-thumb range for a stabilized building, not a published figure — but the building ran ${VACANCY.inPlace} vacant over the trailing twelve months (T-12) and has to lease up to it; the stress test is where the 6%, the pro forma's vacancy line, is held to the market's published vacancy as a floor, else the class's norm, never to today's documents.`,
    },
  ],
  summary:
    "Against the market check's rules of thumb, the exit cap and rent growth sit at or beyond the aggressive end; stabilized vacancy sits inside the check's range, a rule of thumb the stress test does not rest on.",
};

const verdict: VerdictResult = {
  verdict: "caution",
  reason:
    // What the documents say, never a verdict a live feed decides: the ask
    // over both clean comps, the OM's exit tighter than its own caps, and
    // the premium its pro forma rents carry past what the renovated doors
    // achieve. The premium is in none of the model's returns (the model
    // grows today's rent at one rate), so it is said of the rents.
    `The ask sits over both clean comps, the OM exits under its own pro forma cap, and the pro forma's rents lean on an unproven ${dollarsOf(PREMIUM.priced)} premium. Worth a closer look only if the seller moves on price or the premium is proven.`,
  topRisks: [
    "Exit cap of 5.25% sits 45 bps inside the OM's own 5.70% pro forma cap and 20 bps inside its 5.45% going-in cap.",
    // A condition, as the stress test's taxes row says it: whether the sale
    // resets the assessment is the jurisdiction's to say.
    `If the sale resets the assessment to the ${compactUsd(TAX.price, { trim: true })} price, the seller's ${dollarsOf(TAX.bill)} tax bill is ${dollarsOf(TAX.reset)} a year.`,
    `Pro forma rents assume ${withArticle(`${dollarsOf(PREMIUM.priced)}/mo premium`)}; the ${PREMIUM.done} renovated doors achieve ${dollarsOf(PREMIUM.achieved)}.`,
    `The 6% stabilized vacancy is a typical stabilized figure; the building ran ${VACANCY.inPlace} vacant over the trailing twelve months (T-12), and no lease-up is scheduled.`,
  ],
  nextSteps: [
    "Pull three renovated-comp leases to test the rent premium.",
    `Get the seller's lease-up plan from the T-12's ${VACANCY.inPlace} vacancy to the 6% stabilized.`,
    "Get the seller's post-sale tax estimate and an insurance quote bound for a new owner.",
  ],
  screen: {
    ranges: [
      {
        label: "Market rent / unit / mo",
        low: "$2,400",
        base: "$2,480",
        high: "$2,600",
        source: "Rent roll and one lease comp ($2,520)",
        basis: "Low = in-place renewals; high = the OM's renovated pro forma.",
        confidence: "medium",
      },
      {
        label: "Vacancy",
        // The base is the building's operating figure, the T-12's (the 9.1%
        // the model runs); the high, the rent roll's units empty, by count;
        // the low, the OM's stabilized figure.
        low: "6.0%",
        base: VACANCY.inPlace,
        high: VACANCY.unitsPct,
        source: "T-12 (base) and rent roll (high) vs. OM",
        basis: "Base is the T-12's trailing year; low assumes a completed lease-up to a typical stabilized figure.",
        confidence: "high",
      },
      {
        label: "Exit cap",
        // The base is the exit the model runs, the going-in cap (lib/sample-
        // derive, the stress test's re-run): no compression.
        low: "5.25%",
        base: `${SAMPLE_EXIT_RERUN.goingInExitPct.toFixed(2)}%`,
        high: "5.75%",
        source: "Rule of thumb; model at going-in cap",
        basis: "Base holds the exit at the going-in cap; high reflects a softer exit.",
        confidence: "medium",
      },
      {
        label: "Basis / unit",
        // The low and the high are the two sale comps graded clean (p. 14);
        // two trades are too few for a median, so the stress test's price
        // row strikes no verdict on them. Never a trade the memorandum does
        // not state.
        low: "$252k",
        base: "$261k",
        high: "$261k",
        source: "Trades $252k and $261k, both clean (p. 14)",
        basis: `The $274k ask sits ${CLEAN_COMP_GAP_PCT.parkside}% over the closer, newer clean comp and ${CLEAN_COMP_GAP_PCT.brixton}% over the other, with no renovation premium yet.`,
        confidence: "medium",
      },
    ],
    dealKillers: [
      {
        lever: "basis",
        read: "Buying at ~$274k/unit — above both clean comps.",
        risk: "No renovation premium yet justifies the spread.",
      },
      {
        lever: "exit",
        read: "Underwritten at a 5.25% exit, inside going-in.",
        // The stress test's own figures (its exit-cap row), never the
        // first-draft model's: the first cut quoted "roughly 180 bps" off
        // that model at a 5.50% exit, beside a stress test whose engine
        // moves 10.8% to 7.4% at the pro forma cap that decides the row.
        // Short enough for the one-page memo's card (72 characters).
        risk: `At the ${SAMPLE_EXIT_RERUN.proFormaExitPct.toFixed(2)}% pro forma cap, the stress test's IRR falls ${SAMPLE_EXIT_RERUN.omIrrPct.toFixed(1)}% to ${SAMPLE_EXIT_RERUN.proFormaIrrPct.toFixed(1)}%.`,
      },
      {
        lever: "debt",
        // What the documents' model runs (lib/sample-derive): it amortizes
        // over 30 years from the first month, so no interest-only year
        // (research pass 35: the read said "with one year of IO"). And it
        // sizes the loan at 60% of cost, its default, never 60% of value:
        // the demo report's base case says "Loan … · 60% of cost" beside
        // this line (audit C3a, LOW-13), and a test holds both to the model.
        // The memorandum's own 60% is a loan-to-value (p. 44), a different
        // measure that happens to share the figure, so the line names each
        // by its own (the memo's card holds 72 characters).
        read: "Model: 60% of cost at 6.0%, 30-yr amortizing; the OM: 60% LTV, p. 44.",
        risk: "A soft refi window or higher rate pressures the takeout.",
      },
    ],
    sensitivity: [
      // One set, in order. The conservative case is worse than the model's
      // own: a softer exit or a tax reset each lowers the levered IRR from
      // it (a direction, no figure the engine has not run). The base IS the
      // model's own case — the exit at the going-in cap and the T-12's
      // vacancy (lib/sample-derive), its levered IRR the engine's on the
      // model as it runs (SAMPLE_EXIT_RERUN.goingInIrrPct). The sponsor's is the OM's exit with the premium proven,
      // which the model's returns carry neither of.
      {
        scenario: "conservative",
        call: "pass_on",
        note: `A softer exit toward 5.75% or a tax reset on the sale takes the levered IRR under the model's ${SAMPLE_EXIT_RERUN.goingInIrrPct.toFixed(1)}%.`,
      },
      {
        scenario: "base",
        call: "caution",
        note: `The model's own case, ${withArticle(`${SAMPLE_EXIT_RERUN.goingInExitPct.toFixed(2)}% exit`)} and the T-12's ${VACANCY.inPlace} vacancy, is ${withArticle(`${SAMPLE_EXIT_RERUN.goingInIrrPct.toFixed(1)}% levered IRR`)}; it pencils only if the seller moves on price.`,
      },
      {
        scenario: "sponsor",
        call: "pass",
        note: `If the OM's 5.25% exit holds and the ${dollarsOf(PREMIUM.priced)} premium is proven, the deal works; the model's returns carry neither.`,
      },
    ],
  },
};

// ---- Property actuals (Feature 1 on the sample) ----------------------------
// Consistent by construction with the reconciliation above: the T-12's NOI is
// the $3,706,500 the reconciler chose over the OM's $3,880,000 pro forma, and
// the rent roll's 9.1% in-place vacancy is the figure that beat the OM's 6%.

const rentRollExtraction: RentRollExtraction = {
  asOfDate: "2026-05-31",
  // Representative rows only — the summary below reflects the full 248-unit
  // roll (truncated: true says "not every row is reproduced here").
  rows: [
    { tenant: "Unit 101", suiteUnit: "101", sf: 745, leaseExpiry: "2026-11-30", inPlaceRentMonthly: 1795, rentPsf: null, occupied: true, freeRentMonths: null, tiPsf: null, page: "roll p.1" },
    { tenant: "Unit 108", suiteUnit: "108", sf: 745, leaseExpiry: "", inPlaceRentMonthly: null, rentPsf: null, occupied: false, freeRentMonths: null, tiPsf: null, page: "roll p.1" },
    { tenant: "Unit 214", suiteUnit: "214", sf: 890, leaseExpiry: "2027-02-28", inPlaceRentMonthly: 2140, rentPsf: null, occupied: true, freeRentMonths: 1, tiPsf: null, page: "roll p.2" },
    { tenant: "Unit 220", suiteUnit: "220", sf: 890, leaseExpiry: "2026-08-31", inPlaceRentMonthly: 2085, rentPsf: null, occupied: true, freeRentMonths: null, tiPsf: null, page: "roll p.2" },
    { tenant: "Unit 305", suiteUnit: "305", sf: 1080, leaseExpiry: "2026-09-30", inPlaceRentMonthly: 2560, rentPsf: null, occupied: true, freeRentMonths: null, tiPsf: null, page: "roll p.3" },
    { tenant: "Unit 312", suiteUnit: "312", sf: 1080, leaseExpiry: "", inPlaceRentMonthly: null, rentPsf: null, occupied: false, freeRentMonths: null, tiPsf: null, page: "roll p.3" },
  ],
  truncated: true,
  page: "roll p.1–6",
};

const ROLL_OCCUPIED_SF = 200_635;
const ROLL_RENT_PSF = 32.4;

const rentRollSummary: RentRollSummary = {
  unitCount: ROLL_UNITS,
  occupiedUnits: ROLL_OCCUPIED_UNITS,
  totalSf: 220_720,
  occupiedSf: ROLL_OCCUPIED_SF,
  sfWeightedOccupancy: 0.909,
  waltYears: 0.6,
  weightedAvgRentPsf: ROLL_RENT_PSF,
  // The same rent said per unit a month, from the figures above: the rent
  // per SF a year over the occupied SF, ÷ 12, over the occupied units — the
  // memorandum's "$2,400/mo" in-place rent, and the T-12's collected rent
  // over the same units.
  avgRentMonthly: (ROLL_RENT_PSF * ROLL_OCCUPIED_SF) / 12 / ROLL_OCCUPIED_UNITS,
  rentUnits: ROLL_OCCUPIED_UNITS,
  expiryBuckets: { next12mo: 0.78, y1to3: 0.22, y3to5: 0, y5plus: 0 },
  expiryCoveredSf: 196_400,
  truncated: false,
  asOfUsed: "2026-05-31",
};

const t12Extraction: T12Extraction = {
  periodEndDate: "2026-05-31",
  collectedRent: T12_COLLECTED,
  vacancyLoss: T12_VACANCY_LOSS,
  otherIncome: 292_000,
  egi: 6_791_500,
  // The tax line is the memorandum's 2026 bill (p. 27), $727,896 on a
  // $52,000,000 assessment; the lines still sum to the $3,085,000 the NOI
  // and the model's expense load are struck on.
  opex: [
    { key: "taxes", label: "Real estate taxes", amount: 727_896, page: "T-12 p.1" },
    { key: "insurance", label: "Insurance", amount: T12_INSURANCE, page: "T-12 p.1" },
    { key: "utilities", label: "Electric & gas", amount: 285_000, page: "T-12 p.1" },
    { key: "water", label: "Water & sewer", amount: 250_000, page: "T-12 p.1" },
    { key: "rm", label: "Repairs & maintenance", amount: 420_000, page: "T-12 p.1" },
    { key: "turnover", label: "Turnover & make-ready", amount: 160_000, page: "T-12 p.1" },
    { key: "contract", label: "Contract services", amount: 122_104, page: "T-12 p.2" },
    { key: "payroll", label: "Payroll", amount: 470_000, page: "T-12 p.2" },
    { key: "mgmt", label: "Management fee", amount: 205_000, page: "T-12 p.2" },
    { key: "admin", label: "Marketing & admin", amount: 60_000, page: "T-12 p.2" },
  ],
  totalOpex: 3_085_000,
  noi: 3_706_500,
  page: "T-12 p.1–2",
};

const t12Summary: T12Summary = {
  collectedRent: T12_COLLECTED,
  vacancyLoss: T12_VACANCY_LOSS,
  otherIncome: 292_000,
  egi: 6_791_500,
  opex: t12Extraction.opex,
  totalOpex: 3_085_000,
  noi: 3_706_500,
  noiDerived: false,
};

// ---- The sample's lower half: Ask, tasks and a note ------------------------
// A new reader opened the sample onto a row of empty states — no tasks, no
// questions, nothing logged (signed-in gaps, H7) — so the panels a deal
// grows into never showed. These are seeded beside the row, and every word
// of them is read off the fixture above: each Ask answer quotes the
// fictional memorandum's own facts and cites only the pages those facts
// carry (inside its `totalPages`), each figure it works out is worked out
// here from them, and each answer says it is the sample memorandum's. None
// carries a person: no asker, no author id, no creator — they are the
// sample's, and lib/sample-deal.test.ts holds them to all of it.

/** Who the seeded note is by: the sample, never a person (defined beside
 *  the rule for who may remove a note, lib/note-remove: the sample's reader
 *  may remove this one). */
export { SAMPLE_AUTHOR };

/** One of the memorandum's stated facts, by its label: its value and page. */
function memoFact(label: string): { value: string; page: string } {
  const m = extraction.metrics.find((x) => x.label === label);
  if (!m?.page) throw new Error(`sample fixture: no "${label}" with a page`);
  return { value: m.value, page: m.page };
}

/** The first number in a fact's value ("$2,400/mo" → 2400, "5.45%" → 5.45). */
function numberOf(value: string): number {
  const m = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!m) throw new Error(`sample fixture: no figure in "${value}"`);
  return Number(m[0]);
}

/** The sample's three questions of its fictional memorandum, each answered
 *  from the facts it states and citing the pages it states them on. */
function sampleAsk(at: string): AskEntry[] {
  const exit = memoFact("Exit cap");
  const entry = memoFact("Going-in cap");
  const tighterBps = Math.round((numberOf(entry.value) - numberOf(exit.value)) * 100);

  const inPlace = memoFact("Avg in-place rent");
  const proForma = memoFact("Pro forma rent");
  const growth = memoFact("Rent growth");
  const premium = numberOf(proForma.value) - numberOf(inPlace.value);
  const premiumPct = ((premium / numberOf(inPlace.value)) * 100).toFixed(1);

  const price = memoFact("Asking price");
  const units = memoFact("Units");
  const perUnit = compactUsd(numberOf(price.value) / numberOf(units.value));
  const compPage = comps.saleComps[0].page ?? "";
  const compWords = comps.saleComps.map((c) => {
    const [basis, cap, when] = c.detail.split(" · ");
    return `${c.name.split(" — ")[0]} at ${basis} and ${withArticle(cap)} (${when})`;
  });

  return [
    {
      at,
      q: "What exit cap does the memorandum sell at, against the cap it buys at?",
      answer:
        `The sample's fictional memorandum sells at ${withArticle(exit.value)} exit cap (${exit.page}) and buys at ` +
        `${withArticle(entry.value)} going-in cap (${entry.page}): it sells ${tighterBps} bps tighter than it buys, ` +
        "and states no reason for the compression.",
      cites: [
        { page: exit.page, note: "Exit cap" },
        { page: entry.page, note: "Going-in cap" },
      ],
    },
    {
      at,
      q: "How far above the in-place rents are the pro forma rents?",
      answer:
        `The sample's fictional memorandum states an average in-place rent of ${inPlace.value} and a pro forma ` +
        `rent of ${proForma.value} (${proForma.page}): a $${premium.toLocaleString("en-US")} premium a month, ` +
        `${premiumPct}% over in-place. It then grows rents ${growth.value} (${growth.page}).`,
      cites: [
        { page: proForma.page, note: "In-place and pro forma rents" },
        { page: growth.page, note: "Rent growth" },
      ],
    },
    {
      at,
      q: "Which sale comps does the memorandum cite, and what is the ask a unit?",
      answer:
        `The sample's fictional memorandum cites three sale comps (${compPage}): ${compWords[0]}, ${compWords[1]}, ` +
        `and ${compWords[2]}. Its ${price.value} ask for ${units.value} units (${price.page}) is ${perUnit} a unit.`,
      cites: [
        { page: compPage, note: "Sale comps" },
        { page: price.page, note: "Asking price and units" },
      ],
    },
  ];
}

/**
 * What the sample deal's lower half is seeded with when the reader adds it
 * (deals/actions `createSampleDeal`), stamped at `at`, the moment it is
 * added: the three Ask answers, the verdict's next steps as tasks (marked
 * from the verdict, created by no one, assigned to no one) and one note in
 * the decision log, by the sample.
 */
export function sampleWork(at: string): {
  qa: AskEntry[];
  notes: DealNote[];
  tasks: { title: string; source: "verdict" }[];
} {
  return {
    qa: sampleAsk(at),
    notes: [{ at, by: SAMPLE_AUTHOR, text: `Held at Caution. ${verdict.reason}` }],
    tasks: verdict.nextSteps.map((s) => ({ title: normalizeTaskTitle(s), source: "verdict" as const })),
  };
}

/** The full seed payload for a sample deal row. */
export const SAMPLE_DEAL = {
  name: SAMPLE_DEAL_NAME,
  asset_class: "multifamily",
  /** Neighborhood-level placement — deliberately NOT a street address. The
   *  building is fictional; the submarket is real, so the jurisdiction-level
   *  features (regulation check, recorded-sales pull around the neighborhood
   *  centroid) run on real Philadelphia data while the deal stays labeled
   *  illustrative. Never sharpen this to a street address. */
  address: {
    label: "Brewerytown, Philadelphia, PA",
    street: "",
    city: "Philadelphia",
    state: "PA",
    zip: "",
    county: "Philadelphia County",
    submarket: "Brewerytown",
  },
  extraction,
  challenges,
  comps,
  reconciliation,
  market,
  verdict,
  model,
  /** deal_rent_rolls / deal_t12_statements seed rows (best-effort insert) */
  rentRoll: {
    as_of_date: "2026-05-31",
    extraction: rentRollExtraction,
    summary: rentRollSummary,
  },
  t12: {
    period_end_date: "2026-05-31",
    extraction: t12Extraction,
    summary: t12Summary,
  },
} as const;
