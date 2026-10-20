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
//   - the verdict is code's, from the gap and the thresholds below: `holds`
//     inside the evidence's range or on its conservative side (within a
//     survey's margin), `stretched` past it, `unsupported` past it by more
//     than the key's own threshold, `unchecked` where nothing carries a
//     figure;
//   - the impact swaps ONE input of the model, twice: the OM's figure in for
//     the base run and the best evidence's for the alternative, so the move
//     is the gap's own and never the model's default's (which reads no
//     growth rate off the OM, exits at the going-in cap and borrows at the
//     seed); it is struck only where the model's reads stand
//     (lib/underwrite/report-grid `modelReadsWithheld`), the price buys the
//     building and the deal is no plan deal — a plan deal is judged on its
//     yield on total cost, not a levered return on the price;
//   - the challenger's words ride beside a row, never in its place: a
//     challenge keyed by the challenger (`Challenge.key`) lands on its row;
//     one stored before the key was asked is matched on its `assumption`
//     text by the keyword table below; the rest become `other` rows.
//
// The thresholds, each named here and read nowhere else:
//   vacancy          VACANCY_UNSUPPORTED_PTS   3 pts past the best evidence
//                    (a stabilized assumption on a stabilized deal: the
//                    market's figure, past the survey's margin; else the
//                    deal's documents)
//   rent growth      RENT_GROWTH_UNSUPPORTED_PTS 2 pts (200 bps) over the
//                    trailing year's figure for the deal's own kind of rent
//                    (lib/rent-growth-decider)
//   expense growth   EXPENSE_GROWTH_UNSUPPORTED_PTS 1.5 pts under the lowest
//                    price index
//   exit cap         EXIT_CAP_UNSUPPORTED_BPS  25 bps tighter than the
//                    going-in cap with no published cap range supporting it
//   debt             DEBT_UNSUPPORTED_BPS      50 bps under the seeded rate
//   NOI              the actuals card's own bands: inside NOI_IN_LINE_BAND
//                    (5%) holds, past NOI_UNSUPPORTED_SHARE (10%) unsupported
//   taxes            TAX_UNSUPPORTED_SHARE     15% under the reset bill
//   insurance        INSURANCE_UNSUPPORTED_SHARE 15% under the repriced
//                    premium or the T-12's
//   basis            BASIS_STRETCH_PCT 5% / BASIS_UNSUPPORTED_PCT 15% over
//                    the comps' median
//   premium          PREMIUM_UNSUPPORTED_SHARE 15% over the achieved premium
//   any row          IRR_MOVE_STRETCH_BPS      a re-run that lowers the levered
//                    IRR 100 bps or more never holds (`finishRow`)

import type {
  BrokerCompsResult,
  Challenge,
  ChallengerResult,
  ExtractionResult,
  FirstSignal,
  MarketResult,
} from "@/lib/anthropic/types";
import type { ActualsRead } from "@/lib/actuals/actuals-read";
import { NOI_IN_LINE_BAND, pickOmNoi, t12Vacancy, t12VacancyOverWords } from "@/lib/actuals/analyze";
import { withArticle } from "@/lib/article";
import { shownAssetClass } from "@/lib/asset-class";
import { assetWords, countNoun } from "@/lib/asset-words";
import { compFigures, subjectBasis } from "@/lib/comp-detail";
import { findGoingInCap, findMetric, occupancyRow, parsePct, planCountRow, screenYearOf, unitCountFromMetrics, unitCountRow, buildingSfFromMetrics } from "@/lib/criteria";
import { condoUnitsOffered } from "@/lib/condo-units";
import {
  askingPriceOf,
  assessPlausibility,
  basisOutsideBand,
  buildingPriceOf,
  findPricedMetric,
  inferStrategy,
  isOutdoorStorageYard,
  isPlanDeal,
  noiFigures,
  notYetDelivered,
  planSummary,
  planWithBasisChecked,
  type DealStrategy,
} from "@/lib/deal-strategy";
import { datedLong, indexName, type DebtIndex, type RateSeed } from "@/lib/debt-index";
import { locatedPage } from "@/lib/facts";
import { interestOf } from "@/lib/interest";
import { publisherTag } from "@/lib/live-rates-core";
import type { ModelCheck, ModelVsMarket, PublishedFigure } from "@/lib/model-vs-market";
import { compactUsd, parseUsd, statesRange } from "@/lib/money";
import { SIZER_LENDER_TESTS } from "@/lib/sizer-terms";
import { readTaxAbatement, taxBillOf } from "@/lib/tax-abatement";
import { sizeLoan } from "@/lib/tools/deal-math";
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";
import { HOLD_MONTHS, MASTER_LEASE_WORD, basisWithheldOf, classVacancyDefault, type DerivedModel } from "@/lib/underwrite/inputs";
import { modelReadsWithheld } from "@/lib/underwrite/report-grid";
import { MEDIAN_FLOOR, compEvidence, medianLabel } from "@/lib/public-comps/core";
import { readValueAdd } from "@/lib/value-add";
import { NO_RENT_INDEX, readsNoRentIndex, rentGrowthDecider } from "@/lib/rent-growth-decider";
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
} from "@/lib/stress-test-types";
import { attributeOverPlayers } from "@/lib/bridge/attribution";

export const VACANCY_UNSUPPORTED_PTS = 3;
export const RENT_GROWTH_UNSUPPORTED_PTS = 2;
export const EXPENSE_GROWTH_UNSUPPORTED_PTS = 1.5;
export const EXIT_CAP_UNSUPPORTED_BPS = 25;
export const DEBT_UNSUPPORTED_BPS = 50;
export const NOI_UNSUPPORTED_SHARE = 0.1;
export const TAX_UNSUPPORTED_SHARE = 0.15;
export const INSURANCE_UNSUPPORTED_SHARE = 0.15;
export const BASIS_STRETCH_PCT = 5;
export const BASIS_UNSUPPORTED_PCT = 15;
export const PREMIUM_UNSUPPORTED_SHARE = 0.15;
/** A re-run that moves the levered IRR down this far never reads "holds". */
export const IRR_MOVE_STRETCH_BPS = 100;

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
  /** why no model is handed in, where the surface carries none BY DESIGN
   *  (the shared screen) — said ahead of the default "No model was derived
   *  for this deal", which would read as a failure */
  withheldReason?: string | null;
  /** ISO day the published figures were read */
  readOn: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

type Row = { label: string; value: string; page?: string };

const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";

const pct1 = (n: number) => `${n.toFixed(1)}%`;
const pct2 = (n: number) => `${n.toFixed(2)}%`;
const money = (n: number) => compactUsd(n, { millions: 2, trim: true });
const bps = (n: number) => `${Math.round(Math.abs(n))} bps`;
const pts = (n: number) => `${Math.abs(n).toFixed(1)} point${Math.abs(Math.abs(n) - 1) < 0.05 ? "" : "s"}`;

/** "a, b and c" */
function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "The OM's" → "the OM's"; an acronym ("NOI") keeps its letters. */
/** "the deal's T-12's $385k", or "$385k (BLS via FRED)" — a publisher named
 *  with its channel takes no possessive. */
