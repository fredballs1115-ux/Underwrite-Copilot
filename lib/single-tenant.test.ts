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

  it("a count of years is counted from today and said to be possibly short", () => {
    const r = readSingleTenant(ex([row("Lease term remaining", "9.5 years")]), TODAY)!;
    expect(r.term?.from).toBe("remaining");
    expect(r.headline).toContain(
      "The memorandum states 9.5 years left on the lease; counted from today they run to about Mar 2036, and its own date is earlier, so the term may be shorter.",
    );
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
