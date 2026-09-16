import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_LIFE,
  RESIDENTIAL_LIFE,
  readAfterTax,
  type AfterTaxTerms,
} from "./after-tax";

/** A $20M apartment building, a quarter of it land, held ten years. */
const SEED: AfterTaxTerms = {
  price: 20_000_000,
  landPct: 25,
  lifeYears: 27.5,
  costSegPct: 0,
  costSegLifeYears: 5,
  bonusPct: 0,
  noi: 1_200_000,
  interest: 845_000,
  holdYears: 10,
  salePrice: 26_000_000,
  ordinaryRatePct: 37,
  capGainsRatePct: 20,
  recaptureRatePct: 25,
};

const BLANK: AfterTaxTerms = {
  price: null,
  landPct: null,
  lifeYears: null,
  costSegPct: null,
  costSegLifeYears: null,
  bonusPct: null,
  noi: null,
  interest: null,
  holdYears: null,
  salePrice: null,
  ordinaryRatePct: null,
  capGainsRatePct: null,
  recaptureRatePct: null,
};

describe("readAfterTax — land is never depreciable", () => {
  it("takes the land out before anything else", () => {
    // $20M at 25% land is $15M of basis, not $20M.
    const r = readAfterTax(SEED);
    expect(r.depreciableBasis).toBe(15_000_000);
    expect(r.buildingBasis).toBe(15_000_000);
    expect(r.shortBasis).toBe(0);
  });

  it("a bigger land share is a smaller write-off, in proportion", () => {
    const low = readAfterTax({ ...SEED, landPct: 20 });
    const high = readAfterTax({ ...SEED, landPct: 40 });
    expect(low.depreciableBasis).toBe(16_000_000);
    expect(high.depreciableBasis).toBe(12_000_000);
    expect(high.yearOneDepreciation! < low.yearOneDepreciation!).toBe(true);
  });

  it("refuses a deal that is all land", () => {
    const r = readAfterTax({ ...SEED, landPct: 100 });
    expect(r.note).toContain("land is never depreciable");
    expect(r.depreciableBasis).toBeNull();
  });

  it("knows both schedules the code gives a building", () => {
    expect(RESIDENTIAL_LIFE).toBe(27.5);
    expect(COMMERCIAL_LIFE).toBe(39);
    const res = readAfterTax(SEED);
    const com = readAfterTax({ ...SEED, lifeYears: COMMERCIAL_LIFE });
    expect(res.yearOneDepreciation).toBe(545_455);
    expect(com.yearOneDepreciation).toBe(384_615);
  });
});

describe("readAfterTax — the shelter while you hold", () => {
  it("turns a profitable building into a paper loss", () => {
    // $1.2M of NOI, $845k of interest and $545k of depreciation is NEGATIVE
    // taxable income on a building that made money. That is the whole point
    // of the deduction and the reason the figure is worth printing.
    const r = readAfterTax(SEED);
    expect(r.yearOneTaxable).toBe(-190_455);
    expect(r.yearOneTax).toBe(-70_468);
  });

  it("reports the tax signed rather than floored at zero", () => {
    // A negative tax is the value of a loss set against other income, which
    // is what an owner with other income actually gets. Flooring it at zero
    // would hide the answer people come here for.
    expect(readAfterTax(SEED).yearOneTax!).toBeLessThan(0);
  });

  it("adds up every dollar written off over the hold", () => {
    const r = readAfterTax(SEED);
    expect(r.totalDepreciation).toBe(5_454_545);
    expect(r.shelterValue).toBe(2_018_182);
    expect(r.adjustedBasis).toBe(14_545_455);
  });

  it("never writes off more than there is", () => {
    // Held past the schedule, the building runs out of basis.
    const r = readAfterTax({ ...SEED, holdYears: 40, salePrice: 26_000_000 });
    expect(r.totalDepreciation).toBe(15_000_000);
    expect(r.adjustedBasis).toBe(5_000_000);
  });
});

describe("readAfterTax — the gain has three rates, not one", () => {
  it("splits the gain in the order the code fills it", () => {
    const r = readAfterTax(SEED);
    expect(r.totalGain).toBe(11_454_545);
    // No cost seg, so nothing recaptures at the ordinary rate.
    expect(r.sale!.ordinaryRecapture).toBe(0);
    // Everything written off comes back as unrecaptured 1250 gain at 25%…
    expect(r.sale!.unrecaptured1250).toBe(5_454_545);
    // …and only the appreciation over the ORIGINAL price is capital gain.
    expect(r.sale!.capitalGain).toBe(6_000_000);
    expect(
      r.sale!.ordinaryRecapture + r.sale!.unrecaptured1250 + r.sale!.capitalGain,
    ).toBe(r.totalGain);
  });

  it("costs more than running the whole gain at the capital gains rate", () => {
    // The error this exists to prevent. $11.45M at 20% is $2.29M; the real
    // bill is $2.56M, because $5.45M of it is taxed at 25%.
    const r = readAfterTax(SEED);
    expect(r.sale!.tax).toBe(2_563_636);
    expect(r.sale!.tax).toBeGreaterThan(r.totalGain! * 0.2);
  });

  it("charges no recapture on a sale below the depreciated basis", () => {
    const r = readAfterTax({ ...SEED, salePrice: 12_000_000 });
    expect(r.totalGain!).toBeLessThan(0);
    expect(r.sale!.tax).toBe(0);
    expect(r.note).toContain("LOSS rather than a gain");
  });
});

