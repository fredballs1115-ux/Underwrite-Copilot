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
//   - the impact swaps ONE input of the model for the best evidence's figure
//     and reports both runs; it is struck only where the model's reads stand
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
//   rent growth      RENT_GROWTH_UNSUPPORTED_PTS 2 pts (200 bps) over the
//                    trailing year's highest market figure
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

import type {
  BrokerCompsResult,
  Challenge,
  ChallengerResult,
  ExtractionResult,
  FirstSignal,
  MarketResult,
} from "@/lib/anthropic/types";
import type { ActualsRead } from "@/lib/actuals/actuals-read";
import { NOI_IN_LINE_BAND, pickOmNoi } from "@/lib/actuals/analyze";
import { withArticle } from "@/lib/article";
import { shownAssetClass } from "@/lib/asset-class";
import { assetWords } from "@/lib/asset-words";
import { compFigures, subjectBasis } from "@/lib/comp-detail";
import { findGoingInCap, findMetric, findPriceRow, occupancyRow, parsePct, screenYearOf, unitCountFromMetrics, buildingSfFromMetrics } from "@/lib/criteria";
import { BASIS_PER_SF_BAND, BASIS_PER_UNIT_BAND, buildingPriceOf, inferStrategy, isPlanDeal, noiFigures } from "@/lib/deal-strategy";
import { locatedPage } from "@/lib/facts";
import { interestOf } from "@/lib/interest";
import type { ModelCheck, ModelVsMarket, PublishedFigure } from "@/lib/model-vs-market";
import { compactUsd, parseUsd, statesRange } from "@/lib/money";
import { SIZER_LENDER_TESTS } from "@/lib/sizer-terms";
import { readTaxAbatement, taxBillOf } from "@/lib/tax-abatement";
import { sizeLoan } from "@/lib/tools/deal-math";
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";
import { basisWithheldOf, classVacancyDefault, type DerivedModel } from "@/lib/underwrite/inputs";
import { modelReadsWithheld } from "@/lib/underwrite/report-grid";
import { readValueAdd } from "@/lib/value-add";
import {
  STRESS_KEYS,
  type StressEvidence,
  type StressImpact,
  type StressKey,
  type StressRow,
  type StressTest,
  type StressVerdict,
} from "@/lib/stress-test-types";

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

/** Two percent figures within this are one figure (lib/model-vs-market's own). */
const SAME = 0.05;
/** A dollar figure within this share of another is the same figure. */
const SAME_SHARE = 0.02;

/** Recorded sales from public property records, as the page already read
 *  them (lib/public-comps): a median only where the count reaches the
 *  comps page's own floor (`MEDIAN_FLOOR`, 3), which the caller has applied
 *  by handing a median in. */
