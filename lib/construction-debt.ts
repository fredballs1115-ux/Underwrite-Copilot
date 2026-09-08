/**
 * Construction / bridge debt for a plan deal — sized to what the project
 * costs, not to income it does not have yet.
 *
 * A conversion, development or lease-up borrows against total cost during
 * the works and pays that loan off at stabilization with permanent debt
 * sized on the finished project's NOI. Two constraints, then, and both are
 * reported: the construction lender's loan-to-cost cap (with the interest
 * reserve it must fund inside the loan — a circular figure, solved in closed
 * form here), and the take-out capacity at stabilization (DSCR, debt yield
 * and, when an exit cap is given, LTV on stabilized value). When the
 * construction loan is larger than what the take-out can carry, the
 * difference is a cash-in refinance the sponsor must fund — named as the
 * refinance gap rather than hidden.
 *
 * Pure — no I/O, no LLM. Every figure comes from the caller; nothing here
 * invents a budget or an NOI the OM did not state.
 */

export interface TakeOutTerms {
  /** permanent-loan rate, annual % */
  ratePct: number;
  amortYears: number;
  minDscr: number;
  minDebtYieldPct: number;
  /** optional LTV cap on stabilized value — needs exitCapPct */
  maxLtvPct?: number | null;
  /** the cap the finished product trades at, % — values the project at take-out */
  exitCapPct?: number | null;
}

export interface ConstructionDebtInputs {
  /** land / shell acquisition price — 0 when the OM states an all-in total
   *  and no price, in which case `budget` is that total */
  price: number;
  /** hard + soft works budget as the OM states it (excludes the price) */
  budget: number;
  /** the finished project's stabilized NOI */
  stabilizedNoi: number;
  /** years from close to take-out: construction plus lease-up */
  worksYears: number;
  /** construction loan all-in rate, annual % */
  ratePct: number;
  /** construction lender's loan-to-cost cap, % */
  maxLtcPct: number;
  takeOut: TakeOutTerms;
  /** average share of the loan outstanding across the works (an S-curve draw
   *  averages a little over half); default 0.55 */
  drawProfile?: number;
}

export interface TakeOutCapacity {
  dscrLoan: number | null;
  debtYieldLoan: number | null;
  ltvLoan: number | null;
  /** the smallest of the three that applied */
  loan: number;
  binding: "dscr" | "debt_yield" | "ltv";
}

export interface ConstructionDebtResult {
  /** price + budget */
  hardSoftCost: number;
  /** interest carried inside the construction loan across the works */
  interestReserve: number;
  /** price + budget + interest reserve */
  totalCost: number;
  /** the construction loan at the LTC cap, reserve included */
  constructionLoan: number;
  takeOut: TakeOutCapacity;
  /** the construction loan less the take-out capacity, when positive — the
   *  cash-in refinance the sponsor funds at stabilization; 0 otherwise */
  refinanceGap: number;
  /** the larger loan the deal can safely carry: the smaller of the two */
  maxLoan: number;
  binding: "ltc" | "take_out";
  /** total cost less the construction loan */
  equity: number;
  equityPctOfCost: number;
  /** stabilized NOI over total cost, interest reserve included, decimal */
  yieldOnCost: number;
  /** stabilized NOI ÷ exit cap, when an exit cap was given */
  stabilizedValue: number | null;
}

/** Annual debt service per dollar of loan. r = 0 degrades to principal-only. */
export function mortgageConstant(ratePct: number, amortYears: number): number {
  const r = ratePct / 100 / 12;
  const n = Math.round(amortYears * 12);
  if (!(n > 0)) return NaN;
  if (r === 0) return 12 / n;
  return (12 * r) / (1 - Math.pow(1 + r, -n));
}

export const DEFAULT_DRAW_PROFILE = 0.55;

const pos = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0;

/**
 * The take-out at stabilization: the permanent loan the finished project's
 * NOI can carry under DSCR, debt yield and (when valued) LTV. Null when the
 * NOI is not a positive number or no constraint applies.
 */
