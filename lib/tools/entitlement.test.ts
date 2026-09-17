import { describe, expect, it } from "vitest";
import {
  CERTAINTY_PCT,
  MAX_MONTHS,
  breakEvenFee,
  readEntitlement,
  type EntitlementTerms,
} from "./entitlement";

/**
 * A $6,000,000 site needing twenty-four months of rezoning. Worth
 * $4,200,000 as it stands and $9,500,000 approved, at 70% odds, with a
 * $300,000 option on the table.
 */
const SEED: EntitlementTerms = {
  landPrice: 6_000_000,
  asIsValue: 4_200_000,
  entitledValue: 9_500_000,
  months: 24,
  carryRatePct: 9,
  holdingCostsAnnual: 60_000,
  entitlementSpend: 450_000,
  approvalProbabilityPct: 70,
  optionFee: 300_000,
  feeApplicable: false,
};

describe("readEntitlement — rule 1, the carry nobody budgets", () => {
  it("is $1,248,600 over the seed's two years — 20.8% on top of the land", () => {
    const r = readEntitlement(SEED);
    expect(r.carryCost).toBe(1_248_600);
    expect(r.carryPerMonth).toBe(52_025);
    expect(r.carryAsPctOfLand).toBe(20.8);
  });

  it("compounds rather than running straight-line", () => {
    // Interest on land is capitalised into the basis, not paid out of an
    // income the site does not have. Two years at 9% is 18.81%, not 18%.
    const one = readEntitlement({ ...SEED, months: 12, holdingCostsAnnual: 0 });
    const two = readEntitlement({ ...SEED, months: 24, holdingCostsAnnual: 0 });
    expect(one.carryCost).toBe(540_000);
    expect(two.carryCost).toBe(1_128_600);
    expect(two.carryCost).toBeGreaterThan(one.carryCost! * 2);
  });

  it("so a month of delay costs more than the last one did", () => {
    const by = [6, 12, 24, 36, 48].map(
      (months) => readEntitlement({ ...SEED, months }).carryPerMonth!,
    );
    for (let i = 1; i < by.length; i += 1) expect(by[i]).toBeGreaterThan(by[i - 1]);
    expect(by).toEqual([49_031, 50_000, 52_025, 54_172, 56_448]);
  });

  it("and reads on its own, before any of the comparison is given", () => {
    const r = readEntitlement({ ...SEED, asIsValue: null, entitledValue: null });
    expect(r.carryCost).toBe(1_248_600);
    expect(r.breakEvenOptionFee).toBeNull();
    expect(r.note).toContain("there is no line for it in the budget");
  });

  it("no carry rate is no interest, never a guessed one", () => {
    // The holding costs remain: they are stated, the rate is not.
    expect(readEntitlement({ ...SEED, carryRatePct: null }).carryCost).toBe(120_000);
  });
});

describe("readEntitlement — rule 2, the option's closed form", () => {
  it("breaks even at $1,788,600 against a $300,000 quote", () => {
    const r = readEntitlement(SEED);
    expect(r.breakEvenOptionFee).toBe(1_788_600);
    expect(r.feeVsBreakEven).toBe(-1_488_600);
    expect(r.favours).toBe("option");
  });

  it("THE identity: where the land is worth what you paid, it is worth the carry", () => {
    // f* = (1 − p)(L − A) + C, so with L = A the first term vanishes at
    // every probability and the option is worth exactly the waiting.
    for (const approvalProbabilityPct of [0, 25, 50, 75, 100]) {
      const r = readEntitlement({
        ...SEED,
        asIsValue: SEED.landPrice,
        approvalProbabilityPct,
      });
      expect(r.breakEvenOptionFee, `at ${approvalProbabilityPct}%`).toBe(r.carryCost);
    }
  });

  it("and it falls as the approval gets likelier", () => {
    const by = [0, 20, 40, 60, 80, 100].map(
      (approvalProbabilityPct) =>
        readEntitlement({ ...SEED, approvalProbabilityPct }).breakEvenOptionFee!,
    );
    for (let i = 1; i < by.length; i += 1) expect(by[i]).toBeLessThan(by[i - 1]);
    expect(by).toEqual([3_048_600, 2_688_600, 2_328_600, 1_968_600, 1_608_600, 1_248_600]);
    // At certainty there is no land to be stuck with, so it is the carry.
    expect(by.at(-1)).toBe(readEntitlement(SEED).carryCost);
  });

  it("the two paths differ by exactly the fee's distance from break-even", () => {
    const r = readEntitlement(SEED);
    expect(r.expectedValueBuying).toBe(211_400);
    expect(r.expectedValueOptioning).toBe(1_700_000);
    // 1,700,000 − 211,400 = 1,488,600 = 1,788,600 − 300,000, to the dollar.
    // This is the identity the break-even is derived from, run the other way.
    expect(r.expectedValueOptioning! - r.expectedValueBuying!).toBe(-r.feeVsBreakEven!);
  });

  it("the entitlement spend falls on BOTH paths, so it cancels out of the fee", () => {
    // Consultants and engineers are paid by whoever pursues the approval,
    // option or no option. Charging them against the option is the same
    // error hold-or-sell prices on selling costs.
    const none = readEntitlement({ ...SEED, entitlementSpend: 0 });
    const heavy = readEntitlement({ ...SEED, entitlementSpend: 2_000_000 });
    expect(heavy.breakEvenOptionFee).toBe(none.breakEvenOptionFee);
    expect(none.expectedValueBuying! - heavy.expectedValueBuying!).toBe(
      none.expectedValueOptioning! - heavy.expectedValueOptioning!,
    );
    expect(heavy.entitlementSpend).toBe(2_000_000);
  });

  it("buying below the as-is value makes refusal survivable, and the option worth less", () => {
    // Land bought under what it is worth un-entitled: a refusal is a gain
    // on the dirt, so there is less to insure against than the carry.
    const r = readEntitlement({ ...SEED, asIsValue: 8_000_000 });
    expect(r.breakEvenOptionFee).toBe(648_600);
    expect(r.breakEvenOptionFee).toBeLessThan(r.carryCost!);
  });
});

