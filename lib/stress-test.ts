// The stress test (2026-10-19, the refocus): each assumption the memorandum
// makes, set against the best evidence the screen holds for THIS deal, the
// gap struck in the assumption's own unit, and what the gap does to the
// return — the engine run again with ONE input swapped for the evidence's,
// in code, never by the model. Pure: no I/O, no model call. It reads only
// what the page already has — the extraction, the stored challenger and
// market results, the model-vs-market read (whose dated published figures
// it reuses, never re-reads), the actuals, the derived model and the
// memorandum's own comps — and attaches evidence only where a figure or
// words exist. The contract is lib/stress-test-types; STRESS_METHODS there
// says what each row is set against, and lib/stress-test.test.ts holds every
// sentence of it to a label this file emits.
//
// Its rules:
//   - the OM's figure is the OM's: `omSays` is read off the extraction's
//     rows through the site's own readers, with the page validated against
//     the deck's length (lib/facts `locatedPage`), and a figure the OM does
//     not state is null, never the model's default in its place;
//   - evidence is typed, dated and attributed, best first: the deal's own
//     document, then the published figures (the metro's, the state's or the
//     nation's, said so), then the research tracker, then a rule of thumb
//     named as one, then the memorandum contradicting itself;
//   - the gap is signed from the buyer's side: positive means the OM is
//     the more optimistic of the two;
//   - the verdict is code's, from the gap and the thresholds below, and it
//     is struck on ONE figure (the owner's rule of 2026-10-20): the first
//     piece in the row's own order (lib/stress-deciders) that is fresh and
//     may be held to decides, and every other piece is shown beside it,
//     deciding nothing — never the nearest edge of a range the pieces make
//     together, which let the most lenient piece win. `holds` at the
//     deciding figure or on its conservative side (within a survey's
//     margin), `stretched` past it, `unsupported` past it by more than the
//     key's own threshold, `unchecked` where nothing carries a figure;
//   - the impact swaps ONE input of the model, twice: the OM's figure in for
//     the base run and the best evidence's for the alternative, so the move
//     is the gap's own and never the model's (whose growth and exit run at
//     the more cautious of the row's deciding figure and the OM's own,
//     lib/model-evidence, and which borrows at the seed); it is struck only
//     where the model's reads stand
//     (lib/underwrite/report-grid `modelReadsWithheld`), the price buys the
//     building and the deal is no plan deal;
//   - a plan deal (a value-add, lease-up, conversion or development) is
//     judged on its yield on total cost, not a levered return on the price:
//     its rows re-run THAT (`measure: "yield_on_cost"`), the plan's stated
//     stabilized NOI over its total cost (lib/deal-strategy `planSummary`,
//     the one division lib/plan-sensitivity `yieldOnCost`), ONE of the two
//     figures moved by the row's deciding evidence — vacancy through the
//     stabilized gross the OM states where the market's figure or a rule of
//     thumb decides it (a rent roll or T-12 is the building before the plan
//     is done), a tax bill only where the OM states it as its pro forma's
//     line (the reset struck at today's bill over today's assessed value,
//     none on a development, a conversion or a forward purchase), a
//     renovation premium on the doors to renovate, the basis through the
//     total cost — and a row with no yield-on-cost meaning says so
//     (`noRerun`), its verdict unchanged. A figure the plan does not state
//     is never inferred, and a moved figure no plan earns (a stabilized NOI
//     at or under zero, a yield at or past IMPLIED_CAP_CEILING) is struck
//     nowhere: the row says why it has no re-run;
//   - the challenger's words ride beside a row, never in its place: a
//     challenge keyed by the challenger (`Challenge.key`) lands on its row;
//     one stored before the key was asked is matched on its `assumption`
//     text by the keyword table below; the rest become `other` rows.
//
// The thresholds, each named here and read nowhere else:
//   vacancy          VACANCY_UNSUPPORTED_PTS   3 pts past the deciding figure
//                    (a stabilized assumption counted by doors: the
//                    market's figure, past the survey's margin, else the
//                    class's norm — never today's rent roll; an economic
//                    one, a pro forma's vacancy line among them: the T-12)
//   rent growth      RENT_GROWTH_UNSUPPORTED_PTS 2 pts (200 bps) over the
//                    trailing year's figure for the deal's own kind of rent
//                    (lib/rent-growth-decider)
//   expense growth   EXPENSE_GROWTH_UNSUPPORTED_PTS 1.5 pts under all-items
//                    CPI (core CPI only where all-items is not fresh)
//   exit cap         EXIT_CAP_UNSUPPORTED_BPS  25 bps tighter than the
//                    higher of the going-in cap and the OM's own pro forma
//                    cap (else the tracker cap range's low end); no
//                    expansion over the hold is added
//   debt             DEBT_UNSUPPORTED_BPS      50 bps under the lender's quote
//                    on file (a term sheet's rate), else under the seeded
//                    rate (stretched at most unless under the bare index)
//   NOI              the actuals card's own bands: inside NOI_IN_LINE_BAND
//                    (5%) holds, past NOI_UNSUPPORTED_SHARE (10%) unsupported
//   taxes            TAX_UNSUPPORTED_SHARE     15% under the reset bill
//   market rent      BASIS_STRETCH_PCT 5% / BASIS_UNSUPPORTED_PCT 15% over
//                    the median of the memorandum's lease comps graded
//                    clean, three or more (MEDIAN_FLOOR), else unchecked
//   opex             the NOI's bands: within NOI_IN_LINE_BAND (5%) under
//                    the T-12's operating expenses (on the OM figure's
//                    footing, less the taxes and insurance it states) holds,
//                    past NOI_UNSUPPORTED_SHARE (10%) unsupported; against
//                    the class's ratio (no T-12 on file) stretched at most
//   insurance        SAME_SHARE (2%) under the seller's own T-12 premium reads
//                    stretched, never more (the T-12's is a floor, not a
//                    quote); at or over it, or with no T-12, unchecked — a
//                    new owner's quote would decide it, and none is on file
//   vacancy measure  a figure counted by doors is never decided by the
//                    T-12's economic loss (dollars), nor an economic one by
//                    a count of doors (lib/stress-deciders `VACANCY_ORDER`)
//   growth history   a growth row's deciding figure is one trailing year;
//                    where the stored history of that series holds two or
//                    more years, the more cautious of the year and their
//                    compound average a year decides — the lower for rent,
//                    the higher for expenses — the other beside it
//                    (`GROWTH_AVERAGE_MIN_YEARS`, `cautiousGrowth`)
//   basis            BASIS_STRETCH_PCT 5% / BASIS_UNSUPPORTED_PCT 15% over
//                    the median of three or more (MEDIAN_FLOOR): the comps
//                    graded clean, else the recorded sales; under three,
//                    unchecked, the comps named beside it with their count
//   premium          PREMIUM_UNSUPPORTED_SHARE 15% over the achieved premium
//   any row          IRR_MOVE_STRETCH_BPS      a re-run that lowers the levered
//                    IRR 100 bps or more never holds (`finishRow`); on a
//                    plan deal YOC_MOVE_STRETCH_PTS, a re-run that lowers
//                    the yield on cost 0.5 points or more
//   tax reset        TAX_RATE_CEILING          a bill over its assessed value
//                    past 5% is a misread or a fractional assessment, and
//                    strikes no reset bill

import type {
  BrokerCompsResult,
  Challenge,
  ChallengerResult,
  ExtractionResult,
  FirstSignal,
  MarketResult,
} from "@/lib/anthropic/types";
import { avgRentOf, type ActualsRead } from "@/lib/actuals/actuals-read";
import { monthlyRentFloor, statedLeaseBasis, statedRent, type LeaseBasis } from "@/lib/lease-comp-rent";
import type { LoanQuote } from "@/lib/loan-quote";
import { NOI_IN_LINE_BAND, pickOmNoi, t12Vacancy, t12VacancyOverWords } from "@/lib/actuals/analyze";
import { withArticle } from "@/lib/article";
import { shownAssetClass } from "@/lib/asset-class";
import { assetClassKey, assetWords, countNoun, rentQuotedMonthly } from "@/lib/asset-words";
import { compFigures, subjectBasis } from "@/lib/comp-detail";
import { findGoingInCap, findMetric, occupancyRow, parsePct, planCountRow, screenYearOf, unitCountFromMetrics, unitCountRow, buildingSfFromMetrics } from "@/lib/criteria";
import { condoUnitsOffered } from "@/lib/condo-units";
import {
  askingPriceOf,
  assessPlausibility,
  basisOutsideBand,
  buildingPriceOf,
  findPricedMetric,
  IMPLIED_CAP_CEILING,
  inferStrategy,
  isOutdoorStorageYard,
  isPlanDeal,
  noiFigures,
  notYetDelivered,
  planSummary,
  planWithBasisChecked,
  RENOVATION_COST_PER_DOOR_ROW,
  RENOVATION_DOORS_ROW,
  type DealStrategy,
  type PlanSummary,
} from "@/lib/deal-strategy";
import { planYieldBase, yieldOnCost } from "@/lib/plan-sensitivity";
import { datedLong, indexName, type DebtIndex, type RateSeed } from "@/lib/debt-index";
import { locatedPage } from "@/lib/facts";
import { interestOf } from "@/lib/interest";
import { periodLabel, publisherTag, treasuryForTerm, type CurveSeed } from "@/lib/live-rates-core";
import { SERIES } from "@/lib/live-rates";
import { floatingRateOf, type FloatingRate } from "@/lib/assumable-debt";
import type { ModelCheck, ModelVsMarket, PublishedFigure } from "@/lib/model-vs-market";
import { compactUsd, parseUsd, statesRange } from "@/lib/money";
import { SIZER_LENDER_TESTS } from "@/lib/sizer-terms";
import { readTaxAbatement, taxBillOf } from "@/lib/tax-abatement";
import { sizeLoan } from "@/lib/tools/deal-math";
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";
import { HOLD_MONTHS, MASTER_LEASE_WORD, basisWithheldOf, classVacancyDefault, type DerivedModel } from "@/lib/underwrite/inputs";
import { modelReadsWithheld } from "@/lib/underwrite/report-grid";
import { MEDIAN_FLOOR, compEvidence, medianLabel } from "@/lib/public-comps/core";
import { achievedPremiumRow, readValueAdd } from "@/lib/value-add";
import { readRoster } from "@/lib/tenant-roster";
import { CPI_RENT_LABEL, CPI_RENT_LAGS, NO_RENT_INDEX, readsNoRentIndex } from "@/lib/rent-growth-decider";
import {
  STRESS_KEYS,
  type StressEvidence,
  type StressImpact,
  type StressKey,
  type StressRow,
  type StressTest,
  type StressVerdict,
  HEADLINE_ASK,
  headlineBasisLeftOut,
  HEADLINE_NOI_LEFT_OUT,
  type StressHeadline,
  type StressAtEvidence,
  type StressKept,
  type PlanYieldInput,
  TAX_RESET_CONDITION,
  TRAILING_YEAR_NOT_FORECAST,
  AVERAGE_NOT_FORECAST,
} from "@/lib/stress-test-types";
import { attributeOverPlayers } from "@/lib/bridge/attribution";
import { evidenceFigureText, evidencePeriod, isoDayOf } from "@/lib/stress-test-words";
import {
  ABATEMENT_LABEL,
  ACHIEVED_PREMIUM_LABEL,
  GOING_IN_CAP_LABEL,
  PRO_FORMA_CAP_LABEL,
  LOAN_QUOTE_LABEL,
  OM_IN_PLACE_NOI_LABEL,
  PAST_SCREENS_PUBLISHER,
  RENT_ROLL_VACANCY_LABEL,
  RESET_BILL_LABEL,
  SALE_COMPS_LABEL,
  SALE_COMPS_SF_LABEL,
  SEEDED_RATE_LABEL,
  SEEDED_RATE_ONLY_LABEL,
  T12_INSURANCE_LABEL,
  T12_NOI_LABEL,
  T12_OPEX_LABEL,
  T12_OPEX_LINES_LABEL,
  T12_TAX_LABEL,
  T12_VACANCY_LABEL,
  basisDecider,
  CLASS_OPEX_LABEL,
  debtDecider,
  exitCapDecider,
  expenseGrowthDecider,
  insuranceDecider,
  marketRentDecider,
  MARKET_RENT_COMPS_LABEL,
  noiDecider,
  opexDecider,
  renovationPremiumDecider,
  rentGrowthDeciding,
  taxesDecider,
  vacancyDecider,
  type DeciderCandidate,
  type DecidingFigure,
} from "@/lib/stress-deciders";

export const VACANCY_UNSUPPORTED_PTS = 3;
export const RENT_GROWTH_UNSUPPORTED_PTS = 2;
export const EXPENSE_GROWTH_UNSUPPORTED_PTS = 1.5;
export const EXIT_CAP_UNSUPPORTED_BPS = 25;
export const DEBT_UNSUPPORTED_BPS = 50;
export const NOI_UNSUPPORTED_SHARE = 0.1;
export const TAX_UNSUPPORTED_SHARE = 0.15;
export const BASIS_STRETCH_PCT = 5;
export const BASIS_UNSUPPORTED_PCT = 15;
export const PREMIUM_UNSUPPORTED_SHARE = 0.15;
/** A re-run that moves the levered IRR down this far never reads "holds". */
export const IRR_MOVE_STRETCH_BPS = 100;
/** A plan deal's equivalent: a re-run that moves the yield on cost down this
 *  many points never reads "holds" — half a point, about a twelfth of a 6%
 *  yield's NOI and a third or more of the spread a plan is built for. */
export const YOC_MOVE_STRETCH_PTS = 0.5;
/** A tax bill over the assessed value it is struck on past this share is
 *  read as no effective rate on market value (a screening ceiling, not a
 *  published figure): the assessment is a fraction of value, or a
 *  figure was misread, so no reset bill is struck on it. */
export const TAX_RATE_CEILING = 0.05;

/** Two percent figures within this are one figure (lib/model-vs-market's own). */
export const SAME = 0.05;
/** A dollar figure within this share of another is the same figure. */
export const SAME_SHARE = 0.02;

/** Recorded sales from public property records, as the page already read
 *  them (lib/public-comps): a median only where the count reaches the
 *  comps page's own floor (`MEDIAN_FLOOR`, 3), which the caller has applied
 *  by handing a median in — and only where the sales are the deal's own
 *  kind of evidence (lib/public-comps/vs-median: not a portfolio, a plan or
 *  land, or another class's sales), which the caller has applied by handing
 *  the set in at all. */
export interface RecordedSalesEvidence {
  count: number;
  medianPerSqft: number | null;
  /** the sales the $/SF median is taken over — those stating an area
   *  (lib/public-comps `RecordCompsStats.perSqftCount`); absent, all of them */
  perSqftCount?: number | null;
  medianPerUnit: number | null;
  providerName: string;
  /** the day the records were read, ISO */
  retrievedAt: string | null;
  href?: string | null;
}

/** The reader's own past screens in the same market and class, each at
 *  its ask (lib/market-memory): the figure every one of them struck on a
 *  memorandum's asking price, never a price anyone paid. */
export interface PastScreensEvidence {
  count: number;
  /** the screens the median is taken over — those that state a basis
   *  (lib/market-memory `Stat.n`); absent, all of them */
  medianCount?: number | null;
  perUnitMedian: number | null;
  perSfMedian: number | null;
  market: string;
}

