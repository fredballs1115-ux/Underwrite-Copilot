import { describe, expect, it } from "vitest";
import {
  TERM_MARGIN_YEARS,
  leaseholdPv,
  readGroundLease,
  type GroundLeaseTerms,
} from "./ground-lease";

/**
 * The seeded lease, which is also what `/tools` renders: an $8M-NOI
 * building on land it does not own, paying $2M of ground rent with 40
 * years left, an unsubordinated fee, and a reset in fifteen years to 6%
 * of land value. Covered four times today; 3.22× once the reset lands, on
 * that year's NOI.
 */
const SEED: GroundLeaseTerms = {
  noi: 8_000_000,
  groundRent: 2_000_000,
  escalationPct: 2,
  noiGrowthPct: 2.5,
  yearsRemaining: 40,
  discountRatePct: 8,
  feeSimpleCapPct: 5,
  subordinated: false,
  loanTermYears: 10,
  yearsToReset: 15,
  resetPctOfLand: 6,
  landValue: 60_000_000,
};

describe("the present value of a wasting asset", () => {
  it("is the term's cash flows and nothing after them", () => {
    // Built by hand rather than by a closed form: the NOI and the rent
    // grow at DIFFERENT rates, so no single annuity factor covers it,
    // and an annuity shortcut is exactly how this gets quietly wrong.
    let want = 0;
    for (let t = 1; t <= 3; t += 1) {
      const cash = 100 * Math.pow(1.05, t - 1) - 40 * Math.pow(1.03, t - 1);
      want += cash / Math.pow(1.1, t);
    }
    expect(leaseholdPv(100, 40, 5, 3, 3, 10)).toBeCloseTo(want, 10);
  });

  it("stops at expiry — a longer lease is worth strictly more", () => {
    const short = leaseholdPv(8_000_000, 2_000_000, 2.5, 2, 20, 8);
    const long = leaseholdPv(8_000_000, 2_000_000, 2.5, 2, 40, 8);
    expect(long).toBeGreaterThan(short);
    // And the extra twenty years are worth far less than the first
    // twenty, which is why a 99-year lease prices near fee simple and a
    // 30-year one does not.
    expect(long - short).toBeLessThan(short);
  });

  it("is zero over no term at all", () => {
    expect(leaseholdPv(8_000_000, 2_000_000, 2.5, 2, 0, 8)).toBe(0);
  });

  it("pays the reset rent from the year after the reset, escalating from there", () => {
    // Built by hand: years 1–2 at today's rent escalating, then the reset
    // rent from year 3, escalating at the lease's rate from its own start.
    let want = 0;
    for (let t = 1; t <= 4; t += 1) {
      const rent = t <= 2 ? 40 * Math.pow(1.03, t - 1) : 70 * Math.pow(1.03, t - 3);
      want += (100 * Math.pow(1.05, t - 1) - rent) / Math.pow(1.1, t);
    }
    expect(leaseholdPv(100, 40, 5, 3, 4, 10, { afterYears: 2, rent: 70 })).toBeCloseTo(want, 10);
  });
});

describe("the error the card exists to prevent", () => {
  it("capitalises the leasehold NOI as though it were a perpetuity", () => {
    const r = readGroundLease(SEED);
    expect(r.leaseholdNoi).toBe(6_000_000);
    expect(r.asIfPerpetual).toBe(120_000_000); // $6M at a 5% fee-simple cap
  });

  it("and says how much of that figure is a reversion somebody else keeps", () => {
    const r = readGroundLease(SEED);
    expect(r.leaseholdValue).toBeLessThan(r.asIfPerpetual!);
    expect(r.overstatementPct).toBeGreaterThan(0);
    expect(r.note).toContain("a reversion");
  });

  it("gets worse as the term shortens — the whole point", () => {
    // Forty years at an 8% discount recovers most of a perpetuity's
    // value. Ten years does not, and a screening model that capitalises
    // is then wrong by more than half.
    const forty = readGroundLease(SEED).overstatementPct!;
    const twenty = readGroundLease({ ...SEED, yearsRemaining: 20 }).overstatementPct!;
    const ten = readGroundLease({ ...SEED, yearsRemaining: 10 }).overstatementPct!;
    expect(forty).toBeLessThan(twenty);
    expect(twenty).toBeLessThan(ten);
    expect(ten).toBeGreaterThan(50);
  });

  it("says so plainly when the ground rent eats the whole building", () => {
    // A rent above the NOI is a leasehold with no value at any discount
    // rate — reported rather than shown as a negative to be squinted at.
    // No reset here: the seed's would strike a $9M rent DOWN to 6% of the
    // land in year 16 — the lease's formula moves either way — and this is
    // about a rent the building cannot carry.
    const r = readGroundLease({ ...SEED, groundRent: 9_000_000, resetPctOfLand: null });
    expect(r.leaseholdNoi).toBe(-1_000_000);
    expect(r.leaseholdValue).toBeLessThan(0);
    expect(r.note).toContain("worth nothing at any discount rate");
    // …with the figure at the rate entered, the minus sign outside the dollar.
    expect(r.note).toContain("at 8% the term's cash flows come to −$7,277,335");
    expect(r.note).not.toContain("$-");
  });
});

