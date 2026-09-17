import { describe, it, expect } from "vitest";
import { readEgi, type EgiInput } from "@/lib/tools/economic-occupancy";

/**
 * A 200-unit building at $1,850 market rent, 95% leased — the figure that
 * would be on the cover of its memorandum — and every ordinary thing that
 * stands between that and the bank. None of the deductions here is
 * unusual; the point is what they add up to.
 */
const SEED: EgiInput = {
  units: 200,
  marketRentPerUnit: 1850,
  physicalOccupancyPct: 95,
  lossToLeasePct: 3.5,
  concessionsPct: 1.5,
  nonRevenueUnits: 3,
  badDebtPct: 1.2,
  otherIncomeAnnual: 310_000,
  opexAnnual: 1_950_000,
  priceUsd: 52_000_000,
};

const run = (over: Partial<EgiInput> = {}) => readEgi({ ...SEED, ...over });

describe("rule 1 — doors against dollars", () => {
  it("echoes the cover page's figure and computes the other one", () => {
    const r = run();
    expect(r.physicalOccupancyPct).toBe(95);
    expect(r.economicOccupancyPct).toBe(87.3);
  });

  it("names the gap, which is the whole finding", () => {
    expect(run().gapPoints).toBe(7.7);
  });

  it("is the gap that is left once the empty units are already counted", () => {
    // Physical occupancy has taken the vacancy off. So the gap is exactly
    // everything ELSE, and this pins that identity rather than a number.
    const r = run();
    const notVacancy = r.lines
      .filter((l) => l.label !== "Vacancy")
      .reduce((a, l) => a + l.amount, 0);
    expect(Math.round((notVacancy / r.gpr!) * 1000) / 10).toBe(r.gapPoints);
  });

  it("closes the gap to nothing when nothing but the doors is wrong", () => {
    const r = run({
      lossToLeasePct: null,
      concessionsPct: null,
      nonRevenueUnits: null,
      badDebtPct: null,
    });
    expect(r.economicOccupancyPct).toBe(95);
    expect(r.gapPoints).toBe(0);
    expect(r.note).toContain("beyond the empty units");
  });

  it("says what one full unit actually banks, against what the market pays", () => {
    // $1,700.05 against a $1,850 market rent — the figure to set beside a
    // comp's quoted rent, and never the one a memorandum prints.
    const r = run();
    expect(r.collectedRentPerUnit).toBe(1700.05);
    expect(r.marketRentPerUnit).toBe(1850);
  });

  it("divides that by the OCCUPIED doors, not all of them", () => {
    // An empty unit is already in the vacancy line; charging it again here
    // would understate what a sitting tenant pays.
    const r = run();
    expect(r.collectedRentPerUnit).toBeCloseTo(r.netRentalIncome! / (200 * 0.95) / 12, 2);
  });
});

describe("rule 2 — the denominator is market rent", () => {
  it("builds gross potential rent from the market rent and every door", () => {
    expect(run().gpr).toBe(200 * 1850 * 12);
  });

  it("would print a far kinder figure if loss to lease sat in the denominator", () => {
    // The error this rule exists for, priced. Dividing collections by the
    // rents currently CHARGED makes loss to lease vanish — it is in the
    // denominator — so the same building reads 90.8% instead of 87.3%.
    const r = run();
    const chargedRent = r.gpr! * (1 - 0.035);
    const wrong = Math.round((r.netRentalIncome! / chargedRent) * 1000) / 10;
    expect(wrong).toBe(90.5);
    expect(wrong).toBeGreaterThan(r.economicOccupancyPct!);
  });
});

describe("rule 3 — loss to lease is not a collections problem", () => {
  it("files it apart from bad debt", () => {
    const r = run();
    expect(r.lines.find((l) => l.label === "Loss to lease")!.kind).toBe("below-market");
    expect(r.lines.find((l) => l.label === "Bad debt")!.kind).toBe("leakage");
  });

  it("says so in the note when it is the largest line in the gap", () => {
    const r = run();
    expect(r.note).toContain("Loss to lease is the largest part");
    expect(r.note).toContain("closes as leases roll");
    expect(r.note).not.toContain("does not close by itself");
  });

  it("gives the opposite instruction when the largest line is bad debt", () => {
    const r = run({ lossToLeasePct: 0.5, badDebtPct: 4 });
    expect(r.note).toContain("Bad debt is the largest part");
    expect(r.note).toContain("does not close by itself");
  });

  it("names a plurality as a share rather than calling it 'most'", () => {
    // 45% is the largest share and not a majority, and the note says 45%
    // rather than claiming most of the gap.
    expect(run().note).toContain("45% of it");
  });
});

describe("rule 4 — a concession is a decision, bad debt is not", () => {
  it("keeps them as separate lines with separate kinds", () => {
    const r = run();
    expect(r.lines.find((l) => l.label === "Concessions")!.kind).toBe("concession");
    expect(r.lines.find((l) => l.label === "Bad debt")!.kind).toBe("leakage");
  });

  it("gives non-revenue units their own line, because the cover counts them as full", () => {
    // Three model / employee units in a 200-unit building. They are
    // physically occupied — the 95% includes them — and they pay nothing.
    const r = run();
    const line = r.lines.find((l) => l.label === "Non-revenue units")!;
    expect(line.amount).toBe(3 * 1850 * 12);
    expect(line.pctOfGpr).toBe(1.5);
  });

  it("drops a line that is nothing rather than printing a zero row", () => {
    const r = run({ concessionsPct: null, nonRevenueUnits: 0 });
    expect(r.lines.map((l) => l.label)).toEqual(["Vacancy", "Loss to lease", "Bad debt"]);
  });
});

