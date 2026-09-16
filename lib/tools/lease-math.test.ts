import { describe, expect, it } from "vitest";
import { readLease, readOpex, type LeaseTerms } from "./lease-math";

const DEAL: LeaseTerms = {
  months: 120,
  startingRentPsf: 36,
  freeMonths: 12,
  tiPsf: 90,
  lcPct: 4,
  escalationPct: 3,
  discountPct: 8,
};

describe("what a lease is worth after what it cost to sign", () => {
  it("escalates annually, on the lease's own anniversary", () => {
    // A flat ten-year lease collects exactly ten years of face rent.
    const flat = readLease({ ...DEAL, freeMonths: 0, tiPsf: 0, lcPct: null, escalationPct: 0 });
    expect(flat.grossRentPsf).toBeCloseTo(360, 6);
    // With 3% annual steps, each year is the last one times 1.03.
    const stepped = readLease({ ...DEAL, freeMonths: 0, tiPsf: 0, lcPct: null });
    let hand = 0;
    for (let y = 0; y < 10; y++) hand += 36 * 1.03 ** y;
    expect(stepped.grossRentPsf).toBeCloseTo(hand, 6);
  });

  it("prices free rent at the rate it would have been paid at", () => {
    // The trap: free rent taken at the front is cheap, but the escalation
    // runs during it, so month 13 pays the YEAR-TWO rate. Treating free
    // rent as "the term starts a year later" understates the concession
    // and is the common mistake.
    const r = readLease({ ...DEAL, tiPsf: 0, lcPct: null });
    // Twelve free months at the year-one rate: exactly one year of face.
    expect(r.freeRentPsf).toBeCloseTo(36, 6);
    // …and what is collected is years two through ten, escalated.
    let hand = 0;
    for (let y = 1; y < 10; y++) hand += 36 * 1.03 ** y;
    expect(r.collectedPsf).toBeCloseTo(hand, 6);
  });

  it("writes the commission against the face deal, not the discounted one", () => {
    // A listing agreement states the fee on the gross rent over the term.
    // A free-rent-heavy deal still pays a full fee, which is part of why
    // concessions cost the landlord more than they look like.
    const r = readLease(DEAL);
    expect(r.lcPsf).toBeCloseTo(r.grossRentPsf! * 0.04, 6);
    expect(r.lcPsf!).toBeGreaterThan(r.collectedPsf! * 0.04);
  });

  it("lands the straight-line NER well under the face rent", () => {
    const r = readLease(DEAL);
    const hand = (r.collectedPsf! - 90 - r.lcPsf!) / 10;
    expect(r.nerPsfYr).toBeCloseTo(hand, 6);
    // $36 face on this deal is nothing like $36 effective, which is the
    // whole reason the tool exists.
    expect(r.nerPsfYr!).toBeLessThan(30);
    expect(r.discountToFacePct!).toBeGreaterThan(15);
  });

  it("puts the discounted NER below the straight-line one", () => {
    // Always, on a deal with free rent at the front: discounting charges
    // the landlord for waiting, on top of the rent never collected.
    const r = readLease(DEAL);
    expect(r.discountedNerPsfYr).not.toBeNull();
    expect(r.discountedNerPsfYr!).toBeLessThan(r.nerPsfYr!);
  });

  it("collapses the two when nothing is discounted and nothing escalates", () => {
    // A sanity anchor: no free rent, no capital, no escalation, no
    // discount — the NER is the face rent and nothing else.
    const r = readLease({
      months: 60,
      startingRentPsf: 30,
      freeMonths: 0,
      tiPsf: 0,
      lcPct: null,
      escalationPct: 0,
      discountPct: 0,
    });
    expect(r.nerPsfYr).toBeCloseTo(30, 6);
    expect(r.discountedNerPsfYr).toBeCloseTo(30, 6);
    expect(r.discountToFacePct).toBeCloseTo(0, 6);
  });

  it("shows what the deal cost, split three ways", () => {
    const r = readLease(DEAL);
    expect(r.costOfDeal).not.toBeNull();
    const { free, ti, lc } = r.costOfDeal!;
    expect(free).toBeCloseTo(r.freeRentPsf!, 6);
    expect(ti).toBe(90);
    expect(lc).toBeCloseTo(r.lcPsf!, 6);
    // And they add up to the gap between face and effective.
    expect(r.grossRentPsf! - free - ti - lc).toBeCloseTo(r.netPsf!, 6);
  });

  it("says so when the deal costs the landlord money", () => {
    const r = readLease({ ...DEAL, tiPsf: 400 });
    expect(r.netPsf!).toBeLessThan(0);
    expect(r.note).toContain("costs the landlord money");
  });

  it("refuses the shapes it cannot answer, rather than guessing", () => {
    expect(readLease({ ...DEAL, months: null }).nerPsfYr).toBeNull();
    expect(readLease({ ...DEAL, months: 0 }).nerPsfYr).toBeNull();
    expect(readLease({ ...DEAL, startingRentPsf: null }).nerPsfYr).toBeNull();
    expect(readLease({ ...DEAL, months: null }).note).toContain("Set a term");
    // A term typed in years where months were asked for.
    expect(readLease({ ...DEAL, months: 5000 }).note).toContain("in months");
  });

  it("clamps free rent to the term rather than paying a tenant to leave", () => {
    const r = readLease({ ...DEAL, freeMonths: 240, tiPsf: 0, lcPct: null });
    expect(r.collectedPsf).toBeCloseTo(0, 6);
    expect(r.note).toContain("Every month of the term is free");
  });
});

describe("one operating expense, said three ways", () => {
  it("says the same figure per unit, per foot and as a ratio", () => {
    const r = readOpex({ opex: 504_000, units: 120, sf: 96_000, egi: 1_680_000 });
    expect(r.perUnit).toBeCloseTo(4200, 6);
    expect(r.perSf).toBeCloseTo(5.25, 6);
    expect(r.ratioPct).toBeCloseTo(30, 6);
    expect(r.noi).toBe(1_176_000);
  });

  it("drops the figures it has no denominator for", () => {
    const r = readOpex({ opex: 504_000, units: null, sf: 0, egi: null });
    expect(r.perUnit).toBeNull();
    expect(r.perSf).toBeNull(); // zero SF is not a denominator
    expect(r.ratioPct).toBeNull();
    expect(r.noi).toBeNull();
  });

  it("names a ratio that is really a net lease", () => {
    // Worth saying out loud: under 20% of income almost always means the
    // tenant pays the expenses directly, not a remarkably cheap building.
    const r = readOpex({ opex: 100_000, units: 1, sf: 50_000, egi: 1_000_000 });
    expect(r.ratioPct).toBeCloseTo(10, 6);
    expect(r.note).toContain("net lease");
  });

  it("names a ratio that leaves no NOI", () => {
    const r = readOpex({ opex: 1_000_000, units: 100, sf: 80_000, egi: 900_000 });
    expect(r.noi).toBe(-100_000);
    expect(r.note).toContain("no NOI");
  });

  it("every note it produces is a sentence", () => {
    for (const t of [
      { opex: 1_000_000, units: 1, sf: 1, egi: 900_000 },
      { opex: 100_000, units: 1, sf: 1, egi: 1_000_000 },
    ]) {
      const note = readOpex(t).note;
      expect(note.length).toBeGreaterThan(10);
      expect(note.endsWith("."), note).toBe(true);
    }
  });
});