export interface StressTestArgs {
  extraction: ExtractionResult | null;
  firstSignal?: FirstSignal | null;
  challenger: ChallengerResult | null;
  market: MarketResult | null;
  /** the model's assumptions against the published figures, already read
   *  (lib/model-vs-market `modelVsMarketFor`): its dated figures are the
   *  published evidence here, never re-read */
  modelVsMarket: ModelVsMarket | null;
  actuals: ActualsRead | null;
  derived: DerivedModel | null;
  /** the deal row's own class column — "auto" shows what the deck turned out to be */
  storedAssetClass?: string | null;
  /** the memorandum's own comps (the stored broker-comps step) */
  brokerComps?: BrokerCompsResult | null;
  recordedSales?: RecordedSalesEvidence | null;
  pastScreens?: PastScreensEvidence | null;
  /** why the reader's past screens are not handed in, where a surface's
   *  words reach someone other than the reader (the shared screen, the
   *  verdict's brief): said by name on the basis row, never as none found */
  pastScreensWithheld?: string | null;
  /** the index the derived model's rate was seeded off (lib/debt-index
   *  `debtSeeds`' tenor, the one handed to `deriveUnderwriteInputs`), with
   *  its own date; absent, the index is read back off the seed's note */
  /** the tenor the model was seeded from, where the caller has it; read for
   *  the debt row's evidence, never handed to a model (lib/sample-derive's
   *  guard) */
  indexGiven?: DebtIndex | null;
  /** the lender's quote on file (lib/loan-quote `loanQuoteOf`): a term sheet
   *  the deal holds whose rate its first-draft model carries as a loan's own
   *  paper states it — handed in only where the surface may read the deal's
   *  documents (never the shared screen) */
  loanQuote?: LoanQuote | null;
  /** why no model is handed in, where the surface carries none BY DESIGN
   *  (the shared screen) — said ahead of the default "No model was derived
   *  for this deal", which would read as a failure */
  withheldReason?: string | null;
  /** the sample deal (its row's `is_sample`): its model is pinned, never
   *  seeded from today's figures, and the test says so where the evidence's
   *  case runs a figure the model does not (`StressTest.sample`) */
  sample?: boolean;
  /** ISO day the published figures were read */
  readOn: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

type Row = { label: string; value: string; page?: string };

const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";

// A negative carries the true minus (U+2212), as lib/stress-test-words' own
// `signedPct` writes it ("to \u22120.2%", never "to -0.2%"); one that rounds to
// nothing carries none.
const signedPct = (n: number, places: number) => {
  const t = n.toFixed(places);
  return Number(t) < 0 ? `\u2212${t.slice(1)}%` : `${t.replace(/^-/, "")}%`;
};
const pct1 = (n: number) => signedPct(n, 1);
const pct2 = (n: number) => signedPct(n, 2);
const money = (n: number) => compactUsd(n, { millions: 2, trim: true });
const bps = (n: number) => `${Math.round(Math.abs(n))} bps`;
const pts = (n: number) => `${Math.abs(n).toFixed(1)} point${Math.abs(Math.abs(n) - 1) < 0.05 ? "" : "s"}`;

/** "a, b and c" */
function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "The OM's" → "the OM's"; an acronym ("NOI") keeps its letters. */
const lowerFirst = (s: string) => (s && !/^[A-Z]{2,}\b/.test(s) ? `${s[0].toLowerCase()}${s.slice(1)}` : s);

function pageOf(row: Row | null | undefined, ex: ExtractionResult | null): number | null {
  const count = ex && typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  return locatedPage(row?.page, count);
}

function rowsOf(ex: ExtractionResult | null): Row[] {
  return (Array.isArray(ex?.metrics) ? ex!.metrics : []).filter(isRow);
}

/** A metro figure's scope is the read's grain; a label or publisher that
 *  says national is the nation's. */
function publishedScope(check: ModelCheck, fig: PublishedFigure, grain: ModelVsMarket["grain"]): StressEvidence["scope"] {
  // The CPI's all-items and core figures are the nation's; its rent of
  // primary residence is published for the metro (BLS, via FRED or its own
  // API) and stays the metro's.
  if (check.scope === "national" || /\bnational\b|\(cpi, all items\)|^core cpi\b|breakeven|10-year treasury/i.test(fig.label)) return "nation";
  // The survey's regional vacancy is the Census region's, borrowed by every
  // metro in it (lib/live-rates `regionSeries`): said as the region's.
  if (/census region/i.test(fig.label)) return "region";
  if (/research tracker/i.test(fig.label)) return "metro";
  return grain === "state" ? "state" : "metro";
}

function published(check: ModelCheck, fig: PublishedFigure, grain: ModelVsMarket["grain"]): StressEvidence {
  return {
    kind: "published",
    label: fig.label,
    text: fig.text,
    value: fig.value,
    asOf: fig.asOf,
    publisher: fig.publisher,
    scope: publishedScope(check, fig, grain),
  };
}

const checkOf = (mvm: ModelVsMarket | null, key: ModelCheck["key"]): ModelCheck | null => mvm?.checks.find((c) => c.key === key) ?? null;

/** The survey's margin, read back off the figure's own text ("6.2% ±2.2 pts"). */
function moeOf(fig: PublishedFigure): number | null {
  const m = fig.text.match(/±\s*(\d+(?:\.\d+)?)\s*pts?/);
  return m ? Number(m[1]) : null;
}

type Judged = { gap: NonNullable<StressRow["gap"]>; verdict: StressVerdict };

/**
 * The verdict and the gap for a row, struck on its ONE deciding figure
 * (lib/stress-deciders): never on a range the row's pieces make together,
 * whose nearest edge let the most lenient piece decide. `optimistic` says
 * which way the OM flatters the buyer: "low" (a vacancy, an expense growth,
 * a tax bill, an exit cap — the OM's figure under the evidence is
 * optimistic) or "high" (a rent growth, an NOI, a basis, a premium). At the
 * figure, or on its conservative side, holds; past it by less than
 * `unsupportedPast` is stretched, by more is unsupported. `tolerance` is the
 * margin inside which the OM is at the figure (a survey's margin of error
 * where the deciding figure is the survey's, else a hair).
 */
function judge(
  om: number,
  decider: number,
  optimistic: "low" | "high",
  unit: NonNullable<StressRow["gap"]>["unit"],
  unsupportedPast: number,
  tolerance: number,
  text: (gap: number, best: number) => string,
): Judged {
  const gap = optimistic === "low" ? decider - om : om - decider;
  const beyond = gap - tolerance;
  const verdict: StressVerdict = beyond <= 0 ? "holds" : beyond > unsupportedPast ? "unsupported" : "stretched";
  return { gap: { value: round(gap, unit), unit, text: text(gap, decider) }, verdict };
}

function round(n: number, unit: NonNullable<StressRow["gap"]>["unit"]): number {
  if (unit === "usd") return Math.round(n);
  if (unit === "bps") return Math.round(n);
  return Math.round(n * 10) / 10;
}

// ── The model, run again with one input swapped ──────────────────────────

const pctOrNone = (n: number | null): string => (n == null ? "does not solve" : pct1(n * 100));
// An equity multiple under zero (the sale does not repay the loan) carries
// the true minus too.
const multOrNone = (n: number | null): string => (n == null ? "—" : signedPct(n, 2).replace(/%$/, "x"));

/**
 * The engine on the model's inputs with ONE input replaced, twice: the base
 * run with the OM's figure in that input, the alternative with the
 * evidence's — so the two runs differ in that one input and nothing else,
 * and the move is the gap's own. The model's own figure may be either or
 * neither (its growth and exit run at the figure the row decides by where
 * one is fresh, else the OM's, else a default — lib/model-evidence — and its
 * rate at the seed), so where the model's own figure is a third value the
 * note says what the model itself runs; where the OM's figure IS the
 * evidence's the two runs are one, and the note says so. `omValue`,
 * `altValue` and `modelValue` are the engine's own unit for that input.
 * `words.evidence` names whose figure the alternative is ("the deal's
 * T-12"), and `words.omSide` whose the OM's is where it is not simply "the
 * OM's" (an abated bill against the unabated one).
 */
function runImpact(
  input: keyof UnderwriteInputs,
  baseInputs: UnderwriteInputs,
  altInputs: UnderwriteInputs,
  evidenceIndex: number,
  omValue: number,
  altValue: number,
  modelValue: number,
  words: { what: string; om: string; alt: string; altRun?: string; evidence: string; omSide?: string; model: string },
): StressImpact {
  const base = computeUnderwrite(baseInputs).returns;
  const alt = computeUnderwrite(altInputs).returns;
  const same = Math.abs(altValue - omValue) < 1e-9;
  const omSide = words.omSide ?? "the OM's";
  // A publisher named with its channel ("BLS via FRED") takes no
  // possessive: the figure, then whose it is. A trailing year's change is
  // then said as what the run does with it (`altRun`: "run each year of the
  // hold"), never as a rate a year the publisher states.
  const altFigure = !words.evidence ? words.alt : / via /.test(words.evidence) ? `${words.alt} (${words.evidence})` : `${words.evidence}'s ${words.alt}`;
  const altSaid = words.altRun && !same ? `${altFigure}, ${words.altRun}` : altFigure;
  const modelClause =
    Math.abs(modelValue - omValue) < 1e-9 ? "" : Math.abs(modelValue - altValue) < 1e-9 ? " The model itself already runs at it." : ` The model itself runs ${words.model}.`;
  const note = same
    ? `${omSide[0].toUpperCase()}${omSide.slice(1)} ${words.what}, ${words.om}, is ${altSaid}, so the levered IRR of ${pctOrNone(base.leveredIrrPct)} stands on it.${modelClause}`
    : `If ${words.what} is ${altSaid}, not ${omSide} ${words.om}, the levered IRR moves from ${pctOrNone(base.leveredIrrPct)} to ${pctOrNone(alt.leveredIrrPct)} (${multOrNone(base.leveredEquityMultiple)} to ${multOrNone(alt.leveredEquityMultiple)} equity multiple).${modelClause}`;
  return {
    input,
    evidenceIndex,
    omValue,
    altValue,
    baseIrrPct: base.leveredIrrPct == null ? null : base.leveredIrrPct * 100,
    altIrrPct: alt.leveredIrrPct == null ? null : alt.leveredIrrPct * 100,
    baseMultiple: base.leveredEquityMultiple,
    altMultiple: alt.leveredEquityMultiple,
    note,
  };
}

/** `runImpact` for a percent input: the OM's and the evidence's figures in
 *  percent points, each swapped into the model's inputs on its own. */
function pctImpact(
  derived: DerivedModel,
  input: "vacancyPct" | "rentGrowthPct" | "expenseGrowthPct" | "exitCapPct" | "allInRatePct",
  evidenceIndex: number,
  omPct: number,
  altPct: number,
  words: { what: string; om: string; alt: string; altRun?: string; evidence: string; model: string },
): StressImpact {
  const inputs = derived.inputs;
  return runImpact(input, { ...inputs, [input]: omPct / 100 }, { ...inputs, [input]: altPct / 100 }, evidenceIndex, omPct / 100, altPct / 100, inputs[input], words);
}

/**
 * A growth row's deciding figure as a re-run's note says it: the trailing
 * year's change with its own period ("+1.1% over the year to Aug 2026",
 * lib/stress-test-words `evidencePeriod`), then what the run does with it
 * ("run each year of the hold") — never "1.1%/yr", which reads as a rate a
 * year the publisher states. A figure whose text is no trailing year keeps
 * the rate a year. Words only: the run is the same either way.
 */
function trailingWords(key: "rent_growth" | "expense_growth", e: StressEvidence): { alt: string; altRun?: string } {
  if (e.value == null) return { alt: "not stated" };
  const years = e.label.match(/: average a year over (\d+) years$/)?.[1];
  if (years) return { alt: `${evidenceFigureText(key, e.value)} a year, its ${years}-year compound average`, altRun: "run each year of the hold" };
  if (!/\bover the year\b/.test(e.text)) return { alt: `${pct1(e.value)}/yr` };
  const p = evidencePeriod(e);
  return { alt: `${evidenceFigureText(key, e.value)} over the year${p ? ` to ${p.said}` : ""}`, altRun: "run each year of the hold" };
}

/** The year-1 NOI the model's inputs make, before capital and fees. */
function year1Noi(inputs: UnderwriteInputs): number {
  return computeUnderwrite(inputs).cashFlow[0]?.noi ?? 0;
}

/** The rent line that makes the model's year-1 NOI `target` with every
 *  other input as it stands: EGI = (NOI + opex) / (1 − mgmt), rent =
 *  EGI / (1 − vacancy) − recoveries − other. The engine's own year-1
 *  arithmetic, inverted. */
function rentForNoi(inputs: UnderwriteInputs, target: number): number | null {
  const opex = inputs.expenseLines.reduce((s, l) => s + l.annual, 0);
  const mgmt = 1 - inputs.mgmtFeePct;
  const occupied = 1 - inputs.vacancyPct;
  if (!(mgmt > 0) || !(occupied > 0)) return null;
  const egi = (target + opex) / mgmt;
  const rent = egi / occupied - inputs.expenseRecoveriesAnnual - inputs.otherRevenueAnnual;
  return Number.isFinite(rent) && rent > 0 ? rent : null;
}

// ── The readers of what the OM says ──────────────────────────────────────

const EXIT_CAP_ROW = /\b(?:exit|terminal|reversion(?:ary)?|residual|disposition|sale)\s+cap(?:italization)?(?:\s+rate)?\b/i;
/** The OM's pro forma cap: its stabilized NOI over the price ("Pro forma
 *  cap", "Stabilized cap rate", "Cap rate (pro forma)") — never an exit, a
 *  cap on cost, a yield, a cap at delivery or a later year's. */
const PRO_FORMA_CAP_ROW = /\b(?:pro ?forma|stabili[sz]ed)\b[^,;]*\bcap(?:italization)?\b|\bcap(?:italization)?(?:\s+rate)?\b[^,;]*\b(?:pro ?forma|stabili[sz]ed)\b/i;
const PRO_FORMA_CAP_NOT = /exit|terminal|reversion|residual|disposition|\bsale\b|\bcost\b|yield|deliver|forward|going[- ]?in|in[- ]place|current|actual|t-?12|ttm|trailing|year ?[2-9]|yr\.? ?[2-9]|\bper\b|\bcap\s*ex\b|rate\s+of\s+return/i;
const RENT_GROWTH_ROW = /\b(?:rent|rental|income|revenue|rents?)\s+growth\b|\bgrowth\b[^,;]*\brents?\b/i;
const RENT_GROWTH_NOT = /expense|opex|\bnoi\b|population|job|employment|supply/i;
const EXPENSE_GROWTH_ROW = /\b(?:expense|opex|operating[- ]expense)s?\s+(?:growth|escalation|inflation)\b/i;
// A vacancy row is the OM's allowance: "Vacancy & credit loss: 7.0%" is one,
// and "Vacancy loss: $400,400" is a dollar line, refused by its VALUE, not
// by the word "loss" in its label.
const VACANCY_ROW = /\bvacancy\b/i;
const VACANCY_NOT = /\$|market vacancy|submarket|metro|physical|economic/i;
const VACANCY_VALUE_NOT = /\$/;
const VACANCY_PLAN = /stabili[sz]ed|pro ?forma|underwritten|year ?\d|yr\.? ?\d/i;
// A combined "Taxes & insurance" row is neither line alone: the tax finder
// refuses a label naming insurance, the insurance finder one naming a tax,
// and the T-12 line finders the same (`T12_TAX_NOT`, `T12_INSURANCE_NOT`).
const TAX_BILL_ROW = /\b(?:real\s+estate|property|re)\s+tax(?:es)?\b|^tax(?:es)?\b/i;
const TAX_BILL_NOT = /abat|exempt|pilot|saving|unabated|phase|\brate\b|\bper\b|\/|psf|millage|credit|transfer|recordation|increase|growth|escalat|reassess|insurance/i;
const ASSESSED_ROW = /\bassess(?:ed|ment)\b/i;
const ASSESSED_NOT = /special|ratio|\brate\b|\bper\b|\/|millage|reassess/i;
// The building's premium, never what insurance brings in: a storage
// facility's "Tenant insurance" row is the platform's income (#471), and a
// value whose own words say income is no premium whatever its label.
const INSURANCE_ROW = /\binsurance\b/i;
const INSURANCE_NOT = /mortgage|title|index|deductible|reserve|tenant|income|revenue|proceeds|program|\brate\b|\bper\b|\/|psf|increase|growth|claim|\btax/i;
const INSURANCE_VALUE_NOT = /income|revenue|proceeds|commission/i;
// A premium stated per unit, door, key, bed, room, pad, space or foot, or by
// the month, is not the year's premium for the building ("$1,200/unit",
// "$1,200 per unit", "$32,000/mo", "$650/door"): parsed bare it would read as
// the year's, so the value is refused, as `taxBillOf` refuses a per-unit bill.
const INSURANCE_VALUE_PER =
  /\/\s*(?:unit|door|key|bed|room|pad|space|sf|sq|ft|mo\b|mos\b|month)|\bper\s+(?:unit|door|key|bed|room|pad|space|sf|sq|square|foot|ft|mo\b|month)|\bpsf\b|\bmonthly\b|\b(?:a|each)\s+month\b/i;
/** A T-12 line that is not the real estate tax line: an abatement, payroll
 *  or transfer tax, or a line combined with insurance. Exported for the
 *  track record's own T-12 reader. */
export const T12_TAX_NOT = /abat|payroll|transfer|insurance/i;
/** A T-12 line that is not the property's premium: a mortgage or title
 *  policy, or a line combined with taxes. */
export const T12_INSURANCE_NOT = /mortgage|title|\btax/i;
// The acquisition loan's rate, never another loan's: a "Note rate" is the
// note being sold (lib/note-yield's row), an existing, in-place or current
// loan's is the seller's, and a balance's row is no rate at all.
const DEBT_RATE_ROW = /\b(?:interest|loan|all[- ]in|mortgage|debt|financing)\s+rate\b|\bcoupon\b|^rate$/i;
const DEBT_RATE_NOT = /assumable|seller|existing|in[- ]place|current|\bnote\b|unpaid|\bupb\b|\bcap\b|strike|floor|exit|tax|growth|vacancy|occupancy|ground|lease|escalat|increase|supplemental|mezz/i;

function statedPct(rows: Row[], re: RegExp, not?: RegExp): { row: Row; pct: number } | null {
  const row = findMetric(rows, re, not);
  const pct = row ? parsePct(row.value) : null;
  return row && pct != null && Number.isFinite(pct) ? { row, pct } : null;
}

/** A loan-to-value row and a loan-to-cost row: two measures, never one —
 *  a share of the building's value is not a share of what it costs, and
 *  the model sizes its loan on cost. The rows name the OM's own financing,
 *  never an assumable, a seller's or a junior loan's, nor an exit's. */
const LTV_ROW = /\bloan[- ]to[- ]value\b|\bltv\b/i;
const LTC_ROW = /\bloan[- ]to[- ]cost\b|\bltc\b/i;
const LEVERAGE_NOT = /assumable|seller|existing|in[- ]place|current|supplemental|mezz|combined|\bcltv\b|exit|refi/i;

/** The leverage the OM states, by its own measure: its loan-to-value first,
 *  else its loan-to-cost, each read off a row whose label names it (a
 *  label naming both is neither). */
function statedLeverage(rows: Row[]): { row: Row; pct: number; measure: "loan-to-value" | "loan-to-cost" } | null {
  const of = (re: RegExp, other: RegExp, measure: "loan-to-value" | "loan-to-cost") => {
    const hit = statedPct(rows, re, new RegExp(`${LEVERAGE_NOT.source}|${other.source}`, "i"));
    return hit && hit.pct > 0 && hit.pct <= 100 ? { ...hit, measure } : null;
  };
  return of(LTV_ROW, LTC_ROW, "loan-to-value") ?? of(LTC_ROW, LTV_ROW, "loan-to-cost");
}

/** A vacancy row that states the building's vacancy TODAY — current, in
 *  place, actual, the T-12's, trailing — never a pro forma allowance: it is
 *  read as today's figure, as a stated occupancy is (audit M6). */
const VACANCY_TODAY = /\b(?:current|in[- ]place|actual|t-?12|ttm|trailing|today)\b/i;

/**
 * What a vacancy or occupancy figure counts (the review of 2026-10-21): a
 * physical figure counts doors — the units, or the area, empty — and an
 * economic one dollars — the rent not collected over gross potential rent,
 * with credit loss, and concessions or loss to lease where they are netted
 * there. The two are different measures of one building, and neither
 * decides the other (lib/stress-deciders `VACANCY_ORDER`). Read off the
 * OM's own label, in this order (the review of 2026-10-23):
 *   - economic where the label names the economic measure, a loss (a
 *     "vacancy loss", a "vacancy & credit loss"), a credit or collection
 *     loss, bad debt or concessions;
 *   - physical where it names what it counts by the door: an occupancy,
 *     units, doors, physical;
 *   - economic where it names the pro forma's own line — "pro forma",
 *     "underwritten", a budget, a numbered year: a deduction the pro forma
 *     takes from gross potential rent in dollars, a line of its income
 *     statement, not a count of empty doors;
 *   - physical otherwise: a vacancy rate the OM states on its own
 *     ("Stabilized vacancy", "Vacancy"), the share of the building empty.
 */
export type VacancyMeasure = "physical" | "economic";
const ECONOMIC_WORDS = /\beconomic\b|\bcredit\b|\bcollection\b|\bbad\s+debt\b|\bconcession|\bloss\b/i;
const PHYSICAL_WORDS = /\boccupan(?:cy|t)\b|\bunits?\b|\bdoors?\b|\bphysical\b/i;
const PRO_FORMA_LINE = /\bpro ?forma\b|\bunderwrit|\bbudget|\byear ?\d|\byr\.? ?\d/i;
const ECONOMIC_ROW = /\beconomic\s+(?:vacancy|occupancy)\b/i;
/** A vacancy read off the trailing statement ("T-12 vacancy", "TTM
 *  vacancy") is the statement's loss over its gross potential rent: dollars. */
const TRAILING_STATEMENT = /\b(?:t-?12|ttm|trailing)\b/i;
export const measureOf = (label: string): VacancyMeasure =>
  ECONOMIC_WORDS.test(label) ? "economic" : PHYSICAL_WORDS.test(label) ? "physical" : PRO_FORMA_LINE.test(label) ? "economic" : "physical";
const vacancyMeasureOf = (label: string): VacancyMeasure => (ECONOMIC_WORDS.test(label) || TRAILING_STATEMENT.test(label) ? "economic" : "physical");

type OmVacancy = { row: Row; pct: number; from: "vacancy" | "occupancy" | "today"; measure: VacancyMeasure };

/** The OM's stabilized vacancy, as a vacancy row (a stabilized or pro forma
 *  one first) or as what its stated occupancy leaves; else a vacancy the OM
 *  states for today, read as today's figure (`from: "today"`); else, only
 *  where the OM states no figure counted by doors, an economic occupancy or
 *  vacancy it states (the self-storage memorandum's "Economic occupancy"),
 *  read as today's unless its label says stabilized or pro forma. Each with
 *  its measure (`measureOf`). */
function omVacancy(rows: Row[]): OmVacancy | null {
  const vacancyRows = rows.filter((m) => VACANCY_ROW.test(m.label) && !VACANCY_NOT.test(m.label) && !VACANCY_VALUE_NOT.test(m.value) && parsePct(m.value) != null);
  const assumed = vacancyRows.filter((m) => !VACANCY_TODAY.test(m.label));
  const row = assumed.find((m) => VACANCY_PLAN.test(m.label)) ?? assumed[0] ?? null;
  if (row) {
    const pct = parsePct(row.value)!;
    if (pct >= 0 && pct <= 100) return { row, pct, from: "vacancy", measure: measureOf(row.label) };
  }
  const occ = occupancyRow(rows) as Row | null;
  const occPct = occ ? parsePct(occ.value) : null;
  if (occ && occPct != null && occPct >= 0 && occPct <= 100) return { row: occ, pct: Math.round((100 - occPct) * 10) / 10, from: "occupancy", measure: "physical" };
  const today = vacancyRows.find((m) => VACANCY_TODAY.test(m.label)) ?? null;
  const todayPct = today ? parsePct(today.value) : null;
  if (today && todayPct != null && todayPct >= 0 && todayPct <= 100) return { row: today, pct: todayPct, from: "today", measure: vacancyMeasureOf(today.label) };
  // The economic rows the readers above leave out by their labels.
  const econ = rows.find((m) => ECONOMIC_ROW.test(m.label) && !/market|submarket|metro|break-?even/i.test(m.label) && !VACANCY_VALUE_NOT.test(m.value) && parsePct(m.value) != null) ?? null;
  const econPct = econ ? parsePct(econ.value) : null;
  if (econ && econPct != null && econPct >= 0 && econPct <= 100) {
    const occupancy = /occupancy/i.test(econ.label);
    const vacant = occupancy ? Math.round((100 - econPct) * 10) / 10 : econPct;
    const planned = VACANCY_PLAN.test(econ.label) && !VACANCY_TODAY.test(econ.label);
    return { row: econ, pct: vacant, from: planned ? "vacancy" : occupancy ? "occupancy" : "today", measure: "economic" };
  }
  return null;
}

// ── The challenger's words ───────────────────────────────────────────────

/**
 * The keyword table a stored challenge is matched on where the challenger
 * wrote no `key` (every result stored before 2026-10-19): the challenge's
 * `assumption` text alone, in this order, first match wins — the premium
 * before insurance (a "renovation premium" names a premium) and before the
 * rents (a "renovated rent premium" names a rent), the taxes and the
 * insurance before the growth rates (an "expense growth on taxes" is the
 * taxes' challenge), the exit before the debt (a "cap" with "exit" is the
 * exit's), the debt before the NOI (a "DSCR on the NOI" is the debt's).
 */
export const CHALLENGE_KEYWORDS: readonly { key: Exclude<StressKey, "other">; re: RegExp }[] = [
  { key: "renovation_premium", re: /\brenovat|value[- ]add|\bpremium\b[^,;]*\b(?:door|unit)|\bupgrade|interior/i },
  // "Tax-exempt bond financing" is the debt's; "bad debt" is a collections
  // line, nobody's loan; a "premium over replacement cost" is the basis's;
  // and a figure per unit is the basis's only beside a price word, so
  // "payroll per unit" files nowhere.
  { key: "taxes", re: /\btax(?:es)?\b(?!-exempt)|reassess|assessed|millage/i },
  // Insurance by its own words: a premium only beside a policy's, a
  // coverage's or a deductible's, so a rent premium ("Market rent premium of
  // $200") or a premium over replacement cost never files here — and a debt
  // service coverage is the loan's, never a policy's ("Debt service coverage
  // at a rate premium" is the debt's).
  { key: "insurance", re: /\binsur|(?<!\bservice\s)\b(?:coverage|policy|deductible)\b[^,;]*\bpremium\b|\bpremium\b[^,;]*(?:(?<!\bservice\s)\bcoverage|\bpolicy|\bdeductible)\b/i },
  { key: "exit_cap", re: /\b(?:exit|terminal|reversion|residual|disposition)\b|compression/i },
  { key: "debt", re: /(?<!\bbad\s)\bdebt\b|\b(?:loan|financing|interest rate|dscr|coverage|leverage|refinanc|ltv|ltc|sofr|treasury|lender)\b/i },
  { key: "vacancy", re: /\b(?:vacancy|occupancy|lease[- ]up|absorption|occupied)\b/i },
  { key: "noi", re: /\bnoi\b|net operating income|\bt-?12\b|trailing/i },
  // A market or pro forma rent, and the loss to lease it claims to close,
  // are the market-rent row's; a rent's growth rate is the rent growth row's
  // ("Market rent growth of 4% a year", "Pro forma rent growth").
  { key: "market_rent", re: /loss[- ]to[- ]lease|mark[- ]to[- ]market|market rents?\b(?!\s+growth)|pro ?forma rents?\b(?!\s+growth)|lease comps?\b/i },
  { key: "rent_growth", re: /\b(?:rent|rental|income|revenue)s?\s+growth|\bgrowth\b[^,;]*\brents?\b/i },
  // A growth rate only: an expense ratio or load is a share of income, which
  // the growth row's CPI test does not speak to (`expenseLevelNotGrowth`).
  // "Operating expenses grow 2% a year" is a growth rate, read ahead of the
  // operating-expense row's level words.
  { key: "expense_growth", re: /\b(?:expense|opex|operating expense)s?\s+(?:growth|escalation|inflation|grow(?:s|ing)?\b|increas)|expense growth/i },
  // An expense's level — the total, a ratio or load, a line other than the
  // taxes and the insurance (which file above) — is the operating-expense
  // row's; its growth rate is the expense growth row's (above).
  { key: "opex", re: /\b(?:operating\s+expenses?|opex|expense\s+(?:ratio|load)|management\s+fee|payroll|repairs?(?:\s+and\s+maintenance)?|r\s?&\s?m|utilit(?:y|ies))\b/i },
  { key: "basis", re: /\bprice\b|\bpricing\b|\bbasis\b|\bask(?:ing)?\b[^;]*\b(?:per (?:unit|door|key|sf)|psf)\b|replacement cost|overpay|\bcomps?\b/i },
];

/** The row a stored challenge belongs to: its own `key` where the
 *  challenger wrote one, else the keyword table on its assumption text,
 *  else "other". */
export function challengeKey(c: Challenge): StressKey {
  // A challenge on an expense's level filed as its growth is the operating
  // expenses' (`expenseLevelNotGrowth`).
  if (c.key && (STRESS_KEYS as readonly string[]).includes(c.key)) return c.key === "expense_growth" && expenseLevelNotGrowth(c) ? "opex" : (c.key as StressKey);
  const hit = CHALLENGE_KEYWORDS.find((k) => k.re.test(c.assumption ?? ""));
  return hit?.key ?? "other";
}

/** Words that state an expense's LEVEL, not its growth: a ratio or load, a
 *  share of income or revenue, a figure a unit, a door, a key or a foot. */
const EXPENSE_LEVEL = /\bratio\b|\bload\b|%\s*of\s+(?:egi|effective|gross|income|revenue|rents?|collections)\b|\bshare\s+of\b|\bper\s+(?:unit|door|key|bed|pad|room|sf|square\s+f(?:oo|ee)t|foot)\b|\/\s*(?:unit|door|key|bed|pad|room|sf)\b|\bpsf\b/i;
const EXPENSE_GROWTH_WORDS = /\bgrowth\b|\bgrow(?:s|ing)?\b|escalat|inflat|\bincrease|\bper\s+(?:year|annum)\b|\/\s*yr\b|\ba\s+year\b/i;

/**
 * Whether a challenge filed on the expense growth row is about the expense's
 * level — a ratio, a share of income, a figure a unit — rather than its growth
 * rate (a challenge stored before the operating-expense row was keyed named
 * "the expense growth rate or ratio"): the growth row holds a rate a year to
 * the CPI's, a different quantity, so such a challenge is the operating
 * expenses' row's (`opex`). Read off its words, and off its figure where
 * that is a dollar amount no growth rate could be (100 or more).
 */
function expenseLevelNotGrowth(c: Challenge): boolean {
  const words = c.assumption ?? "";
  if (EXPENSE_LEVEL.test(words) && !EXPENSE_GROWTH_WORDS.test(words)) return true;
  return c.omFigure != null && Number.isFinite(c.omFigure) && Math.abs(c.omFigure) >= 100;
}

const challengeWords = (c: Challenge): StressRow["challenge"] => ({ severity: c.severity, challenge: c.challenge, question: c.question });

// ── The rows ─────────────────────────────────────────────────────────────

interface Ctx {
  ex: ExtractionResult | null;
  rows: Row[];
  kind: ReturnType<typeof inferStrategy>["kind"];
  strategy: DealStrategy;
  plan: boolean;
  assetClass: string | null;
  mvm: ModelVsMarket | null;
  actuals: ActualsRead | null;
  derived: DerivedModel | null;
  /** the model may be run again on this deal (null) — or why not */
  impactsWithheld: string | null;
  /** on a plan deal whose rows re-run its yield on total cost: the plan and
   *  the two figures the yield is struck on; null elsewhere */
  planYield: PlanYield | null;
  market: MarketResult | null;
  brokerComps: BrokerCompsResult | null;
  recordedSales: RecordedSalesEvidence | null;
  pastScreens: PastScreensEvidence | null;
  pastScreensWithheld: string | null;
  indexGiven: DebtIndex | null;
  loanQuote: LoanQuote | null;
  readOn: string;
}

/** A plan deal's yield on total cost, as its rows re-run it. */
interface PlanYield {
  plan: PlanSummary;
  /** the stabilized NOI the OM states */
  noi: number;
  /** the price plus the plan's budget (a forward purchase's price) */
  totalCost: number;
}

/** Whether a row's levered-IRR re-run is struck: a model to run, its reads
 *  standing, and no plan deal (whose rows re-run the yield on cost). */
const irrRuns = (ctx: Ctx): boolean => ctx.derived != null && ctx.impactsWithheld == null && !ctx.plan;

/** A row label that names the plan's own figure: the stabilized or pro
 *  forma one, never a year's (a value-add's year one is the building before
 *  the plan is done). */
const PLAN_FIGURE = /stabili[sz]ed|pro ?forma/i;

/**
 * A plan deal's re-run: its yield on total cost twice (lib/plan-sensitivity
 * `yieldOnCost`), once on the OM's figure and once with ONE of the plan's two
 * figures — the stabilized NOI or the total cost — moved by the row's
 * deciding evidence, the other as the OM states it. `om` and `alt` are that
 * figure in dollars at each side; `words.what` names the row's figure, `om`
 * and `alt` say it, `evidence` whose the alternative is ("" where `alt` is a
 * whole phrase), and `moved` names the plan's figure the swap moves.
 *
 * Bounded as the plan's own yield is (lib/deal-strategy `yieldWithheld`): a
 * moved stabilized NOI at or under zero, or a moved yield at or past
 * IMPLIED_CAP_CEILING, is no yield any plan earns — the figures do not tie —
 * so no impact is struck and the row's `noRerun` sentence is returned in its
 * place (a string). Two yields that print the same at two places are said
 * to stand.
 */
function yocImpact(
  py: PlanYield,
  input: PlanYieldInput,
  evidenceIndex: number,
  om: number,
  alt: number,
  words: { what: string; om: string; alt: string; evidence: string; how?: string },
): StressImpact | string | null {
  const at = (v: number) => (input === "stabilizedNoi" ? yieldOnCost(v, py.totalCost) : yieldOnCost(py.noi, v));
  const altSaid = !words.evidence ? words.alt : / via /.test(words.evidence) ? `${words.alt} (${words.evidence})` : `${words.evidence}'s ${words.alt}`;
  if (!Number.isFinite(alt)) return null;
  if (input === "stabilizedNoi" && alt <= 0) {
    return `If ${words.what} is ${altSaid}, the stabilized NOI falls to ${money(alt)}, at or under zero, which is no stabilized plan: the figures do not tie, so no yield on cost is re-run on it.`;
  }
  const base = at(om);
  const moved = at(alt);
  if (base == null || moved == null) return null;
  const basePct = base * 100;
  const altPct = moved * 100;
  if (moved >= IMPLIED_CAP_CEILING) {
    return `If ${words.what} is ${altSaid}, the yield on cost would be ${pct2(altPct)}, at or past the ${Math.round(IMPLIED_CAP_CEILING * 100)}% the screen holds as a misread: the figures do not tie, so no yield on cost is re-run on it.`;
  }
  const same = Math.abs(alt - om) < 0.5;
  const over =
    input === "stabilizedNoi"
      ? `the stabilized NOI ${money(om)} to ${money(alt)} over the ${money(py.totalCost)} total cost`
      : `the stabilized NOI ${money(py.noi)} over a total cost of ${money(om)}, then ${money(alt)}`;
  const how = words.how ? `; ${words.how}` : "";
  // What the re-run assumes, as a sentence the panel prints under its bars:
  // "The gap is struck on the $9.8M stabilized gross the OM states."
  const caveat = words.how && !same ? `${words.how.replace(/^the gap (struck )?on /, (_m, struck) => `The gap is ${struck ? "struck " : ""}on `)}.` : undefined;
  const note = same
    ? `The OM's ${words.what}, ${words.om}, is ${altSaid}, so the yield on cost of ${pct2(basePct)} stands on it.`
    : pct2(basePct) === pct2(altPct)
      ? `If ${words.what} is ${altSaid}, not the OM's ${words.om}, the yield on cost stands at ${pct2(basePct)} to two places (${over}${how}).`
      : `If ${words.what} is ${altSaid}, not the OM's ${words.om}, the yield on cost moves from ${pct2(basePct)} to ${pct2(altPct)} (${over}${how}).`;
  return {
    measure: "yield_on_cost",
    input,
    evidenceIndex,
    omValue: om,
    altValue: alt,
    baseIrrPct: null,
    altIrrPct: null,
    baseMultiple: null,
    altMultiple: null,
    baseYocPct: basePct,
    altYocPct: altPct,
    note,
    ...(caveat ? { caveat } : {}),
  };
}

/** A plan re-run's result split: the impact, or the sentence why none. */
function yocSplit(run: StressImpact | string | null): { impact: StressImpact | null; noRerun: string | null } {
  return typeof run === "string" ? { impact: null, noRerun: run } : { impact: run, noRerun: null };
}

/** Why a plan deal's row with no yield-on-cost meaning carries no re-run,
 *  its verdict as struck: one whole sentence a key. */
export const PLAN_NO_YIELD_MEANING: Partial<Record<StressKey, string>> = {
  rent_growth: "A growth rate has no yield-on-cost meaning, since the yield is the stabilized NOI over the total cost in one year, so no yield on cost is re-run on it; the verdict stands.",
  expense_growth: "A growth rate has no yield-on-cost meaning, since the yield is the stabilized NOI over the total cost in one year, so no yield on cost is re-run on it; the verdict stands.",
  exit_cap: "The exit cap prices the sale, not the yield on cost, which is the stabilized NOI over the total cost, so no yield on cost is re-run on it; the verdict stands.",
  debt: "The loan's rate is paid below the NOI, and the yield on cost is struck before debt, so no yield on cost is re-run on it; the verdict stands.",
  noi: "On a plan deal the NOI row tests today's income, while the yield on cost is struck on the stabilized NOI, so no yield on cost is re-run on it; the verdict stands.",
};

/** Why a plan deal's headline leaves out a row past its evidence that has no
 *  yield-on-cost meaning, one short clause a key (the row's own `noRerun`
 *  says it whole). */
export const PLAN_LEFT_OUT_WHY: Partial<Record<StressKey, string>> = {
  rent_growth: "a growth rate has no yield-on-cost meaning",
  expense_growth: "a growth rate has no yield-on-cost meaning",
  exit_cap: "the exit cap prices the sale, not the yield on cost",
  debt: "the yield on cost is struck before debt",
  noi: "the NOI row tests today's income, not the stabilized NOI",
};

/** The vacancy row's no-re-run on a plan deal whose OM states its occupancy
 *  today, not the stabilized vacancy the plan is to reach. */
export const PLAN_VACANCY_TODAY =
  "The OM's figure is today's occupancy, not the stabilized vacancy the plan's NOI runs at, so no yield on cost is re-run on it.";

/** The vacancy row's no-re-run on a plan deal whose stated stabilized
 *  vacancy the deal's own rent roll or T-12 decided: a document is the
 *  building before the plan is done (`planVacancyStated`), so its vacancy is
 *  the gap the plan closes, never the figure the stabilized NOI runs at. */
export const PLAN_VACANCY_DOCUMENT =
  "Today's vacancy is the gap the plan closes, not evidence of the stabilized figure, so no yield on cost is re-run on it.";

/** Why a plan deal's stated stabilized vacancy stands unchecked where only
 *  the deal's own documents carry a figure: they are today's building. */
export const PLAN_VACANCY_UNCHECKED =
  "The deal's rent roll and T-12 are the building before the plan is done, the gap the plan closes, not evidence of the stabilized figure, and no published figure or class norm could be held to it.";

/** The vacancy row's no-re-run where the OM states no stabilized gross. */
export const PLAN_NO_GROSS =
  "The OM states no stabilized gross potential rent or effective gross income, so the vacancy gap cannot be carried to the stabilized NOI and no yield on cost is re-run on it.";

/** The tax row's no-re-run where no tax row the OM states is its pro
 *  forma's (every row searched). */
export const PLAN_TAX_NOT_PRO_FORMA =
  "The OM states no tax bill as its pro forma's line, so which bill the stabilized NOI carries is not stated, and no yield on cost is re-run on it.";

/** The tax row's no-re-run on a development, a conversion or a forward
 *  purchase: the reset is struck on today's assessment and the price paid
 *  today, and the building the plan delivers is assessed when finished. */
export const PLAN_TAX_NOT_ASSESSED =
  "The finished building is not assessed at the price, so the reset bill struck on it is a floor, not the bill the stabilized NOI carries, and no yield on cost is re-run on it.";

/** Each reason a row carries no re-run, in a few words: the reason's whole
 *  sentence (or a phrase it holds) against the words a cell prints after
 *  "no yield-on-cost re-run:" (or "no re-run:"). */
const NO_RERUN_SHORT: readonly [(why: string) => boolean, string][] = [
  [(w) => w === PLAN_NO_YIELD_MEANING.rent_growth || w === PLAN_NO_YIELD_MEANING.expense_growth, "a growth rate"],
  [(w) => w === PLAN_NO_YIELD_MEANING.exit_cap, "the exit cap prices the sale"],
  [(w) => w === PLAN_NO_YIELD_MEANING.debt, "struck before debt"],
  [(w) => w === PLAN_NO_YIELD_MEANING.noi, "the row tests today's income"],
  [(w) => w === PLAN_VACANCY_TODAY, "today's occupancy"],
  [(w) => w === PLAN_VACANCY_DOCUMENT, "today's vacancy"],
  [(w) => w === PLAN_NO_GROSS, "no stabilized gross stated"],
  [(w) => w === PLAN_TAX_NOT_PRO_FORMA, "no pro forma tax line"],
  [(w) => w === PLAN_TAX_NOT_ASSESSED, "the reset bill is a floor"],
  [(w) => /the figures do not tie/.test(w), "the figures do not tie"],
  [(w) => /^No achieved premium is stated/.test(w), "no achieved premium stated"],
  [(w) => w === INSURANCE_NO_RERUN || w === INSURANCE_NO_RERUN_NO_T12, "nothing tests the premium"],
  [(w) => w === PLAN_INSURANCE_NOT_PRO_FORMA, "no pro forma premium"],
  [(w) => w === PLAN_OPEX_NOT_PRO_FORMA, "no pro forma expense line"],
  [(w) => w === MARKET_RENT_NO_RERUN, "the model runs today's rent"],
  [(w) => w === PLAN_MARKET_RENT_VALUE_ADD_ONLY, "the finished building's rent"],
  [(w) => w === PLAN_MARKET_RENT_NO_COUNT, "no count stated"],
  [(w) => /no count of doors to renovate/.test(w), "no doors to renovate stated"],
];

/** A row's `noRerun` in a few words, for a cell with no room for the
 *  sentence (`StressRow.noRerunShort`): "no yield-on-cost re-run: a growth
 *  rate"; the bare lead where no short reason is filed for the sentence. */
export function noRerunShortOf(row: Pick<StressRow, "noRerun">): string {
  const why = row.noRerun?.trim() ?? "";
  const lead = /yield on cost/i.test(why) ? "no yield-on-cost re-run" : "no re-run";
  const short = NO_RERUN_SHORT.find(([is]) => is(why))?.[1];
  return short ? `${lead}: ${short}` : lead;
}

/** Why the tax row stands unchecked where the OM's only bill is its pro
 *  forma's line: a pro forma bill over today's assessment is no rate. */
export const PLAN_TAX_NO_TODAY =
  "The OM's only tax bill is its pro forma's line, not today's bill on today's assessment, so no rate is read to work the reset bill from; the rate is the assessor's to give.";

/** Why the tax row stands unchecked where the bill over the assessed value
 *  is past `TAX_RATE_CEILING`. */
export const TAX_RATE_MISREAD = `The OM's tax bill over its assessed value is past the ${Math.round(TAX_RATE_CEILING * 100)}% ceiling the screen holds for an effective rate on market value, so the assessment is a fraction of value or a figure was misread, and no reset bill is struck.`;

const GROSS_ROW = /\bgross\s+potential\s+(?:rent|income|revenue)\b|\bpotential\s+gross\s+(?:rent|income|revenue)\b|\bgpr\b|\bgpi\b/i;
const EGI_ROW = /\beffective\s+gross\s+(?:income|revenue)\b|\begi\b/i;
const GROSS_NOT = /\bper\b|\/|psf|month|\bmo\b|growth|\bunits?\b|loss|t-?12|ttm|trailing|in[- ]place|current|actual|year ?\d|yr\.? ?\d/i;

/**
 * The plan's stabilized gross, the figure a stabilized vacancy is struck
 * against: a stabilized or pro forma gross potential rent the OM states,
 * else its stabilized effective gross income grossed back up at the OM's own
 * stabilized vacancy (the two stated figures, the arithmetic said). Null
 * where it states neither — never the in-place rent, never a year's.
 */
export function stabilizedGrossOf(rows: readonly { label: string; value: string; page?: string }[], omVacancyPct: number): { gross: number; words: string } | null {
  const pick = (re: RegExp) =>
    rows.find((m) => re.test(m.label) && PLAN_FIGURE.test(m.label) && !GROSS_NOT.test(m.label) && !statesRange(m.value) && parseUsd(m.value, 10_000) != null) ?? null;
  const gpr = pick(GROSS_ROW);
  if (gpr) return { gross: parseUsd(gpr.value, 10_000)!, words: `the OM's ${lowerFirst(gpr.label)} of ${money(parseUsd(gpr.value, 10_000)!)}` };
  const egi = pick(EGI_ROW);
  const occupied = 1 - omVacancyPct / 100;
  if (egi && occupied > 0) {
    const e = parseUsd(egi.value, 10_000)!;
    return { gross: e / occupied, words: `the OM's ${lowerFirst(egi.label)} of ${money(e)} at its own ${pct1(omVacancyPct)} vacancy, ${money(e / occupied)} gross` };
  }
  return null;
}

const STATED_YOC_ROW = /\byield\s+on\s+(?:total\s+)?cost\b|\breturn\s+on\s+total\s+cost\b|\byoc\b|\bdevelopment\s+yield\b/i;
/** A bare "return on cost" is most often the renovation's (a door's premium
 *  over its cost) on a value-add: read as the plan's only on a development
 *  or a conversion whose memorandum states no renovation program. */
const RETURN_ON_COST_ROW = /\breturn\s+on\s+cost\b/i;
const STATED_YOC_NOT = /renovat|premium|door|\bunits?\b|interior|upgrade|\btrended\b|spread|levered|\birr\b|\bper\b/i;

/** A yield on cost the memorandum states in a row of its own (the whole
 *  plan's, never a renovation's return on a door), with its page; null where
 *  it states none or a figure no project earns. */
function statedYocOf(rows: Row[], ex: ExtractionResult | null, kind: Ctx["kind"]): NonNullable<StressHeadline["statedYoc"]> | null {
  const builds = kind === "development" || kind === "conversion";
  const renovates = readValueAdd(ex) != null || rows.some((m) => RENOVATION_DOORS_ROW.test(m.label) || RENOVATION_COST_PER_DOOR_ROW.test(m.label));
  const row = findMetric(rows, STATED_YOC_ROW, STATED_YOC_NOT) ?? (builds && !renovates ? findMetric(rows, RETURN_ON_COST_ROW, STATED_YOC_NOT) : null);
  const pct = row ? parsePct(row.value) : null;
  if (!row || pct == null || !(pct > 0) || pct >= IMPLIED_CAP_CEILING * 100 || statesRange(row.value)) return null;
  // Whether the row names the cost it is struck on: a dollar figure in its
  // label or its value, as stated.
  const namesCost = /\$\s?\d/.test(`${row.label} ${row.value}`);
  return { pct, label: row.label, page: pageOf(row, ex), namesCost };
}

const TITLES: Record<StressKey, string> = {
  basis: "Basis",
  exit_cap: "Exit cap",
  debt: "Debt",
  noi: "NOI",
  vacancy: "Stabilized vacancy",
  rent_growth: "Rent growth",
  market_rent: "Market rent",
  expense_growth: "Expense growth",
  taxes: "Real estate taxes",
  insurance: "Insurance",
  opex: "Operating expenses",
  renovation_premium: "Renovation premium",
  other: "Everything else the challenger raised",
};

/**
 * "The OM's stabilized vacancy against rental vacancy, metro area (Census
 * Bureau), the one figure that decides; beside it, not deciding: the deal's
 * T-12 and the class's norm." — the sources actually attached: the ONE
 * piece the verdict was decided on (`decidedBy`), and every other piece
 * beside it — a figure that did not decide, one held to nothing, words
 * alone. With nothing decided (an unchecked row), every piece is beside. A
 * publisher the label already names is not said twice. None, said so.
 */
function methodSentence(key: StressKey, evidence: StressEvidence[], decidedBy: number | null, title?: string): string {
  const what = `The OM's ${lowerFirst(title ?? TITLES[key])}`;
  if (evidence.length === 0) return `${what}: no evidence with a figure or words could be read for this deal, so it stands unchecked.`;
  const name = (e: StressEvidence) => (e.label.toLowerCase().includes(e.publisher.toLowerCase()) ? lowerFirst(e.label) : `${lowerFirst(e.label)} (${e.publisher})`);
  const decider = decidedBy != null ? evidence[decidedBy] : null;
  const beside = evidence.filter((_, i) => i !== decidedBy).map(name);
  if (!decider) return `${what} beside ${joinWords(beside)}: no figure decides it.`;
  return `${what} against ${name(decider)}, the one figure that decides${beside.length ? `; beside it, not deciding: ${joinWords(beside)}` : ""}.`;
}

function unchecked(key: StressKey, omSays: StressRow["omSays"], evidence: StressEvidence[], why: string, title?: string): StressRow {
  return { key, title: title ?? TITLES[key], omSays, evidence, gap: null, verdict: "unchecked", decidedBy: null, impact: null, challenge: null, method: methodSentence(key, evidence, null, title), unchecked: why };
}

/** The row's pieces as the deciders read them: `held` where the piece may
 *  decide (it carries a figure and the row may hold the OM's figure to it). */
const candidatesOf = (evidence: StressEvidence[], held: (e: StressEvidence, i: number) => boolean = () => true): DeciderCandidate[] =>
  evidence.map((e, i) => ({ evidence: e, held: e.value != null && held(e, i) }));

/** The vacancy row's title where the OM's figure is today's occupancy. */
const OCCUPANCY_TITLE = "Occupancy today";

const NO_FIGURE = (what: string) => `The OM states no ${what}.`;
const NO_EVIDENCE = "No evidence with a figure could be read for this deal.";

// — Vacancy —

/**
 * Whether the OM's vacancy is a stabilized assumption on a deal read as
 * stabilized — the case the vacancy row holds to the market's published
 * figures before the deal's documents, whose vacancy is today's. A stated
 * vacancy allowance (a stabilized or pro forma row first, `omVacancy`), on a
 * deal no plan deal: an occupancy the OM states is today's, and a lease-up,
 * value-add, conversion or development is judged on what the documents say
 * the building runs at today (its plan is the gap). The track record reads
 * it too (lib/track-record `vacancyHeldToMarket`), so a later rent roll's
 * vacancy — today's again — never scores a challenge the stress test holds
 * to the market. An allowance the OM states as economic (a vacancy and
 * credit loss) is no such case: the market's vacancy counts doors, so the
 * row holds it to the T-12, the same measure, never to the market.
 */
export function stabilizedVacancyStated(extraction: ExtractionResult | null, firstSignal?: FirstSignal | null): boolean {
  const om = omVacancy(rowsOf(extraction));
  return om?.from === "vacancy" && om.measure === "physical" && !isPlanDeal(inferStrategy(extraction, firstSignal ?? null).kind);
}

/**
 * Whether the OM's vacancy is economic — dollars over gross potential rent,
 * not doors (`omVacancy`'s measure, the stress test's own reading). The track
 * record reads it (lib/track-record `vacancyEconomic`) for a challenge scored
 * where no stress test was kept: an economic OM figure is scored by a later
 * T-12's economic vacancy, never by a rent roll's count of doors.
 */
export function vacancyEconomicStated(extraction: ExtractionResult | null): boolean {
  return omVacancy(rowsOf(extraction))?.measure === "economic";
}

/**
 * Whether the OM's vacancy is a stated allowance on a plan deal — the
 * stabilized figure a lease-up, value-add, conversion or development is to
 * reach. The track record reads it (lib/track-record `vacancyIsPlanTarget`):
 * a rent roll or T-12 that arrives later is the building before the plan is
 * done, which cannot speak to the figure it is meant to reach.
 */
export function planVacancyStated(extraction: ExtractionResult | null, firstSignal?: FirstSignal | null): boolean {
  const om = omVacancy(rowsOf(extraction));
  return om?.from === "vacancy" && isPlanDeal(inferStrategy(extraction, firstSignal ?? null).kind);
}

/**
 * The kind of evidence that decided a built test's vacancy row: the one
 * piece its verdict was struck on (`decidedBy`; on a row built before it,
 * the figure its re-run swapped in, else the first piece with a figure) —
 * "published" where the market's figure held a stabilized assumption,
 * "document" where the deal's rent roll or T-12 decided it. Null with no
 * vacancy row, or one left unchecked. The track record reads it (audit M5):
 * a later document scores no vacancy challenge only where the market
 * decided it, never where the documents did.
 */
export function vacancyDecidedBy(test: StressTest | null | undefined): StressEvidence["kind"] | null {
  const row = test?.rows.find((r) => r.key === "vacancy");
  if (!row || row.verdict === "unchecked") return null;
  const e =
    row.decidedBy != null ? row.evidence[row.decidedBy] : row.impact ? row.evidence[row.impact.evidenceIndex] : row.evidence.find((x) => x.value != null);
  return e?.kind ?? null;
}

/** "The lease-up from today's 9.3% to the stabilized 6.0% is not modelled in
 *  either case: each runs its vacancy from year one." — said on a stabilized
 *  vacancy the market holds where the deal's documents run more than
 *  `VACANCY_UNSUPPORTED_PTS` over it today. */
export function leaseUpNotModelled(todayPct: number, stabilizedPct: number): string {
  return `The lease-up from today's ${pct1(todayPct)} to the stabilized ${pct1(stabilizedPct)} is not modelled in either case: each runs its vacancy from year one.`;
}

/** The T-12's economic vacancy beside a figure counted by doors, said on its
 *  evidence line. */
export const T12_ECONOMIC_BESIDE = "dollars, not doors: shown beside the OM's figure, which counts doors, and never deciding it";

/** The rent roll's count beside a figure the OM states as economic. */
export const ROLL_PHYSICAL_BESIDE = "doors, not dollars: shown beside the OM's economic figure and never deciding it";

/** Why a vacancy counted by doors stands unchecked where the deal's T-12 is
 *  the only figure on file: its loss is dollars. */
export const VACANCY_ECONOMIC_ONLY =
  "The deal's T-12 counts vacancy and credit loss in dollars, not doors, so it cannot decide the OM's figure, which counts doors, and no rent roll, published vacancy or class norm could be held to it.";

/** Why a vacancy the OM states as economic stands unchecked with no T-12. */
export const VACANCY_NO_T12_ECONOMIC =
  "The OM states its figure as economic, dollars, not doors, and no T-12 is on file to hold it to; a count of doors cannot decide it.";

/** Why a stabilized vacancy counted by doors stands unchecked on a deal read
 *  as stabilized: no published figure and no class norm stands, and today's
 *  rent roll never decides it (the review of 2026-10-23). */
export const STABILIZED_VACANCY_UNCHECKED =
  "No fresh published vacancy figure for this market and no class norm could be held to the stabilized assumption, and the deal's rent roll is the building today, the gap a lease-up has to close, never the test of a stabilized figure.";

/** What the rent roll is beside a stabilized assumption the market or the
 *  class's norm decides, said in the gap. */
export const ROLL_NOT_STABILIZED = "the deal's rent roll is the building today, never the test of a stabilized figure";

/** How the gap says why the OM's figure is economic: in its own words where
 *  its label names the measure or a loss, else as its pro forma's line. */
function economicSaid(label: string): string {
  return ECONOMIC_WORDS.test(label)
    ? "The OM states its figure as economic, dollars, not doors"
    : "The OM's figure is its pro forma's vacancy line, a deduction from gross potential rent: dollars, not doors";
}

/** The vacancy row's title where the OM's figure is today's economic
 *  occupancy (`OCCUPANCY_TITLE`'s economic twin). */
const ECONOMIC_TITLE = "Economic occupancy today";
const ECONOMIC_VACANCY_TITLE = "Economic vacancy today";

function vacancyRow(ctx: Ctx): StressRow | null {
  const om = omVacancy(ctx.rows);
  // What the OM's figure counts (`measureOf`): doors, or dollars. A figure
  // is decided only by one of its own measure (lib/stress-deciders
  // `VACANCY_ORDER`); every piece of the other is shown beside it, said so.
  const economic = om?.measure === "economic";
  // Each piece is gathered apart and set in order once the row knows which
  // kind decides: the deal's documents, the published figures (each with its
  // own tolerance — the survey's margin reaches the survey's figure, never
  // the region's or the state's beside it), the class's rule of thumb.
  type Piece = { e: StressEvidence; tolerance: number; compare: boolean };
  const docs: Piece[] = [];
  const market: Piece[] = [];
  let rot: Piece | null = null;
  let roll: Piece | null = null;
  let t12p: Piece | null = null;
  const piece = (e: StressEvidence, tolerance = SAME, compare = true): Piece => ({ e, tolerance, compare: compare && e.value != null });
  // The deal's own documents: the rent roll's occupancy, by its doors, and
  // the T-12's vacancy and credit loss over gross potential rent, in
  // dollars — whether its rent line already nets the vacancy is the
  // statement's own EGI to say (lib/actuals/analyze `t12Vacancy`, the track
  // record's one reading), and the sentence says what the loss was divided by.
  const rr = ctx.actuals?.rentRoll;
  if (rr) {
    // A class priced by the unit (an apartment, a hotel's keys, a park's
    // pads) runs its occupancy by the count, as its pro forma does — a
    // studio and a three-bedroom are one door each; a class priced by the
    // foot runs it by area. Either falls to the other where the roll lacks it.
    const s = rr.summary;
    const byUnits = s.unitCount > 0 ? s.occupiedUnits / s.unitCount : null;
    const perUnit = assetWords(ctx.assetClass).basis === "unit";
    const useUnits = byUnits != null && (perUnit || s.sfWeightedOccupancy == null);
    const occ = useUnits ? byUnits : s.sfWeightedOccupancy;
    if (occ != null && occ > 0.05 && occ <= 1) {
      const v = Math.round((1 - occ) * 1000) / 10;
      const asOf = rr.asOf ?? s.asOfUsed ?? null;
      const noun = assetWords(ctx.assetClass).noun?.many ?? "units";
      roll = piece({
        kind: "document",
        label: RENT_ROLL_VACANCY_LABEL,
        text: `${pct1(v)} vacant (${useUnits ? `by count, ${s.occupiedUnits} of ${s.unitCount} ${noun} occupied` : "by area, SF-weighted"}${asOf ? `, as of ${proseDay(asOf)}` : ", no stated as-of"})`,
        value: v,
        asOf,
        publisher: "the deal's rent roll",
        scope: "deal",
      });
      docs.push(roll);
    }
  }
  const t12 = ctx.actuals?.t12;
  const tv = t12 ? t12Vacancy(t12.summary) : null;
  if (t12 && tv) {
    t12p = piece({
      kind: "document",
      label: T12_VACANCY_LABEL,
      text: `${pct1(tv.pct)} economic (${money(tv.loss)} of ${money(tv.over)} gross potential rent: ${t12VacancyOverWords(tv)}${t12.periodEnd ? `; TTM to ${proseDay(t12.periodEnd)}` : "; period not stated"})`,
      value: tv.pct,
      asOf: t12.periodEnd,
      publisher: "the deal's T-12",
      scope: "deal",
    });
    docs.push(t12p);
  }
  // The published figures the model-vs-market read already carries: the
  // survey (with its margin as the tolerance), the region's, the state's,
  // and the tracker's band — a tracker figure the read holds the model to
  // nothing in (stale, undated, a narrower stock) is shown and not compared.
  const check = checkOf(ctx.mvm, "vacancy");
  if (check) {
    const held = !["stale", "undated", "old", "aside"].includes(check.tone);
    check.published.forEach((f, i) => {
      const tracker = /research tracker/i.test(f.label);
      const e = published(check, f, ctx.mvm?.grain ?? null);
      const compare = tracker ? held && !assetWords(ctx.assetClass).residential : !(check.marks?.[i]?.role === "apart");
      market.push(piece(e, moeOf(f) ?? SAME, compare));
    });
  }
  // The class's norm, a rule of thumb named as one.
  const cd = classVacancyDefault(ctx.ex?.assetClass ?? ctx.assetClass);
  if (assetWords(ctx.assetClass).operating) {
    rot = piece({
      kind: "rule_of_thumb",
      label: `${cd.classWord[0].toUpperCase()}${cd.classWord.slice(1)} vacancy, a rule of thumb`,
      text: `${pct1(cd.pct)} — the class's screening default, a rule of thumb, not this market's figure`,
      value: cd.pct,
      asOf: null,
      publisher: "a rule of thumb",
      scope: "class",
    });
  }
  if (!om && docs.length + market.length === 0 && !rot) return null;
  // ONE figure decides (lib/stress-deciders `vacancyDecider`). A stated
  // stabilized assumption counted by doors is the market's to judge: the
  // metro survey inside its margin, else a commercial class's tracker band at
  // its low read, the Census region, the state; and the documents' vacancy
  // is today's — shown beside it as the gap a lease-up has to close (on a
  // plan deal, the gap the plan closes), or as support where the building
  // already runs at or under the assumption. Where no published figure is
  // fresh the class's norm decides, a rule of thumb named as one, on a deal
  // read as stabilized and a plan deal alike: today's rent roll never does
  // (the review of 2026-10-23 — it had decided a 6% "unsupported" on the
  // day the market read failed, against "holds" on the day it answered).
  // Today's occupancy is the rent roll's,
  // then the published figures', then the class's norm's. Every piece counts
  // doors but the T-12's, whose vacancy and credit loss over gross potential
  // rent is dollars: it never decides a figure counted by doors, and decides
  // a figure the OM states as economic, ahead of the class's norm, while the
  // counts of doors are shown beside that one. Every other piece is shown
  // beside the one that decides, never in its place: a region's or a
  // state's figure beside the metro's, the T-12 beside the rent roll, a rule
  // of thumb beside a document.
  const stabilized = om?.from === "vacancy";
  const pool: Piece[] = [...docs, ...market, ...(rot ? [rot] : [])];
  const decided = vacancyDecider(
    pool.map((p) => ({ evidence: p.e, held: p.compare })),
    { stabilized, plan: ctx.plan, economic },
  );
  const best = decided ? pool[decided.index] : null;
  const marketDecides = stabilized && !economic && best != null && best.e.kind === "published";
  // Where a stabilized assumption is decided by anything but a document, the
  // documents stand beside it as today's.
  const docsBeside = stabilized && best != null && best.e.kind !== "document";
  const gapClosed = ctx.plan ? "the gap the plan closes" : "the gap a lease-up has to close";
  // The documents' vacancy against the stabilized assumption, said as
  // today's: the gap a lease-up (or the plan) has to close, or support for
  // the figure.
  const todayWords = (docPct: number, omPct: number, what: string): string => {
    const diff = docPct - omPct;
    return diff > SAME
      ? `${pts(diff)} over ${what} — ${gapClosed}`
      : `${diff < -SAME ? `${pts(diff)} under` : "at"} ${what} — support for it`;
  };
  // A document of the OM figure's own measure is said as today's beside a
  // stabilized assumption the market (or the class's norm) decides; one of
  // the other measure is said as that, never as a gap to close.
  const ownMeasure = (p: Piece) => (economic ? p === t12p : p === roll);
  if (om) {
    for (const d of docs) {
      if (!ownMeasure(d)) d.e = { ...d.e, text: `${d.e.text}; ${economic ? ROLL_PHYSICAL_BESIDE : T12_ECONOMIC_BESIDE}` };
      else if (docsBeside) d.e = { ...d.e, text: `${d.e.text}; today's, ${todayWords(d.e.value!, om.pct, "the stabilized assumption")}` };
    }
  }
  // The other measure's figure, said in the gap's own sentence wherever it is
  // on the row, so no reader takes it for the figure that decides: on a
  // figure counted by doors, the T-12's economic vacancy; on an economic one,
  // the counts of doors beside it.
  const otherMeasure =
    om && !economic && t12p
      ? ` The deal's T-12 ran ${pct1(t12p.e.value!)} economic vacancy over its trailing year, its vacancy and credit loss over gross potential rent — dollars, not doors — so it is shown beside the OM's figure, which counts doors, and never decides it.`
      : om && economic && (roll || market.some((m) => m.e.value != null))
        ? " The rent roll's count and the published vacancy count doors, not dollars, so they are shown beside the OM's economic figure and never decide it."
        : "";
  // The figure that decides first, then the rest in the order of the kind
  // that decides: the market's, then the documents', where the market (or,
  // on a plan deal, the class's norm) decides a stabilized assumption; else
  // the documents', then the market's.
  const rest: Piece[] = docsBeside ? [...market, ...docs, ...(rot ? [rot] : [])] : pool;
  const ordered: Piece[] = best ? [best, ...rest.filter((p) => p !== best)] : pool;
  const evidence = ordered.map((p) => p.e);
  // Where the OM states no vacancy allowance, the figure is its occupancy
  // TODAY, not a pro forma assumption: the row is titled and worded so, and
  // the documents — today's figures too — decide it.
  const title = om && om.from !== "vacancy" ? (economic ? (om.from === "occupancy" ? ECONOMIC_TITLE : ECONOMIC_VACANCY_TITLE) : OCCUPANCY_TITLE) : undefined;
  const econ = economic ? "economic " : "";
  const omSays: StressRow["omSays"] = om
    ? {
        text:
          om.from === "vacancy"
            ? `${om.row.label}: ${om.row.value}`
            : om.from === "today"
              ? `${om.row.label}: ${om.row.value} as stated — today's ${econ}vacancy, not a pro forma assumption`
              : `${om.row.label}: ${om.row.value} as stated — today's ${econ}occupancy, not a pro forma assumption — which leaves ${pct1(om.pct)} ${economic ? "economic vacancy" : "vacant"}`,
        value: om.pct,
        page: pageOf(om.row, ctx.ex),
      }
    : { text: NO_FIGURE("vacancy or occupancy"), value: null, page: null };
  if (!om) return unchecked("vacancy", omSays, evidence, NO_FIGURE("vacancy or occupancy"));
  if (!best) {
    const why = economic
      ? t12p
        ? NO_EVIDENCE
        : VACANCY_NO_T12_ECONOMIC
      : stabilized && ctx.plan && docs.length > 0
        ? PLAN_VACANCY_UNCHECKED
        : stabilized && roll
          ? STABILIZED_VACANCY_UNCHECKED
          : t12p && pool.every((p) => p === t12p || p.e.value == null || !p.compare)
            ? VACANCY_ECONOMIC_ONLY
            : NO_EVIDENCE;
    return { ...unchecked("vacancy", omSays, evidence, why, title), ...(economic ? { measure: "economic" as const } : {}) };
  }
  const bestValue = best.e.value!;
  let judged: Judged;
  if (marketDecides) {
    // Said by the figure that decided — its margin, or, for a band, its low
    // read with the band's other end named — and why it decides: the
    // assumption is the building stabilized, which the market's own vacancy
    // speaks to and today's documents do not.
    const stem = (label: string) => label.replace(/, (?:low|high) read$/, "");
    const high = /, low read$/.test(best.e.label)
      ? market.find((m) => m !== best && m.e.value != null && /, high read$/.test(m.e.label) && stem(m.e.label) === stem(best.e.label))
      : undefined;
    const band = high ? { lo: bestValue, hi: high.e.value! } : null;
    const moe = band || best.tolerance === SAME ? null : best.tolerance;
    const said = `${lowerFirst(stem(best.e.label))} (${best.e.publisher}), ${band ? `its low read ${pct1(band.lo)} (the band runs to ${pct1(band.hi)})` : `${pct1(bestValue)}${moe != null ? ` ±${moe} pts` : ""}`}`;
    const edge = bestValue - (moe ?? SAME);
    // Today's gap is the rent roll's, by its doors, the OM's own measure —
    // never the T-12's dollars, which carry credit loss a lease-up does not
    // close (said apart, `otherMeasure`).
    const doc = roll;
    const docLine = doc
      ? ` Today the deal's rent roll runs ${pct1(doc.e.value!)} vacant, ${todayWords(doc.e.value!, om.pct, "the assumption")}.${
          // Past the row's own threshold, the building today is materially
          // emptier than the stabilized figure the market holds: whatever
          // the verdict, neither run models getting from one to the other.
          // A plan deal's yield is struck on the building stabilized, so the
          // lease-up is the plan itself, not a run's omission.
          !ctx.plan && doc.e.value! - om.pct > VACANCY_UNSUPPORTED_PTS ? ` ${leaseUpNotModelled(doc.e.value!, om.pct)}` : ""
        }`
      : "";
    judged = judge(om.pct, bestValue, "low", "pts", VACANCY_UNSUPPORTED_PTS, best.tolerance, (gap) => {
      const where =
        om.pct < edge
          ? `${pts(gap)} under it${moe != null ? `, ${pts(edge - om.pct)} past its margin` : ""}`
          : band && om.pct <= band.hi + SAME
            ? "inside its band"
            : Math.abs(gap) < SAME
              ? "at it"
              : gap > 0
                ? `${pts(gap)} under it, inside its margin`
                : `${pts(gap)} over it — the conservative side`;
      return `The OM's ${pct1(om.pct)} is a stabilized assumption, so it is held to the market's published figure: ${said}. The OM is ${where}.${docLine}${otherMeasure}`;
    });
  } else {
    // A stabilized assumption with no fresh published figure to hold it to:
    // on a deal read as stabilized the rent roll decides, on a plan deal the
    // class's norm, said so. A figure the OM states as economic is held to
    // the T-12, its own measure, said so.
    const doc = economic ? t12p : roll;
    const docToday = (p: Piece) =>
      p === roll ? `today the deal's rent roll runs ${pct1(p.e.value!)} vacant` : `the deal's T-12 ran ${pct1(p.e.value!)} economic vacancy over its trailing year`;
    const econSaid = economicSaid(om.row.label);
    const noMarket = economic
      ? best === t12p
        ? ` ${econSaid}, so it is held to the deal's T-12, the same measure${
            stabilized && !ctx.plan ? " on the same footing: on a deal read as stabilized, a trailing year of what the building collected, not one day's count of doors" : ""
          }.`
        : stabilized && ctx.plan && best.e.kind === "rule_of_thumb"
          ? ` ${econSaid}, and the deal's T-12 is the building before the plan is done, so the class's norm decides${
              doc ? `; ${docToday(doc)}, ${todayWords(doc.e.value!, om.pct, "the assumption")}, never the figure the plan's NOI runs at` : ""
            }.`
          : best.e.kind === "rule_of_thumb"
            ? ` ${econSaid}, and no T-12 is on file to hold it to, so the class's norm decides.`
            : ""
      : stabilized && ctx.plan && best.e.kind === "rule_of_thumb"
        ? ` No fresh published vacancy figure for this market could be held to the stabilized assumption, so the class's norm decides${
            doc ? `; ${docToday(doc)}, ${todayWords(doc.e.value!, om.pct, "the assumption")}, never the figure the plan's NOI runs at` : ""
          }.`
        : stabilized && best.e.kind === "rule_of_thumb"
          ? // Today's rent roll never decides a stabilized figure: it is
            // the gap a lease-up has to close, said so beside the norm.
            ` No fresh published vacancy figure for this market could be held to the stabilized assumption, so the class's norm decides${
              doc
                ? `; ${ROLL_NOT_STABILIZED}: ${docToday(doc)}, ${todayWords(doc.e.value!, om.pct, "the assumption")}.${
                    doc.e.value! - om.pct > VACANCY_UNSUPPORTED_PTS ? ` ${leaseUpNotModelled(doc.e.value!, om.pct)}` : ""
                  }`
                : "."
            }`
          : "";
    // A survey's margin, where the figure that decides carries one (today's
    // occupancy held to the metro's survey), is said as the reach of "at it".
    const margin = best.tolerance !== SAME ? best.tolerance : null;
    judged = judge(om.pct, bestValue, "low", "pts", VACANCY_UNSUPPORTED_PTS, best.tolerance, (gap) =>
      Math.abs(gap) < SAME
        ? `The OM's ${pct1(om.pct)} is at the evidence's ${pct1(bestValue)}.${noMarket}${otherMeasure}`
        : gap > 0
          ? `The OM's ${pct1(om.pct)} is ${pts(gap)} under the evidence's ${pct1(bestValue)}${margin != null && gap <= margin ? `, inside its ±${margin}-pt margin` : ""}.${noMarket}${otherMeasure}`
          : `The OM's ${pct1(om.pct)} is ${pts(gap)} over the evidence's ${pct1(bestValue)} — the conservative side.${noMarket}${otherMeasure}`,
    );
  }
  // The engine is re-run at the figure that decided, printed first.
  let impact =
    ctx.derived && irrRuns(ctx)
      ? pctImpact(ctx.derived, "vacancyPct", 0, om.pct, bestValue, {
          what: "vacancy",
          om: pct1(om.pct),
          alt: pct1(bestValue),
          evidence: best.e.publisher,
          model: pct1(ctx.derived.inputs.vacancyPct * 100),
        })
      : null;
  // A plan deal re-runs its yield on cost: the stabilized NOI moved by the
  // vacancy gap on the stabilized gross the OM states — only where the OM's
  // figure is the stabilized allowance the plan's NOI runs at, never today's
  // occupancy, never on a gross the OM does not state, and only where the
  // figure that decided speaks to a stabilized building — the market's
  // published vacancy or the class's rule of thumb. The deal's rent roll or
  // T-12 is the building before the plan is done (`planVacancyStated`): its
  // vacancy decides the verdict as the gap the plan has to close, and a
  // stabilized NOI struck at it would run a lease-up's empty building as
  // the finished one.
  let noRerun: string | null = null;
  if (ctx.planYield) {
    const py = ctx.planYield;
    const gross = om.from === "vacancy" ? stabilizedGrossOf(ctx.rows, om.pct) : null;
    if (om.from !== "vacancy") noRerun = PLAN_VACANCY_TODAY;
    else if (best.e.kind !== "published" && best.e.kind !== "rule_of_thumb") noRerun = PLAN_VACANCY_DOCUMENT;
    else if (!gross) noRerun = PLAN_NO_GROSS;
    else {
      const altNoi = py.noi - (gross.gross * (bestValue - om.pct)) / 100;
      const run = yocSplit(
        yocImpact(py, "stabilizedNoi", 0, py.noi, altNoi, {
          what: "stabilized vacancy",
          om: pct1(om.pct),
          alt: pct1(bestValue),
          evidence: best.e.publisher,
          how: `the gap struck on ${gross.words}`,
        }),
      );
      impact = run.impact;
      noRerun = run.noRerun;
    }
  }
  return {
    key: "vacancy",
    title: title ?? TITLES.vacancy,
    omSays,
    evidence,
    gap: judged.gap,
    verdict: judged.verdict,
    decidedBy: 0,
    impact,
    ...(noRerun ? { noRerun } : {}),
    challenge: null,
    method: methodSentence("vacancy", evidence, 0, title),
    ...(best.e.kind === "rule_of_thumb" ? { ruleOfThumbOnly: true } : {}),
    ...(economic ? { measure: "economic" as const } : {}),
  };
}

// — Rent growth —

/**
 * A rent growth is held to the published figure that speaks to the deal's
 * own kind of rent, the first present in the class's order — ONE order,
 * lib/rent-growth-decider's, which the model's rent-growth check reads too,
 * so the deal page's card and this row are held to one figure. Each figure
 * is the trailing year's, and every other figure the read carries stays
 * shown beside the one that decides, never in its place.
 */
/** A row's pieces and the one figure that decides it, as the row reads
 *  them — exported so the screening model's seed (lib/model-evidence) runs
 *  the very figure the row decides by, never a second reading of it. The
 *  deciding figure's `index` is its place in `evidence`. */
export interface RowPieces {
  evidence: StressEvidence[];
  decided: DecidingFigure | null;
}

/** The OM's stated rent growth, percent, as the rent-growth row reads it. */
export function omRentGrowth(ex: ExtractionResult | null): { row: Row; pct: number } | null {
  return statedPct(rowsOf(ex), RENT_GROWTH_ROW, RENT_GROWTH_NOT);
}

/** The OM's stated expense growth, percent, as the expense-growth row reads it. */
export function omExpenseGrowth(ex: ExtractionResult | null): { row: Row; pct: number } | null {
  return statedPct(rowsOf(ex), EXPENSE_GROWTH_ROW);
}

/** The OM's stated pro forma cap, percent — its stabilized NOI over the
 *  price ("Pro forma cap", "Stabilized cap rate") — as the exit-cap row
 *  reads it; never an exit, a cap on cost, a yield or a later year's. */
export function omProFormaCap(ex: ExtractionResult | null): { row: Row; pct: number } | null {
  const row = rowsOf(ex).find((m) => PRO_FORMA_CAP_ROW.test(m.label) && !PRO_FORMA_CAP_NOT.test(m.label) && parsePct(m.value) != null) ?? null;
  const pct = row ? parsePct(row.value) : null;
  return row && pct != null ? { row, pct } : null;
}

/** The OM's stated exit cap, percent (a range at its first figure), as the
 *  exit-cap row reads it. */
export function omExitCap(ex: ExtractionResult | null): { row: Row; pct: number } | null {
  return statedPct(rowsOf(ex), EXIT_CAP_ROW);
}

/**
 * The rent-growth row's pieces: a regulation's allowance set apart (the
 * regime's, for the units it regulates — shown first and never in the
 * market's range, so never the figure that decides), the market's figures,
 * and the one that decides, the first of the class's order present
 * (lib/rent-growth-decider), printed first among the market's; the rest
 * beside it.
 */
export function rentGrowthPieces(mvm: ModelVsMarket | null, assetClass: string | null): RowPieces & { apart: number; market: number } {
  const check = checkOf(mvm, "rent_growth");
  const apart: StressEvidence[] = [];
  const market: StressEvidence[] = [];
  check?.published.forEach((f, i) => {
    const e = published(check, f, mvm?.grain ?? null);
    if (check.marks?.[i]?.role === "apart" || /allowance on the regulated units/i.test(f.label)) apart.push(e);
    else market.push(e);
  });
  const decided = rentGrowthDeciding(assetClass, candidatesOf(market));
  const found = decided ? market[decided.index] : null;
  // The deciding series' own average over the years its history holds:
  // where it is LOWER than the trailing year, it decides (`cautiousGrowth`),
  // the trailing year beside it; else it is shown last, deciding nothing.
  const average = found ? averagePiece(check, found, mvm) : null;
  const pick = decided && found ? cautiousGrowth({ ...decided, index: apart.length }, found, average, "lower") : null;
  const lead = pick?.averageDecides ? [average!, found!] : found ? [found] : [];
  const evidence = [...apart, ...lead, ...market.filter((m) => m !== found), ...(average && !pick?.averageDecides ? [average] : [])];
  return { evidence, decided: pick?.decided ?? null, apart: apart.length, market: market.length };
}

/**
 * A growth row's ONE deciding figure against the same series' longer view
 * (the review of 2026-10-23): a growth rate is run every year of the hold,
 * and one trailing year is a single draw of it. Where the stored history of
 * the very series that decides holds two years or more (lib/growth-average),
 * the more cautious of its trailing year and its compound average a year
 * decides — the LOWER for a rent growth, the HIGHER for an expense growth —
 * the other shown beside it; with no average stored, the trailing year
 * decides alone, as before. `decided` is the trailing year's, its index
 * where the deciding piece is drawn.
 */
function cautiousGrowth(
  decided: DecidingFigure,
  trailing: StressEvidence,
  average: StressEvidence | null,
  side: "lower" | "higher",
): { decided: DecidingFigure; averageDecides: boolean } {
  const a = average?.value;
  const t = trailing.value;
  const averageDecides = a != null && t != null && Number.isFinite(a) && (side === "lower" ? a < t - 1e-9 : a > t + 1e-9);
  if (!averageDecides) return { decided, averageDecides: false };
  const years = average!.label.match(/: average a year over (\d+) years$/)?.[1] ?? "";
  return {
    averageDecides: true,
    decided: {
      index: decided.index,
      figure: a!,
      label: average!.label,
      source: average!.publisher,
      asOf: average!.asOf,
      name: `${decided.name}, averaged a year over the ${years} years its stored history holds`,
      why: `the ${side} of its trailing year and its longer average, the cautious side for a rate run every year of the hold`,
    },
  };
}

/**
 * A growth row's longer view (lib/growth-average): the compound average a
 * year of the deciding series' own published changes over the whole years
 * its stored history holds, two or more — said as an average of published
 * figures, not a forecast — shown beside the trailing year that decides and
 * never a candidate to decide. Only of the very series that decides (the
 * check's `average` names it by its label); null where the history holds
 * under two years, or the series keeps none (Zillow's asking rents).
 */
function averagePiece(check: ModelCheck | null, decider: StressEvidence, mvm: ModelVsMarket | null): StressEvidence | null {
  const a = check?.average;
  if (!check || !a || a.of !== decider.label || !Number.isFinite(a.value)) return null;
  return published(check, a, mvm?.grain ?? null);
}

/** Whether a growth row's piece is the series' longer average
 *  (`averagePiece`'s label). */
const isAverage = (e: StressEvidence | undefined): boolean => !!e && /: average a year over \d+ years$/.test(e.label);

/** "Held to consumer prices, all items (the CPI), …: +3.4% over the year to
 *  Aug 2026 (BLS via FRED), a single year's change." — the gap's first
 *  sentence on a growth row, which says the decider is one year; where the
 *  series' longer average decides, it is said as the average it is. */
function heldGrowth(name: string, why: string, decider: StressEvidence): string {
  return isAverage(decider) ? `Held to ${name}, ${why}: ${decider.text} (${decider.publisher}).` : `Held to ${name}, ${why}: ${decider.text} (${decider.publisher}), a single year's change.`;
}

