import { describe, expect, it } from "vitest";
import type { ExtractedSingleTenant, ExtractionResult } from "@/lib/anthropic/types";
import {
  pct2,
  readIncreases,
  readRating,
  readSingleTenant,
  singleTenantContextLine,
  singleTenantModelLine,
  singleTenantNote,
  singleTenantShortLine,
  singleTenantTag,
  singleTenantTermRows,
  type LeaseModel,
} from "./single-tenant";
import { gluedWords } from "./render-lint";
import { extractionInstruction } from "./anthropic/prompts";

// Every read is on one day, so every "years from today" is fixed.
const TODAY = new Date(Date.UTC(2026, 8, 30));

const tenant = (over: Partial<ExtractedSingleTenant> = {}): ExtractedSingleTenant => ({
  tenant: "Walgreens Co.",
  guarantor: "Walgreens Boots Alliance, Inc.",
  leaseType: "Absolute NNN",
  landlordObligations: "",
  tenantRights: "",
  page: "p. 4",
  ...over,
});

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = ""): Row => ({ label, value, flagged: false, page, basis: "na" });

const ex = (metrics: Row[], over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  dealName: "Walgreens | Tulsa, OK",
  assetClass: "net_lease",
  totalPages: 30,
  singleTenant: tenant(),
  metrics: [row("Asking price", "$6,500,000", "p. 2"), row("Going-in cap rate", "6.00%", "p. 2"), ...metrics],
  ...over,
});

/** The Walgreens fixture: a single-tenant net lease laid out the way a
 *  memorandum's lease-abstract page lays one out. */
const WALGREENS = ex([
  row("Lease expiration", "March 31, 2036", "p. 4"),
  row("Renewal options", "Eight 5-year options", "p. 4"),
  row("Rent increases", "10% every 5 years", "p. 4"),
  row("Annual base rent", "$390,000", "p. 4"),
  row("Tenant credit rating", "BBB- (S&P)", "p. 5"),
]);

const MODEL: LeaseModel = { holdMonths: 60, rentGrowthPct: 0.03, vacancyPct: 0.02, exitCapPct: 0.06 };

describe("readIncreases — the primary term's increases, read off their own words", () => {
  it("compounds a step, takes a yearly figure as it is, and reads a flat rent as none", () => {
    const ten5 = readIncreases("10% every 5 years");
    expect(ten5?.kind).toBe("fixed");
    expect(ten5?.annualPct).toBeCloseTo((Math.pow(1.1, 1 / 5) - 1) * 100, 10);
    expect(pct2(ten5!.annualPct!)).toBe("1.92%");
    expect(ten5?.how).toBe("10% every 5 years");
    expect(readIncreases("2% annually")).toEqual({ kind: "fixed", annualPct: 2, how: "2% a year" });
    expect(readIncreases("Annual increases of 1.5%")).toEqual({ kind: "fixed", annualPct: 1.5, how: "1.5% a year" });
    expect(readIncreases("1.5% annual increases")?.annualPct).toBe(1.5);
    expect(readIncreases("2.0% per annum")?.annualPct).toBe(2);
    expect(pct2(readIncreases("Increases of 7.5% every 5 years")!.annualPct!)).toBe("1.46%");
    expect(pct2(readIncreases("3% bumps every 3 years")!.annualPct!)).toBe("0.99%");
    expect(readIncreases("10% every five (5) years, including options")?.how).toBe("10% every 5 years");
    expect(readIncreases("Flat")).toEqual({ kind: "flat", annualPct: 0, how: "flat" });
    expect(readIncreases("None")?.kind).toBe("flat");
    expect(readIncreases("No rent increases during the base term")?.kind).toBe("flat");
  });

  it("reads the primary term only: what the words say of the options is the options'", () => {
    expect(readIncreases("Flat during the primary term; 10% in each renewal option")?.kind).toBe("flat");
    // Increases stated only for the options say nothing of the primary term.
    expect(readIncreases("10% increases in each of the four 5-year options")).toBeNull();
    expect(readIncreases("2% annually (no increases in options)")?.annualPct).toBe(2);
  });

  it("keeps CPI as CPI, and leaves anything it cannot read to be said as stated", () => {
    expect(readIncreases("CPI every 5 years, capped at 10%")).toEqual({ kind: "cpi", annualPct: null, how: "with CPI" });
    expect(readIncreases("Greater of 2% or CPI annually")?.kind).toBe("cpi");
    expect(readIncreases("10% in year 6 and every 5 years thereafter")).toBeNull();
    expect(readIncreases("None stated")).toBeNull();
    expect(readIncreases("")).toBeNull();
    expect(readIncreases(undefined)).toBeNull();
  });
});