describe("a leasehold worth less than nothing", () => {
  // Today's leasehold NOI is $100,000, so the capitalised figure is $2M —
  // but the year-16 reset to $3.6M outruns the building's income, and over
  // the forty years the term is worth −$111,559 at 8%.
  const thin = { ...SEED, noi: 2_100_000 };

  it("is said as what it is: the income over the term does not cover the ground rent", () => {
    const r = readGroundLease(thin);
    expect(r.asIfPerpetual).toBe(2_000_000);
    expect(r.leaseholdValue).toBe(-111_559);
    expect(r.note).toContain(
      "Capitalising the leasehold's NOI as though it ran forever says $2,000,000, but over 40 years, " +
        "discounted at 8%, the building's income does not cover the ground rent: the term's cash " +
        "flows come to −$111,559, so the leasehold is worth nothing.",
    );
  });

  it("is never a share of the capitalised figure past 100%, nor a negative one", () => {
    // It read "it is worth $-111,559 — -75.9% of that figure is a reversion
    // the fee owner keeps, and 181.5% is the rent reset": a value below
    // zero puts the gap past the whole figure, so no share describes it.
    for (const over of [thin, { ...thin, feeSimpleCapPct: 3 }, { ...SEED, groundRent: 7_900_000, escalationPct: 4, resetPctOfLand: null }]) {
      const r = readGroundLease(over);
      expect(r.leaseholdValue!).toBeLessThan(0);
      expect(r.note).not.toContain("of that figure");
      for (const share of r.note.matchAll(/(-?[\d.]+)% of/g)) {
        expect(Number(share[1])).toBeGreaterThanOrEqual(0);
        expect(Number(share[1])).toBeLessThanOrEqual(100);
      }
    }
  });

  it("says 'worth nothing at any discount rate' only where it is true, cap set or not", () => {
    // The rent above the NOI from the first year, growing slower than it:
    // the term never gets ahead, so it is below zero at every rate — the
    // claim holds, with the fee-simple cap set (the seed's 5%) or blank.
    const never = { ...SEED, groundRent: 9_000_000, resetPctOfLand: null };
    for (const rate of [0, 1, 4, 8, 20, 60, 500]) {
      expect(leaseholdPv(8_000_000, 9_000_000, 2.5, 2, 40, rate)).toBeLessThan(0);
    }
    expect(readGroundLease(never).note).toContain("worth nothing at any discount rate");
    expect(readGroundLease({ ...never, feeSimpleCapPct: null }).note).toContain(
      "worth nothing at any discount rate",
    );
    // A rent just under the NOI and escalating faster: the early years pay,
    // so at a steep enough rate the term is worth something, and the card
    // says it is worth nothing at the 8% entered — not at any rate.
    expect(leaseholdPv(8_000_000, 7_900_000, 2.5, 4, 40, 8)).toBeLessThan(0);
    expect(leaseholdPv(8_000_000, 7_900_000, 2.5, 4, 40, 1_000)).toBeGreaterThan(0);
    const early = readGroundLease({ ...SEED, groundRent: 7_900_000, escalationPct: 4, resetPctOfLand: null });
    expect(early.note).toContain("discounted at 8%, the building's income does not cover the ground rent");
    expect(early.note).toContain("so the leasehold is worth nothing.");
    expect(early.note).not.toContain("at any discount rate");
    // The thin lease above is the same shape: worth something at a steep rate.
    expect(readGroundLease(thin).note).not.toContain("at any discount rate");
  });

  it("leaves a reset that makes the whole gap to the reset, never a negative reversion share", () => {
    // Today's leasehold NOI is thin and grows faster than the rent, so before
    // the reset the term is worth MORE than the capitalised figure: the
    // reversion's "share" was −27.8% and the reset's 90.8%.
    const r = readGroundLease({ ...SEED, noi: 2_200_000 });
    expect(r.leaseholdValue).toBe(1_481_903);
    expect(r.leaseholdValueBeforeReset!).toBeGreaterThan(r.asIfPerpetual!);
    expect(r.note).toContain(
      "over 40 years it is worth $1,481,903 — 63.0% under that figure, and the whole gap is the " +
        "rent reset in year 16: without it the term would be worth more than the capitalised figure.",
    );
    expect(r.note).not.toMatch(/-\d/);
  });
});