export interface RecordedSalesEvidence {
  count: number;
  medianPerSqft: number | null;
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

/** "Stabilized vacancy" → "stabilized vacancy"; an initialism ("NOI")
 *  keeps its letters. */
const lowerFirst = (s: string) => (s && !/^[A-Z]{2,}/.test(s) ? `${s[0].toLowerCase()}${s.slice(1)}` : s);

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
 * survey's margin of error, else a hair).
 */
function judge(
  om: number,
  comparables: readonly number[],
  optimistic: "low" | "high",
  unit: NonNullable<StressRow["gap"]>["unit"],
  unsupportedPast: number,
  tolerance: number,
  text: (gap: number, best: number) => string,
): Judged {
  const best = comparables[0];
  const lo = Math.min(...comparables);
  const hi = Math.max(...comparables);
  const gap = optimistic === "low" ? best - om : om - best;
  // How far past the evidence's nearer end, beyond the tolerance (a
  // survey's margin is the tolerance, so "past" is measured from its edge).
  const beyond = (optimistic === "low" ? lo - om : om - hi) - tolerance;
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
 * The engine on the model's inputs with ONE input replaced, base against
 * alternative — never two. `omValue` and `altValue` are the engine's own
 * unit for that input. Where the model already runs at the evidence's
 * figure (a rent roll's occupancy the derived model took as its vacancy)
 * the two runs are one, and the note says so.
 */
function runImpact(
  derived: DerivedModel,
  input: keyof UnderwriteInputs,
  altInputs: UnderwriteInputs,
  evidenceIndex: number,
  omValue: number,
  altValue: number,
  words: { what: string; om: string; alt: string; evidence: string },
): StressImpact {
  const base = computeUnderwrite(derived.inputs).returns;
  const alt = computeUnderwrite(altInputs).returns;
  const same = Math.abs(altValue - omValue) < 1e-9;
  const note = same
    ? `The model already runs ${words.what} at ${words.evidence}'s ${words.alt}, so its levered IRR of ${pctOrNone(base.leveredIrrPct)} carries it.`
    : `If ${words.what} is ${words.evidence}'s ${words.alt}, not the OM's ${words.om}, the levered IRR moves from ${pctOrNone(base.leveredIrrPct)} to ${pctOrNone(alt.leveredIrrPct)} (${multOrNone(base.leveredEquityMultiple)} to ${multOrNone(alt.leveredEquityMultiple)} equity multiple).`;
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
const VACANCY_ROW = /\bvacancy\b/i;
const VACANCY_NOT = /\$|\bloss\b(?!\s*%)|market vacancy|submarket|metro|physical|economic/i;
const VACANCY_PLAN = /stabili[sz]ed|pro ?forma|underwritten|year ?\d|yr\.? ?\d/i;
const TAX_BILL_ROW = /\b(?:real\s+estate|property|re)\s+tax(?:es)?\b|^tax(?:es)?\b/i;
const TAX_BILL_NOT = /abat|exempt|pilot|saving|unabated|phase|\brate\b|\bper\b|\/|psf|millage|credit|transfer|recordation|increase|growth|escalat|reassess/i;
const ASSESSED_ROW = /\bassess(?:ed|ment)\b/i;
const ASSESSED_NOT = /special|ratio|\brate\b|\bper\b|\/|millage|reassess/i;
const INSURANCE_ROW = /\binsurance\b/i;
const INSURANCE_NOT = /mortgage|title|index|deductible|reserve|\brate\b|\bper\b|\/|psf|increase|growth|claim/i;
const DEBT_RATE_ROW = /\b(?:interest|loan|note|all[- ]in|mortgage|debt|financing)\s+rate\b|\bcoupon\b|^rate$/i;
const DEBT_RATE_NOT = /assumable|seller|\bcap\b|strike|floor|exit|tax|growth|vacancy|occupancy|ground|lease|escalat|increase|supplemental|mezz/i;

function statedPct(rows: Row[], re: RegExp, not?: RegExp): { row: Row; pct: number } | null {
  const row = findMetric(rows, re, not);
  const pct = row ? parsePct(row.value) : null;
  return row && pct != null && Number.isFinite(pct) ? { row, pct } : null;
}

/** The OM's stabilized vacancy, as a vacancy row (a stabilized or pro forma
 *  one first) or as what its stated occupancy leaves. */
function omVacancy(rows: Row[]): { row: Row; pct: number; from: "vacancy" | "occupancy" } | null {
  const vacancyRows = rows.filter((m) => VACANCY_ROW.test(m.label) && !VACANCY_NOT.test(m.label) && parsePct(m.value) != null);
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
  { key: "taxes", re: /\btax(?:es)?\b|reassess|assessed|millage/i },
  { key: "insurance", re: /\binsurance\b|\bpremium\b/i },
  { key: "exit_cap", re: /\b(?:exit|terminal|reversion|residual|disposition)\b|compression/i },
  { key: "debt", re: /\b(?:debt|loan|financing|interest rate|dscr|coverage|leverage|refinanc|ltv|ltc|sofr|treasury|lender)\b/i },
  { key: "vacancy", re: /\b(?:vacancy|occupancy|lease[- ]up|absorption|occupied)\b/i },
  { key: "noi", re: /\bnoi\b|net operating income|\bt-?12\b|trailing/i },
  { key: "rent_growth", re: /\b(?:rent|rental|income|revenue)s?\s+growth|\bgrowth\b[^,;]*\brents?\b|loss[- ]to[- ]lease|mark[- ]to[- ]market|market rent|pro ?forma rent/i },
  { key: "expense_growth", re: /\b(?:expense|opex|operating expense)s?\s+(?:growth|ratio|load|escalation)|expense (?:growth|ratio)/i },
  { key: "basis", re: /\bprice\b|\bbasis\b|per unit|per door|per key|per sf|\bpsf\b|replacement cost|overpay|\bcomps?\b/i },
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

/** "The OM's stabilized vacancy against the deal's T-12, then the Census
 *  Bureau's rental vacancy for the metro area." — the sources actually
 *  attached, in their order; none, said so. */
function methodSentence(key: StressKey, evidence: StressEvidence[]): string {
  const what = `The OM's ${lowerFirst(TITLES[key])}`;
  if (evidence.length === 0) return `${what}: no evidence with a figure or words could be read for this deal, so it stands unchecked.`;
  const named = evidence.map((e) => `${lowerFirst(e.label)} (${e.publisher})`);
  const [first, ...rest] = named;
  return `${what} against ${first}${rest.length ? `, then ${joinWords(rest)}` : ""}.`;
}

function unchecked(key: StressKey, omSays: StressRow["omSays"], evidence: StressEvidence[], why: string): StressRow {
  return { key, title: TITLES[key], omSays, evidence, gap: null, verdict: "unchecked", impact: null, challenge: null, method: methodSentence(key, evidence), unchecked: why };
}

const NO_FIGURE = (what: string) => `The OM states no ${what}.`;
const NO_EVIDENCE = "No evidence with a figure could be read for this deal.";

// — Vacancy —

function vacancyRow(ctx: Ctx): StressRow | null {
  const om = omVacancy(ctx.rows);
  const evidence: StressEvidence[] = [];
  const comparables: { value: number; tolerance: number; kind: StressEvidence["kind"] }[] = [];
  const push = (e: StressEvidence, tolerance = SAME) => {
    evidence.push(e);
    if (e.value != null) comparables.push({ value: e.value, tolerance, kind: e.kind });
  };
  // The deal's own documents first: the rent roll's occupancy, the T-12's
  // vacancy loss over its scheduled rent.
  const rr = ctx.actuals?.rentRoll;
  if (rr) {
    const occ = rr.summary.sfWeightedOccupancy ?? (rr.summary.unitCount > 0 ? rr.summary.occupiedUnits / rr.summary.unitCount : null);
    if (occ != null && occ > 0.05 && occ <= 1) {
      const v = Math.round((1 - occ) * 1000) / 10;
      const asOf = rr.asOf ?? rr.summary.asOfUsed ?? null;
      push({
        kind: "document",
        label: "The deal's rent roll: the occupancy it runs at",
        text: `${pct1(v)} vacant (${rr.summary.sfWeightedOccupancy != null ? "SF-weighted" : `${rr.summary.occupiedUnits} of ${rr.summary.unitCount} units`}${asOf ? `, as of ${asOf}` : ", no stated as-of"})`,
        value: v,
        asOf,
        publisher: "the deal's rent roll",
        scope: "deal",
      });
    }
  }
  const t12 = ctx.actuals?.t12;
  if (t12 && t12.summary.vacancyLoss != null && t12.summary.collectedRent != null && t12.summary.collectedRent > 0 && t12.summary.vacancyLoss >= 0) {
    const v = Math.round((t12.summary.vacancyLoss / t12.summary.collectedRent) * 1000) / 10;
    if (v <= 100) {
      push({
        kind: "document",
        label: "The deal's T-12: vacancy loss over scheduled rent",
        text: `${pct1(v)} (${money(t12.summary.vacancyLoss)} of ${money(t12.summary.collectedRent)}${t12.periodEnd ? `, TTM to ${t12.periodEnd}` : ", period not stated"})`,
        value: v,
        asOf: t12.periodEnd,
        publisher: "the deal's T-12",
        scope: "deal",
      });
    }
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
      if (compare) push(e, moeOf(f) ?? SAME);
      else evidence.push(e);
    });
  }
  // The class's norm, a rule of thumb named as one.
  const cd = classVacancyDefault(ctx.ex?.assetClass ?? ctx.assetClass);
  if (assetWords(ctx.assetClass).operating) {
    push({
      kind: "rule_of_thumb",
      label: `${cd.classWord[0].toUpperCase()}${cd.classWord.slice(1)} vacancy, a rule of thumb`,
      text: `${pct1(cd.pct)} — the class's screening default, a rule of thumb, not this market's figure`,
      value: cd.pct,
      asOf: null,
      publisher: "a rule of thumb",
      scope: "class",
    });
  }
  if (!om && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? {
        text:
          om.from === "vacancy"
            ? `${om.row.label}: ${om.row.value}`
            : `${om.row.label}: ${om.row.value} as stated, which leaves ${pct1(om.pct)} vacancy`,
        value: om.pct,
        page: pageOf(om.row, ctx.ex),
      }
    : { text: NO_FIGURE("vacancy or occupancy"), value: null, page: null };
  if (!om) return unchecked("vacancy", omSays, evidence, NO_FIGURE("vacancy or occupancy"));
  if (comparables.length === 0) return unchecked("vacancy", omSays, evidence, NO_EVIDENCE);
  // The verdict is the best kind's: the deal's own document where one
  // states the figure, else the published figures, else the rule of thumb.
  // A rule of thumb never widens the range a document decides (a 5% class
  // default beside a T-12's 9.1% had read the OM's 6% as "inside").
  const best = comparables[0];
  const decisive = comparables.filter((c) => c.kind === best.kind);
  const judged = judge(om.pct, decisive.map((c) => c.value), "low", "pts", VACANCY_UNSUPPORTED_PTS, best.tolerance, (gap) =>
    Math.abs(gap) < SAME
      ? `The OM's ${pct1(om.pct)} is at the evidence's ${pct1(best.value)}.`
      : gap > 0
        ? `The OM's ${pct1(om.pct)} is ${pts(gap)} under the evidence's ${pct1(best.value)}.`
        : `The OM's ${pct1(om.pct)} is ${pts(gap)} over the evidence's ${pct1(best.value)} — the conservative side.`,
  );
  const evidenceIndex = evidence.findIndex((e) => e.value === best.value);
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? runImpact(
          ctx.derived,
          "vacancyPct",
          { ...ctx.derived.inputs, vacancyPct: best.value / 100 },
          evidenceIndex,
          ctx.derived.inputs.vacancyPct,
          best.value / 100,
          { what: "vacancy", om: pct1(om.pct), alt: pct1(best.value), evidence: evidence[evidenceIndex].publisher },
        )
      : null;
  return { key: "vacancy", title: TITLES.vacancy, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("vacancy", evidence) };
}

// — Rent growth —

function rentGrowthRow(ctx: Ctx): StressRow | null {
  const om = statedPct(ctx.rows, RENT_GROWTH_ROW, RENT_GROWTH_NOT);
  const evidence: StressEvidence[] = [];
  const comparables: number[] = [];
  const check = checkOf(ctx.mvm, "rent_growth");
  if (check) {
    check.published.forEach((f, i) => {
      const e = published(check, f, ctx.mvm?.grain ?? null);
      evidence.push(e);
      // An allowance is the regime's, for the units it regulates — shown
      // first and never in the market's range (the read's own rule).
      if (check.marks?.[i]?.role !== "apart") comparables.push(f.value);
    });
  }
  if (!om && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("rent growth rate"), value: null, page: null };
  if (!om) return unchecked("rent_growth", omSays, evidence, NO_FIGURE("rent growth rate"));
  if (comparables.length === 0) return unchecked("rent_growth", omSays, evidence, NO_EVIDENCE);
  // The best figure is the highest market figure — the generous side of the
  // trailing year, which the assumption is asked to beat.
  const bestValue = Math.max(...comparables);
  const ordered = [bestValue, ...comparables.filter((v) => v !== bestValue)];
  const judged = judge(om.pct, ordered, "high", "pts", RENT_GROWTH_UNSUPPORTED_PTS, SAME, (gap) =>
    Math.abs(gap) < SAME
      ? `The OM's ${pct1(om.pct)}/yr is at the trailing year's ${pct1(bestValue)}.`
      : gap > 0
        ? `The OM's ${pct1(om.pct)}/yr is ${pts(gap)} over the trailing year's highest published figure, ${pct1(bestValue)}.`
        : `The OM's ${pct1(om.pct)}/yr is ${pts(gap)} under the trailing year's ${pct1(bestValue)} — the conservative side.`,
  );
  const evidenceIndex = evidence.findIndex((e) => e.value === bestValue);
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? runImpact(
          ctx.derived,
          "rentGrowthPct",
          { ...ctx.derived.inputs, rentGrowthPct: bestValue / 100 },
          evidenceIndex,
          ctx.derived.inputs.rentGrowthPct,
          bestValue / 100,
          { what: "rent growth", om: `${pct1(om.pct)}/yr`, alt: `${pct1(bestValue)}/yr`, evidence: evidence[evidenceIndex].publisher },
        )
      : null;
  return { key: "rent_growth", title: TITLES.rent_growth, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("rent_growth", evidence) };
}

// — Expense growth —

function expenseGrowthRow(ctx: Ctx): StressRow | null {
  const om = statedPct(ctx.rows, EXPENSE_GROWTH_ROW);
  const evidence: StressEvidence[] = [];
  const comparables: number[] = [];
  const check = checkOf(ctx.mvm, "expense_growth");
  if (check) {
    check.published.forEach((f, i) => {
      const e = published(check, f, ctx.mvm?.grain ?? null);
      evidence.push(e);
      // The price indexes are the range; the insurance index and the
      // breakeven are shown apart, never averaged in (the read's own rule).
      if (check.marks?.[i]?.role !== "apart") comparables.push(f.value);
    });
  }
  if (!om && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("expense growth rate"), value: null, page: null };
  if (!om) return unchecked("expense_growth", omSays, evidence, NO_FIGURE("expense growth rate"));
  if (comparables.length === 0) return unchecked("expense_growth", omSays, evidence, NO_EVIDENCE);
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
      ? runImpact(
          ctx.derived,
          "expenseGrowthPct",
          { ...ctx.derived.inputs, expenseGrowthPct: bestValue / 100 },
          evidenceIndex,
          ctx.derived.inputs.expenseGrowthPct,
          bestValue / 100,
          { what: "expense growth", om: `${pct1(om.pct)}/yr`, alt: `${pct1(bestValue)}/yr`, evidence: evidence[evidenceIndex].publisher },
        )
      : null;
  return { key: "expense_growth", title: TITLES.expense_growth, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("expense_growth", evidence) };
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
  if (check) {
    const held = !/not held to it/.test(check.read);
    for (const f of check.published) {
      const e = published(check, f, ctx.mvm?.grain ?? null);
      if (/research tracker/i.test(f.label)) {
        evidence.push(e);
        if (held) trackerComparables.push(f.value);
      } else {
        const exit = om?.pct ?? (ctx.derived ? ctx.derived.inputs.exitCapPct * 100 : null);
        evidence.push({
          ...e,
          text: exit != null ? `${f.text} — the exit's spread over it is ${bps((exit - f.value) * 100)}` : f.text,
        });
      }
    }
  }
  if (!om && evidence.length === 0) return null;
  const omSays: StressRow["omSays"] = om
    ? { text: `${om.row.label}: ${om.row.value}${statesRange(om.row.value) ? " (a range, read at its first figure)" : ""}`, value: om.pct, page: pageOf(om.row, ctx.ex) }
    : { text: NO_FIGURE("exit cap"), value: null, page: null };
  if (!om) return unchecked("exit_cap", omSays, evidence, NO_FIGURE("exit cap"));
  if (!goingInOk && trackerComparables.length === 0) return unchecked("exit_cap", omSays, evidence, "No going-in cap and no published cap range to set the exit against.");
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
      Math.abs(diffBps) < SAME * 100
        ? `The OM's ${pct2(om.pct)} exit holds its ${pct2(g)} going-in cap.`
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
  // The engine is re-run at the going-in cap (the entry), else at the
  // published range's low end.
  const alt = goingInOk ? goingIn! : Math.min(...trackerComparables);
  const evidenceIndex = evidence.findIndex((e) => e.value === alt);
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? runImpact(
          ctx.derived,
          "exitCapPct",
          { ...ctx.derived.inputs, exitCapPct: alt / 100 },
          evidenceIndex,
          ctx.derived.inputs.exitCapPct,
          alt / 100,
          { what: "the exit cap", om: pct2(om.pct), alt: pct2(alt), evidence: goingInOk ? "the going-in cap" : evidence[evidenceIndex].publisher },
        )
      : null;
  return { key: "exit_cap", title: TITLES.exit_cap, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("exit_cap", evidence) };
}

// — Debt —

function debtRow(ctx: Ctx): StressRow | null {
  const om = statedPct(ctx.rows, DEBT_RATE_ROW, DEBT_RATE_NOT);
  const evidence: StressEvidence[] = [];
  const seed = ctx.derived?.meta.rateSeed ?? null;
  // Today's index plus the class's screening spread — the index the fact,
  // the spread the default, the note naming both with the index's date.
  if (seed) {
    evidence.push({
      kind: "published",
      label: "The index the model prices off, plus the class's screening spread",
      text: `${pct2(seed.pct)} — ${seed.note}`,
      value: seed.pct,
      asOf: seed.note.match(/\b([A-Z][a-z]{2} \d{1,2}, \d{4})\b/)?.[1] ?? null,
      publisher: "FRED, with a screening default",
      scope: "nation",
    });
  }
  const ten = ctx.market?.liveBrief?.figures?.find((f) => f.key === "dgs10") ?? null;
  if (ten) {
    evidence.push({
      kind: "published",
      label: "10-year Treasury, as the market check read it",
      text: `${pct2(ten.value)} (${ten.asOf})`,
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
    // Negative leverage: the going-in cap under the all-in rate.
    const cap = (noi / inputs!.purchasePrice) * 100;
    if (Number.isFinite(cap) && cap > 0) {
      evidence.push({
        kind: "om_internal",
        label: "Negative leverage: the going-in cap against the all-in rate",
        text:
          cap < rate - SAME
            ? `The model's year-1 NOI over its price is ${pct2(cap)}, under ${withAn(rate)} rate by ${bps((rate - cap) * 100)}: the deal loses money on every borrowed dollar until growth bails it out`
            : `The model's year-1 NOI over its price is ${pct2(cap)}, ${bps((cap - rate) * 100)} over ${withAn(rate)} rate: positive leverage at that rate`,
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
  const impact =
    ctx.derived && ctx.impactsWithheld == null
      ? runImpact(
          ctx.derived,
          "allInRatePct",
          { ...ctx.derived.inputs, allInRatePct: seed.pct / 100 },
          0,
          ctx.derived.inputs.allInRatePct,
          seed.pct / 100,
          { what: "the all-in rate", om: pct2(om.pct), alt: pct2(seed.pct), evidence: "the index plus the class's spread" },
        )
      : null;
  return { key: "debt", title: TITLES.debt, omSays, evidence, gap: judged.gap, verdict: judged.verdict, impact, challenge: null, method: methodSentence("debt", evidence) };
}

/** "a 6.78%" / "an 8.00%" — the figure decides (lib/article). */
const withAn = (rate: number) => withArticle(pct2(rate));

// — NOI —

const PRO_FORMA_RENT_ROW = /\b(?:pro ?forma|market|projected|stabili[sz]ed)\s+(?:avg\.?\s+|average\s+)?rents?\b/i;
const RENT_NOT = /growth|psf|\/\s*sf|per\s+sf|comp/i;

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
      text: `${money(t12.summary.noi)}${t12.summary.noiDerived ? " (derived: EGI less expenses)" : ""} (${t12.periodEnd ? `TTM to ${t12.periodEnd}` : "period not stated"})`,
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
      text: `$${Math.round(rr.summary.avgRentMonthly).toLocaleString("en-US")} a unit a month in place${asOf ? ` (as of ${asOf})` : ""} against the OM's ${proForma.label.toLowerCase()} of ${proForma.value}`,
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
  if (comparables.length === 0) return unchecked("noi", omSays, evidence, "No T-12 is on file, and the OM states no second NOI to hold its figure to.");
  const best = comparables[0];
  const share = (omValue - best.value!) / Math.abs(best.value!);
  const verdict: StressVerdict = Math.abs(share) <= NOI_IN_LINE_BAND || share < 0 ? "holds" : share > NOI_UNSUPPORTED_SHARE ? "unsupported" : "stretched";
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
    const rent = rentForNoi(ctx.derived.inputs, best.value!);
    if (rent != null) {
      impact = runImpact(
        ctx.derived,
        "inPlaceRentAnnual",
        { ...ctx.derived.inputs, inPlaceRentAnnual: rent },
        evidenceIndex,
        ctx.derived.inputs.inPlaceRentAnnual,
        rent,
        { what: "year-1 NOI", om: money(year1Noi(ctx.derived.inputs)), alt: money(best.value!), evidence: best.publisher },
      );
    }
  }
  return { key: "noi", title: TITLES.noi, omSays, evidence, gap, verdict, impact, challenge: null, method: methodSentence("noi", evidence) };
}

// — Taxes —

function taxesRow(ctx: Ctx): StressRow | null {
  const billRow = ctx.rows.find((m) => TAX_BILL_ROW.test(m.label) && !TAX_BILL_NOT.test(m.label) && taxBillOf(m.value) != null) ?? null;
  const bill = billRow ? taxBillOf(billRow.value) : null;
  const assessedRow = findMetric(ctx.rows, ASSESSED_ROW, ASSESSED_NOT);
  const assessed = assessedRow ? parseUsd(assessedRow.value, 10_000) : null;
  const price = buildingPriceOf(ctx.ex, ctx.derived?.inputs.purchasePrice ?? null);
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
  // A stated abatement: the full bill, read against the model's sale.
  const abatement = readTaxAbatement(ctx.ex, new Date(`${ctx.readOn}T12:00:00Z`));
  if (abatement && (abatement.unabatedTaxes != null || abatement.stepUp != null)) {
    const full = abatement.unabatedTaxes ?? (abatement.abatedTaxes != null && abatement.stepUp != null ? abatement.abatedTaxes + abatement.stepUp : null);
    evidence.push({
      kind: "om_internal",
      label: "The stated tax abatement and when it ends",
      text: abatement.headline,
      value: full != null ? Math.round(full) : null,
      asOf: abatement.end?.ends ?? null,
      publisher: "the offering memorandum",
      scope: "deal",
    });
  }
  // The T-12's own tax line.
  const t12 = ctx.actuals?.t12;
  const t12Tax = t12?.summary.opex.find((l) => /\btax/i.test(l.label) && !/abat|payroll|transfer/i.test(l.label)) ?? null;
  if (t12Tax && t12Tax.amount > 0) {
    evidence.push({
      kind: "document",
      label: "The deal's T-12 tax line",
      text: `${money(t12Tax.amount)} (${t12Tax.label}${t12?.periodEnd ? `, TTM to ${t12.periodEnd}` : ""})`,
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
  const comparables = evidence.filter((e) => e.value != null && e.kind === "om_internal");
  if (comparables.length === 0) {
    return unchecked(
      "taxes",
      omSays,
      evidence,
      assessed == null ? "The OM states no assessed value to work the reset bill from; the rate is the assessor's to give." : NO_EVIDENCE,
    );
  }
  const best = comparables[0];
  const share = (best.value! - bill) / Math.abs(best.value!);
  const verdict: StressVerdict = share <= SAME_SHARE ? "holds" : share > TAX_UNSUPPORTED_SHARE ? "unsupported" : "stretched";
  const gap: StressRow["gap"] = {
    value: Math.round(best.value! - bill),
    unit: "usd",
    text:
      Math.abs(share) <= SAME_SHARE
        ? `The OM's ${money(bill)} is at the ${money(best.value!)} its own figures imply.`
        : share > 0
          ? `The OM's ${money(bill)} is ${money(best.value! - bill)} (${pct1(share * 100)}) under the ${money(best.value!)} its own figures imply.`
          : `The OM's ${money(bill)} is over the ${money(best.value!)} its own figures imply — the conservative side.`,
  };
  const evidenceIndex = evidence.indexOf(best);
  const impact = ctx.derived && ctx.impactsWithheld == null ? expenseImpact(ctx.derived, best.value! - bill, evidenceIndex, "the tax line", money(bill), money(best.value!), best.publisher) : null;
  return { key: "taxes", title: TITLES.taxes, omSays, evidence, gap, verdict, impact, challenge: null, method: methodSentence("taxes", evidence) };
}

/** The model's one expense line moved by `delta`: the one input swapped is
 *  `expenseLines`, its first line's annual figure grown by the gap. */
function expenseImpact(derived: DerivedModel, delta: number, evidenceIndex: number, what: string, om: string, alt: string, evidence: string): StressImpact | null {
  const lines = derived.inputs.expenseLines;
  if (lines.length === 0) return null;
  const altLines = lines.map((l, i) => (i === 0 ? { ...l, annual: l.annual + delta } : l));
  const base = lines.reduce((s, l) => s + l.annual, 0);
  return runImpact(derived, "expenseLines", { ...derived.inputs, expenseLines: altLines }, evidenceIndex, base, base + delta, { what, om, alt, evidence });
}

// — Insurance —

function insuranceRow(ctx: Ctx): StressRow | null {
  const premiumRow = ctx.rows.find((m) => INSURANCE_ROW.test(m.label) && !INSURANCE_NOT.test(m.label) && !statesRange(m.value) && parseUsd(m.value, 500) != null) ?? null;
  const premium = premiumRow ? parseUsd(premiumRow.value, 500) : null;
  const evidence: StressEvidence[] = [];
  // The T-12's own insurance line.
  const t12 = ctx.actuals?.t12;
  const t12Ins = t12?.summary.opex.find((l) => /insurance/i.test(l.label) && !/mortgage|title/i.test(l.label)) ?? null;
  if (t12Ins && t12Ins.amount > 0) {
    evidence.push({
      kind: "document",
      label: "The deal's T-12 insurance line",
      text: `${money(t12Ins.amount)} (${t12Ins.label}${t12?.periodEnd ? `, TTM to ${t12.periodEnd}` : ""})`,
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
  const index = idx ? { pct: idx.value, text: idx.text, asOf: idx.asOf, publisher: idx.publisher } : stored ? { pct: stored.value, text: `${stored.value > 0 ? "+" : ""}${stored.value.toFixed(1)}% over the year to ${stored.asOf}`, asOf: stored.asOf, publisher: "BLS via FRED" } : null;
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
        ? `The OM's ${money(premium)} is at ${best.publisher}'s ${money(best.value!)}.`
        : share > 0
          ? `The OM's ${money(premium)} is ${money(best.value! - premium)} (${pct1(share * 100)}) under ${best.publisher}'s ${money(best.value!)}.`
          : `The OM's ${money(premium)} is over ${best.publisher}'s ${money(best.value!)} — the conservative side.`,
  };
  const evidenceIndex = evidence.indexOf(best);
  const impact = ctx.derived && ctx.impactsWithheld == null ? expenseImpact(ctx.derived, best.value! - premium, evidenceIndex, "the insurance line", money(premium), money(best.value!), best.publisher) : null;
  return { key: "insurance", title: TITLES.insurance, omSays, evidence, gap, verdict, impact, challenge: null, method: methodSentence("insurance", evidence) };
}

// — Basis —

function basisRow(ctx: Ctx): StressRow | null {
  const screenYear = screenYearOf(ctx.ex);
  const interest = interestOf(ctx.ex);
  const basis = subjectBasis(ctx.rows, ctx.kind, screenYear, interest, ctx.ex?.assetClass ?? null);
  const words = assetWords(ctx.assetClass);
  const per: "unit" | "sf" = words.basis === "sf" || basis.perUnit == null ? "sf" : "unit";
  const om = per === "unit" ? basis.perUnit : basis.perSf;
  const noun = words.noun?.one ?? "unit";
  const perWord = per === "unit" ? `/${noun}` : "/SF";
  const priceRow = findPriceRow(ctx.rows, ctx.kind, screenYear) as Row | null;
  const evidence: StressEvidence[] = [];
  const pick = (c: { perUnit: number | null; perSf: number | null }) => (per === "unit" ? c.perUnit : c.perSf);
  // The memorandum's own sale comps, each graded by the comps step.
  const comps = (ctx.brokerComps?.saleComps ?? []).map((c) => ({ comp: c, figure: pick(compFigures(c.detail)) })).filter((c) => c.figure != null);
  if (comps.length > 0) {
    const values = comps.map((c) => c.figure!);
    const med = median(values);
    evidence.push({
      kind: "om_internal",
      label: "The memorandum's sale comps",
      text: `${comps.length} of ${ctx.brokerComps!.saleComps.length} state a figure ${perWord}: ${comps.map((c) => `${c.comp.name} ${money(c.figure!)}${perWord} (${c.comp.support})`).join("; ")} — median ${money(med)}${perWord}`,
      value: Math.round(med),
      asOf: null,
      publisher: "the offering memorandum",
      scope: "deal",
    });
  }
  // Recorded sales from public records, a median only from three sales up
  // — the comps page's own floor, applied by the caller.
  const rs = ctx.recordedSales;
  if (rs && rs.count > 0) {
    const v = per === "unit" ? rs.medianPerUnit : rs.medianPerSqft;
    evidence.push({
      kind: "published",
      label: `Recorded sales (${rs.providerName})`,
      text: v != null ? `median ${money(v)}${perWord} over ${rs.count} recorded sales` : `${rs.count} recorded ${rs.count === 1 ? "sale" : "sales"}, too few for a median ${perWord}`,
      value: v != null ? Math.round(v) : null,
      asOf: rs.retrievedAt,
      publisher: rs.providerName,
      scope: "metro",
      href: rs.href ?? null,
    });
  }
  // The reader's own past screens, each at its ask.
  const ps = ctx.pastScreens;
  if (ps && ps.count > 0) {
    const v = per === "unit" ? ps.perUnitMedian : ps.perSfMedian;
    evidence.push({
      kind: "document",
      label: `Your past screens in ${ps.market}, at the ask`,
      text: v != null ? `median ${money(v)}${perWord} over ${ps.count} screens, each at its memorandum's asking price` : `${ps.count} screens, none with a basis ${perWord}`,
      value: v != null ? Math.round(v) : null,
      asOf: null,
      publisher: "your pipeline",
      scope: "metro",
    });
  }
  // The band the class trades in, a rule of thumb named as one.
  const band = per === "unit" ? BASIS_PER_UNIT_BAND : BASIS_PER_SF_BAND;
  if (words.operating) {
    evidence.push({
      kind: "rule_of_thumb",
      label: `Prices the class trades in ${perWord}, a rule of thumb`,
      text: `${money(band.min)}–${money(band.max)}${perWord}: the band any market delivers in, a rule of thumb, never a comp`,
      value: null,
      asOf: null,
      publisher: "a rule of thumb",
      scope: "class",
    });
  }
  if (om == null && evidence.length === 0) return null;
  const withheld = basisWithheldOf(ctx.ex);
  const omSays: StressRow["omSays"] =
    om != null
      ? { text: `${money(om)}${perWord}${priceRow ? ` (${priceRow.label} ${priceRow.value}${per === "unit" ? ` over ${unitCountFromMetrics(ctx.rows)?.toLocaleString("en-US") ?? "?"} ${words.noun?.many ?? "units"}` : ` over ${buildingSfFromMetrics(ctx.rows)?.toLocaleString("en-US") ?? "?"} SF`})` : ""}`, value: om, page: pageOf(priceRow, ctx.ex) }
      : { text: withheld ? `No basis is struck: ${withheld.why}.` : ctx.kind === "conversion" || ctx.kind === "development" ? "No price basis on a plan deal: the basis is the all-in cost." : NO_FIGURE(`price ${perWord}`), value: null, page: pageOf(priceRow, ctx.ex) };
  if (om == null) return unchecked("basis", omSays, evidence, omSays.text);
  const comparables = evidence.filter((e) => e.value != null);
  if (comparables.length === 0) return unchecked("basis", omSays, evidence, "No comp with a figure could be read for this deal.");
  const best = comparables[0];
  const judged = judge(om, comparables.map((e) => e.value!), "high", "pct", BASIS_UNSUPPORTED_PCT, 0, (gap) =>
    Math.abs(gap) / best.value! < 0.005
      ? `The ask's ${money(om)}${perWord} is at ${lowerFirst(best.label)}' ${money(best.value!)}${perWord}.`
      : gap > 0
        ? `The ask's ${money(om)}${perWord} is ${pct1((gap / best.value!) * 100)} over ${lowerFirst(best.label)}' ${money(best.value!)}${perWord}.`
        : `The ask's ${money(om)}${perWord} is ${pct1((-gap / best.value!) * 100)} under ${lowerFirst(best.label)}' ${money(best.value!)}${perWord} — the conservative side.`,
  );
  // The verdict is read in percent of the best figure, so the gap's unit is
  // a share, not a dollar: struck again here on the best figure.
  const sharePct = ((om - best.value!) / best.value!) * 100;
  const hiPct = Math.max(...comparables.map((e) => ((om - e.value!) / e.value!) * 100));
  const loPct = Math.min(...comparables.map((e) => ((om - e.value!) / e.value!) * 100));
  const past = loPct;
  const verdict: StressVerdict = past <= BASIS_STRETCH_PCT ? "holds" : past > BASIS_UNSUPPORTED_PCT ? "unsupported" : "stretched";
  void hiPct;
  const gap = { value: Math.round(sharePct * 10) / 10, unit: "pct" as const, text: judged.gap.text };
  const evidenceIndex = evidence.indexOf(best);
  // The price is a direct input: re-run at the evidence's basis — only
  // where the model's price is the building's own as stated (not a share
  // grossed up, not a placeholder).
  let impact: StressImpact | null = null;
  if (ctx.derived && ctx.impactsWithheld == null && interest.sharePct == null) {
    const price = ctx.derived.inputs.purchasePrice;
    const altPrice = (price * best.value!) / om;
    impact = runImpact(ctx.derived, "purchasePrice", { ...ctx.derived.inputs, purchasePrice: altPrice }, evidenceIndex, price, altPrice, {
      what: "the price",
      om: `${money(price)} (${money(om)}${perWord})`,
      alt: `${money(altPrice)} (${money(best.value!)}${perWord})`,
      evidence: best.publisher,
    });
  }
  return { key: "basis", title: TITLES.basis, omSays, evidence, gap, verdict, impact, challenge: null, method: methodSentence("basis", evidence) };
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
  if (r.costPerDoor != null && ctx.derived) {
    const cap = ctx.derived.inputs.exitCapPct;
    const breakEven = (r.costPerDoor * cap) / 12;
    evidence.push({
      kind: "rule_of_thumb",
      label: "Break-even premium at the model's exit cap",
      text: `${dollars(breakEven)} a month pays for ${withArticle(`${money(r.costPerDoor)} door`)} at the model's ${pct2(cap * 100)} exit cap`,
      value: Math.round(breakEven),
      asOf: null,
      publisher: "the model's own arithmetic",
      scope: "deal",
    });
  }
  const omSays: StressRow["omSays"] =
    r.premium != null
      ? { text: `${dollars(r.premium)} a month a renovated door${r.premiumFrom === "rents" ? " (the renovated rent less the classic rent)" : ", as stated"}`, value: r.premium, page: locatedPage(r.page, ctx.ex?.totalPages) }
      : { text: NO_FIGURE("renovation premium"), value: null, page: locatedPage(r.page, ctx.ex?.totalPages) };
  if (r.premium == null) return unchecked("renovation_premium", omSays, evidence, NO_FIGURE("renovation premium"));
  const achieved = evidence.find((e) => e.label.startsWith("Achieved"));
  const breakEven = evidence.find((e) => e.label.startsWith("Break-even"));
  let gap: StressRow["gap"] = null;
  let verdict: StressVerdict = "unchecked";
  let why: string | null = null;
  if (achieved && achieved.value != null) {
    const share = (r.premium - achieved.value) / achieved.value;
    verdict = share <= SAME_SHARE ? "holds" : share > PREMIUM_UNSUPPORTED_SHARE ? "unsupported" : "stretched";
    gap = {
      value: Math.round(r.premium - achieved.value),
      unit: "usd",
      text:
        Math.abs(share) <= SAME_SHARE
          ? `The projected ${dollars(r.premium)} is at the achieved ${dollars(achieved.value)}.`
          : share > 0
            ? `The projected ${dollars(r.premium)} is ${dollars(r.premium - achieved.value)} a month (${pct1(share * 100)}) over the achieved ${dollars(achieved.value)}.`
            : `The projected ${dollars(r.premium)} is under the achieved ${dollars(achieved.value)} — the conservative side.`,
    };
  } else if (breakEven && breakEven.value != null) {
    verdict = r.premium >= breakEven.value ? "holds" : "stretched";
    gap = {
      value: Math.round(r.premium - breakEven.value),
      unit: "usd",
      text:
        r.premium >= breakEven.value
          ? `The projected ${dollars(r.premium)} clears the ${dollars(breakEven.value)} break-even; no door has proven it.`
          : `The projected ${dollars(r.premium)} is under the ${dollars(breakEven.value)} a door's cost needs at the exit cap.`,
    };
  } else {
    why = "No achieved premium is stated and no cost a door to strike a break-even on.";
  }
  // The premium is no model input: the model grows today's rent at one rate.
  return { key: "renovation_premium", title: TITLES.renovation_premium, omSays, evidence, gap, verdict, impact: null, challenge: null, method: methodSentence("renovation_premium", evidence), ...(why ? { unchecked: why } : {}) };
}

// ── The test ─────────────────────────────────────────────────────────────

const PLAN_REASON = "A plan deal is judged on its yield on total cost: the model's levered return runs the finished project's figures over the price, so no return is re-run on it.";

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
  const impactsWithheld =
    derived == null
      ? "No model was derived for this deal, so no return is re-run."
      : (modelReadsWithheld(derived.inputs, derived.sources, plan) ??
        (plan ? PLAN_REASON : withheld ? `No return is re-run: ${withheld.why}.` : null));
  const ctx: Ctx = {
    ex,
    rows: rowsOf(ex),
    kind: strategy.kind,
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
      method: `The challenger's own critique${c.altFigure != null && basis ? `, holding the figure against ${c.altFigure} (${basis})` : basis ? `, against ${basis}` : ""}; no reader tests it and no figure is swapped.`,
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
  return { rows, readOn: args.readOn, impactsWithheld };
}