describe("readRating — investment grade by the rating's own letters", () => {
  it("grades S&P, Fitch and Moody's letters, and calls a disagreement across the line a split", () => {
    expect(readRating("BBB- (S&P)")?.grade).toBe("investment");
    expect(readRating("Baa2 (Moody's)")?.grade).toBe("investment");
    expect(readRating("A+")?.grade).toBe("investment");
    expect(readRating("BB+ (S&P)")?.grade).toBe("speculative");
    expect(readRating("Ba1")?.grade).toBe("speculative");
    expect(readRating("Baa3 / BB+")?.grade).toBe("split");
  });

  it("an unrated tenant is said to be unrated, and words with no letters are kept as stated", () => {
    expect(readRating("Not rated")).toEqual({ stated: "Not rated", grade: null, unrated: true });
    expect(readRating("N/A")?.unrated).toBe(true);
    expect(readRating("Investment grade")).toEqual({ stated: "Investment grade", grade: null, unrated: false });
    expect(readRating("")).toBeNull();
  });
});

describe("readSingleTenant — the one lease the deal is", () => {
  it("reads the tenant, the term, the options, the increases, the rent and the rating", () => {
    const r = readSingleTenant(WALGREENS, TODAY)!;
    expect(r.tenant).toBe("Walgreens Co.");
    expect(r.guarantor).toBe("Walgreens Boots Alliance, Inc.");
    expect(r.page).toBe("p. 4");
    expect(r.term?.ends).toBe("2036-03-31");
    expect(r.term?.from).toBe("date");
    expect(r.term?.yearsLeft).toBeCloseTo(9.5, 10);
    expect(r.term?.options).toEqual({ years: 40, how: "eight of 5 years" });
    expect(r.effective).toEqual({ ends: "2036-03-31", from: "date", yearsLeft: 9.5, early: false });
    expect(r.increases?.kind).toBe("fixed");
    expect(r.rent).toBe(390_000);
    expect(r.rating?.grade).toBe("investment");
  });

  it("says who, until when and how the rent grows", () => {
    const r = readSingleTenant(WALGREENS, TODAY)!;
    expect(r.headline).toBe(
      "Walgreens Co. leases the whole property, the rent guaranteed by Walgreens Boots Alliance, Inc. as stated — rated BBB- (S&P), investment grade. " +
        "The lease ends Mar 2036, 9.5 years from today, then renewal options as stated, eight of 5 years, 40 years in all — the tenant's to exercise, not the buyer's. " +
        "The rent rises 10% every 5 years, as stated — 1.92% a year compounded.",
    );
    expect(gluedWords(r.headline)).toEqual([]);
  });

  it("sets the lease against the model: the years left at its sale, and the increases against its growth", () => {
    const r = readSingleTenant(WALGREENS, TODAY)!;
    expect(singleTenantModelLine(r, MODEL)).toBe(
      "At the model's sale in 5 years the lease has 4.5 years left, before the tenant's renewal options: the next buyer prices those years of this tenant's rent and a renewal the tenant decides, and the model's 6.00% exit cap is one figure whatever the term left. " +
        "The model grows the rent 3.0% a year; the lease's own increases are 1.92% a year, so the model's income runs ahead of the lease's — enter 1.92% as the rent growth to run the model on the lease.",
    );
    // A model growing the rent slower than the lease understates it.
    expect(singleTenantModelLine(r, { ...MODEL, rentGrowthPct: 0.0 })).toContain(
      "The lease's own increases, 1.92% a year, run ahead of the model's 0.0%: the model understates the lease's income",
    );
    expect(singleTenantModelLine(r, { ...MODEL, rentGrowthPct: 0.02 })).toContain("sits with the lease's own increases");
  });

  it("a flat rent under a growing model is income the model invents", () => {
    const flat = ex([row("Lease expiration", "12/31/2040"), row("Rent increases", "Flat")]);
    const r = readSingleTenant(flat, TODAY)!;
    expect(r.headline).toContain("The rent is flat until Dec 2040, as stated — a fixed income that inflation erodes every year the lease runs.");
    expect(singleTenantModelLine(r, MODEL)).toContain(
      "The model grows the rent 3.0% a year; the lease's own increases are none, the rent being flat, so the model's income runs ahead of the lease's — enter 0% as the rent growth to run the model on the lease.",
    );
  });

  it("a lease ending inside the hold: the model's rent after it is the tenant's choice", () => {
    const short = ex([row("Lease expiration", "2029"), row("Rent increases", "Flat")]);
    const r = readSingleTenant(short, TODAY)!;
    // A year alone is its first day — the earliest end the year allows.
    expect(r.term?.ends).toBe("2029-01-01");
    expect(r.headline).toContain("The lease ends in 2029, 2.3 years from today — the memorandum states the year alone, read as its first day.");
    expect(singleTenantModelLine(r, MODEL)).toBe(
      "The lease ends in 2029, inside the model's 5-year hold: the model's rent after that is this tenant staying — the tenant's choice, not the buyer's — and its 2.0% vacancy is a market's allowance, not a single tenant's all-or-nothing.",
    );
    // No growth line: after the lease ends the growth is a renewal's question.
    expect(singleTenantModelLine(r, MODEL)).not.toContain("rent growth");
    expect(singleTenantModelLine(r, { ...MODEL, vacancyPct: 0 })).toContain("it allows no vacancy for the tenant leaving");
    expect(singleTenantTag(short, TODAY)).toBe("Single tenant, 2 yrs left");
  });

  it("an early termination is the lease's end", () => {
    const early = ex([row("Lease expiration", "March 31, 2036"), row("Early termination date", "December 31, 2030")]);
    const r = readSingleTenant(early, TODAY)!;
    expect(r.early?.ends).toBe("2030-12-31");
    expect(r.effective?.early).toBe(true);
    expect(r.headline).toContain(
      "The tenant may end the lease early from Dec 2030, 4.3 years from today, as stated — read that as the lease's end: the tenant decides, and a lender will not count past it.",
    );
    expect(singleTenantModelLine(r, MODEL)).toContain("The lease may end Dec 2030, inside the model's 5-year hold");
    expect(singleTenantTag(early, TODAY)).toBe("Single tenant, may leave in 4 yrs");
    // A "termination" dated after the term is no earlier than the lease.
    const late = readSingleTenant(ex([row("Lease expiration", "2036"), row("Early termination date", "2040")]), TODAY)!;
    expect(late.early).toBeNull();
    // One already open: every year of the hold is the tenant's choice.
    const open = readSingleTenant(ex([row("Lease expiration", "2036"), row("Early termination date", "June 30, 2025")]), TODAY)!;
    expect(open.headline).toContain("The tenant's right to end the lease early opened Jun 2025, as stated");
    expect(singleTenantModelLine(open, MODEL)).toContain("The tenant's right to end the lease early is already open");
  });

  // Research pass 28: a government lease's firm term was never read. The
  // tag said "Single tenant, 8 yrs left" and the model line "the lease has 3
  // years left" at its sale, on a lease the government may leave on notice
  // once its firm term ends — inside the hold.
  it("a firm term's end is when the tenant may leave, never the lease's end", () => {
    const gsa = (firm: Row[]) =>
      ex([row("Lease expiration", "Sep 30, 2034", "p. 3"), ...firm], {
        dealName: "Federal Building | Government-Leased Office (GSA)",
        assetClass: "office",
        singleTenant: tenant({ tenant: "United States of America (GSA)", guarantor: "", leaseType: "Modified gross" }),
      });
    const deal = gsa([row("Firm term expiration", "Sep 30, 2029", "p. 3")]);
    const r = readSingleTenant(deal, TODAY)!;
    expect(r.term?.ends).toBe("2034-09-30");
    expect(r.early?.ends).toBe("2029-09-30");
    expect(r.effective).toEqual({ ends: "2029-09-30", from: "date", yearsLeft: 3, early: true });
    expect(singleTenantTag(deal, TODAY)).toBe("Single tenant, may leave in 3 yrs");
    const line = singleTenantModelLine(r, MODEL);
    expect(line).toBe(
      "The lease may end Sep 2029, inside the model's 5-year hold: the model's rent after that is this tenant staying — the tenant's choice, not the buyer's — and its 2.0% vacancy is a market's allowance, not a single tenant's all-or-nothing.",
    );
    expect(line).not.toContain("years left");
    expect(r.headline).toContain("The tenant may end the lease early from Sep 2029");
    expect(gluedWords(`${r.headline} ${line}`)).toEqual([]);
    // The firm term's end under the labels a memorandum gives it.
    for (const label of ["Firm term end", "Firm term ends", "End of firm term", "Lease expiration (firm term)"]) {
      expect(readSingleTenant(gsa([row(label, "Sep 30, 2029")]), TODAY)?.early?.ends, label).toBe("2029-09-30");
    }
    // Listed first, it is never read as the lease's own end, here or in the key terms.
    const first = ex([row("Lease firm term expiration", "Sep 30, 2029"), row("Lease expiration", "Sep 30, 2034")]);
    expect(readSingleTenant(first, TODAY)?.term?.ends).toBe("2034-09-30");
    expect(readSingleTenant(first, TODAY)?.early?.ends).toBe("2029-09-30");
    expect(singleTenantTermRows(first.metrics).map((m) => m.label)).toContain("Lease expiration");
    expect(singleTenantTermRows(first.metrics).map((m) => m.label)).not.toContain("Lease firm term expiration");
    // A firm term stated as a length is no date, and the lease keeps its own end.
    const length = readSingleTenant(gsa([row("Firm term", "10 years (2019–2029)")]), TODAY)!;
    expect(length.early).toBeNull();
    expect(singleTenantTag(gsa([row("Firm term", "10 years")]), TODAY)).toBe("Single tenant, 8 yrs left");
    // The extraction is asked to file a firm term's end where the reader reads it.
    expect(extractionInstruction("office" as never)).toContain(
      `under "Early termination date" exactly as written (a firm term's end, where the lease states one: after its firm term the tenant may leave on notice)`,
    );
  });

  it("a count of years is counted from today and said to be possibly short", () => {
    const r = readSingleTenant(ex([row("Lease term remaining", "9.5 years")]), TODAY)!;
    expect(r.term?.from).toBe("remaining");
    expect(r.startsAtDelivery).toBe(false);
    expect(r.headline).toContain(
      "The memorandum states 9.5 years left on the lease; counted from today they run to about Mar 2036, and its own date is earlier, so the term may be shorter.",
    );
    expect(singleTenantShortLine(r)).toContain("the lease ends Mar 2036, 9.5 years from today");
  });

  // Research pass 23: a build-to-suit or a forward purchase read as a
  // development leases a building that is not yet delivered — its term
  // begins at delivery, so "counted from today … may be shorter" said it
  // backwards.
  it("on a building not yet delivered, a count of years runs from the lease's start, never from today", () => {
    const bts = (kind: "development" | "conversion" | "stabilized" | "lease_up") =>
      readSingleTenant(
        ex([row("Lease term remaining", "15 years"), row("Rent increases", "1.5% annually")], {
          dealName: "Amazon build-to-suit",
          strategy: { kind, summary: "A build-to-suit distribution center leased to Amazon, delivered in 2027", capitalBudget: "", timeline: "" },
        }),
        TODAY,
      )!;
    const dev = bts("development");
    expect(dev.startsAtDelivery).toBe(true);
    expect(dev.headline).toContain(
      "The memorandum states 15 years on the lease; the building is not yet delivered, so the term is counted from the lease's start, not from today.",
    );
    expect(dev.headline).not.toContain("may be shorter");
    expect(dev.headline).not.toContain("counted from today");
    expect(singleTenantShortLine(dev)).toContain("15 years on the lease, counted from its start — the building is not yet delivered");
    expect(singleTenantShortLine(dev)).not.toContain("from today");
    expect(singleTenantNote(dev)).toContain("(b) THE TERM AT THE EXIT — 15 years as stated, counted from the lease's start, not today, since the building is not yet delivered");
    expect(singleTenantContextLine(dev)).not.toContain("may be shorter");
    expect(gluedWords(`${dev.headline} ${singleTenantShortLine(dev)}`)).toEqual([]);
    // A conversion's new use comes with the works too.
    expect(bts("conversion").headline).toContain("counted from the lease's start, not from today");
    // A building that stands — stabilized, or a lease-up — keeps today's count and its caution.
    for (const kind of ["stabilized", "lease_up"] as const) {
      const r = bts(kind);
      expect(r.startsAtDelivery, kind).toBe(false);
      expect(r.headline, kind).toContain("counted from today they run to about");
      expect(r.headline, kind).toContain("so the term may be shorter");
    }
    // A stated date is a date, delivered or not.
    const dated = readSingleTenant(
      ex([row("Lease expiration", "March 31, 2042")], { strategy: { kind: "development", summary: "", capitalBudget: "", timeline: "" } }),
      TODAY,
    )!;
    expect(dated.headline).toContain("The lease ends Mar 2042, 15.5 years from today.");
  });

  // The reader's sentences counted that term from the lease's start; the
  // pipeline's tag and the model's read (the panel, the workbook's cover,
  // the report) still counted it from today: "Single tenant, 15 yrs left",
  // and "the lease has 10 years left" at the sale of a lease not yet begun.
  it("on a building not yet delivered, the tag and the model's read say the term runs from delivery, never years left today", () => {
    const bts = (count: string, kind: "development" | "conversion" | "stabilized" = "development", more: Row[] = []) =>
      ex([row("Lease term remaining", count), row("Rent increases", "1.5% annually"), ...more], {
        dealName: "Amazon build-to-suit",
        strategy: { kind, summary: "A build-to-suit distribution center leased to Amazon, delivered in 2027", capitalBudget: "", timeline: "" },
      });
    expect(singleTenantTag(bts("15 years"), TODAY)).toBe("Single tenant, 15 yrs from delivery");
    const line = singleTenantModelLine(readSingleTenant(bts("15 years"), TODAY)!, MODEL);
    expect(line).toBe(
      "The lease runs 15 years from delivery, not from today, so it outlasts the model's 5-year hold whenever the building is delivered, and how much of it is left at the sale turns on that date: the next buyer prices those years of this tenant's rent and a renewal the tenant decides, and the model's 6.00% exit cap is one figure whatever the term left. " +
        "The model grows the rent 3.0% a year; the lease's own increases are 1.5% a year, so the model's income runs ahead of the lease's — enter 1.5% as the rent growth to run the model on the lease.",
    );
    // A term shorter than the hold ends inside it only where the building
    // is delivered soon enough — said so, with no growth line.
    const short = singleTenantModelLine(readSingleTenant(bts("3 years"), TODAY)!, MODEL);
    expect(short).toBe(
      "The lease runs 3 years from delivery, not from today, so it ends inside the model's 5-year hold if the building is delivered within 2 years: the model's rent after that is this tenant staying — the tenant's choice, not the buyer's — and its 2.0% vacancy is a market's allowance, not a single tenant's all-or-nothing.",
    );
    expect(singleTenantTag(bts("3 years"), TODAY)).toBe("Single tenant, 3 yrs from delivery");
    for (const said of [line, short]) {
      expect(said).not.toMatch(/years? left|from today they/);
      expect(gluedWords(said)).toEqual([]);
    }
    // A conversion's new use comes with the works too.
    expect(singleTenantTag(bts("15 years", "conversion"), TODAY)).toBe("Single tenant, 15 yrs from delivery");
    // A building that stands keeps today's count.
    expect(singleTenantTag(bts("15 years", "stabilized"), TODAY)).toBe("Single tenant, 15 yrs left");
    expect(singleTenantModelLine(readSingleTenant(bts("15 years", "stabilized"), TODAY)!, MODEL)).toMatch(
      /^At the model's sale in 5 years the lease has 10 years left:/,
    );
    // A stated date is a date, and so is the tenant's right to leave early.
    expect(singleTenantTag(ex([row("Lease expiration", "March 31, 2042")], { strategy: bts("1 year").strategy }), TODAY)).toBe(
      "Single tenant, 15 yrs left",
    );
    expect(singleTenantTag(bts("15 years", "development", [row("Early termination date", "December 31, 2034")]), TODAY)).toBe(
      "Single tenant, may leave in 8 yrs",
    );
  });

  // The second pre-merge audit: a term counted from a delivery not yet
  // dated has no end to set a stated early date against, so the date was
  // compared with an end counted from today and dropped — 2042 said nowhere;
  // the from-delivery read lost a comma; and a count "including options"
  // was tagged and drawn as the lease, where it is the lease's ceiling.
  it("on a building not yet delivered, keeps a stated early date, and says a count with its options as a ceiling", () => {
    const bts = (count: string, more: Row[] = []) =>
      ex([row("Lease term remaining", count), ...more], {
        strategy: { kind: "development", summary: "A build-to-suit", capitalBudget: "", timeline: "" },
      });
    // The early date stands, and is the lease's end.
    const early = readSingleTenant(bts("15 years", [row("Early termination date", "December 31, 2042")]), TODAY)!;
    expect(early.early?.ends).toBe("2042-12-31");
    expect(early.effective?.early).toBe(true);
    expect(early.headline).toContain("The tenant may end the lease early from Dec 2042");
    expect(singleTenantTag(bts("15 years", [row("Early termination date", "December 31, 2042")]), TODAY)).toBe(
      "Single tenant, may leave in 16 yrs",
    );
    // The clause closes before its verb.
    const opts = singleTenantModelLine(readSingleTenant(bts("15 years", [row("Renewal options", "Two 5-year options")]), TODAY)!, MODEL);
    expect(opts).toContain("how much of it is left at the sale, before the tenant's renewal options, turns on that date");
    // A count with its options in it is a ceiling, from delivery and from today.
    expect(singleTenantTag(bts("35 years including options"), TODAY)).toBe("Single tenant, up to 35 yrs from delivery");
    const ceiling = singleTenantModelLine(readSingleTenant(bts("35 years including options"), TODAY)!, MODEL);
    expect(ceiling).toMatch(/^The lease runs up to 35 years from delivery, its renewal options counted in, not from today: a ceiling/);
    expect(ceiling).not.toContain("outlasts the model's 5-year hold whenever");
    const standing = ex([row("Lease term remaining", "35 years including options")]);
    expect(singleTenantTag(standing, TODAY)).toBe("Single tenant, up to 35 yrs left");
    expect(singleTenantModelLine(readSingleTenant(standing, TODAY)!, MODEL)).toMatch(
      /^At the model's sale in 5 years the lease has up to 30 years left, its renewal options counted in:/,
    );
    for (const said of [early.headline, opts, ceiling]) expect(gluedWords(said)).toEqual([]);
  });

  it("a passed end, and no end, are said as what they are", () => {
    const passed = readSingleTenant(ex([row("Lease expiration", "June 30, 2025")]), TODAY)!;
    expect(passed.headline).toContain("The lease's stated end, Jun 2025, has passed");
    expect(singleTenantModelLine(passed, MODEL)).toBe("");
    expect(singleTenantTag(ex([row("Lease expiration", "June 30, 2025")]), TODAY)).toBe("Single tenant");
    const none = readSingleTenant(ex([]), TODAY)!;
    expect(none.headline).toContain("The memorandum states no date the lease ends");
    expect(singleTenantModelLine(none, MODEL)).toBe("");
    expect(singleTenantTag(ex([]), TODAY)).toBe("Single tenant");
  });

  it("reads the tenant's lease and never a ground lease's, a loan's or a note's", () => {
    const leasehold = ex(
      [row("Ground lease expiration", "December 31, 2071"), row("Assumable loan maturity", "June 1, 2029"), row("Lease expiration", "March 31, 2036")],
      { interest: { kind: "leasehold", summary: "", share: "", groundLease: "a 99-year ground lease", loan: "", page: "" } },
    );
    expect(readSingleTenant(leasehold, TODAY)?.term?.ends).toBe("2036-03-31");
    const groundOnly = ex([row("Ground lease expiration", "December 31, 2071")]);
    expect(readSingleTenant(groundOnly, TODAY)?.term).toBeNull();
  });

  it("nothing on a multi-tenant deal, a leased fee, a note, or an extraction from before", () => {
    expect(readSingleTenant(ex([], { singleTenant: tenant({ tenant: "" }) }), TODAY)).toBeNull();
    expect(readSingleTenant(ex([], { singleTenant: undefined }), TODAY)).toBeNull();
    const blank = { summary: "", share: "", groundLease: "", loan: "", page: "" };
    expect(readSingleTenant(ex([], { interest: { ...blank, kind: "leased_fee" } }), TODAY)).toBeNull();
    expect(readSingleTenant(ex([], { interest: { ...blank, kind: "note" } }), TODAY)).toBeNull();
    expect(singleTenantTag(ex([], { singleTenant: tenant({ tenant: "" }) }), TODAY)).toBeNull();
    expect(singleTenantTag(null, TODAY)).toBeNull();
  });

  it("a monthly rent is not the year's, and a per-foot rent is not a building's", () => {
    expect(readSingleTenant(ex([row("Annual base rent", "$32,500/month")]), TODAY)?.rent).toBeNull();
    expect(readSingleTenant(ex([row("Base rent", "$20.42/SF")]), TODAY)?.rent).toBeNull();
    expect(readSingleTenant(ex([row("Annual base rent", "$245,000 ($20.42 PSF)")]), TODAY)?.rent).toBe(245_000);
  });

  it("reads a base rent with a hyphenated word beside the figure (research pass 37)", () => {
    // Any hyphen in the value had read as no rent.
    expect(readSingleTenant(ex([row("Annual base rent", "$468,000 (flat, 10-year primary term remaining)")]), TODAY)?.rent).toBe(468_000);
    expect(readSingleTenant(ex([row("Annual base rent", "$468,000 - $490,000")]), TODAY)?.rent).toBeNull();
  });

  it("a page is cited only inside the memorandum", () => {
    expect(readSingleTenant(ex([], { singleTenant: tenant({ page: "p. 45" }) }), TODAY)?.page).toBe("");
  });
});