describe("coverage, which is the test the lender applies", () => {
  it("is NOI over the ground rent, not a DSCR", () => {
    expect(readGroundLease(SEED).coverage).toBe(4);
  });

  it("answers before a term or a discount rate is known", () => {
    // Often the only figure a reader came for, and it needs neither.
    const r = readGroundLease({ ...SEED, yearsRemaining: null, discountRatePct: null });
    expect(r.coverage).toBe(4);
    expect(r.leaseholdValue).toBeNull();
    expect(r.note).toContain("covered 4×");
  });
});

describe("the reset, which is an uncapped repricing", () => {
  it("strikes the new rent against land value, not against the old rent", () => {
    const r = readGroundLease(SEED);
    expect(r.resetRent).toBe(3_600_000); // 6% of $60M
  });

  it("names what coverage becomes, on the NOI of the year it lands", () => {
    // $3.6M against year 16's NOI, $8M grown 2.5% for fifteen years —
    // $11,586,385, so 3.22×. It read 2.22×, today's NOI against a rent
    // fifteen years off.
    const r = readGroundLease(SEED);
    expect(r.resetYear).toBe(16);
    expect(r.resetCoverage).toBe(3.22);
    expect(r.resetCoverage).toBe(Math.round(((8_000_000 * Math.pow(1.025, 15)) / 3_600_000) * 100) / 100);
    expect(r.note).toContain("coverage from 4× today to 3.22× on that year's NOI");
    expect(r.note).toContain("held flat as no land growth is entered");
  });

  it("says WHEN, because a reset inside the hold is a different risk", () => {
    // The timing changes nothing in the arithmetic — the rent is struck
    // at land value whenever it lands — but a reset two years out sits
    // inside most hold periods and one twenty years out does not.
    expect(readGroundLease(SEED).note).toContain("In 15 years the reset takes");
    // With no year the NOI it lands on is unknown, so the figure is a reset
    // struck today, on today's NOI, and said so — and the leasehold is
    // valued without a reset it cannot place.
    const unknown = readGroundLease({ ...SEED, yearsToReset: null });
    expect(unknown.note).toContain("Struck today, the reset would take");
    expect(unknown.resetYear).toBeNull();
    expect(unknown.resetCoverage).toBe(2.22);
    expect(unknown.leaseholdValue).toBe(unknown.leaseholdValueBeforeReset);
  });

  it("moves with land value — the exposure the lease does not cap", () => {
    // Land doubles, the rent doubles, and a comfortable lease becomes a
    // marginal one. Nothing in the lease prevents it.
    const r = readGroundLease({ ...SEED, landValue: 120_000_000 });
    expect(r.resetRent).toBe(7_200_000);
    expect(r.resetCoverage).toBe(1.61); // 1.11× on today's NOI, as it read
  });

  it("is in the leasehold's value, not only in a sentence beside it", () => {
    // From year 16 the leasehold pays $3.6M escalating at 2%, not $2.69M:
    // worth $93,902,689 over the forty years, not the $97,531,550 the card
    // printed while announcing the reset beside it.
    const r = readGroundLease(SEED);
    expect(r.leaseholdValueBeforeReset).toBe(97_531_550);
    expect(r.leaseholdValue).toBe(93_902_689);
    // The overstatement splits into the reversion and the reset, and the
    // two add up to it.
    expect(r.overstatementPct).toBe(21.7);
    expect(r.resetSharePct).toBe(3);
    expect(r.note).toContain(
      "18.7% of that figure is a reversion the fee owner keeps, and 3.0% is the rent reset in year 16",
    );
  });

  it("and in the leased fee's, which receives the rent the leasehold pays", () => {
    const r = readGroundLease(SEED);
    expect(r.leasedFeeValue).toBe(36_336_113);
    expect(readGroundLease({ ...SEED, yearsToReset: null }).leasedFeeValue).toBe(32_707_252);
  });

  it("changes nothing when it falls after the lease has ended", () => {
    const r = readGroundLease({ ...SEED, yearsRemaining: 10 });
    expect(r.resetRent).toBeNull();
    expect(r.resetCoverage).toBeNull();
    expect(r.leaseholdValue).toBe(r.leaseholdValueBeforeReset);
    expect(r.note).toContain("falls after the lease ends");
  });

  it("says nothing about a reset the lease does not have", () => {
    const r = readGroundLease({ ...SEED, resetPctOfLand: null });
    expect(r.resetRent).toBeNull();
    expect(r.resetCoverage).toBeNull();
  });
});

