/**
 * The deterministic heart of the model: given reconciled numeric inputs, build
 * a multi-year operating cash flow and compute returns. Doing the math in code
 * (rather than asking Claude to compute IRR) keeps it correct and auditable —
 * every figure here is reproducible from the inputs.
 *
 * Simplifications (surfaced as caveats in the model): straight-line growth,
 * no capex/reserves line, single tranche of debt, sale at a forward-NOI / exit-
 * cap value net of selling costs. A first-draft to verify, not a final model.
 */

export interface LoanTerms {
  ltvPct: number;
  ratePct: number;
  amortYears: number;
  ioYears: number;
}

export interface ModelInputs {
  units: number;
  purchasePrice: number;
  year1Gpr: number; // annual gross potential rent
  vacancyPct: number;
  otherIncomeAnnual: number;
  year1Opex: number; // annual operating expenses (total)
  rentGrowthPct: number;
  expenseGrowthPct: number;
  otherIncomeGrowthPct: number;
  exitCapPct: number;
  sellingCostPct: number;
  holdYears: number;
  loan: LoanTerms;
}

export interface CashFlowYear {
  year: number;
  gpr: number;
  vacancyLoss: number;
  otherIncome: number;
  egi: number;
  opex: number;
  noi: number;
  debtService: number;
  cashFlow: number; // levered, before sale
}

export interface ModelReturns {
  purchasePrice: number;
  loanAmount: number;
  equity: number;
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
}

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

function noiForYear(inp: ModelInputs, yearsElapsed: number): number {
  const gpr = grow(inp.year1Gpr, inp.rentGrowthPct, yearsElapsed);
  const vacancyLoss = gpr * (inp.vacancyPct / 100);
  const otherIncome = grow(
    inp.otherIncomeAnnual,
    inp.otherIncomeGrowthPct,
    yearsElapsed,
  );
  const egi = gpr - vacancyLoss + otherIncome;
  const opex = grow(inp.year1Opex, inp.expenseGrowthPct, yearsElapsed);
  return egi - opex;
}

export function computeModel(inp: ModelInputs): {
  cashFlow: CashFlowYear[];
  returns: ModelReturns;
} {
  const loanAmount = inp.purchasePrice * (inp.loan.ltvPct / 100);
  const equity = inp.purchasePrice - loanAmount;

  const cashFlow: CashFlowYear[] = [];
  for (let y = 1; y <= inp.holdYears; y++) {
    const gi = y - 1;
    const gpr = grow(inp.year1Gpr, inp.rentGrowthPct, gi);
    const vacancyLoss = gpr * (inp.vacancyPct / 100);
    const otherIncome = grow(inp.otherIncomeAnnual, inp.otherIncomeGrowthPct, gi);
    const egi = gpr - vacancyLoss + otherIncome;
    const opex = grow(inp.year1Opex, inp.expenseGrowthPct, gi);
    const noi = egi - opex;
    const inIo = y <= inp.loan.ioYears;
    const debtService = inIo
      ? loanAmount * (inp.loan.ratePct / 100)
      : annualDebtService(loanAmount, inp.loan.ratePct, inp.loan.amortYears);
    cashFlow.push({
      year: y,
      gpr,
      vacancyLoss,
      otherIncome,
      egi,
      opex,
      noi,
      debtService,
      cashFlow: noi - debtService,
    });
  }

  const year1Noi = cashFlow[0]?.noi ?? 0;
  const goingInCapPct = inp.purchasePrice
    ? (year1Noi / inp.purchasePrice) * 100
    : 0;

  // Sale on forward (year hold+1) NOI capped at the exit cap, net of costs/debt.
  const exitNoi = noiForYear(inp, inp.holdYears);
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
    -inp.purchasePrice,
    ...cashFlow.map((c, i) =>
      i === cashFlow.length - 1 ? c.noi + (exitValue - sellingCosts) : c.noi,
    ),
  ];

  const leveredIrr = irr(leveredFlows);
  const unleveredIrr = irr(unleveredFlows);
  const cashOnCash =
    equity && cashFlow[0] ? (cashFlow[0].cashFlow / equity) * 100 : null;
  const totalDistributions =
    cashFlow.reduce((a, c) => a + c.cashFlow, 0) + netSaleProceeds;
  const equityMultiple = equity ? totalDistributions / equity : null;

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
    },
  };
}
