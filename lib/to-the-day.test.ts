import { describe, expect, it } from "vitest";
import type { ExtractedHotel, ExtractedSingleTenant, ExtractedTenant, ExtractionResult } from "@/lib/anthropic/types";
import { daysBetween, monthsBetween, readNote, yearsBetween, type NoteTerms } from "./note-yield";
import { interestShortLine, interestTag, noteCaption, noteYieldSentence, readInterest } from "./interest";
import { assumableSentence, readAssumable } from "./assumable-debt";
import { readRoster } from "./tenant-roster";
import { readSingleTenant, singleTenantModelLine, singleTenantShortLine, singleTenantTag } from "./single-tenant";
import { hotelModelLine, readHotelDeal } from "./hotel-deal";
import { readTaxAbatement, taxAbatementShortLine, taxAbatementTag } from "./tax-abatement";
import { affordableShortLine, readAffordable } from "./affordable";
import { groundLeaseTermLine, readGroundLeaseTerm } from "./ground-lease-term";
import { leaseholdExitSentence, readLeaseholdExit } from "./leasehold-exit";
import { gluedWords } from "./render-lint";
import { SAMPLE_DEAL } from "./sample-deal";
import { deriveUnderwriteInputs } from "./underwrite/inputs";

/**
 * Past, today and before a date are said by the DAY (the time audit of
 * 2026-10-01). Every "years left" was whole months ÷ 12, which counts none
 * in a date's last month: a note maturing March 1, 2028, read on Feb 2,
 * was "past its Mar 2028 maturity"; a loan due next month had "come due";
 * a lease four weeks from its end had "passed"; and with the roster's
 * rounding up, a lease ending 12 months and 17 days out rolled "in year 1".
 * The month counts stay where the arithmetic runs on them. Each reader is
 * read on the day before, the day of and the day after its date.
 */

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = ""): Row => ({ label, value, flagged: false, page, basis: "na" });

describe("the day helpers", () => {
  it("count days, and years to the day that equal whole months on an anniversary", () => {
    expect(daysBetween("2028-02-29", "2028-03-01")).toBe(1);
    expect(daysBetween("2028-03-02", "2028-03-01")).toBe(-1);
    expect(daysBetween("2026-10-01", "2026-10-01")).toBe(0);
    // An anniversary is whole years, as whole months had it.
    expect(yearsBetween("2026-12-15", "2027-12-15")).toBe(1);
    expect(yearsBetween("2026-09-30", "2031-09-30")).toBe(5);
    expect(yearsBetween("2026-09-30", "2036-03-30")).toBe(monthsBetween("2026-09-30", "2036-03-30") / 12);
    // A day past it is past it; a day before it is not there yet.
    expect(yearsBetween("2026-12-15", "2027-12-16")).toBeGreaterThan(1);
    expect(yearsBetween("2026-12-15", "2027-12-14")).toBeLessThan(1);
    // Twelve months and seventeen days: in the second year, never the first.
    expect(Math.ceil(yearsBetween("2026-12-15", "2028-01-01"))).toBe(2);
    expect(Math.ceil(monthsBetween("2026-12-15", "2028-01-01") / 12)).toBe(1);
    // Its sign is the day's: zero on the day, below it after.
    expect(yearsBetween("2026-10-01", "2026-10-01")).toBe(0);
    expect(yearsBetween("2026-10-15", "2026-10-14")).toBeLessThan(0);
    expect(yearsBetween("2026-10-15", "2026-10-16")).toBeGreaterThan(0);
    // Inside the last month, where whole months count none.
    expect(monthsBetween("2028-02-02", "2028-03-01")).toBe(0);
    expect(yearsBetween("2028-02-02", "2028-03-01")).toBeGreaterThan(0);
    // A month's end is held to the shorter month, and the count runs on.
    expect(yearsBetween("2027-01-31", "2027-02-28")).toBeCloseTo(1 / 12, 12);
    expect(yearsBetween("2027-01-31", "2027-03-01")).toBeGreaterThan(1 / 12);
  });
});

