import { describe, it, expect } from "vitest";
import { readBelow, type BelowInput } from "@/lib/tools/below-the-line";

/**
 * A 200,000-foot office building offered at $48M on a stated $2.64M of NOI
 * — a 5.50% cap on the cover. Twenty per cent of the space rolls in an
 * average year on five-year leases, and re-tenanting it costs $59 a foot
 * new or $18 on a renewal.
 *
 * Every figure here is ordinary. Nothing is padding, and the memorandum is
 * not lying: it is using a definition of NOI that the buyer will not.
 */
const SEED: BelowInput = {
  brokerNoi: 2_640_000,
  buildingSf: 200_000,
  priceUsd: 48_000_000,
  reservePerSf: 0.25,
  annualRolloverPct: 20,
  leaseTermYears: 5,
  newTiPerSf: 45,
  renewalTiPerSf: 12,
  newLcPerSf: 14,
  renewalLcPerSf: 6,
  renewalProbabilityPct: 65,
  otherAnnual: 0,
};

const run = (over: Partial<BelowInput> = {}) => readBelow({ ...SEED, ...over });

describe("rule 1 — capital that recurs is an expense", () => {
  it("takes the reserve off the NOI at its per-foot rate", () => {
    const r = run();
    const line = r.lines.find((l) => l.label === "Replacement reserve")!;
    expect(line.amount).toBe(50_000);
    expect(line.perSf).toBe(0.25);
  });

  it("leaves the stated NOI alone and reports the other one beside it", () => {
    const r = run();
    expect(r.brokerNoi).toBe(2_640_000);
    expect(r.ownerNoi).toBe(2_331_200);
    expect(r.brokerNoi! - r.totalAnnual!).toBe(r.ownerNoi);
  });

  it("drops a line that is nothing rather than printing a zero row", () => {
    const r = run({ reservePerSf: null, otherAnnual: null });
    expect(r.lines.map((l) => l.label)).toEqual(["Tenant improvements & commissions"]);
  });
});

describe("rule 2 — leasing capital is a run rate, not an invoice", () => {
  it("spreads the cost of re-leasing over the term it buys", () => {
    // 40,000 feet rolling a year, $29.10 blended, over five years.
    const r = run();
    const line = r.lines.find((l) => l.label.startsWith("Tenant improvements"))!;
    expect(line.amount).toBe(258_800);
    expect(line.amount).toBe(Math.round((200_000 * 0.2 * (18 * 0.65 + 59 * 0.35)) / 5));
  });

  it("costs less a year on a longer lease, because it buys more years", () => {
    expect(run({ leaseTermYears: 10 }).lines[1].amount).toBe(
      Math.round(run({ leaseTermYears: 5 }).lines[1].amount / 2),
    );
  });

  it("costs more on a building that rolls faster", () => {
    expect(run({ annualRolloverPct: 40 }).lines[1].amount).toBe(
      run({ annualRolloverPct: 20 }).lines[1].amount * 2,
    );
  });

  it("is nothing at all on a building that never rolls", () => {
    const r = run({ annualRolloverPct: 0 });
    expect(r.lines.map((l) => l.label)).toEqual(["Replacement reserve"]);
    expect(r.leasingIfAllRenew).toBe(0);
  });

  it("does not divide by a term of nothing", () => {
    // A missing term falls to one year rather than infinity — the cost is
    // due at once, which is the conservative reading and a finite number.
    const r = run({ leaseTermYears: null });
    expect(Number.isFinite(r.lines[1].amount)).toBe(true);
    expect(r.lines[1].amount).toBe(run({ leaseTermYears: 1 }).lines[1].amount);
  });
});

