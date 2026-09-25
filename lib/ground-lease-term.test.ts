import { describe, expect, it } from "vitest";
import { groundLeaseTermLine, readGroundLeaseTerm, readOptions, termEndLabel } from "@/lib/ground-lease-term";

// Every reading is on one pinned day, so a year left is a year left.
const ASOF = new Date("2026-09-25T12:00:00Z");
const rows = (metrics: Array<{ label: string; value: string; page?: string }>, totalPages = 40) => ({
  totalPages,
  metrics: metrics.map((m) => ({ page: "", ...m })),
});

describe("readGroundLeaseTerm — when the ground lease ends, only as stated", () => {
  it("reads a stated date as written, with the years left on the day", () => {
    const t = readGroundLeaseTerm(rows([{ label: "Ground lease expiration", value: "December 31, 2071", page: "p. 12" }]), ASOF)!;
    expect(t.ends).toBe("2071-12-31");
    expect(t.from).toBe("date");
    // Sep 2026 → Dec 2071: 543 whole months.
    expect(t.yearsLeft).toBeCloseTo(543 / 12, 6);
    expect(t.page).toBe("p. 12");
    expect(termEndLabel(t)).toBe("Dec 2071");
    expect(groundLeaseTermLine(t)).toBe("The ground lease ends Dec 2071, 45.3 years from today");
  });

  it("reads a year alone as its first day — the earliest end the year allows — and says so", () => {
    const t = readGroundLeaseTerm(rows([{ label: "Ground Lease Expiration", value: "2071" }]), ASOF)!;
    expect(t.ends).toBe("2071-01-01");
    expect(t.from).toBe("year");
    expect(t.yearsLeft).toBeCloseTo(531 / 12, 6);
    expect(groundLeaseTermLine(t)).toBe(
      "The ground lease ends in 2071, 44.3 years from today — the memorandum states the year alone, read as its first day",
    );
  });

  it("reads a ninety-nine-year lease's end in the next century, which a loan's maturity reader refuses", () => {
    const t = readGroundLeaseTerm(rows([{ label: "Ground lease expiration", value: "June 30, 2119" }]), ASOF)!;
    expect(t.ends).toBe("2119-06-30");
    expect(Math.round(t.yearsLeft)).toBe(93);
  });

  it("counts years remaining from today, and says the memorandum's own date is earlier", () => {
    const t = readGroundLeaseTerm(rows([{ label: "Ground lease term remaining", value: "45 years" }]), ASOF)!;
    expect(t.from).toBe("remaining");
    expect(t.ends).toBe("2071-09-25");
    expect(t.yearsLeft).toBe(45);
    expect(groundLeaseTermLine(t)).toBe(
      "The memorandum states 45 years left on the ground lease; counted from today they run to about Sep 2071, and the memorandum's own date is earlier, so the term may be shorter",
    );
    const half = readGroundLeaseTerm(rows([{ label: "Remaining ground lease term", value: "45 years, 6 months" }]), ASOF)!;
    expect(half.yearsLeft).toBe(45.5);
  });

  it("prefers a stated date to a count of years, which goes stale as the memorandum ages", () => {
    const t = readGroundLeaseTerm(
      rows([
        { label: "Ground lease term remaining", value: "47 years" },
        { label: "Ground lease expiration", value: "12/31/2071" },
      ]),
      ASOF,
    )!;
    expect(t.from).toBe("date");
    expect(t.ends).toBe("2071-12-31");
  });

  it("reads the term apart from the options stated after it, and reads the options", () => {
    const t = readGroundLeaseTerm(rows([{ label: "Ground lease expiration", value: "December 31, 2071, with four 10-year extension options" }]), ASOF)!;
    expect(t.ends).toBe("2071-12-31");
    expect(t.includesOptions).toBe(false);
    expect(t.options).toEqual({ years: 40, how: "four of 10 years" });
    expect(groundLeaseTermLine(t)).toBe(
      "The ground lease ends Dec 2071, 45.3 years from today, with extension options after it as stated: four of 10 years, 40 years in all",
    );
  });

  it("reads the options off their own row, in the forms memoranda write them", () => {
    const withRow = (value: string) =>
      readGroundLeaseTerm(
        rows([
          { label: "Ground lease expiration", value: "2071" },
          { label: "Ground lease extension options", value },
        ]),
        ASOF,
      )!.options;
    expect(withRow("Four (4) ten (10) year options")).toEqual({ years: 40, how: "four of 10 years" });
    expect(withRow("4 x 10 years")).toEqual({ years: 40, how: "four of 10 years" });
    expect(withRow("Three successive 10-year renewal options")).toEqual({ years: 30, how: "three of 10 years" });
    expect(withRow("One 25-year option")).toEqual({ years: 25, how: "one of 25 years" });
    expect(withRow("A 25-year renewal option at fair market rent")).toEqual({ years: 25, how: "one of 25 years" });
    expect(withRow("Two five-year options")).toEqual({ years: 10, how: "two of 5 years" });
    // A date the options run to: the years between the two ends.
    expect(withRow("Extendable to 2111")).toEqual({ years: 40, how: "to 2111" });
  });

  it("never reads a 25-year option as two of five years", () => {
    expect(readOptions("25-year option")).toEqual({ years: 25, how: "one of 25 years" });
    expect(readOptions("25-year options")).toBeNull();
  });

  it("keeps options it cannot read as stated, and never guesses at them", () => {
    const t = readGroundLeaseTerm(
      rows([
        { label: "Ground lease expiration", value: "2071" },
        { label: "Ground lease extension options", value: "Options at the tenant's election, subject to rent reset" },
      ]),
      ASOF,
    )!;
    expect(t.options).toBeNull();
    expect(t.optionsStated).toBe("Options at the tenant's election, subject to rent reset");
    expect(groundLeaseTermLine(t)).toContain("with extension options as stated: Options at the tenant's election, subject to rent reset");
  });

  it("marks a term that already counts its options as a ceiling, and reads no options on top of it", () => {
    const t = readGroundLeaseTerm(rows([{ label: "Ground lease term remaining", value: "85 years (including all extension options)" }]), ASOF)!;
    expect(t.yearsLeft).toBe(85);
    expect(t.includesOptions).toBe(true);
    expect(t.options).toBeNull();
    expect(groundLeaseTermLine(t)).toContain("a term that already counts its extension options, so a ceiling rather than the term");
  });

  it("never reads a purchase option as an extension, or a tenant's lease as the ground lease", () => {
    const t = readGroundLeaseTerm(
      rows([
        { label: "Lease expiration", value: "2031" },
        { label: "Ground lease purchase option", value: "Option to buy the land in 2040 for $9M" },
        { label: "Ground lease expiration", value: "March 2066; the tenant includes a purchase option on the land" },
      ]),
      ASOF,
    )!;
    expect(t.ends).toBe("2066-03-31");
    expect(t.includesOptions).toBe(false);
    expect(t.options).toBeNull();
    expect(t.optionsStated).toBe("");
  });

  it("is null where no end, year or count is stated — nothing is assumed", () => {
    expect(readGroundLeaseTerm(rows([{ label: "Ground rent", value: "$1,200,000" }]), ASOF)).toBeNull();
    expect(readGroundLeaseTerm(rows([{ label: "Ground lease expiration", value: "Long-term" }]), ASOF)).toBeNull();
    expect(readGroundLeaseTerm(null, ASOF)).toBeNull();
  });

  it("says an end that has passed cannot be right, rather than valuing a negative term", () => {
    const t = readGroundLeaseTerm(rows([{ label: "Ground lease expiration", value: "March 2020" }]), ASOF)!;
    expect(t.yearsLeft).toBeLessThan(0);
    expect(groundLeaseTermLine(t)).toBe(
      "The ground lease's stated end, Mar 2020, has passed — the term as read cannot be right: check the lease and any extension already exercised",
    );
  });

  it("cites the page only where it parses and falls inside the memorandum", () => {
    const at = (page: string) =>
      readGroundLeaseTerm(rows([{ label: "Ground lease expiration", value: "2071", page }], 40), ASOF)!.page;
    expect(at("p. 12")).toBe("p. 12");
    expect(at("p. 412")).toBe("");
    expect(at("")).toBe("");
  });
});