describe("a note maturing March 1, 2028", () => {
  const TERMS: NoteTerms = {
    balance: 24_400_000,
    ratePct: 5.25,
    maturity: "2028-03-01",
    interestOnly: true,
    amortYears: null,
    status: "performing",
    collateralValue: 34_000_000,
    subordinate: false,
    position: "first",
  };
  const note = (iso: string) => readNote(TERMS, 20_000_000, day(iso))!;

  it("four weeks out, and the day before: due in under a month, never past", () => {
    for (const iso of ["2028-02-02", "2028-02-29"]) {
      const n = note(iso);
      expect(n.matured, iso).toBe(false);
      expect(n.monthsLeft, iso).toBe(0);
      expect(n.ytmPct, iso).toBeNull();
      expect(noteYieldSentence(n), iso).toBe("It comes due in under a month, at its Mar 2028 maturity — too short a run for a yield to maturity to state.");
      expect(noteCaption(n), iso).toBe("Under a month to its Mar 2028 maturity.");
    }
  });

  it("the day of: due today, not past", () => {
    const n = note("2028-03-01");
    expect(n.matured).toBe(false);
    expect(n.daysLeft).toBe(0);
    expect(noteYieldSentence(n)).toBe("It comes due today, at its Mar 2028 maturity — too short a run for a yield to maturity to state.");
    expect(noteCaption(n)).toBe("Due today, at its Mar 2028 maturity.");
  });

  it("the day after: past it, with no contract yield", () => {
    const n = note("2028-03-02");
    expect(n.matured).toBe(true);
    expect(n.monthsLeft).toBeNull();
    expect(noteYieldSentence(n)).toBe(
      "It is past its Mar 2028 maturity — a matured loan still outstanding is in default or extended, and there is no contract yield to state.",
    );
  });

  it("a month and more out: the yield over the whole months, as before", () => {
    const n = note("2028-01-15");
    expect(n.matured).toBe(false);
    expect(n.monthsLeft).toBe(1);
    expect(n.ytmPct).not.toBeNull();
  });

  it("the short line says it the same way", () => {
    const ex = {
      ...SAMPLE_DEAL.extraction,
      totalPages: 40,
      interest: { kind: "note", summary: "A performing first-mortgage note", share: "", groundLease: "", loan: "", page: "p. 4" },
      metrics: [
        row("Asking price", "$20,000,000"),
        row("Unpaid principal balance", "$24,400,000"),
        row("Note rate", "5.25%"),
        row("Maturity date", "March 1, 2028"),
        row("Payment status", "Performing"),
      ],
    } as unknown as ExtractionResult;
    expect(interestShortLine(readInterest(ex, 20_000_000, day("2028-02-02"))!)).toMatch(/, due in under a month$/);
    expect(interestShortLine(readInterest(ex, 20_000_000, day("2028-03-01"))!)).toMatch(/, due today$/);
    expect(interestShortLine(readInterest(ex, 20_000_000, day("2028-03-02"))!)).toMatch(/, past its maturity$/);
  });
});

describe("an assumable loan maturing March 1, 2028", () => {
  const LOAN = [
    row("Assumable loan balance", "$30,000,000", "p. 12"),
    row("Assumable loan rate", "3.45%"),
    row("Assumable loan maturity", "March 1, 2028"),
    row("Assumable loan amortization", "Interest-only"),
  ];
  const ex = { ...SAMPLE_DEAL.extraction, totalPages: 40, metrics: [...SAMPLE_DEAL.extraction.metrics, ...LOAN] } as ExtractionResult;
  const inputs = deriveUnderwriteInputs(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name).inputs;

  it("the day before, and four weeks out: due inside a year, a refinance — never come due", () => {
    for (const iso of ["2028-02-02", "2028-02-29"]) {
      const a = readAssumable(ex, inputs, day(iso))!;
      expect(a.matured, iso).toBe(false);
      expect(a.couponYears, iso).toBe(0);
      expect(assumableSentence(a), iso).toMatch(/^It comes due in Mar 2028, inside a year/);
    }
  });

  it("the day of and the day after: at or past it", () => {
    for (const iso of ["2028-03-01", "2028-03-02"]) {
      const a = readAssumable(ex, inputs, day(iso))!;
      expect(a.matured, iso).toBe(true);
      expect(assumableSentence(a), iso).toMatch(/^It is at or past its Mar 2028 maturity/);
    }
  });
});

describe("the tenant roster rolls a lease in the year it ends, to the day", () => {
  const t = (name: string, sf: string, rent: string, leaseExpiration: string): ExtractedTenant => ({
    name,
    role: "inline",
    inSale: "yes",
    sf,
    rent,
    leaseExpiration,
    options: "",
    earlyTermination: "",
    rights: "",
    page: "",
  });
  const center = (end: string) =>
    ({
      dealName: "Maple Grove Crossing",
      assetClass: "retail",
      totalPages: 40,
      metrics: [row("Asking price", "$14,000,000"), row("Total SF", "60,000 SF")],
      tenants: [t("Staples", "10,000 SF", "$300,000", end), t("Kroger", "40,000 SF", "$600,000", "December 31, 2056")],
    }) as unknown as ExtractionResult;
  const yearOf = (end: string) => readRoster(center(end), day("2026-12-15"))!.years.find((y) => y.tenants.includes("Staples"))?.year;

  it("12 months and 17 days out is year 2, where whole months rounded up said year 1", () => {
    expect(yearOf("January 1, 2028")).toBe(2);
    expect(readRoster(center("January 1, 2028"), day("2026-12-15"))!.headline).toContain("the most in year 2");
  });

  it("the day before the anniversary and the anniversary itself are year 1; the day after is year 2", () => {
    expect(yearOf("December 14, 2027")).toBe(1);
    expect(yearOf("December 15, 2027")).toBe(1);
    expect(yearOf("December 16, 2027")).toBe(2);
  });
});

