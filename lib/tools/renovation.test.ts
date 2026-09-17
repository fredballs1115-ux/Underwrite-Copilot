import { describe, expect, it } from "vitest";
import { irr } from "../underwrite/engine";
import {
  EXIT_CAP_SHOCK_BPS,
  PREMIUM_MISS_PCT,
  PROGRAM_DISCOUNT_PCT,
  readRenovation,
  type RenovationTerms,
} from "./renovation";

/**
 * A 200-door 1985 garden property with the memorandum's own value-add page:
 * $15,000 a door, a $250 premium, "a 24-month program". Every figure below
 * is what that page does not say.
 */
const SEED: RenovationTerms = {
  units: 200,
  inPlaceRent: 1400,
  renovatedCompRent: 1650,
  classicCompRent: 1500,
  costPerDoor: 15_000,
  makeReadyPerDoor: 2500,
  normalTurnDays: 14,
  renovationDownDays: 35,
  annualTurnoverPct: 35,
  crewDoorsPerMonth: 8,
  exitCapPct: 5,
  holdYears: 5,
  claimedProgramMonths: 24,
};

describe("readRenovation — rule 1, turnover sets the pace", () => {
  it("names the binding constraint, and it is turnover on the seed", () => {
    const r = readRenovation(SEED);
    expect(r.doorsFromTurnover).toBe(70);
    expect(r.doorsFromCrew).toBe(96);
    expect(r.paceDoorsPerYear).toBe(70);
    expect(r.binding).toBe("turnover");
    expect(r.yearsToComplete).toBe(2.9);
  });

  it("the crew binds where it is the tighter of the two", () => {
    const r = readRenovation({ ...SEED, crewDoorsPerMonth: 4 });
    expect(r.doorsFromCrew).toBe(48);
    expect(r.binding).toBe("crew");
    expect(r.yearsToComplete).toBe(4.2);
  });

  it("restates the claimed program as the turnover it would need", () => {
    const r = readRenovation(SEED);
    // A 24-month program turns half the book a year, whatever the book is.
    expect(r.claimedYears).toBe(2);
    expect(r.turnoverNeededForClaimPct).toBe(50);
    // Against an actual 35% — which is the whole finding, and the note says
    // it where nothing louder is wrong.
    expect(readRenovation({ ...SEED, classicCompRent: null }).note).toContain(
      "2.9 years, not the 2 claimed",
    );
  });

  it("the schedule finishes exactly the doors the program has", () => {
    const r = readRenovation(SEED);
    const done = r.schedule.reduce((s, y) => s + y.doors, 0);
    expect(done).toBe(200);
    expect(r.schedule.at(-1)!.doorsDone).toBe(200);
    // The last year is the remainder, not another full year's pace.
    expect(r.schedule.map((y) => y.doors)).toEqual([70, 70, 60]);
  });

  it("with neither turnover nor a crew there is no pace and no schedule", () => {
    const r = readRenovation({ ...SEED, annualTurnoverPct: null, crewDoorsPerMonth: null });
    expect(r.paceDoorsPerYear).toBeNull();
    expect(r.binding).toBeNull();
    expect(r.schedule).toEqual([]);
    expect(r.programIrrPct).toBeNull();
    // The premium and the cost still read — those do not need a schedule.
    expect(r.returnOnCostPct).toBe(13.4);
  });
});

describe("readRenovation — rule 2, the premium is two numbers", () => {
  it("splits the quoted premium, and the two pieces add back to it exactly", () => {
    const r = readRenovation(SEED);
    expect(r.quotedPremium).toBe(250);
    expect(r.renovationPremium).toBe(150);
    expect(r.buildingGap).toBe(100);
    expect(r.renovationPremium! + r.buildingGap!).toBe(r.quotedPremium);
    // 40% of the "value-add" is the comparable being a different building.
    expect(r.buildingGapShareOfQuotedPct).toBe(40);
  });

  it("a subject that out-rents the comp's classic stock has its premium UNDERSTATED", () => {
    const r = readRenovation({ ...SEED, inPlaceRent: 1550 });
    expect(r.quotedPremium).toBe(100);
    expect(r.renovationPremium).toBe(150);
    expect(r.buildingGap).toBe(-50);
    expect(r.note).toContain("UNDERSTATES");
  });

  it("without the comp's classic rent there is nothing to split, and the whole quote stands", () => {
    const r = readRenovation({ ...SEED, classicCompRent: null });
    expect(r.quotedPremium).toBe(250);
    expect(r.renovationPremium).toBe(250);
    expect(r.buildingGap).toBeNull();
    expect(r.buildingGapShareOfQuotedPct).toBeNull();
  });

  it("corrected, the memorandum's 20% return on cost is 13.4%", () => {
    const r = readRenovation(SEED);
    expect(r.quotedReturnOnCostPct).toBe(20);
    expect(r.returnOnCostPct).toBe(13.4);
    expect(r.note).toContain("the 20% return on cost is 13.4%");
  });

  it("and the value-add story halves: $9.0M quoted against $4.5M", () => {
    const r = readRenovation(SEED);
    expect(r.quotedValueCreated).toBe(9_000_000);
    expect(r.valueCreated).toBe(4_506_600);
  });
});

