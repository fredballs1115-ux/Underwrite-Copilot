import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import { interestTag, isMasterLeasehold, leaseholdTermOf, readInterest } from "@/lib/interest";
import { leaseholdExitSentence, leaseholdExitView, leaseholdLenderLine, leaseholdOptionsLine, readLeaseholdExit } from "@/lib/leasehold-exit";
import { readGroundLeaseTerm, readMasterLeaseTerm } from "@/lib/ground-lease-term";
import { gluedWords } from "@/lib/render-lint";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import {
  MASTER_RENT_ROW,
  SUBLEASE_INCOME_ROW,
  annualOf,
  readSandwichLease,
  sandwichContextLine,
  sandwichModelLine,
  sandwichNote,
  sandwichShortLine,
  sandwichTag,
  sandwichTermRows,
} from "./sandwich-lease";

const TODAY = new Date(Date.UTC(2026, 9, 5, 12));
const row = (label: string, value: string, page = "p. 6") => ({ label, value, flagged: false, page, basis: "na" as const });
const MASTER = {
  kind: "leasehold" as const,
  summary: "Leasehold interest under a master lease of the building, sublet to 14 office tenants",
  share: "",
  groundLease: "Master lease of the building and its land from the owner; master rent $1,100,000 a year",
  loan: "",
  page: "p. 4",
};
const deal = (metrics: ReturnType<typeof row>[], interest: Partial<typeof MASTER> = {}): ExtractionResult =>
  ({ dealName: "Founders Plaza", assetClass: "Office", totalPages: 40, metrics, interest: { ...MASTER, ...interest } }) as unknown as ExtractionResult;

// Research pass 28's sandwich example (rp28/deals.ts sandwich), its figures.
const SANDWICH = deal([
  row("Asking price", "$6,500,000", "p. 2"),
  row("Master lease rent", "$1,100,000 a year, increasing 2% annually"),
  row("Sublease income", "$1,820,000"),
  row("NOI (T-12)", "$720,000"),
  row("Master lease expiration", "December 31, 2041"),
  row("Master lease options", "Two 5-year options"),
]);

