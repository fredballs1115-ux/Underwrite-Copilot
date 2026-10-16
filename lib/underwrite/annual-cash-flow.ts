// The base case's years on paper (research pass 24, B2): a committee reading
// the report saw an IRR with no year-by-year NOI, debt service and sale
// behind it — only the workbook's Cash Flow tab showed them. Pure: it reads
// the engine's own run (lib/underwrite/engine `computeUnderwrite`), the one
// the base case and the grids are struck from, and adds nothing.
//
// Its rules:
//   - every figure is the engine's, never recomputed here: a row the page
//     prints is a field of `CashFlowRow` or `Residual`, or a total of them;
//   - printed, the rows add up (audit C8, M1 — the debt schedule's rule):
//     each figure the engine computes is rounded to the dollar ONCE, and
//     every total the page prints is derived from the rounded figures above
//     it, never rounded on its own — operating expenses are revenue less the
//     NOI (the NOI is the figure the base case prints elsewhere), cash after
//     debt the NOI less capital, the fee and debt service, the net sale the
//     gross less its costs and the loan. Rounded one by one, every year of
//     the sample missed its own total by a dollar;
//   - the cash to equity row is the closing's equity out, each year's cash
//     after debt and the last year's net sale, from those printed figures:
//     the levered vector the IRR is solved on, within the dollar a row's
//     rounding moves it (`irrStream` keeps the engine's own);
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
  /** the printed cash to equity: [−equity, year 1 … year N with the sale],
   *  each the sum of the row's printed figures */
  toEquity: number[];
  /** the engine's levered vector, unrounded — the stream the IRR is solved
   *  on, which `toEquity` ties to within rounding */
  irrStream: number[];
  /** whether the model carries any capital, or any fee, in some year */
  hasCapital: boolean;
  hasAmFee: boolean;
}

export function annualCashFlowOf(uw: UnderwriteResult): AnnualCashFlow {
  const $ = (n: number) => Math.round(n);
  const years = uw.cashFlow.map((c) => {
    const egi = $(c.effectiveGrossRevenue);
    const noi = $(c.noi);
    const capital = $(c.totalCapEx);
    const amFee = $(c.assetManagementFees);
    const debtService = $(c.debtService);
    return {
      year: c.year,
      egi,
      // derived, so revenue less expenses is the printed NOI
      opex: egi - noi,
      noi,
      capital,
      amFee,
      debtService,
      // derived, so the column adds up to it
      cashAfterDebt: noi - capital - amFee - debtService,
    };
  });
  const r = uw.residual;
  const gross = $(r.grossSaleProceeds);
  const costs = $(r.saleCosts);
  const loanPayoff = $(r.outstandingDebt);
  const net = gross - costs - loanPayoff;
  const equity = $(uw.sourcesUses.equity);
  return {
    years,
    equity,
    sale: {
      year: uw.holdYears,
      forwardNoi: $(r.residualNoi),
      exitCap: r.exitCapPct,
      gross,
      costs,
      loanPayoff,
      net,
    },
    toEquity: [-equity, ...years.map((y, i) => y.cashAfterDebt + (i === years.length - 1 ? net : 0))],
    irrStream: [...uw.leveredVector],
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
