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
    expect(r.ownerNoi).toBe(1_296_000);
    expect(r.brokerNoi! - r.totalAnnual!).toBe(r.ownerNoi);
  });

  it("drops a line that is nothing rather than printing a zero row", () => {
    const r = run({ reservePerSf: null, otherAnnual: null });
    expect(r.lines.map((l) => l.label)).toEqual(["Tenant improvements & commissions"]);
  });
});

describe("rule 2 — leasing capital is a run rate, not an invoice", () => {
  it("is the space that rolls in a year times what a foot of it costs", () => {
    // 40,000 feet rolling a year at $32.35 blended ($18 renewing, $59 new,
    // 65/35). The first version divided this by the five-year term as well
    // and printed $258,800 — a fifth of the cost, because a 20% roll IS the
    // five-year term said as a share, and dividing by the term again counted
    // it twice.
    const r = run();
    const line = r.lines.find((l) => l.label.startsWith("Tenant improvements"))!;
    expect(line.amount).toBe(1_294_000);
    expect(line.amount).toBe(Math.round(200_000 * 0.2 * (18 * 0.65 + 59 * 0.35)));
    expect(line.amount).not.toBe(258_800);
  });

  it("is the whole building's invoice over the term, said the other way round", () => {
    // Five-year leases re-lease a fifth of the building a year: the year's
    // roll at its cost a foot equals every foot's cost spread over five
    // years. Ten-year leases roll a tenth, and the cost a year halves.
    const blended = 18 * 0.65 + 59 * 0.35;
    expect(run().lines[1].amount).toBe(Math.round((200_000 * blended) / 5));
    expect(run({ annualRolloverPct: 10 }).lines[1].amount).toBe(
      Math.round((200_000 * blended) / 10),
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
});

describe("rule 3 — the renewal mix is an assumption", () => {
  it("reports both ends of it, not just the blend", () => {
    const r = run();
    expect(r.leasingIfAllRenew).toBe(720_000);
    expect(r.leasingIfNoneRenew).toBe(2_360_000);
  });

  it("is a 3.3× range on the largest line, driven by nothing but a guess", () => {
    const r = run();
    expect(r.leasingIfNoneRenew! / r.leasingIfAllRenew!).toBeCloseTo(3.28, 1);
    expect(r.lines[1].amount).toBeGreaterThan(r.leasingIfAllRenew!);
    expect(r.lines[1].amount).toBeLessThan(r.leasingIfNoneRenew!);
  });

  it("lands exactly on the renewal end when everybody stays", () => {
    expect(run({ renewalProbabilityPct: 100 }).lines[1].amount).toBe(720_000);
  });

  it("lands exactly on the new-lease end when nobody does", () => {
    expect(run({ renewalProbabilityPct: 0 }).lines[1].amount).toBe(2_360_000);
  });

  it("blends at half and half when the caller does not say", () => {
    const r = run({ renewalProbabilityPct: null });
    expect(r.lines[1].amount).toBe(Math.round((720_000 + 2_360_000) / 2));
  });

  it("refuses a probability outside 0 to 100 rather than extrapolating", () => {
    expect(run({ renewalProbabilityPct: 140 }).lines[1].amount).toBe(720_000);
    expect(run({ renewalProbabilityPct: -20 }).lines[1].amount).toBe(2_360_000);
  });
});

describe("rule 4 — the cost is said as a price", () => {
  it("prices the two caps", () => {
    const r = run();
    // The leasing line counted once is $1,294,000 a year, and the owner's cap
    // is 2.70% — 280bp under the cover's. (4.86% and 64bp, with the line
    // divided by the term twice.)
    expect(r.brokerCapPct).toBe(5.5);
    expect(r.ownerCapPct).toBe(2.7);
    expect(r.capGapBps).toBe(280);
  });

  it("capitalises the line at the ADVERTISED cap — the seller's own rate", () => {
    // $1,344,000 a year at 5.50%: half the asking price. ($5,614,545 when
    // the leasing line was divided by the term twice.)
    expect(run().valueOfTheLine).toBe(24_436_364);
  });

  it("says the same thing as a bid", () => {
    expect(run().priceForAdvertisedCap).toBe(23_563_636);
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
    expect(r.totalAnnual).toBe(1_344_000);
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
    expect(r.ownerNoi).toBe(-200_000 - 1_344_000);
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

describe("the note says its dollars the way the card does", () => {
  it("puts the dollar sign on the figure it prints with no price to set it against", () => {
    // It printed "308,800 a year sits below the line" — the one figure on
    // the card without its sign. Nothing rolls here, so the figure is the
    // reserve and the other line alone: $50,000 + $40,000.
    const r = run({ priceUsd: null, annualRolloverPct: 0, otherAnnual: 40_000 });
    expect(r.note).toBe(
      "$90,000 a year sits below the line. Enter a price to see what it is worth.",
    );
  });
});