describe("a sandwich position's spread and term (pass 28, round 9)", () => {
  it("reads the spread, the cover, the cushion and the master lease's term", () => {
    const r = readSandwichLease(SANDWICH, TODAY)!;
    expect(r).toMatchObject({ masterRent: 1_100_000, subleaseIncome: 1_820_000, spread: 720_000, noiOverSpread: null });
    expect(r.coverage).toBeCloseTo(1.6545, 3);
    expect(r.cushionPct).toBeCloseTo(39.56, 1);
    expect(r.term?.ends).toBe("2041-12-31");
    expect(r.headline).toBe(
      "The subleases bring in $1.82M a year against the $1.10M master rent: a spread of $720k, the position's income before its own costs, the sublease income covering the master rent 1.65×. " +
        "The master rent is owed whatever the subtenants pay: a fall of 40% in the sublease income takes the whole spread. " +
        "The master lease ends Dec 2041, 15.2 years from today, with extension options after it as stated: two of 5 years, 10 years in all. When it ends the position ends with it: no building and no land come to the buyer.",
    );
    expect(sandwichTag(SANDWICH, TODAY)).toBe("Spread $720k, 1.65× cover");
    expect(sandwichShortLine(r)).toBe("Sandwich position: subleases $1.82M against a $1.10M master rent (1.65×); the master lease ends Dec 2041");
    expect(sandwichContextLine(r)).toMatch(/^Sandwich position \(a master lease of the building, sublet\): The subleases bring in/);
    // The facts alone: the traps are the interest note's, said once
    // (lib/interest `MASTER_LEASE_TRAPS`, held by its own test).
    expect(sandwichNote(r)).toBe(`SANDWICH POSITION AS STATED: ${r.headline}`);
    expect(sandwichNote(r)).not.toMatch(/TRAPS/);
    for (const text of [r.headline, sandwichShortLine(r), sandwichContextLine(r)]) expect(gluedWords(text)).toEqual([]);
  });

  it("says where the stated NOI is more than the spread, and a position under water", () => {
    const over = readSandwichLease(deal([row("Master lease rent", "$1,100,000"), row("Sublease income", "$1,820,000"), row("NOI (T-12)", "$1,640,000")]), TODAY)!;
    expect(over.noiOverSpread).toEqual({ value: 1_640_000, label: "NOI (T-12)" });
    expect(over.headline).toContain(
      "The stated NOI (T-12), $1.64M, is more than the subleases' income less the master rent, $720k: it counts income beyond the subleases or comes before the master rent",
    );
    const under = readSandwichLease(deal([row("Master lease rent", "$1,100,000"), row("Sublease income", "$950,000")]), TODAY)!;
    expect(under.spread).toBe(-150_000);
    expect(under.cushionPct).toBeNull();
    expect(under.headline).toContain("the position pays $150k a year more than its subtenants bring in.");
    expect(sandwichTag(deal([row("Master lease rent", "$1,100,000"), row("Sublease income", "$950,000")]), TODAY)).toBe("Subleases under the master rent");
  });

  it("reads one rent alone without a spread, a monthly figure twelve times, and never a rate or a range", () => {
    const one = readSandwichLease(deal([row("Master lease rent", "$91,667/mo")]), TODAY)!;
    expect(one.masterRent).toBe(1_100_004);
    expect(one.spread).toBeNull();
    expect(one.headline).toContain("the memorandum states no sublease income beside it, so the spread is not read.");
    // A month's figure, read as twelve, is said so — never "as stated" (the
    // batch-2 audit); a year's figure is as stated.
    expect(one.headline).toContain("The master rent is $1.10M a year, twelve times the month the memorandum states;");
    expect(readSandwichLease(deal([row("Master lease rent", "$1,100,000")]), TODAY)!.headline).toContain("$1.10M a year, as stated;");
    expect(one.headline).toContain("The memorandum states no end for the master lease, so the years the position has are not read");
    expect(annualOf("$22.50/SF")).toBeNull();
    expect(annualOf("$1.0M - $1.2M")).toBeNull();
    expect(annualOf("$1,100,000 a year, increasing 2% annually")).toBe(1_100_000);
    // A pro forma sublease income is not today's.
    expect(readSandwichLease(deal([row("Master lease rent", "$1,100,000"), row("Sublease income (pro forma)", "$2,000,000")]), TODAY)!.subleaseIncome).toBeNull();
  });

  // The batch audit: the month test ran over the whole row, so "$1,100,000
  // per annum ($91,667/month)" was a $13.2M master rent — "the position pays
  // $11.4M a year more than its subtenants bring in" — and "$1,100,000 a
  // year, or $91,667 a month" was said to be "twelve times the month the
  // memorandum states".
  it("reads a year's rent with its month beside it as the year, and says a year as stated", () => {
    const both = deal([
      row("Master lease rent", "$1,100,000 per annum ($91,667/month)"),
      row("Sublease income", "$1,820,000"),
      row("Master lease expiration", "December 31, 2041"),
    ]);
    const r = readSandwichLease(both, TODAY)!;
    expect(r).toMatchObject({ masterRent: 1_100_000, spread: 720_000, masterRentFromMonth: false });
    expect(r.coverage).toBeCloseTo(1.6545, 3);
    expect(r.headline).toContain("The subleases bring in $1.82M a year against the $1.10M master rent: a spread of $720k");
    expect(sandwichTag(both, TODAY)).toBe("Spread $720k, 1.65× cover");
    expect(sandwichShortLine(r)).toContain("subleases $1.82M against a $1.10M master rent (1.65×)");
    const year = readSandwichLease(deal([row("Master lease rent", "$1,100,000 a year, or $91,667 a month"), row("Master lease expiration", "December 31, 2041")]), TODAY)!;
    expect(year).toMatchObject({ masterRent: 1_100_000, masterRentFromMonth: false });
    expect(year.headline).toContain("The master rent is $1.10M a year, as stated;");
    expect(year.headline).not.toContain("twelve times the month");
    expect(annualOf("$1,100,000 per annum ($91,667/month)")).toBe(1_100_000);
  });

  it("is no read off a plain leasehold, a fee simple, or a master leasehold that states nothing", () => {
    expect(readSandwichLease(deal([row("Master lease rent", "$1,100,000")], { summary: "Leasehold under a 99-year ground lease", groundLease: "Ground lease to 2090" }), TODAY)).toBeNull();
    expect(readSandwichLease(deal([row("Master lease rent", "$1,100,000")], { kind: "fee_simple" as never }), TODAY)).toBeNull();
    expect(readSandwichLease(deal([row("NOI", "$720,000")]), TODAY)).toBeNull();
    expect(readSandwichLease(null, TODAY)).toBeNull();
  });

  it("leads the key terms with the two rents and the master lease's end", () => {
    expect(sandwichTermRows(SANDWICH.metrics).map((m) => m.label)).toEqual(["Master lease rent", "Sublease income", "Master lease expiration", "Master lease options"]);
    // A date and a count of years left are one end: the options still come
    // (the batch-2 audit).
    const both = deal([
      row("Master lease rent", "$1,100,000"),
      row("Master lease expiration", "December 31, 2041"),
      row("Master lease term remaining", "15 years"),
      row("Master lease options", "Two 5-year options"),
    ]);
    expect(sandwichTermRows(both.metrics).map((m) => m.label)).toEqual(["Master lease rent", "Master lease expiration", "Master lease options"]);
  });

  it("says subleases that bring in exactly the master rent as no spread, never a shortfall of $0 (the batch-2 audit)", () => {
    const even = deal([row("Master lease rent", "$1,100,000"), row("Sublease income", "$1,100,000")]);
    const r = readSandwichLease(even, TODAY)!;
    expect(r.spread).toBe(0);
    expect(r.headline).toContain("The subleases bring in exactly the $1.10M master rent: the position has no spread before its own costs.");
    expect(r.headline).not.toMatch(/\$0\b/);
    expect(sandwichTag(even, TODAY)).toBe("Subleases equal the master rent");
  });

  it("says the model capitalises the position as if it ran forever, and where it ends against the sale", () => {
    const r = readSandwichLease(SANDWICH, TODAY)!;
    expect(sandwichModelLine(r, { holdYears: 5 })).toBe(
      "The model capitalises the position's income at its sale as if it ran forever; the master lease ends Dec 2041, 10.2 years after the model's sale, and the position with it — the exit on that term is the one to read.",
    );
    const short = readSandwichLease(deal([row("Master lease expiration", "June 30, 2029")]), TODAY)!;
    expect(sandwichModelLine(short, { holdYears: 5 })).toBe(
      "The model capitalises the position's income at its sale as if it ran forever; the master lease ends Jun 2029, inside the model's 5-year hold, so the sale the model prices cannot happen.",
    );
    expect(sandwichModelLine(readSandwichLease(deal([row("Master lease rent", "$1,100,000")]), TODAY), { holdYears: 5 })).toContain("states no end for the master lease");
    expect(sandwichModelLine(null, null)).toBeNull();
  });
});

