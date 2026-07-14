/**
 * The deterministic underwriting engine behind the institutional Excel export
 * (Feature 1). This is the math layer: pure functions, no LLM, no I/O. The
 * generated workbook writes LIVE Excel formulas that mirror this arithmetic
 * cell-for-cell, so "change the exit cap in the file and watch levered IRR
 * recalc" holds AND the web app's numbers match the workbook within rounding.
 *
 * Conventions (shared with the workbook so the two never diverge):
 *  - Rates are DECIMALS everywhere: 0.06 = 6%, matching how Excel stores a
 *    percent-formatted cell. Growth, caps, LTC, vacancy, fees — all decimals.
 *  - This is an ANNUAL screening model from OM-level data: straight-line
 *    growth, a single fixed-rate debt tranche, sale on forward (year hold+1)
 *    NOI at the exit cap. Out of scope: monthly engine, lease rollover, ARGUS.
 *  - Loan sizes off COST EXCLUDING financing fees (`loanBasis`), so the
 *    workbook has NO circular reference and needs no iterative calc — the
 *    ZERO-formula-errors mandate depends on this. Equity is the Sources plug
 *    (total uses − loan), so Sources = Uses is true by construction.
 *  - IO period is in MONTHS; 999 = full-term interest-only. Amortizing months
 *    over the hold = MAX(0, HoldMonths − IOMonths), which is 0 when IO=999.
 */

export interface ExpenseLine {
  label: string;
  /** annual $ in year 1 */
  annual: number;
}

export interface UnderwriteInputs {
  // ── DEAL ────────────────────────────────────────────────────────────────
  purchasePrice: number;
  /** total hold in MONTHS (e.g. 60 = 5 years) */
  holdMonths: number;
  /** acquisition fee = MIN(acqFeePct × price, acqFeeCap) */
  acqFeePct: number;
  acqFeeCap: number;

  // ── CLOSING COST DETAIL (feeds the S&U "DD/Closing Costs" line) ──────────
  /** rates as % of purchase price (decimals) */
  transferTaxPct: number;
  recordationTaxPct: number;
  generalHoldPct: number;
  /** absolute $ line items */
  buyerLegal: number;
  lenderLegal: number;
  thirdPartyReports: number; // appraisal / PCA / Phase I
  miscClosing: number;

  // ── INCOME ───────────────────────────────────────────────────────────────
  /** total in-place rental revenue, annual $ */
  inPlaceRentAnnual: number;
  expenseRecoveriesAnnual: number;
  otherRevenueAnnual: number;
  /** general vacancy & credit loss, decimal of potential gross revenue */
  vacancyPct: number;
  rentGrowthPct: number;

  // ── EXPENSES ──────────────────────────────────────────────────────────────
  expenseLines: ExpenseLine[];
  /** management fee, decimal of EGI (computed on EGI, not grown separately) */
  mgmtFeePct: number;
  expenseGrowthPct: number;

  // ── CAPITAL ───────────────────────────────────────────────────────────────
  rsf: number;
  /** capital reserves $/SF/yr (grown with expenses) */
  reservesPsf: number;
  /** capital improvements budget, spent in year 1 only */
  capitalImprovementsYr1: number;
  /** tenant improvements $/SF (flat annual placeholder; 0 if unknown) */
  tiPsf: number;
  /** leasing commissions, decimal of rental revenue (placeholder; 0 if unknown) */
  lcPct: number;

  // ── FEES ──────────────────────────────────────────────────────────────────
  /** asset management fee, decimal of total equity per year */
  amFeePctEquity: number;

  // ── FINANCING ──────────────────────────────────────────────────────────────
  /** loan to COST (decimal) — sizes off loanBasis, not price */
  ltc: number;
  allInRatePct: number; // decimal
  ioMonths: number; // 999 = full-term IO
  amortMonths: number; // e.g. 360
  /** financing costs, decimal of the loan */
  financingCostPct: number;

  // ── EXIT ────────────────────────────────────────────────────────────────────
  exitCapPct: number; // decimal
  saleCostPct: number; // decimal, of gross sale
}

export interface CashFlowRow {
  year: number; // 1-based operating year
  rentalRevenue: number;
  expenseRecoveries: number;
  otherRevenue: number;
  potentialGrossRevenue: number;
  vacancyLoss: number; // negative
  effectiveGrossRevenue: number;
  operatingExpenses: number; // positive total incl. mgmt fee
  noi: number;
  tenantImprovements: number;
  leasingCommissions: number;
  capitalReserves: number;
  capitalImprovements: number;
  totalCapEx: number;
  assetManagementFees: number;
  propertyCashFlowBeforeDebt: number;
  debtService: number;
  leveredCashFlow: number;
  // metrics
  dscrNoi: number | null;
  dscrCf: number | null;
  debtYield: number | null;
}