/** The last sentence of a growth row's gap: a trailing year is what the
 *  assumption is asked to beat (`TRAILING_YEAR_NOT_FORECAST`), and so is an
 *  average of published years where it decides (`AVERAGE_NOT_FORECAST`). */
const notForecast = (decider: StressEvidence): string => (isAverage(decider) ? AVERAGE_NOT_FORECAST : TRAILING_YEAR_NOT_FORECAST);

/** The longer average beside a growth row's one year, as the gap says it:
 *  "Beside it, not deciding: its average a year over the four years to Aug
 *  2026, +3.9%, compounded from its published changes — an average of
 *  published figures, not a forecast." "" with none. */
function averageSentence(evidence: StressEvidence[], decider?: StressEvidence): string {
  const a = evidence.find(isAverage);
  if (!a || a.value == null) return "";
  // Where the average decides, the trailing year is the one beside it.
  if (decider === a) {
    const t = evidence[evidence.indexOf(a) + 1];
    return t && t.value != null ? ` Beside it, not deciding: its trailing year, ${t.text} (${t.publisher}), a single year's change.` : "";
  }
  const over = a.text.match(/^[+−-]?\d+(?:\.\d+)?% a year (over the \S+ years to [^,]+),/)?.[1];
  return over ? ` Beside it, not deciding: the same series averaged ${evidenceFigureText("rent_growth", a.value)} a year ${over}, compounded from its published changes against a year earlier — an average of published figures, not a forecast.` : "";
}

function rentGrowthRow(ctx: Ctx): StressRow | null {
  const om = statedPct(ctx.rows, RENT_GROWTH_ROW, RENT_GROWTH_NOT);
  const pieces = rentGrowthPieces(ctx.mvm, ctx.assetClass);
  const evidence = pieces.evidence;
  if (!om && evidence.length === 0) return null;
  const pick = pieces.decided ? { i: pieces.decided.index, d: pieces.decided } : null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("rent growth rate"), value: null, page: null };
  if (!om) return unchecked("rent_growth", omSays, evidence, NO_FIGURE("rent growth rate"));
  // Lodging and licensed care read no rent index: the true reason, never
  // that nothing could be read.
  if (!pick) return unchecked("rent_growth", omSays, evidence, pieces.market === 0 && readsNoRentIndex(ctx.assetClass) ? NO_RENT_INDEX : NO_EVIDENCE);
  const decider = evidence[pick.i];
  const bestValue = decider.value!;
  const name = pick.d.name!;
  // "Held to Zillow's apartment asking rents, the figure for this kind of
  // rent: +1.6% over the year to Aug 2026 (Zillow Research)."
  const held = heldGrowth(name, pick.d.why!, decider);
  // The OM's figure is a rate a year; the evidence's is a trailing year's
  // change, said as one, and never as a forecast (`TRAILING_YEAR_NOT_FORECAST`);
  // where the series' history holds more years, the lower of the year and
  // their average decides and the other is beside it.
  const longer = averageSentence(evidence, decider);
  const tail = notForecast(decider);
  const judged = judge(om.pct, bestValue, "high", "pts", RENT_GROWTH_UNSUPPORTED_PTS, SAME, (gap) =>
    Math.abs(gap) < SAME
      ? `${held} The OM's ${pct1(om.pct)}/yr is at it.${longer} ${tail}`
      : gap > 0
        ? `${held} The OM's ${pct1(om.pct)}/yr is ${pts(gap)} over it.${longer} ${tail}`
        : `${held} The OM's ${pct1(om.pct)}/yr is ${pts(gap)} under it — the conservative side.${longer} ${tail}`,
  );
  const impact =
    ctx.derived && irrRuns(ctx)
      ? pctImpact(ctx.derived, "rentGrowthPct", pick.i, om.pct, bestValue, {
          what: "rent growth",
          om: `${pct1(om.pct)}/yr`,
          ...trailingWords("rent_growth", decider),
          evidence: decider.publisher,
          model: `${pct1(ctx.derived.inputs.rentGrowthPct * 100)}/yr`,
        })
      : null;
  return { key: "rent_growth", title: TITLES.rent_growth, omSays, evidence, gap: judged.gap, verdict: judged.verdict, decidedBy: pick.i, impact, challenge: null, method: methodSentence("rent_growth", evidence, pick.i) };
}

// — Expense growth —

/**
 * An expense growth is held to ONE figure (lib/stress-deciders
 * `expenseGrowthDecider`): consumer prices, all items — the broad price
 * level the expense base moves with — and core CPI only where the all-items
 * figure is not fresh. Core, the insurance premium index and the breakeven
 * are shown beside it, never held to: the lower of two price indexes had
 * decided, so a 2.5% expense growth held against core's 2.4% while the CPI
 * read 3.4%.
 */
/** The expense-growth row's pieces: every published figure the read
 *  carries, and the one that decides (`expenseGrowthDecider`). */
export function expenseGrowthPieces(mvm: ModelVsMarket | null): RowPieces {
  const evidence: StressEvidence[] = [];
  const check = checkOf(mvm, "expense_growth");
  if (check) for (const f of check.published) evidence.push(published(check, f, mvm?.grain ?? null));
  const decided = expenseGrowthDecider(candidatesOf(evidence));
  // The deciding series' own average over the years its history holds:
  // where it is HIGHER than the trailing year, it decides (`cautiousGrowth`),
  // drawn first with the trailing year beside it; else it is shown last,
  // deciding nothing.
  const average = decided ? averagePiece(check, evidence[decided.index], mvm) : null;
  if (!decided) return { evidence, decided };
  const trailing = evidence[decided.index];
  const pick = cautiousGrowth({ ...decided, index: 0 }, trailing, average, "higher");
  if (pick.averageDecides) return { evidence: [average!, trailing, ...evidence.filter((e) => e !== trailing)], decided: pick.decided };
  return { evidence: average ? [...evidence, average] : evidence, decided };
}

function expenseGrowthRow(ctx: Ctx): StressRow | null {
  const om = statedPct(ctx.rows, EXPENSE_GROWTH_ROW);
  const { evidence, decided } = expenseGrowthPieces(ctx.mvm);
  if (!om && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("expense growth rate"), value: null, page: null };
  if (!om) return unchecked("expense_growth", omSays, evidence, NO_FIGURE("expense growth rate"));
  if (!decided) return unchecked("expense_growth", omSays, evidence, NO_EVIDENCE);
  const evidenceIndex = decided.index;
  const bestValue = decided.figure;
  // "Held to consumer prices, all items (the CPI), the broad price level the
  // expense base moves with: +3.4% over the year to Aug 2026 (BLS via FRED)."
  const held = heldGrowth(decided.name!, decided.why!, evidence[evidenceIndex]);
  const longer = averageSentence(evidence, evidence[evidenceIndex]);
  const tail = notForecast(evidence[evidenceIndex]);
  const judged = judge(om.pct, bestValue, "low", "pts", EXPENSE_GROWTH_UNSUPPORTED_PTS, SAME, (gap) =>
    Math.abs(gap) < SAME
      ? `${held} The OM's ${pct1(om.pct)}/yr is at it.${longer} ${tail}`
      : gap > 0
        ? `${held} The OM's ${pct1(om.pct)}/yr is ${pts(gap)} under it.${longer} ${tail}`
        : `${held} The OM's ${pct1(om.pct)}/yr is ${pts(gap)} over it — the conservative side.${longer} ${tail}`,
  );
  const impact =
    ctx.derived && irrRuns(ctx)
      ? pctImpact(ctx.derived, "expenseGrowthPct", evidenceIndex, om.pct, bestValue, {
          what: "expense growth",
          om: `${pct1(om.pct)}/yr`,
          ...trailingWords("expense_growth", evidence[evidenceIndex]),
          evidence: evidence[evidenceIndex].publisher,
          model: `${pct1(ctx.derived.inputs.expenseGrowthPct * 100)}/yr`,
        })
      : null;
  return { key: "expense_growth", title: TITLES.expense_growth, omSays, evidence, gap: judged.gap, verdict: judged.verdict, decidedBy: evidenceIndex, impact, challenge: null, method: methodSentence("expense_growth", evidence, evidenceIndex) };
}

// — Exit cap —

/**
 * The exit-cap row's pieces: the OM's going-in cap (an exit tighter than
 * the entry is cap compression; none on a plan deal, whose going-in cap is
 * struck on today's income, nor on a price that buys no building), the
 * published figures the read carries — the 10-year, dated (a yield, not a
 * cap: the exit's spread over it is the read, never a comparable, so it
 * carries no figure), and the tracker's cap range where one is on file,
 * held to only where the read holds the model to it (fresh, dated, the
 * whole stock) — and the one figure that decides (`exitCapDecider`): the
 * higher of the going-in cap and the OM's own pro forma cap (its stabilized
 * NOI over the same price, the income an exit sells — the review of
 * 2026-10-23: an exit capitalizes a forward NOI, so a cap struck on today's
 * alone lets an exit under the stabilized yield pass as no compression), the
 * other beside it; else the tracker's range at its low end. No expansion over
 * the hold is added to either. `exitPct` is the exit the 10-year's spread is
 * said for (none: the figure alone).
 */
export function exitCapPieces(
  ex: ExtractionResult | null,
  plan: boolean,
  mvm: ModelVsMarket | null,
  exitPct: number | null,
  opts: { proForma?: boolean } = {},
): RowPieces & { goingIn: number | null; proForma: number | null; rangeRead: boolean } {
  const rows = rowsOf(ex);
  const evidence: StressEvidence[] = [];
  const goingRow = findGoingInCap(rows);
  const goingIn = goingRow ? parsePct(goingRow.value) : null;
  const goingInOk = goingIn != null && goingIn > 0 && !plan && buildingPriceOf(ex, 1) != null;
  if (goingInOk) {
    // The going-in cap's own row's page, validated against the deck.
    const page = pageOf(goingRow, ex);
    evidence.push({
      kind: "om_internal",
      label: GOING_IN_CAP_LABEL,
      text: `${pct2(goingIn!)} (${goingRow!.label}): an exit tighter than it is cap compression`,
      value: goingIn!,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
      ...(page != null ? { page } : {}),
    });
  }
  // The OM's pro forma cap: its stabilized NOI over the same price — the
  // income an exit capitalizes — on the same terms as the going-in cap (no
  // plan deal, a price that buys the building), inside the band a cap may be.
  const pfHit = omProFormaCap(ex);
  const proFormaRow = pfHit?.row ?? null;
  const proForma = pfHit?.pct ?? null;
  const proFormaOk = opts.proForma !== false && proForma != null && proForma > 0 && proForma < IMPLIED_CAP_CEILING * 100 && !plan && buildingPriceOf(ex, 1) != null;
  if (proFormaOk) {
    const page = pageOf(proFormaRow, ex);
    evidence.push({
      kind: "om_internal",
      label: PRO_FORMA_CAP_LABEL,
      text: `${pct2(proForma!)} (${proFormaRow!.label}): the yield the price earns on the OM's own stabilized NOI, the income an exit sells`,
      value: proForma!,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
      ...(page != null ? { page } : {}),
    });
  }
  const check = checkOf(mvm, "exit_cap");
  const trackerHeld = new Set<StressEvidence>();
  if (check) {
    const held = !/not held to it/.test(check.read);
    for (const f of check.published) {
      const e = published(check, f, mvm?.grain ?? null);
      if (/research tracker/i.test(f.label)) {
        evidence.push(e);
        if (held) trackerHeld.add(e);
      } else {
        const spread = exitPct != null ? Math.round((exitPct - f.value) * 100) : null;
        // The going-in cap's spread over the same yield, beside the exit's,
        // where the going-in cap is one the exit is held to.
        const entry = goingInOk && spread != null ? Math.round((goingIn! - f.value) * 100) : null;
        const entryWords =
          entry == null ? "" : entry === 0 ? "; the going-in cap sits at it" : `; the going-in cap's spread ${entry > 0 ? "over" : "under"} it is ${bps(entry)}`;
        // A yield, not a cap: no figure on the cap's track (the panel would
        // draw a 4.9% tick beside a 5.5% exit), the spread said in words.
        evidence.push({
          ...e,
          value: null,
          text:
            spread == null
              ? f.text
              : spread === 0
                ? `${f.text} — the exit sits at it${entryWords}`
                : `${f.text} — the exit's spread ${spread > 0 ? "over" : "under"} it is ${bps(spread)}${entryWords}`,
        });
      }
    }
  }
  // ONE figure decides (lib/stress-deciders `exitCapDecider`): the higher of
  // the OM's own going-in cap — the cap the deal is bought at — and its pro
  // forma cap — the stabilized NOI over the same price — else the tracker's
  // cap range at its low end. A tracker range beside either is shown and
  // decides nothing: it had turned an unsupported compression into a
  // stretched one wherever its low end reached the exit.
  const decided = exitCapDecider(candidatesOf(evidence, (e) => e.label === GOING_IN_CAP_LABEL || e.label === PRO_FORMA_CAP_LABEL || trackerHeld.has(e)));
  // The pro forma cap, where it decides, is drawn first, the going-in cap
  // beside it.
  if (decided && decided.label === PRO_FORMA_CAP_LABEL && decided.index > 0) {
    const [d] = evidence.splice(decided.index, 1);
    evidence.unshift(d);
    return { evidence, decided: { ...decided, index: 0 }, goingIn, proForma: proFormaOk ? proForma : null, rangeRead: !!check?.published.some((f) => /research tracker/i.test(f.label)) };
  }
  return { evidence, decided, goingIn, proForma: proFormaOk ? proForma : null, rangeRead: !!check?.published.some((f) => /research tracker/i.test(f.label)) };
}

