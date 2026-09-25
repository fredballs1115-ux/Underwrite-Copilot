// A leasehold's exit, valued on the term left at the sale (#421).
//
// The screening model sells every building the same way: the year after the
// hold's NOI over the exit cap — a perpetuity. A leasehold is not one. At the
// lease's end the building reverts to the landowner, so what a buyer at the
// model's sale is buying is the NOI of the years the lease has left THEN, and
// nothing after them. /tools' ground lease card (lib/tools/ground-lease)
// makes that argument with inputs typed in; this makes it with the deal's
// own model and the term the memorandum states (lib/ground-lease-term).
//
// Pure: the model's inputs come in, nothing is read.
//
// Four rules.
//
// THE SAME BUYER, THE SAME RETURN. The term is valued at the model's own
// exit return: its exit cap plus the rate its NOI grows in the year after
// the sale. That is the return a buyer earns who pays the exit cap for a
// building that never reverts (a growing perpetuity priced at c returns
// c + g), so valuing the term at it asks what that buyer pays for the years
// that are actually left. At that rate the term is worth the capitalised
// figure times 1 − ((1 + g) / (1 + c + g))^n, n the years left at the sale —
// the share a test pins against a year-by-year sum. It is the term's
// arithmetic alone: a leasehold buyer asks a premium on top for the lease's
// resets, subordination and coverage, which no rule of thumb prices, so the
// answer is the generous side of the truth and says so.
//
// THE MODEL RUNS AT THAT EXIT. The term's value is the model's exit cap read
// on the term (c / share); the engine is run again at it, so the returns on
// the term are the model's own arithmetic — debt, costs and all — and not a
// second model's.
//
// A LEASE THAT ENDS INSIDE THE HOLD HAS NO SALE. The building reverts before
// the model sells it: the income after that and the sale proceeds are the
// landowner's, and the read says so rather than pricing a sale that cannot
// happen.
//
// OPTIONS ARE A CEILING. An extension option adds years only if exercised,
// and its rent usually resets to market when it is, so the term with every
// option is read beside the term, never instead of it.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { interestOf } from "@/lib/interest";
import { groundLeaseTermLine, readGroundLeaseTerm, termEndLabel, yearsText, type GroundLeaseTerm } from "@/lib/ground-lease-term";
import { TERM_MARGIN_YEARS } from "@/lib/tools/ground-lease";
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";

/** A buyer's permanent loan at the sale: ten years is the usual term. */
export const SALE_LOAN_YEARS = 10;

export interface TermExit {
  /** years left on the lease at the model's sale */
  yearsAtSale: number;
  /** the term's value at the sale, at the model's exit return */
  onTerm: number;
  /** that over the capitalised exit, percent */
  sharePct: number;
  /** the model's exit cap read on the term: the cap that prices a
   *  perpetuity at the term's value, percent */
  termCapPct: number;
  /** the model's levered IRR, run again at that exit, percent (null where
   *  the sale would not repay the loan and no rate solves) */
  leveredIrrPct: number | null;
  unleveredIrrPct: number | null;
}

export interface LeaseholdExitRead {
  term: GroundLeaseTerm;
  holdYears: number;
  /** the lease ends inside the hold, or has ended */
  endsInHold: boolean;
  /** the year of the hold it ends in — 0 where it already has */
  endsInYear: number | null;
  /** the model's exit as it runs: the year-after-the-hold NOI … */
  exitNoi: number;
  /** … over its exit cap, percent … */
  exitCapPct: number;
  /** … = the capitalised exit */
  capitalised: number;
  /** the rate the model's NOI grows in the year after the sale, percent */
  growthPct: number;
  /** exit cap + growth: the return the capitalised exit implies, percent */
  returnPct: number;
  /** the model's own returns, as it runs, percent */
  leveredIrrPct: number | null;
  unleveredIrrPct: number | null;
  /** the exit on the current term; null where it ends inside the hold */
  onTerm: TermExit | null;
  /** the exit were every extension option exercised — the ceiling */
  withOptions: TermExit | null;
  /** the lease as stated says the landowner has subordinated (true), has
   *  not (false), or does not say (null) */
  subordinated: boolean | null;
}

