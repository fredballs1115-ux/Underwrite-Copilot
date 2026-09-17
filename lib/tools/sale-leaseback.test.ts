import { describe, it, expect } from "vitest";
import { readLeaseback, MAX_TERM, type SaleLeasebackInput } from "@/lib/tools/sale-leaseback";

/**
 * A 180,000-foot distribution building. The operator sells it and signs a
 * twenty-year lease back at $9 on space that lets for $7.50, with 2% annual
 * steps. The covenant is good enough to trade at a 6.00% cap where the real
 * estate itself trades at 6.25%.
 *
 * Every number in it is ordinary. Both sides still price it wrong, and in
 * the same direction.
 */
const SEED: SaleLeasebackInput = {
  buildingSf: 180_000,
  marketRentPerSf: 7.5,
  contractRentPerSf: 9,
  termYears: 20,
  escalationPct: 2,
  creditCapPct: 6,
  marketCapPct: 6.25,
  discountRatePct: 8,
  sellingCostPct: 1.5,
  mortgageRatePct: 6.5,
  mortgageAmortYears: 25,
  maxLtvPct: 60,
  minDscr: 1.3,
  minDebtYieldPct: 9,
};

const run = (over: Partial<SaleLeasebackInput> = {}) => readLeaseback({ ...SEED, ...over });

describe("rule 1 — the rent is the price lever", () => {
  it("prices the lease the seller wrote, at the cap its covenant earns", () => {
    const r = run();
    expect(r.contractNoi).toBe(1_620_000);
    expect(r.marketNoi).toBe(1_350_000);
    expect(r.rentPremiumPct).toBe(20);
    expect(r.price).toBe(27_000_000);
    expect(r.marketValue).toBe(21_600_000);
  });

  it("names the part of the price that is the lease rather than the building", () => {
    // $5.4M — a quarter of the building's value, raised by writing a lease.
    expect(run().pricePremium).toBe(5_400_000);
  });

  it("moves the price dollar for dollar with the rent, over the cap", () => {
    // The lever, asserted: a dollar more rent a foot is 180,000 dollars of
    // NOI, which at a 6% cap is exactly $3,000,000 of price.
    const a = run();
    const b = run({ contractRentPerSf: 10 });
    expect(b.price! - a.price!).toBe(3_000_000);
  });

  it("has no premium to report when the contract rent is at market", () => {
    const r = run({ contractRentPerSf: 7.5, creditCapPct: 6.25 });
    expect(r.rentPremiumPct).toBe(0);
    expect(r.pricePremium).toBe(0);
    expect(r.note).toContain("ordinary sale with an ordinary tenant");
  });

  it("reports a below-market lease as the buyer's gain, not the seller's", () => {
    const r = run({ contractRentPerSf: 6 });
    expect(r.rentPremiumPct).toBe(-20);
    expect(r.pricePremium).toBe(-3_600_000);
    expect(r.note).toContain("a building worth more than the lease it carries");
  });
});

describe("rule 2 — an above-market lease reverts to market", () => {
  it("values the term and the reversion, not the contract rent forever", () => {
    const r = run();
    expect(r.termValue).toBe(18_392_202);
    expect(r.reversionValue).toBe(4_634_241);
    expect(r.honestValue).toBe(23_026_443);
  });

  it("prices what capitalising the contract rent overpays", () => {
    // $3,973,557 — 14.7% of the price, and the figure a buyer running the
    // contract NOI over a cap rate has not priced at all.
    const r = run();
    expect(r.overpayment).toBe(3_973_557);
    expect(r.overpaymentPct).toBe(14.7);
    expect(r.note).toBe(
      "The rent reverts at year 20, and the building does not — which is $3,973,557 of the price, 14.7% of it.",
    );
  });

  it("costs MORE on a short lease, because the reversion arrives sooner", () => {
    // The direction people get backwards: a long above-market lease is
    // worth more, not less, because the market rent is further away.
    const short = run({ termYears: 5 });
    expect(short.overpayment!).toBeGreaterThan(run().overpayment!);
    expect(short.reversionValue!).toBeGreaterThan(run().reversionValue!);
  });

  it("is one model with the market value — the identity that proves it", () => {
    // Strip the premium out and discount at the market cap, and the two
    // pieces come back to the market value to the dollar. Anything else
    // would mean the reversion and the term were priced differently.
    const r = run({
      contractRentPerSf: 7.5,
      creditCapPct: 6.25,
      discountRatePct: 6.25,
      escalationPct: 0,
      termYears: 30,
    });
    expect(Math.abs(r.honestValue! - r.marketValue!)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.overpayment!)).toBeLessThanOrEqual(1);
  });

  it("does not call a discount-rate assumption a reversion cost", () => {
    // With the contract rent AT market and the discount rate above the
    // market cap, `overpayment` is still positive — the two inputs disagree
    // about what the building yields. That is an artifact, not a finding,
    // and the first draft of the note called it one.
    const r = run({ contractRentPerSf: 7.5, creditCapPct: 6.25 });
    expect(r.overpayment!).toBeGreaterThan(0);
    expect(r.note).not.toContain("reverts at year");
  });
});