export interface SourcesUses {
  purchasePrice: number;
  closingCosts: number;
  acqFee: number;
  financingCosts: number;
  capitalImprovements: number;
  tenantImprovements: number;
  leasingCommissions: number;
  loanBasis: number; // cost the loan sizes off (excludes financing fees)
  loanAmount: number;
  totalUses: number;
  equity: number;
  totalSources: number;
  balanced: boolean; // ROUND(sources)==ROUND(uses)
}

export interface Residual {
  residualNoi: number; // forward (year hold+1) NOI
  exitCapPct: number;
  grossSaleProceeds: number;
  saleCosts: number;
  outstandingDebt: number;
  netSaleProceeds: number; // levered, after debt
  netSaleProceedsUnlevered: number; // before debt
}

export interface Returns {
  goingInCapPct: number;
  stabilizedYieldPct: number; // year-1 NOI / total uses (yield on cost)
  avgUnleveredCashOnCashPct: number | null;
  avgLeveredCashOnCashPct: number | null;
  unleveredIrrPct: number | null;
  leveredIrrPct: number | null;
  unleveredEquityMultiple: number | null;
  leveredEquityMultiple: number | null;
}

export interface UnderwriteResult {
  inputs: UnderwriteInputs;
  holdYears: number;
  sourcesUses: SourcesUses;
  cashFlow: CashFlowRow[];
  residual: Residual;
  returns: Returns;
  unleveredVector: number[]; // year 0..hold
  leveredVector: number[]; // year 0..hold
}

const grow = (base: number, pct: number, yearsElapsed: number): number =>
  base * Math.pow(1 + pct, yearsElapsed);

/** IRR via sign-change scan + bisection. Returns a decimal (0.15 = 15%), or
 *  null when no root exists in [-90%, 500%]. Mirrors Excel's IRR closely
 *  enough that recalc'd workbook values match within rounding. */