describe("rule 5 — other income stays out of the ratio", () => {
  it("puts it in EGI", () => {
    const r = run();
    expect(r.otherIncome).toBe(310_000);
    expect(r.egi).toBe(r.netRentalIncome! + 310_000);
  });

  it("and keeps it out of the occupancy figure entirely", () => {
    const withMore = run({ otherIncomeAnnual: 900_000 });
    expect(withMore.economicOccupancyPct).toBe(run().economicOccupancyPct);
  });

  it("never prints above 100%, which counting it would", () => {
    // A full building with large other income. Put the fees in the
    // numerator and this reads 117%; the rule keeps it at 100.
    const r = run({
      physicalOccupancyPct: 100,
      lossToLeasePct: null,
      concessionsPct: null,
      nonRevenueUnits: null,
      badDebtPct: null,
      otherIncomeAnnual: 750_000,
    });
    expect(r.economicOccupancyPct).toBe(100);
    expect((r.netRentalIncome! + r.otherIncome) / r.gpr!).toBeGreaterThan(1);
  });
});

describe("what the gap costs", () => {
  it("prices the naive underwrite — vacancy off the top and nothing else", () => {
    const r = run();
    expect(r.capIfVacancyOnlyPct).toBe(4.96);
    expect(r.capPct).toBe(4.3);
  });

  it("says how many basis points that overstates the going-in cap by", () => {
    expect(run().capOverstatementBps).toBe(66);
  });

  it("is always the higher cap, which is why nobody questions it", () => {
    const r = run();
    expect(r.capIfVacancyOnlyPct!).toBeGreaterThan(r.capPct!);
    expect(r.capOverstatementBps!).toBeGreaterThan(0);
  });

  it("says the difference as a price at the deal's own cap", () => {
    expect(run().valueOfGap).toBe(7_950_698);
  });

  it("capitalises at the HONEST cap, not the advertised one", () => {
    // The NOI that exists is the NOI that supports a value, so the rate
    // that values the gap is the real cap — using the naive one would
    // understate what the gap costs.
    const r = run();
    const naiveNoi = Math.round(r.gpr! * 0.95 + r.otherIncome - 1_950_000);
    expect(r.valueOfGap).toBe(Math.round((naiveNoi - r.noi!) / (r.capPct! / 100)));
    expect(r.valueOfGap!).toBeGreaterThan(Math.round((naiveNoi - r.noi!) / (r.capIfVacancyOnlyPct! / 100)));
  });

  it("has no cap read without a price, and no NOI without expenses", () => {
    expect(run({ priceUsd: null }).capPct).toBeNull();
    expect(run({ priceUsd: null }).noi).not.toBeNull();
    expect(run({ opexAnnual: null }).noi).toBeNull();
    expect(run({ opexAnnual: null }).capPct).toBeNull();
    expect(run({ opexAnnual: null }).valueOfGap).toBeNull();
  });

  it("still builds the whole bridge with neither", () => {
    const r = run({ priceUsd: null, opexAnnual: null });
    expect(r.economicOccupancyPct).toBe(87.3);
    expect(r.egi).toBe(4_186_120);
  });
});

describe("what it refuses", () => {
  it("answers with a prompt on no units", () => {
    expect(readEgi({ ...SEED, units: 0 }).note).toContain("unit count");
    expect(readEgi({ ...SEED, units: 0 }).gpr).toBeNull();
  });

  it("refuses a market rent of nothing", () => {
    expect(readEgi({ ...SEED, marketRentPerUnit: 0 }).gpr).toBeNull();
  });

  it("refuses an occupancy that is not a percentage", () => {
    expect(readEgi({ ...SEED, physicalOccupancyPct: 105 }).note).toContain("0 to 100");
    expect(readEgi({ ...SEED, physicalOccupancyPct: -2 }).gpr).toBeNull();
  });

  it("treats a blank deduction as absent, never as zero-by-accident", () => {
    // A blank is null and a typed 0 is a claim, and both mean the line is
    // not drawn — but neither may ever become a negative deduction.
    const r = run({ lossToLeasePct: null, concessionsPct: -3, badDebtPct: undefined });
    expect(r.lines.some((l) => l.label === "Concessions")).toBe(false);
    expect(r.lines.every((l) => l.amount > 0)).toBe(true);
  });

  it("handles a building that is entirely empty rather than dividing by it", () => {
    const r = run({ physicalOccupancyPct: 0 });
    expect(r.economicOccupancyPct).toBeLessThanOrEqual(0);
    expect(r.collectedRentPerUnit).toBeNull();
    expect(Number.isFinite(r.egi!)).toBe(true);
  });

  it("keeps every line's percentage summing to what was deducted", () => {
    const r = run();
    const summed = r.lines.reduce((a, l) => a + l.amount, 0);
    expect(r.netRentalIncome).toBe(r.gpr! - summed);
  });
});