describe("readRenovation — rule 3, the make-ready is deferred and the downtime is not", () => {
  it("the invoice less the make-ready plus the extra days down", () => {
    const r = readRenovation(SEED);
    // 21 extra days of a $1,400 rent.
    expect(r.downtimeCostPerDoor).toBe(967);
    expect(r.netCostPerDoor).toBe(15_000 - 2500 + 967);
    // The displayed total is the displayed cost per door times the doors —
    // the card's numbers have to add up.
    expect(r.totalCapital).toBe(200 * r.netCostPerDoor!);
  });

  it("strip both corrections and the net cost IS the invoice", () => {
    const r = readRenovation({
      ...SEED,
      makeReadyPerDoor: 0,
      normalTurnDays: 0,
      renovationDownDays: 0,
    });
    expect(r.netCostPerDoor).toBe(15_000);
    expect(r.downtimeCostPerDoor).toBe(0);
  });

  it("a renovation faster than a normal turn is never a rent credit", () => {
    const r = readRenovation({ ...SEED, normalTurnDays: 40, renovationDownDays: 35 });
    expect(r.downtimeCostPerDoor).toBe(0);
    expect(r.netCostPerDoor).toBe(12_500);
  });

  it("the two corrections run opposite ways — the cost falls, and not by the make-ready", () => {
    const r = readRenovation(SEED);
    expect(r.netCostPerDoor).toBeLessThan(SEED.costPerDoor!);
    expect(r.netCostPerDoor).toBeGreaterThan(SEED.costPerDoor! - SEED.makeReadyPerDoor!);
  });
});

describe("readRenovation — rule 4, the return on cost has no clock in it", () => {
  it("most of the program's present value is the resale", () => {
    const r = readRenovation(SEED);
    expect(r.pvFromExitPct).toBe(90);
    expect(r.pvFromExitPct).toBeGreaterThan(50);
  });

  it("the same program earns twice as much sold the year it finishes", () => {
    const r = readRenovation(SEED);
    expect(r.completionYear).toBe(3);
    expect(r.irrIfSoldAtCompletionPct).toBe(63.7);
    expect(r.programIrrPct).toBe(31.4);
    // Same premium, same cost, same building.
    expect(r.irrIfSoldAtCompletionPct!).toBeGreaterThan(2 * r.programIrrPct!);
  });

  it("and the return decays with every year it is held past completion", () => {
    const rates = [3, 4, 5, 7, 10].map(
      (holdYears) => readRenovation({ ...SEED, holdYears }).programIrrPct!,
    );
    expect(rates).toEqual([63.7, 42.2, 31.4, 20.8, 13.7]);
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]).toBeLessThan(rates[i - 1]);
  });

  it("both shocks cost the program return, and neither is asserted over the other", () => {
    const r = readRenovation(SEED);
    expect(r.irrIfPremiumMissesPct).toBeLessThan(r.programIrrPct!);
    expect(r.irrIfExitCapWidensPct).toBeLessThan(r.programIrrPct!);
    // On THESE inputs the premium dominates — it sets the rent and the exit
    // where the cap moves only the exit. It does not dominate at every hold
    // and cap, which is why the card computes the pair rather than claiming
    // an ordering: at a 4% exit over three years the cap edges it.
    expect(r.irrIfPremiumMissesPct!).toBeLessThan(r.irrIfExitCapWidensPct!);
    const tight = readRenovation({ ...SEED, holdYears: 3, exitCapPct: 4 });
    expect(tight.irrIfExitCapWidensPct!).toBeLessThan(tight.irrIfPremiumMissesPct!);
  });

  it("the constants the shocks are struck at are the exported ones", () => {
    expect(PREMIUM_MISS_PCT).toBe(10);
    expect(EXIT_CAP_SHOCK_BPS).toBe(50);
    expect(PROGRAM_DISCOUNT_PCT).toBe(15);
  });

  it("the reported rate is the rate of the schedule the card draws", () => {
    // Rebuild the stream from the printed schedule and run it through the
    // same `irr` the Excel export uses, so the page and the workbook can
    // never disagree about this number.
    const r = readRenovation(SEED);
    const hold = 5;
    const flows = new Array(hold + 1).fill(0);
    for (const y of r.schedule) {
      flows[y.year - 1] -= y.capital;
      flows[y.year] += y.premiumIncome;
    }
    flows[hold] += r.stabilizedPremiumNoi! / 0.05;
    expect(Math.round(irr(flows)! * 1000) / 10).toBe(r.programIrrPct);
  });
});

