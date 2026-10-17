// The base case's years on paper (research pass 24, B2): every figure the
// engine's, the cash to equity row the IRR's own stream.
import { describe, expect, it } from "vitest";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { computeUnderwrite, irr } from "./engine";
import { deriveUnderwriteInputs } from "./inputs";
import { annualCashFlowOf, cashCell } from "./annual-cash-flow";
import { buildBaseCase } from "./report-grid";

const derived = deriveUnderwriteInputs(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name);

describe("annualCashFlowOf", () => {
  const uw = computeUnderwrite(derived.inputs);
  const a = annualCashFlowOf(uw);

  it("is a year a column of the hold, each the engine's own figures rounded once, and its rows tie", () => {
    expect(a.years).toHaveLength(uw.holdYears);
    a.years.forEach((y, i) => {
      const c = uw.cashFlow[i];
      expect(y.noi).toBe(Math.round(c.noi));
      expect(y.egi).toBe(Math.round(c.effectiveGrossRevenue));
      expect(y.debtService).toBe(Math.round(c.debtService));
      expect(Math.abs(y.opex - c.operatingExpenses)).toBeLessThanOrEqual(1);
      expect(Math.abs(y.cashAfterDebt - c.leveredCashFlow)).toBeLessThanOrEqual(2);
    });
  });

  // Audit C8, M1: each cell had been the engine's float rounded on its own,
  // so every year of the sample's printed NOI less capital, the fee and debt
  // service missed its printed cash after debt by $1, and the sale sentence
  // its net by $1. The printed integers must add up.
  it("prints whole dollars that add up, down every column and across the sale", () => {
    for (const y of a.years) {
      for (const v of [y.egi, y.opex, y.noi, y.capital, y.amFee, y.debtService, y.cashAfterDebt]) expect(Number.isInteger(v)).toBe(true);
      expect(y.egi - y.opex).toBe(y.noi);
      expect(y.noi - y.capital - y.amFee - y.debtService).toBe(y.cashAfterDebt);
    }
    const { gross, costs, loanPayoff, net } = a.sale;
    for (const v of [gross, costs, loanPayoff, net, a.sale.forwardNoi, a.equity]) expect(Number.isInteger(v)).toBe(true);
    expect(gross - costs - loanPayoff).toBe(net);
    expect(a.toEquity[0]).toBe(-a.equity);
    a.years.forEach((y, i) => {
      expect(a.toEquity[i + 1]).toBe(y.cashAfterDebt + (i === a.years.length - 1 ? net : 0));
    });
  });

  it("carries the sale as the engine sells, and the cash to equity row ties to the model's levered IRR within rounding", () => {
    expect(a.sale.year).toBe(uw.holdYears);
    expect(Math.abs(a.sale.net - uw.residual.netSaleProceeds)).toBeLessThanOrEqual(2);
    expect(a.irrStream).toEqual(uw.leveredVector);
    expect(irr(a.irrStream)).toBeCloseTo(uw.returns.leveredIrrPct!, 9);
    a.toEquity.forEach((v, i) => expect(Math.abs(v - a.irrStream[i])).toBeLessThanOrEqual(3));
    // a dollar or two on tens of millions moves the IRR nowhere a reader sees
    expect(irr(a.toEquity)).toBeCloseTo(uw.returns.leveredIrrPct!, 6);
  });

  it("rides on the base case the report prints, with what grows each year and its source", () => {
    const b = buildBaseCase(derived.inputs, derived.sources);
    expect(b.annual!.years[0].noi).toBe(Math.round(b.noiY1!));
    expect(b.rentGrowth).toBe(derived.inputs.rentGrowthPct);
    expect(b.vacancySource).toEqual(derived.sources.vacancyPct ?? null);
  });
});

describe("cashCell", () => {
  it("whole dollars, money out in brackets, never a minus sign Standard Helvetica cannot draw", () => {
    expect(cashCell(1234567.4)).toBe("$1,234,567");
    expect(cashCell(-98765.6)).toBe("($98,766)");
    expect(cashCell(0)).toBe("$0");
    expect(cashCell(-0.2)).toBe("$0");
  });
});