describe("the master lease's term is the position's, on every surface that reads a leasehold's term", () => {
  it("reads the master lease's rows and never a ground lease's for a sandwich position", () => {
    const both = deal([row("Master lease expiration", "December 31, 2041"), row("Ground lease expiration", "December 31, 2090")]);
    expect(readMasterLeaseTerm(both, TODAY)?.ends).toBe("2041-12-31");
    expect(readGroundLeaseTerm(both, TODAY)?.ends).toBe("2090-12-31");
    expect(leaseholdTermOf(both, TODAY)).toMatchObject({ lease: "master lease", term: { ends: "2041-12-31" } });
    // A plain leasehold keeps its ground lease's term.
    const plain = deal([row("Ground lease expiration", "December 31, 2090")], { summary: "Leasehold under a 99-year ground lease", groundLease: "Ground lease to 2090" });
    expect(leaseholdTermOf(plain, TODAY)).toMatchObject({ lease: "ground lease", term: { ends: "2090-12-31" } });
    // A master lease's termination right or purchase option is no end.
    expect(readMasterLeaseTerm(deal([row("Master lease termination right", "Owner may terminate in 2030")]), TODAY)).toBeNull();
    expect(readMasterLeaseTerm(deal([row("Master lease purchase option", "Exercisable in 2035")]), TODAY)).toBeNull();
  });

  it("tags the position by its master lease and says its term in the interest's own words", () => {
    expect(interestTag(SANDWICH, TODAY)).toBe("Master lease, 15 yrs left");
    expect(interestTag(deal([]), TODAY)).toBe("Master lease");
    const r = readInterest(SANDWICH, 6_500_000, TODAY)!;
    expect(r.termLine).toBe("The master lease ends Dec 2041, 15.2 years from today, with extension options after it as stated: two of 5 years, 10 years in all");
    expect(r.modelCaveat).toContain("On a master lease the position ends with the lease");
  });

  it("values the model's exit on the master lease's term, in a master lease's words", () => {
    const AS_OF = new Date(Date.UTC(2026, 8, 25));
    const sample = (rows: ReturnType<typeof row>[]) =>
      ({
        ...SAMPLE_DEAL.extraction,
        totalPages: 40,
        interest: MASTER,
        metrics: [...SAMPLE_DEAL.extraction.metrics, ...rows],
      }) as ExtractionResult;
    const ex = sample([row("Master lease expiration", "December 31, 2041"), row("Master lease options", "Two 5-year options")]);
    const r = readLeaseholdExit(ex, deriveUnderwriteInputs(ex, SAMPLE_DEAL.name).inputs, AS_OF)!;
    expect(r.lease).toBe("master lease");
    expect(r.subordinated).toBeNull();
    const sentence = leaseholdExitSentence(r);
    expect(sentence).toMatch(/^With 10\.3 years left at the model's sale in year 5, the term bears \d+% of the capitalised exit/);
    expect(sentence).toContain("on a position that ends.");
    expect(sentence).not.toContain("reverts");
    expect(leaseholdOptionsLine(r)).toContain("An option adds years only if the master lessee exercises it, at the rent the master lease sets for it, so that is the ceiling.");
    expect(leaseholdLenderLine(r)).toMatch(/^A buyer's 10-year loan on the position at the sale needs 20 years of master lease left/);
    const v = leaseholdExitView(r);
    expect(v.lease).toBe("master lease");
    expect(v.termLine).toMatch(/^The master lease ends Dec 2041/);
    // Ending inside the hold: the position ends, nothing reverts.
    const short = sample([row("Master lease expiration", "June 30, 2029")]);
    const inHold = readLeaseholdExit(short, deriveUnderwriteInputs(short, SAMPLE_DEAL.name).inputs, AS_OF)!;
    expect(leaseholdExitSentence(inHold)).toBe(
      "The master lease ends Jun 2029, in year 3 of the model's 5-year hold: the position ends with it before the model sells it, so the income after that and the sale proceeds are not this buyer's to collect.",
    );
    for (const text of [sentence, leaseholdOptionsLine(r) ?? "", leaseholdLenderLine(r) ?? ""]) expect(gluedWords(text)).toEqual([]);
  });
});

describe("the prompt asks for what the reader reads", () => {
  it("names each sandwich row by a label the reader's own pattern takes, and reads each one as the extraction writes it", () => {
    const prompt = extractionInstruction("auto");
    for (const label of ["Master lease rent", "Sublease income", "Master lease expiration", "Master lease term remaining", "Master lease options"]) {
      expect(prompt, label).toContain(`"${label}"`);
    }
    expect(MASTER_RENT_ROW.test("Master lease rent")).toBe(true);
    expect(SUBLEASE_INCOME_ROW.test("Sublease income")).toBe(true);
    // The current term, never one that assumes an option; a count only where
    // no date is stated; and never filed under the ground lease's rows.
    expect(prompt).toContain(
      '"Master lease expiration" (the current term\'s end exactly as written, with its month and day where stated — never a date that assumes an option is exercised)',
    );
    expect(prompt).toContain('"Master lease term remaining" (only where the OM states a count of years rather than a date)');
    expect(prompt).toContain("never under the ground rent's or a ground lease's labels");
    // The interest's words the prompt asks for are a master leasehold's, the
    // only interest the reader reads.
    expect(prompt).toContain("(a master lease of the building, sublet to its tenants)");
    const position = (metrics: ReturnType<typeof row>[]) =>
      deal(metrics, { summary: "A master lease of the building, sublet to its tenants", groundLease: "Master lease through December 31, 2041" });
    expect(isMasterLeasehold(position([]))).toBe(true);
    // Each label, as the extraction writes it, is read.
    const stated = position([
      row("Master lease rent", "$1,100,000"),
      row("Sublease income", "$1,820,000"),
      row("Master lease expiration", "December 31, 2041"),
      row("Master lease options", "Two 5-year options"),
    ]);
    const r = readSandwichLease(stated, TODAY)!;
    expect(r).toMatchObject({ masterRent: 1_100_000, subleaseIncome: 1_820_000, spread: 720_000 });
    expect(r.term).toMatchObject({ ends: "2041-12-31", from: "date", options: { years: 10 } });
    // A count of years, where no date is stated, is counted from today.
    expect(readSandwichLease(position([row("Master lease term remaining", "15 years")]), TODAY)!.term).toMatchObject({ ends: "2041-10-05", from: "remaining" });
    expect(sandwichTermRows(stated.metrics).map((m) => m.label)).toEqual(["Master lease rent", "Sublease income", "Master lease expiration", "Master lease options"]);
  });
});