const pctOf = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : x * 100);

/** Whether the landowner has subordinated, as the lease states it. */
export function subordinationOf(groundLease: string): boolean | null {
  if (/\bunsubordinated\b|\bnon[- ]subordinated\b|\bnot\s+(?:been\s+)?subordinated\b|\bno\s+subordination\b/i.test(groundLease)) return false;
  if (/\bsubordinated\b/i.test(groundLease)) return true;
  return null;
}

/** The share of a growing perpetuity's value that `years` of it are worth,
 *  at the return the perpetuity implies (cap + growth). */
export function termShare(capPct: number, growthPct: number, years: number): number {
  const g = growthPct / 100;
  const r = capPct / 100 + g;
  if (!(years > 0)) return 0;
  return 1 - Math.pow((1 + g) / (1 + r), years);
}

/**
 * The model's exit against the term left at its sale. Null unless the
 * memorandum sells a leasehold, states when its ground lease ends, and the
 * model can run.
 */
export function readLeaseholdExit(
  ex: ExtractionResult | null | undefined,
  inputs: UnderwriteInputs | null,
  asOf: Date = new Date(),
): LeaseholdExitRead | null {
  if (!ex || interestOf(ex).kind !== "leasehold") return null;
  const term = readGroundLeaseTerm(ex, asOf);
  if (!term || !inputs || !(inputs.purchasePrice > 0) || !(inputs.exitCapPct > 0)) return null;

  const run = computeUnderwrite(inputs);
  const holdYears = run.holdYears;
  const exitNoi = run.residual.residualNoi;
  const lastNoi = run.cashFlow[holdYears - 1]?.noi ?? 0;
  const exitCapPct = inputs.exitCapPct * 100;
  // The growth in the year after the sale, off the model's own two NOIs;
  // floored so the implied return stays over half the cap however the
  // model's lines move.
  const rawGrowth = lastNoi > 0 && exitNoi > 0 ? (exitNoi / lastNoi - 1) * 100 : inputs.rentGrowthPct * 100;
  const growthPct = Math.max(rawGrowth, -exitCapPct / 2);
  const capitalised = run.residual.grossSaleProceeds;
  const endsInHold = term.yearsLeft <= holdYears;

  const exitOn = (years: number): TermExit | null => {
    if (!(years > 0) || !(capitalised > 0)) return null;
    const share = termShare(exitCapPct, growthPct, years);
    if (!(share > 0)) return null;
    const termCap = inputs.exitCapPct / share;
    const again = computeUnderwrite({ ...inputs, exitCapPct: termCap });
    return {
      yearsAtSale: years,
      onTerm: capitalised * share,
      sharePct: share * 100,
      termCapPct: termCap * 100,
      leveredIrrPct: pctOf(again.returns.leveredIrrPct),
      unleveredIrrPct: pctOf(again.returns.unleveredIrrPct),
    };
  };

  const yearsAtSale = term.yearsLeft - holdYears;
  const optionYears = term.options?.years ?? 0;
  const groundLease = ex.interest?.groundLease ?? "";
  return {
    term,
    holdYears,
    endsInHold,
    endsInYear: endsInHold ? Math.max(0, Math.ceil(term.yearsLeft)) : null,
    exitNoi,
    exitCapPct,
    capitalised,
    growthPct,
    returnPct: exitCapPct + growthPct,
    leveredIrrPct: pctOf(run.returns.leveredIrrPct),
    unleveredIrrPct: pctOf(run.returns.unleveredIrrPct),
    onTerm: endsInHold ? null : exitOn(yearsAtSale),
    withOptions: optionYears > 0 && term.yearsLeft > 0 ? exitOn(yearsAtSale + optionYears) : null,
    subordinated: subordinationOf(groundLease),
  };
}

