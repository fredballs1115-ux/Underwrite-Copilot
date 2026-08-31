/**
 * The rent-roll-driven cash flow that the exported workbook's formulas mirror
 * cell-for-cell.
 *
 * This exists so "the workbook and the app agree" is a TESTABLE claim rather
 * than a hope: the export writes live Excel formulas for exactly this
 * arithmetic, and the test loads the generated .xlsx, recalculates it, and
 * asserts the IRR cell matches this function's IRR.
 *
 * Conventions, stated here and on the workbook's Assumptions tab:
 *  - Rates are DECIMALS (0.06 = 6%), matching how Excel stores a percent cell.
 *  - A lease expiring in calendar year Y rolls during the analysis year that
 *    contains Y. From that year on, its SF is re-leased at market rent.
 *  - Free rent and downtime are LEASING CAPITAL below NOI, not a haircut to
 *    revenue. Counting them in both places is the classic double-count.
 *  - Sale at the end of the hold on FORWARD (year hold+1) NOI at the exit cap.
 *  - The loan sizes off cost EXCLUDING financing fees, so the workbook has no
 *    circular reference and needs no iterative calculation.
 *
 * Pure — no I/O.
 */
import { irr } from "@/lib/underwrite/engine";
import { rolloverSchedule, blendedRolloverCostPsf } from "@/lib/rentroll/analytics";
import type { ProfileDraft } from "@/lib/rentroll/profiles";
import type { Lease } from "@/lib/rentroll/schema";

export interface WorkbookInputs {
  dealName: string;
  /** analysis start, ISO — normally the rent roll's as-of date */
  asOf: string;
  nra: number;
  purchasePrice: number;
  /** closing costs as a decimal of price */
  closingCostPct: number;

  otherIncomeAnnual: number;
  /** general vacancy & credit loss on potential gross revenue */
  vacancyPct: number;
  opexPsf: number;
  expenseGrowthPct: number;
  /** share of operating expenses recovered from tenants */
  reimbursementPct: number;
  /** management fee, decimal of effective gross revenue */
  mgmtFeePct: number;
  reservesPsf: number;
  capitalImprovementsYr1: number;

  profile: ProfileDraft;
  absorptionSfPerMonth: number;

  exitCapPct: number;
  saleCostPct: number;
  holdYears: number;

  ltc: number;
  allInRatePct: number;
  ioMonths: number;
  amortMonths: number;
  financingCostPct: number;
}

/** Everything read off the rent roll, resolved once so the workbook writes the
 *  same figures its formulas start from. */
export interface RollBasis {
  startYear: number;
  inPlaceRentAnnual: number;
  occupiedSf: number;
  vacantSf: number;
  /** cumulative rent and SF rolled off by the END of each analysis year */
  cumulativeExpiredRent: number[];
  cumulativeExpiredSf: number[];
  /** SF expiring IN each analysis year (the rollover-cost basis) */
  sfExpiringByYear: number[];
  rentExpiringByYear: number[];
}

export function rollBasis(leases: Lease[], inputs: WorkbookInputs): RollBasis {
  const startYear = Number(inputs.asOf.slice(0, 4));
  const schedule = rolloverSchedule(leases, { nra: inputs.nra });
  const inPlaceRentAnnual = leases.reduce((s, l) => s + (l.baseRentAnnual ?? 0), 0);
  const vacantSf = leases.filter((l) => l.vacant).reduce((s, l) => s + (l.sf ?? 0), 0);
  const occupiedSf = leases
    .filter((l) => !l.vacant)
    .reduce((s, l) => s + (l.sf ?? 0), 0);

  const sfExpiringByYear: number[] = [];
  const rentExpiringByYear: number[] = [];
  const cumulativeExpiredRent: number[] = [];
  const cumulativeExpiredSf: number[] = [];
  let cumRent = 0;
  let cumSf = 0;

  for (let y = 1; y <= inputs.holdYears + 1; y++) {
    const calendarYear = startYear + y - 1;
    // Year 1 absorbs anything already expired (holdover) as well as this year.
    const rows = schedule.years.filter((r) =>
      y === 1 ? r.year <= calendarYear : r.year === calendarYear,
    );
    const sf = rows.reduce((s, r) => s + r.sfExpiring, 0);
    const rent = rows.reduce((s, r) => s + r.rentExpiring, 0);
    sfExpiringByYear.push(sf);
    rentExpiringByYear.push(rent);
    cumRent += rent;
    cumSf += sf;
    cumulativeExpiredRent.push(cumRent);
    cumulativeExpiredSf.push(cumSf);
  }

  return {
    startYear,
    inPlaceRentAnnual,
    occupiedSf,
    vacantSf,
    cumulativeExpiredRent,
    cumulativeExpiredSf,
    sfExpiringByYear,
    rentExpiringByYear,
  };
}