describe("a single tenant's lease ending December 31, 2026", () => {
  const tenant: ExtractedSingleTenant = { tenant: "Walgreens Co.", guarantor: "", leaseType: "Absolute NNN", landlordObligations: "", tenantRights: "", page: "" };
  const ex = (end: string, extra: Row[] = []) =>
    ({
      dealName: "Walgreens | Tulsa, OK",
      assetClass: "net_lease",
      totalPages: 30,
      singleTenant: tenant,
      metrics: [row("Asking price", "$6,500,000"), row("Lease expiration", end), ...extra],
    }) as unknown as ExtractionResult;
  const at = (iso: string) => readSingleTenant(ex("December 31, 2026"), day(iso))!;

  it("four weeks out and the day before: under a month from today, never passed", () => {
    for (const iso of ["2026-12-01", "2026-12-30"]) {
      const r = at(iso);
      expect(r.headline, iso).toContain("The lease ends Dec 2026, under a month from today.");
      expect(r.headline, iso).not.toContain("has passed");
      expect(singleTenantShortLine(r), iso).toContain("the lease ends Dec 2026, under a month from today");
      expect(singleTenantTag(ex("December 31, 2026"), day(iso)), iso).toBe("Single tenant, under 1 yr left");
      expect(gluedWords(r.headline), iso).toEqual([]);
    }
  });

  it("the day of: it ends today; the day after: it has passed", () => {
    expect(at("2026-12-31").headline).toContain("The lease ends Dec 2026, today.");
    expect(at("2027-01-01").headline).toContain("The lease's stated end, Dec 2026, has passed");
  });

  it("ends inside the model's hold only at or before the sale's own day", () => {
    const model = { holdMonths: 60, rentGrowthPct: 0.03, vacancyPct: 0.05, exitCapPct: 0.06 };
    const asOf = day("2026-10-01");
    const onSale = readSingleTenant(ex("October 1, 2031"), asOf)!;
    expect(singleTenantModelLine(onSale, model)).toMatch(/^The lease ends Oct 2031, inside the model's 5-year hold/);
    // A week after the sale: past it, where whole months had said inside.
    const after = readSingleTenant(ex("October 8, 2031"), asOf)!;
    expect(singleTenantModelLine(after, model)).toMatch(/^At the model's sale in 5 years the lease has under a month left/);
  });
});

describe("a hotel's franchise and management agreement", () => {
  const hotel: ExtractedHotel = {
    brand: "Courtyard by Marriott",
    franchise: "",
    management: "",
    encumbrance: "management",
    pip: "",
    page: "",
  };
  const ex = (franchiseEnd: string, managementEnd = "2040") =>
    ({
      dealName: "Courtyard Nashville Downtown",
      assetClass: "hospitality_str",
      totalPages: 40,
      hotel,
      metrics: [
        row("Asking price", "$26,000,000"),
        row("Keys", "120"),
        row("Franchise expiration", franchiseEnd),
        row("Management agreement expiration", managementEnd),
      ],
    }) as unknown as ExtractionResult;
  const model = { holdMonths: 60, capitalYr1: 0, capitalIsPip: false };

  it("a franchise ending in three weeks ends; it has not passed", () => {
    const r = readHotelDeal(ex("October 20, 2026"), day("2026-10-01"))!;
    expect(r.headline).toContain("The franchise ends Oct 2026, under a month from today.");
    expect(r.headline).not.toContain("has passed");
    expect(readHotelDeal(ex("October 20, 2026"), day("2026-10-21"))!.headline).toContain("The franchise's stated end, Oct 2026, has passed");
  });

  it("inside the hold at or before the sale's day, past it the day after", () => {
    const asOf = day("2026-10-01");
    expect(hotelModelLine(readHotelDeal(ex("September 30, 2031"), asOf)!, model)).toContain("inside the model's 5-year hold");
    expect(hotelModelLine(readHotelDeal(ex("October 1, 2031"), asOf)!, model)).toContain("inside the model's 5-year hold");
    expect(hotelModelLine(readHotelDeal(ex("October 2, 2031"), asOf)!, model)).not.toContain("inside the model's");
    // A management agreement ending the day after the sale runs past it.
    expect(hotelModelLine(readHotelDeal(ex("2040", "October 2, 2031"), asOf)!, model)).toContain("The management agreement runs past the model's sale");
    expect(hotelModelLine(readHotelDeal(ex("2040", "October 1, 2031"), asOf)!, model)).not.toContain("runs past the model's sale");
  });
});

describe("a tax abatement ending October 20, 2026", () => {
  const ex = {
    dealName: "The Fairmount",
    assetClass: "multifamily",
    totalPages: 40,
    metrics: [
      row("Asking price", "$55,000,000"),
      row("NOI (in-place)", "$3,000,000"),
      row("Tax abatement", "10-year Philadelphia tax abatement"),
      row("Tax abatement expiration", "October 20, 2026"),
      row("Abated real estate taxes", "$70,000"),
      row("Unabated real estate taxes", "$520,000"),
    ],
  } as unknown as ExtractionResult;

  it("three weeks out and the day before: abated, under a month from today", () => {
    for (const iso of ["2026-10-01", "2026-10-19"]) {
      const r = readTaxAbatement(ex, day(iso))!;
      expect(r.headline, iso).toContain("until Oct 2026, under a month from today.");
      expect(taxAbatementShortLine(r), iso).toContain("ends Oct 2026, under a month from today");
      expect(taxAbatementTag(ex, day(iso)), iso).toMatch(/^Tax abated, under 1 yr left/);
    }
  });

  it("the end is read early: gone on its own day, and after", () => {
    for (const iso of ["2026-10-20", "2026-10-21"]) {
      expect(taxAbatementTag(ex, day(iso)), iso).toBe("Abatement ended");
      expect(readTaxAbatement(ex, day(iso))!.headline, iso).toContain("ended Oct 2026");
    }
  });
});

describe("a HAP contract expiring October 20, 2026", () => {
  const ex = {
    dealName: "Maple Court",
    assetClass: "multifamily",
    totalPages: 60,
    affordable: { programs: ["section8"], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
    metrics: [row("Asking price", "$38,000,000"), row("Units", "240"), row("Units under HAP contract", "82"), row("HAP contract expiration", "October 20, 2026")],
  } as unknown as ExtractionResult;

  it("expires in under a month the day before; has passed the day after", () => {
    const before = readAffordable(ex, day("2026-10-19"))!;
    expect(before.headline).toContain("that expires Oct 2026, under a month from today");
    expect(affordableShortLine(before)).toContain("to Oct 2026");
    expect(readAffordable(ex, day("2026-10-20"))!.headline).toContain("that expires Oct 2026, today");
    const after = readAffordable(ex, day("2026-10-21"))!;
    expect(after.headline).toContain("whose stated expiry, Oct 2026, has passed");
    expect(affordableShortLine(after)).toContain("(its stated expiry has passed)");
  });
});

describe("a ground lease ending October 20, 2026", () => {
  const ex = (end: string) =>
    ({
      ...SAMPLE_DEAL.extraction,
      totalPages: 40,
      interest: { kind: "leasehold", summary: "The leasehold interest", share: "", groundLease: "", loan: "", page: "" },
      metrics: [...SAMPLE_DEAL.extraction.metrics, row("Ground lease expiration", end)],
    }) as ExtractionResult;

  it("ends in under a month the day before, today on the day, and has passed the day after", () => {
    const line = (iso: string) => groundLeaseTermLine(readGroundLeaseTerm(ex("October 20, 2026"), day(iso))!);
    expect(line("2026-10-01")).toBe("The ground lease ends Oct 2026, under a month from today");
    expect(line("2026-10-19")).toBe("The ground lease ends Oct 2026, under a month from today");
    expect(line("2026-10-20")).toBe("The ground lease ends Oct 2026, today");
    expect(line("2026-10-21")).toMatch(/^The ground lease's stated end, Oct 2026, has passed/);
    // The pipeline's tag keeps the term until it has ended.
    expect(interestTag(ex("October 20, 2026"), day("2026-10-01"))).toBe("Leasehold, under 1 yr left");
    expect(interestTag(ex("October 20, 2026"), day("2026-10-21"))).toBe("Leasehold");
  });

  it("the model's exit: inside the hold at or before the sale's day, valued on the term after it", () => {
    const asOf = day("2026-09-25");
    const exitOf = (end: string) => {
      const e = ex(end);
      return readLeaseholdExit(e, deriveUnderwriteInputs(e, SAMPLE_DEAL.name).inputs, asOf)!;
    };
    expect(exitOf("September 25, 2031").endsInHold).toBe(true);
    expect(exitOf("September 25, 2031").endsInYear).toBe(5);
    // A day after the sale the building does not revert before it.
    const after = exitOf("September 26, 2031");
    expect(after.endsInHold).toBe(false);
    expect(leaseholdExitSentence(after)).toBe(
      "The ground lease ends Sep 2031, under a month after the model's sale in year 5: a buyer then buys almost none of the term, so the model's capitalised exit is not a price anyone pays for it.",
    );
    // 12 months and 17 days out is year 2 of the hold, never year 1.
    expect(exitOf("October 12, 2027").endsInYear).toBe(2);
  });
});