// ── Saying it ───────────────────────────────────────────────────────────

// Rounded on the tenths, never a float's toFixed.
export const exitMoney = (n: number) =>
  Math.abs(n) >= 1e8
    ? `$${Math.round(n / 1e6)}M`
    : Math.abs(n) >= 1e6
      ? `$${(Math.round(n / 1e5) / 10).toFixed(1)}M`
      : Math.abs(n) >= 1e3
        ? `$${Math.round(n / 1e3)}k`
        : `$${Math.round(n)}`;
const pct2 = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;
// A return can be negative, and a minus is a minus sign.
const pct1 = (n: number) => {
  const v = Math.round(n * 10) / 10;
  return `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
};
/** A share said whole, or as "within 1%" near the top. */
const shareText = (n: number) => `${Math.round(n)}%`;

/**
 * The card's one sentence: the lease ending inside the hold, or the exit on
 * the term against the exit as the model runs it.
 */
export function leaseholdExitSentence(r: LeaseholdExitRead): string {
  const hold = `${r.holdYears}-year hold`;
  const end = termEndLabel(r.term);
  if (r.term.yearsLeft <= 0) {
    return `The ground lease's stated end, ${end}, has passed, so there is no term to value — check the lease and any extension already exercised before reading anything the model says.`;
  }
  if (r.endsInHold) {
    return `The ground lease ends ${r.term.from === "year" ? "in " : ""}${end}, in year ${r.endsInYear} of the model's ${hold}: the building reverts to the landowner before the model sells it, so the income after that and the sale proceeds are not this buyer's to collect.`;
  }
  const t = r.onTerm;
  if (!t) return "The model's exit could not be valued on the term.";
  if (t.sharePct >= 99.5) {
    return `With ${yearsText(t.yearsAtSale)} left at the model's sale in year ${r.holdYears}, the term bears the capitalised exit within 1% — the model's exit holds as it runs.`;
  }
  const irr =
    t.leveredIrrPct != null && r.leveredIrrPct != null
      ? ` At that exit the model's levered IRR is ${pct1(t.leveredIrrPct)}, against ${pct1(r.leveredIrrPct)} as it runs.`
      : t.leveredIrrPct == null && r.leveredIrrPct != null
        ? " At that exit the sale does not repay the model's loan, so no levered return solves."
        : "";
  return `With ${yearsText(t.yearsAtSale)} left at the model's sale in year ${r.holdYears}, the term bears ${shareText(t.sharePct)} of the capitalised exit — ${exitMoney(
    t.onTerm,
  )} against ${exitMoney(r.capitalised)} — which is the model's ${pct2(r.exitCapPct)} exit cap read as ${pct2(t.termCapPct)} on a building that reverts.${irr}`;
}

/** The options, beside the term: the ceiling. */
export function leaseholdOptionsLine(r: LeaseholdExitRead): string | null {
  const o = r.withOptions;
  const opts = r.term.options;
  // Nothing to add where the term alone already bears the capitalised exit.
  if (!o || !opts || (r.onTerm && r.onTerm.sharePct >= 99.5)) return null;
  const bears = o.sharePct >= 99.5 ? "the capitalised exit within 1%" : `${shareText(o.sharePct)} of the capitalised exit (${exitMoney(o.onTerm)})`;
  return `Were every extension option exercised (${opts.how}, as stated), ${yearsText(o.yearsAtSale)} would be left at the sale and the term would bear ${bears}. An option adds years only if the leaseholder exercises it, and its rent usually resets to market when it does, so that is the ceiling.`;
}

/**
 * Financing at the sale: on an unsubordinated lease a lender wants the term
 * to outlast its loan by a margin (lib/tools/ground-lease's
 * `TERM_MARGIN_YEARS`), so a buyer's ten-year loan at the sale needs twenty
 * years left. A buyer who cannot finance pays less than any term arithmetic
 * says, and this is what says so.
 */
