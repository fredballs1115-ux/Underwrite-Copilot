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

  it("is a year a column of the hold, each the engine's own figures, and its rows tie", () => {
    expect(a.years).toHaveLength(uw.holdYears);
    a.years.forEach((y, i) => {
      const c = uw.cashFlow[i];
      expect(y.noi).toBe(c.noi);
      expect(y.egi - y.opex).toBeCloseTo(y.noi, 6);
      expect(y.noi - y.capital - y.amFee - y.debtService).toBeCloseTo(y.cashAfterDebt, 6);
    });
  });

  it("carries the sale as the engine sells, and the cash to equity row solves to the model's levered IRR", () => {
    expect(a.sale.year).toBe(uw.holdYears);
    expect(a.sale.gross - a.sale.costs - a.sale.loanPayoff).toBeCloseTo(a.sale.net, 6);
    expect(a.toEquity[0]).toBeCloseTo(-a.equity, 6);
    const last = a.years[a.years.length - 1];
    expect(a.toEquity[a.toEquity.length - 1]).toBeCloseTo(last.cashAfterDebt + a.sale.net, 6);
    expect(irr(a.toEquity)).toBeCloseTo(uw.returns.leveredIrrPct!, 9);
  });

  it("rides on the base case the report prints, with what grows each year and its source", () => {
    const b = buildBaseCase(derived.inputs, derived.sources);
    expect(b.annual!.years[0].noi).toBe(b.noiY1);
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