function exitCapRow(ctx: Ctx): StressRow | null {
  const om = statedPct(ctx.rows, EXIT_CAP_ROW);
  const exit = om?.pct ?? (ctx.derived ? ctx.derived.inputs.exitCapPct * 100 : null);
  const { evidence, decided, goingIn, proForma, rangeRead } = exitCapPieces(ctx.ex, ctx.plan, ctx.mvm, exit);
  if (!om && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}${statesRange(om.row.value) ? " (a range, read at its first figure)" : ""}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("exit cap"), value: null, page: null };
  if (!om) return unchecked("exit_cap", omSays, evidence, NO_FIGURE("exit cap"));
  if (!decided) {
    // Said by what stopped the test, never "no going-in cap" beside one the
    // OM states: on a value-add, lease-up, conversion or development deal
    // the going-in cap is struck on today's income, not the stabilized one
    // the exit sells; on a price that buys no building it is no building's.
    const stated = (goingIn != null && goingIn > 0) || proForma != null;
    const range = rangeRead ? "the published cap range is held to nothing (stale, undated or a narrower stock)" : "no published cap range was read for this market and class";
    const why = !stated
      ? `The OM states no going-in or pro forma cap, and ${range}.`
      : ctx.plan
        ? `On a value-add, lease-up, conversion or development deal the OM's going-in cap is struck on today's income, not the stabilized income the exit sells, so the exit is not held to it; and ${range}.`
        : `The price buys no building, so its going-in cap is no building's to hold the exit to; and ${range}.`;
    return unchecked("exit_cap", omSays, evidence, why);
  }
  const alt = decided.figure;
  const onGoingIn = decided.label === GOING_IN_CAP_LABEL;
  const onProForma = decided.label === PRO_FORMA_CAP_LABEL;
  // The OM's other cap, beside the one that decides: the going-in cap beside
  // a pro forma cap that decides, the pro forma cap beside a going-in cap at
  // or over it.
  const besideCap =
    onProForma && goingIn != null && goingIn > 0
      ? ` Its ${pct2(goingIn)} going-in cap, on today's NOI, is beside it.`
      : onGoingIn && proForma != null
        ? ` Its ${pct2(proForma)} pro forma cap, on its stabilized NOI, ${Math.abs(proForma - alt) < SAME ? "is the same" : "sits under it"}, shown beside it.`
        : "";
  // No expansion over the hold is added to either cap: said where the exit
  // is flat to the cap that decides.
  const noExpansion = "adding some expansion over a hold is a common rule of thumb, which the screen does not hold it to";
  // The figures are percent points here; the threshold is in bps. At or over
  // the figure holds; tighter is stretched, and by 25 bps or more
  // unsupported (the threshold inclusive, below).
  const diffBps = (alt - om.pct) * 100;
  const judged = judge(om.pct, alt, "low", "bps", EXIT_CAP_UNSUPPORTED_BPS / 100 - SAME, SAME, (gap) =>
    onGoingIn
      ? // Flat to the entry holds: the code carries no expansion default (the
        // model exits at the higher of the going-in cap and the OM's own
        // exit, lib/model-evidence, never at an expansion of its own), so
        // none is invented here; the sentence names the habit as the rule of
        // thumb it is, held to nothing.
        Math.abs(diffBps) < SAME * 100
        ? `The OM's ${pct2(om.pct)} exit is flat to its ${pct2(alt)} going-in cap; ${noExpansion}.${besideCap}`
        : diffBps > 0
          ? `The OM's ${pct2(om.pct)} exit is ${bps(diffBps)} tighter than its ${pct2(alt)} going-in cap — cap compression.${besideCap}`
          : `The OM's ${pct2(om.pct)} exit is ${bps(diffBps)} over its ${pct2(alt)} going-in cap — the conservative side.${besideCap}`
      : onProForma
        ? // The pro forma cap is the price's yield on the stabilized NOI the
          // exit sells: an exit under it sells that income dearer than this
          // buyer pays for it.
          Math.abs(diffBps) < SAME * 100
          ? `The OM's ${pct2(om.pct)} exit is flat to its ${pct2(alt)} pro forma cap, the price's yield on its own stabilized NOI; ${noExpansion}.${besideCap}`
          : diffBps > 0
            ? `The OM's ${pct2(om.pct)} exit is ${bps(diffBps)} tighter than its ${pct2(alt)} pro forma cap — the price's yield on its own stabilized NOI, the income the exit sells — so it sells that income dearer than this buyer pays for it: cap compression.${besideCap}`
            : `The OM's ${pct2(om.pct)} exit is ${bps(diffBps)} over its ${pct2(alt)} pro forma cap, the price's yield on its own stabilized NOI — the conservative side.${besideCap}`
        : Math.abs(gap) < SAME
        ? `The OM's ${pct2(om.pct)} exit sits at the published cap range's low end, ${pct2(alt)}.`
        : gap > 0
          ? `The OM's ${pct2(om.pct)} exit is ${bps(gap * 100)} under the published cap range's low end, ${pct2(alt)}.`
          : `The OM's ${pct2(om.pct)} exit is ${bps(gap * 100)} over the published cap range's low end, ${pct2(alt)} — the conservative side.`,
  );
  judged.gap = { ...judged.gap, value: Math.round(diffBps), unit: "bps" };
  // 25 bps or more of compression is unsupported: the threshold is
  // inclusive, as the rule says.
  if (judged.verdict === "stretched" && judged.gap.value >= EXIT_CAP_UNSUPPORTED_BPS) judged.verdict = "unsupported";
  // The engine is re-run at the figure that decided.
  const evidenceIndex = decided.index;
  const impact =
    ctx.derived && irrRuns(ctx)
      ? pctImpact(ctx.derived, "exitCapPct", evidenceIndex, om.pct, alt, {
          what: "the exit cap",
          om: pct2(om.pct),
          alt: pct2(alt),
          evidence: onGoingIn ? "the going-in cap" : onProForma ? "the pro forma cap" : evidence[evidenceIndex].publisher,
          model: pct2(ctx.derived.inputs.exitCapPct * 100),
        })
      : null;
  return { key: "exit_cap", title: TITLES.exit_cap, omSays, evidence, gap: judged.gap, verdict: judged.verdict, decidedBy: evidenceIndex, impact, challenge: null, method: methodSentence("exit_cap", evidence, evidenceIndex) };
}

// — Debt —

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
/** `debtRateNote`'s own shape: "5-yr Treasury 4.78% (FRED, Sep 17, 2026) +
 *  200 bps multifamily spread, a screening default — enter your quote". */
const SEED_NOTE = /^(.+?) (\d+(?:\.\d+)?)% \((.+), ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})\) \+ (\d+) bps /;

/**
 * The index a seeded rate was built on — the fact under the spread — with
 * its own ISO date: from the `DebtIndex` the caller hands in, else read
 * back off the seed's note, whose one writer is lib/debt-index's
 * `debtRateNote` (a test holds the two paths to one answer). Null where
 * the note is not that writer's.
 */
function seedIndex(seed: RateSeed, given: DebtIndex | null): { name: string; pct: number; asOf: string; credit: string; spreadBps: number } | null {
  if (given) {
    return {
      name: indexName(given),
      pct: given.pct,
      asOf: given.asOf,
      credit: publisherTag({ id: given.id, source: "fred", label: given.short }) ?? "FRED",
      spreadBps: Math.round((seed.pct - given.pct) * 100),
    };
  }
  const m = seed.note.match(SEED_NOTE);
  if (!m || !(m[4] in MONTHS)) return null;
  const asOf = new Date(Date.UTC(Number(m[6]), MONTHS[m[4]], Number(m[5]))).toISOString().slice(0, 10);
  return { name: m[1], pct: Number(m[2]), asOf, credit: m[3], spreadBps: Number(m[7]) };
}

/** The OM's own acquisition loan's term — "Loan term: 10 years" — never an
 *  amortization, an interest-only period, a term left on another loan or an
 *  extension. */
const LOAN_TERM_ROW = /\b(?:loan|debt|financing|mortgage)\s+term\b|^term$/i;
const LOAN_TERM_NOT = new RegExp(`${DEBT_RATE_NOT.source}|amorti|interest[- ]only|\\bio\\b|remaining|extension|prepay|lockout|sheet|construction|bridge`, "i");
/** The hold the OM states: "Hold period: 7 years", "Investment horizon". */
const HOLD_ROW = /\bhold(?:ing)?\s+period\b|\binvestment\s+(?:horizon|period)\b|\bprojected\s+hold\b|^hold$/i;
const HOLD_NOT = /\blease|ground|\btenant/i;

/** A span the OM states in years or months, in months: one figure with its
 *  unit ("10 years", "10-year", "120 months"), or a bare figure under a
 *  label that names years. Two figures ("10 years, 30-year amortization"), a
 *  range or no unit is none. */
function statedMonths(row: Row | null): number | null {
  if (!row) return null;
  const v = row.value.trim();
  if (!v || /\d\s*(?:-|–|—|to)\s*\d/.test(v)) return null;
  const spans = [...v.matchAll(/(\d+(?:\.\d+)?)[\s-]*(years?|yrs?|months?|mos?)\b/gi)];
  if (spans.length > 1) return null;
  const n = spans.length === 1 ? Number(spans[0][1]) * (/^m/i.test(spans[0][2]) ? 1 : 12) : /\b(?:years?|yrs?)\b/i.test(row.label) && /^\d+(?:\.\d+)?$/.test(v) ? Number(v) * 12 : NaN;
  return Number.isFinite(n) && n > 0 && n <= 600 ? Math.round(n) : null;
}

/** "10-year", "7.5-year" — a span in months said in years. */
const yearsWord = (months: number): string => `${Math.round((months / 12) * 10) / 10}-year`;

/** The Treasury tenors the site reads (data/fred-series.json, the curve's own
 *  list), each as `treasuryForTerm` takes it — named here, priced only where
 *  a figure for it is in hand. */
const TREASURY_TENORS: readonly CurveSeed[] = SERIES.filter((s) => s.tenorMonths != null).map((s) => ({ id: s.id, short: s.short, tenorMonths: s.tenorMonths!, pct: NaN, asOf: "" }));
const tenorName = (t: Pick<CurveSeed, "short">): string => (/treasury/i.test(t.short) ? t.short : `${t.short} Treasury`);

/** The Treasury tenor nearest the OM's loan term, and its figure where one
 *  is in hand — the index the model priced off (the tenor nearest the hold),
 *  or the 10-year the model's read or the market check printed — else null
 *  (named, never priced). */
function termIndex(ctx: Ctx, termMonths: number, hold: { name: string; pct: number; asOf: string; credit: string }): { name: string; pct: number | null; asOf: string | null; credit: string; same: boolean } | null {
  const tenor = treasuryForTerm(TREASURY_TENORS, termMonths);
  if (!tenor) return null;
  const name = tenorName(tenor);
  if (name === hold.name) return { name, pct: hold.pct, asOf: hold.asOf, credit: hold.credit, same: true };
  if (tenor.id === "DGS10") {
    const read = checkOf(ctx.mvm, "exit_cap")?.published.find((f) => f.label === "10-year Treasury") ?? null;
    const stored = ctx.market?.liveBrief?.figures?.find((f) => f.key === "dgs10") ?? null;
    if (read) return { name, pct: read.value, asOf: read.asOf, credit: "FRED", same: false };
    if (stored) return { name, pct: stored.value, asOf: stored.asOf, credit: "FRED", same: false };
  }
  return { name, pct: null, asOf: null, credit: "FRED", same: false };
}

/** Why the debt row stands unchecked where the OM's rate floats: an index
 *  and a spread, or a coupon fixed only until it resets, is no fixed rate to
 *  set against a fixed one. Shown as stated, priced on nothing. */
export function floatingRateWhy(stated: string, f: FloatingRate): string {
  if (f.resets) return `The OM states a rate fixed only until it resets (${stated}), not a fixed rate for the loan's term, so it is shown as stated and priced on nothing.`;
  return `The OM states a floating rate (${stated}), ${f.index ? "an index plus a spread" : "a rate that moves"}, not a fixed rate, so it is shown as stated and priced on nothing.`;
}

function debtRow(ctx: Ctx): StressRow | null {
  // A note's buyer takes no acquisition loan on the collateral: the rate
  // on file is the note's own coupon (#416), and no row is built.
  if (interestOf(ctx.ex).kind === "note") return null;
  // A rate that names an index or says it floats ("SOFR + 3.25%", "SOFR +
  // 325 bps") is no fixed rate: its first percentage is the spread, never the
  // rate (lib/assumable-debt's own reader, research pass 37). It is shown as
  // stated and priced on nothing, and the lender tests run at the model's
  // rate.
  const rateRow = findMetric(ctx.rows, DEBT_RATE_ROW, DEBT_RATE_NOT);
  const floating = rateRow ? floatingRateOf(rateRow.value) : null;
  const om = floating ? null : statedPct(ctx.rows, DEBT_RATE_ROW, DEBT_RATE_NOT);
  const evidence: StressEvidence[] = [];
  // The lender's quote on file (lib/loan-quote): the rate the deal's own
  // loan terms state, read off the model built from them, a document of the
  // deal's own. It decides first; a floating quote (an index and a spread)
  // is shown as stated and priced on nothing, as an OM's floating rate is.
  const quote = ctx.loanQuote;
  if (quote) {
    const onFile = `${quote.filename}${quote.asOf ? `, on file since ${datedLong(quote.asOf)}` : ""}`;
    evidence.push({
      kind: "document",
      label: LOAN_QUOTE_LABEL,
      text:
        quote.ratePct != null
          ? `${pct2(quote.ratePct)} as the deal's loan terms state it (${onFile}): a lender's quote, not a screening default`
          : `${quote.stated} as the deal's loan terms state it (${onFile}): a floating rate, shown as stated and priced on nothing`,
      value: quote.ratePct,
      asOf: quote.asOf,
      publisher: "the deal's loan terms",
      scope: "deal",
    });
  }
  const seed = ctx.derived?.meta.rateSeed ?? null;
  const index = seed ? seedIndex(seed, ctx.indexGiven) : null;
  // The index is the Treasury tenor nearest the OM's own loan term where it
  // states one, else the tenor nearest the model's hold, which the model
  // prices off — each said so.
  const termRow = findMetric(ctx.rows, LOAN_TERM_ROW, LOAN_TERM_NOT);
  const termMonths = statedMonths(termRow);
  const holdMonths = ctx.derived?.inputs.holdMonths ?? HOLD_MONTHS;
  const term = index && termMonths != null ? termIndex(ctx, termMonths, index) : null;
  const termPage = termRow ? pageOf(termRow, ctx.ex) : null;
  const termSaid = termMonths != null ? `the OM's ${yearsWord(termMonths)} loan term${termPage != null ? ` (p. ${termPage})` : ""}` : "";
  // The index the decider stands on: the term's where its figure is in hand.
  const decideOn = term && !term.same && term.pct != null && term.asOf ? { name: term.name, pct: term.pct, asOf: term.asOf, credit: term.credit } : index;
  // Today's index, the fact, dated and published; then the class's
  // screening spread over it, a rule of thumb named as one — never the two
  // as one published figure, since the spread is nobody's print.
  if (seed && index && decideOn) {
    const tenorWhy = term?.same
      ? `the tenor nearest ${termSaid} and the model's ${yearsWord(holdMonths)} hold`
      : term && decideOn !== index
        ? `the tenor nearest the model's ${yearsWord(holdMonths)} hold; ${termSaid} is set against the ${term.name} below`
        : term
          ? `the tenor nearest the model's ${yearsWord(holdMonths)} hold; the ${term.name}, the tenor nearest ${termSaid}, was not read here, so the rate is set against the hold's`
          : `the tenor nearest the model's ${yearsWord(holdMonths)} hold, since the OM states no loan term`;
    evidence.push({
      kind: "published",
      label: `The index the model prices off: ${index.name}`,
      text: `${pct2(index.pct)} (${index.credit}, ${datedLong(index.asOf)}), ${tenorWhy}`,
      value: index.pct,
      asOf: index.asOf,
      publisher: index.credit,
      scope: "nation",
    });
    if (decideOn !== index) {
      evidence.push({
        kind: "published",
        label: `The index for ${termSaid}: ${decideOn.name}`,
        text: `${pct2(decideOn.pct)} (${decideOn.credit}, ${datedLong(decideOn.asOf)}), the Treasury tenor nearest the term`,
        value: decideOn.pct,
        asOf: decideOn.asOf,
        publisher: decideOn.credit,
        scope: "nation",
      });
    }
    const termAllIn = Math.round((decideOn.pct + index.spreadBps / 100) * 100) / 100;
    evidence.push({
      kind: "rule_of_thumb",
      label: SEEDED_RATE_LABEL,
      text:
        decideOn === index
          ? `+${index.spreadBps} bps over the index, the class's screening default, not a quote: ${pct2(seed.pct)} all in — ${seed.note}`
          : `+${index.spreadBps} bps over the ${decideOn.name}, the class's screening default, not a quote: ${pct2(termAllIn)} all in`,
      value: decideOn === index ? seed.pct : termAllIn,
      asOf: null,
      publisher: "a screening default",
      scope: "class",
    });
  } else if (seed) {
    evidence.push({
      kind: "rule_of_thumb",
      label: SEEDED_RATE_ONLY_LABEL,
      text: `${pct2(seed.pct)} — ${seed.note}`,
      value: seed.pct,
      asOf: null,
      publisher: "a screening default",
      scope: "class",
    });
  }
  // The 10-year as the market check read it, unless the term's index above
  // is the 10-year already.
  const ten = ctx.market?.liveBrief?.figures?.find((f) => f.key === "dgs10") ?? null;
  if (ten && !(seed && index && decideOn && decideOn !== index && /^10-yr/.test(decideOn.name))) {
    evidence.push({
      kind: "published",
      label: "10-year Treasury, as the market check read it",
      // Dated as the other published lines are (a daily series, its day in
      // words, the index line's own `datedLong`), never a raw ISO day.
      text: `${pct2(ten.value)} (FRED, ${datedLong(ten.asOf)})`,
      value: null,
      asOf: ten.asOf,
      publisher: "FRED",
      scope: "nation",
    });
  }
  // The lender tests at the sizer's screening defaults, the binding one
  // named, on the model's own year-1 NOI and price.
  const inputs = ctx.derived?.inputs ?? null;
  const priceOk = ctx.derived && irrRuns(ctx) && inputs && inputs.purchasePrice > 0;
  const rate = om?.pct ?? (inputs ? inputs.allInRatePct * 100 : null);
  if (priceOk && rate != null) {
    const noi = year1Noi(inputs!);
    const s = sizeLoan({
      price: inputs!.purchasePrice,
      noi,
      ratePct: rate,
      amortYears: inputs!.amortMonths > 0 ? inputs!.amortMonths / 12 : null,
      io: inputs!.ioMonths >= inputs!.holdMonths,
      maxLtvPct: SIZER_LENDER_TESTS.maxLtvPct,
      minDscr: SIZER_LENDER_TESTS.minDscr,
      minDebtYieldPct: SIZER_LENDER_TESTS.minDebtYieldPct,
    });
    const binding = s.tests.find((t) => t.binding);
    if (s.loan != null && binding) {
      const modelLoan = computeUnderwrite(inputs!).sourcesUses.loanAmount;
      // The model's loan by its own measure, a share of cost; and the OM's
      // own leverage by its measure, named as the OM's beside the defaults
      // — the line had quoted the sizer's 65% LTV with the OM's stated 60%
      // loan-to-value nowhere in the row.
      const ltc = Number.isFinite(inputs!.ltc) && inputs!.ltc > 0 ? `, ${Math.round(inputs!.ltc * 1000) / 10}% of cost,` : "";
      const lev = statedLeverage(ctx.rows);
      const levPage = lev ? pageOf(lev.row, ctx.ex) : null;
      const omLeverage = lev
        ? `, beside the OM's own ${Math.round(lev.pct * 10) / 10}% ${lev.measure}${levPage != null ? ` (p. ${levPage})` : ""}`
        : "";
      evidence.push({
        kind: "rule_of_thumb",
        label: "Lender tests at screening defaults, the binding one named",
        text: `${binding.label} (${binding.setAt}) binds at ${money(s.loan)} on the model's year-1 NOI at ${pct2(rate)}; the model's loan${ltc} is ${money(modelLoan)} — ${SIZER_LENDER_TESTS.maxLtvPct}% LTV, ${SIZER_LENDER_TESTS.minDscr.toFixed(2)}x and ${SIZER_LENDER_TESTS.minDebtYieldPct}% debt yield are screening defaults${omLeverage}`,
        value: null,
        asOf: null,
        publisher: "a rule of thumb",
        scope: "class",
      });
    }
    // Negative leverage: the model's going-in cap under the rate. It is the
    // model's own arithmetic, not the memorandum against itself, so it is
    // filed as the screening read it is; the rate is the OM's where the OM
    // states one, else the model's, a screening default.
    const cap = (noi / inputs!.purchasePrice) * 100;
    if (Number.isFinite(cap) && cap > 0) {
      const whose = om ? `the OM's ${pct2(rate)} rate` : `the model's ${pct2(rate)} rate, a screening default`;
      evidence.push({
        kind: "rule_of_thumb",
        label: "Negative leverage: the model's going-in cap against the loan's rate",
        text:
          cap < rate - SAME
            ? `The model's year-1 NOI over its price is ${pct2(cap)}, ${bps((rate - cap) * 100)} under ${whose}: negative leverage — the cap is under the loan's rate, so each borrowed dollar lowers the year-one cash yield`
            : `The model's year-1 NOI over its price is ${pct2(cap)}, ${bps((cap - rate) * 100)} over ${whose}: positive leverage — each borrowed dollar raises the year-one cash yield`,
        value: null,
        asOf: null,
        publisher: "the model's own figures",
        scope: "deal",
      });
    }
  }
  if (!om && !floating && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : rateRow && floating
      ? { text: `${rateRow.label}: ${rateRow.value}`, value: null, page: pageOf(rateRow, ctx.ex) }
      : { text: NO_FIGURE("loan rate"), value: null, page: null };
  if (rateRow && floating) return unchecked("debt", omSays, evidence, floatingRateWhy(rateRow.value.trim(), floating));
  if (!om) return unchecked("debt", omSays, evidence, NO_FIGURE("loan rate"));
  // ONE figure decides (lib/stress-deciders `debtDecider`): the lender's
  // quote on file, else today's index plus the class's screening spread. The
  // bare index, the 10-year, the lender tests and the leverage read are shown
  // beside it; the bare index sets only how far under the screening default
  // a rate may read unsupported (below).
  const decided = debtDecider(candidatesOf(evidence));
  if (!decided) {
    return unchecked(
      "debt",
      omSays,
      evidence,
      quote?.floating ? "The lender's quote on file floats, priced on nothing, and no index was read today to set the OM's rate against." : "No index was read today to set the OM's rate against.",
    );
  }
  if (evidence[decided.index].label === LOAN_QUOTE_LABEL) return quotedDebtRow(ctx, omSays, evidence, decided.index, om.pct, decided.figure);
  if (!seed) return unchecked("debt", omSays, evidence, "No index was read today to set the OM's rate against.");
  const allIn = decided.figure;
  const tenorClause = decideOn && decideOn !== index ? `, the ${decideOn.name} for the term` : "";
  // The figures are percent points here; the threshold is in bps.
  const judged = judge(om.pct, allIn, "low", "bps", DEBT_UNSUPPORTED_BPS / 100 - SAME, SAME, () => {
    const d = (allIn - om.pct) * 100;
    return Math.abs(d) < SAME * 100
      ? tenorClause
        ? `The OM's ${pct2(om.pct)} is at the index plus the class's spread${tenorClause}, ${pct2(allIn)}.`
        : `The OM's ${pct2(om.pct)} is at the seeded ${pct2(allIn)}.`
      : d > 0
        ? `The OM's ${pct2(om.pct)} is ${bps(d)} under the index plus the class's spread${tenorClause}, ${pct2(allIn)}.`
        : `The OM's ${pct2(om.pct)} is ${bps(d)} over the index plus the class's spread${tenorClause}, ${pct2(allIn)} — the conservative side.`;
  });
  judged.gap = { ...judged.gap, value: Math.round((allIn - om.pct) * 100), unit: "bps" };
  // The spread is a screening default, so a rate under the index plus the
  // spread is stretched at most; only a rate under the bare index — under
  // the fact — reads unsupported.
  if (judged.verdict === "unsupported" && decideOn && om.pct >= decideOn.pct - SAME) judged.verdict = "stretched";
  const seedIndexAt = decided.index;
  const impact =
    ctx.derived && irrRuns(ctx)
      ? pctImpact(ctx.derived, "allInRatePct", seedIndexAt, om.pct, allIn, {
          what: "the all-in rate",
          om: pct2(om.pct),
          alt: pct2(allIn),
          evidence: "the index plus the class's spread",
          model: pct2(ctx.derived.inputs.allInRatePct * 100),
        })
      : null;
  // The rate is held to the index plus the class's screening spread: the
  // spread is the site's own default, so the verdict is a rule of thumb's.
  return { key: "debt", title: TITLES.debt, omSays, evidence, gap: judged.gap, verdict: judged.verdict, decidedBy: seedIndexAt, impact, challenge: null, method: methodSentence("debt", evidence, seedIndexAt), ruleOfThumbOnly: true };
}

/**
 * The debt row where the lender's quote on file decides it: the OM's rate
 * held to the rate the deal's own loan terms state, a document of the deal's
 * — no screening default, so it may read unsupported past
 * DEBT_UNSUPPORTED_BPS under it — and the return re-run at the quote, the
 * model's rate one input apart.
 */
function quotedDebtRow(ctx: Ctx, omSays: StressRow["omSays"], evidence: StressEvidence[], at: number, omPct: number, quotePct: number): StressRow {
  const judged = judge(omPct, quotePct, "low", "bps", DEBT_UNSUPPORTED_BPS / 100 - SAME, SAME, () => {
    const d = (quotePct - omPct) * 100;
    return Math.abs(d) < SAME * 100
      ? `The OM's ${pct2(omPct)} is at the lender's quote on file, ${pct2(quotePct)}.`
      : d > 0
        ? `The OM's ${pct2(omPct)} is ${bps(d)} under the lender's quote on file, ${pct2(quotePct)}.`
        : `The OM's ${pct2(omPct)} is ${bps(d)} over the lender's quote on file, ${pct2(quotePct)} — the conservative side.`;
  });
  judged.gap = { ...judged.gap, value: Math.round((quotePct - omPct) * 100), unit: "bps" };
  const impact =
    ctx.derived && irrRuns(ctx)
      ? pctImpact(ctx.derived, "allInRatePct", at, omPct, quotePct, {
          what: "the all-in rate",
          om: pct2(omPct),
          alt: `the lender's quote on file, ${pct2(quotePct)}`,
          evidence: "",
          model: pct2(ctx.derived.inputs.allInRatePct * 100),
        })
      : null;
  return { key: "debt", title: TITLES.debt, omSays, evidence, gap: judged.gap, verdict: judged.verdict, decidedBy: at, impact, challenge: null, method: methodSentence("debt", evidence, at) };
}

// — NOI —

const PRO_FORMA_RENT_ROW = /\b(?:pro ?forma|market|projected|stabili[sz]ed)\s+(?:avg\.?\s+|average\s+)?rents?\b/i;
const RENT_NOT = /growth|psf|\/\s*sf|per\s+sf|comp/i;

/** A stored day as a sentence writes it: "May 31, 2026" (lib/debt-index
 *  `datedLong`), never the raw ISO day beside a page's worded dates; any
 *  other form (a month, a year, a period) is left as written. */
function proseDay(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? datedLong(d) : d;
}

function noiRow(ctx: Ctx): StressRow | null {
  const c = ctx.actuals?.noiComparison ?? null;
  const picked = pickOmNoi(ctx.rows, ctx.kind);
  const omLabel = c?.omLabel ?? picked?.label ?? null;
  const omValue = c?.omNoi ?? picked?.noi ?? null;
  const omRow = omLabel ? (ctx.rows.find((m) => m.label === omLabel) ?? null) : null;
  const evidence: StressEvidence[] = [];
  const t12 = ctx.actuals?.t12;
  if (t12 && t12.summary.noi != null && Number.isFinite(t12.summary.noi) && t12.summary.noi !== 0) {
    evidence.push({
      kind: "document",
      label: T12_NOI_LABEL,
      text: `${money(t12.summary.noi)}${t12.summary.noiDerived ? " (derived: EGI less expenses)" : ""} (${t12.periodEnd ? `TTM to ${proseDay(t12.periodEnd)}` : "period not stated"})`,
      value: t12.summary.noi,
      asOf: t12.periodEnd,
      publisher: "the deal's T-12",
      scope: "deal",
    });
  }
  // The rent roll's in-place rent against the OM's pro forma rent, in words
  // — a rent, not a year's NOI, so it never drives the gap. Said on the
  // class's own yardstick, the actuals card's (`avgRentOf`): a month a unit
  // (a key, a pad, a bed) where the class quotes rent that way, else per SF
  // a year — never a suite's month beside a market rent a foot a year.
  const rr = ctx.actuals?.rentRoll;
  const proForma = findMetric(ctx.rows, PRO_FORMA_RENT_ROW, RENT_NOT);
  const rrClass = ctx.actuals?.assetClass ?? ctx.assetClass;
  const avg = rr ? avgRentOf(rr.summary, rrClass) : null;
  if (rr && avg && avg.text !== "—" && proForma) {
    const asOf = rr.asOf ?? rr.summary.asOfUsed ?? null;
    const perYear = !rentQuotedMonthly(rrClass) && !/\/yr$/.test(avg.text) ? " a year" : "";
    evidence.push({
      kind: "document",
      label: "The rent roll's in-place rent against the OM's pro forma rent",
      text: `${avg.text}${perYear} in place${avg.basis ? `, ${avg.basis}` : ""}${asOf ? ` (as of ${proseDay(asOf)})` : ""} against the OM's ${proForma.label.toLowerCase()} of ${proForma.value}`,
      value: null,
      asOf,
      publisher: "the deal's rent roll",
      scope: "deal",
    });
  }
  // The OM's other income against the T-12's, where both state one: words
  // beside the NOI, never deciding it (the model folds other income into its
  // rent line, so it is no input of its own).
  const otherRow = findMetric(ctx.rows, OTHER_INCOME_ROW, OTHER_INCOME_NOT);
  const omOther = otherRow && !statesRange(otherRow.value) && !/%/.test(otherRow.value) ? parseUsd(otherRow.value, 1_000) : null;
  const t12Other = t12?.summary.otherIncome ?? null;
  if (t12 && otherRow && omOther != null && t12Other != null && Number.isFinite(t12Other) && t12Other > 0) {
    const page = pageOf(otherRow, ctx.ex);
    const d = (omOther - t12Other) / t12Other;
    evidence.push({
      kind: "document",
      label: OTHER_INCOME_LABEL,
      text: `the OM's ${lowerFirst(otherRow.label)} of ${money(omOther)}${page != null ? ` (p. ${page})` : ""} against the T-12's ${money(t12Other)} (${t12.periodEnd ? `TTM to ${proseDay(t12.periodEnd)}` : "period not stated"}), ${
        Math.abs(d) <= 0.005 ? "in line" : d > 0 ? `${pct1(d * 100)} over it` : `${pct1(-d * 100)} under it`
      }: beside the NOI, never deciding it`,
      value: null,
      asOf: t12.periodEnd,
      publisher: "the deal's T-12",
      scope: "deal",
    });
  }
  // The memorandum's own in-place figure against its stabilized one.
  const figs = noiFigures(ctx.rows);
  const inPlace = figs.find((f) => f.kind === "in_place") ?? figs.find((f) => f.kind === "year1");
  const stabilized = figs.find((f) => f.kind === "stabilized");
  if (inPlace && stabilized && inPlace.label !== stabilized.label) {
    evidence.push({
      kind: "om_internal",
      label: OM_IN_PLACE_NOI_LABEL,
      text: `${inPlace.label} ${money(inPlace.value)} against ${stabilized.label} ${money(stabilized.value)} (${((stabilized.value / inPlace.value - 1) * 100).toFixed(1)}% over it)`,
      value: inPlace.value,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
    });
  }
  if (omValue == null && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] =
    omValue != null
      ? { text: `${omLabel}: ${omRow?.value ?? money(omValue)}`, value: omValue, page: pageOf(omRow, ctx.ex) }
      : { text: NO_FIGURE("NOI"), value: null, page: null };
  if (omValue == null) return unchecked("noi", omSays, evidence, NO_FIGURE("NOI"));
  // ONE figure decides (lib/stress-deciders `noiDecider`): the T-12; the
  // OM's own in-place figure stands in only where the figure under test is
  // the pro forma and no T-12 is on file. The rest are shown beside it.
  const decided = noiDecider(candidatesOf(evidence, (e) => e.kind === "document" || (e.kind === "om_internal" && omLabel !== e.label && omValue !== e.value)));
  if (!decided) {
    // Said by what stopped the test: a second NOI printed beside the row is
    // never called absent. On a value-add, lease-up, conversion or
    // development deal the OM's pro forma is the business plan, not a second
    // read of today's income, so it is shown and not held to.
    const second = evidence.some((e) => e.kind === "om_internal");
    const why = ctx.plan && second
      ? "No T-12 is on file. On a value-add, lease-up, conversion or development deal the OM's pro forma NOI is the business plan, not today's income, so the in-place figure is not held to it."
      : second
        ? "No T-12 is on file, and the OM's other NOI is the figure under test itself."
        : "No T-12 is on file, and the OM states no second NOI to hold its figure to.";
    return unchecked("noi", omSays, evidence, why);
  }
  const best = evidence[decided.index];
  const share = (omValue - best.value!) / Math.abs(best.value!);
  // The memorandum's own in-place figure is the memorandum against itself,
  // not a document of the building's: a pro forma over it reads stretched
  // at most, and only a T-12 can read it unsupported.
  const pastBand = Math.abs(share) <= NOI_IN_LINE_BAND || share < 0 ? "holds" : share > NOI_UNSUPPORTED_SHARE ? "unsupported" : "stretched";
  const verdict: StressVerdict = pastBand === "unsupported" && best.kind === "om_internal" ? "stretched" : pastBand;
  const gap: StressRow["gap"] = {
    value: Math.round(omValue - best.value!),
    unit: "usd",
    text:
      Math.abs(share) <= 0.005
        ? `The OM's ${money(omValue)} is in line with ${best.publisher}'s ${money(best.value!)}.`
        : share > 0
          ? `The OM's ${money(omValue)} is ${pct1(share * 100)} (${money(omValue - best.value!)}) over ${best.publisher}'s ${money(best.value!)}.`
          : `The OM's ${money(omValue)} is ${pct1(-share * 100)} under ${best.publisher}'s ${money(best.value!)} — the conservative side.`,
  };
  const evidenceIndex = evidence.indexOf(best);
  let impact: StressImpact | null = null;
  if (ctx.derived && irrRuns(ctx)) {
    // The rent line that makes the OM's NOI, and the one that makes the
    // evidence's, each swapped in on its own; the model's own year-1 NOI
    // (the T-12's where one anchors it) is named where it is neither.
    const inputs = ctx.derived.inputs;
    const omRent = rentForNoi(inputs, omValue);
    const altRent = rentForNoi(inputs, best.value!);
    if (omRent != null && altRent != null) {
      impact = runImpact("inPlaceRentAnnual", { ...inputs, inPlaceRentAnnual: omRent }, { ...inputs, inPlaceRentAnnual: altRent }, evidenceIndex, omRent, altRent, inputs.inPlaceRentAnnual, {
        what: "year-1 NOI",
        om: money(omValue),
        alt: money(best.value!),
        evidence: best.publisher,
        model: money(year1Noi(inputs)),
      });
    }
  }
  return { key: "noi", title: TITLES.noi, omSays, evidence, gap, verdict, decidedBy: decided.index, impact, challenge: null, method: methodSentence("noi", evidence, decided.index) };
}

// — Market rent —

/** Why a stabilized deal's market-rent row carries no re-run: the model runs
 *  today's rent, which the NOI row carries. */
export const MARKET_RENT_NO_RERUN =
  "No return is re-run: the model runs today's rent, which the NOI row tests, so a market rent is no input of its own.";

/** Why a plan deal other than a value-add carries none. */
export const PLAN_MARKET_RENT_VALUE_ADD_ONLY =
  "On a lease-up, conversion or development the pro forma rent is the finished building's whole rent, not a gap on rents let today, so it is not carried to the stabilized NOI and no yield on cost is re-run on it.";

/** Why a value-add's market rent carries none where no count is stated. */
export const PLAN_MARKET_RENT_NO_COUNT =
  "The OM states no count to carry the rent's gap to the stabilized NOI on, so no yield on cost is re-run on it.";

/** Why the market rent is left out of a plan headline beside the premium. */
export const PLAN_MARKET_RENT_BESIDE_PREMIUM =
  "the renovation premium already moves the stabilized NOI by the rent the renovated doors earn, so the market rent beside it would count that rent twice";

/**
 * The market-rent row (the owner's decision of 2026-10-21): the OM's pro
 * forma or market rent, on the class's own yardstick (a month a unit where
 * the class quotes rent that way, else a square foot a year), set against
 * the median of the memorandum's own lease comps graded `supports` — three
 * or more stating a rent on that yardstick (lib/lease-comp-rent, the comps'
 * own floor, `MEDIAN_FLOOR`), else no median and the row unchecked, the
 * comps named. The memorandum against itself (`om_internal`), as the basis
 * row's sale comps are. Beside it, never deciding: the rent roll's in-place
 * rent, said as the gap the OM claims to close, and Zillow's asking rent for
 * the metro's apartments on an apartment building (all home types where the
 * apartment figure was not read) or all home types on rented homes, never
 * beside a bed's, a pad's or any other class's rent — dated, the metro's and
 * never the building's. Holds within
 * BASIS_STRETCH_PCT (5%) over the median, unsupported past
 * BASIS_UNSUPPORTED_PCT (15%) — the comps' own lines. No re-run on a
 * stabilized deal (the model runs today's rent, which the NOI row carries);
 * on a value-add, the plan's yield on cost with the stabilized NOI moved by
 * the gap on every unit (or foot) the OM counts, at its own stabilized
 * vacancy where it states one.
 */
function marketRentRow(ctx: Ctx): StressRow | null {
  const words = assetWords(ctx.assetClass);
  const monthly = rentQuotedMonthly(ctx.assetClass);
  const bySf = !monthly && words.income === "rent / SF / yr";
  if (!monthly && !bySf) return null;
  const yard: "/mo" | "/SF" = monthly ? "/mo" : "/SF";
  const say = (n: number) => (monthly ? `$${Math.round(n).toLocaleString("en-US")}/mo` : `$${n.toFixed(2)}/SF`);
  const on = (r: ReturnType<typeof statedRent>) => (monthly ? r.perUnitMonthly : r.perSfYear);
  // The yardstick in words, in the class's own noun: "a month a unit", "a
  // month a space".
  const nounOne = words.noun?.one ?? "unit";
  const yardWords = monthly ? `a month ${withArticle(nounOne)}` : "a square foot a year";
  const readOpts = { bareSfIsYear: bySf, unitFloor: monthlyRentFloor(nounOne) };
  const row = findMetric(ctx.rows, PRO_FORMA_RENT_ROW, RENT_NOT);
  let om = row ? on(statedRent(row.value, readOpts)) : null;
  // A bare dollar figure under a label that names the month ("Market rent
  // (monthly)") is a month's rent, as stated.
  if (row && om == null && monthly && /\bmo(?:nth(?:ly)?)?\b/i.test(row.label) && /^\$?\s?[\d,]+(?:\.\d+)?$/.test(row.value.trim())) om = parseUsd(row.value, 100);
  const leaseComps = ctx.brokerComps?.leaseComps ?? [];
  const evidence: StressEvidence[] = [];
  // The memorandum's lease comps, each graded by the comps step: a median
  // only over the comps graded `supports`, three or more stating a rent on
  // the yardstick; the others named, left out.
  const stating = leaseComps.map((comp) => ({ comp, figure: on(statedRent(comp.detail, readOpts)) })).filter((c): c is { comp: (typeof leaseComps)[number]; figure: number } => c.figure != null);
  const clean = stating.filter((c) => c.comp.support === "supports");
  // On a class quoted by the foot, a rent on one lease basis is not the same
  // rent on another (a gross rent carries the expenses a net one passes
  // through): where the comps graded clean state different bases, no median
  // is struck over them.
  const bases = bySf ? [...new Set(clean.map((c) => statedLeaseBasis(c.comp.detail)).filter((b): b is LeaseBasis => b != null))] : [];
  const mixedBases = bases.length > 1 ? bases : null;
  const named = (cs: typeof stating) => cs.map((c) => `${c.comp.name} ${say(c.figure)}`).join("; ");
  let median3: number | null = null;
  if (leaseComps.length > 0) {
    median3 = clean.length >= MEDIAN_FLOOR && !mixedBases ? median(clean.map((c) => c.figure)) : null;
    const leftOut = (["favorable", "stretched"] as const)
      .map((grade) => {
        const cs = stating.filter((c) => c.comp.support === grade);
        return cs.length > 0 ? `; left out, graded ${LEFT_OUT_GRADE[grade]}: ${named(cs)}` : "";
      })
      .join("");
    const cleanPages = new Set(clean.map((c) => locatedPage(c.comp.page, ctx.ex?.totalPages)));
    const page = median3 != null && cleanPages.size === 1 ? [...cleanPages][0] : null;
    evidence.push({
      kind: "om_internal",
      label: MARKET_RENT_COMPS_LABEL,
      text: `${stating.length} of ${leaseComps.length} state a rent ${yardWords}${clean.length ? `; graded clean (supports): ${named(clean)}` : ""}${
        median3 != null
          ? ` — median ${say(median3)} over the ${clean.length}`
          : mixedBases
            ? `, stated on different lease bases (${joinWords(mixedBases)}), so no median is struck over them`
            : clean.length > 0
              ? `, too few graded clean for a median (${MEDIAN_FLOOR} or more)`
              : ", none graded clean (supports), so none is set against the OM's rent"
      }${leftOut}`,
      value: median3 != null ? Math.round(median3 * 100) / 100 : null,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
      ...(page != null ? { page } : {}),
    });
  }
  // The rent roll's in-place rent on the class's yardstick: the gap the OM
  // claims to close, never the figure that decides.
  const rr = ctx.actuals?.rentRoll;
  const rrClass = ctx.actuals?.assetClass ?? ctx.assetClass;
  const inPlace = rr ? (monthly ? rr.summary.avgRentMonthly : rr.summary.weightedAvgRentPsf) : null;
  if (rr && inPlace != null && Number.isFinite(inPlace) && inPlace > 0) {
    const avg = avgRentOf(rr.summary, rrClass);
    const asOf = rr.asOf ?? rr.summary.asOfUsed ?? null;
    const gapWords = om != null ? `, ${say(Math.abs(om - inPlace))} ${om >= inPlace ? "under" : "over"} the OM's ${say(om)}: the gap the OM claims to close` : "";
    evidence.push({
      kind: "document",
      label: "The rent roll's in-place rent",
      text: `${say(inPlace)} in place${avg.basis ? `, ${avg.basis}` : ""}${asOf ? ` (as of ${proseDay(asOf)})` : ""}${gapWords}; today's rent, not a market's`,
      value: Math.round(inPlace * 100) / 100,
      asOf,
      publisher: "the deal's rent roll",
      scope: "deal",
    });
  }
  // Zillow's asking rent for the metro, as the market check read it, only
  // beside the rent it measures: an apartment's (the apartments' figure,
  // else all home types) and a rented home's (all home types) — never a bed's
  // or a pad's rent, or any other class's, which no index of Zillow's
  // prices. The metro's, never the building's.
  const zClass = assetClassKey(ctx.assetClass);
  const zKeys: readonly string[] = zClass === "multifamily" ? ["zori_mfr_rent", "zori_rent"] : zClass === "sfr_btr" ? ["zori_rent"] : [];
  if (monthly && words.residential && zKeys.length > 0) {
    const figs = ctx.market?.liveBrief?.figures ?? [];
    const z = zKeys.map((k) => figs.find((f) => f.key === k)).find((f) => f != null) ?? null;
    if (z && Number.isFinite(z.value) && z.value > 0) {
      const apartments = z.key === "zori_mfr_rent";
      const when = /^\d{4}-\d{2}-\d{2}$/.test(z.asOf) ? periodLabel(z.asOf, "monthly") : z.asOf;
      const grain = ctx.market?.liveBrief?.grain === "state" ? "the state's" : "the metro's";
      evidence.push({
        kind: "published",
        label: apartments ? "Asking rent, apartments, metro area" : "Asking rent, all home types, metro area",
        text: `${say(z.value)} (${when}), ${grain} asking rent ${apartments ? "for apartments" : "across all home types"} before concessions: ${grain === "the state's" ? "the state's" : "the metro's"}, not this building's`,
        value: Math.round(z.value),
        asOf: z.asOf,
        publisher: "Zillow Research",
        scope: ctx.market?.liveBrief?.grain === "state" ? "state" : "metro",
      });
    }
  }
  if (om == null && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] =
    row && om != null
      ? { text: `${say(om)}: ${row.label} ${row.value}`, value: om, page: pageOf(row, ctx.ex) }
      : { text: row ? `${row.label}: ${row.value}, not ${monthly ? "a month's rent a unit" : "a rent a square foot a year"} as stated` : NO_FIGURE("pro forma or market rent"), value: null, page: row ? pageOf(row, ctx.ex) : null };
  const base = { yardstick: yard };
  if (om == null) return { ...unchecked("market_rent", omSays, evidence, row ? omSays.text : NO_FIGURE("pro forma or market rent")), ...base };
  const decided = marketRentDecider(candidatesOf(evidence));
  if (!decided) {
    const why =
      leaseComps.length === 0
        ? "The memorandum lists no lease comps, so no median of comps graded clean can be set against its rent."
        : mixedBases
          ? `The memorandum's lease comps graded clean (supports) state their rents on different lease bases (${joinWords(mixedBases)}), and a rent on one basis is not the same rent on another, so no median is struck over them.`
          : `Fewer than ${MEDIAN_FLOOR} of the memorandum's lease comps graded clean (supports) state a rent ${yardWords} (${clean.length} of ${leaseComps.length}), so no median is struck: the comps' own floor.`;
    return { ...unchecked("market_rent", omSays, evidence, why), ...base };
  }
  const best = decided.figure;
  const sharePct = ((om - best) / best) * 100;
  const verdict: StressVerdict = sharePct <= BASIS_STRETCH_PCT ? "holds" : sharePct > BASIS_UNSUPPORTED_PCT ? "unsupported" : "stretched";
  const ofBest = `the median of its lease comps graded clean, ${say(best)}`;
  const gap: StressRow["gap"] = {
    value: Math.round(sharePct * 10) / 10,
    unit: "pct",
    text:
      Math.abs(sharePct) < 0.5
        ? `The OM's ${say(om)} is at ${ofBest}.`
        : sharePct > 0
          ? `The OM's ${say(om)} is ${pct1(sharePct)} over ${ofBest}.`
          : `The OM's ${say(om)} is ${pct1(-sharePct)} under ${ofBest} — the conservative side.`,
  };
  // A stabilized deal re-runs nothing (the model runs today's rent, which
  // the NOI row carries); a value-add moves its stabilized NOI by the gap on
  // every unit or foot the OM counts, at its own stated vacancy.
  let impact: StressImpact | null = null;
  let noRerun: string | null = ctx.plan ? null : MARKET_RENT_NO_RERUN;
  if (ctx.planYield) {
    if (ctx.kind !== "value_add") noRerun = PLAN_MARKET_RENT_VALUE_ADD_ONLY;
    else {
      const count = monthly ? unitCountFromMetrics(ctx.rows) : buildingSfFromMetrics(ctx.rows);
      if (count == null || !(count > 0)) noRerun = PLAN_MARKET_RENT_NO_COUNT;
      else {
        const v = omVacancy(ctx.rows);
        const occupied = v && v.from === "vacancy" ? 1 - v.pct / 100 : 1;
        const year = (om - best) * count * (monthly ? 12 : 1) * occupied;
        const noun = monthly ? countNoun(unitCountRow(ctx.rows)?.label, ctx.assetClass) : "square feet";
        const run = yocSplit(
          yocImpact(ctx.planYield, "stabilizedNoi", decided.index, ctx.planYield.noi, ctx.planYield.noi - year, {
            what: "the market rent",
            om: say(om),
            alt: say(best),
            evidence: "the lease comps' median",
            how: `the gap on the ${count.toLocaleString("en-US")} ${noun}${monthly ? ", twelve months each" : ""}, ${
              v && v.from === "vacancy" ? `at the OM's own ${pct1(v.pct)} vacancy` : "at full occupancy, since the OM states no stabilized vacancy"
            }, the stabilized NOI read as carrying the OM's rent on every one`,
          }),
        );
        impact = run.impact;
        noRerun = run.noRerun;
      }
    }
  }
  return {
    key: "market_rent",
    title: TITLES.market_rent,
    omSays,
    evidence,
    gap,
    verdict,
    decidedBy: decided.index,
    impact,
    ...(noRerun ? { noRerun } : {}),
    challenge: null,
    method: methodSentence("market_rent", evidence, decided.index),
    ...base,
  };
}