describe("readEntitlement — rule 3, a probability rather than a contingency", () => {
  it("shows both branches and the expectation between them", () => {
    const r = readEntitlement(SEED);
    expect(r.valueIfApproved).toBe(1_801_400);
    expect(r.valueIfRefused).toBe(-3_498_600);
    expect(r.expectedValueBuying).toBe(211_400);
    // The deck shows $1,801,400. The expectation is $1,590,000 below it,
    // which no contingency percentage describes.
    expect(r.expectedVsApproved).toBe(-1_590_000);
  });

  it("and inverts to the question actually being asked", () => {
    // With almost no carry the crossing exists: at a $300,000 fee you
    // would need to be 90% sure before owning beats optioning.
    const r = readEntitlement({ ...SEED, carryRatePct: null });
    expect(r.carryCost).toBe(120_000);
    expect(r.breakEvenProbabilityPct).toBe(90);
    expect(r.note).toContain("90% sure of the approval");
  });

  it("a fee under the carry wins at EVERY probability, and says so", () => {
    // The crossing genuinely does not exist: the option costs less than
    // the waiting it replaces. Reporting only a null hid the reason land
    // gets optioned in the first place.
    const r = readEntitlement(SEED);
    expect(r.optionWinsAtAnyOdds).toBe(true);
    expect(r.breakEvenProbabilityPct).toBeNull();
    expect(readEntitlement({ ...SEED, approvalProbabilityPct: 100 }).favours).toBe("option");
    expect(r.note).toContain("the option wins at every probability");
  });

  it("but a fee above the carry does have one", () => {
    const r = readEntitlement({ ...SEED, optionFee: 1_500_000 });
    expect(r.optionWinsAtAnyOdds).toBe(false);
    expect(r.breakEvenProbabilityPct).toBe(86);
  });

  it("and a fee past break-even favours buying", () => {
    const r = readEntitlement({ ...SEED, optionFee: 2_500_000 });
    expect(r.favours).toBe("buy");
    expect(r.feeVsBreakEven).toBeGreaterThan(0);
  });

  it("no fee quoted names the gap instead", () => {
    const r = readEntitlement({ ...SEED, optionFee: null });
    expect(r.expectedValueOptioning).toBeNull();
    expect(r.favours).toBeNull();
    expect(r.breakEvenOptionFee).toBe(1_788_600);
    expect(r.note).toContain("A contingency percentage cannot describe a binary outcome");
  });
});