const whose = (publisher: string, figure: string) => (/ via /.test(publisher) ? `${figure} (${publisher})` : `${publisher}'s ${figure}`);
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
 * The verdict and the gap for a row whose evidence is a set of comparable
 * figures. `optimistic` says which way the OM flatters the buyer: "low" (a
 * vacancy, an expense growth, a tax bill, an exit cap — the OM's figure
 * under the evidence is optimistic) or "high" (a rent growth, an NOI, a
 * basis, a premium). The gap is struck against the BEST figure (the first,
 * in the row's priority); the verdict against the range the comparables
 * make: inside it, or on its conservative side, holds; past its nearer end
 * by less than `unsupportedPast` is stretched, by more is unsupported.
 * `tolerance` is the margin inside which the OM is at the evidence (a
 * survey's margin of error, else a hair) — a comparable may carry its own,
 * and a survey's margin then reaches the survey's figure and no other's.
 */
function judge(
  om: number,
  comparables: readonly (number | { value: number; tolerance: number })[],
  optimistic: "low" | "high",
  unit: NonNullable<StressRow["gap"]>["unit"],
  unsupportedPast: number,
  tolerance: number,
  text: (gap: number, best: number) => string,
): Judged {
  const items = comparables.map((c) => (typeof c === "number" ? { value: c, tolerance } : c));
  const best = items[0].value;
  const gap = optimistic === "low" ? best - om : om - best;
  // How far past the evidence's nearer edge, each figure's edge its own
  // value less (or plus) its own tolerance: "past" is measured from the
  // edge of whichever figure reaches nearest the OM.
  const beyond = optimistic === "low" ? Math.min(...items.map((c) => c.value - c.tolerance)) - om : om - Math.max(...items.map((c) => c.value + c.tolerance));
  const verdict: StressVerdict = beyond <= 0 ? "holds" : beyond > unsupportedPast ? "unsupported" : "stretched";
  return { gap: { value: round(gap, unit), unit, text: text(gap, best) }, verdict };
}

function round(n: number, unit: NonNullable<StressRow["gap"]>["unit"]): number {
  if (unit === "usd") return Math.round(n);
  if (unit === "bps") return Math.round(n);
  return Math.round(n * 10) / 10;
}

// ── The model, run again with one input swapped ──────────────────────────

const pctOrNone = (n: number | null): string => (n == null ? "does not solve" : pct1(n * 100));
const multOrNone = (n: number | null): string => (n == null ? "—" : `${n.toFixed(2)}x`);

/**
 * The engine on the model's inputs with ONE input replaced, twice: the base
 * run with the OM's figure in that input, the alternative with the
 * evidence's — so the two runs differ in that one input and nothing else,
 * and the move is the gap's own. The model's default is neither (it never
 * reads the OM's growth rates, runs its exit at the going-in cap and its
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
  words: { what: string; om: string; alt: string; evidence: string; omSide?: string; model: string },
): StressImpact {
  const base = computeUnderwrite(baseInputs).returns;
  const alt = computeUnderwrite(altInputs).returns;
  const same = Math.abs(altValue - omValue) < 1e-9;
  const omSide = words.omSide ?? "the OM's";
  // A publisher named with its channel ("BLS via FRED") takes no
  // possessive: the figure, then whose it is.
  const altSaid = !words.evidence ? words.alt : / via /.test(words.evidence) ? `${words.alt} (${words.evidence})` : `${words.evidence}'s ${words.alt}`;
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
  words: { what: string; om: string; alt: string; evidence: string; model: string },
): StressImpact {
  const inputs = derived.inputs;
  return runImpact(input, { ...inputs, [input]: omPct / 100 }, { ...inputs, [input]: altPct / 100 }, evidenceIndex, omPct / 100, altPct / 100, inputs[input], words);
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

/** The OM's stabilized vacancy, as a vacancy row (a stabilized or pro forma
 *  one first) or as what its stated occupancy leaves. */
function omVacancy(rows: Row[]): { row: Row; pct: number; from: "vacancy" | "occupancy" } | null {
  const vacancyRows = rows.filter((m) => VACANCY_ROW.test(m.label) && !VACANCY_NOT.test(m.label) && !VACANCY_VALUE_NOT.test(m.value) && parsePct(m.value) != null);
  const row = vacancyRows.find((m) => VACANCY_PLAN.test(m.label)) ?? vacancyRows[0] ?? null;
  if (row) {
    const pct = parsePct(row.value)!;
    if (pct >= 0 && pct <= 100) return { row, pct, from: "vacancy" };
  }
  const occ = occupancyRow(rows) as Row | null;
  const occPct = occ ? parsePct(occ.value) : null;
  if (occ && occPct != null && occPct >= 0 && occPct <= 100) return { row: occ, pct: Math.round((100 - occPct) * 10) / 10, from: "occupancy" };
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
  { key: "insurance", re: /\binsurance\b|\bpremium\b(?![^,;]*\breplacement cost\b)/i },
  { key: "exit_cap", re: /\b(?:exit|terminal|reversion|residual|disposition)\b|compression/i },
  { key: "debt", re: /(?<!\bbad\s)\bdebt\b|\b(?:loan|financing|interest rate|dscr|coverage|leverage|refinanc|ltv|ltc|sofr|treasury|lender)\b/i },
  { key: "vacancy", re: /\b(?:vacancy|occupancy|lease[- ]up|absorption|occupied)\b/i },
  { key: "noi", re: /\bnoi\b|net operating income|\bt-?12\b|trailing/i },
  { key: "rent_growth", re: /\b(?:rent|rental|income|revenue)s?\s+growth|\bgrowth\b[^,;]*\brents?\b|loss[- ]to[- ]lease|mark[- ]to[- ]market|market rent|pro ?forma rent/i },
  { key: "expense_growth", re: /\b(?:expense|opex|operating expense)s?\s+(?:growth|ratio|load|escalation)|expense (?:growth|ratio)/i },
  { key: "basis", re: /\bprice\b|\bpricing\b|\bbasis\b|\bask(?:ing)?\b[^;]*\b(?:per (?:unit|door|key|sf)|psf)\b|replacement cost|overpay|\bcomps?\b/i },
];

/** The row a stored challenge belongs to: its own `key` where the
 *  challenger wrote one, else the keyword table on its assumption text,
 *  else "other". */
export function challengeKey(c: Challenge): StressKey {
  if (c.key && (STRESS_KEYS as readonly string[]).includes(c.key)) return c.key as StressKey;
  const hit = CHALLENGE_KEYWORDS.find((k) => k.re.test(c.assumption ?? ""));
  return hit?.key ?? "other";
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
  market: MarketResult | null;
  brokerComps: BrokerCompsResult | null;
  recordedSales: RecordedSalesEvidence | null;
  pastScreens: PastScreensEvidence | null;
  pastScreensWithheld: string | null;
  indexGiven: DebtIndex | null;
  readOn: string;
}

const TITLES: Record<StressKey, string> = {
  basis: "Basis",
  exit_cap: "Exit cap",
  debt: "Debt",
  noi: "NOI",
  vacancy: "Stabilized vacancy",
  rent_growth: "Rent growth",
  expense_growth: "Expense growth",
  taxes: "Real estate taxes",
  insurance: "Insurance",
  renovation_premium: "Renovation premium",
  other: "Everything else the challenger raised",
};

/**
 * "The OM's stabilized vacancy against the deal's T-12, then rental vacancy,
 * metro area (Census Bureau); beside the class's norm." — the sources
 * actually attached, in their order: "against" the ones the row's verdict
 * is struck on (`compared`, the row's own set; where a row hands none,
 * every item with a figure), "beside" the rest — a figure shown apart, one
 * held to nothing, words alone. A publisher the label already names is not
 * said twice. None, said so.
 */
function methodSentence(key: StressKey, evidence: StressEvidence[], compared?: ReadonlySet<number>, title?: string): string {
  const what = `The OM's ${lowerFirst(title ?? TITLES[key])}`;
  if (evidence.length === 0) return `${what}: no evidence with a figure or words could be read for this deal, so it stands unchecked.`;
  const isCompared = (i: number) => (compared ? compared.has(i) : evidence[i].value != null);
  const name = (e: StressEvidence) => (e.label.toLowerCase().includes(e.publisher.toLowerCase()) ? lowerFirst(e.label) : `${lowerFirst(e.label)} (${e.publisher})`);
  const against = evidence.filter((_, i) => isCompared(i)).map(name);
  const beside = evidence.filter((_, i) => !isCompared(i)).map(name);
  if (against.length === 0) return `${what} beside ${joinWords(beside)}: none carries a figure it is held to.`;
  const [first, ...rest] = against;
  return `${what} against ${first}${rest.length ? `, then ${joinWords(rest)}` : ""}${beside.length ? `; beside ${joinWords(beside)}` : ""}.`;
}

function unchecked(key: StressKey, omSays: StressRow["omSays"], evidence: StressEvidence[], why: string, compared?: ReadonlySet<number>, title?: string): StressRow {
  return { key, title: title ?? TITLES[key], omSays, evidence, gap: null, verdict: "unchecked", impact: null, challenge: null, method: methodSentence(key, evidence, compared, title), unchecked: why };
}

/** The indexes of the evidence a row's verdict is struck on. */
const indexesOf = (evidence: StressEvidence[], pick: (e: StressEvidence, i: number) => boolean): Set<number> =>
  new Set(evidence.map((e, i) => (pick(e, i) ? i : -1)).filter((i) => i >= 0));

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
 * to the market.
 */
export function stabilizedVacancyStated(extraction: ExtractionResult | null, firstSignal?: FirstSignal | null): boolean {
  const om = omVacancy(rowsOf(extraction));
  return om?.from === "vacancy" && !isPlanDeal(inferStrategy(extraction, firstSignal ?? null).kind);
}

/**
 * Where a published vacancy figure stands in the order a stabilized
 * assumption is held to them — the order lib/model-vs-market's vacancy check
 * anchors in: the metro area's survey, inside its own margin; for a
 * commercial class, the research tracker's band (where the read holds the
 * model to it); the Census region's; the state's annual figure. The first
 * present decides and the rest are shown beside it. Read off the figure's
 * label, never its picture's marks, which a withheld read drops.
 */
function marketVacancyRank(label: string): number {
  if (/research tracker/i.test(label)) return 1;
  if (/metro area/i.test(label)) return 0;
  if (/census region/i.test(label)) return 2;
  return 3;
}

function vacancyRow(ctx: Ctx): StressRow | null {
  const om = omVacancy(ctx.rows);
  // Each piece is gathered apart and set in order once the row knows which
  // kind decides: the deal's documents, the published figures (each with its
  // own tolerance — the survey's margin reaches the survey's figure, never
  // the region's or the state's beside it), the class's rule of thumb.
  type Piece = { e: StressEvidence; tolerance: number; compare: boolean; rank: number };
  const docs: Piece[] = [];
  const market: Piece[] = [];
  let rot: Piece | null = null;
  const piece = (e: StressEvidence, tolerance = SAME, compare = true, rank = 0): Piece => ({ e, tolerance, compare: compare && e.value != null, rank });
  // The deal's own documents: the rent roll's occupancy, the T-12's
  // vacancy loss over gross potential rent — whether its rent line already
  // nets the vacancy is the statement's own EGI to say (lib/actuals/analyze
  // `t12Vacancy`, the track record's one reading), and the sentence says
  // what the loss was divided by.
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
      docs.push(piece({
        kind: "document",
        label: "The deal's rent roll: the occupancy it runs at",
        text: `${pct1(v)} vacant (${useUnits ? `by count, ${s.occupiedUnits} of ${s.unitCount} ${noun} occupied` : "by area, SF-weighted"}${asOf ? `, as of ${proseDay(asOf)}` : ", no stated as-of"})`,
        value: v,
        asOf,
        publisher: "the deal's rent roll",
        scope: "deal",
      }));
    }
  }
  const t12 = ctx.actuals?.t12;
  const tv = t12 ? t12Vacancy(t12.summary) : null;
  if (t12 && tv) {
    docs.push(piece({
      kind: "document",
      label: "The deal's T-12: vacancy loss over gross potential rent",
      text: `${pct1(tv.pct)} (${money(tv.loss)} of ${money(tv.over)} gross potential rent: ${t12VacancyOverWords(tv)}${t12.periodEnd ? `; TTM to ${proseDay(t12.periodEnd)}` : "; period not stated"})`,
      value: tv.pct,
      asOf: t12.periodEnd,
      publisher: "the deal's T-12",
      scope: "deal",
    }));
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
      market.push(piece(e, moeOf(f) ?? SAME, compare, marketVacancyRank(f.label)));
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
  // A stabilized assumption on a deal read as stabilized is the market's to
  // judge (`stabilizedVacancyStated`): the published figure first in
  // `marketVacancyRank`'s order decides, inside its own margin, and the
  // documents' vacancy is today's — shown beside it as the gap a lease-up
  // has to close, or as support where the building already runs at or under
  // the assumption. Where no published figure is fresh, the documents decide
  // as on every other deal, and the row says so.
  const stabilized = om?.from === "vacancy" && !ctx.plan;
  const heldTo = stabilized ? market.filter((m) => m.compare) : [];
  const topRank = heldTo.length > 0 ? Math.min(...heldTo.map((m) => m.rank)) : null;
  const deciding = topRank == null ? [] : heldTo.filter((m) => m.rank === topRank);
  const marketDecides = deciding.length > 0;
  // The documents' vacancy against the stabilized assumption, said as
  // today's: the gap a lease-up has to close, or support for the figure.
  const todayWords = (docPct: number, omPct: number, what: string): string => {
    const diff = docPct - omPct;
    return diff > SAME
      ? `${pts(diff)} over ${what} — the gap a lease-up has to close`
      : `${diff < -SAME ? `${pts(diff)} under` : "at"} ${what} — support for it`;
  };
  if (marketDecides && om) {
    for (const d of docs) {
      d.e = { ...d.e, text: `${d.e.text}; today's, ${todayWords(d.e.value!, om.pct, "the stabilized assumption")}` };
      d.compare = false;
    }
    for (const m of market) if (!deciding.includes(m)) m.compare = false;
    if (rot) rot.compare = false;
  }
  // The row prints the kind that decides first.
  const ordered: Piece[] = marketDecides
    ? [...deciding, ...market.filter((m) => !deciding.includes(m)), ...docs, ...(rot ? [rot] : [])]
    : [...docs, ...market, ...(rot ? [rot] : [])];
  const evidence = ordered.map((p) => p.e);
  const compared = indexesOf(evidence, (_, i) => ordered[i].compare);
  // Where the OM states no vacancy allowance, the figure is its occupancy
  // TODAY, not a pro forma assumption: the row is titled and worded so, and
  // the documents — today's figures too — decide it.
  const title = om?.from === "occupancy" ? OCCUPANCY_TITLE : undefined;
  const omSays: StressRow["omSays"] = om
    ? {
        text:
          om.from === "vacancy"
            ? `${om.row.label}: ${om.row.value}`
            : `${om.row.label}: ${om.row.value} as stated — today's occupancy, not a pro forma assumption — which leaves ${pct1(om.pct)} vacant`,
        value: om.pct,
        page: pageOf(om.row, ctx.ex),
      }
    : { text: NO_FIGURE("vacancy or occupancy"), value: null, page: null };
  if (!om) return unchecked("vacancy", omSays, evidence, NO_FIGURE("vacancy or occupancy"), compared);
  const comparables = ordered.filter((p) => p.compare);
  if (comparables.length === 0) return unchecked("vacancy", omSays, evidence, NO_EVIDENCE, compared, title);
  // The verdict is the best kind's: the published figure that decides a
  // stabilized assumption; else the deal's own document where one states
  // the figure, else the published figures, else the rule of thumb. A rule
  // of thumb never widens the range a document decides (a 5% class default
  // beside a T-12's 9.1% had read the OM's 6% as "inside").
  const best = comparables[0];
  const bestValue = best.e.value!;
  const decisive = marketDecides ? deciding : comparables.filter((c) => c.e.kind === best.e.kind);
  // Each figure carries its own tolerance: the survey's margin reaches the
  // survey's figure, never the region's or the state's beside it.
  const figures = decisive.map((c) => ({ value: c.e.value!, tolerance: c.tolerance }));
  let judged: Judged;
  if (marketDecides) {
    // Said by the figure that decided — its margin, or its band — and why
    // it decides: the assumption is the building stabilized, which the
    // market's own vacancy speaks to and today's documents do not.
    const band = figures.length > 1 ? { lo: Math.min(...figures.map((f) => f.value)), hi: Math.max(...figures.map((f) => f.value)) } : null;
    const moe = band || best.tolerance === SAME ? null : best.tolerance;
    const said = `${lowerFirst(best.e.label.replace(/, low read$/, ""))} (${best.e.publisher}), ${band ? `${pct1(band.lo)}–${pct1(band.hi)}` : `${pct1(bestValue)}${moe != null ? ` ±${moe} pts` : ""}`}`;
    const edge = band ? band.lo - SAME : bestValue - (moe ?? SAME);
    const doc = docs[0];
    const docLine = doc
      ? ` ${doc === docs.find((d) => d.e.publisher === "the deal's rent roll") ? `Today the deal's rent roll runs ${pct1(doc.e.value!)} vacant` : `The deal's T-12 ran ${pct1(doc.e.value!)} vacant over its trailing year`}, ${todayWords(doc.e.value!, om.pct, "the assumption")}.`
      : "";
    judged = judge(om.pct, figures, "low", "pts", VACANCY_UNSUPPORTED_PTS, SAME, (gap) => {
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
      return `The OM's ${pct1(om.pct)} is a stabilized assumption, so it is held to the market's published figure: ${said}. The OM is ${where}.${docLine}`;
    });
  } else {
    // A stabilized assumption with no fresh published figure to hold it to:
    // the documents decide, said so.
    const noMarket = stabilized && best.e.kind === "document" ? " No fresh published vacancy figure for this market could be held to the stabilized assumption, so the deal's own documents decide." : "";
    judged = judge(om.pct, figures, "low", "pts", VACANCY_UNSUPPORTED_PTS, SAME, (gap) =>
      Math.abs(gap) < SAME
        ? `The OM's ${pct1(om.pct)} is at the evidence's ${pct1(bestValue)}.${noMarket}`
        : gap > 0
          ? `The OM's ${pct1(om.pct)} is ${pts(gap)} under the evidence's ${pct1(bestValue)}.${noMarket}`
          : `The OM's ${pct1(om.pct)} is ${pts(gap)} over the evidence's ${pct1(bestValue)} — the conservative side.${noMarket}`,
    );
  }
  // The engine is re-run at the figure that decided.
  const evidenceIndex = ordered.indexOf(best);
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? pctImpact(ctx.derived, "vacancyPct", evidenceIndex, om.pct, bestValue, {
          what: "vacancy",
          om: pct1(om.pct),
          alt: pct1(bestValue),
          evidence: best.e.publisher,
          model: pct1(ctx.derived.inputs.vacancyPct * 100),
        })
      : null;
  return { key: "vacancy", title: title ?? TITLES.vacancy, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("vacancy", evidence, compared, title), ...(best.e.kind === "rule_of_thumb" ? { ruleOfThumbOnly: true } : {}) };
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
function rentGrowthRow(ctx: Ctx): StressRow | null {
  const om = statedPct(ctx.rows, RENT_GROWTH_ROW, RENT_GROWTH_NOT);
  // A regulation's allowance is the regime's, for the units it regulates —
  // shown first and never in the market's range (the read's own rule), so
  // never the figure that decides.
  const check = checkOf(ctx.mvm, "rent_growth");
  const apart: StressEvidence[] = [];
  const market: StressEvidence[] = [];
  check?.published.forEach((f, i) => {
    const e = published(check, f, ctx.mvm?.grain ?? null);
    if (check.marks?.[i]?.role === "apart" || /allowance on the regulated units/i.test(f.label)) apart.push(e);
    else market.push(e);
  });
  if (!om && apart.length + market.length === 0) return null;
  // The one figure that decides, the first of the class's order present
  // (lib/rent-growth-decider), printed first among the market's; the rest
  // beside it.
  const decided = rentGrowthDecider(ctx.assetClass, market.map((m) => m.label));
  const found = decided ? market[decided.index] : null;
  const evidence = [...apart, ...(found ? [found] : []), ...market.filter((m) => m !== found)];
  const pick = decided && found ? { i: apart.length, d: decided } : null;
  const compared = new Set<number>(pick ? [pick.i] : []);
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("rent growth rate"), value: null, page: null };
  if (!om) return unchecked("rent_growth", omSays, evidence, NO_FIGURE("rent growth rate"), compared);
  // Lodging and licensed care read no rent index: the true reason, never
  // that nothing could be read.
  if (!pick) return unchecked("rent_growth", omSays, evidence, market.length === 0 && readsNoRentIndex(ctx.assetClass) ? NO_RENT_INDEX : NO_EVIDENCE, compared);
  const decider = evidence[pick.i];
  const bestValue = decider.value!;
  const name = pick.d.name;
  // "Held to Zillow's apartment asking rents, the figure for this kind of
  // rent: +1.6% over the year to Aug 2026 (Zillow Research)."
  const held = `Held to ${name}, ${pick.d.why}: ${decider.text} (${decider.publisher}).`;
  const judged = judge(om.pct, [bestValue], "high", "pts", RENT_GROWTH_UNSUPPORTED_PTS, SAME, (gap) =>
    Math.abs(gap) < SAME
      ? `${held} The OM's ${pct1(om.pct)}/yr is at it.`
      : gap > 0
        ? `${held} The OM's ${pct1(om.pct)}/yr is ${pts(gap)} over it.`
        : `${held} The OM's ${pct1(om.pct)}/yr is ${pts(gap)} under it — the conservative side.`,
  );
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? pctImpact(ctx.derived, "rentGrowthPct", pick.i, om.pct, bestValue, {
          what: "rent growth",
          om: `${pct1(om.pct)}/yr`,
          alt: `${pct1(bestValue)}/yr`,
          evidence: decider.publisher,
          model: `${pct1(ctx.derived.inputs.rentGrowthPct * 100)}/yr`,
        })
      : null;
  return { key: "rent_growth", title: TITLES.rent_growth, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("rent_growth", evidence, compared) };
}

// — Expense growth —

function expenseGrowthRow(ctx: Ctx): StressRow | null {
  const om = statedPct(ctx.rows, EXPENSE_GROWTH_ROW);
  const evidence: StressEvidence[] = [];
  const comparables: number[] = [];
  const compared = new Set<number>();
  const check = checkOf(ctx.mvm, "expense_growth");
  if (check) {
    check.published.forEach((f, i) => {
      const e = published(check, f, ctx.mvm?.grain ?? null);
      evidence.push(e);
      // The price indexes are the range; the insurance index and the
      // breakeven are shown apart, never averaged in (the read's own rule).
      if (check.marks?.[i]?.role !== "apart") {
        comparables.push(f.value);
        compared.add(evidence.length - 1);
      }
    });
  }
  if (!om && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("expense growth rate"), value: null, page: null };
  if (!om) return unchecked("expense_growth", omSays, evidence, NO_FIGURE("expense growth rate"), compared);
  if (comparables.length === 0) return unchecked("expense_growth", omSays, evidence, NO_EVIDENCE, compared);
  // Under the lowest price index is the optimistic side for an expense.
  const bestValue = Math.min(...comparables);
  const ordered = [bestValue, ...comparables.filter((v) => v !== bestValue)];
  const judged = judge(om.pct, ordered, "low", "pts", EXPENSE_GROWTH_UNSUPPORTED_PTS, SAME, (gap) =>
    Math.abs(gap) < SAME
      ? `The OM's ${pct1(om.pct)}/yr is at the price index's ${pct1(bestValue)}.`
      : gap > 0
        ? `The OM's ${pct1(om.pct)}/yr is ${pts(gap)} under the lowest price index, ${pct1(bestValue)}.`
        : `The OM's ${pct1(om.pct)}/yr is ${pts(gap)} over the price index's ${pct1(bestValue)} — the conservative side.`,
  );
  const evidenceIndex = evidence.findIndex((e) => e.value === bestValue);
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? pctImpact(ctx.derived, "expenseGrowthPct", evidenceIndex, om.pct, bestValue, {
          what: "expense growth",
          om: `${pct1(om.pct)}/yr`,
          alt: `${pct1(bestValue)}/yr`,
          evidence: evidence[evidenceIndex].publisher,
          model: `${pct1(ctx.derived.inputs.expenseGrowthPct * 100)}/yr`,
        })
      : null;
  return { key: "expense_growth", title: TITLES.expense_growth, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("expense_growth", evidence, compared) };
}

// — Exit cap —

function exitCapRow(ctx: Ctx): StressRow | null {
  const om = statedPct(ctx.rows, EXIT_CAP_ROW);
  const evidence: StressEvidence[] = [];
  // The going-in cap: an exit tighter than the entry is cap compression.
  const goingRow = findGoingInCap(ctx.rows);
  const goingIn = goingRow ? parsePct(goingRow.value) : null;
  const goingInOk = goingIn != null && goingIn > 0 && !ctx.plan && buildingPriceOf(ctx.ex, 1) != null;
  if (goingInOk) {
    evidence.push({
      kind: "om_internal",
      label: "The OM's going-in cap",
      text: `${pct2(goingIn!)} (${goingRow!.label}): an exit tighter than it is cap compression`,
      value: goingIn!,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
    });
  }
  // The published figures the read carries: the 10-year, dated (a yield,
  // not a cap — the exit's spread over it is the read, never a comparable),
  // and the tracker's cap range where one is on file and held to.
  const check = checkOf(ctx.mvm, "exit_cap");
  const trackerComparables: number[] = [];
  // The going-in cap and a tracker range held to are compared; the 10-year
  // (a yield, not a cap) and a tracker range held to nothing are beside.
  const compared = new Set<number>(goingInOk ? [0] : []);
  if (check) {
    const held = !/not held to it/.test(check.read);
    for (const f of check.published) {
      const e = published(check, f, ctx.mvm?.grain ?? null);
      if (/research tracker/i.test(f.label)) {
        evidence.push(e);
        if (held) {
          trackerComparables.push(f.value);
          compared.add(evidence.length - 1);
        }
      } else {
        const exit = om?.pct ?? (ctx.derived ? ctx.derived.inputs.exitCapPct * 100 : null);
        const spread = exit != null ? Math.round((exit - f.value) * 100) : null;
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
  if (!om && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}${statesRange(om.row.value) ? " (a range, read at its first figure)" : ""}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("exit cap"), value: null, page: null };
  if (!om) return unchecked("exit_cap", omSays, evidence, NO_FIGURE("exit cap"), compared);
  if (!goingInOk && trackerComparables.length === 0) {
    // Said by what stopped the test, never "no going-in cap" beside one the
    // OM states: on a value-add, lease-up, conversion or development deal
    // the going-in cap is struck on today's income, not the stabilized one
    // the exit sells; on a price that buys no building it is no building's.
    const stated = goingIn != null && goingIn > 0;
    const range = check?.published.some((f) => /research tracker/i.test(f.label)) ? "the published cap range is held to nothing (stale, undated or a narrower stock)" : "no published cap range was read for this market and class";
    const why = !stated
      ? `The OM states no going-in cap, and ${range}.`
      : ctx.plan
        ? `On a value-add, lease-up, conversion or development deal the OM's going-in cap is struck on today's income, not the stabilized income the exit sells, so the exit is not held to it; and ${range}.`
        : `The price buys no building, so its going-in cap is no building's to hold the exit to; and ${range}.`;
    return unchecked("exit_cap", omSays, evidence, why, compared);
  }
  // Against the going-in cap where one stands: holds at or over it; tighter
  // is stretched, and by 25 bps or more with no published range reaching
  // the exit, unsupported. Where a published range supports the exit (its
  // low end at or under it), a compression is stretched, never unsupported.
  const supported = trackerComparables.length > 0 && Math.min(...trackerComparables) <= om.pct + SAME;
  let judged: Judged;
  if (goingInOk) {
    const g = goingIn!;
    const diffBps = (g - om.pct) * 100;
    // The figures are percent points here; the threshold is in bps.
    judged = judge(om.pct, [g], "low", "bps", supported ? Infinity : EXIT_CAP_UNSUPPORTED_BPS / 100 - SAME, SAME, () =>
      // Flat to the entry holds: the code carries no expansion default (the
      // model itself exits at the going-in cap), so none is invented here;
      // the sentence says what most underwriting does.
      Math.abs(diffBps) < SAME * 100
        ? `The OM's ${pct2(om.pct)} exit is flat to its ${pct2(g)} going-in cap; most underwriting adds expansion over a hold.`
        : diffBps > 0
          ? `The OM's ${pct2(om.pct)} exit is ${bps(diffBps)} tighter than its ${pct2(g)} going-in cap — cap compression${supported ? ", inside the published cap range" : ""}.`
          : `The OM's ${pct2(om.pct)} exit is ${bps(diffBps)} over its ${pct2(g)} going-in cap — the conservative side.`,
    );
  } else {
    const lo = Math.min(...trackerComparables);
    judged = judge(om.pct, [lo, ...trackerComparables.filter((v) => v !== lo)], "low", "bps", EXIT_CAP_UNSUPPORTED_BPS / 100 - SAME, SAME, (gap) =>
      Math.abs(gap) < SAME
        ? `The OM's ${pct2(om.pct)} exit sits at the published cap range's low end, ${pct2(lo)}.`
        : gap > 0
          ? `The OM's ${pct2(om.pct)} exit is ${bps(gap * 100)} under the published cap range's low end, ${pct2(lo)}.`
          : `The OM's ${pct2(om.pct)} exit is ${bps(gap * 100)} over the published cap range's low end, ${pct2(lo)} — the conservative side.`,
    );
    judged.gap = { ...judged.gap, value: Math.round(judged.gap.value * 100), unit: "bps" };
  }
  if (goingInOk) judged.gap = { ...judged.gap, value: Math.round((goingIn! - om.pct) * 100), unit: "bps" };
  // 25 bps or more of compression with no published range reaching the
  // exit is unsupported: the threshold is inclusive, as the rule says.
  if (judged.verdict === "stretched" && !supported && judged.gap.value >= EXIT_CAP_UNSUPPORTED_BPS) judged.verdict = "unsupported";
  // The engine is re-run at the going-in cap (the entry), else at the
  // published range's low end.
  const alt = goingInOk ? goingIn! : Math.min(...trackerComparables);
  const evidenceIndex = evidence.findIndex((e) => e.value === alt);
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? pctImpact(ctx.derived, "exitCapPct", evidenceIndex, om.pct, alt, {
          what: "the exit cap",
          om: pct2(om.pct),
          alt: pct2(alt),
          evidence: goingInOk ? "the going-in cap" : evidence[evidenceIndex].publisher,
          model: pct2(ctx.derived.inputs.exitCapPct * 100),
        })
      : null;
  return { key: "exit_cap", title: TITLES.exit_cap, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("exit_cap", evidence, compared) };
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

function debtRow(ctx: Ctx): StressRow | null {
  // A note's buyer takes no acquisition loan on the collateral: the rate
  // on file is the note's own coupon (#416), and no row is built.
  if (interestOf(ctx.ex).kind === "note") return null;
  const om = statedPct(ctx.rows, DEBT_RATE_ROW, DEBT_RATE_NOT);
  const evidence: StressEvidence[] = [];
  const seed = ctx.derived?.meta.rateSeed ?? null;
  const index = seed ? seedIndex(seed, ctx.indexGiven) : null;
  // Today's index, the fact, dated and published; then the class's
  // screening spread over it, a rule of thumb named as one — never the two
  // as one published figure, since the spread is nobody's print.
  if (seed && index) {
    evidence.push({
      kind: "published",
      label: `The index the model prices off: ${index.name}`,
      text: `${pct2(index.pct)} (${index.credit}, ${datedLong(index.asOf)})`,
      value: index.pct,
      asOf: index.asOf,
      publisher: index.credit,
      scope: "nation",
    });
    evidence.push({
      kind: "rule_of_thumb",
      label: "The class's screening spread over it, a rule of thumb",
      text: `+${index.spreadBps} bps over the index, the class's screening default, not a quote: ${pct2(seed.pct)} all in — ${seed.note}`,
      value: seed.pct,
      asOf: null,
      publisher: "a screening default",
      scope: "class",
    });
  } else if (seed) {
    evidence.push({
      kind: "rule_of_thumb",
      label: "The index the model prices off, plus the class's screening spread",
      text: `${pct2(seed.pct)} — ${seed.note}`,
      value: seed.pct,
      asOf: null,
      publisher: "a screening default",
      scope: "class",
    });
  }
  const ten = ctx.market?.liveBrief?.figures?.find((f) => f.key === "dgs10") ?? null;
  if (ten) {
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
  const priceOk = ctx.derived && ctx.impactsWithheld == null && inputs && inputs.purchasePrice > 0;
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
      evidence.push({
        kind: "rule_of_thumb",
        label: "Lender tests at screening defaults, the binding one named",
        text: `${binding.label} (${binding.setAt}) binds at ${money(s.loan)} on the model's year-1 NOI at ${pct2(rate)}; the model's loan is ${money(modelLoan)} — ${SIZER_LENDER_TESTS.maxLtvPct}% LTV, ${SIZER_LENDER_TESTS.minDscr.toFixed(2)}x and ${SIZER_LENDER_TESTS.minDebtYieldPct}% debt yield are screening defaults`,
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
  if (!om && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("loan rate"), value: null, page: null };
  if (!om) return unchecked("debt", omSays, evidence, NO_FIGURE("loan rate"));
  if (!seed) return unchecked("debt", omSays, evidence, "No index was read today to set the OM's rate against.");
  // The figures are percent points here; the threshold is in bps.
  const judged = judge(om.pct, [seed.pct], "low", "bps", DEBT_UNSUPPORTED_BPS / 100 - SAME, SAME, () => {
    const d = (seed.pct - om.pct) * 100;
    return Math.abs(d) < SAME * 100
      ? `The OM's ${pct2(om.pct)} is at the seeded ${pct2(seed.pct)}.`
      : d > 0
        ? `The OM's ${pct2(om.pct)} is ${bps(d)} under the index plus the class's spread, ${pct2(seed.pct)}.`
        : `The OM's ${pct2(om.pct)} is ${bps(d)} over the index plus the class's spread, ${pct2(seed.pct)} — the conservative side.`;
  });
  judged.gap = { ...judged.gap, value: Math.round((seed.pct - om.pct) * 100), unit: "bps" };
  // The spread is a screening default, so a rate under the index plus the
  // spread is stretched at most; only a rate under the bare index — under
  // the fact — reads unsupported.
  if (judged.verdict === "unsupported" && index && om.pct >= index.pct - SAME) judged.verdict = "stretched";
  const seedIndexAt = evidence.findIndex((e) => e.value === seed.pct);
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? pctImpact(ctx.derived, "allInRatePct", seedIndexAt, om.pct, seed.pct, {
          what: "the all-in rate",
          om: pct2(om.pct),
          alt: pct2(seed.pct),
          evidence: "the index plus the class's spread",
          model: pct2(ctx.derived.inputs.allInRatePct * 100),
        })
      : null;
  // The rate is held to the index plus the class's screening spread: the
  // spread is the site's own default, so the verdict is a rule of thumb's.
  return { key: "debt", title: TITLES.debt, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("debt", evidence), ruleOfThumbOnly: true };
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
      label: "The deal's T-12 NOI",
      text: `${money(t12.summary.noi)}${t12.summary.noiDerived ? " (derived: EGI less expenses)" : ""} (${t12.periodEnd ? `TTM to ${proseDay(t12.periodEnd)}` : "period not stated"})`,
      value: t12.summary.noi,
      asOf: t12.periodEnd,
      publisher: "the deal's T-12",
      scope: "deal",
    });
  }
  // The rent roll's in-place rent against the OM's pro forma rent, in words
  // — a month's rent a unit, not a year's NOI, so it never drives the gap.
  const rr = ctx.actuals?.rentRoll;
  const proForma = findMetric(ctx.rows, PRO_FORMA_RENT_ROW, RENT_NOT);
  if (rr && rr.summary.avgRentMonthly != null && proForma) {
    const asOf = rr.asOf ?? rr.summary.asOfUsed ?? null;
    evidence.push({
      kind: "document",
      label: "The rent roll's in-place rent against the OM's pro forma rent",
      text: `$${Math.round(rr.summary.avgRentMonthly).toLocaleString("en-US")} a unit a month in place${asOf ? ` (as of ${proseDay(asOf)})` : ""} against the OM's ${proForma.label.toLowerCase()} of ${proForma.value}`,
      value: null,
      asOf,
      publisher: "the deal's rent roll",
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
      label: "The OM's in-place NOI against its pro forma",
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
  // The T-12 is the comparable; the OM's own in-place figure stands in only
  // where the figure under test is the pro forma and no T-12 is on file.
  const comparables = evidence.filter((e) => e.value != null && (e.kind === "document" || (e.kind === "om_internal" && omLabel !== e.label && omValue !== e.value)));
  const compared = indexesOf(evidence, (e) => comparables.includes(e));
  if (comparables.length === 0) {
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
    return unchecked("noi", omSays, evidence, why, compared);
  }
  const best = comparables[0];
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
  if (ctx.derived && ctx.impactsWithheld == null) {
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
  return { key: "noi", title: TITLES.noi, omSays, evidence, gap, verdict, impact, challenge: null, method: methodSentence("noi", evidence, compared) };
}

// — Taxes —

function taxesRow(ctx: Ctx): StressRow | null {
  const billRow = ctx.rows.find((m) => TAX_BILL_ROW.test(m.label) && !TAX_BILL_NOT.test(m.label) && taxBillOf(m.value) != null) ?? null;
  const bill = billRow ? taxBillOf(billRow.value) : null;
  const assessedRow = findMetric(ctx.rows, ASSESSED_ROW, ASSESSED_NOT);
  const assessed = assessedRow ? parseUsd(assessedRow.value, 10_000) : null;
  // The building's price off the stated ask (a share's grossed up ONCE to
  // the whole, none on a note or the land) — never off the derived model's
  // price, which on a share is already the whole and grossed up again read
  // a 49% share's $20M as $83M.
  const price = buildingPriceOf(ctx.ex, askingPriceOf(ctx.ex));
  const evidence: StressEvidence[] = [];
  // The reset bill the memorandum's own figures imply on the price.
  if (bill != null && assessed != null && assessed > 0 && price != null && ctx.derived?.sources.purchasePrice?.provenance !== "assumption") {
    const rate = bill / assessed;
    const reset = rate * price;
    evidence.push({
      kind: "om_internal",
      label: "The bill the OM's own figures imply on the price",
      text: `${money(bill)} over ${money(assessed)} assessed is ${(rate * 100).toFixed(2)}%, which on the ${money(price)} price is ${money(reset)} a year if the sale resets the assessment to the price`,
      value: Math.round(reset),
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
      label: "The stated tax abatement and when it ends",
      text: `${abatement.headline}${placed}`,
      value: full != null && abatementInHold ? Math.round(full) : null,
      asOf: end?.ends ?? null,
      publisher: "the offering memorandum",
      scope: "deal",
    });
  }
  // The T-12's own tax line.
  const t12 = ctx.actuals?.t12;
  const t12Tax = t12?.summary.opex.find((l) => /\btax/i.test(l.label) && !T12_TAX_NOT.test(l.label)) ?? null;
  if (t12Tax && t12Tax.amount > 0) {
    evidence.push({
      kind: "document",
      label: "The deal's T-12 tax line",
      text: `${money(t12Tax.amount)} (${t12Tax.label}${t12?.periodEnd ? `, TTM to ${proseDay(t12.periodEnd)}` : ""})`,
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
  const comparables = evidence.filter((e) => e.value != null && e.kind === "om_internal");
  const compared = indexesOf(evidence, (e) => comparables.includes(e));
  if (bill == null) return unchecked("taxes", omSays, evidence, NO_FIGURE("tax bill"), compared);
  if (comparables.length === 0) {
    return unchecked(
      "taxes",
      omSays,
      evidence,
      assessed == null ? "The OM states no assessed value to work the reset bill from; the rate is the assessor's to give." : NO_EVIDENCE,
      compared,
    );
  }
  const best = comparables[0];
  const share = (best.value! - bill) / Math.abs(best.value!);
  // Both figures are the OM's: the bill against the reset its own figures
  // imply, or the abated bill against the unabated one it states.
  const abated = best.label.startsWith("The stated tax abatement");
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
          ? `If the sale resets the assessment to the price, the bill is ${money(best.value!)}, ${money(best.value! - bill)} (${pct1(share * 100)}) over the OM's ${money(bill)} line — whether it does is the jurisdiction's to say.`
          : `If the sale resets the assessment to the price, the bill is ${money(best.value!)}, under the OM's ${money(bill)} line — the conservative side.`,
  };
  const evidenceIndex = evidence.indexOf(best);
  const impact =
    ctx.derived && ctx.impactsWithheld == null
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
  return { key: "taxes", title: TITLES.taxes, omSays, evidence, gap, verdict, impact, challenge: null, method: methodSentence("taxes", evidence, compared) };
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
 *   - where the line is the class's ratio struck on the OM's NOI, it is read
 *     as carrying the OM's figure: the OM's run is the model's own and the
 *     evidence's moves it by the gap.
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
    impact.note = `${impact.note} The model's expense line is the T-12's expense load, which breaks out no ${lineWord}, so it is read as carrying the OM's figure and the evidence's run moves it by the gap.`;
  }
  return impact;
}

// — Insurance —

function insuranceRow(ctx: Ctx): StressRow | null {
  const premiumRow =
    ctx.rows.find((m) => INSURANCE_ROW.test(m.label) && !INSURANCE_NOT.test(m.label) && !INSURANCE_VALUE_NOT.test(m.value) && !statesRange(m.value) && parseUsd(m.value, 500) != null) ?? null;
  const premium = premiumRow ? parseUsd(premiumRow.value, 500) : null;
  const evidence: StressEvidence[] = [];
  // The T-12's own insurance line.
  const t12 = ctx.actuals?.t12;
  const t12Ins = t12?.summary.opex.find((l) => /insurance/i.test(l.label) && !T12_INSURANCE_NOT.test(l.label)) ?? null;
  if (t12Ins && t12Ins.amount > 0) {
    evidence.push({
      kind: "document",
      label: "The deal's T-12 insurance line",
      text: `${money(t12Ins.amount)} (${t12Ins.label}${t12?.periodEnd ? `, TTM to ${proseDay(t12.periodEnd)}` : ""})`,
      value: Math.round(t12Ins.amount),
      asOf: t12?.periodEnd ?? null,
      publisher: "the deal's T-12",
      scope: "deal",
    });
  }
  // The index: the model-vs-market read's figure, else the stored market
  // check's. Its value here is the premium moved by its year, in dollars —
  // the row's own unit — where the OM states a premium.
  const check = checkOf(ctx.mvm, "expense_growth");
  const idx = check?.published.find((f) => /insurance premiums/i.test(f.label)) ?? null;
  const stored = ctx.market?.liveBrief?.figures?.find((f) => f.key === "insurance_index_yoy") ?? null;
  const index = idx ? { pct: idx.value, text: idx.text, asOf: idx.asOf, publisher: idx.publisher } : stored ? { pct: stored.value, text: `${stored.value > 0 ? "+" : ""}${stored.value.toFixed(1)}% over the year to ${proseDay(stored.asOf)}`, asOf: stored.asOf, publisher: "BLS via FRED" } : null;
  if (index) {
    const moved = premium != null ? Math.round(premium * (1 + index.pct / 100)) : null;
    evidence.push({
      kind: "published",
      label: "Commercial property insurance premiums, national (PPI, commercial multiple peril)",
      text: `${index.text}${moved != null ? ` — the OM's ${money(premium!)} moved by it is ${money(moved)}` : ""}; the nation's carriers, not this building's quote`,
      value: moved,
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
  const comparables = evidence.filter((e) => e.value != null);
  if (comparables.length === 0) return unchecked("insurance", omSays, evidence, NO_EVIDENCE);
  const best = comparables[0];
  const share = (best.value! - premium) / Math.abs(best.value!);
  const verdict: StressVerdict = share <= SAME_SHARE ? "holds" : share > INSURANCE_UNSUPPORTED_SHARE ? "unsupported" : "stretched";
  const gap: StressRow["gap"] = {
    value: Math.round(best.value! - premium),
    unit: "usd",
    text:
      Math.abs(share) <= SAME_SHARE
        ? `The OM's ${money(premium)} is at ${whose(best.publisher, money(best.value!))}.`
        : share > 0
          ? `The OM's ${money(premium)} is ${money(best.value! - premium)} (${pct1(share * 100)}) under ${whose(best.publisher, money(best.value!))}.`
          : `The OM's ${money(premium)} is over ${whose(best.publisher, money(best.value!))} — the conservative side.`,
  };
  const evidenceIndex = evidence.indexOf(best);
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? expenseImpact(ctx, premium, best.value!, t12Ins && t12Ins.amount > 0 ? t12Ins.amount : null, "insurance line", evidenceIndex, {
          what: "the insurance line",
          om: money(premium),
          alt: money(best.value!),
          evidence: best.publisher,
        })
      : null;
  return { key: "insurance", title: TITLES.insurance, omSays, evidence, gap, verdict, impact, challenge: null, method: methodSentence("insurance", evidence) };
}

// — Basis —

/** A basis is struck per unit (the class's noun) or per foot. */
type Per = "unit" | "sf";

/** One piece of the basis row's evidence with a figure: its figure, the
 *  yardstick it states it on, and — for the memorandum's comps — the names
 *  of the comps graded clean behind it where fewer than three are (no median
 *  is struck on them). */
interface BasisComparable {
  e: StressEvidence;
  value: number;
  on: Per;
  few: { count: 1 | 2; names: string[] } | null;
}

/** What the comps step's grades mean, as its prompt defines them
 *  (lib/anthropic/prompts `brokerCompsInstruction`). */
const LEFT_OUT_GRADE: Record<"favorable" | "stretched", string> = {
  favorable: "favorable by the comps step (it leans the seller's way)",
  stretched: "stretched by the comps step (it does not support the deal)",
};

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
  const pushComparable = (e: StressEvidence, on: Per, few: BasisComparable["few"] = null) => {
    evidence.push(e);
    if (e.value != null) comparables.push({ e, value: e.value, on, few });
  };

  // The memorandum's own sale comps, each graded by the comps step: a figure
  // is struck only over the comps it graded `supports`. One it graded
  // `favorable` leans the seller's way and one graded `stretched` does not
  // support the deal: each is named and left out. Three or more clean comps
  // make a median; one or two are named, never called a median (the
  // recorded sales' own floor, lib/public-comps `MEDIAN_FLOOR`).
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
    const figure =
      clean.length >= MEDIAN_FLOOR ? median(clean.map((c) => c.figure)) : clean.length === 2 ? (clean[0].figure + clean[1].figure) / 2 : clean.length === 1 ? clean[0].figure : null;
    const head =
      on === per ? `${group.length} of ${sale.length} state a figure ${pw}` : `${group.length} of ${sale.length} state a figure ${pw} alone, so ${group.length === 1 ? "it is" : "they are"} judged per SF`;
    const graded = clean.length > 0 ? `; graded clean (supports): ${named(clean)}` : "";
    const struck =
      clean.length >= MEDIAN_FLOOR
        ? ` — median ${money(figure!)}${pw} over the ${clean.length}`
        : clean.length === 2
          ? ` — the two graded clean, midpoint ${money(figure!)}${pw}, too few for a median`
          : clean.length === 1
            ? " — the one comp graded clean, too few for a median"
            : ", none graded clean (supports), so none is set against the ask";
    pushComparable(
      {
        kind: "om_internal",
        label: on === per || !stating.some((c) => c.on === per) ? "The memorandum's sale comps" : "The memorandum's sale comps stating a price per SF alone",
        text: `${head}${graded}${struck}${leftOut}`,
        value: figure != null ? Math.round(figure) : null,
        asOf: null,
        publisher: "the offering memorandum",
        scope: "deal",
      },
      on,
      clean.length === 1 || clean.length === 2 ? { count: clean.length as 1 | 2, names: clean.map((c) => c.comp.name) } : null,
    );
  }
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
        asOf: rs.retrievedAt,
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
        publisher: "your past screens",
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
  const asks = comparables.filter((c) => c.e.publisher === "your past screens");
  const judgedOn = comparables.length > asks.length ? comparables.filter((c) => !asks.includes(c)) : asks;
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
  // The verdict is struck on the best kind of evidence present: the
  // memorandum's graded comps and the recorded sales before the reader's
  // own past asking prices, which decide only where nothing else carries a
  // figure — another memorandum's ask never turns a stretched basis into
  // one that holds.
  if (judgedOn.length === 0) {
    return unchecked(
      "basis",
      omSays,
      evidence,
      evidence.some((e) => e.publisher !== "past screens") ? "No evidence above carries a figure the ask can be set against." : "No comp with a figure could be read for this deal.",
    );
  }
  const compared = indexesOf(evidence, (e) => judgedOn.some((c) => c.e === e));
  const best = judgedOn[0];
  const bestOm = omOn(best.on)!;
  const pw = perWordOf(best.on);
  // "the median of …": every basis comparable with three figures behind it
  // is a median, and its label is a phrase no possessive fits ("Recorded
  // sales (Philadelphia OPA)"); one or two comps graded clean are named.
  const ofBest = best.few
    ? best.few.count === 1
      ? `the one comp graded clean, ${best.few.names[0]}, ${money(best.value)}${pw}`
      : `the midpoint of the two comps graded clean (${best.few.names.join(" and ")}), ${money(best.value)}${pw}`
    : `the median of ${asks.includes(best) && ps ? `your past screens' asking prices in ${ps.market}` : lowerFirst(best.e.label)}, ${money(best.value)}${pw}`;
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
  let verdict: StressVerdict = sharePct <= BASIS_STRETCH_PCT ? "holds" : sharePct > BASIS_UNSUPPORTED_PCT ? "unsupported" : "stretched";
  // One or two comps are sightings, not a market: they can stretch a basis,
  // never call it unsupported.
  const capped = verdict === "unsupported" && best.few != null;
  if (capped) verdict = "stretched";
  const gap = {
    value: Math.round(sharePct * 10) / 10,
    unit: "pct" as const,
    text: capped ? `${gapText} On ${best.few!.count === 1 ? "one comp" : "two comps"}, no worse than stretched.` : gapText,
  };
  const evidenceIndex = evidence.indexOf(best.e);
  // The price is a direct input: re-run at the evidence's basis — only
  // where the model's price is the building's own as stated (not a share
  // grossed up, not a placeholder; a plan deal re-runs nothing). The ratio
  // is the same on either yardstick.
  let impact: StressImpact | null = null;
  if (!plan && ctx.derived && ctx.impactsWithheld == null && interest.sharePct == null) {
    const price = ctx.derived.inputs.purchasePrice;
    const altPrice = (price * best.value) / bestOm;
    // Whose figure the alternative is — the memorandum's comps', the
    // recorded sales' or the reader's past screens' — and that the model's
    // loan is a share of the price, so it re-sizes with it.
    const whose =
      best.e.kind === "om_internal"
        ? best.few
          ? best.few.count === 1
            ? `the one comp graded clean (${best.few.names[0]})`
            : `the midpoint of the two comps graded clean (${best.few.names.join(" and ")})`
          : "the memorandum's sale comps' median"
        : best.e.label.startsWith("Recorded sales")
          ? `the recorded sales' median (${best.e.publisher})`
          : "the median of your past screens' asking prices";
    impact = runImpact("purchasePrice", ctx.derived.inputs, { ...ctx.derived.inputs, purchasePrice: altPrice }, evidenceIndex, price, altPrice, price, {
      what: "the price",
      om: `${money(price)} (${money(bestOm)}${pw})`,
      alt: `${whose}, ${money(altPrice)} (${money(best.value)}${pw}), at the model's loan-to-cost (the loan re-sizes with the price)`,
      evidence: "",
      model: money(price),
    });
  }
  // A piece on the other yardstick carries the OM's own figure on it, and is
  // drawn on no track shared with the OM's figure.
  for (const c of comparables) {
    if (c.on !== best.on && omOn(c.on) != null) c.e.ownYardstick = { om: omOn(c.on)!, per: perWordOf(c.on) };
  }
  return { key: "basis", title: TITLES.basis, omSays, evidence, gap, verdict, impact, challenge: null, method: methodSentence("basis", evidence, compared), ...(judgedOn === asks ? { ruleOfThumbOnly: true } : {}) };
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
    evidence.push({
      kind: "om_internal",
      label: "Achieved premium on the doors already renovated",
      text: `${dollars(r.achievedPremium)} a month, as stated${r.renovated != null ? ` on ${r.renovated.toLocaleString("en-US")} doors` : ""}`,
      value: r.achievedPremium,
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
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
  const achieved = evidence.find((e) => e.label.startsWith("Achieved"));
  // The achieved premium decides; the rents are words beside it.
  const compared = indexesOf(evidence, (e) => e.value != null && e === achieved);
  if (r.premium == null) return unchecked("renovation_premium", omSays, evidence, NO_FIGURE("renovation premium"), compared);
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
  return { key: "renovation_premium", title: TITLES.renovation_premium, omSays, evidence, gap, verdict, impact: null, challenge: null, method: methodSentence("renovation_premium", evidence, compared), ...(why ? { unchecked: why } : {}) };
}

// ── The test ─────────────────────────────────────────────────────────────

/**
 * The two rules every built row answers to after its own reader:
 *   - a verdict struck against a rule of thumb alone says so in its gap
 *     (`ruleOfThumbOnly`), whatever the verdict;
 *   - a verdict never contradicts its own re-run: a row whose evidence moves
 *     the levered IRR down by `IRR_MOVE_STRETCH_BPS` or more never reads
 *     "holds" — inside the evidence's band or not, a move that size is to be
 *     priced, so it reads "stretched" and the gap says both — where the OM
 *     is the more optimistic side.
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
        text: `${row.gap.text} The gap is inside the evidence's band, but the return moves ${moveBps} bps on it (levered IRR ${pct1(i.baseIrrPct)} to ${pct1(i.altIrrPct)}).`,
      };
    }
  }
}

/** The shared screen's reason (`withheldReason`): it carries no model by
 *  design, which is not a model that failed to derive. */
export const SHARE_NO_MODEL = "The shared screen carries no model, so no return is re-run here.";

// On a plan deal the model runs the in-place income with the budget booked in
// year one (lib/underwrite/plan-caveat), not the business plan: said so.
const PLAN_REASON = "On a value-add, lease-up, conversion or development deal the model runs today's income with the budget in year one, not the business plan, so a re-run would measure the wrong deal; no return is re-run.";

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
  const impactsWithheld =
    derived == null
      ? (args.withheldReason?.trim() || "No model was derived for this deal, so no return is re-run.")
      : readsWithheld
        ? `No return is re-run: ${lowerFirst(readsWithheld.trim())}${/[.!?]$/.test(readsWithheld.trim()) ? "" : "."}`
        : plan
          ? PLAN_REASON
          : // A master lease's basis is withheld, but its model is the
            // position's own, run as a leasehold's is: its other rows re-run.
            withheld && withheld.word !== MASTER_LEASE_WORD
            ? `No return is re-run: ${withheld.why}.`
            : null;
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
    market: args.market,
    brokerComps: args.brokerComps ?? null,
    recordedSales: args.recordedSales ?? null,
    pastScreens: args.pastScreens ?? null,
    pastScreensWithheld: args.pastScreensWithheld ?? null,
    indexGiven: args.indexGiven ?? null,
    readOn: args.readOn,
  };
  const built: Partial<Record<StressKey, StressRow>> = {
    basis: basisRow(ctx) ?? undefined,
    exit_cap: exitCapRow(ctx) ?? undefined,
    debt: debtRow(ctx) ?? undefined,
    noi: noiRow(ctx) ?? undefined,
    vacancy: vacancyRow(ctx) ?? undefined,
    rent_growth: rentGrowthRow(ctx) ?? undefined,
    expense_growth: expenseGrowthRow(ctx) ?? undefined,
    taxes: taxesRow(ctx) ?? undefined,
    insurance: insuranceRow(ctx) ?? undefined,
    renovation_premium: renovationPremiumRow(ctx) ?? undefined,
  };
  for (const row of Object.values(built)) if (row) finishRow(row);
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
      omSays: { text: c.omFigure != null ? `${c.assumption}: ${c.omFigure}` : c.assumption, value: c.omFigure ?? null, page },
      evidence: [],
      gap: null,
      verdict: "unchecked",
      impact: null,
      challenge: challengeWords(c),
      // The challenger's `altBasis` says what it held the figure against in
      // words; its bare `altFigure` carries no unit, so it is never printed.
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
  const headline = derived && impactsWithheld == null ? stressHeadline(rows, derived.inputs, headlinePrice(derived)) : null;
  return { rows, readOn: args.readOn, publishedRead: args.modelVsMarket != null, impactsWithheld, headline };
}

// ── The headline: the OM's case against the evidence's ───────────────────

/** The rows whose figures the NOI already holds: where one of them is swapped
 *  in the evidence's case, the NOI's own swap is left out of the headline
 *  (`HEADLINE_NOI_LEFT_OUT`), and the components carry the move. */
export const HEADLINE_NOI_COMPONENTS: readonly StressKey[] = ["vacancy", "taxes", "insurance"];

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
  if (!row.impact) return "no return is re-run on it, so it has no figure to swap";
  return "its re-run moves an input the two cases cannot combine";
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
      }))
      .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
  }
  const order = (k: StressKey) => STRESS_KEYS.indexOf(k);
  return {
    omIrrPct,
    evidenceIrrPct,
    omMultiple,
    evidenceMultiple,
    omKeys: inCase.map((s) => s.row.key).sort((a, b) => order(a) - order(b)),
    parts,
    omitted: omitted.sort((a, b) => order(a.key) - order(b.key)),
    unsolved,
  };
}