// — Taxes —

/**
 * The OM's tax bill as the taxes row tests it. On a plan deal the memorandum
 * may state two bills: today's, on today's assessment, and its pro forma's
 * line, the one the stabilized NOI carries. Every row is searched for each,
 * never the first alone. The OM's figure tested is the pro forma's line where
 * stated (else today's bill). A deal read as stabilized reads its first bill
 * for both. The operating-expense row leaves this same bill out of the OM's
 * total (`opexRow`), so the two rows never hold one line twice.
 */
function omTaxLine(ctx: Pick<Ctx, "rows" | "plan">): { proFormaRow: Row | null; todayRow: Row | null; billRow: Row | null; bill: number | null } {
  const taxRows = ctx.rows.filter((m) => TAX_BILL_ROW.test(m.label) && !TAX_BILL_NOT.test(m.label) && taxBillOf(m.value) != null);
  const proFormaRow = ctx.plan ? (taxRows.find((m) => PLAN_FIGURE.test(m.label)) ?? null) : null;
  const todayRow = ctx.plan ? (taxRows.find((m) => !PLAN_FIGURE.test(m.label)) ?? null) : (taxRows[0] ?? null);
  const billRow = proFormaRow ?? todayRow;
  return { proFormaRow, todayRow, billRow, bill: billRow ? taxBillOf(billRow.value) : null };
}

/** The T-12's real estate tax line: the first line naming a tax that is no
 *  abatement, payroll or transfer tax and no line combined with insurance. */
const t12TaxLineOf = (t12: ActualsRead["t12"] | null | undefined) => t12?.summary.opex.find((l) => /\btax/i.test(l.label) && !T12_TAX_NOT.test(l.label)) ?? null;
/** The T-12's property premium: no mortgage or title policy, no line
 *  combined with taxes. */
const t12InsuranceLineOf = (t12: ActualsRead["t12"] | null | undefined) => t12?.summary.opex.find((l) => /insurance/i.test(l.label) && !T12_INSURANCE_NOT.test(l.label)) ?? null;

/**
 * A T-12's operating expenses on an operating-expense row's footing: its
 * expense total less its tax and insurance lines where the row leaves those
 * out (`StressRow.footing`) — the one reading the row and the track record
 * strike. Null where the T-12 states no expense total, or breaks out no line
 * the footing leaves out (`missing` names it). The tax and insurance lines
 * are subtracted here, never read as a figure of their own: a seller's bill
 * and premium score no row.
 */
export function t12OpexOnFooting(
  t12: ActualsRead["t12"] | null | undefined,
  less: readonly ("taxes" | "insurance")[],
): { value: number; total: number; tax: number | null; insurance: number | null } | { missing: ("tax" | "insurance")[] } | null {
  const total = t12?.summary.totalOpex ?? null;
  if (!t12 || total == null || !Number.isFinite(total) || !(total > 0)) return null;
  const tax = t12TaxLineOf(t12);
  const ins = t12InsuranceLineOf(t12);
  const missing: ("tax" | "insurance")[] = [
    ...(less.includes("taxes") && !(tax && tax.amount > 0) ? (["tax"] as const) : []),
    ...(less.includes("insurance") && !(ins && ins.amount > 0) ? (["insurance"] as const) : []),
  ];
  if (missing.length > 0) return { missing };
  const taxOut = less.includes("taxes") ? tax!.amount : null;
  const insOut = less.includes("insurance") ? ins!.amount : null;
  return { value: total - (taxOut ?? 0) - (insOut ?? 0), total, tax: taxOut, insurance: insOut };
}

