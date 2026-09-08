/**
 * The deterministic heart of the model: given reconciled numeric inputs, build
 * a multi-year operating cash flow and compute returns. Doing the math in code
 * (rather than asking Claude to compute IRR) keeps it correct and auditable —
 * every figure here is reproducible from the inputs.
 *
 * Simplifications (surfaced as caveats in the model): straight-line growth,
 * annual (not monthly) flows, a single tranche of debt, a flat capital reserve
 * grown with expenses, and sale at a forward-NOI / exit-cap value net of
 * selling costs. Acquisition costs and loan fees ARE capitalized into equity.
 * A first-draft to verify, not a final model.
 *
 * THE PLAN. A deal that is not a stabilized asset — a conversion, a
 * development, a lease-up, a value-add with real downtime — does not earn its
 * stabilized income on day one. The optional plan inputs describe the road
 * there: a capital budget spent over the years of works, the income the
 * building keeps (or doesn't) during the works, the operating costs it still
 * carries, and a lease-up that ramps occupancy to the stabilized level. The
 * stabilized figures (`year1Gpr`, `year1Opex`, …) then describe the FINISHED
 * building in today's dollars and the model climbs to them. With no plan
 * inputs, the model is exactly what it always was.
 *
 * The reason this exists: a conversion came through with the finished
 * building's $21M stabilized NOI as "Year 1" against a $20M price — a 105%
 * cap rate. The honest picture is two dark years, a $160M spend, and a yield
 * on total cost in year four. That is what this now computes.
 */

export interface LoanTerms {
  ltvPct: number;
  ratePct: number;
  amortYears: number;
  ioYears: number;
}

/** What kind of deal this is — mirrors lib/deal-strategy's StrategyKind
 *  (kept local so the math layer has no import beyond itself). */
export type ModelStrategy =
  | "stabilized"
  | "value_add"
  | "lease_up"
  | "conversion"
  | "development"
  | "unknown";

export interface ModelInputs {
  units: number;
  purchasePrice: number;
  /** due diligence + closing costs, % of price (0-100 scale). Optional for
   *  models stored before this existed. */
  closingCostPct?: number;
  /** financing / origination fees, % of the loan (0-100 scale). Optional. */
  loanFeePct?: number;
  /** annual gross potential rent — of the STABILIZED building when the deal
   *  carries a plan (see below), in year-1 dollars */
  year1Gpr: number;
  vacancyPct: number;
  otherIncomeAnnual: number;
  year1Opex: number; // annual operating expenses (total), stabilized
  capexReserveAnnual: number; // annual capital reserve, deducted below NOI
  rentGrowthPct: number;
  expenseGrowthPct: number;
  otherIncomeGrowthPct: number;
  exitCapPct: number;
  sellingCostPct: number;
  holdYears: number;
  loan: LoanTerms;

  // ── The plan. All optional; absent or null = an operating asset, and the
  //    model runs exactly as it did before these existed. ─────────────────
  /** what kind of deal this is (informational — the numbers below decide) */
  strategy?: ModelStrategy;
  /** total renovation / construction budget, $; spent evenly over the years
   *  of works (all in year 1 when there are no works years) */
  capitalBudget?: number | null;
  /** whole years of works before lease-up can start */
  constructionYears?: number | null;
  /** whole years to climb from the starting occupancy to stabilized */
  leaseUpYears?: number | null;
  /** annual GPR the building keeps earning during the works (0 = dark) */
  inPlaceGprDuringWorks?: number | null;
  /** annual operating costs carried during the works — taxes, insurance,
   *  security, utilities. Null = not stated → modelled at a documented share
   *  of stabilized opex (see WORKS_OPEX_SHARE) */
  worksOpexAnnual?: number | null;
  /** occupancy when lease-up begins, 0–100. Null = 0 after works (a dark
   *  building), else stabilized (no lease-up at all) */
  leaseUpStartOccupancyPct?: number | null;
}