export function leaseholdLenderLine(r: LeaseholdExitRead): string | null {
  if (r.endsInHold || !r.onTerm) return null;
  if (r.subordinated === true) {
    return "The lease as stated is subordinated: the landowner has agreed to stand behind the mortgage, so a lender can take the building without the lease ending under it.";
  }
  const needed = SALE_LOAN_YEARS + TERM_MARGIN_YEARS;
  const left = r.onTerm.yearsAtSale;
  const who = r.subordinated === false ? "The lease as stated is unsubordinated, and" : "Unless the landowner subordinates,";
  return left >= needed
    ? `${who} a buyer's ${SALE_LOAN_YEARS}-year loan at the sale needs ${needed} years of lease left — the loan's term and the ${TERM_MARGIN_YEARS}-year margin lenders want. It will have ${yearsText(left)}.`
    : `${who} a buyer's ${SALE_LOAN_YEARS}-year loan at the sale needs ${needed} years of lease left — the loan's term and the ${TERM_MARGIN_YEARS}-year margin lenders want — and it will have ${yearsText(
        left,
      )}: the buyer the model sells to may not be able to finance it at all, which costs more than the term's arithmetic says.`;
}

/** What the term was valued at, for the small print. */
export function leaseholdBasisLine(r: LeaseholdExitRead): string | null {
  if (r.endsInHold || !r.onTerm) return null;
  return `The years left are valued at the model's own exit return: its ${pct2(r.exitCapPct)} exit cap plus the ${pct1(
    r.growthPct,
  )} its NOI grows in the year after the sale, ${pct2(r.returnPct)} — what a buyer paying that cap for a building that never reverts would earn. It is the term's arithmetic alone: a leasehold buyer asks a premium on top for the lease's resets, subordination and coverage, so the truth is at or under it.`;
}

// ── What the card draws ─────────────────────────────────────────────────

/**
 * The card's figures as plain data: the deal view is a client component,
 * and handing it this rather than the read keeps the engine out of the
 * browser bundle (metroDemand's rule).
 */
export interface LeaseholdExitView {
  termLine: string;
  page: string;
  endLabel: string;
  holdYears: number;
  /** years left today, and at the sale */
  yearsLeft: number;
  yearsAtSale: number | null;
  /** the extension options' years in all, where they parse */
  optionYears: number | null;
  endsInHold: boolean;
  capitalised: number;
  onTerm: number | null;
  sharePct: number | null;
  exitCapPct: number;
  termCapPct: number | null;
  leveredIrrPct: number | null;
  leveredIrrOnTermPct: number | null;
  sentence: string;
  optionsLine: string | null;
  lenderLine: string | null;
  basisLine: string | null;
}

export function leaseholdExitView(r: LeaseholdExitRead): LeaseholdExitView {
  return {
    termLine: groundLeaseTermLine(r.term),
    page: r.term.page,
    endLabel: termEndLabel(r.term),
    holdYears: r.holdYears,
    yearsLeft: r.term.yearsLeft,
    yearsAtSale: r.onTerm?.yearsAtSale ?? null,
    optionYears: r.term.options?.years ?? null,
    endsInHold: r.endsInHold,
    capitalised: r.capitalised,
    onTerm: r.onTerm?.onTerm ?? null,
    sharePct: r.onTerm?.sharePct ?? null,
    exitCapPct: r.exitCapPct,
    termCapPct: r.onTerm?.termCapPct ?? null,
    leveredIrrPct: r.leveredIrrPct,
    leveredIrrOnTermPct: r.onTerm?.leveredIrrPct ?? null,
    sentence: leaseholdExitSentence(r),
    optionsLine: leaseholdOptionsLine(r),
    lenderLine: leaseholdLenderLine(r),
    basisLine: leaseholdBasisLine(r),
  };
}