function taxesRow(ctx: Ctx): StressRow | null {
  // The rate the reset is struck at is today's bill over today's assessed
  // value — never a pro forma bill over an assessment it was not levied on.
  const { proFormaRow, todayRow, billRow, bill } = omTaxLine(ctx);
  const todayBill = todayRow ? taxBillOf(todayRow.value) : null;
  const assessedRow = findMetric(ctx.rows, ASSESSED_ROW, ASSESSED_NOT);
  const assessed = assessedRow ? parseUsd(assessedRow.value, 10_000) : null;
  // The building's price off the stated ask (a share's grossed up ONCE to
  // the whole, none on a note or the land) — never off the derived model's
  // price, which on a share is already the whole and grossed up again read
  // a 49% share's $20M as $83M.
  const price = buildingPriceOf(ctx.ex, askingPriceOf(ctx.ex));
  const evidence: StressEvidence[] = [];
  // The reset bill the memorandum's own figures imply on the price — struck
  // only on an effective rate a jurisdiction levies on market value: past
  // TAX_RATE_CEILING the assessment is a fraction of value or a figure was
  // misread, and the piece is shown with no figure, deciding nothing.
  let rateMisread = false;
  if (todayBill != null && assessed != null && assessed > 0 && price != null && ctx.derived?.sources.purchasePrice?.provenance !== "assumption") {
    const rate = todayBill / assessed;
    const reset = rate * price;
    rateMisread = rate > TAX_RATE_CEILING;
    const billWords = proFormaRow ? `today's ${money(todayBill)} bill` : money(todayBill);
    evidence.push({
      kind: "om_internal",
      label: RESET_BILL_LABEL,
      text: rateMisread
        ? `${billWords} over ${money(assessed)} assessed is ${(rate * 100).toFixed(2)}%, past the ${Math.round(TAX_RATE_CEILING * 100)}% ceiling the screen holds for an effective rate on market value, so no reset bill is struck on it`
        : `${billWords} over ${money(assessed)} assessed is ${(rate * 100).toFixed(2)}%, which on the ${money(price)} price is ${money(reset)} a year if the sale resets the assessment to the price`,
      value: rateMisread ? null : Math.round(reset),
      asOf: null,
      publisher: "the memorandum's own figures",
      scope: "deal",
    });
  }
  // A stated abatement: the full bill, read against the model's sale. The
  // step-up lands on the buyer only where the abatement ends inside the
  // hold (lib/tax-abatement's own rule, "the sale is the clock"); one that
  // ends after the sale is the next buyer's to price, and one with no
  // stated end is placed against nothing — either is shown with no figure
  // to compare, never run from year 1.
  const abatement = readTaxAbatement(ctx.ex, new Date(`${ctx.readOn}T12:00:00Z`));
  let abatementInHold = false;
  if (abatement && (abatement.unabatedTaxes != null || abatement.stepUp != null)) {
    const full = abatement.unabatedTaxes ?? (abatement.abatedTaxes != null && abatement.stepUp != null ? abatement.abatedTaxes + abatement.stepUp : null);
    const holdMonths = ctx.derived?.inputs.holdMonths ?? HOLD_MONTHS;
    const end = abatement.end;
    abatementInHold = end != null && end.yearsToTheDay * 12 < holdMonths;
    const placed =
      end == null
        ? "; the OM states no end, so the step-up is placed against no sale"
        : abatementInHold
          ? `; it ends inside the model's ${Math.round(holdMonths / 12)}-year hold, so the full bill is the buyer's`
          : `; it ends after the model's ${Math.round(holdMonths / 12)}-year hold, so the step-up is the next buyer's to price`;
    evidence.push({
      kind: "om_internal",
      label: ABATEMENT_LABEL,
      text: `${abatement.headline}${placed}`,
      value: full != null && abatementInHold ? Math.round(full) : null,
      asOf: end?.ends ?? null,
      publisher: "the offering memorandum",
      scope: "deal",
    });
  }
  // The T-12's own tax line: the seller's actual bill. It decides only where
  // nothing above does — no reset bill and no abatement ending in the hold —
  // and the OM's line sits under it past SAME_SHARE on a building already
  // delivered: the OM against its own building's history, a working floor
  // and a rule of thumb, never the bill a new owner pays (the insurance
  // row's rule).
  const t12 = ctx.actuals?.t12;
  const t12Tax = t12TaxLineOf(t12);
  const t12Bill = t12Tax && t12Tax.amount > 0 ? t12Tax.amount : null;
  const aboveDecides = evidence.some((e) => e.kind === "om_internal" && e.value != null);
  const t12TaxDecides =
    !aboveDecides && bill != null && t12Bill != null && (t12Bill - bill) / t12Bill > SAME_SHARE && !notYetDelivered(ctx.kind) && !ctx.planYield?.plan.forward;
  if (t12Tax && t12Bill != null) {
    evidence.push({
      kind: "document",
      label: T12_TAX_LABEL,
      text: `${money(t12Tax.amount)} (${t12Tax.label}${t12?.periodEnd ? `, TTM to ${proseDay(t12.periodEnd)}` : ""})${t12TaxDecides ? `; ${TAX_T12_FLOOR}` : ""}`,
      value: Math.round(t12Tax.amount),
      asOf: t12?.periodEnd ?? null,
      publisher: "the deal's T-12",
      scope: "deal",
    });
  }
  if (bill == null && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = billRow && bill != null
    ? { text: `${billRow.label}: ${billRow.value}`, value: bill, page: pageOf(billRow, ctx.ex) }
    : { text: NO_FIGURE("tax bill"), value: null, page: null };
  if (bill == null) return unchecked("taxes", omSays, evidence, NO_FIGURE("tax bill"));
  // ONE figure decides (lib/stress-deciders `taxesDecider`): the reset bill
  // the OM's own figures imply, else the unabated bill an abatement ends into
  // inside the hold; the T-12's tax line (the seller's bill) is beside it.
  const decided = taxesDecider(candidatesOf(evidence, (e) => e.kind === "om_internal" || (e.label === T12_TAX_LABEL && t12TaxDecides)));
  if (!decided) {
    return unchecked(
      "taxes",
      omSays,
      evidence,
      rateMisread
        ? TAX_RATE_MISREAD
        : assessed == null
          ? "The OM states no assessed value to work the reset bill from; the rate is the assessor's to give."
          : todayBill == null && proFormaRow
            ? PLAN_TAX_NO_TODAY
            : NO_EVIDENCE,
    );
  }
  const best = evidence[decided.index];
  if (best.label === T12_TAX_LABEL) return t12TaxRow(ctx, omSays, evidence, decided.index, bill, billRow!, best.value!, assessed == null);
  // The grade is struck on the reset (or unabated) bill, as its thresholds
  // are written ("15% under the reset bill"); a sentence that says "over the
  // OM's line" divides by the OM's line.
  const share = (best.value! - bill) / Math.abs(best.value!);
  // Both figures are the OM's: the bill against the reset its own figures
  // imply, or the abated bill against the unabated one it states.
  const abated = best.label === ABATEMENT_LABEL;
  // Whether a sale resets the assessment is the jurisdiction's to say, and
  // the code asserts none: the reset bill is a CONDITIONAL re-strike of the
  // OM's own figures, never an observed bill, so it reads stretched at most
  // and every sentence says the condition. A stated unabated bill the
  // abatement ends into inside the hold is no condition, and may read
  // unsupported.
  const graded: StressVerdict = share <= SAME_SHARE ? "holds" : share > TAX_UNSUPPORTED_SHARE ? "unsupported" : "stretched";
  const verdict: StressVerdict = !abated && graded === "unsupported" ? "stretched" : graded;
  const ifReset = "if the sale resets the assessment to the price";
  const gap: StressRow["gap"] = {
    value: Math.round(best.value! - bill),
    unit: "usd",
    text: abated
      ? Math.abs(share) <= SAME_SHARE
        ? `The OM's ${money(bill)} is at the ${money(best.value!)} it states as the unabated bill.`
        : share > 0
          ? `The OM's ${money(bill)} is ${money(best.value! - bill)} (${pct1(share * 100)}) under the ${money(best.value!)} it states as the unabated bill.`
          : `The OM's ${money(bill)} is over the ${money(best.value!)} it states as the unabated bill — the conservative side.`
      : Math.abs(share) <= SAME_SHARE
        ? `If the sale resets the assessment to the price, the bill is ${money(best.value!)}, at the OM's ${money(bill)} line.`
        : share > 0
          ? `If the sale resets the assessment to the price, the bill is ${money(best.value!)}, ${money(best.value! - bill)} (${pct1(((best.value! - bill) / Math.abs(bill)) * 100)}) over the OM's ${money(bill)} line — whether it does is the jurisdiction's to say.`
          : `If the sale resets the assessment to the price, the bill is ${money(best.value!)}, under the OM's ${money(bill)} line — the conservative side.`,
  };
  const evidenceIndex = evidence.indexOf(best);
  const impact =
    ctx.derived && irrRuns(ctx)
      ? expenseImpact(
          ctx,
          bill,
          best.value!,
          t12Tax && t12Tax.amount > 0 ? t12Tax.amount : null,
          "tax line",
          evidenceIndex,
          abated
            ? { what: "the tax line", om: money(bill), alt: money(best.value!), evidence: "the unabated bill", omSide: "the abated" }
            : { what: "the tax line", om: money(bill), alt: `the ${money(best.value!)} bill ${ifReset}`, evidence: "" },
        )
      : null;
  // A plan deal re-runs its yield on cost on the tax line only where the OM
  // states the bill as its pro forma's line, the one its stabilized NOI
  // carries; the swap is the bill less the evidence's, never a line inferred.
  // A reset on a development, a conversion or a forward purchase is no
  // figure for that line: the building the plan delivers is assessed when
  // it is finished, not at the price paid today, so its verdict stands as a
  // floor and nothing is re-run.
  let planImpact: StressImpact | null = null;
  let noRerun: string | null = null;
  if (ctx.planYield) {
    const py = ctx.planYield;
    if (!abated && (ctx.kind === "development" || ctx.kind === "conversion" || py.plan.forward)) noRerun = PLAN_TAX_NOT_ASSESSED;
    else if (!PLAN_FIGURE.test(billRow!.label)) noRerun = PLAN_TAX_NOT_PRO_FORMA;
    else {
      const run = yocSplit(
        yocImpact(
          py,
          "stabilizedNoi",
          evidenceIndex,
          py.noi,
          py.noi - (best.value! - bill),
          abated
            ? { what: "the tax line", om: money(bill), alt: money(best.value!), evidence: "the unabated bill" }
            : { what: "the tax line", om: money(bill), alt: `the ${money(best.value!)} bill ${ifReset}`, evidence: "" },
        ),
      );
      planImpact = run.impact;
      noRerun = run.noRerun;
    }
  }
  return {
    key: "taxes",
    title: TITLES.taxes,
    omSays,
    evidence,
    gap,
    verdict,
    decidedBy: decided.index,
    impact: impact ?? planImpact,
    ...(noRerun ? { noRerun } : {}),
    challenge: null,
    method: methodSentence("taxes", evidence, decided.index),
  };
}

/** What the T-12's tax line is where it decides the row: the seller's own
 *  bill, a working floor and a rule of thumb, never the bill a new owner pays. */
export const TAX_T12_FLOOR = "the seller's own bill, a working floor and a rule of thumb (a sale rarely lowers the bill), not the bill a new owner pays";

/** What a re-run at the T-12's tax bill is, said wherever its part of the
 *  headline is (`StressHeadlinePart.conditional`). */
export const TAX_T12_FLOOR_CONDITION = "at the seller's own T-12 bill, a working floor, not a new owner's bill";

/**
 * The taxes row where the seller's T-12 bill decides it: no reset bill can be
 * struck (no assessed value stated) and no abatement ends inside the hold, and
 * the OM's line sits under the T-12's past SAME_SHARE. The OM against its own
 * building's history, read stretched at most: the T-12's bill is a floor (a
 * sale rarely lowers a bill, and a reset would raise it), never the bill a new
 * owner pays. The return is re-run at it, the expense line as `expenseImpact`
 * sets it — swapped, never added to a line that already carries it; a plan
 * deal's yield on cost only where the OM states its bill as its pro forma's
 * line.
 */
function t12TaxRow(ctx: Ctx, omSays: StressRow["omSays"], evidence: StressEvidence[], evidenceIndex: number, bill: number, billRow: Row, floor: number, noAssessed: boolean): StressRow {
  const share = (floor - bill) / floor;
  const gap: StressRow["gap"] = {
    value: Math.round(floor - bill),
    unit: "usd",
    text: `The OM's ${money(bill)} tax line is ${money(floor - bill)} (${pct1(share * 100)}) under the ${money(floor)} the seller paid over the T-12: the OM against its own building's history. ${noAssessed ? "With no assessed value stated, no reset bill is struck" : "No reset bill is struck"}; the T-12's is a working floor and a rule of thumb (a sale rarely lowers the bill), not the bill a new owner pays, so the row reads stretched at most.`,
  };
  const words = { what: "the tax line", om: money(bill), alt: `the seller's ${money(floor)} T-12 bill, a working floor and a rule of thumb, not a new owner's bill`, evidence: "" };
  const impact = ctx.derived && irrRuns(ctx) ? expenseImpact(ctx, bill, floor, floor, "tax line", evidenceIndex, words) : null;
  let planImpact: StressImpact | null = null;
  let noRerun: string | null = null;
  if (ctx.planYield) {
    if (!PLAN_FIGURE.test(billRow.label)) noRerun = PLAN_TAX_NOT_PRO_FORMA;
    else {
      const run = yocSplit(yocImpact(ctx.planYield, "stabilizedNoi", evidenceIndex, ctx.planYield.noi, ctx.planYield.noi - (floor - bill), words));
      planImpact = run.impact;
      noRerun = run.noRerun;
    }
  }
  return {
    key: "taxes",
    title: TITLES.taxes,
    omSays,
    evidence,
    gap,
    verdict: "stretched",
    decidedBy: evidenceIndex,
    impact: impact ?? planImpact,
    ...(noRerun ? { noRerun } : {}),
    challenge: null,
    method: methodSentence("taxes", evidence, evidenceIndex),
  };
}

/**
 * The model's one expense line, run twice: once carrying the OM's figure for
 * one of its lines (a tax bill, a premium) and once the evidence's, every
 * other input as the model has it — so the two runs differ in that line
 * alone. What the model's line already carries of it decides each side:
 *   - where the line is the T-12's expense load (`sources.expenseLines.doc`
 *     "T-12"), it already holds the T-12's own figure for that line
 *     (`t12Line`, scaled to the model's load where the model's line does not
 *     tie to the T-12's total): the OM's run is the line less the T-12's
 *     figure plus the OM's, the evidence's the line less the T-12's figure
 *     plus the evidence's — never the gap added on top of a line that
 *     already holds the T-12's figure, which counted the gap twice;
 *   - where the line is the class's ratio struck on the model's NOI and the
 *     class's ratio is the evidence (`classFigure`, the operating-expense row
 *     with no T-12 on file), it is read as carrying the class's figure: the
 *     OM's run is the line less the class's figure plus the OM's, the
 *     evidence's the model's own line — never the gap added on top of a line
 *     that already holds the class's figure, which counted the gap twice;
 *   - otherwise, where the line is the class's ratio struck on the OM's NOI,
 *     it is read as carrying the OM's figure: the OM's run is the model's own
 *     and the evidence's moves it by the gap.
 * `omValue` and `altValue` on the impact are the two runs' whole expense
 * lines, which the headline's cases set the line to. `words.evidence` is ""
 * where `alt` is already a whole phrase.
 */
function expenseImpact(
  ctx: Ctx,
  omFigure: number,
  altFigure: number,
  t12Line: number | null,
  lineWord: string,
  evidenceIndex: number,
  words: { what: string; om: string; alt: string; evidence: string; omSide?: string },
  classFigure: number | null = null,
): StressImpact | null {
  const derived = ctx.derived;
  if (!derived) return null;
  const lines = derived.inputs.expenseLines;
  if (lines.length === 0) return null;
  const total = lines.reduce((s, l) => s + l.annual, 0);
  const fromT12 = derived.sources.expenseLines?.doc === "T-12";
  const t12Total = ctx.actuals?.t12?.summary.totalOpex ?? null;
  // What the model's line holds of this line: the T-12's own figure where
  // the line is the T-12's load and the T-12 breaks the line out.
  let carried: number | null = null;
  let carriedWords = "";
  if (fromT12 && t12Line != null && t12Line > 0 && t12Total != null && t12Total > 0) {
    const scale = total / t12Total;
    const tied = Math.abs(scale - 1) <= 0.01;
    carried = tied ? t12Line : t12Line * scale;
    carriedWords = tied
      ? `its one expense line at the T-12's ${money(total)} total, with the T-12's ${money(t12Line)} ${lineWord} in it`
      : `its one expense line at the T-12's expense load, ${money(total)}, with the T-12's ${money(t12Line)} ${lineWord} in it scaled to that load, ${money(carried)}`;
  }
  // The class's ratio deciding a line the model struck on that ratio: the
  // line holds the class's figure (meta.defaultExpenseRatio is carried only
  // where the model struck its expenses on it).
  if (carried == null && !fromT12 && classFigure != null && derived.meta.defaultExpenseRatio) {
    carried = classFigure;
    carriedWords = `its one expense line struck on the class's ratio, read as carrying the class's ${money(classFigure)} ${lineWord}`;
  }
  const omTotal = carried != null ? total - carried + omFigure : total;
  const altTotal = carried != null ? total - carried + altFigure : total + (altFigure - omFigure);
  const at = (t: number) => lines.map((l, i) => (i === 0 ? { ...l, annual: l.annual + (t - total) } : l));
  const impact = runImpact(
    "expenseLines",
    { ...derived.inputs, expenseLines: at(omTotal) },
    { ...derived.inputs, expenseLines: at(altTotal) },
    evidenceIndex,
    omTotal,
    altTotal,
    total,
    { ...words, model: carriedWords || money(total) },
  );
  // The T-12's load with no such line broken out: the line is read as
  // carrying the OM's figure, which the note says it may not.
  if (fromT12 && carried == null) {
    const caveat = `The model's expense line is the T-12's expense load, which breaks out no ${lineWord}, so it is read as carrying the OM's figure and the evidence's run moves it by the gap.`;
    impact.note = `${impact.note} ${caveat}`;
    impact.caveat = caveat;
  }
  return impact;
}

// — Insurance —

/** "The OM's $310k moved by the national premium index" — the insurance
 *  row's index figure where the OM states a premium. */
export const INSURANCE_MOVED_LABEL = (premium: string): string => `The OM's ${premium} moved by the national premium index`;

/** Why the insurance row stands unchecked where the OM states a premium and
 *  no T-12 premium is on file: what would test it is a quote for a new owner,
 *  and nothing on file is one. */
export const INSURANCE_NO_QUOTE =
  "No quote for a new owner and no T-12 premium on file: the OM's premium is the seller's expiring policy, and the national index moves the OM's own figure, so nothing here tests what a buyer will be quoted.";

/** Why it stands unchecked where the OM's premium is at or over the seller's
 *  own T-12 premium: the seller's history cannot say a new owner pays less. */
export const INSURANCE_AT_HISTORY =
  "No quote for a new owner on file, and the OM's premium is at or over the seller's own T-12 premium: the seller's history cannot say a new owner will pay less, and the national index moves the OM's own figure, so nothing here tests what a buyer will be quoted.";

/** Why it stands unchecked on a development or a conversion: the T-12
 *  insures the building before the plan delivers a new one. */
export const INSURANCE_NOT_DELIVERED =
  "No quote for a new owner on file, and the T-12's premium insures the building before the plan delivers a new one, so it is no floor for the finished building's premium; nothing here tests what a buyer will be quoted.";

/** Why the insurance row carries no re-run where nothing decides it: nothing
 *  on file tests the premium, and a run at the seller's own T-12 premium
 *  would print a move no evidence makes. */
export const INSURANCE_NO_RERUN =
  "No return is re-run: nothing on file tests the premium, and the T-12's premium beside it is the same seller's history, not a figure to swap in.";

/** The same, with no T-12 premium on file to name. */
export const INSURANCE_NO_RERUN_NO_T12 = "No return is re-run: nothing on file tests the premium.";

/** What the T-12's premium is beside the OM's where it decides nothing, said
 *  on its evidence line. */
export const INSURANCE_T12_HISTORY = "the seller's history, not a test of a new owner's quote";

/** What the T-12's premium is where it decides the row: the seller's own
 *  actual, a working floor and a rule of thumb (a new owner is rarely quoted
 *  under it), never a quote and never a fact about a new owner's premium. */
export const INSURANCE_T12_FLOOR = "the seller's own premium, a working floor and a rule of thumb (a new owner is rarely quoted under it), not a quote";

/** What a re-run at the T-12's premium is, said wherever its part of the
 *  headline is (`StressHeadlinePart.conditional`). */
export const INSURANCE_FLOOR_CONDITION = "at the seller's own T-12 premium, a working floor, not a quote";

/** The plan's no-re-run where the premium is not the pro forma's line. */
export const PLAN_INSURANCE_NOT_PRO_FORMA =
  "The OM states its premium as no pro forma line, so which premium the stabilized NOI carries is not stated, and no yield on cost is re-run on it.";

/**
 * The insurance row. The OM's premium is the seller's expiring policy, and
 * what finally decides a premium is a quote for a new owner, which nothing on
 * file is (none is read from the documents yet). The deal's T-12 premium is
 * the seller's own actual: where the OM's pro forma premium sits under it by
 * more than SAME_SHARE, the OM is set against its own building's history and
 * the T-12's premium decides — a working floor and a rule of thumb (a new
 * owner is rarely quoted under it), never a quote — so the row reads stretched at most, and the return is re-run at the
 * T-12's premium (the expense line as `expenseImpact` sets it, so a line the
 * T-12 already carries is swapped, never added to), said as the floor. At or
 * over the T-12's premium the seller's history cannot say a new owner pays
 * less, so the row stands unchecked (`INSURANCE_AT_HISTORY`) with no re-run;
 * with no T-12 premium, unchecked (`INSURANCE_NO_QUOTE`). On a development or
 * a conversion the T-12 insures the building before the plan delivers a new
 * one, so it decides nothing (`INSURANCE_NOT_DELIVERED`). The national premium
 * index applied to the OM's own premium is the OM's figure moved by the
 * nation's carriers' year (shown, held to nothing, carrying no figure of its
 * own).
 */
/** The building's premium as the OM states it, the insurance row's figure:
 *  a year's premium for the building, never a figure a unit or a month, a
 *  range, or insurance income. The operating-expense row leaves this same
 *  premium out of the OM's total. */
function omPremiumLine(rows: Row[]): { row: Row | null; premium: number | null } {
  const row =
    rows.find((m) => INSURANCE_ROW.test(m.label) && !INSURANCE_NOT.test(m.label) && !INSURANCE_VALUE_NOT.test(m.value) && !INSURANCE_VALUE_PER.test(m.value) && !statesRange(m.value) && parseUsd(m.value, 500) != null) ?? null;
  return { row, premium: row ? parseUsd(row.value, 500) : null };
}

function insuranceRow(ctx: Ctx): StressRow | null {
  const { row: premiumRow, premium } = omPremiumLine(ctx.rows);
  const evidence: StressEvidence[] = [];
  // The T-12's own insurance line: the seller's actual premium. It decides
  // only where the OM's premium sits under it past SAME_SHARE, on a building
  // already delivered — the OM against its own building's history.
  const t12 = ctx.actuals?.t12;
  const t12Ins = t12InsuranceLineOf(t12);
  const t12Premium = t12Ins && t12Ins.amount > 0 ? t12Ins.amount : null;
  const delivered = !notYetDelivered(ctx.kind);
  const under = premium != null && t12Premium != null && (t12Premium - premium) / t12Premium > SAME_SHARE;
  const t12Decides = under && delivered;
  if (t12Ins && t12Premium != null) {
    evidence.push({
      kind: "document",
      label: T12_INSURANCE_LABEL,
      text: `${money(t12Premium)} (${t12Ins.label}${t12?.periodEnd ? `, TTM to ${proseDay(t12.periodEnd)}` : ""}); ${t12Decides ? INSURANCE_T12_FLOOR : INSURANCE_T12_HISTORY}`,
      value: Math.round(t12Premium),
      asOf: t12?.periodEnd ?? null,
      publisher: "the deal's T-12",
      scope: "deal",
    });
  }
  // The index: the model-vs-market read's figure, else the stored market
  // check's. Where the OM states a premium it is said as the OM's premium
  // moved by its year, in words — the memorandum's figure grown by the
  // nation's carriers, not a figure of its own — so it carries no value any
  // surface could hold the OM's figure to.
  const check = checkOf(ctx.mvm, "expense_growth");
  const idx = check?.published.find((f) => /insurance premiums/i.test(f.label)) ?? null;
  const stored = ctx.market?.liveBrief?.figures?.find((f) => f.key === "insurance_index_yoy") ?? null;
  // The index is a monthly series (the BLS's PPI), so a stored figure is
  // dated by its month, never its first day.
  const storedWhen = stored && /^\d{4}-\d{2}-\d{2}$/.test(stored.asOf) ? periodLabel(stored.asOf, "monthly") : stored ? proseDay(stored.asOf) : "";
  const index = idx ? { pct: idx.value, text: idx.text, asOf: idx.asOf, publisher: idx.publisher } : stored ? { pct: stored.value, text: `${stored.value > 0 ? "+" : ""}${stored.value.toFixed(1)}% over the year to ${storedWhen}`, asOf: stored.asOf, publisher: "BLS via FRED" } : null;
  if (index) {
    const moved = premium != null ? Math.round(premium * (1 + index.pct / 100)) : null;
    evidence.push({
      kind: "published",
      label: moved != null ? `${INSURANCE_MOVED_LABEL(money(premium!))} (PPI, commercial multiple peril)` : "Commercial property insurance premiums, national (PPI, commercial multiple peril)",
      text:
        moved != null
          ? `${money(moved)} (the index ${index.text}); the national move applied to the OM's own figure, not a test of this premium`
          : `${index.text}; the nation's carriers, not this building's quote`,
      value: null,
      asOf: index.asOf,
      publisher: index.publisher,
      scope: "nation",
    });
  }
  if (premium == null && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = premiumRow && premium != null
    ? { text: `${premiumRow.label}: ${premiumRow.value}`, value: premium, page: pageOf(premiumRow, ctx.ex) }
    : { text: NO_FIGURE("insurance premium"), value: null, page: null };
  if (premium == null) return unchecked("insurance", omSays, evidence, NO_FIGURE("insurance premium"));
  // ONE figure decides (lib/stress-deciders `insuranceDecider`): the T-12's
  // premium, handed in as one that may only where the OM's sits under it on a
  // building already delivered; else nothing, and every piece is beside it.
  const decided = insuranceDecider(candidatesOf(evidence, (e) => e.label === T12_INSURANCE_LABEL && t12Decides));
  if (!decided || t12Premium == null) {
    const why = t12Premium == null ? INSURANCE_NO_QUOTE : !delivered ? INSURANCE_NOT_DELIVERED : INSURANCE_AT_HISTORY;
    return { ...unchecked("insurance", omSays, evidence, why), noRerun: t12Premium == null ? INSURANCE_NO_RERUN_NO_T12 : INSURANCE_NO_RERUN };
  }
  const floor = decided.figure;
  const share = (floor - premium) / floor;
  const gap: StressRow["gap"] = {
    value: Math.round(floor - premium),
    unit: "usd",
    text: `The OM's ${money(premium)} premium is ${money(floor - premium)} (${pct1(share * 100)}) under the ${money(floor)} the seller paid over the T-12: the OM against its own building's history. A new owner's quote is what finally decides the premium, and none is on file, so the T-12's is a working floor and a rule of thumb (a new owner is rarely quoted under it), not a quote, and the row reads stretched at most.`,
  };
  const evidenceIndex = decided.index;
  const words = { what: "the insurance line", om: money(premium), alt: `the seller's ${money(floor)} T-12 premium, a working floor and a rule of thumb, not a quote`, evidence: "" };
  const impact = ctx.derived && irrRuns(ctx) ? expenseImpact(ctx, premium, floor, floor, "insurance line", evidenceIndex, words) : null;
  // A plan deal re-runs its yield on cost on the premium only where the OM
  // states it as its pro forma's line, the one its stabilized NOI carries,
  // as the tax row does; the swap is the premium less the T-12's.
  let planImpact: StressImpact | null = null;
  let noRerun: string | null = null;
  if (ctx.planYield) {
    if (!PLAN_FIGURE.test(premiumRow!.label)) noRerun = PLAN_INSURANCE_NOT_PRO_FORMA;
    else {
      const run = yocSplit(yocImpact(ctx.planYield, "stabilizedNoi", evidenceIndex, ctx.planYield.noi, ctx.planYield.noi - (floor - premium), words));
      planImpact = run.impact;
      noRerun = run.noRerun;
    }
  }
  return {
    key: "insurance",
    title: TITLES.insurance,
    omSays,
    evidence,
    gap,
    verdict: "stretched",
    decidedBy: evidenceIndex,
    impact: impact ?? planImpact,
    ...(noRerun ? { noRerun } : {}),
    challenge: null,
    method: methodSentence("insurance", evidence, evidenceIndex),
  };
}

// — Operating expenses —

/** The OM's operating-expense total: the pro forma's whole expense line, its
 *  taxes and insurance in it, as stated — never a growth rate, a ratio, a
 *  figure a unit or a foot, the T-12's or today's actual, recoveries, a later
 *  year's, or a line that says what it leaves out. */
const OPEX_ROW = /\b(?:total\s+)?operating\s+expenses?\b|\bopex\b|\btotal\s+expenses\b/i;
const OPEX_NOT =
  /growth|escalat|inflat|ratio|\bper\b|\/|psf|t-?12|ttm|trailing|in[- ]place|actual|historical|current|reimburs|recover|excl|\bex\.|\bless\b|net of|controllable|before|after|non[- ]?recoverable|capital|reserve|year ?[2-9]|yr\.? ?[2-9]/i;
/** The OM's expense ratio: its operating expenses as a share of its income
 *  (EGI), never a share of gross potential rent, a market's or the T-12's. */
const OPEX_RATIO_ROW = /\b(?:operating\s+)?expense\s+ratio\b|\bopex\s+ratio\b/i;
const OPEX_RATIO_NOT = /t-?12|ttm|trailing|in[- ]place|actual|historical|current|market|class|industry|typical|comp|gross potential|potential gross|\bgpr\b|year ?[2-9]|yr\.? ?[2-9]/i;
/** The pro forma's own figure first. */
const OPEX_PRO_FORMA = /stabili[sz]ed|pro ?forma|underwrit|budget|year ?1\b|yr\.? ?1\b/i;
const EGI_NOT = /\bper\b|\/|psf|month|\bmo\b|growth|t-?12|ttm|trailing|in[- ]place|current|actual|year ?[2-9]|yr\.? ?[2-9]/i;

/** The OM's own expense lines, each read as stated and set beside the T-12's
 *  same line in words — never summed into a total the OM does not state. */
const OM_EXPENSE_LINES: readonly { name: string; om: RegExp; t12: RegExp }[] = [
  { name: "management fee", om: /\bmanagement\s+fees?\b/i, t12: /\bmanage/i },
  { name: "payroll", om: /\bpayroll\b|\bsalar(?:y|ies)\b|\bpersonnel\b/i, t12: /\bpayroll\b|\bsalar|\bpersonnel\b|\bwages?\b/i },
  { name: "repairs and maintenance", om: /\brepairs?\b|\br\s?&\s?m\b|\bmaintenance\b/i, t12: /\brepair|\bmainten|\br\s?&\s?m\b/i },
  { name: "utilities", om: /\butilit/i, t12: /\butilit|\belectric|\bgas\b|\bwater\b|\bsewer\b|\btrash\b|\bpower\b/i },
];
const OM_LINE_NOT = /growth|escalat|\bper\b|\/|psf|t-?12|ttm|trailing|actual|historical|reserve|asset management|income|revenue|reimburs/i;

/** The OM's other income, the pro forma's (never the T-12's or a figure a
 *  unit), beside the NOI. */
const OTHER_INCOME_ROW = /\bother\s+(?:income|revenue)\b/i;
const OTHER_INCOME_NOT = /growth|\bper\b|\/|psf|t-?12|ttm|trailing|actual|in[- ]place|current|historical/i;
/** The NOI row's piece where the OM and the T-12 both state other income. */
export const OTHER_INCOME_LABEL = "The OM's other income against the T-12's";

/** Why a plan deal's operating-expense row carries no re-run where the OM's
 *  figure is not its pro forma's line. */
export const PLAN_OPEX_NOT_PRO_FORMA =
  "The OM states its operating expenses as no pro forma line, so which expenses the stabilized NOI carries is not stated, and no yield on cost is re-run on it.";

/** The OM's figure under test: its pro forma's preferred row. */
function preferredRow(rows: Row[], re: RegExp, not: RegExp, ok: (r: Row) => boolean): Row | null {
  const hits = rows.filter((m) => re.test(m.label) && !not.test(m.label) && !statesRange(m.value) && ok(m));
  return hits.find((m) => OPEX_PRO_FORMA.test(m.label)) ?? hits[0] ?? null;
}

/** What an expense total's own label says it leaves out of itself:
 *  "Operating expenses (excl. taxes)", "Total expenses less taxes and
 *  insurance". Only the taxes and the insurance are read so; a label that
 *  leaves out anything else stays refused (`OPEX_NOT`). */
const OPEX_EXCLUDES =
  /\b(?:excl(?:uding|udes|\.)?|ex\.|less|net\s+of|before|without|w\/o)\s+(?:(?:real\s+estate|property|re)\s+)?(tax(?:es)?|insurance)(?:\s*(?:,|and|&)\s*(?:(?:real\s+estate|property|re)\s+)?(tax(?:es)?|insurance))?/i;

type OpexExcluded = "taxes" | "insurance";

/**
 * The OM's operating-expense total under test: among the rows that state one
 * (the pro forma's first, where any is labelled so), the one whose label
 * names a total, else the largest stated — never simply the first, since an
 * "Operating expenses" line that leaves the taxes out can sit above the
 * "Total expenses" that holds them. What its label says it leaves out is
 * carried (`excludes`), so those lines are not taken out of it again.
 */
function opexTotalRow(rows: Row[]): { row: Row; total: number; excludes: OpexExcluded[] } | null {
  const hits = rows.flatMap((m) => {
    if (!OPEX_ROW.test(m.label) || statesRange(m.value) || /%/.test(m.value)) return [];
    const total = parseUsd(m.value, 10_000);
    if (total == null) return [];
    const ex = OPEX_EXCLUDES.exec(m.label);
    if (OPEX_NOT.test(ex ? m.label.replace(ex[0], " ") : m.label)) return [];
    const excludes = ex ? [...new Set([ex[1], ex[2]].filter((w): w is string => !!w).map((w): OpexExcluded => (/insur/i.test(w) ? "insurance" : "taxes")))] : [];
    return [{ row: m, total, excludes }];
  });
  const proForma = hits.filter((h) => OPEX_PRO_FORMA.test(h.row.label));
  const pool = proForma.length > 0 ? proForma : hits;
  return pool.find((h) => /\btotal\b/i.test(h.row.label)) ?? [...pool].sort((a, b) => b.total - a.total)[0] ?? null;
}

/** The OM's operating expenses as it states them: a total, else a ratio on
 *  its EGI (the EGI it states, else the one its NOI implies at that ratio),
 *  each said with its arithmetic; and the EGI the class's ratio would be
 *  struck on. A total whose label leaves the taxes or the insurance out
 *  carries `excludes`, and its EGI is derived from the NOI only where the
 *  OM states each line it leaves out (`stated`). Null where it states
 *  neither. */
function omOpexOf(
  rows: Row[],
  omNoi: number | null,
  stated: { taxes: number | null; insurance: number | null } = { taxes: null, insurance: null },
): { total: number; row: Row; words: string; egi: number | null; egiWords: string | null; excludes: OpexExcluded[] } | null {
  const egiRow = preferredRow(rows, EGI_ROW, EGI_NOT, (m) => parseUsd(m.value, 10_000) != null);
  const egiStated = egiRow ? parseUsd(egiRow.value, 10_000) : null;
  const egiStatedWords = egiRow && egiStated != null ? `the OM's ${lowerFirst(egiRow.label)} of ${money(egiStated)}` : null;
  const picked = opexTotalRow(rows);
  if (picked) {
    const { row: totalRow, total, excludes } = picked;
    // The whole expense load the NOI is struck after: the total plus each
    // line its label leaves out, where the OM states it.
    const left = excludes.map((k) => stated[k]);
    const whole = left.every((v): v is number => v != null) ? total + left.reduce((a: number, b) => a + (b ?? 0), 0) : null;
    const egi = egiStated ?? (omNoi != null && whole != null ? omNoi + whole : null);
    return {
      total,
      row: totalRow,
      words: `the OM's ${lowerFirst(totalRow.label)} of ${money(total)}`,
      egi,
      egiWords: egiStatedWords ?? (egi != null && omNoi != null && whole != null ? `the ${money(egi)} the OM's ${money(omNoi)} NOI and its ${money(whole)} of expenses make` : null),
      excludes,
    };
  }
  const ratioRow = preferredRow(rows, OPEX_RATIO_ROW, OPEX_RATIO_NOT, (m) => {
    const p = parsePct(m.value);
    return p != null && p > 0 && p < 100;
  });
  if (!ratioRow) return null;
  const r = parsePct(ratioRow.value)! / 100;
  const egi = egiStated ?? (omNoi != null ? omNoi / (1 - r) : null);
  if (egi == null || !(egi > 0)) return null;
  const egiWords = egiStatedWords ?? `the ${money(egi)} EGI the OM's ${money(omNoi!)} NOI implies at that ratio`;
  return { total: r * egi, row: ratioRow, words: `the OM's ${pct1(r * 100)} ${lowerFirst(ratioRow.label)} on ${egiWords}, ${money(r * egi)}`, egi, egiWords, excludes: [] };
}

/**
 * The operating-expense row (the owner's decision of 2026-10-21): the OM's
 * pro forma operating expenses less the taxes and the insurance it states
 * (each has a row of its own, so neither line is held twice), set against
 * the deal's own T-12 on the same footing — its total less its tax and
 * insurance lines where the OM's figure leaves them out. The T-12 decides
 * (`document`); each of its lines a unit (a foot on a class priced by the
 * foot), the management fee as a share of its EGI and the OM's own lines are
 * shown beside it, deciding nothing. Only where no T-12 is on file does the
 * class's expense ratio decide, struck on the OM's own EGI, a rule of thumb
 * read stretched at most. Holds within the NOI's in-line band
 * (NOI_IN_LINE_BAND, 5%) of the deciding figure or over it; unsupported past
 * NOI_UNSUPPORTED_SHARE (10%) under it. The return is re-run with the
 * model's one expense line set at the OM's figure and at the evidence's
 * (`expenseImpact`, swapped, never added). Never on a development or a
 * conversion (no building runs today), a leased fee (the building is not the
 * buyer's) or a class that operates nothing.
 */
function opexRow(ctx: Ctx): StressRow | null {
  if (notYetDelivered(ctx.kind) || interestOf(ctx.ex).kind === "leased_fee" || !assetWords(ctx.assetClass).operating) return null;
  const omNoi = pickOmNoi(ctx.rows, ctx.kind);
  const tax = omTaxLine(ctx);
  const ins = omPremiumLine(ctx.rows);
  const om = omOpexOf(ctx.rows, omNoi?.noi ?? null, { taxes: tax.bill, insurance: ins.premium });
  // A line the total's own label leaves out is already out of it: never taken
  // out again, and still out of the footing the evidence is set on.
  const excl = om?.excludes ?? [];
  const subTax = tax.bill != null && !excl.includes("taxes");
  const subIns = ins.premium != null && !excl.includes("insurance");
  const less: ("taxes" | "insurance")[] = [
    ...(tax.bill != null || excl.includes("taxes") ? (["taxes"] as const) : []),
    ...(ins.premium != null || excl.includes("insurance") ? (["insurance"] as const) : []),
  ];
  const omFigure = om ? om.total - (subTax ? tax.bill! : 0) - (subIns ? ins.premium! : 0) : null;
  // A figure a unit, or a foot on a class priced by the foot.
  const words = assetWords(ctx.assetClass);
  const bySf = words.basis === "sf";
  const units = unitCountFromMetrics(ctx.rows);
  const sf = buildingSfFromMetrics(ctx.rows);
  const noun = countNoun(unitCountRow(ctx.rows)?.label, ctx.assetClass).replace(/s$/, "");
  const per = (n: number): string | null =>
    bySf ? (sf != null && sf > 0 ? `$${(n / sf).toFixed(2)} a square foot` : null) : units != null && units > 0 ? `$${Math.round(n / units).toLocaleString("en-US")} ${withArticle(noun)}` : null;
  const perSaid = (n: number) => (per(n) ? ` (${per(n)})` : "");
  const lessWords = (whose: string, taxW: string | null, insW: string | null) => {
    const parts = [...(taxW ? [taxW] : []), ...(insW ? [insW] : [])];
    return parts.length ? ` less ${whose} ${joinWords(parts)}` : "";
  };
  const evidence: StressEvidence[] = [];
  const t12 = ctx.actuals?.t12 ?? null;
  const t12Tax = t12TaxLineOf(t12);
  const t12Ins = t12InsuranceLineOf(t12);
  let t12Figure: number | null = null;
  let cannotFoot: string | null = null;
  const when = t12?.periodEnd ? `TTM to ${proseDay(t12.periodEnd)}` : "period not stated";
  const footed = t12OpexOnFooting(t12, less);
  if (t12 && footed && "missing" in footed) {
    cannotFoot = `The deal's T-12 breaks out no ${joinWords(footed.missing)} line, so its expenses cannot be set apart from the ${joinWords(footed.missing.map((m) => (m === "tax" ? "tax bill" : "premium")))} the OM's figure leaves out to its own row.`;
  } else if (t12 && footed && "value" in footed) {
    t12Figure = footed.value;
    evidence.push({
      kind: "document",
      label: T12_OPEX_LABEL,
      text: `${money(footed.value)}${perSaid(footed.value)}: the T-12's ${money(footed.total)} total${lessWords(
        "its",
        footed.tax != null ? `${money(footed.tax)} tax line` : null,
        footed.insurance != null ? `${money(footed.insurance)} insurance line` : null,
      )} (${when})`,
      value: Math.round(footed.value),
      asOf: t12.periodEnd,
      publisher: "the deal's T-12",
      scope: "deal",
    });
  }
  // The OM's own lines, each beside the T-12's same line where it states one.
  const omLines = OM_EXPENSE_LINES.flatMap((l) => {
    const row = ctx.rows.find((m) => l.om.test(m.label) && !OM_LINE_NOT.test(m.label) && !statesRange(m.value)) ?? null;
    if (!row) return [];
    const pctStated = /%/.test(row.value) ? parsePct(row.value) : null;
    const usd = pctStated == null ? parseUsd(row.value, 1_000) : null;
    if (pctStated == null && usd == null) return [];
    const t12Lines = (t12?.summary.opex ?? []).filter((x) => l.t12.test(x.label) && x !== t12Tax && x !== t12Ins && Number.isFinite(x.amount));
    const t12Sum = t12Lines.length ? t12Lines.reduce((s, x) => s + x.amount, 0) : null;
    const egi = t12?.summary.egi ?? null;
    const page = pageOf(row, ctx.ex);
    const omSaid = pctStated != null ? `${pct1(pctStated)}` : `${money(usd!)}${perSaid(usd!)}`;
    const t12Said =
      t12Sum == null
        ? ""
        : pctStated != null
          ? egi != null && egi > 0
            ? `, the T-12's ${pct1((t12Sum / egi) * 100)} of its EGI`
            : ""
          : `, the T-12's ${money(t12Sum)}${perSaid(t12Sum)}`;
    return [`${l.name} ${omSaid}${page != null ? ` (p. ${page})` : ""}${t12Said}`];
  });
  // Each T-12 line on the footing, a unit, the management fee as a share of
  // the T-12's own EGI: words beside the figure, never deciding.
  if (t12) {
    const lines = t12.summary.opex.filter(
      (l) => Number.isFinite(l.amount) && l.amount !== 0 && !(less.includes("taxes") && l === t12Tax) && !(less.includes("insurance") && l === t12Ins),
    );
    if (lines.length > 0) {
      const egi = t12.summary.egi;
      const parts = lines.map((l) => {
        const share = /\bmanage/i.test(l.label) && egi != null && egi > 0 ? `${pct1((l.amount / egi) * 100)} of the T-12's ${money(egi)} EGI` : null;
        const inner = [per(l.amount), share].filter(Boolean);
        return `${l.label} ${money(l.amount)}${inner.length ? ` (${inner.join(", ")})` : ""}`;
      });
      evidence.push({
        kind: "document",
        label: T12_OPEX_LINES_LABEL,
        text: `${parts.join("; ")} (${when})${omLines.length ? `; beside the OM's own lines: ${omLines.join("; ")}` : ""}`,
        value: null,
        asOf: t12.periodEnd,
        publisher: "the deal's T-12",
        scope: "deal",
      });
    }
  } else if (omLines.length > 0) {
    evidence.push({ kind: "om_internal", label: "The OM's own expense lines", text: omLines.join("; "), value: null, asOf: null, publisher: "the offering memorandum", scope: "deal" });
  }
  // The class's expense ratio, a rule of thumb: only where no T-12 is on
  // file, struck on the OM's own EGI, less the OM's own tax bill and premium
  // so it stands on the OM figure's footing. The ratio is the model's own
  // screening default (lib/underwrite/inputs `meta.defaultExpenseRatio`,
  // carried only where the model struck its expenses on it).
  const ratio = ctx.derived?.meta.defaultExpenseRatio ?? null;
  // Only where each line the footing leaves out has a stated figure to take
  // out of the class's whole load.
  const classFootable = less.every((k) => (k === "taxes" ? tax.bill != null : ins.premium != null));
  if (!t12 && ratio && classFootable && om?.egi != null && om.egi > 0) {
    const whole = ratio.ratio * om.egi;
    const fig = whole - (tax.bill ?? 0) - (ins.premium ?? 0);
    evidence.push({
      kind: "rule_of_thumb",
      label: CLASS_OPEX_LABEL,
      text: `${Math.round(ratio.ratio * 100)}% of EGI, the ${lowerFirst(ratio.classWord)} screening default, on ${om.egiWords ?? `the OM's ${money(om.egi)} EGI`} is ${money(whole)}${
        less.length ? `${lessWords("the OM's own", tax.bill != null ? `${money(tax.bill)} tax bill` : null, ins.premium != null ? `${money(ins.premium)} premium` : null)}, ${money(fig)}` : ""
      }: a rule of thumb, not this building's cost`,
      value: fig > 0 ? Math.round(fig) : null,
      asOf: null,
      publisher: "a rule of thumb",
      scope: "class",
    });
  }
  if (omFigure == null && evidence.length === 0) return null;
  const pageSaid = (r: Row | null) => {
    const p = r ? pageOf(r, ctx.ex) : null;
    return p != null ? ` (p. ${p})` : "";
  };
  const omSays: StressRow["omSays"] =
    om && omFigure != null
      ? {
          text: `${money(omFigure)}${perSaid(omFigure)}: ${om.words}${lessWords(
            "its",
            subTax ? `${money(tax.bill!)} tax bill${pageSaid(tax.billRow)}` : null,
            subIns ? `${money(ins.premium!)} premium${pageSaid(ins.row)}` : null,
          )}`,
          value: Math.round(omFigure),
          page: pageOf(om.row, ctx.ex),
        }
      : { text: NO_FIGURE("operating-expense total or expense ratio"), value: null, page: null };
  const footing = { less };
  if (omFigure == null) return { ...unchecked("opex", omSays, evidence, NO_FIGURE("operating-expense total or expense ratio")), footing };
  if (!(omFigure > 0)) return { ...unchecked("opex", omSays, evidence, "The OM's operating expenses less its tax bill and premium come to nothing or less, so the figures do not tie."), footing };
  // ONE figure decides (lib/stress-deciders `opexDecider`): the T-12, else
  // the class's ratio where no T-12 is on file.
  const decided = opexDecider(candidatesOf(evidence));
  if (!decided) return { ...unchecked("opex", omSays, evidence, cannotFoot ?? (t12 ? "The deal's T-12 states no expense total to set the OM's figure against." : NO_EVIDENCE)), footing };
  const best = evidence[decided.index];
  const fig = decided.figure;
  const ruleOnly = best.label === CLASS_OPEX_LABEL;
  const share = (fig - omFigure) / fig;
  const graded: StressVerdict = share <= NOI_IN_LINE_BAND ? "holds" : share > NOI_UNSUPPORTED_SHARE ? "unsupported" : "stretched";
  const verdict: StressVerdict = ruleOnly && graded === "unsupported" ? "stretched" : graded;
  const whose = ruleOnly ? `the class's ratio's ${money(fig)}, a rule of thumb` : `the T-12's ${money(fig)}`;
  const gap: StressRow["gap"] = {
    value: Math.round(fig - omFigure),
    unit: "usd",
    text:
      Math.abs(share) <= 0.005
        ? `The OM's ${money(omFigure)} is at ${whose}.`
        : share > 0
          ? `The OM's ${money(omFigure)} is ${money(fig - omFigure)} (${pct1(share * 100)}) under ${whose}.`
          : `The OM's ${money(omFigure)} is over ${whose} — the conservative side.`,
  };
  // "the operating-expense line … is", one line in the singular.
  const what = `the operating-expense line${less.length ? ` less ${joinWords(less)}` : ""}`;
  const lineWord = `operating expenses${less.length ? ` less ${joinWords(less)}` : ""}`;
  const altWords = ruleOnly ? `the ${money(fig)} the class's ratio strikes, a rule of thumb` : money(fig);
  const runWords = { what, om: money(omFigure), alt: altWords, evidence: ruleOnly ? "" : "the deal's T-12" };
  const impact = ctx.derived && irrRuns(ctx) ? expenseImpact(ctx, omFigure, fig, t12Figure, lineWord, decided.index, runWords, ruleOnly ? fig : null) : null;
  // A plan deal re-runs its yield on cost on the expenses only where the OM
  // states them as its pro forma's line, as the tax row does.
  let planImpact: StressImpact | null = null;
  let noRerun: string | null = null;
  if (ctx.planYield && om) {
    if (!PLAN_FIGURE.test(om.row.label)) noRerun = PLAN_OPEX_NOT_PRO_FORMA;
    else {
      const run = yocSplit(yocImpact(ctx.planYield, "stabilizedNoi", decided.index, ctx.planYield.noi, ctx.planYield.noi - (fig - omFigure), runWords));
      planImpact = run.impact;
      noRerun = run.noRerun;
    }
  }
  return {
    key: "opex",
    title: TITLES.opex,
    omSays,
    evidence,
    gap,
    verdict,
    decidedBy: decided.index,
    impact: impact ?? planImpact,
    ...(noRerun ? { noRerun } : {}),
    challenge: null,
    method: methodSentence("opex", evidence, decided.index),
    ...(ruleOnly ? { ruleOfThumbOnly: true } : {}),
    footing,
  };
}

// — Basis —

/** A basis is struck per unit (the class's noun) or per foot. */
type Per = "unit" | "sf";

/** One piece of the basis row's evidence with a figure: its figure — a
 *  median of three or more, never fewer — and the yardstick it states it on. */
interface BasisComparable {
  e: StressEvidence;
  value: number;
  on: Per;
}

/** What the comps step's grades mean, as its prompt defines them
 *  (lib/anthropic/prompts `brokerCompsInstruction`): by comparability to
 *  the subject, never by whether the comp's price is over or under the ask. */
const LEFT_OUT_GRADE: Record<"favorable" | "stretched", string> = {
  favorable: "favorable by the comps step (less comparable, in a way that flatters the ask)",
  stretched: "stretched by the comps step (not comparable to the subject)",
};

/** Why the price stands unchecked where fewer than MEDIAN_FLOOR comps graded
 *  clean state a figure and no recorded sales' median stands: the comps'
 *  own floor, as the market-rent row says it. */
export function basisFloorWhy(clean: number, listed: number, perWord: string): string {
  return `Fewer than ${MEDIAN_FLOOR} of the memorandum's sale comps graded clean (supports) state a figure ${perWord} (${clean} of ${listed}), and no recorded sales' median stands beside them, so no median is struck: the comps' own floor.`;
}

function basisRow(ctx: Ctx): StressRow | null {
  const ex = ctx.ex;
  const screenYear = screenYearOf(ex);
  const interest = interestOf(ex);
  const words = assetWords(ctx.assetClass);
  const withheld = basisWithheldOf(ex);
  // The one price row: the figure divided and the page cited are read off
  // the same row (the price reader's own, `findPricedMetric`, which
  // lib/comp-detail's `subjectBasis` divides) — never a "Call for offers"
  // row cited beside the figure of the row under it.
  const priceRow = findPricedMetric(ctx.rows, ctx.kind, screenYear) as Row | null;
  // A bulk condominium purchase's price a unit divides by the units offered
  // (lib/condo-units), as the card's basis, the comps' tick and the brief do.
  const unitsOffered = condoUnitsOffered(ex);
  // A plan deal is judged on its all-in cost (lib/deal-strategy
  // `planSummary`, held to the plausibility band by `planWithBasisChecked`),
  // never the shell's price set against finished buildings' trades; a
  // forward purchase's all-in cost is its price, the buyer's whole cost at
  // delivery.
  const plan = ctx.plan ? planWithBasisChecked(ex, ctx.strategy, planSummary(ex, ctx.strategy)) : null;
  // What one is called: the counting row's own noun (a hotel counting
  // "Rooms" is per room), as the pipeline card's basis says it.
  const nounMany = countNoun((plan ? planCountRow(ctx.rows, ctx.kind) : unitCountRow(ctx.rows))?.label, ctx.assetClass);
  const nounOne = nounMany.replace(/s$/, "");
  const yard = isOutdoorStorageYard(ex?.assetClass ?? null);
  const sfCount = yard ? null : buildingSfFromMetrics(ctx.rows);
  let unitCount: number | null;
  let omUnit: number | null;
  let omSf: number | null;
  if (plan) {
    unitCount = plan.units;
    omUnit = plan.basisWithheld ? null : plan.costPerUnit;
    omSf = plan.basisWithheld || plan.totalCost == null || sfCount == null || !(sfCount > 0) ? null : plan.totalCost / sfCount;
  } else {
    const b = subjectBasis(ctx.rows, ctx.kind, screenYear, interest, ex?.assetClass ?? null, unitsOffered);
    unitCount = unitsOffered != null && unitsOffered > 0 ? unitsOffered : unitCountFromMetrics(ctx.rows);
    omUnit = b.perUnit;
    omSf = b.perSf;
  }
  // A basis outside the band any market trades at is a misread, never a
  // figure to judge (the plausibility check's rule 4, `basisOutsideBand`):
  // the check's own finding is the row's reason; a yardstick it does not
  // test is dropped where the band refuses it.
  const outOfBand = !plan && (omUnit != null || omSf != null) ? (assessPlausibility(ex, ctx.strategy).find((f) => f.code === "basis_out_of_band") ?? null) : null;
  if (omUnit != null && basisOutsideBand(omUnit, "unit", ctx.assetClass)) omUnit = null;
  if (omSf != null && basisOutsideBand(omSf, "sf", ctx.assetClass)) omSf = null;
  const per: Per = words.basis === "sf" || omUnit == null ? "sf" : "unit";
  const omOn = (on: Per) => (on === "unit" ? omUnit : omSf);
  const perWordOf = (on: Per) => (on === "unit" ? `/${nounOne}` : "/SF");
  const perWord = perWordOf(per);
  const pick = (c: { perUnit: number | null; perSf: number | null }, on: Per) => (on === "unit" ? c.perUnit : c.perSf);
  // The yardstick a piece is judged on: the class's where the piece states a
  // figure on it, else per SF where it states that and the subject has a
  // price a foot (lib/comp-detail `basisTracks`' own rule) — so a per-SF
  // comp or a per-SF recorded-sales median is never dropped on a deal
  // priced by the unit.
  const onFor = (c: { perUnit: number | null; perSf: number | null }): Per | null =>
    pick(c, per) != null && omOn(per) != null ? per : per === "unit" && c.perSf != null && omSf != null ? "sf" : pick(c, per) != null ? per : null;
  const evidence: StressEvidence[] = [];
  const comparables: BasisComparable[] = [];
  const pushComparable = (e: StressEvidence, on: Per) => {
    evidence.push(e);
    if (e.value != null) comparables.push({ e, value: e.value, on });
  };

  // The memorandum's own sale comps, each graded by the comps step by its
  // comparability to the subject (lib/anthropic/prompts): a figure is struck
  // only over the comps it graded `supports`. One it graded `favorable` is
  // less comparable in a way that flatters the ask and one graded
  // `stretched` is not comparable: each is named and left out. Three or more
  // clean comps make a median, the one figure that may decide; one or two
  // are named with their count beside it and decide nothing (the recorded
  // sales' own floor, lib/public-comps `MEDIAN_FLOOR`; the review of
  // 2026-10-23 — a price held to ONE comp is a sighting, not a market).
  const sale = ctx.brokerComps?.saleComps ?? [];
  type Stating = { comp: (typeof sale)[number]; on: Per; figure: number };
  const stating: Stating[] = [];
  for (const comp of sale) {
    const f = compFigures(comp.detail);
    const on = onFor(f);
    const figure = on ? pick(f, on) : null;
    if (on && figure != null) stating.push({ comp, on, figure });
  }
  const groups: Per[] = per === "unit" ? ["unit", "sf"] : ["sf"];
  for (const on of groups) {
    const group = stating.filter((c) => c.on === on);
    if (group.length === 0) continue;
    const pw = perWordOf(on);
    const named = (cs: Stating[]) => cs.map((c) => `${c.comp.name} ${money(c.figure)}${pw}`).join("; ");
    const clean = group.filter((c) => c.comp.support === "supports");
    const leftOut = (["favorable", "stretched"] as const)
      .map((grade) => {
        const cs = group.filter((c) => c.comp.support === grade);
        return cs.length > 0 ? `; left out, graded ${LEFT_OUT_GRADE[grade]}: ${named(cs)}` : "";
      })
      .join("");
    const figure = clean.length >= MEDIAN_FLOOR ? median(clean.map((c) => c.figure)) : null;
    const head =
      on === per ? `${group.length} of ${sale.length} state a figure ${pw}` : `${group.length} of ${sale.length} state a figure ${pw} alone, so ${group.length === 1 ? "it is" : "they are"} judged per SF`;
    const graded = clean.length > 0 ? `; graded clean (supports): ${named(clean)}` : "";
    const struck =
      clean.length >= MEDIAN_FLOOR
        ? ` — median ${money(figure!)}${pw} over the ${clean.length}`
        : clean.length > 0
          ? ` — ${clean.length === 1 ? "one" : "two"} graded clean, too few for a median (${MEDIAN_FLOOR} or more), so none is set against the ask`
          : ", none graded clean (supports), so none is set against the ask";
    // The page the figure is read off: the clean comps' own page, each
    // validated against the deck (lib/facts `locatedPage`), where they all
    // sit on one; none where they sit on several or any states none.
    const cleanPages = new Set(clean.map((c) => locatedPage(c.comp.page, ex?.totalPages)));
    const compsPage = figure != null && cleanPages.size === 1 ? [...cleanPages][0] : null;
    pushComparable(
      {
        kind: "om_internal",
        label: on === per || !stating.some((c) => c.on === per) ? SALE_COMPS_LABEL : SALE_COMPS_SF_LABEL,
        text: `${head}${graded}${struck}${leftOut}`,
        value: figure != null ? Math.round(figure) : null,
        asOf: null,
        publisher: "the offering memorandum",
        scope: "deal",
        ...(compsPage != null ? { page: compsPage } : {}),
      },
      on,
    );
  }
  // How many comps graded clean state a figure on the yardstick, for the
  // floor's sentence (`basisFloorWhy`).
  const cleanOn = stating.filter((c) => c.comp.support === "supports" && c.on === per).length;
  // Recorded sales from public records, a median only from three sales up —
  // the comps page's own floor, applied by the caller. A per-unit median is
  // struck on no recorded sales (a record states no unit count), and a $/SF
  // one only over the sales that state an area, said with that count
  // ("over 5 of 12 recorded sales"), "thin" under five (lib/public-comps
  // `compEvidence`). On a deal priced by the unit, a $/SF median is judged
  // per SF where the subject has a price a foot.
  const rs = ctx.recordedSales;
  if (rs && rs.count > 0) {
    const on = onFor({ perUnit: rs.medianPerUnit, perSf: rs.medianPerSqft }) ?? per;
    const areaCount = rs.perSqftCount ?? rs.count;
    const v = on === "unit" ? rs.medianPerUnit : areaCount >= MEDIAN_FLOOR ? rs.medianPerSqft : null;
    const n = on === "unit" ? rs.count : areaCount;
    const sales = `${rs.count} recorded ${rs.count === 1 ? "sale" : "sales"}`;
    const over = n === rs.count ? `${n} recorded ${n === 1 ? "sale" : "sales"}` : `${n} of ${rs.count} recorded sales, those that state an area`;
    pushComparable(
      {
        kind: "published",
        label: `Recorded sales (${rs.providerName})`,
        text:
          v != null
            ? `${medianLabel(n)} ${money(v)}${perWordOf(on)} over ${over}${compEvidence(n) === "thin" ? ", thin" : ""}${on !== per ? ", judged per SF" : ""}`
            : rs.count < MEDIAN_FLOOR
              ? `${sales}, too few for a median ${perWord}`
              : on === "unit"
                ? `${sales}; no per-${nounOne} median is struck on recorded sales`
                : `${sales}, too few of them stating an area for a median /SF`,
        value: v != null ? Math.round(v) : null,
        // The day the records were read (lib/public-comps/run stores the
        // moment, a full timestamp), by its UTC day.
        asOf: rs.retrievedAt ? isoDayOf(rs.retrievedAt) || null : null,
        publisher: rs.providerName,
        scope: "metro",
        href: rs.href ?? null,
      },
      on,
    );
  }
  // The reader's own past screens, each at its ask: other memoranda's
  // asking prices in the same market — asks, not trades, and nobody's
  // publication — so filed as a rule of thumb under the reader's own name,
  // never a published figure. A median only from three screens that state a
  // basis (`medianCount`), said with that count. (The class's price band,
  // which the plausibility check holds a misread to, is no pricing evidence
  // and is not read here.)
  const ps = ctx.pastScreens;
  if (ps && ps.count > 0) {
    const n = ps.medianCount ?? ps.count;
    const raw = per === "unit" ? ps.perUnitMedian : ps.perSfMedian;
    const v = n >= MEDIAN_FLOOR ? raw : null;
    const of = n === ps.count ? `${n}` : `${n} of ${ps.count}`;
    pushComparable(
      {
        kind: "rule_of_thumb",
        label: `Other memoranda's asking prices in ${ps.market} (your past screens): asks, not trades`,
        text:
          v != null
            ? `median ${money(v)}${perWord} over ${of} screens, each at its memorandum's asking price, never a price anyone paid`
            : raw != null
              ? `${ps.count} screens, ${n} with a basis ${perWord}, too few for a median`
              : `${ps.count} screens, none with a basis ${perWord}`,
        value: v != null ? Math.round(v) : null,
        asOf: null,
        publisher: PAST_SCREENS_PUBLISHER,
        scope: "metro",
      },
      per,
    );
  }
  // A surface whose words reach someone other than the reader (the shared
  // screen, the verdict's brief) is handed no past screens: they are the
  // reader's own other deals. Said by name, never as none found.
  const psWithheld = ctx.pastScreensWithheld?.trim() || null;

  // A price that buys no building keeps its row, to say why no basis is
  // struck; so does a plan deal whose all-in cost cannot be struck, and a
  // basis the plausibility check calls misread. Anything else with nothing
  // stated and nothing found is left out.
  const planWhy = plan && omUnit == null && omSf == null && !withheld ? planBasisWhy(plan, priceRow, nounOne) : null;
  const om = omOn(per);
  if (om == null && evidence.length === 0 && !withheld && !planWhy && !outOfBand) return null;
  if (psWithheld) {
    evidence.push({
      kind: "rule_of_thumb",
      label: "Other memoranda's asking prices from past screens: withheld",
      text: psWithheld,
      value: null,
      asOf: null,
      publisher: "past screens",
      scope: "metro",
    });
  }
  // The basis is the whole building's: on a share, the whole its price
  // implies (lib/comp-detail's own rule), said so rather than the share's
  // price over every unit.
  const whole = interest.sharePct != null ? buildingPriceOf(ex, askingPriceOf(ex)) : null;
  const offered = unitsOffered != null && unitsOffered > 0 ? " offered" : "";
  const plannedWord = plan && notYetDelivered(ctx.kind) ? " planned" : "";
  const overOn = (on: Per) =>
    on === "unit"
      ? unitCount == null
        ? ""
        : `over ${unitCount.toLocaleString("en-US")}${plannedWord} ${unitCount === 1 ? nounOne : nounMany}${offered}`
      : sfCount == null
        ? ""
        : `over ${sfCount.toLocaleString("en-US")} SF`;
  // The yardstick the verdict is struck on: the first comparable's, the
  // best kind present (below); the OM's figure on the other yardstick rides
  // beside it where a piece is judged on that one.
  // Only trades decide (the review of 2026-10-23): the memorandum's comps
  // graded clean and the recorded sales, each a median of three or more.
  // The reader's own past screens are asks, not trades, and are shown beside
  // the price, never deciding it.
  const asks = comparables.filter((c) => c.e.publisher === PAST_SCREENS_PUBLISHER);
  const judgedOn = comparables.filter((c) => !asks.includes(c));
  const lead: Per = judgedOn[0]?.on ?? per;
  const other: Per | null = judgedOn.some((c) => c.on !== lead) ? (lead === "unit" ? "sf" : "unit") : null;
  const omLead = omOn(lead);
  const omText = (on: Per) => `${money(omOn(on)!)}${perWordOf(on)}`;
  const overs = [lead, ...(other ? [other] : [])].map(overOn).filter(Boolean);
  const over = overs.length ? ` ${overs.join(" and ")}` : "";
  const priced = !priceRow
    ? ""
    : plan?.forward
      ? ` (the price, the buyer's whole cost at delivery: ${priceRow.label} ${priceRow.value}${over})`
      : plan && plan.totalCost != null
        ? ` (the ${money(plan.totalCost)} total cost: ${priceRow.label} ${priceRow.value}${plan.budget && !plan.budget.isTotal ? ` plus the ${money(plan.budget.budget)} budget for the plan` : ""}${over ? `,${over}` : ""})`
        : whole != null
          ? ` (the whole the ${interest.sharePct}% share's ${priceRow.value} price implies, ${money(whole)}${over ? `,${over}` : ""})`
          : ` (${priceRow.label} ${priceRow.value}${over})`;
  const allIn = plan && !plan.forward ? " all-in" : "";
  const omSays: StressRow["omSays"] =
    omLead != null
      ? { text: `${omText(lead)}${allIn}${other && omOn(other) != null ? `, ${omText(other)}${allIn}` : ""}${priced}`, value: omLead, page: pageOf(priceRow, ex) }
      : {
          text: withheld ? `No basis is struck: ${withheld.why}.` : outOfBand ? `${outOfBand.title}.` : (planWhy ?? NO_FIGURE(`price ${perWord}`)),
          value: null,
          page: pageOf(priceRow, ex),
        };
  if (withheld) return unchecked("basis", omSays, evidence, omSays.text);
  if (outOfBand) return unchecked("basis", omSays, evidence, `The plausibility check finds the basis outside the band any market trades at: ${outOfBand.title}. ${outOfBand.detail}`);
  if (omLead == null) return unchecked("basis", omSays, evidence, planWhy ?? omSays.text);
  // The verdict is struck on a median of three trades or more: the
  // memorandum's comps graded clean, else the recorded sales. Under that
  // floor the row stands unchecked and says why — the comps' own floor,
  // never a verdict on one or two sightings, and never on another
  // memorandum's ask.
  if (judgedOn.length === 0) {
    const asksOnly = asks.length > 0 ? " Your past screens' asking prices are asks, not trades, and decide nothing." : "";
    return unchecked(
      "basis",
      omSays,
      evidence,
      sale.length > 0 && stating.length > 0
        ? `${basisFloorWhy(cleanOn, sale.length, perWord)}${asksOnly}`
        : rs && rs.count > 0
          ? `The recorded sales are too few for a median (${MEDIAN_FLOOR} or more) and the memorandum's comps carry none, so no median is struck: the comps' own floor.${asksOnly}`
          : asks.length > 0
            ? "No trade carries a figure the ask can be set against: your past screens' asking prices are asks, not trades, and decide nothing."
            : evidence.some((e) => e.publisher !== "past screens")
              ? "No evidence above carries a figure the ask can be set against."
              : "No comp with a figure could be read for this deal.",
    );
  }
  // ONE figure decides (lib/stress-deciders `basisDecider`, the order
  // lib/stress-basis-evidence builds the pieces in): the median of the
  // memorandum's comps graded clean, else the recorded sales' median; every
  // other piece is shown beside it.
  const decided = basisDecider(candidatesOf(evidence));
  const best = (decided && comparables.find((c) => c.e === evidence[decided.index])) || judgedOn[0];
  const decidedBy = evidence.indexOf(best.e);
  const bestOm = omOn(best.on)!;
  const pw = perWordOf(best.on);
  // "the median of …": every basis comparable is a median of three figures
  // or more, and its label is a phrase no possessive fits ("Recorded sales
  // (Philadelphia OPA)").
  const ofBest = `the median of ${lowerFirst(best.e.label)}, ${money(best.value)}${pw}`;
  const subject = plan ? (plan.forward ? "The price's" : "The all-in cost's") : "The ask's";
  // The verdict is read in percent of the best figure, so the gap's unit is
  // a share, not a dollar. The verdict, the sentence and the re-run are all
  // against the one best figure, so the row never prints "18% over" beside
  // "Holds".
  const sharePct = ((bestOm - best.value) / best.value) * 100;
  const gapText =
    Math.abs(sharePct) < 0.5
      ? `${subject} ${money(bestOm)}${pw} is at ${ofBest}.`
      : sharePct > 0
        ? `${subject} ${money(bestOm)}${pw} is ${pct1(sharePct)} over ${ofBest}.`
        : `${subject} ${money(bestOm)}${pw} is ${pct1(-sharePct)} under ${ofBest} — the conservative side.`;
  const verdict: StressVerdict = sharePct <= BASIS_STRETCH_PCT ? "holds" : sharePct > BASIS_UNSUPPORTED_PCT ? "unsupported" : "stretched";
  const gap = { value: Math.round(sharePct * 10) / 10, unit: "pct" as const, text: gapText };
  const evidenceIndex = evidence.indexOf(best.e);
  // The price is a direct input: re-run at the evidence's basis — only
  // where the model's price is the building's own as stated (not a share
  // grossed up, not a placeholder; a plan deal re-runs its yield on cost,
  // below). The ratio is the same on either yardstick.
  let impact: StressImpact | null = null;
  // Whose figure the alternative is — the memorandum's comps', the recorded
  // sales' or the reader's past screens'.
  const whose =
    best.e.kind === "om_internal"
      ? "the memorandum's sale comps' median"
      : best.e.label.startsWith("Recorded sales")
        ? `the recorded sales' median (${best.e.publisher})`
        : "the median of your past screens' asking prices";
  if (!plan && ctx.derived && irrRuns(ctx) && interest.sharePct == null) {
    const price = ctx.derived.inputs.purchasePrice;
    const altPrice = (price * best.value) / bestOm;
    // The model's loan is a share of the price, so it re-sizes with it.
    impact = runImpact("purchasePrice", ctx.derived.inputs, { ...ctx.derived.inputs, purchasePrice: altPrice }, evidenceIndex, price, altPrice, price, {
      what: "the price",
      om: `${money(price)} (${money(bestOm)}${pw})`,
      alt: `${whose}, ${money(altPrice)} (${money(best.value)}${pw}), at the model's loan-to-cost (the loan re-sizes with the price)`,
      evidence: "",
      model: money(price),
    });
  }
  // A plan deal re-runs its yield on cost at the evidence's all-in basis:
  // the total cost moved by the same ratio, the stabilized NOI as stated.
  let noRerun: string | null = null;
  if (plan && ctx.planYield) {
    const py = ctx.planYield;
    const altCost = (py.totalCost * best.value) / bestOm;
    const run = yocSplit(
      yocImpact(py, "totalCost", evidenceIndex, py.totalCost, altCost, {
        what: plan.forward ? "the price" : "the all-in cost",
        om: `${money(py.totalCost)} (${money(bestOm)}${pw})`,
        alt: `${whose}, ${money(altCost)} (${money(best.value)}${pw})`,
        evidence: "",
      }),
    );
    impact = run.impact;
    noRerun = run.noRerun;
  }
  // A piece on the other yardstick carries the OM's own figure on it, and is
  // drawn on no track shared with the OM's figure.
  for (const c of comparables) {
    if (c.on !== best.on && omOn(c.on) != null) c.e.ownYardstick = { om: omOn(c.on)!, per: perWordOf(c.on) };
  }
  return {
    key: "basis",
    title: TITLES.basis,
    omSays,
    evidence,
    gap,
    verdict,
    decidedBy,
    impact,
    ...(noRerun ? { noRerun } : {}),
    challenge: null,
    method: methodSentence("basis", evidence, decidedBy),
  };
}

/** Why a plan deal's all-in basis cannot be struck, in one sentence: the
 *  plan's own words where it says why, else what the memorandum does not
 *  state — never the price alone set against finished buildings' trades. */
function planBasisWhy(plan: NonNullable<ReturnType<typeof planSummary>>, priceRow: Row | null, nounOne: string): string {
  if (plan.basisWithheld) return plan.basisWithheld;
  if (plan.costPerUnitWithheld) return plan.costPerUnitWithheld;
  if (plan.costWithheld) return plan.costWithheld;
  if (plan.priceWithheld) return `No all-in basis is struck: the price is ${plan.priceWithheld}.`;
  if (plan.forward) return priceRow ? `No basis is struck: the memorandum states no count of what the price buys at delivery to set it per ${nounOne}.` : NO_FIGURE("price");
  if (plan.totalCost == null) {
    return priceRow
      ? "No all-in basis is struck: the memorandum states no budget for the plan beside the price, so no total cost is read, and the price alone, before the plan's cost, is never set against finished buildings' trades."
      : NO_FIGURE("price or total cost");
  }
  return `No all-in basis is struck: the memorandum states no count to set the ${money(plan.totalCost)} total cost per ${nounOne}.`;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// — Renovation premium —

const COMP_MONTHLY_RENT = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:\/|per|a)\s*(?:mo(?:nth)?|unit\s*(?:\/|per)\s*mo(?:nth)?)\b/i;

function renovationPremiumRow(ctx: Ctx): StressRow | null {
  const r = readValueAdd(ctx.ex);
  if (!r) return null;
  const evidence: StressEvidence[] = [];
  const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  if (r.achievedPremium != null) {
    // The achieved premium's own row, picked by the reader's own ACHIEVED
    // pattern (lib/value-add `achievedPremiumRow`), never by its place in a
    // list; its page validated against the deck.
    const page = locatedPage(achievedPremiumRow(ctx.rows)?.page, ctx.ex?.totalPages);
    evidence.push({
      kind: "om_internal",
      label: ACHIEVED_PREMIUM_LABEL,
      text: `${dollars(r.achievedPremium)} a month, as stated${r.renovated != null ? ` on ${r.renovated.toLocaleString("en-US")} doors` : ""}`,
      value: r.achievedPremium,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
      ...(page != null ? { page } : {}),
    });
  }
  if (r.classicRent != null && r.renovatedRent != null) {
    const leaseRents = (ctx.brokerComps?.leaseComps ?? []).map((c) => ({ c, m: c.detail.match(COMP_MONTHLY_RENT) })).filter((x) => x.m);
    evidence.push({
      kind: "om_internal",
      label: "The OM's classic and renovated rents, against its lease comps' rents",
      text: `classic ${dollars(r.classicRent)} and renovated ${dollars(r.renovatedRent)} a month, ${dollars(r.renovatedRent - r.classicRent)} apart${
        leaseRents.length ? `; its lease comps rent at ${leaseRents.map((x) => `${x.c.name} $${x.m![1]}/mo`).join(", ")}` : "; its lease comps state no monthly rent"
      }`,
      value: r.premiumFrom === "stated" ? r.renovatedRent - r.classicRent : null,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
    });
  }
  // The program's pace, the OM against itself (lib/value-add's own read): a
  // unit is renovated when its tenant leaves, so the stated period needs a
  // share of the classic units to turn each year, set against the turnover
  // the OM states. Beside the premium, never deciding it, and no return is
  // re-run on it. Beside it, where the rent roll dates its leases, the share
  // expiring within a year — expiries, not move-outs.
  if (r.programMonths != null && r.turnoverNeededPct != null && r.turnoverPct != null) {
    const slow = r.turnoverPct + 0.5 < r.turnoverNeededPct;
    const rr = ctx.actuals?.rentRoll;
    const next12 = rr?.summary.expiryBuckets?.next12mo;
    const expiries =
      next12 != null && Number.isFinite(next12)
        ? `; the rent roll's leases ending within a year${rr?.asOf || rr?.summary.asOfUsed ? ` of ${proseDay((rr.asOf || rr.summary.asOfUsed)!)}` : ""} cover ${Math.round(next12 * 100)}% of the occupied area that states an end: expiries, not move-outs`
        : "";
    evidence.push({
      kind: "om_internal",
      label: "The program's pace against the turnover the OM states",
      text: `${withArticle(`${r.programMonths}-month program`)} needs ${Math.round(r.turnoverNeededPct)}% of the classic units to turn each year; the OM states ${Math.round(r.turnoverPct)}% a year, ${
        slow ? `so the program takes ${(Math.round(r.yearsAtTurnover! * 10) / 10).toFixed(1)} years` : "enough for the stated period"
      }${expiries}`,
      value: null,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
    });
  }
  // The break-even premium — a door's cost at the model's exit cap — is
  // what the program NEEDS, never evidence of what a door EARNS: it is said
  // beside the row (in its gap, or in why it is unchecked) and never filed
  // as evidence, where it had read "a rule of thumb … the deal's own
  // figure" and widened the evidence's range to a figure no door rents at
  // (the QA of 2026-10-20).
  const breakEven =
    r.costPerDoor != null && ctx.derived
      ? (() => {
          const cap = ctx.derived!.inputs.exitCapPct;
          const value = Math.round((r.costPerDoor! * cap) / 12);
          return {
            value,
            text: `${withArticle(`${dollars(r.costPerDoor!)} door`)} needs ${dollars(value)} a month to pay for itself at the model's ${pct2(cap * 100)} exit cap: the break-even, what the program needs, not evidence of what a door earns`,
          };
        })()
      : null;
  const omSays: StressRow["omSays"] =
    r.premium != null
      ? { text: `${dollars(r.premium)} a month a renovated door${r.premiumFrom === "rents" ? " (the renovated rent less the classic rent)" : ", as stated"}`, value: r.premium, page: locatedPage(r.page, ctx.ex?.totalPages) }
      : { text: NO_FIGURE("renovation premium"), value: null, page: locatedPage(r.page, ctx.ex?.totalPages) };
  // ONE figure decides (lib/stress-deciders `renovationPremiumDecider`): the
  // achieved premium; the rents are beside it.
  const decided = renovationPremiumDecider(candidatesOf(evidence));
  const achieved = decided ? evidence[decided.index] : undefined;
  if (r.premium == null) return unchecked("renovation_premium", omSays, evidence, NO_FIGURE("renovation premium"));
  let gap: StressRow["gap"] = null;
  let verdict: StressVerdict = "unchecked";
  let why: string | null = null;
  if (achieved && achieved.value != null) {
    const share = (r.premium - achieved.value) / achieved.value;
    verdict = share <= SAME_SHARE ? "holds" : share > PREMIUM_UNSUPPORTED_SHARE ? "unsupported" : "stretched";
    const context = breakEven ? ` ${breakEven.text[0].toUpperCase()}${breakEven.text.slice(1)}.` : "";
    gap = {
      value: Math.round(r.premium - achieved.value),
      unit: "usd",
      text:
        (Math.abs(share) <= SAME_SHARE
          ? `The projected ${dollars(r.premium)} is at the achieved ${dollars(achieved.value)}.`
          : share > 0
            ? `The projected ${dollars(r.premium)} is ${dollars(r.premium - achieved.value)} a month (${pct1(share * 100)}) over the achieved ${dollars(achieved.value)}.`
            : `The projected ${dollars(r.premium)} is under the achieved ${dollars(achieved.value)} — the conservative side.`) + context,
    };
  } else if (breakEven) {
    // No door has proven a premium, so nothing tests the OM's figure: the
    // break-even says only whether the program pays if the premium holds.
    why = `No achieved premium is stated, so no door has proven the projected ${dollars(r.premium)}. ${breakEven.text[0].toUpperCase()}${breakEven.text.slice(1)}; the projected premium ${
      r.premium >= breakEven.value ? "clears it" : "falls short of it, so the program does not pay for itself even at the OM's own premium"
    }.`;
  } else {
    why = "No achieved premium is stated, so no door has proven the projected premium.";
  }
  // The premium is no model input: the model grows today's rent at one rate.
  const decidedBy = achieved && verdict !== "unchecked" ? decided!.index : null;
  // A plan deal re-runs its yield on cost: the gap to the achieved premium a
  // month, a year, on every door the program renovates, off the stabilized
  // NOI — read as carrying the projected premium on each of them.
  let impact: StressImpact | null = null;
  let noRerun: string | null = null;
  if (ctx.planYield) {
    const py = ctx.planYield;
    if (decidedBy == null || !achieved || achieved.value == null) noRerun = "No achieved premium is stated, so no figure decides the premium and no yield on cost is re-run on it.";
    else if (r.doors == null || !(r.doors > 0)) noRerun = "The OM states no count of doors to renovate, so the premium's gap cannot be carried to the stabilized NOI and no yield on cost is re-run on it.";
    else {
      const doors = r.doors;
      const run = yocSplit(
        yocImpact(py, "stabilizedNoi", decidedBy, py.noi, py.noi - (r.premium - achieved.value) * doors * 12, {
          what: "the renovation premium",
          om: `${dollars(r.premium)} a month`,
          alt: `${dollars(achieved.value)} a month`,
          evidence: "the achieved premium",
          how: `the gap on the ${doors.toLocaleString("en-US")} ${doors === 1 ? "door" : "doors"} to renovate, twelve months each, the stabilized NOI read as carrying the projected premium on every one`,
        }),
      );
      impact = run.impact;
      noRerun = run.noRerun;
    }
  }
  return {
    key: "renovation_premium",
    title: TITLES.renovation_premium,
    omSays,
    evidence,
    gap,
    verdict,
    decidedBy,
    impact,
    ...(noRerun ? { noRerun } : {}),
    challenge: null,
    method: methodSentence("renovation_premium", evidence, decidedBy),
    ...(why ? { unchecked: why } : {}),
  };
}

// ── The test ─────────────────────────────────────────────────────────────

/**
 * The band a row's "holds" was struck inside, named as its reader strikes it
 * — "within 5% of the T-12" (`NOI_IN_LINE_BAND`), "within 5% of the comps"
 * (`BASIS_STRETCH_PCT`), "within 2% of the evidence's figure" (`SAME_SHARE`,
 * a tax bill or a premium), "within the figure's ±1.9-pt margin" (a survey's)
 * — else "at the evidence's figure", the hair every other reader allows.
 */
export function holdsBand(row: StressRow): string {
  const at = row.decidedBy ?? row.impact?.evidenceIndex ?? null;
  const best = at != null ? row.evidence[at] : null;
  switch (row.key) {
    case "noi": {
      // The memorandum against itself is its own in-place NOI, never "the
      // offering memorandum" as a whole.
      const p = best?.publisher ?? "";
      const against =
        best?.kind === "om_internal"
          ? "the OM's own in-place NOI"
          : p.startsWith("the deal's ")
            ? `the ${p.slice("the deal's ".length)}`
            : /^the /i.test(p)
              ? p
              : "the evidence's figure";
      return `within ${Math.round(NOI_IN_LINE_BAND * 100)}% of ${against}`;
    }
    case "opex":
      return `within ${Math.round(NOI_IN_LINE_BAND * 100)}% of ${best?.label === CLASS_OPEX_LABEL ? "the class's ratio" : "the T-12"}`;
    case "basis":
    case "market_rent":
      return `within ${BASIS_STRETCH_PCT}% of the comps`;
    case "taxes":
    case "renovation_premium":
      return `within ${Math.round(SAME_SHARE * 100)}% of the evidence's figure`;
    default: {
      const moe = best?.text.match(/±\s*(\d+(?:\.\d+)?)\s*pts?/)?.[1];
      return moe ? `within the figure's ±${moe}-pt margin` : "at the evidence's figure";
    }
  }
}

/**
 * The two rules every built row answers to after its own reader:
 *   - a verdict struck against a rule of thumb alone says so in its gap
 *     (`ruleOfThumbOnly`), whatever the verdict;
 *   - a verdict never contradicts its own re-run: a row whose evidence moves
 *     the levered IRR down by `IRR_MOVE_STRETCH_BPS` or more never reads
 *     "holds" — inside the evidence's band or not, a move that size is to be
 *     priced, so it reads "stretched" and the gap says both (the band named,
 *     `holdsBand`) — where the OM is the more optimistic side; on a plan
 *     deal, a re-run that moves the yield on cost down by
 *     `YOC_MOVE_STRETCH_PTS` or more, the same way.
 */
function finishRow(row: StressRow): void {
  if (row.ruleOfThumbOnly && row.gap) row.gap = { ...row.gap, text: `${row.gap.text} Against a rule of thumb only.` };
  const i = row.impact;
  // Only where the OM is the more optimistic of the two (a positive gap): a
  // conservative figure the evidence would make dearer — an ask under the
  // comps — is the buyer's cushion, not a risk, whatever the re-run does.
  if (row.verdict === "holds" && row.gap && row.gap.value > 0 && i && i.baseIrrPct != null && i.altIrrPct != null) {
    const moveBps = Math.round((i.baseIrrPct - i.altIrrPct) * 100);
    if (moveBps >= IRR_MOVE_STRETCH_BPS) {
      row.verdict = "stretched";
      row.gap = {
        ...row.gap,
        text: `${row.gap.text} The gap is ${holdsBand(row)}, but the return moves ${moveBps} bps on it (levered IRR ${pct1(i.baseIrrPct)} to ${pct1(i.altIrrPct)}).`,
      };
    }
  }
  // A plan deal's equivalent, in points of yield on cost (YOC_MOVE_STRETCH_PTS),
  // compared at the two places every surface prints.
  if (row.verdict === "holds" && row.gap && row.gap.value > 0 && i && i.measure === "yield_on_cost" && i.baseYocPct != null && i.altYocPct != null) {
    const movePts = Math.round((i.baseYocPct - i.altYocPct) * 100) / 100;
    if (movePts >= YOC_MOVE_STRETCH_PTS) {
      row.verdict = "stretched";
      row.gap = {
        ...row.gap,
        text: `${row.gap.text} The gap is ${holdsBand(row)}, but the yield on cost moves ${movePts.toFixed(2)} points on it (${pct2(i.baseYocPct)} to ${pct2(i.altYocPct)}).`,
      };
    }
  }
  // A rent growth that holds against the CPI's rent holds against a lagging
  // measure: the re-run's note says what it was held to and that it lags,
  // so a row that holds with the return rising on the evidence is never read
  // as the evidence endorsing the OM's rate.
  const decider = i ? row.evidence[i.evidenceIndex] : null;
  if (row.key === "rent_growth" && row.verdict === "holds" && i && decider?.label === CPI_RENT_LABEL && row.omSays.value != null) {
    row.impact = { ...i, note: `${i.note} ${cpiRentHeld(row.omSays.value)}` };
  }
}

/** "Held to the rent paid by sitting tenants (CPI rent), which averages
 *  every lease in place, so it lags the rents new leases sign at: neither
 *  the row holding nor this re-run endorses the OM's 4.0%/yr." */
export function cpiRentHeld(omPct: number): string {
  const label = `${CPI_RENT_LABEL[0].toLowerCase()}${CPI_RENT_LABEL.slice(1)}`;
  return `Held to the ${label}, which ${CPI_RENT_LAGS.replace(/^it /, "")}: neither the row holding nor this re-run endorses the OM's ${pct1(omPct)}/yr.`;
}

/** The shared screen's reason (`withheldReason`): it carries no model by
 *  design, which is not a model that failed to derive. */
export const SHARE_NO_MODEL = "The shared screen carries no model, so no return is re-run here.";

// On a plan deal the model runs the in-place income with the budget booked in
// year one (lib/underwrite/plan-caveat), not the business plan, so the rows
// re-run the plan's yield on total cost instead — where the plan states the
// figures to strike it on. Where it does not, said why, in one sentence.
export const PLAN_YIELD_LEAD =
  "On a value-add, lease-up, conversion or development deal the model runs today's income, not the business plan, so the re-run is the plan's yield on total cost, its stabilized NOI over the price plus its budget (on a forward purchase, the price alone)";

/** Why a plan deal re-runs no yield on cost: the plan's own sentence where
 *  it withholds the yield or the basis as a misread, else what the OM does
 *  not state. One whole sentence that says no return is re-run. */
export function planNoYieldReason(plan: PlanSummary | null): string {
  const tail = (s: string) => `${s.trim().replace(/[.!?]$/, "")}; no return is re-run.`;
  if (plan?.yieldWithheld) return tail(plan.yieldWithheld);
  if (plan?.basisWithheld) return tail(plan.basisWithheld);
  if (plan?.costWithheld) return tail(plan.costWithheld);
  const noNoi = !plan?.stabilizedNoi || !(plan.stabilizedNoi.value > 0);
  const noCost = plan?.totalCost == null || !(plan.totalCost > 0);
  const missing =
    noNoi && noCost
      ? "states neither a stabilized NOI nor a total cost, so"
      : noNoi
        ? "states no stabilized NOI, so"
        : plan?.price != null
          ? "states no budget for the plan beside the price, so no total cost is read and"
          : "states no price, so no total cost is read and";
  return `${PLAN_YIELD_LEAD}, and the OM ${missing} no return is re-run.`;
}

/** Why a plan deal whose price buys a master lease re-runs no yield on cost:
 *  the plan's yield is the building's stabilized NOI over its total cost,
 *  and the price buys the position between two rents. One whole sentence. */
export function planMasterLeaseReason(why: string): string {
  return `No yield on cost is struck: ${why}, so the building's stabilized NOI over that price is no yield on cost; no return is re-run.`;
}

/**
 * The price both of the headline's cases pay, in words: the model's own
 * price, which is the ask as stated except where the model runs another
 * figure in its place — a share's price grossed up to the whole
 * (`meta.grossedUpSharePct`), or an auction's floor, the starting bid plus
 * the buyer's premium (lib/underwrite/inputs' price note).
 */
export function headlinePrice(derived: DerivedModel): string {
  const share = derived.meta.grossedUpSharePct;
  if (share != null) return `the ${Math.round(share * 10) / 10}% share's price grossed up to the whole the model runs`;
  const note = derived.sources.purchasePrice?.note ?? "";
  if (derived.sources.purchasePrice?.provenance === "derived" && / starting bid\b/.test(note)) {
    return "the auction's floor, the starting bid plus the buyer's premium, which the model runs in place of an asking price";
  }
  return HEADLINE_ASK;
}

/**
 * The stress test for a deal, from what the deal page already holds. One
 * row an assumption, in STRESS_KEYS' order; a row with nothing stated and
 * nothing found is left out, and the challenger's unmatched challenges
 * close the list as `other` rows.
 */
export function buildStressTest(args: StressTestArgs): StressTest {
  const ex = args.extraction;
  const strategy = inferStrategy(ex, args.firstSignal ?? null);
  const plan = isPlanDeal(strategy.kind);
  const derived = args.derived;
  const withheld = basisWithheldOf(ex);
  // One whole sentence that says no return is re-run and why, which every
  // surface prints as it stands — never behind a "No return …" of its own.
  const readsWithheld = derived == null ? null : modelReadsWithheld(derived.inputs, derived.sources, plan);
  // A plan deal's rows re-run its yield on total cost, struck on the plan as
  // every surface that prints its all-in basis reads it.
  const planChecked = plan ? planWithBasisChecked(ex, strategy, planSummary(ex, strategy)) : null;
  const yieldBase = planYieldBase(planChecked);
  // A master lease's basis is withheld, but its model is the position's own,
  // run as a leasehold's is: its other rows re-run.
  const priceWithheld = withheld && withheld.word !== MASTER_LEASE_WORD ? `No return is re-run: ${withheld.why}.` : null;
  // On a plan deal, though, the re-run is the building's stabilized NOI over
  // the price, and a master lease's price buys the position, not the
  // building: no yield on cost is struck on it.
  const masterLeasePlan = plan && withheld?.word === MASTER_LEASE_WORD ? planMasterLeaseReason(withheld.why) : null;
  const impactsWithheld =
    derived == null
      ? (args.withheldReason?.trim() || "No model was derived for this deal, so no return is re-run.")
      : readsWithheld
        ? `No return is re-run: ${lowerFirst(readsWithheld.trim())}${/[.!?]$/.test(readsWithheld.trim()) ? "" : "."}`
        : (priceWithheld ?? masterLeasePlan ?? (plan && !yieldBase ? planNoYieldReason(planChecked) : null));
  const planYield: PlanYield | null = plan && impactsWithheld == null && planChecked && yieldBase ? { plan: planChecked, ...yieldBase } : null;
  const ctx: Ctx = {
    ex,
    rows: rowsOf(ex),
    kind: strategy.kind,
    strategy,
    plan,
    assetClass: shownAssetClass(args.storedAssetClass ?? null, ex) || null,
    mvm: args.modelVsMarket,
    actuals: args.actuals,
    derived,
    impactsWithheld,
    planYield,
    market: args.market,
    brokerComps: args.brokerComps ?? null,
    recordedSales: args.recordedSales ?? null,
    pastScreens: args.pastScreens ?? null,
    pastScreensWithheld: args.pastScreensWithheld ?? null,
    indexGiven: args.indexGiven ?? null,
    loanQuote: args.loanQuote ?? null,
    readOn: args.readOn,
  };
  const built: Partial<Record<StressKey, StressRow>> = {
    basis: basisRow(ctx) ?? undefined,
    exit_cap: exitCapRow(ctx) ?? undefined,
    debt: debtRow(ctx) ?? undefined,
    noi: noiRow(ctx) ?? undefined,
    vacancy: vacancyRow(ctx) ?? undefined,
    rent_growth: rentGrowthRow(ctx) ?? undefined,
    market_rent: marketRentRow(ctx) ?? undefined,
    expense_growth: expenseGrowthRow(ctx) ?? undefined,
    taxes: taxesRow(ctx) ?? undefined,
    insurance: insuranceRow(ctx) ?? undefined,
    opex: opexRow(ctx) ?? undefined,
    renovation_premium: renovationPremiumRow(ctx) ?? undefined,
  };
  // On a plan deal a tested row with no yield-on-cost meaning says so, its
  // verdict as struck (an unchecked row has no figure to re-run either way).
  if (planYield) {
    for (const row of Object.values(built)) {
      const why = row ? PLAN_NO_YIELD_MEANING[row.key] : undefined;
      if (row && row.verdict !== "unchecked" && !row.impact && !row.noRerun && why) row.noRerun = why;
    }
  }
  for (const row of Object.values(built)) if (row) finishRow(row);
  // An unchecked row has nothing on file that tests it, so it carries no
  // re-run on any surface: a move struck at a figure that tests nothing
  // would read as one the evidence makes.
  for (const row of Object.values(built)) if (row && row.verdict === "unchecked") row.impact = null;
  // Each row's reason for no re-run, in a few words for a cell.
  for (const row of Object.values(built)) if (row && !row.impact && row.noRerun) row.noRerunShort = noRerunShortOf(row);
  // The challenger's words: the first challenge for a key rides on its row
  // (the list is most severe first); every other challenge — a second for
  // the same key, one no key matches — is a row of its own.
  const others: StressRow[] = [];
  for (const c of args.challenger?.challenges ?? []) {
    const key = challengeKey(c);
    const row = key === "other" ? undefined : built[key];
    if (row && row.challenge == null) {
      row.challenge = challengeWords(c);
      continue;
    }
    const page = locatedPage(c.page, ex?.totalPages);
    const basis = c.altBasis?.trim();
    others.push({
      key: "other",
      title: c.assumption,
      // The challenger's figure carries no unit on a row no reader tests (a
      // fee's 3 is 3%, a payroll's 1,200 dollars a unit), so the OM's figure
      // is the challenge's own words, never the bare number beside them.
      omSays: { text: c.assumption, value: null, page },
      evidence: [],
      gap: null,
      verdict: "unchecked",
      impact: null,
      challenge: challengeWords(c),
      // The challenger's `altBasis` says what it held the figure against in
      // words; its bare `altFigure` carries no unit, so it is never printed —
      // nor its `omFigure` (above).
      method: `The challenger's own critique${basis ? `, holding the figure against ${basis}` : ""}; no reader tests it and no figure is swapped.`,
      // A challenge whose key has a row carries the first; one whose key
      // built no row on this deal (no premium stated, no value-add program)
      // stands alone, said so rather than as a second.
      unchecked:
        key === "other"
          ? "No reader tests this assumption; the challenger's words stand alone."
          : row
            ? `A second challenge on the ${TITLES[key].toLowerCase()}; its row carries the first.`
            : `No ${TITLES[key].toLowerCase()} row could be built for this deal; the challenger's words stand alone.`,
    });
  }
  const rows = STRESS_KEYS.flatMap((k) => (k === "other" ? others : built[k] ? [built[k]!] : []));
  // The headline is struck on the rows as finished: a row `finishRow` reads
  // stretched is swapped in the evidence's case.
  // A plan deal's headline is its yield on total cost (`planStressHeadline`).
  const struck =
    derived && planYield
      ? planStressHeadline(rows, planYield, derived.inputs, statedYocOf(ctx.rows, ex, ctx.kind))
      : derived && impactsWithheld == null
        ? stressHeadline(rows, derived.inputs, headlinePrice(derived))
        : null;
  // A levered return is struck at the model's hold; where the OM states
  // another, the headline says it does not test the OM's (a plan's yield on
  // cost has no hold in it).
  const hold = planYield || !derived ? null : holdUntested(ctx.rows, ex, derived.inputs.holdMonths);
  const headline = struck ? { ...struck, untested: headlineUntested(built, ex, args.readOn, planYield ? PLAN_UNTESTED_KEYS : HEADLINE_UNTESTED_KEYS, hold) } : null;
  return {
    rows,
    readOn: args.readOn,
    publishedRead: args.modelVsMarket != null,
    impactsWithheld,
    ...(planYield ? { measure: "yield_on_cost" as const } : {}),
    ...(planYield?.plan.forward ? { forward: true as const } : {}),
    ...(args.sample ? { sample: true as const } : {}),
    headline,
  };
}

/** The rows whose standing unchecked a headline names, since they carry the
 *  deal's main risks: the price, the NOI and the debt. */
export const HEADLINE_UNTESTED_KEYS: readonly StressKey[] = ["basis", "noi", "debt"];

/** A plan deal's: the price alone — its NOI row tests today's income and its
 *  debt has no yield-on-cost meaning, so neither is a yield-on-cost
 *  headline's to test. */
export const PLAN_UNTESTED_KEYS: readonly StressKey[] = ["basis"];

/** A tenant roster's worst year rolling this share of its listed rent (or
 *  area) before the model's sale is named as untested by the headline — the
 *  roster panel's own 25% (lib/tenant-roster `rosterModelLine`). */
export const ROSTER_UNTESTED_PCT = 25;

const MONTH_WORDS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * What the headline does not test (`StressHeadline.untested`): each of the
 * price, NOI and debt rows that stands unchecked or was built for none, and
 * a tenant roster's worst year before the model's sale where it rolls
 * `ROSTER_UNTESTED_PCT` or more — read off the extraction on the read day
 * (lib/tenant-roster `readRoster`, pure), its year ending that many years
 * on. Null where nothing is named.
 */
function headlineUntested(
  built: Partial<Record<StressKey, StressRow>>,
  ex: ExtractionResult | null,
  readOn: string,
  named: readonly StressKey[] = HEADLINE_UNTESTED_KEYS,
  hold: NonNullable<StressHeadline["untested"]>["hold"] = null,
): StressHeadline["untested"] {
  const keys = named.filter((k) => !built[k] || built[k]!.verdict === "unchecked");
  const asOf = new Date(`${readOn}T12:00:00Z`);
  const roster = Number.isFinite(asOf.getTime()) ? readRoster(ex, asOf) : null;
  const worst = roster?.worst ?? null;
  let roll: NonNullable<StressHeadline["untested"]>["roll"] = null;
  if (roster && worst && worst.sharePct >= ROSTER_UNTESTED_PCT) {
    const end = new Date(asOf);
    end.setUTCFullYear(end.getUTCFullYear() + worst.year);
    roll = { sharePct: worst.sharePct, basis: roster.rollBasis, through: `${MONTH_WORDS[end.getUTCMonth()]} ${end.getUTCFullYear()}` };
  }
  return keys.length > 0 || roll || hold ? { keys, roll, ...(hold ? { hold } : {}) } : null;
}

/** The hold the OM states, where it differs from the model's (HOLD_MONTHS,
 *  the model's own `holdMonths`): its years and the model's, with its page.
 *  Null where the OM states none, states one the reader cannot read as one
 *  span, or states the model's own. */
function holdUntested(rows: Row[], ex: ExtractionResult | null, modelMonths: number): NonNullable<StressHeadline["untested"]>["hold"] {
  const row = findMetric(rows, HOLD_ROW, HOLD_NOT);
  const months = statedMonths(row);
  if (months == null || Math.abs(months - modelMonths) < 1) return null;
  return { omYears: Math.round((months / 12) * 10) / 10, modelYears: Math.round((modelMonths / 12) * 10) / 10, page: pageOf(row, ex) };
}

// ── The headline: the OM's case against the evidence's ───────────────────

/** The rows whose figures the NOI already holds: where one of them is swapped
 *  in the evidence's case, the NOI's own swap is left out of the headline
 *  (`HEADLINE_NOI_LEFT_OUT`), and the components carry the move. */
export const HEADLINE_NOI_COMPONENTS: readonly StressKey[] = ["vacancy", "taxes", "insurance", "opex"];

/** The share of the OM's NOI past which the rest of the NOI's gap — what the
 *  component swaps leave of it (`StressHeadline.noiRest`) — is said. */
export const HEADLINE_NOI_REST_SHARE = 0.01;

/** The percent and dollar inputs a row's re-run swaps whole, which the two
 *  cases set directly. */
const HEADLINE_SCALARS = ["purchasePrice", "exitCapPct", "allInRatePct", "vacancyPct", "rentGrowthPct", "expenseGrowthPct"] as const;
type HeadlineScalar = (typeof HEADLINE_SCALARS)[number];
const isHeadlineScalar = (k: string): k is HeadlineScalar => (HEADLINE_SCALARS as readonly string[]).includes(k);

/** How each row in the OM's case sets the model's inputs, the OM's side or
 *  the evidence's — the same swap its own re-run makes:
 *   - a percent or the price: the input itself (`pctImpact`, the basis row);
 *   - the tax or insurance line: the model's one expense line as that row's
 *     own two runs set it (`expenseImpact`: the impact's `omValue` and
 *     `altValue` are the whole line in each run, so a line the T-12 already
 *     carries is swapped, never added to), each row's move from the model's
 *     line added — a reset tax bill struck on the asking price, which both
 *     cases pay;
 *   - the NOI: the rent line that makes the OM's NOI, or the evidence's, at
 *     the case's own vacancy and expenses (`rentForNoi`). */
type HeadlineSwap =
  | { kind: "scalar"; row: StressRow; input: HeadlineScalar; om: number; alt: number }
  | { kind: "expense"; row: StressRow; om: number; alt: number }
  | { kind: "noi"; row: StressRow; omNoi: number; altNoi: number };

function headlineSwap(row: StressRow): HeadlineSwap | null {
  const i = row.impact;
  if (!i) return null;
  if (isHeadlineScalar(i.input)) return { kind: "scalar", row, input: i.input, om: i.omValue, alt: i.altValue };
  if (i.input === "expenseLines") return { kind: "expense", row, om: i.omValue, alt: i.altValue };
  if (row.key === "noi" && i.input === "inPlaceRentAnnual") {
    const altNoi = row.evidence[i.evidenceIndex]?.value ?? null;
    if (row.omSays.value == null || altNoi == null) return null;
    return { kind: "noi", row, omNoi: row.omSays.value, altNoi };
  }
  return null;
}

/** "the renovation premium is no model input" — why a row past its evidence
 *  carries no swap into the headline. */
function noSwapWhy(row: StressRow): string {
  if (row.key === "renovation_premium") return "the premium is no model input: the model grows today's rent at one rate";
  if (row.key === "market_rent") return "a market rent is no model input: the model runs today's rent, which the NOI row carries";
  if (!row.impact) return "no return is re-run on it, so it has no figure to swap";
  return "its re-run moves an input the two cases cannot combine";
}

/** The condition a row's evidence holds on, where it holds on one
 *  (`StressHeadlinePart.conditional`): the taxes' reset bill holds only if
 *  the sale resets the assessment to the price, which is the jurisdiction's
 *  to say — never the stated unabated bill an abatement ends into. */
function conditionOf(row: StressRow): string | null {
  const at = row.decidedBy ?? row.impact?.evidenceIndex ?? null;
  // The insurance part is struck at the seller's own T-12 premium: a working
  // floor and a rule of thumb, never a quote, said beside the part.
  if (row.key === "insurance") return at != null && row.evidence[at]?.label === T12_INSURANCE_LABEL ? INSURANCE_FLOOR_CONDITION : null;
  if (row.key !== "taxes") return null;
  if (at != null && row.evidence[at]?.label === T12_TAX_LABEL) return TAX_T12_FLOOR_CONDITION;
  return at != null && row.evidence[at]?.label === RESET_BILL_LABEL ? TAX_RESET_CONDITION : null;
}

const swaps = (s: HeadlineSwap) => s.kind === "noi" || Math.abs(s.alt - s.om) > (s.kind === "expense" ? 1e-6 : 1e-12);
const passed = (r: StressRow) => r.verdict === "stretched" || r.verdict === "unsupported";

/**
 * The stress test's headline (lib/stress-test-types `StressHeadline`): the
 * derived model run once with every re-run row at the OM's figure (the OM's
 * case) and once with every row read stretched or unsupported at its
 * evidence's (the evidence's case), each row's swap the same one its own
 * re-run makes, and the gap split by assumption with Shapley values through
 * the Assumption Bridge's walk (lib/bridge/attribution
 * `attributeOverPlayers`): a player an assumption past its evidence, the
 * scenario at each coalition the OM's case with that coalition's swaps made.
 *
 * THE OVERLAP RULE. The NOI's swap re-strikes the rent line so the year-one
 * NOI is the evidence's, and that NOI already holds the building's vacancy,
 * taxes and insurance — which the vacancy, tax and insurance rows swap on
 * their own. Where any of those three is a player, the NOI is no player: it
 * stays at the OM's figure in both cases (the rent that makes the OM's NOI
 * at the OM's vacancy and expenses, held there), the component swaps move
 * the NOI from it, and the headline names the NOI as left out
 * (`HEADLINE_NOI_LEFT_OUT`). Where none of the three is, the NOI's own swap
 * stands. Every other row swaps an input no other row touches: the exit
 * cap, the loan rate, the growth rates and the price are one input each,
 * and the tax and insurance lines each set the one expense line as their
 * own runs do, their moves from the model's line added. A reset tax bill is
 * struck on the asking price, and the price is no player (both cases pay
 * the ask), so the bill is the same in every case it is swapped into.
 *
 * With one row past its evidence and no other re-run in the OM's case, the
 * headline is that row's own re-run, to the figure: the OM's case IS its
 * base run and the evidence's case its alternative. With other re-run rows
 * in the OM's case at the OM's figures, the whole gap is still that one
 * row's, but struck on the OM's case, so it differs from the row's own
 * re-run, which starts from the model's own figures. Null where no row
 * carries a re-run (there is no OM's case to strike).
 */
export function stressHeadline(rows: readonly StressRow[], model: UnderwriteInputs, price: string = HEADLINE_ASK): StressHeadline | null {
  // The rows in the OM's case: each re-run row whose swap the cases can make,
  // the first row to swap an input (no two rows swap one input; a second
  // would be left out, said so).
  const inCase: HeadlineSwap[] = [];
  const omitted: StressHeadline["omitted"] = [];
  const taken = new Set<string>();
  for (const row of rows) {
    const s = headlineSwap(row);
    if (!s) {
      if (passed(row)) omitted.push({ key: row.key, label: row.title, why: noSwapWhy(row) });
      continue;
    }
    const slot = s.kind === "scalar" ? s.input : s.kind === "noi" ? "inPlaceRentAnnual" : `expense:${row.key}`;
    if (taken.has(slot) || taken.has(`key:${row.key}`)) {
      if (passed(row)) omitted.push({ key: row.key, label: row.title, why: "another row already swaps the same input" });
      continue;
    }
    taken.add(slot);
    taken.add(`key:${row.key}`);
    inCase.push(s);
  }
  if (inCase.length === 0) return null;

  // The players: the rows past their evidence whose swap moves a figure.
  let players = inCase.filter((s) => passed(s.row) && swaps(s));
  const noi = players.find((s) => s.kind === "noi");
  if (noi && players.some((s) => HEADLINE_NOI_COMPONENTS.includes(s.row.key))) {
    players = players.filter((s) => s !== noi);
    omitted.push({ key: noi.row.key, label: noi.row.title, why: HEADLINE_NOI_LEFT_OUT });
  }

  // The price is no player: both cases pay the ask, so the headline is what
  // the ask earns on each set of figures (the price row says the rest).
  const basis = players.find((s) => s.row.key === "basis");
  if (basis) {
    players = players.filter((s) => s !== basis);
    omitted.push({ key: basis.row.key, label: basis.row.title, why: headlineBasisLeftOut(price) });
  }

  // A case before its NOI: every scalar and expense swap at the side `alt`
  // answers, each expense row's line as its own run sets it, the rows' moves
  // from the model's line added.
  const modelExpense = model.expenseLines.reduce((s, l) => s + l.annual, 0);
  const beforeNoi = (alt: (s: HeadlineSwap) => boolean): UnderwriteInputs => {
    const out: UnderwriteInputs = { ...model };
    let move = 0;
    for (const s of inCase) {
      if (s.kind === "scalar") out[s.input] = alt(s) ? s.alt : s.om;
      else if (s.kind === "expense") move += (alt(s) ? s.alt : s.om) - modelExpense;
    }
    if (move !== 0 && out.expenseLines.length > 0) out.expenseLines = out.expenseLines.map((l, i) => (i === 0 ? { ...l, annual: l.annual + move } : l));
    return out;
  };
  // The OM's case before its NOI: every swap at the OM's side, the expense
  // line carrying the OM's bill and premium.
  const omBase = beforeNoi(() => false);
  const noiSwap = inCase.find((s): s is Extract<HeadlineSwap, { kind: "noi" }> => s.kind === "noi") ?? null;
  // The rent that makes the OM's NOI at the OM's vacancy and expenses: the
  // NOI's anchor in both cases unless the NOI is itself a player.
  const anchorRent = noiSwap ? rentForNoi(omBase, noiSwap.omNoi) : null;
  if (noiSwap && anchorRent == null) {
    // No rent makes the OM's NOI on the OM's own vacancy and expenses (a
    // building run fully vacant): the NOI cannot anchor the case.
    const at = inCase.indexOf(noiSwap);
    inCase.splice(at, 1);
    if (players.includes(noiSwap)) players = players.filter((s) => s !== noiSwap);
    if (passed(noiSwap.row)) omitted.push({ key: "noi", label: noiSwap.row.title, why: "no rent line makes the OM's NOI at the OM's own vacancy and expenses" });
  }
  const noiIn = noiSwap && anchorRent != null ? noiSwap : null;

  /** The model with the swaps `alt` answers true for at the evidence's
   *  figure and every other swap in the OM's case at the OM's. */
  const scenario = (alt: (s: HeadlineSwap) => boolean): UnderwriteInputs => {
    const inputs = beforeNoi(alt);
    if (noiIn) {
      const rent = alt(noiIn) ? rentForNoi(inputs, noiIn.altNoi) : anchorRent;
      if (rent != null) inputs.inPlaceRentAnnual = rent;
    }
    return inputs;
  };

  const omCase = scenario(() => false);
  const evidenceCase = scenario((s) => players.includes(s));
  const om = computeUnderwrite(omCase).returns;
  const ev = computeUnderwrite(evidenceCase).returns;
  const omIrrPct = om.leveredIrrPct == null ? null : om.leveredIrrPct * 100;
  const evidenceIrrPct = ev.leveredIrrPct == null ? null : ev.leveredIrrPct * 100;
  const multipleOf = (m: number | null | undefined) => (m != null && Number.isFinite(m) ? m : null);
  const omMultiple = multipleOf(om.leveredEquityMultiple);
  const evidenceMultiple = multipleOf(ev.leveredEquityMultiple);

  let parts: StressHeadline["parts"] = [];
  let unsolved = 0;
  if (players.length > 0 && omIrrPct != null && evidenceIrrPct != null) {
    const split = attributeOverPlayers(
      players.map((s) => s.row.key),
      (inCoalition) => scenario((s) => players.indexOf(s) >= 0 && inCoalition(players.indexOf(s))),
      { exactLimit: STRESS_KEYS.length },
    );
    unsolved = split.flooredScenarios;
    parts = players
      .map((s, i) => ({
        key: s.row.key,
        label: s.row.title,
        pts: split.shares[i].leveredIrr * 100,
        multiple: omMultiple != null && evidenceMultiple != null ? split.shares[i].leveredEquityMultiple : null,
        ...(s.row.ruleOfThumbOnly ? { ruleOfThumb: true } : {}),
        ...(conditionOf(s.row) ? { conditional: conditionOf(s.row)! } : {}),
      }))
      .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
  }
  // THE NOI'S REST. Where the NOI is left out for its components, the
  // component swaps move the evidence's case's year-one NOI, but not
  // necessarily by the NOI row's own gap: what is left of that gap — the NOI
  // row's gap less the year-one NOI the component swaps move, in the model's
  // own year-one terms — is in neither case. Said where it passes
  // `HEADLINE_NOI_REST_SHARE` of the OM's NOI.
  let noiRest: StressHeadline["noiRest"] = null;
  if (noi && noiIn === noi && omitted.some((o) => o.key === "noi" && o.why === HEADLINE_NOI_LEFT_OUT)) {
    const components = players.filter((s) => HEADLINE_NOI_COMPONENTS.includes(s.row.key));
    const componentCase = scenario((s) => components.includes(s));
    const moved = year1Noi(omCase) - year1Noi(componentCase);
    const rest = noi.omNoi - noi.altNoi - moved;
    if (Number.isFinite(rest) && Math.abs(rest) > HEADLINE_NOI_REST_SHARE * Math.abs(noi.omNoi)) {
      noiRest = { usd: Math.round(rest), components: components.map((s) => s.row.key).sort((a, b) => STRESS_KEYS.indexOf(a) - STRESS_KEYS.indexOf(b)) };
    }
  }
  const order = (k: StressKey) => STRESS_KEYS.indexOf(k);
  // The model as it runs, every input its own: the run each row's re-run
  // swaps one input on (`runImpact`'s inputs are the model's with that one
  // input replaced). Display only — neither case reads it.
  const own = computeUnderwrite(model).returns;
  const modelIrrPct = own.leveredIrrPct == null ? null : own.leveredIrrPct * 100;
  return {
    omIrrPct,
    evidenceIrrPct,
    omMultiple,
    evidenceMultiple,
    omKeys: inCase.map((s) => s.row.key).sort((a, b) => order(a) - order(b)),
    parts,
    omitted: omitted.sort((a, b) => order(a.key) - order(b.key)),
    unsolved,
    modelIrrPct,
    keptAtOm: keptAtOm(inCase, players, omitted, model, modelExpense, noiIn ? anchorRent : null).sort((a, b) => order(a.key) - order(b.key)),
    atEvidence: atEvidence(players, model, modelExpense).sort((a, b) => order(a.key) - order(b.key)),
    noiRest,
  };
}

/** Why the price is in neither side of a plan deal's split: both cases pay
 *  the plan's total cost. */
export const PLAN_BASIS_LEFT_OUT =
  "both cases pay the total cost, the price plus the plan's budget, so the headline says what that cost yields on each set of figures; the price row says how far the all-in cost sits from the comps and what the yield is at their figure";

/** A forward purchase's: its total cost is the price alone, the buyer's
 *  whole cost at delivery (lib/deal-strategy `planSummary`'s `forward`). */
export const PLAN_BASIS_LEFT_OUT_FORWARD =
  "both cases pay the price, the buyer's whole cost at delivery, so the headline says what that price yields on each set of figures; the price row says how far it sits from the comps and what the yield is at their figure";

/**
 * A plan deal's headline (lib/stress-test-types `StressHeadline` with
 * `measure: "yield_on_cost"`): the plan's yield on total cost on the OM's
 * figures — its stated stabilized NOI over its total cost — against the same
 * with every row read stretched or unsupported moved to its evidence, each
 * row's move the one its own re-run makes (`yocImpact`), and the gap split
 * by Shapley values through the Assumption Bridge's walk
 * (lib/bridge/attribution `attributeOverPlayers`), as `stressHeadline`
 * splits a levered IRR. The moves on the stabilized NOI add, and a total
 * cost's divides; the price row is no player (both cases pay the total
 * cost, `PLAN_BASIS_LEFT_OUT`). A row past its evidence with no re-run is
 * left out with its own reason. Null where no row carries a re-run.
 *
 * The walk's runner is handed the model's inputs as a carrier with two of
 * its fields set to the plan's figures — `inPlaceRentAnnual` the stabilized
 * NOI, `purchasePrice` the total cost — and reads nothing else; its metric
 * is the yield on cost (lib/plan-sensitivity `yieldOnCost`), the one
 * division every surface strikes.
 */
export function planStressHeadline(
  rows: readonly StressRow[],
  base: { noi: number; totalCost: number; plan?: Pick<PlanSummary, "forward"> & Partial<Pick<PlanSummary, "price" | "budget">> },
  carrier: UnderwriteInputs,
  statedYoc: StressHeadline["statedYoc"] = null,
): StressHeadline | null {
  type Swap = { row: StressRow; input: PlanYieldInput; om: number; alt: number };
  const inCase: Swap[] = [];
  const omitted: StressHeadline["omitted"] = [];
  for (const row of rows) {
    const i = row.impact;
    if (!i || i.measure !== "yield_on_cost" || (i.input !== "stabilizedNoi" && i.input !== "totalCost")) {
      if (passed(row)) {
        const why = PLAN_LEFT_OUT_WHY[row.key] ?? (row.noRerun ? lowerFirst(row.noRerun.trim().replace(/[.!?]$/, "")) : noSwapWhy(row));
        omitted.push({ key: row.key, label: row.title, why });
      }
      continue;
    }
    inCase.push({ row, input: i.input, om: i.omValue, alt: i.altValue });
  }
  if (inCase.length === 0) return null;
  let players = inCase.filter((s) => passed(s.row) && Math.abs(s.alt - s.om) >= 0.5);
  const basis = players.find((s) => s.row.key === "basis");
  if (basis) {
    players = players.filter((s) => s !== basis);
    omitted.push({ key: basis.row.key, label: basis.row.title, why: base.plan?.forward ? PLAN_BASIS_LEFT_OUT_FORWARD : PLAN_BASIS_LEFT_OUT });
  }
  // A market rent beside a renovation premium would carry the renovated
  // doors' rent into the stabilized NOI twice: the premium stays, the
  // market rent is left out, said so.
  const rent = players.find((s) => s.row.key === "market_rent");
  if (rent && players.some((s) => s.row.key === "renovation_premium")) {
    players = players.filter((s) => s !== rent);
    omitted.push({ key: rent.row.key, label: rent.row.title, why: PLAN_MARKET_RENT_BESIDE_PREMIUM });
  }
  /** The plan's two figures with the swaps `alt` answers true for moved. */
  const figures = (alt: (s: Swap) => boolean) => {
    let noi = base.noi;
    let cost = base.totalCost;
    for (const s of players) {
      if (!alt(s)) continue;
      if (s.input === "stabilizedNoi") noi += s.alt - s.om;
      else cost += s.alt - s.om;
    }
    return { noi, cost };
  };
  const yocOf = (f: { noi: number; cost: number }) => {
    const y = yieldOnCost(f.noi, f.cost);
    return y == null ? null : y * 100;
  };
  const omYocPct = yocOf(figures(() => false));
  const evidenceYocPct = yocOf(figures(() => true));
  let parts: StressHeadline["parts"] = [];
  if (players.length > 0 && omYocPct != null && evidenceYocPct != null) {
    const split = attributeOverPlayers(
      players.map((s) => s.row.key),
      (inCoalition) => {
        const f = figures((s) => inCoalition(players.indexOf(s)));
        return { ...carrier, inPlaceRentAnnual: f.noi, purchasePrice: f.cost };
      },
      {
        exactLimit: STRESS_KEYS.length,
        run: (a) => {
          const y = yieldOnCost(a.inPlaceRentAnnual, a.purchasePrice) ?? 0;
          return { leveredIrr: y, unleveredIrr: y, leveredEquityMultiple: 0, year1CashFlow: 0 };
        },
      },
    );
    parts = players
      .map((s, i) => ({
        key: s.row.key,
        label: s.row.title,
        pts: split.shares[i].leveredIrr * 100,
        multiple: null,
        ...(s.row.ruleOfThumbOnly ? { ruleOfThumb: true } : {}),
        ...(conditionOf(s.row) ? { conditional: conditionOf(s.row)! } : {}),
      }))
      .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
  }
  const order = (k: StressKey) => STRESS_KEYS.indexOf(k);
  return {
    measure: "yield_on_cost",
    omYocPct,
    evidenceYocPct,
    statedYoc,
    planCost: planCostOf(base),
    omIrrPct: null,
    evidenceIrrPct: null,
    omMultiple: null,
    evidenceMultiple: null,
    omKeys: inCase.map((s) => s.row.key).sort((a, b) => order(a) - order(b)),
    parts,
    omitted: omitted.sort((a, b) => order(a.key) - order(b.key)),
    unsolved: 0,
    noiRest: null,
  };
}

/** What a plan's yield on cost is struck on (`StressHeadline.planCost`): its
 *  total cost, and the price and the budget that make it where the plan adds
 *  the two (a forward purchase's price alone; a budget the OM stated as the
 *  whole cost, the total alone). */
function planCostOf(base: { totalCost: number; plan?: Partial<Pick<PlanSummary, "forward" | "price" | "budget">> }): NonNullable<StressHeadline["planCost"]> {
  const p = base.plan;
  const whole = p?.budget?.isTotal === true;
  return {
    total: base.totalCost,
    price: whole ? null : (p?.price ?? null),
    budget: p?.forward || whole ? null : (p?.budget?.budget ?? null),
  };
}

/** The row's own figure for an expense row's line as a case sets it: the
 *  row's bill or premium at `line`, the line each run sets, less the rest of
 *  the model's line. */
const ownBill = (s: Extract<HeadlineSwap, { kind: "expense" }>, line: number): number | null => {
  const om0 = s.row.omSays.value;
  return om0 == null ? null : om0 + (line - s.om);
};

/**
 * The rows the evidence's case runs at the evidence's figure where the model
 * as it runs has another (`StressHeadline.atEvidence`): every player whose
 * evidence figure is not the model's own, the other half of why the
 * evidence's case is not the model's run. Read off the same swaps the cases
 * are struck on.
 */
function atEvidence(players: readonly HeadlineSwap[], model: UnderwriteInputs, modelExpense: number): StressAtEvidence[] {
  const out: StressAtEvidence[] = [];
  for (const s of players) {
    let evidence: number | null;
    let own: number | null;
    if (s.kind === "scalar") {
      evidence = s.alt * 100;
      own = model[s.input] * 100;
    } else if (s.kind === "expense") {
      evidence = ownBill(s, s.alt);
      own = ownBill(s, modelExpense);
    } else {
      evidence = s.altNoi;
      own = year1Noi(model);
    }
    if (evidence == null || own == null) continue;
    const tol = s.kind === "scalar" ? 1e-9 : 0.5;
    if (!Number.isFinite(evidence) || !Number.isFinite(own) || Math.abs(evidence - own) < tol) continue;
    out.push({ key: s.row.key, label: s.row.title, evidence, model: own });
  }
  return out;
}

/**
 * The rows both cases run at the OM's figure where the model as it runs has
 * another (`StressHeadline.keptAtOm`): every row in the OM's case that is no
 * player, so the evidence's case keeps the OM's figure too, with its figure
 * and the model's in the row's own unit. The price is not among them: both
 * cases pay the model's price, which the omitted price row says. Read off
 * the same swaps the cases are struck on, never derived apart.
 */
function keptAtOm(
  inCase: readonly HeadlineSwap[],
  players: readonly HeadlineSwap[],
  omitted: StressHeadline["omitted"],
  model: UnderwriteInputs,
  modelExpense: number,
  anchorRent: number | null,
): StressKept[] {
  const out: StressKept[] = [];
  for (const s of inCase) {
    if (players.includes(s) || s.row.key === "basis") continue;
    let om: number;
    let own: number;
    let noi: number | undefined;
    if (s.kind === "scalar") {
      // A percent input in the engine's decimal, said as a percent.
      om = s.om * 100;
      own = model[s.input] * 100;
    } else if (s.kind === "expense") {
      // The row's own bill or premium, and the model's: the line each run
      // sets, less the rest of the model's line.
      const om0 = ownBill(s, s.om);
      if (om0 == null) continue;
      om = om0;
      own = ownBill(s, modelExpense)!;
    } else {
      // What both cases keep is the rent line that makes the OM's NOI at the
      // OM's vacancy and expenses (the anchor), not the NOI itself: where a
      // vacancy, tax or insurance swap moves the evidence's case, its NOI
      // moves from that rent line. So the rent line is the kept figure, the
      // model's own rent line beside it, and the OM's NOI it is struck to.
      if (anchorRent == null) continue;
      om = anchorRent;
      own = model.inPlaceRentAnnual;
      noi = s.omNoi;
    }
    const tol = s.kind === "scalar" ? 1e-9 : 0.5;
    if (!Number.isFinite(om) || !Number.isFinite(own) || Math.abs(om - own) < tol) continue;
    // An unchecked row carries no re-run, so it has no swap and never
    // reaches here; a row of any other verdict that is no player holds.
    if (!passed(s.row) && s.row.verdict !== "holds") continue;
    const why: StressKept["why"] = passed(s.row) ? (omitted.some((o) => o.key === s.row.key) ? "left_out" : "same") : "holds";
    out.push({ key: s.row.key, label: s.row.title, why, om, model: own, ...(noi != null ? { noi } : {}) });
  }
  return out;
}