describe("subordination, which decides whether it is financeable", () => {
  it("clears when the term outlasts the loan by the market's margin", () => {
    // 40 years against a 10-year loan, with 10 years to spare and more.
    const r = readGroundLease(SEED);
    expect(r.financeable).toBe(true);
    expect(r.note).toContain("senior to the mortgage");
  });

  it("fails when an unsubordinated term does not clear it", () => {
    const r = readGroundLease({ ...SEED, yearsRemaining: 15 });
    expect(r.financeable).toBe(false);
    expect(r.note).toContain("lenders decline");
  });

  it("sits exactly on the margin rather than inside it", () => {
    // 10 + 10 = 20 passes; 19 does not. The boundary is stated, so it
    // cannot drift.
    expect(readGroundLease({ ...SEED, yearsRemaining: 20 }).financeable).toBe(true);
    expect(readGroundLease({ ...SEED, yearsRemaining: 19 }).financeable).toBe(false);
    expect(TERM_MARGIN_YEARS).toBe(10);
  });

  it("a subordinated fee is financeable whatever the term", () => {
    // The landlord has agreed to stand behind the mortgage, so the
    // lender can foreclose on the building without being wiped out.
    const r = readGroundLease({ ...SEED, subordinated: true, yearsRemaining: 12 });
    expect(r.financeable).toBe(true);
    expect(r.note).not.toContain("lenders decline");
  });
});

describe("the other half of the same lease", () => {
  it("values the leased fee as the rent plus the land coming back", () => {
    const r = readGroundLease(SEED);
    expect(r.leasedFeeValue).toBeGreaterThan(0);
    // It is closer to a bond than to a building: the rent stream alone,
    // with no land at the end, is already most of it over 40 years.
    const noLand = readGroundLease({ ...SEED, landValue: 1 });
    expect(noLand.leasedFeeValue).toBeLessThan(r.leasedFeeValue!);
  });

  it("moves the OPPOSITE way to the leasehold as the clock runs", () => {
    // The clock that destroys the leasehold is the same clock that
    // brings the land back sooner, so a shortening lease is worth less
    // to the tenant and MORE to the landlord. On the seeded lease the
    // leasehold falls $93.9M → $44.7M between forty years and ten while
    // the leased fee rises $36.3M → $42.3M (the forty-year figures carry
    // the year-16 reset; the ten-year lease ends first). Two halves of one asset,
    // priced by opposite ends of the same term — which is why they
    // trade to different buyers.
    const forty = readGroundLease(SEED);
    const ten = readGroundLease({ ...SEED, yearsRemaining: 10 });
    expect(ten.leaseholdValue!).toBeLessThan(forty.leaseholdValue!);
    expect(ten.leasedFeeValue!).toBeGreaterThan(forty.leasedFeeValue!);
  });

  it("needs a land value, and says so by answering null without one", () => {
    const r = readGroundLease({ ...SEED, landValue: null });
    expect(r.leasedFeeValue).toBeNull();
    // Everything that does not need it still answers.
    expect(r.leaseholdValue).not.toBeNull();
    expect(r.coverage).toBe(4);
  });
});

describe("a blank is null, never zero", () => {
  it("asks for the NOI first", () => {
    const r = readGroundLease({ ...SEED, noi: null });
    expect(r.coverage).toBeNull();
    expect(r.note).toContain("NOI, before the ground rent");
  });

  it("says a building with no ground rent is not this calculation", () => {
    const r = readGroundLease({ ...SEED, groundRent: null });
    expect(r.leaseholdValue).toBeNull();
    expect(r.note).toContain("ordinary fee-simple building");
  });

  it("treats unstated growth and escalation as flat, not as unknown", () => {
    // With no reset, so the rent stays the $2M it is today.
    const r = readGroundLease({
      ...SEED,
      noiGrowthPct: null,
      escalationPct: null,
      resetPctOfLand: null,
    });
    expect(r.leaseholdValue).not.toBeNull();
    // Flat cash of $6M for 40 years at 8% — a plain annuity, which is
    // the one case where the closed form does apply.
    const annuity = 6_000_000 * ((1 - Math.pow(1.08, -40)) / 0.08);
    expect(r.leaseholdValue).toBeCloseTo(Math.round(annuity), 0);
  });

  it("gives coverage without a fee-simple cap to compare against", () => {
    const r = readGroundLease({ ...SEED, feeSimpleCapPct: null });
    expect(r.asIfPerpetual).toBeNull();
    expect(r.overstatementPct).toBeNull();
    expect(r.leaseholdValue).not.toBeNull();
  });
});
