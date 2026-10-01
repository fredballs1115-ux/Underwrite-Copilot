import { describe, expect, it } from "vitest";
import { blanks, fillIn } from "./blanks";
import { readBid } from "./max-bid";

describe("a blank field is named, never read as zero", () => {
  it("names the blank and the unreadable fields, in the order given", () => {
    expect(
      blanks([
        ["the loan rate", ""],
        ["the hold", "5"],
        ["the NOI growth", "  "],
        ["the exit cap", "six"],
        ["the cost to sell", "0"],
        ["the year 1 NOI", "$1.65M"],
      ]),
    ).toEqual(["the loan rate", "the NOI growth", "the exit cap"]);
  });

  it("takes a typed zero as a figure — zero is an answer, a blank is not", () => {
    expect(blanks([["the NOI growth", "0"]])).toEqual([]);
    expect(blanks([["the NOI growth", ""]])).toEqual(["the NOI growth"]);
  });

  it("says which fields, in one sentence", () => {
    expect(fillIn(["the loan rate"])).toBe("Fill in the loan rate — a blank is not read as zero.");
    expect(fillIn(["the loan rate", "the amortisation"])).toBe(
      "Fill in the loan rate and the amortisation — a blank is not read as zero.",
    );
    expect(fillIn(["the hold", "the exit cap", "the loan rate"])).toBe(
      "Fill in the hold, the exit cap and the loan rate — a blank is not read as zero.",
    );
  });

  it("is the difference between the bid and a 0% loan's", () => {
    // What a blank rate read as zero used to price: the Max bid card's own
    // seed, $29.50M against the $25.54M the typed 6.5% bids.
    const seed = {
      year1Noi: 1_650_000,
      noiGrowthPct: 3,
      holdYears: 5,
      exitCapPct: 6,
      sellingCostPct: 1.5,
      targetLeveredIrrPct: 15,
      maxLtvPct: 65,
      minDscr: 1.25,
      minDebtYieldPct: 9,
      amortYears: 30,
      ioYears: 0,
      loanFeePct: 1,
      closingCostPct: 1.5,
    };
    expect(readBid({ ...seed, ratePct: 6.5 }).maxPrice).toBe(25_542_335);
    expect(readBid({ ...seed, ratePct: 0 }).maxPrice).toBeGreaterThan(29_000_000);
  });
});