export function takeOutCapacity(stabilizedNoi: number, t: TakeOutTerms): TakeOutCapacity | null {
  if (!pos(stabilizedNoi)) return null;
  const k = mortgageConstant(t.ratePct, t.amortYears);
  const dscrLoan = pos(t.minDscr) && Number.isFinite(k) && k > 0 ? stabilizedNoi / t.minDscr / k : null;
  const debtYieldLoan = pos(t.minDebtYieldPct) ? stabilizedNoi / (t.minDebtYieldPct / 100) : null;
  const value = pos(t.exitCapPct) ? stabilizedNoi / (t.exitCapPct / 100) : null;
  const ltvLoan = value != null && pos(t.maxLtvPct) ? value * (t.maxLtvPct / 100) : null;
  const cands: { key: TakeOutCapacity["binding"]; loan: number }[] = [];
  if (dscrLoan != null) cands.push({ key: "dscr", loan: dscrLoan });
  if (debtYieldLoan != null) cands.push({ key: "debt_yield", loan: debtYieldLoan });
  if (ltvLoan != null) cands.push({ key: "ltv", loan: ltvLoan });
  if (!cands.length) return null;
  const binding = cands.reduce((a, b) => (a.loan <= b.loan ? a : b));
  return { dscrLoan, debtYieldLoan, ltvLoan, loan: binding.loan, binding: binding.key };
}

/**
 * Size the construction loan and test the take-out. Null when any input the
 * arithmetic needs is missing or non-positive, or when the LTC cap and the
 * carry would make the loan finance itself (ltc · r · t · p ≥ 1).
 */
export function sizeConstructionDebt(inp: ConstructionDebtInputs): ConstructionDebtResult | null {
  // The price may be zero (an all-in total with no price stated); the works
  // and the NOI never are.
  if (!(Number.isFinite(inp.price) && inp.price >= 0) || !pos(inp.budget) || !pos(inp.stabilizedNoi)) return null;
  if (!pos(inp.worksYears) || !pos(inp.maxLtcPct) || !(inp.ratePct >= 0) || !Number.isFinite(inp.ratePct)) return null;
  const ltc = inp.maxLtcPct / 100;
  const r = inp.ratePct / 100;
  const p = inp.drawProfile ?? DEFAULT_DRAW_PROFILE;
  if (!(p > 0) || p > 1) return null;

  const hardSoftCost = inp.price + inp.budget;
  // Loan L = ltc · (C + reserve) and reserve = L · r · t · p  ⇒  L = ltc·C / (1 − ltc·r·t·p).
  const carry = ltc * r * inp.worksYears * p;
  if (carry >= 1) return null;
  const constructionLoan = (ltc * hardSoftCost) / (1 - carry);
  const interestReserve = constructionLoan * r * inp.worksYears * p;
  const totalCost = hardSoftCost + interestReserve;

  const takeOut = takeOutCapacity(inp.stabilizedNoi, inp.takeOut);
  if (!takeOut) return null;

  const refinanceGap = Math.max(0, constructionLoan - takeOut.loan);
  const maxLoan = Math.min(constructionLoan, takeOut.loan);
  const equity = totalCost - constructionLoan;
  return {
    hardSoftCost,
    interestReserve,
    totalCost,
    constructionLoan,
    takeOut,
    refinanceGap,
    maxLoan,
    binding: constructionLoan <= takeOut.loan ? "ltc" : "take_out",
    equity,
    equityPctOfCost: equity / totalCost,
    yieldOnCost: inp.stabilizedNoi / totalCost,
    stabilizedValue: pos(inp.takeOut.exitCapPct) ? inp.stabilizedNoi / (inp.takeOut.exitCapPct / 100) : null,
  };
}

/**
 * Years to take-out from the OM's timeline as the extraction words it —
 * "24 months of construction, 12 months of lease-up" → 3; "30-month build,
 * stabilized in year 4" → 4 (the later of the two readings wins, because a
 * stated stabilization year is the whole road). Null when the text names no
 * duration — the caller supplies its own default and says so.
 */
export function worksYearsFromTimeline(text: string | null | undefined): number | null {
  if (!text) return null;
  let months = 0;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*[- ]?\s*(months?|mos?\b)/gi)) months += Number(m[1]);
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*[- ]?\s*(years?|yrs?\b)(?!\s+\d)/gi)) months += Number(m[1]) * 12;
  const stabilizedIn = text.match(/stabili[sz]\w*\s+(?:in|by)\s+year\s+(\d+)/i);
  const fromParts = months > 0 ? months / 12 : null;
  const fromYear = stabilizedIn ? Number(stabilizedIn[1]) : null;
  const years = Math.max(fromParts ?? 0, fromYear ?? 0);
  if (!(years > 0) || years > 15) return null;
  return Math.round(years * 4) / 4;
}