export interface CashFlowYear {
  year: number;
  gpr: number;
  vacancyLoss: number;
  otherIncome: number;
  egi: number;
  opex: number;
  noi: number;
  capexReserve: number; // capital reserve, below NOI
  debtService: number;
  cashFlow: number; // levered, after reserve, capital spend and debt, before sale
  /** the plan's capital budget spent this year (0 in an ordinary year) */
  capitalSpend: number;
  /** effective occupancy this year, decimal — 1 − vacancy when stabilized */
  occupancy: number;
  /** where in the plan this year sits */
  phase: "works" | "lease_up" | "stabilized";
}

export interface ModelReturns {
  purchasePrice: number;
  loanAmount: number;
  equity: number;
  /** year-1 NOI ÷ price, % — honest even when year 1 is dark (negative) */
  goingInCapPct: number;
  year1Noi: number;
  exitNoi: number;
  exitValue: number;
  exitLoanBalance: number;
  netSaleProceeds: number;
  leveredIrrPct: number | null;
  unleveredIrrPct: number | null;
  cashOnCashPct: number | null;
  equityMultiple: number | null;
  profit: number;
  // ── The plan's own yardsticks. Null when the deal carries no plan. ──────
  /** the plan's capital budget, $ (0 when none) */
  capitalBudget: number;
  /** price + closing costs + capital budget + the works years' carry */
  totalCost: number;
  /** the works years' negative NOI, summed — equity the IRR spends before
   *  the building earns, so cost here too; null with no plan */
  worksCarry: number | null;
  /** first fully stabilized operating year (1-based); null with no ramp */
  stabilizedYear: number | null;
  /** NOI in that year, in that year's dollars; null with no plan */
  stabilizedNoi: number | null;
  /** stabilized NOI ÷ total cost, % — the return a plan is judged on */
  yieldOnCostPct: number | null;
}

/** Share of stabilized operating expenses a building still carries while it
 *  is dark for works (taxes, insurance, security, utilities) when the
 *  documents do not state the figure. A labelled assumption, not a fact. */
export const WORKS_OPEX_SHARE = 0.35;

function grow(base: number, pct: number, yearsElapsed: number): number {
  return base * Math.pow(1 + pct / 100, yearsElapsed);
}

/** Level annual debt service on a fully-amortizing loan. */
function annualDebtService(
  loanAmount: number,
  ratePct: number,
  amortYears: number,
): number {
  const r = ratePct / 100 / 12;
  const n = amortYears * 12;
  if (n <= 0) return 0;
  if (r === 0) return loanAmount / amortYears;
  const monthly = (loanAmount * r) / (1 - Math.pow(1 + r, -n));
  return monthly * 12;
}

/** Remaining loan balance after `yearsElapsed`, honoring an IO period. */
function loanBalanceAfter(
  loanAmount: number,
  loan: LoanTerms,
  yearsElapsed: number,
): number {
  const amortizingYears = Math.max(0, yearsElapsed - loan.ioYears);
  if (amortizingYears <= 0) return loanAmount;
  const r = loan.ratePct / 100 / 12;
  const monthly = annualDebtService(loanAmount, loan.ratePct, loan.amortYears) / 12;
  const k = amortizingYears * 12;
  if (r === 0) return Math.max(0, loanAmount - monthly * k);
  const bal =
    loanAmount * Math.pow(1 + r, k) - monthly * ((Math.pow(1 + r, k) - 1) / r);
  return Math.max(0, bal);
}

