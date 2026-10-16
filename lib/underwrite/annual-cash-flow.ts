// The base case's years on paper (research pass 24, B2): a committee reading
// the report saw an IRR with no year-by-year NOI, debt service and sale
// behind it — only the workbook's Cash Flow tab showed them. Pure: it reads
// the engine's own run (lib/underwrite/engine `computeUnderwrite`), the one
// the base case and the grids are struck from, and adds nothing.
//
// Its rules:
//   - every figure is the engine's, never recomputed here: a row the page
//     prints is a field of `CashFlowRow` or `Residual`;
//   - the cash to equity row IS the levered vector the IRR is solved on —
//     the closing's equity out, each year's cash after debt, the last year's
//     with the net sale — so the page's IRR can be traced to its row;
//   - a line the model carries at zero in every year (an asset-management
//     fee of none, no capital) is left out rather than printed as a row of
//     dashes.
import type { UnderwriteResult } from "./engine";

export interface AnnualYear {
  year: number;
  egi: number;
  /** positive: what the year's expenses cost, the management fee included */
  opex: number;
  noi: number;
  /** positive: reserves, tenant improvements, commissions and the year's
   *  capital improvements */
  capital: number;
  /** positive */
  amFee: number;
  /** positive */
  debtService: number;
  /** NOI less capital, the fee and debt service — the engine's levered
   *  cash flow, before the sale */
  cashAfterDebt: number;
}

export interface AnnualCashFlow {
  years: AnnualYear[];
  /** the equity in at closing (positive) */
  equity: number;
  sale: {
    /** the year the model sells in */
    year: number;
    /** the forward (year hold + 1) NOI the exit capitalises */
    forwardNoi: number;
    /** decimal */
    exitCap: number;
    gross: number;
    costs: number;
    loanPayoff: number;
    /** to equity, after the costs and the loan */
    net: number;
  };
  /** the levered vector: [−equity, year 1 … year N with the sale] */
  toEquity: number[];
  /** whether the model carries any capital, or any fee, in some year */
  hasCapital: boolean;
  hasAmFee: boolean;
}

export function annualCashFlowOf(uw: UnderwriteResult): AnnualCashFlow {
  const years = uw.cashFlow.map((c) => ({
    year: c.year,
    egi: c.effectiveGrossRevenue,
    opex: c.operatingExpenses,
    noi: c.noi,
    capital: c.totalCapEx,
    amFee: c.assetManagementFees,
    debtService: c.debtService,
    cashAfterDebt: c.leveredCashFlow,
  }));
  const r = uw.residual;
  return {
    years,
    equity: uw.sourcesUses.equity,
    sale: {
      year: uw.holdYears,
      forwardNoi: r.residualNoi,
      exitCap: r.exitCapPct,
      gross: r.grossSaleProceeds,
      costs: r.saleCosts,
      loanPayoff: r.outstandingDebt,
      net: r.netSaleProceeds,
    },
    toEquity: [...uw.leveredVector],
    hasCapital: years.some((y) => y.capital !== 0),
    hasAmFee: years.some((y) => y.amFee !== 0),
  };
}

/** A figure as the cash flow table prints it: whole dollars, money out in
 *  brackets — Standard Helvetica carries no minus sign (lib/memo/pdf-text),
 *  and brackets are how an operating statement says it. */
export function cashCell(n: number): string {
  const r = Math.round(n);
  const body = `$${Math.abs(r).toLocaleString("en-US")}`;
  return r < 0 ? `(${body})` : body;
}