export interface CashFlowYear {
  year: number;
  calendarYear: number;
  contractRent: number;
  releasedRent: number;
  leaseUpRent: number;
  otherIncome: number;
  potentialGrossRevenue: number;
  vacancyLoss: number; // negative
  reimbursements: number;
  effectiveGrossRevenue: number;
  operatingExpenses: number; // positive
  managementFee: number; // positive
  noi: number;
  leasingCapital: number; // positive
  capitalReserves: number; // positive
  capitalImprovements: number; // positive
  cashFlowBeforeDebt: number;
  debtService: number; // positive
  leveredCashFlow: number;
}

export interface WorkbookCashFlow {
  basis: RollBasis;
  years: CashFlowYear[];
  /** forward (hold+1) NOI the exit cap is applied to */
  reversionNoi: number;
  grossSaleProceeds: number;
  saleCosts: number;
  loanAmount: number;
  loanPayoff: number;
  netSaleProceedsLevered: number;
  netSaleProceedsUnlevered: number;
  totalUses: number;
  equity: number;
  unleveredVector: number[];
  leveredVector: number[];
  leveredIrr: number | null;
  unleveredIrr: number | null;
  equityMultiple: number | null;
  /** blended rollover cost per expiring SF, the Assumptions-tab lever */
  rolloverCostPsf: number;
}

const grow = (base: number, pct: number, yearsElapsed: number) =>
  base * Math.pow(1 + pct, yearsElapsed);

/** Level monthly payment; mirrors Excel's PMT with the sign flipped positive. */
export function pmt(loan: number, ratePct: number, amortMonths: number): number {
  const r = ratePct / 12;
  if (amortMonths <= 0) return 0;
  if (r === 0) return loan / amortMonths;
  return (loan * r) / (1 - Math.pow(1 + r, -amortMonths));
}

/** Closed-form balance after `months` of amortization — the workbook writes
 *  this as plain arithmetic so there is no FV sign ambiguity to get wrong. */
export function balanceAfter(
  loan: number,
  ratePct: number,
  amortMonths: number,
  monthsElapsed: number,
): number {
  if (monthsElapsed <= 0) return loan;
  const r = ratePct / 12;
  const p = pmt(loan, ratePct, amortMonths);
  if (r === 0) return Math.max(0, loan - p * monthsElapsed);
  const growth = Math.pow(1 + r, monthsElapsed);
  return Math.max(0, loan * growth - p * ((growth - 1) / r));
}

/** NOI for one analysis year — shared by the ladder and the reversion year. */
function noiFor(
  year: number,
  inputs: WorkbookInputs,
  basis: RollBasis,
): Omit<CashFlowYear, "year" | "calendarYear" | "leasingCapital" | "capitalReserves" | "capitalImprovements" | "cashFlowBeforeDebt" | "debtService" | "leveredCashFlow"> {
  const e = year - 1;
  const esc = inputs.profile.escalationPct;
  const cumRent = basis.cumulativeExpiredRent[year - 1] ?? 0;
  const cumSf = basis.cumulativeExpiredSf[year - 1] ?? 0;

  const contractRent = grow(Math.max(0, basis.inPlaceRentAnnual - cumRent), esc, e);
  const releasedRent = grow(cumSf * inputs.profile.marketRentPsf, esc, e);
  // Mid-year convention on absorption: revenue accrues as space leases up, not
  // all at the last day of the year.
  const absorbedSf = Math.min(
    basis.vacantSf,
    Math.max(0, inputs.absorptionSfPerMonth * 12 * (year - 0.5)),
  );
  const leaseUpRent = grow(absorbedSf * inputs.profile.marketRentPsf, esc, e);
  const otherIncome = grow(inputs.otherIncomeAnnual, esc, e);

  const potentialGrossRevenue = contractRent + releasedRent + leaseUpRent + otherIncome;
  const vacancyLoss = -(potentialGrossRevenue * inputs.vacancyPct);
  const operatingExpenses = grow(inputs.opexPsf * inputs.nra, inputs.expenseGrowthPct, e);
  const reimbursements = operatingExpenses * inputs.reimbursementPct;
  const effectiveGrossRevenue = potentialGrossRevenue + vacancyLoss + reimbursements;
  const managementFee = effectiveGrossRevenue * inputs.mgmtFeePct;
  const noi = effectiveGrossRevenue - operatingExpenses - managementFee;

  return {
    contractRent,
    releasedRent,
    leaseUpRent,
    otherIncome,
    potentialGrossRevenue,
    vacancyLoss,
    reimbursements,
    effectiveGrossRevenue,
    operatingExpenses,
    managementFee,
    noi,
  };
}