describe("rule 3 — the credit is the cap rate", () => {
  it("prices the same building 250bp apart on the covenant behind it", () => {
    const strong = run({ creditCapPct: 6 });
    const weak = run({ creditCapPct: 8.5 });
    expect(strong.price).toBe(27_000_000);
    expect(weak.price).toBe(19_058_824);
    // …and the weak covenant pays LESS than the building is worth.
    expect(weak.price!).toBeLessThan(weak.marketValue!);
  });

  it("keeps the two caps apart rather than taking one for both", () => {
    // The real estate cap moves the market value and nothing else; the
    // credit cap moves the price and nothing else.
    const r = run({ marketCapPct: 7 });
    expect(r.price).toBe(run().price);
    expect(r.marketValue).not.toBe(run().marketValue);
  });

  it("refuses to run on one cap alone", () => {
    expect(run({ creditCapPct: 0 }).price).toBeNull();
    expect(run({ marketCapPct: 0 }).note).toContain("the tenant's credit prices one");
  });
});

describe("rule 4 — it looks cheaper than a mortgage and is not", () => {
  it("raises twice what the building would carry as a loan", () => {
    const r = run();
    expect(r.cashRaised).toBe(26_595_000);
    expect(r.mortgageProceeds).toBe(12_816_579);
    expect(r.mortgageBindingTest).toBe("Debt service coverage");
    expect(r.extraRaised).toBe(13_778_421);
  });

  it("costs less than the coupon in year one", () => {
    // 6.09 cents against a 6.50% coupon. This is the comparison that sells
    // the structure, and it is true for exactly four years.
    const r = run();
    expect(r.rentPerDollarRaised).toBe(6.09);
    expect(r.rentPerDollarRaised!).toBeLessThan(SEED.mortgageRatePct!);
  });

  it("passes the coupon in year five and keeps going", () => {
    const r = run();
    expect(r.yearRentPassesCoupon).toBe(5);
    expect(r.rentPerDollarAtTermEnd).toBe(8.87);
  });

  it("never passes it when the rent does not escalate", () => {
    const r = run({ escalationPct: 0 });
    expect(r.yearRentPassesCoupon).toBeNull();
    expect(r.rentPerDollarAtTermEnd).toBe(r.rentPerDollarRaised);
  });

  it("reports the loan's constant beside the coupon, never instead of it", () => {
    // The constant is 8.10% and includes the principal it repays. Setting a
    // pure-cost rent against it would make every leaseback look cheap, which
    // is `capital-stack`'s rule — amortisation is a transfer, not a cost.
    const r = run();
    expect(r.mortgageConstantPct).toBe(8.1);
    expect(r.mortgageConstantPct!).toBeGreaterThan(SEED.mortgageRatePct!);
    expect(r.mortgageAnnualCost).toBe(1_038_462);
  });

  it("says nothing about a mortgage that was not described", () => {
    const r = run({
      mortgageRatePct: null,
      mortgageAmortYears: null,
      maxLtvPct: null,
      minDscr: null,
      minDebtYieldPct: null,
    });
    expect(r.mortgageProceeds).toBeNull();
    expect(r.mortgageConstantPct).toBeNull();
    expect(r.yearRentPassesCoupon).toBeNull();
    expect(r.extraRaised).toBeNull();
    // …and the leaseback's own side still answers.
    expect(r.cashRaised).toBe(26_595_000);
  });

  it("takes the cost of selling off the cash raised", () => {
    expect(run({ sellingCostPct: 0 }).cashRaised).toBe(27_000_000);
    expect(run().cashRaised).toBe(Math.round(27_000_000 * 0.985));
  });
});

describe("what it refuses", () => {
  it("answers with a prompt without a size or either rent", () => {
    expect(run({ buildingSf: 0 }).note).toContain("the rent the seller proposes to pay");
    expect(run({ marketRentPerSf: 0 }).price).toBeNull();
    expect(run({ contractRentPerSf: 0 }).price).toBeNull();
  });

  it("refuses a term it cannot run", () => {
    expect(run({ termYears: 0 }).note).toContain(`between one and ${MAX_TERM} years`);
    expect(MAX_TERM).toBe(50);
  });

  it("holds a very long term to the limit rather than refusing it", () => {
    const r = run({ termYears: 200 });
    expect(r.price).toBe(27_000_000);
    expect(r.note).toContain("reverts at year 50");
  });

  it("discounts at the market cap when no discount rate is given", () => {
    const r = run({ discountRatePct: null });
    const explicit = run({ discountRatePct: SEED.marketCapPct });
    expect(r.honestValue).toBe(explicit.honestValue);
  });
});