describe("readRenovation — the program that outlasts the hold", () => {
  it("credits the exit with the finished doors only", () => {
    const r = readRenovation({ ...SEED, holdYears: 2 });
    expect(r.doorsDoneByExit).toBe(140);
    expect(r.undoneAtExit).toBe(60);
    // The note leads with the premium split wherever there is one — that is
    // the finding that changes the bid. With nothing to split against, the
    // half-run program is what the sentence says.
    expect(readRenovation({ ...SEED, holdYears: 2, classicCompRent: null }).note).toContain(
      "60 of the 200 doors are still classic at the sale",
    );
  });

  it("and never spends the capital of a year the sale came before", () => {
    // Year 3's capital falls outside a two-year hold: the building is sold,
    // so neither its cheque nor its rent is the seller's.
    const two = readRenovation({ ...SEED, holdYears: 2 });
    const five = readRenovation({ ...SEED, holdYears: 5 });
    // The schedule itself is the program's, unchanged by the hold.
    expect(two.schedule).toEqual(five.schedule);
    // The rate is not: a program half-run and sold is a different stream.
    expect(two.programIrrPct).not.toBe(five.programIrrPct);
  });

  it("a hold past completion leaves nothing undone", () => {
    const r = readRenovation(SEED);
    expect(r.doorsDoneByExit).toBe(200);
    expect(r.undoneAtExit).toBe(0);
  });
});

describe("readRenovation — what the program is worth", () => {
  it("value per door is the capitalised premium less what it cost", () => {
    const r = readRenovation(SEED);
    expect(r.stabilizedPremiumNoi).toBe(360_000);
    // $1,800 a year at a 5% cap is $36,000 of value for $13,467 of cost.
    expect(r.valuePerDoor! + r.netCostPerDoor!).toBe(36_000);
    expect(r.valuePerDoor).toBe(22_533);
  });

  it("the break-even premium creates exactly nothing", () => {
    const base = readRenovation(SEED);
    expect(base.breakEvenPremium).toBe(56.11);
    const at = readRenovation({
      ...SEED,
      classicCompRent: 1500,
      renovatedCompRent: 1500 + base.breakEvenPremium!,
    });
    // The premium is quoted to the cent, so the residue is sub-dollar per
    // door; asserting an exact zero would be asserting a rounding bug.
    expect(Math.abs(at.valueCreated!)).toBeLessThan(200);
    expect(at.valuePerDoor).toBeGreaterThanOrEqual(-1);
    expect(at.valuePerDoor).toBeLessThanOrEqual(1);
  });

  it("which is $56 a month — the argument is how much, not whether", () => {
    const r = readRenovation(SEED);
    expect(r.breakEvenPremium!).toBeLessThan(r.renovationPremium!);
  });

  it("no exit cap leaves the value unpriced but the return on cost standing", () => {
    const r = readRenovation({ ...SEED, exitCapPct: null });
    expect(r.valuePerDoor).toBeNull();
    expect(r.valueCreated).toBeNull();
    expect(r.breakEvenPremium).toBeNull();
    expect(r.programIrrPct).toBeNull();
    expect(r.returnOnCostPct).toBe(13.4);
  });
});

describe("readRenovation — refusals", () => {
  it("names the missing door count", () => {
    expect(readRenovation({ ...SEED, units: null }).note).toContain("how many doors");
  });

  it("names the missing cost", () => {
    expect(readRenovation({ ...SEED, costPerDoor: null }).note).toContain("cost per door");
  });

  it("names the missing rents", () => {
    expect(readRenovation({ ...SEED, renovatedCompRent: null }).note).toContain("in-place rent");
    expect(readRenovation({ ...SEED, inPlaceRent: null }).note).toContain("renovated rent");
  });

  it("a blank is null, never zero", () => {
    const r = readRenovation({ ...SEED, units: null });
    expect(r.returnOnCostPct).toBeNull();
    expect(r.netCostPerDoor).toBeNull();
    expect(r.schedule).toEqual([]);
  });
});