export function irr(cashflows: number[]): number | null {
  if (cashflows.length < 2) return null;
  // A degenerate all-zero stream has no meaningful rate — don't report the
  // scan floor (-90%) as if it were one.
  if (cashflows.every((c) => c === 0)) return null;
  const npv = (rate: number) =>
    cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

  let lo = -0.9;
  let prev = -0.9;
  let fprev = npv(-0.9);
  let hi = 0;
  let found = false;
  for (let rate = -0.89; rate <= 5; rate += 0.001) {
    const f = npv(rate);
    if (fprev === 0) return prev;
    if (fprev * f < 0) {
      lo = prev;
      hi = rate;
      found = true;
      break;
    }
    prev = rate;
    fprev = f;
  }
  if (!found) return null;

  let flo = npv(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** Level monthly payment on a fully-amortizing loan (decimal monthly rate). */
export function monthlyPayment(
  loanAmount: number,
  ratePct: number,
  amortMonths: number,
): number {
  const r = ratePct / 12;
  if (amortMonths <= 0) return 0;
  if (r === 0) return loanAmount / amortMonths;
  return (loanAmount * r) / (1 - Math.pow(1 + r, -amortMonths));
}

/** Annual debt service for operating year `y` (1-based), honoring the IO
 *  period (IOMonths; 999 = full-term IO). */
export function annualDebtService(
  loanAmount: number,
  inp: UnderwriteInputs,
  y: number,
): number {
  const isIo = y * 12 <= inp.ioMonths;
  if (isIo) return loanAmount * inp.allInRatePct; // interest-only
  return monthlyPayment(loanAmount, inp.allInRatePct, inp.amortMonths) * 12;
}

/** Outstanding loan balance after the full hold, using the closed form so the
 *  workbook can replicate it with plain arithmetic (no FV sign ambiguity). */
export function loanBalanceAtExit(
  loanAmount: number,
  inp: UnderwriteInputs,
): number {
  const amortizingMonths = Math.max(0, inp.holdMonths - inp.ioMonths);
  if (amortizingMonths <= 0) return loanAmount; // still in IO at sale
  const r = inp.allInRatePct / 12;
  const m = monthlyPayment(loanAmount, inp.allInRatePct, inp.amortMonths);
  if (r === 0) return Math.max(0, loanAmount - m * amortizingMonths);
  const bal =
    loanAmount * Math.pow(1 + r, amortizingMonths) -
    m * ((Math.pow(1 + r, amortizingMonths) - 1) / r);
  return Math.max(0, bal);
}

function closingCostsTotal(inp: UnderwriteInputs): number {
  return (
    inp.purchasePrice * inp.transferTaxPct +
    inp.purchasePrice * inp.recordationTaxPct +
    inp.purchasePrice * inp.generalHoldPct +
    inp.buyerLegal +
    inp.lenderLegal +
    inp.thirdPartyReports +
    inp.miscClosing
  );
}

function acquisitionFee(inp: UnderwriteInputs): number {
  return Math.min(inp.acqFeePct * inp.purchasePrice, inp.acqFeeCap);
}

export function computeSourcesUses(inp: UnderwriteInputs): SourcesUses {
  const closingCosts = closingCostsTotal(inp);
  const acqFee = acquisitionFee(inp);
  const capitalImprovements = inp.capitalImprovementsYr1;
  const tenantImprovements = inp.tiPsf * inp.rsf;
  const leasingCommissions = inp.lcPct * inp.inPlaceRentAnnual;
  // Loan sizes off acquisition cost EXCLUDING financing fees → no circular
  // reference. Capital improvements / TI / LC are treated as OPERATING
  // outflows (below NOI, in the cash-flow ladder), NOT capitalized into the
  // basis — matching the house model (lib/model/compute.ts). Capitalizing them
  // here AND subtracting them in the ladder would double-count them.
  const loanBasis = inp.purchasePrice + closingCosts + acqFee;
  const loanAmount = inp.ltc * loanBasis;
  const financingCosts = inp.financingCostPct * loanAmount;
  const totalUses = loanBasis + financingCosts;
  const equity = totalUses - loanAmount; // the plug
  const totalSources = equity + loanAmount;
  return {
    purchasePrice: inp.purchasePrice,
    closingCosts,
    acqFee,
    financingCosts,
    capitalImprovements,
    tenantImprovements,
    leasingCommissions,
    loanBasis,
    loanAmount,
    totalUses,
    equity,
    totalSources,
    balanced: Math.round(totalSources) === Math.round(totalUses),
  };
}

/** NOI for a given years-elapsed (0 = year 1), used for the forward exit NOI. */
function noiForYearsElapsed(inp: UnderwriteInputs, yearsElapsed: number): number {
  const rentalRevenue = grow(inp.inPlaceRentAnnual, inp.rentGrowthPct, yearsElapsed);
  const expenseRecoveries = grow(
    inp.expenseRecoveriesAnnual,
    inp.expenseGrowthPct,
    yearsElapsed,
  );
  const otherRevenue = grow(inp.otherRevenueAnnual, inp.rentGrowthPct, yearsElapsed);
  const pgr = rentalRevenue + expenseRecoveries + otherRevenue;
  const vacancyLoss = pgr * inp.vacancyPct;
  const egi = pgr - vacancyLoss;
  const baseOpex = inp.expenseLines.reduce(
    (s, l) => s + grow(l.annual, inp.expenseGrowthPct, yearsElapsed),
    0,
  );
  const mgmtFee = egi * inp.mgmtFeePct;
  return egi - (baseOpex + mgmtFee);
}

export function computeUnderwrite(inp: UnderwriteInputs): UnderwriteResult {
  const holdYears = Math.max(1, Math.round(inp.holdMonths / 12));
  const su = computeSourcesUses(inp);
  const { loanAmount, equity } = su;

  const cashFlow: CashFlowRow[] = [];
  for (let y = 1; y <= holdYears; y++) {
    const e = y - 1;
    const rentalRevenue = grow(inp.inPlaceRentAnnual, inp.rentGrowthPct, e);
    const expenseRecoveries = grow(inp.expenseRecoveriesAnnual, inp.expenseGrowthPct, e);
    const otherRevenue = grow(inp.otherRevenueAnnual, inp.rentGrowthPct, e);
    const potentialGrossRevenue = rentalRevenue + expenseRecoveries + otherRevenue;
    const vacancyLoss = -(potentialGrossRevenue * inp.vacancyPct);
    const effectiveGrossRevenue = potentialGrossRevenue + vacancyLoss;
    const baseOpex = inp.expenseLines.reduce(
      (s, l) => s + grow(l.annual, inp.expenseGrowthPct, e),
      0,
    );
    const mgmtFee = effectiveGrossRevenue * inp.mgmtFeePct;
    const operatingExpenses = baseOpex + mgmtFee;
    const noi = effectiveGrossRevenue - operatingExpenses;

    const tenantImprovements = inp.tiPsf * inp.rsf;
    const leasingCommissions = inp.lcPct * rentalRevenue;
    const capitalReserves = grow(inp.reservesPsf * inp.rsf, inp.expenseGrowthPct, e);
    const capitalImprovements = y === 1 ? inp.capitalImprovementsYr1 : 0;
    const totalCapEx =
      tenantImprovements + leasingCommissions + capitalReserves + capitalImprovements;
    const assetManagementFees = equity * inp.amFeePctEquity;
    const propertyCashFlowBeforeDebt = noi - totalCapEx - assetManagementFees;
    const debtService = annualDebtService(loanAmount, inp, y);
    const leveredCashFlow = propertyCashFlowBeforeDebt - debtService;

    cashFlow.push({
      year: y,
      rentalRevenue,
      expenseRecoveries,
      otherRevenue,
      potentialGrossRevenue,
      vacancyLoss,
      effectiveGrossRevenue,
      operatingExpenses,
      noi,
      tenantImprovements,
      leasingCommissions,
      capitalReserves,
      capitalImprovements,
      totalCapEx,
      assetManagementFees,
      propertyCashFlowBeforeDebt,
      debtService,
      leveredCashFlow,
      dscrNoi: debtService ? noi / debtService : null,
      dscrCf: debtService ? (noi - totalCapEx) / debtService : null,
      debtYield: loanAmount ? noi / loanAmount : null,
    });
  }

  // Sale on forward (year hold+1) NOI at the exit cap, net of costs and debt.
  const residualNoi = noiForYearsElapsed(inp, holdYears);
  const grossSaleProceeds = inp.exitCapPct ? residualNoi / inp.exitCapPct : 0;
  const saleCosts = grossSaleProceeds * inp.saleCostPct;
  const outstandingDebt = loanBalanceAtExit(loanAmount, inp);
  const netSaleProceeds = grossSaleProceeds - saleCosts - outstandingDebt;
  const netSaleProceedsUnlevered = grossSaleProceeds - saleCosts;

  const residual: Residual = {
    residualNoi,
    exitCapPct: inp.exitCapPct,
    grossSaleProceeds,
    saleCosts,
    outstandingDebt,
    netSaleProceeds,
    netSaleProceedsUnlevered,
  };

  // IRR vectors. Unlevered = property level (excludes financing + AM fee).
  // Levered = equity level (the equity plug already carries closing/acq/
  // financing costs, so year 0 is simply −equity).
  const unlevYear0 = -(su.purchasePrice + su.closingCosts + su.acqFee);
  const unleveredVector = [unlevYear0];
  const leveredVector = [-equity];
  for (let i = 0; i < cashFlow.length; i++) {
    const c = cashFlow[i];
    const last = i === cashFlow.length - 1;
    const unlevOp = c.noi - c.totalCapEx;
    unleveredVector.push(last ? unlevOp + netSaleProceedsUnlevered : unlevOp);
    leveredVector.push(last ? c.leveredCashFlow + netSaleProceeds : c.leveredCashFlow);
  }

  const year1Noi = cashFlow[0]?.noi ?? 0;
  const unlevInitial = -unlevYear0;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const unlevCoc = avg(cashFlow.map((c) => (unlevInitial ? (c.noi - c.totalCapEx) / unlevInitial : 0)));
  const levCoc = avg(cashFlow.map((c) => (equity ? c.leveredCashFlow / equity : 0)));

  const unlevDistributions =
    cashFlow.reduce((a, c) => a + (c.noi - c.totalCapEx), 0) + netSaleProceedsUnlevered;
  const levDistributions =
    cashFlow.reduce((a, c) => a + c.leveredCashFlow, 0) + netSaleProceeds;

  const leveredIrr = irr(leveredVector);
  const unleveredIrr = irr(unleveredVector);

  const returns: Returns = {
    goingInCapPct: inp.purchasePrice ? year1Noi / inp.purchasePrice : 0,
    stabilizedYieldPct: su.totalUses ? year1Noi / su.totalUses : 0,
    avgUnleveredCashOnCashPct: unlevCoc,
    avgLeveredCashOnCashPct: levCoc,
    unleveredIrrPct: unleveredIrr,
    leveredIrrPct: leveredIrr,
    unleveredEquityMultiple: unlevInitial ? unlevDistributions / unlevInitial : null,
    leveredEquityMultiple: equity ? levDistributions / equity : null,
  };

  return {
    inputs: inp,
    holdYears,
    sourcesUses: su,
    cashFlow,
    residual,
    returns,
    unleveredVector,
    leveredVector,
  };
}