describe("readEntitlement — rule 4, one word on the term sheet", () => {
  it("an applicable fee's break-even is strictly larger", () => {
    const no = readEntitlement(SEED).breakEvenOptionFee!;
    const yes = readEntitlement({ ...SEED, feeApplicable: true }).breakEvenOptionFee!;
    expect(no).toBe(1_788_600);
    expect(yes).toBe(5_962_000);
    expect(yes).toBeGreaterThan(no);
  });

  it("and runs away as the approval nears certainty", () => {
    const by = [40, 70, 90, 95].map(
      (approvalProbabilityPct) =>
        readEntitlement({ ...SEED, approvalProbabilityPct, feeApplicable: true })
          .breakEvenOptionFee!,
    );
    for (let i = 1; i < by.length; i += 1) expect(by[i]).toBeGreaterThan(by[i - 1]);
    expect(by).toEqual([3_881_000, 5_962_000, 14_286_000, 26_772_000]);
  });

  it("at certainty it is refused rather than printed as an enormous number", () => {
    expect(CERTAINTY_PCT).toBe(99);
    const r = readEntitlement({ ...SEED, approvalProbabilityPct: 99, feeApplicable: true });
    expect(r.applicableAtCertainty).toBe(true);
    expect(r.note).toContain("applicable and therefore free");
    expect(r.note).toContain("not something a seller grants");
    expect(breakEvenFee(6_000_000, 4_200_000, 1_184_000, 100, true)).toBeNull();
  });

  it("the raw solve matches the formulas both ways", () => {
    // f* = (1 − p)(L − A) + C
    expect(breakEvenFee(6_000_000, 4_200_000, 1_184_000, 0, false)).toBe(2_984_000);
    expect(breakEvenFee(6_000_000, 4_200_000, 1_184_000, 100, false)).toBe(1_184_000);
    // f* = (L − A) + C / (1 − p)
    expect(breakEvenFee(6_000_000, 4_200_000, 1_184_000, 50, true)).toBe(1_800_000 + 2_368_000);
    // A probability outside the range is clamped, never propagated.
    expect(breakEvenFee(6_000_000, 4_200_000, 1_184_000, 150, false)).toBe(1_184_000);
    expect(breakEvenFee(6_000_000, 4_200_000, 1_184_000, -50, false)).toBe(2_984_000);
  });

  it("an applicable fee is worth more in hand, so the option reads better", () => {
    const no = readEntitlement(SEED).expectedValueOptioning!;
    const yes = readEntitlement({ ...SEED, feeApplicable: true }).expectedValueOptioning!;
    // 70% of a $300,000 fee comes back: $210,000.
    expect(yes - no).toBe(210_000);
  });
});

describe("readEntitlement — the site that does not work", () => {
  it("says so rather than picking the path that loses less", () => {
    const r = readEntitlement({ ...SEED, entitledValue: 3_000_000 });
    expect(r.deadEvenApproved).toBe(true);
    expect(r.note).toContain("Even WITH the approval");
    expect(r.note).toContain("it is a price problem");
    // The comparison is still computed — it is the note that refuses to
    // lead with an answer to the wrong question.
    expect(r.breakEvenOptionFee).toBe(1_788_600);
  });

  it("and a site that clears is not flagged", () => {
    expect(readEntitlement(SEED).deadEvenApproved).toBe(false);
  });
});

describe("readEntitlement — refusals and blanks", () => {
  it("names the missing land price", () => {
    expect(readEntitlement({ ...SEED, landPrice: null }).note).toContain("Give the land price");
  });

  it("names the missing period — that period is the whole cost", () => {
    expect(readEntitlement({ ...SEED, months: null }).note).toContain(
      "months the entitlement takes",
    );
  });

  it("refuses a period that is a typo", () => {
    expect(MAX_MONTHS).toBe(120);
    const r = readEntitlement({ ...SEED, months: 200 });
    expect(r.note).toContain("a typo rather than an entitlement");
    expect(r.carryCost).toBeNull();
  });

  it("a blank is null, never zero", () => {
    const r = readEntitlement({ ...SEED, asIsValue: null });
    expect(r.breakEvenOptionFee).toBeNull();
    expect(r.expectedValueBuying).toBeNull();
    expect(r.favours).toBeNull();
    // The carry still reads: it does not need the comparison.
    expect(r.carryCost).toBe(1_248_600);
  });

  it("clamps a probability rather than propagating it", () => {
    expect(readEntitlement({ ...SEED, approvalProbabilityPct: 150 }).breakEvenOptionFee).toBe(
      readEntitlement({ ...SEED, approvalProbabilityPct: 100 }).breakEvenOptionFee,
    );
    expect(readEntitlement({ ...SEED, approvalProbabilityPct: -20 }).breakEvenOptionFee).toBe(
      readEntitlement({ ...SEED, approvalProbabilityPct: 0 }).breakEvenOptionFee,
    );
  });

  it("every figure is finite, at every edge", () => {
    const edges: EntitlementTerms[] = [
      SEED,
      { ...SEED, carryRatePct: 200 },
      { ...SEED, carryRatePct: -50 },
      { ...SEED, months: MAX_MONTHS },
      { ...SEED, months: 1 },
      { ...SEED, landPrice: 1 },
      { ...SEED, asIsValue: 0 },
      { ...SEED, entitledValue: 0 },
      { ...SEED, optionFee: 0 },
      { ...SEED, optionFee: 99_000_000 },
      { ...SEED, approvalProbabilityPct: 0, feeApplicable: true },
      { ...SEED, approvalProbabilityPct: 100, feeApplicable: true },
      { ...SEED, holdingCostsAnnual: null, entitlementSpend: null },
    ];
    for (const t of edges) {
      const r = readEntitlement(t);
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "number") {
          expect(Number.isFinite(v), `${k} is not finite`).toBe(true);
          expect(Object.is(v, -0), `${k} is negative zero`).toBe(false);
        }
      }
      expect(r.note.length).toBeGreaterThan(0);
    }
  });
});