describe("readAfterTax — depreciation is a timing benefit", () => {
  it("says what the sale takes back", () => {
    // $2.02M of shelter over the hold; the sale hands $1.36M of it back.
    // A third of it survives, and only because 37% sheltered it and 25%
    // recaptured it.
    const r = readAfterTax(SEED);
    expect(r.netOfRecapture).toBe(654_545);
    expect(r.netOfRecapture!).toBeLessThan(r.shelterValue!);
  });

  it("nets to nothing when the two rates are the same", () => {
    // Shelter at 25% and recapture at 25% and the deduction is pure timing:
    // every dollar it saved comes back. This is the claim the module exists
    // to make checkable.
    const r = readAfterTax({ ...SEED, ordinaryRatePct: 25, recaptureRatePct: 25 });
    expect(r.netOfRecapture).toBe(0);
  });
});

describe("readAfterTax — cost segregation is not a free lunch", () => {
  const seg = readAfterTax({ ...SEED, costSegPct: 15, bonusPct: 60 });
  const base = readAfterTax(SEED);

  it("moves the deduction forward, hard", () => {
    // $545k becomes $2.48M in year one — four and a half times.
    expect(seg.shortBasis).toBe(3_000_000);
    expect(seg.yearOneDepreciation).toBe(2_476_364);
    expect(seg.yearOneTax).toBe(-784_905);
    expect(seg.yearOneDepreciation! / base.yearOneDepreciation!).toBeGreaterThan(4);
  });

  it("but recaptures the accelerated part at the ORDINARY rate", () => {
    // The carve-out comes back under section 1245 at 37%, not at 25%.
    expect(seg.sale!.ordinaryRecapture).toBe(3_000_000);
    expect(seg.sale!.unrecaptured1250).toBe(4_363_636);
    expect(seg.sale!.tax).toBe(3_400_909);
    expect(seg.sale!.tax).toBeGreaterThan(base.sale!.tax);
  });

  it("so in raw dollars it leaves the owner WORSE off", () => {
    // $523,636 against $654,545. Cost segregation wins on the time value of
    // having the money early, not on the total — and a tool that showed
    // only the year-one number would say the opposite.
    expect(seg.netOfRecapture).toBe(523_636);
    expect(seg.netOfRecapture!).toBeLessThan(base.netOfRecapture!);
    expect(base.netOfRecapture! - seg.netOfRecapture!).toBe(130_909);
  });

  it("the gap closes as the two rates converge", () => {
    // At one rate either side there is nothing to lose by accelerating.
    const flat = readAfterTax({
      ...SEED,
      ordinaryRatePct: 25,
      recaptureRatePct: 25,
      costSegPct: 15,
      bonusPct: 60,
    });
    expect(flat.netOfRecapture).toBe(0);
  });

  it("refuses a carve-out that overlaps the land", () => {
    const r = readAfterTax({ ...SEED, landPct: 60, costSegPct: 50 });
    expect(r.note).toContain("cannot be more than the whole price");
    expect(r.depreciableBasis).toBeNull();
  });
});

describe("readAfterTax — what it asks for", () => {
  it("names each missing figure", () => {
    expect(readAfterTax(BLANK).note).toContain("what the property cost");
    expect(readAfterTax({ ...BLANK, price: 20_000_000 }).note).toContain("land's share");
    expect(
      readAfterTax({ ...BLANK, price: 20_000_000, landPct: 25 }).note,
    ).toContain("27.5 years residential");
  });

  it("answers the depreciation half before a hold is set", () => {
    // Half an answer beats none: the write-off and the year-one shelter do
    // not need a sale to be known.
    const r = readAfterTax({ ...SEED, holdYears: null, salePrice: null });
    expect(r.yearOneDepreciation).toBe(545_455);
    expect(r.yearOneTax).toBe(-70_468);
    expect(r.sale).toBeNull();
    expect(r.note).toContain("recapture takes back");
  });

  it("a blank is null, never zero", () => {
    const r = readAfterTax(BLANK);
    expect(r.depreciableBasis).toBeNull();
    expect(r.totalDepreciation).toBeNull();
    expect(r.sale).toBeNull();
    expect(r.netOfRecapture).toBeNull();
  });
});
