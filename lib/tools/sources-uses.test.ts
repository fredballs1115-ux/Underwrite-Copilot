import { describe, expect, it } from "vitest";
import { buildStack, type StackInputs, type StackLine } from "@/lib/tools/sources-uses";

// A $20M value-add: a $3M capital budget, 2% closing, a $500k reserve, and
// a $13M loan with a 1% origination fee.
const DEAL: StackInputs = {
  price: 20_000_000,
  capital: 3_000_000,
  closingPct: 2,
  closingAmount: null,
  reserve: 500_000,
  other: null,
  loan: 13_000_000,
  loanFeePct: 1,
};

const find = (lines: StackLine[], label: string) => lines.find((l) => l.label === label);

describe("buildStack — the two sides balance", () => {
  const s = buildStack(DEAL);

  it("totals the uses", () => {
    // 20,000,000 + 3,000,000 + 400,000 + 130,000 + 500,000
    expect(s.totalUses).toBe(24_030_000);
  });

  it("makes the equity the plug, so the sides always agree", () => {
    expect(s.equity).toBe(24_030_000 - 13_000_000);
    expect(s.totalSources).toBe(s.totalUses);
  });

  it("the cheque is much bigger than the price less the loan", () => {
    // $20M − $13M = $7M is the figure people carry in their heads. The
    // real cheque is $11.03M, and the gap is the whole point of the card.
    expect(s.equity!).toBeGreaterThan(20_000_000 - 13_000_000);
    expect(s.equity!).toBe(11_030_000);
  });

  it("quotes closing costs against the PRICE, never against total uses", () => {
    // 2% of $20M is $400,000. 2% of total uses would be $480,600 — and
    // quoting against a total that includes the costs themselves is
    // circular arithmetic.
    expect(find(s.uses, "Closing costs")!.amount).toBe(400_000);
  });

  it("treats the loan fee as a use funded at closing", () => {
    // 1% of the $13M loan. Netting it out of the proceeds instead would
    // understate BOTH the loan and the equity.
    expect(find(s.uses, "Loan fee")!.amount).toBe(130_000);
    expect(find(s.sources, "Debt")!.amount).toBe(13_000_000);
  });

  it("names the leverage both ways, because they are different numbers", () => {
    // 65% of the price, but only 54.1% of what the deal actually costs.
    expect(s.loanToPricePct).toBe(65);
    expect(s.loanToCostPct).toBe(54.1);
  });

  it("says how far above the price the basis really is", () => {
    // $4.03M of capital, closing, fee and reserve on a $20M price.
    expect(s.overPricePct).toBe(20.2);
  });

  it("gives every line its share of its own side", () => {
    const price = find(s.uses, "Purchase price")!;
    expect(price.sharePct).toBeCloseTo((20_000_000 / 24_030_000) * 100, 1);
    const shares = s.uses.reduce((t, l) => t + l.sharePct, 0);
    expect(shares).toBeCloseTo(100, 0);
    expect(s.sources.reduce((t, l) => t + l.sharePct, 0)).toBeCloseTo(100, 0);
  });
});

describe("buildStack — what it leaves out", () => {
  it("drops a line that is zero rather than printing it", () => {
    const s = buildStack({ ...DEAL, reserve: null, capital: null });
    expect(find(s.uses, "Reserves")).toBeUndefined();
    expect(find(s.uses, "Capital budget")).toBeUndefined();
    expect(find(s.uses, "Purchase price")).toBeDefined();
  });

  it("an all-cash deal has no debt line and no fee", () => {
    const s = buildStack({ ...DEAL, loan: null, loanFeePct: 1 });
    expect(find(s.sources, "Debt")).toBeUndefined();
    expect(find(s.uses, "Loan fee")).toBeUndefined();
    expect(s.equity).toBe(s.totalUses);
    expect(s.loanToCostPct).toBe(0);
  });

  it("a stated closing figure wins over the percent", () => {
    const s = buildStack({ ...DEAL, closingAmount: 275_000 });
    expect(find(s.uses, "Closing costs")!.amount).toBe(275_000);
  });

  it("no closing assumption at all means no closing line", () => {
    const s = buildStack({ ...DEAL, closingPct: null, closingAmount: null });
    expect(find(s.uses, "Closing costs")).toBeUndefined();
    expect(s.totalUses).toBe(24_030_000 - 400_000);
  });

  it("asks for the price rather than answering with zeroes", () => {
    const s = buildStack({ ...DEAL, price: null });
    expect(s.note).toMatch(/purchase price/);
    expect(s.uses).toEqual([]);
    expect(s.equity).toBeNull();
  });
});

describe("buildStack — an oversized loan is reported, not hidden", () => {
  const s = buildStack({ ...DEAL, loan: 30_000_000 });

  it("shows the equity as negative rather than clamping it to zero", () => {
    expect(s.equity!).toBeLessThan(0);
    expect(s.note).toMatch(/larger than everything the deal uses/);
  });

  it("still balances", () => {
    expect(s.totalSources).toBe(s.totalUses);
  });

  it("keeps the negative equity line's share signed", () => {
    // A negative equity must not render as a positive slice of the stack.
    expect(find(s.sources, "Equity")!.sharePct).toBeLessThan(0);
  });
});

describe("buildStack — a development", () => {
  it("reads land as the price and construction as the capital", () => {
    const s = buildStack({
      price: 4_000_000,
      capital: 38_000_000,
      closingPct: null,
      closingAmount: 250_000,
      reserve: 2_500_000,
      other: 900_000,
      loan: 27_000_000,
      loanFeePct: 1,
    });
    expect(s.totalUses).toBe(4_000_000 + 38_000_000 + 250_000 + 270_000 + 2_500_000 + 900_000);
    expect(s.equity).toBe(s.totalUses - 27_000_000);
    // Leverage against a land "price" is a meaningless 675%; against cost
    // it is the figure a construction lender actually quotes.
    expect(s.loanToPricePct).toBe(675);
    expect(s.loanToCostPct).toBeGreaterThan(55);
    expect(s.loanToCostPct).toBeLessThan(60);
  });
});