/** IRR via sign-change scan + bisection. Returns a decimal rate (0.15 = 15%). */
export function irr(cashflows: number[]): number | null {
  const npv = (rate: number) =>
    cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

  let lo = -0.9,
    hi = -0.9,
    flo = npv(-0.9),
    found = false;
  let prev = -0.9;
  let fprev = flo;
  for (let rate = -0.89; rate <= 5; rate += 0.01) {
    const f = npv(rate);
    if (fprev === 0) return prev;
    if (fprev * f < 0) {
      lo = prev;
      hi = rate;
      flo = fprev;
      found = true;
      break;
    }
    prev = rate;
    fprev = f;
  }
  if (!found) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

// ── The plan, normalized ─────────────────────────────────────────────────

export interface Plan {
  /** any plan input present — otherwise the classic stabilized model */
  active: boolean;
  works: number;
  leaseUp: number;
  budget: number;
  worksGpr: number;
  worksOpex: number;
  /** stabilized occupancy, decimal (1 − vacancy) */
  stabilizedOcc: number;
  /** occupancy at the start of lease-up, decimal */
  startOcc: number;
  /** the defaults the model had to supply, for the caveats */
  assumed: string[];
}

const wholeYears = (v: number | null | undefined, max = 15): number =>
  v == null || !Number.isFinite(v) || v <= 0 ? 0 : Math.min(max, Math.round(v));

/** Read the plan off the inputs, defaults labelled. Pure. */
export function planOf(inp: ModelInputs): Plan {
  const works = wholeYears(inp.constructionYears);
  const leaseUp = wholeYears(inp.leaseUpYears);
  const budget =
    inp.capitalBudget != null && Number.isFinite(inp.capitalBudget) && inp.capitalBudget > 0
      ? inp.capitalBudget
      : 0;
  const active = works > 0 || leaseUp > 0 || budget > 0;
  const stabilizedOcc = Math.min(1, Math.max(0, 1 - inp.vacancyPct / 100));
  const assumed: string[] = [];

  const worksGpr =
    inp.inPlaceGprDuringWorks != null && Number.isFinite(inp.inPlaceGprDuringWorks)
      ? Math.max(0, inp.inPlaceGprDuringWorks)
      : 0;
  if (works > 0 && inp.inPlaceGprDuringWorks == null) {
    assumed.push(
      "Income during the works was not stated — the building is modelled dark (no rent) until lease-up begins.",
    );
  }

  let worksOpex: number;
  if (inp.worksOpexAnnual != null && Number.isFinite(inp.worksOpexAnnual)) {
    worksOpex = Math.max(0, inp.worksOpexAnnual);
  } else {
    worksOpex = works > 0 ? WORKS_OPEX_SHARE * inp.year1Opex : inp.year1Opex;
    if (works > 0) {
      assumed.push(
        `Operating costs during the works were not stated — carried at ${Math.round(WORKS_OPEX_SHARE * 100)}% of stabilized opex (taxes, insurance, security).`,
      );
    }
  }

  let startOcc: number;
  if (inp.leaseUpStartOccupancyPct != null && Number.isFinite(inp.leaseUpStartOccupancyPct)) {
    startOcc = Math.min(stabilizedOcc, Math.max(0, inp.leaseUpStartOccupancyPct / 100));
  } else if (leaseUp > 0) {
    startOcc = 0;
    assumed.push(
      "Occupancy at the start of lease-up was not stated — the ramp starts from empty.",
    );
  } else {
    startOcc = stabilizedOcc;
  }

  return { active, works, leaseUp, budget, worksGpr, worksOpex, stabilizedOcc, startOcc, assumed };
}

/** The plan's labelled assumptions, for the model's caveats. */
export function planCaveats(inp: ModelInputs): string[] {
  const p = planOf(inp);
  if (!p.active) return [];
  const out = [...p.assumed];
  if (p.budget > 0) {
    out.push(
      p.works > 0
        ? `The ${fmtMoney(p.budget)} capital budget is spent evenly over the ${p.works} year${p.works === 1 ? "" : "s"} of works and funded with equity — a construction facility would change the levered return.`
        : `The ${fmtMoney(p.budget)} capital budget is spent in year 1 and funded with equity.`,
    );
  }
  if (p.leaseUp > 0) {
    out.push(
      `Occupancy climbs in a straight line over ${p.leaseUp} lease-up year${p.leaseUp === 1 ? "" : "s"} while operating costs run at the stabilized level from the first of them — a lease-up is staffed before it is full.`,
    );
  }
  return out;
}

const fmtMoney = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString("en-US")}`;

// ── One operating year ───────────────────────────────────────────────────

interface YearIncome {
  gpr: number;
  vacancyLoss: number;
  otherIncome: number;
  egi: number;
  opex: number;
  noi: number;
  capitalSpend: number;
  occupancy: number;
  phase: CashFlowYear["phase"];
}

/**
 * Income, costs and capital spend for operating year `y` (1-based), through
 * the plan's phases:
 *   works      — the in-place income (often none), the carrying costs, and
 *                this year's slice of the budget
 *   lease-up   — potential rent of the finished building with occupancy on a
 *                straight line from the start to the stabilized level, at
 *                full stabilized operating cost
 *   stabilized — the classic year: GPR less vacancy plus other income, less
 *                opex, all grown from year-1 dollars
 */
export function yearIncome(inp: ModelInputs, y: number, plan: Plan = planOf(inp)): YearIncome {
  const gi = y - 1;
  const potentialGpr = grow(inp.year1Gpr, inp.rentGrowthPct, gi);
  const otherFull = grow(inp.otherIncomeAnnual, inp.otherIncomeGrowthPct, gi);
  const opexFull = grow(inp.year1Opex, inp.expenseGrowthPct, gi);
  const share = (occ: number) => (plan.stabilizedOcc > 0 ? Math.min(1, occ / plan.stabilizedOcc) : 0);

  if (plan.active && y <= plan.works) {
    const gpr = grow(plan.worksGpr, inp.rentGrowthPct, gi);
    const occ = inp.year1Gpr > 0 ? Math.min(plan.stabilizedOcc, plan.worksGpr / inp.year1Gpr) : 0;
    const vacancyLoss = gpr * (inp.vacancyPct / 100);
    const otherIncome = otherFull * share(occ);
    const egi = gpr - vacancyLoss + otherIncome;
    const opex = grow(plan.worksOpex, inp.expenseGrowthPct, gi);
    return {
      gpr,
      vacancyLoss,
      otherIncome,
      egi,
      opex,
      noi: egi - opex,
      capitalSpend: plan.budget / plan.works,
      occupancy: occ * (1 - inp.vacancyPct / 100),
      phase: "works",
    };
  }

  if (plan.active && y <= plan.works + plan.leaseUp) {
    const k = y - plan.works; // 1 … leaseUp, reaching stabilized at k = leaseUp
    const occ = plan.startOcc + (plan.stabilizedOcc - plan.startOcc) * (k / plan.leaseUp);
    const vacancyLoss = potentialGpr * (1 - occ);
    const otherIncome = otherFull * share(occ);
    const egi = potentialGpr - vacancyLoss + otherIncome;
    return {
      gpr: potentialGpr,
      vacancyLoss,
      otherIncome,
      egi,
      opex: opexFull,
      noi: egi - opexFull,
      // A budget with no works years is spent up front, in year 1.
      capitalSpend: plan.works === 0 && y === 1 ? plan.budget : 0,
      occupancy: occ,
      phase: "lease_up",
    };
  }

  const vacancyLoss = potentialGpr * (inp.vacancyPct / 100);
  const egi = potentialGpr - vacancyLoss + otherFull;
  return {
    gpr: potentialGpr,
    vacancyLoss,
    otherIncome: otherFull,
    egi,
    opex: opexFull,
    noi: egi - opexFull,
    capitalSpend: plan.active && plan.works === 0 && plan.leaseUp === 0 && y === 1 ? plan.budget : 0,
    occupancy: plan.stabilizedOcc,
    phase: "stabilized",
  };
}

export function computeModel(inp: ModelInputs): {
  cashFlow: CashFlowYear[];
  returns: ModelReturns;
} {
  const plan = planOf(inp);
  const loanAmount = inp.purchasePrice * (inp.loan.ltvPct / 100);
  // Day-0 equity carries the real check size: price + closing costs + loan
  // fees - loan proceeds. Omitting costs is the classic way an IRR gets flattered.
  const closingCosts = inp.purchasePrice * ((inp.closingCostPct ?? 0) / 100);
  const loanFees = loanAmount * ((inp.loanFeePct ?? 0) / 100);
  const equity = inp.purchasePrice + closingCosts + loanFees - loanAmount;

  const cashFlow: CashFlowYear[] = [];
  for (let y = 1; y <= inp.holdYears; y++) {
    const gi = y - 1;
    const inc = yearIncome(inp, y, plan);
    const capexReserve = grow(
      inp.capexReserveAnnual ?? 0,
      inp.expenseGrowthPct,
      gi,
    );
    const inIo = y <= inp.loan.ioYears;
    const debtService = inIo
      ? loanAmount * (inp.loan.ratePct / 100)
      : annualDebtService(loanAmount, inp.loan.ratePct, inp.loan.amortYears);
    cashFlow.push({
      year: y,
      gpr: inc.gpr,
      vacancyLoss: inc.vacancyLoss,
      otherIncome: inc.otherIncome,
      egi: inc.egi,
      opex: inc.opex,
      noi: inc.noi,
      capexReserve,
      debtService,
      // The plan's spend is equity out the door in the year it happens.
      cashFlow: inc.noi - capexReserve - debtService - inc.capitalSpend,
      capitalSpend: inc.capitalSpend,
      occupancy: inc.occupancy,
      phase: inc.phase,
    });
  }

  const year1Noi = cashFlow[0]?.noi ?? 0;
  const goingInCapPct = inp.purchasePrice
    ? (year1Noi / inp.purchasePrice) * 100
    : 0;

  // Sale on forward (year hold+1) NOI capped at the exit cap, net of costs/debt.
  // The forward year follows the same ramp — a sale mid-lease-up is capped
  // on mid-lease-up income, which is the truth of a short hold.
  const exitNoi = yearIncome(inp, inp.holdYears + 1, plan).noi;
  const exitValue = inp.exitCapPct ? exitNoi / (inp.exitCapPct / 100) : 0;
  const exitLoanBalance = loanBalanceAfter(loanAmount, inp.loan, inp.holdYears);
  const sellingCosts = exitValue * (inp.sellingCostPct / 100);
  const netSaleProceeds = exitValue - sellingCosts - exitLoanBalance;

  const leveredFlows = [
    -equity,
    ...cashFlow.map((c, i) =>
      i === cashFlow.length - 1 ? c.cashFlow + netSaleProceeds : c.cashFlow,
    ),
  ];
  const unleveredFlows = [
    -(inp.purchasePrice + closingCosts),
    ...cashFlow.map((c, i) =>
      i === cashFlow.length - 1
        ? c.noi - c.capexReserve - c.capitalSpend + (exitValue - sellingCosts)
        : c.noi - c.capexReserve - c.capitalSpend,
    ),
  ];

  const leveredIrr = irr(leveredFlows);
  const unleveredIrr = irr(unleveredFlows);
  const cashOnCash =
    equity && cashFlow[0] ? (cashFlow[0].cashFlow / equity) * 100 : null;
  const totalDistributions =
    cashFlow.reduce((a, c) => a + c.cashFlow, 0) + netSaleProceeds;
  const equityMultiple = equity ? totalDistributions / equity : null;

  // The plan's yardsticks: what the finished building earns against
  // everything it cost to get there — the price, the closing costs, the
  // budget AND the carry: the works years' negative NOI is equity out the
  // door in the IRR, so it is cost here too. Null when there is no plan —
  // a stabilized asset is judged on its going-in cap.
  const worksCarry = plan.active
    ? cashFlow.slice(0, plan.works).reduce((s, c) => s + Math.max(0, -c.noi), 0)
    : 0;
  const totalCost = inp.purchasePrice + closingCosts + plan.budget + worksCarry;
  const rampYears = plan.works + plan.leaseUp;
  const stabilizedYear = plan.active && rampYears > 0 ? rampYears + 1 : null;
  const stabilizedNoi = plan.active
    ? yearIncome(inp, stabilizedYear ?? 1, plan).noi
    : null;
  const yieldOnCostPct =
    stabilizedNoi != null && totalCost > 0 ? (stabilizedNoi / totalCost) * 100 : null;

  return {
    cashFlow,
    returns: {
      purchasePrice: inp.purchasePrice,
      loanAmount,
      equity,
      goingInCapPct,
      year1Noi,
      exitNoi,
      exitValue,
      exitLoanBalance,
      netSaleProceeds,
      leveredIrrPct: leveredIrr != null ? leveredIrr * 100 : null,
      unleveredIrrPct: unleveredIrr != null ? unleveredIrr * 100 : null,
      cashOnCashPct: cashOnCash,
      equityMultiple,
      profit: totalDistributions - equity,
      capitalBudget: plan.budget,
      totalCost,
      worksCarry: plan.active ? worksCarry : null,
      stabilizedYear,
      stabilizedNoi,
      yieldOnCostPct,
    },
  };
}