describe("the lease on every summary", () => {
  it("the pipeline tag, the short line and the context", () => {
    expect(singleTenantTag(WALGREENS, TODAY)).toBe("Single tenant, 9 yrs left");
    const r = readSingleTenant(WALGREENS, TODAY)!;
    expect(singleTenantShortLine(r)).toBe(
      "Single tenant: Walgreens Co., guaranteed by Walgreens Boots Alliance, Inc., Absolute NNN; the lease ends Mar 2036, 9.5 years from today, then renewal options (eight of 5 years); the rent rises 10% every 5 years",
    );
    const context = singleTenantContextLine(r);
    expect(context.startsWith("Single tenant: Walgreens Co. leases the whole property")).toBe(true);
    expect(context).toContain("Lease type as stated: Absolute NNN.");
    expect(context).toContain("Annual base rent as stated: $390,000.");
    expect(context.endsWith("(p. 4)")).toBe(true);
    expect(gluedWords(context)).toEqual([]);
  });

  it("no guarantor, no rights stated: the traps say so by name", () => {
    const r = readSingleTenant(ex([], { singleTenant: tenant({ guarantor: "" }) }), TODAY)!;
    expect(r.headline).toContain("Walgreens Co. leases the whole property, and the memorandum names no guarantor.");
    const note = singleTenantNote(r);
    expect(note).toContain("SINGLE-TENANT TRAPS, checked by name");
    expect(note).toContain("the memorandum names no guarantor: the tenant entity alone stands behind the rent");
    expect(note).toContain("(g) THE TENANT'S RIGHTS — none stated");
    expect(note).toContain("(e) THE INCREASES — the memorandum states no schedule of increases");
  });

  it("the tenant's rights, named by their own words", () => {
    const r = readSingleTenant(
      ex([row("Rent increases", "Flat")], {
        singleTenant: tenant({
          tenantRights: "Tenant holds a 15-day right of first refusal on any sale, and may terminate after lease year 10",
          landlordObligations: "Roof and structure",
        }),
      }),
      TODAY,
    )!;
    const note = singleTenantNote(r);
    expect(note).toContain("a right of first refusal on a sale: every bid at the exit can be matched by the tenant");
    expect(note).toContain("a termination right: the lease's real end is the first date the tenant may use it");
    expect(note).toContain("(f) LANDLORD OBLIGATIONS — as stated: Roof and structure");
    expect(note).toContain("(e) A FLAT RENT — a fixed income for the term");
  });

  it("the key terms lead with the lease's end, its increases and its options", () => {
    const rows = singleTenantTermRows(WALGREENS.metrics);
    expect(rows.map((m) => m.label)).toEqual(["Lease expiration", "Rent increases", "Renewal options"]);
    // The years left stand in for an end the memorandum does not date.
    expect(singleTenantTermRows([row("Lease term remaining", "9.5 years")]).map((m) => m.label)).toEqual(["Lease term remaining"]);
    expect(singleTenantTermRows([row("Ground lease expiration", "2071")])).toEqual([]);
  });

  it("every label the prompt asks for is one the reader reads", () => {
    const prompt = extractionInstruction("net_lease" as never);
    const labels = [
      "Lease expiration",
      "Lease term remaining",
      "Renewal options",
      "Rent increases",
      "Annual base rent",
      "Tenant credit rating",
      "Early termination date",
    ];
    for (const label of labels) expect(prompt).toContain(`"${label}"`);
    const r = readSingleTenant(
      ex([
        row("Lease expiration", "March 31, 2036"),
        row("Renewal options", "Four 5-year options"),
        row("Rent increases", "2% annually"),
        row("Annual base rent", "$390,000"),
        row("Tenant credit rating", "Baa2"),
        row("Early termination date", "December 31, 2033"),
      ]),
      TODAY,
    )!;
    expect(r.term?.ends).toBe("2036-03-31");
    expect(r.term?.options?.how).toBe("four of 5 years");
    expect(r.increases?.annualPct).toBe(2);
    expect(r.rent).toBe(390_000);
    expect(r.rating?.grade).toBe("investment");
    expect(r.early?.ends).toBe("2033-12-31");
    expect(readSingleTenant(ex([row("Lease term remaining", "7 years")]), TODAY)?.term?.from).toBe("remaining");
  });
});

describe("a sandwich position's master lease is never its subtenant's lease (research pass 28)", () => {
  it("reads the subtenant's own lease on a master leasehold, and a net lease's master lease as the tenant's", () => {
    const master = {
      kind: "leasehold" as const,
      summary: "Leasehold interest under a master lease of the building, sublet to one tenant",
      share: "",
      groundLease: "Master lease of the building from its owner",
      loan: "",
      page: "",
    };
    // The master lease's end and its remaining term listed first: the
    // subtenant's lease is read from its own row.
    const rows = [row("Master lease expiration", "December 31, 2041"), row("Master lease term remaining", "15 years"), row("Lease expiration", "March 31, 2036")];
    expect(readSingleTenant(ex(rows, { interest: master }), TODAY)!.term?.ends).toBe("2036-03-31");
    // Only the master lease's end stated: nothing is read for the subtenant.
    expect(readSingleTenant(ex([row("Master lease expiration", "December 31, 2041")], { interest: master }), TODAY)!.term).toBeNull();
    // A net lease's master lease, on a building sold outright, is the tenant's.
    expect(readSingleTenant(ex([row("Master lease expiration", "December 31, 2041")]), TODAY)!.term?.ends).toBe("2041-12-31");
  });
});