describe("rule 3 — the renewal mix is an assumption", () => {
  it("reports both ends of it, not just the blend", () => {
    const r = run();
    expect(r.leasingIfAllRenew).toBe(144_000);
    expect(r.leasingIfNoneRenew).toBe(472_000);
  });

  it("is a 3.3× range on the largest line, driven by nothing but a guess", () => {
    const r = run();
    expect(r.leasingIfNoneRenew! / r.leasingIfAllRenew!).toBeCloseTo(3.28, 1);
    expect(r.lines[1].amount).toBeGreaterThan(r.leasingIfAllRenew!);
    expect(r.lines[1].amount).toBeLessThan(r.leasingIfNoneRenew!);
  });

  it("lands exactly on the renewal end when everybody stays", () => {
    expect(run({ renewalProbabilityPct: 100 }).lines[1].amount).toBe(144_000);
  });

  it("lands exactly on the new-lease end when nobody does", () => {
    expect(run({ renewalProbabilityPct: 0 }).lines[1].amount).toBe(472_000);
  });

  it("blends at half and half when the caller does not say", () => {
    const r = run({ renewalProbabilityPct: null });
    expect(r.lines[1].amount).toBe(Math.round((144_000 + 472_000) / 2));
  });

  it("refuses a probability outside 0 to 100 rather than extrapolating", () => {
    expect(run({ renewalProbabilityPct: 140 }).lines[1].amount).toBe(144_000);
    expect(run({ renewalProbabilityPct: -20 }).lines[1].amount).toBe(472_000);
  });
});

describe("rule 4 — the cost is said as a price", () => {
  it("prices the two caps", () => {
    const r = run();
    expect(r.brokerCapPct).toBe(5.5);
    expect(r.ownerCapPct).toBe(4.86);
    expect(r.capGapBps).toBe(64);
  });

  it("capitalises the line at the ADVERTISED cap — the seller's own rate", () => {
    expect(run().valueOfTheLine).toBe(5_614_545);
  });

  it("says the same thing as a bid", () => {
    expect(run().priceForAdvertisedCap).toBe(42_385_455);
  });

  it("is one number said two ways, to the dollar", () => {
    // The identity the card exists to make checkable: what the omission is
    // worth IS the ask less the price at which the real NOI earns the
    // advertised cap.
    const r = run();
    expect(r.valueOfTheLine).toBe(48_000_000 - r.priceForAdvertisedCap!);
  });

  it("has no cap read and no price without an asking price", () => {
    const r = run({ priceUsd: null });
    expect(r.brokerCapPct).toBeNull();
    expect(r.ownerCapPct).toBeNull();
    expect(r.capGapBps).toBeNull();
    expect(r.valueOfTheLine).toBeNull();
    expect(r.priceForAdvertisedCap).toBeNull();
  });

  it("still builds the lines without one, and says so", () => {
    const r = run({ priceUsd: null });
    expect(r.totalAnnual).toBe(308_800);
    expect(r.note).toContain("Enter a price");
  });
});

describe("what it refuses", () => {
  it("answers with a prompt without an NOI or a size", () => {
    expect(readBelow({ ...SEED, buildingSf: 0 }).lines).toEqual([]);
    expect(readBelow({ ...SEED, buildingSf: 0 }).note).toContain("the building's size");
  });

  it("runs a building whose NOI is stated as a loss rather than refusing it", () => {
    const r = run({ brokerNoi: -200_000 });
    expect(r.ownerNoi).toBe(-200_000 - 308_800);
    expect(r.ownerCapPct!).toBeLessThan(0);
  });

  it("never turns a negative input into a credit", () => {
    // A typed negative is not a rebate. Every line is a cost or it is absent.
    const r = run({ reservePerSf: -3, otherAnnual: -50_000, newTiPerSf: -10 });
    expect(r.lines.every((l) => l.amount > 0)).toBe(true);
    expect(r.totalAnnual!).toBeGreaterThan(0);
  });

  it("says nothing is below the line when nothing is", () => {
    const r = run({
      reservePerSf: null,
      annualRolloverPct: 0,
      otherAnnual: null,
    });
    expect(r.totalAnnual).toBe(0);
    expect(r.ownerNoi).toBe(r.brokerNoi);
    expect(r.valueOfTheLine).toBeNull();
    expect(r.note).toContain("the NOI you would own");
  });

  it("keeps the shares summing to the total they are taken from", () => {
    const r = run({ otherAnnual: 40_000 });
    expect(r.lines.reduce((a, l) => a + l.amount, 0)).toBe(r.totalAnnual);
    const shares = r.lines.reduce((a, l) => a + l.sharePct, 0);
    expect(Math.abs(shares - 100)).toBeLessThanOrEqual(0.2);
  });
});