export function buildRentRollCashFlow(
  leases: Lease[],
  inputs: WorkbookInputs,
): WorkbookCashFlow {
  const basis = rollBasis(leases, inputs);
  const { blendedPsf } = blendedRolloverCostPsf(inputs.profile);

  const closingCosts = inputs.purchasePrice * inputs.closingCostPct;
  const loanBasis = inputs.purchasePrice + closingCosts;
  const loanAmount = loanBasis * inputs.ltc;
  const financingCosts = loanAmount * inputs.financingCostPct;
  const totalUses = loanBasis + financingCosts;
  const equity = totalUses - loanAmount;

  const years: CashFlowYear[] = [];
  for (let y = 1; y <= inputs.holdYears; y++) {
    const ops = noiFor(y, inputs, basis);
    const leasingCapital = (basis.sfExpiringByYear[y - 1] ?? 0) * blendedPsf;
    const capitalReserves = grow(
      inputs.reservesPsf * inputs.nra,
      inputs.expenseGrowthPct,
      y - 1,
    );
    const capitalImprovements = y === 1 ? inputs.capitalImprovementsYr1 : 0;
    const cashFlowBeforeDebt =
      ops.noi - leasingCapital - capitalReserves - capitalImprovements;
    const debtService =
      y * 12 <= inputs.ioMonths
        ? loanAmount * inputs.allInRatePct
        : pmt(loanAmount, inputs.allInRatePct, inputs.amortMonths) * 12;
    years.push({
      year: y,
      calendarYear: basis.startYear + y - 1,
      ...ops,
      leasingCapital,
      capitalReserves,
      capitalImprovements,
      cashFlowBeforeDebt,
      debtService,
      leveredCashFlow: cashFlowBeforeDebt - debtService,
    });
  }

  const reversionNoi = noiFor(inputs.holdYears + 1, inputs, basis).noi;
  const grossSaleProceeds = inputs.exitCapPct > 0 ? reversionNoi / inputs.exitCapPct : 0;
  const saleCosts = grossSaleProceeds * inputs.saleCostPct;
  const amortizingMonths = Math.max(0, inputs.holdYears * 12 - inputs.ioMonths);
  const loanPayoff = balanceAfter(
    loanAmount,
    inputs.allInRatePct,
    inputs.amortMonths,
    amortizingMonths,
  );
  const netSaleProceedsUnlevered = grossSaleProceeds - saleCosts;
  const netSaleProceedsLevered = netSaleProceedsUnlevered - loanPayoff;

  const unleveredVector = [-(inputs.purchasePrice + closingCosts)];
  const leveredVector = [-equity];
  years.forEach((y, i) => {
    const last = i === years.length - 1;
    unleveredVector.push(
      last ? y.cashFlowBeforeDebt + netSaleProceedsUnlevered : y.cashFlowBeforeDebt,
    );
    leveredVector.push(last ? y.leveredCashFlow + netSaleProceedsLevered : y.leveredCashFlow);
  });

  const distributions =
    years.reduce((s, y) => s + y.leveredCashFlow, 0) + netSaleProceedsLevered;

  return {
    basis,
    years,
    reversionNoi,
    grossSaleProceeds,
    saleCosts,
    loanAmount,
    loanPayoff,
    netSaleProceedsLevered,
    netSaleProceedsUnlevered,
    totalUses,
    equity,
    unleveredVector,
    leveredVector,
    leveredIrr: irr(leveredVector),
    unleveredIrr: irr(unleveredVector),
    equityMultiple: equity > 0 ? distributions / equity : null,
    rolloverCostPsf: blendedPsf,
  };
}
