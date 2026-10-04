import { describe, expect, it } from "vitest";
import type { ExtractedHotel, ExtractedSingleTenant, ExtractedTenant, ExtractionResult } from "@/lib/anthropic/types";
import { daysBetween, monthsBetween, readNote, yearsBetween, type NoteTerms } from "./note-yield";
import { interestShortLine, interestTag, noteCaption, noteYieldSentence, readInterest } from "./interest";
import { assumableSentence, readAssumable } from "./assumable-debt";
import { readRoster } from "./tenant-roster";
import { readSingleTenant, singleTenantModelLine, singleTenantNote, singleTenantShortLine, singleTenantTag } from "./single-tenant";
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

/**
 * A date stated as a month alone (the audit of 2026-10-04). "June 2027" and
 * "10/2031" name no day, and every reader took the month's LAST: a lease
 * ended "today" on June 30, an abatement read early ran "under a month"
 * all June, a roster lease of "Oct 2031" sat outside the five-year roll all
 * October, and a HAP contract was read from its last day although its rule
 * reads the first. A month alone now takes the side its rule names — the
 * first day for a lease, a right to leave, a HAP contract, a franchise, an
 * abatement and an assumable loan; the last for a rent restriction, a
 * management agreement and a note's maturity — and inside the month it is
 * said "this month", never "today", "under a month" or "passed". Each
 * reader is read on the day before the month, inside it and after it.
 */
describe("a date stated as a month alone", () => {
  // The two spellings of each month, and the days around it.
  const JUNE = { spellings: ["June 2027", "06/2027"], before: "2027-05-31", inside: ["2027-06-01", "2027-06-15", "2027-06-30"], after: "2027-07-01" };
  const OCT = { spellings: ["October 2031", "10/2031"], before: "2031-09-30", inside: ["2031-10-01", "2031-10-31"], after: "2031-11-01" };

  describe("a ground lease", () => {
    const ex = (end: string) =>
      ({
        ...SAMPLE_DEAL.extraction,
        totalPages: 40,
        interest: { kind: "leasehold", summary: "The leasehold interest", share: "", groundLease: "", loan: "", page: "" },
        metrics: [...SAMPLE_DEAL.extraction.metrics, row("Ground lease expiration", end)],
      }) as ExtractionResult;
    const line = (end: string, iso: string) => groundLeaseTermLine(readGroundLeaseTerm(ex(end), day(iso))!);

    it("is read from its first day, ends this month inside it, and has passed only once it is out", () => {
      for (const m of [JUNE, OCT]) {
        for (const end of m.spellings) {
          const label = m === JUNE ? "Jun 2027" : "Oct 2031";
          const t = readGroundLeaseTerm(ex(end), day(m.before))!;
          expect(t.ends, end).toBe(m === JUNE ? "2027-06-01" : "2031-10-01");
          expect(t.from, end).toBe("month");
          expect(line(end, m.before), end).toBe(`The ground lease ends ${label}, under a month from today`);
          for (const iso of m.inside) {
            expect(line(end, iso), `${end} ${iso}`).toBe(`The ground lease ends ${label}, this month`);
            expect(interestTag(ex(end), day(iso)), `${end} ${iso}`).toBe("Leasehold, under 1 yr left");
          }
          expect(line(end, m.after), end).toMatch(new RegExp(`^The ground lease's stated end, ${label}, has passed`));
          expect(interestTag(ex(end), day(m.after)), end).toBe("Leasehold");
        }
      }
    });

    it("the documents' short line says this month, never today", () => {
      for (const iso of JUNE.inside) {
        expect(interestShortLine(readInterest(ex("June 2027"), 68_000_000, day(iso))!), iso).toContain("; the lease ends Jun 2027, this month");
      }
    });

    it("the model's exit: a lease of Oct 2031 ends inside a hold that sells mid-October, where its last day would not", () => {
      const asOf = day("2026-10-15");
      const e = ex("10/2031");
      const r = readLeaseholdExit(e, deriveUnderwriteInputs(e, SAMPLE_DEAL.name).inputs, asOf)!;
      expect(r.endsInHold).toBe(true);
      expect(r.endsInYear).toBe(5);
      expect(leaseholdExitSentence(r)).toMatch(/^The ground lease ends Oct 2031, in year 5 of the model's 5-year hold/);
    });
  });

  describe("a single tenant's lease, and its right to leave early", () => {
    const tenant: ExtractedSingleTenant = { tenant: "Walgreens Co.", guarantor: "", leaseType: "Absolute NNN", landlordObligations: "", tenantRights: "", page: "" };
    const ex = (rows: Row[]) =>
      ({
        dealName: "Walgreens | Tulsa, OK",
        assetClass: "net_lease",
        totalPages: 30,
        singleTenant: tenant,
        metrics: [row("Asking price", "$6,500,000"), ...rows],
      }) as unknown as ExtractionResult;

    it("the lease ends this month inside its month, and has passed only once it is out", () => {
      for (const m of [JUNE, OCT]) {
        for (const end of m.spellings) {
          const label = m === JUNE ? "Jun 2027" : "Oct 2031";
          const at = (iso: string) => readSingleTenant(ex([row("Lease expiration", end)]), day(iso))!;
          expect(at(m.before).term!.ends, end).toBe(m === JUNE ? "2027-06-01" : "2031-10-01");
          expect(at(m.before).headline, end).toContain(`The lease ends ${label}, under a month from today.`);
          for (const iso of m.inside) {
            const r = at(iso);
            expect(r.headline, `${end} ${iso}`).toContain(`The lease ends ${label}, this month.`);
            expect(r.headline, `${end} ${iso}`).not.toMatch(/today|has passed/);
            expect(singleTenantShortLine(r), `${end} ${iso}`).toContain(`the lease ends ${label}, this month`);
            expect(singleTenantTag(ex([row("Lease expiration", end)]), day(iso)), `${end} ${iso}`).toBe("Single tenant, under 1 yr left");
            // The challenger's trap says it the same way, never "under a month left today".
            expect(singleTenantNote(r), `${end} ${iso}`).toContain("(b) THE TERM AT THE EXIT — the lease ends this month, as stated:");
            expect(gluedWords(r.headline), `${end} ${iso}`).toEqual([]);
          }
          expect(at(m.after).headline, end).toContain(`The lease's stated end, ${label}, has passed`);
        }
      }
    });

    it("a right to leave early opens on its month's first day, comes this month inside it, and has opened after it", () => {
      const rows = (early: string) => [row("Lease expiration", "December 31, 2035"), row("Early termination date", early)];
      const model = { holdMonths: 60, rentGrowthPct: 0.02, vacancyPct: 0.05, exitCapPct: 0.065 };
      for (const early of JUNE.spellings) {
        const at = (iso: string) => readSingleTenant(ex(rows(early)), day(iso))!;
        expect(at(JUNE.before).early!.ends, early).toBe("2027-06-01");
        expect(at(JUNE.before).headline, early).toContain("The tenant may end the lease early from Jun 2027, under a month from today, as stated");
        for (const iso of JUNE.inside) {
          const r = at(iso);
          expect(r.headline, `${early} ${iso}`).toContain("The tenant may end the lease early from Jun 2027, this month, as stated");
          expect(singleTenantShortLine(r), `${early} ${iso}`).toContain("the tenant may end it early from Jun 2027");
          expect(singleTenantModelLine(r, model), `${early} ${iso}`).toMatch(/^The lease may end Jun 2027, inside the model's 5-year hold/);
          expect(singleTenantTag(ex(rows(early)), day(iso)), `${early} ${iso}`).toBe("Single tenant, may leave in under 1 yr");
        }
        expect(at(JUNE.after).headline, early).toContain("The tenant's right to end the lease early opened Jun 2027, as stated");
      }
    });
  });

  describe("an affordable deal's clocks", () => {
    const ex = (rows: Row[]) =>
      ({
        dealName: "Maple Court",
        assetClass: "multifamily",
        totalPages: 60,
        affordable: { programs: ["lihtc", "section8"], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
        metrics: [row("Asking price", "$38,000,000"), row("Units", "240"), row("Restricted units", "180"), row("Units under HAP contract", "82"), ...rows],
      }) as unknown as ExtractionResult;

    it("a HAP contract is read from its month's first day, as a year alone is, and expires this month inside it", () => {
      for (const m of [JUNE, OCT]) {
        for (const end of m.spellings) {
          const label = m === JUNE ? "Jun 2027" : "Oct 2031";
          const at = (iso: string) => readAffordable(ex([row("HAP contract expiration", end)]), day(iso))!;
          expect(at(m.before).hapEnds, end).toMatchObject({ ends: m === JUNE ? "2027-06-01" : "2031-10-01", from: "month" });
          expect(at(m.before).headline, end).toContain(`that expires ${label}, under a month from today`);
          for (const iso of m.inside) {
            const r = at(iso);
            expect(r.headline, `${end} ${iso}`).toContain(`that expires ${label}, this month`);
            expect(affordableShortLine(r), `${end} ${iso}`).toContain(`to ${label}`);
          }
          const after = at(m.after);
          expect(after.headline, end).toContain(`whose stated expiry, ${label}, has passed`);
          expect(affordableShortLine(after), end).toContain("(its stated expiry has passed)");
        }
      }
    });

    it("a rent restriction is read to its month's last day, as its rule says, and runs this month inside it", () => {
      for (const end of JUNE.spellings) {
        const at = (iso: string) => readAffordable(ex([row("Affordability expiration", end)]), day(iso))!;
        expect(at(JUNE.before).restrictionEnds, end).toMatchObject({ ends: "2027-06-30", from: "month" });
        expect(at(JUNE.before).headline, end).toContain("until Jun 2027, under a month from today");
        for (const iso of JUNE.inside) {
          const r = at(iso);
          expect(r.headline, `${end} ${iso}`).toContain("until Jun 2027, this month");
          expect(r.headline, `${end} ${iso}`).not.toMatch(/Jun 2027, today/);
        }
        expect(at(JUNE.after).headline, end).toContain("its stated end, Jun 2027, has passed");
      }
    });
  });

  describe("a hotel's franchise and management agreement", () => {
    const hotel: ExtractedHotel = { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "management", pip: "", page: "" };
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

    it("a franchise ends this month inside its month, and has passed only once it is out", () => {
      for (const end of JUNE.spellings) {
        expect(readHotelDeal(ex(end), day(JUNE.before))!.headline, end).toContain("The franchise ends Jun 2027, under a month from today.");
        for (const iso of JUNE.inside) {
          const r = readHotelDeal(ex(end), day(iso))!;
          expect(r.franchiseEnds!.ends, `${end} ${iso}`).toBe("2027-06-01");
          expect(r.headline, `${end} ${iso}`).toContain("The franchise ends Jun 2027, this month.");
        }
        expect(readHotelDeal(ex(end), day(JUNE.after))!.headline, end).toContain("The franchise's stated end, Jun 2027, has passed");
      }
    });

    it("against a sale in mid-October 2031: the franchise's first day falls inside the hold, the manager's last day after it", () => {
      const asOf = day("2026-10-15");
      for (const end of OCT.spellings) {
        expect(hotelModelLine(readHotelDeal(ex(end), asOf)!, model), end).toContain("The franchise ends Oct 2031, inside the model's 5-year hold");
        expect(hotelModelLine(readHotelDeal(ex("2040", end), asOf)!, model), end).toContain("The management agreement runs past the model's sale, to Oct 2031");
      }
    });
  });

  describe("a tax abatement", () => {
    const ex = (end: string) =>
      ({
        dealName: "The Fairmount",
        assetClass: "multifamily",
        totalPages: 40,
        metrics: [
          row("Asking price", "$55,000,000"),
          row("NOI (in-place)", "$3,000,000"),
          row("Tax abatement", "10-year Philadelphia tax abatement"),
          row("Tax abatement expiration", end),
          row("Abated real estate taxes", "$70,000"),
          row("Unabated real estate taxes", "$520,000"),
        ],
      }) as unknown as ExtractionResult;

    it("is read early: abated the day before the month, gone from its first day, never 'under a month' inside it", () => {
      for (const m of [JUNE, OCT]) {
        for (const end of m.spellings) {
          const label = m === JUNE ? "Jun 2027" : "Oct 2031";
          const before = readTaxAbatement(ex(end), day(m.before))!;
          expect(before.end, end).toMatchObject({ ends: m === JUNE ? "2027-06-01" : "2031-10-01", from: "month" });
          expect(taxAbatementShortLine(before), end).toContain(`ends ${label}, under a month from today`);
          expect(taxAbatementTag(ex(end), day(m.before)), end).toMatch(/^Tax abated, under 1 yr left/);
          for (const iso of [...m.inside, m.after]) {
            expect(taxAbatementTag(ex(end), day(iso)), `${end} ${iso}`).toBe("Abatement ended");
            expect(readTaxAbatement(ex(end), day(iso))!.headline, `${end} ${iso}`).toContain(`ended ${label}`);
          }
        }
      }
    });
  });

  describe("the tenant roster", () => {
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
        tenants: [t("Grocer", "40,000 SF", "$600,000", end), t("Pharmacy", "10,000 SF", "$300,000", "March 31, 2030")],
      }) as unknown as ExtractionResult;
    const grocerYear = (end: string, iso: string) => readRoster(center(end), day(iso))!.years.find((y) => y.tenants.includes("Grocer"))?.year ?? null;

    it("a lease of Oct 2031 rolls in year 5 all October 2026 — read from its first day — and not the day before", () => {
      for (const end of OCT.spellings) {
        expect(readRoster(center(end), day("2026-10-04"))!.tenants.find((x) => x.name === "Grocer")!.ends!.ends, end).toBe("2031-10-01");
        // Five years and a day out on Sep 30: past the five-year roll.
        expect(grocerYear(end, "2026-09-30"), end).toBeNull();
        for (const iso of ["2026-10-01", "2026-10-04", "2026-10-31", "2026-11-01"]) {
          expect(grocerYear(end, iso), `${end} ${iso}`).toBe(5);
          expect(readRoster(center(end), day(iso))!.rollWithinHoldPct, `${end} ${iso}`).toBe(100);
        }
      }
    });

    it("a lease of June 2027 rolls in year 1 the day before its month, inside it and after it", () => {
      for (const end of JUNE.spellings) {
        for (const iso of [JUNE.before, ...JUNE.inside, JUNE.after]) {
          expect(grocerYear(end, iso), `${end} ${iso}`).toBe(1);
        }
      }
    });
  });

  describe("a note's maturity", () => {
    const ex = (maturity: string) =>
      ({
        ...SAMPLE_DEAL.extraction,
        totalPages: 40,
        interest: { kind: "note", summary: "A performing first-mortgage note", share: "", groundLease: "", loan: "", page: "p. 4" },
        metrics: [
          row("Asking price", "$20,000,000"),
          row("Unpaid principal balance", "$24,400,000"),
          row("Note rate", "5.25%"),
          row("Maturity date", maturity),
          row("Payment status", "Performing"),
        ],
      }) as unknown as ExtractionResult;
    const at = (maturity: string, iso: string) => readInterest(ex(maturity), 20_000_000, day(iso))!;

    it("is read to its month's last day and comes due this month inside it — never today", () => {
      for (const m of [JUNE, OCT]) {
        for (const maturity of m.spellings) {
          const label = m === JUNE ? "Jun 2027" : "Oct 2031";
          expect(at(maturity, m.before).note!.terms.maturity, maturity).toBe(m === JUNE ? "2027-06-30" : "2031-10-31");
          expect(at(maturity, m.before).note!.matured, maturity).toBe(false);
          for (const iso of m.inside) {
            const r = at(maturity, iso);
            expect(r.note!.matured, `${maturity} ${iso}`).toBe(false);
            expect(r.note!.thisMonth, `${maturity} ${iso}`).toBe(true);
            expect(noteYieldSentence(r.note), `${maturity} ${iso}`).toBe(
              `It comes due this month, at its ${label} maturity — too short a run for a yield to maturity to state.`,
            );
            expect(noteCaption(r.note), `${maturity} ${iso}`).toBe(`Due this month, at its ${label} maturity.`);
            expect(interestShortLine(r), `${maturity} ${iso}`).toMatch(/, due this month$/);
          }
          const after = at(maturity, m.after);
          expect(after.note!.matured, maturity).toBe(true);
          expect(noteYieldSentence(after.note), maturity).toMatch(new RegExp(`^It is past its ${label} maturity`));
        }
      }
    });

    it("a stated day is read as written: due today on the day, as before", () => {
      expect(noteYieldSentence(at("June 30, 2027", "2027-06-30").note)).toMatch(/^It comes due today, at its Jun 2027 maturity/);
      expect(at("June 30, 2027", "2027-06-15").note!.thisMonth).toBe(false);
    });
  });

  describe("an assumable loan's maturity", () => {
    const ex = (maturity: string) =>
      ({
        ...SAMPLE_DEAL.extraction,
        totalPages: 40,
        metrics: [
          ...SAMPLE_DEAL.extraction.metrics,
          row("Assumable loan balance", "$30,000,000", "p. 12"),
          row("Assumable loan rate", "3.45%"),
          row("Assumable loan maturity", maturity),
          row("Assumable loan amortization", "Interest-only"),
        ],
      }) as ExtractionResult;
    const inputs = deriveUnderwriteInputs(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name).inputs;

    it("is read from its month's first day — never a month at the coupon it may not have", () => {
      // Read on June 15, 2026: to June 30, 2027 is a year and a half month,
      // a full year at the coupon; to June 1, 2027 it is inside a year.
      expect(readAssumable(ex("June 30, 2027"), inputs, day("2026-06-15"))!.couponYears).toBe(1);
      for (const maturity of JUNE.spellings) {
        const a = readAssumable(ex(maturity), inputs, day("2026-06-15"))!;
        expect(a.terms.maturity, maturity).toBe("2027-06-01");
        expect(a.couponYears, maturity).toBe(0);
      }
    });

    it("comes due in its month the day before it and inside it, and is past it only once the month is out", () => {
      for (const m of [JUNE, OCT]) {
        for (const maturity of m.spellings) {
          const label = m === JUNE ? "Jun 2027" : "Oct 2031";
          for (const iso of [m.before, ...m.inside]) {
            const a = readAssumable(ex(maturity), inputs, day(iso))!;
            expect(a.matured, `${maturity} ${iso}`).toBe(false);
            expect(assumableSentence(a), `${maturity} ${iso}`).toMatch(new RegExp(`^It comes due in ${label}, inside a year`));
          }
          const after = readAssumable(ex(maturity), inputs, day(m.after))!;
          expect(after.matured, maturity).toBe(true);
          expect(assumableSentence(after), maturity).toMatch(new RegExp(`^It is at or past its ${label} maturity`));
        }
      }
    });
  });
});

/**
 * A date stated as a year alone ("2027"), the month's case a size up. The
 * readers take the side their rule names, as before — the year's first day
 * for a lease's end, a right to leave early, a HAP contract and a
 * franchise; its last for a rent restriction and a management agreement —
 * but the memorandum names no day, and a lease of "2027" read as January 1
 * ended "today" on New Year's Day and "had passed" every other day of 2027.
 * Inside the stated year an end is said "this year": never "today", never
 * "under a month", never passed until the year is out. The abatement keeps
 * its own rule, read early: gone from the year's first day, as from a
 * month's. Each reader is read the day before the year, inside it (its
 * first day, its middle, its last day) and the day after.
 */
describe("a date stated as a year alone", () => {
  const Y = { before: "2026-12-31", inside: ["2027-01-01", "2027-06-15", "2027-12-31"], after: "2028-01-01" };
  const YEAR_ALONE = " — the memorandum states the year alone, read as its first day";

  describe("a ground lease", () => {
    const ex = (end: string) =>
      ({
        ...SAMPLE_DEAL.extraction,
        totalPages: 40,
        interest: { kind: "leasehold", summary: "The leasehold interest", share: "", groundLease: "", loan: "", page: "" },
        metrics: [...SAMPLE_DEAL.extraction.metrics, row("Ground lease expiration", end)],
      }) as ExtractionResult;
    const line = (iso: string) => groundLeaseTermLine(readGroundLeaseTerm(ex("2027"), day(iso))!);

    it("is read from its first day, ends this year inside it, and has passed only once it is out", () => {
      const t = readGroundLeaseTerm(ex("2027"), day(Y.before))!;
      expect(t.ends).toBe("2027-01-01");
      expect(t.from).toBe("year");
      expect(t.thisYear).toBe(false);
      expect(line(Y.before)).toBe(`The ground lease ends in 2027, under a month from today${YEAR_ALONE}`);
      for (const iso of Y.inside) {
        expect(readGroundLeaseTerm(ex("2027"), day(iso))!.thisYear, iso).toBe(true);
        expect(line(iso), iso).toBe(`The ground lease ends in 2027, this year${YEAR_ALONE}`);
        expect(interestTag(ex("2027"), day(iso)), iso).toBe("Leasehold, under 1 yr left");
        expect(interestShortLine(readInterest(ex("2027"), 68_000_000, day(iso))!), iso).toContain("; the lease ends in 2027, this year");
      }
      expect(line(Y.after)).toMatch(/^The ground lease's stated end, 2027, has passed/);
      expect(interestTag(ex("2027"), day(Y.after))).toBe("Leasehold");
    });

    it("the model's exit: a lease of 2027 read in mid-2027 ends in year 1 of the hold, never a term already gone", () => {
      const e = ex("2027");
      const r = readLeaseholdExit(e, deriveUnderwriteInputs(e, SAMPLE_DEAL.name).inputs, day("2027-06-15"))!;
      expect(r.endsInHold).toBe(true);
      expect(r.endsInYear).toBe(1);
      expect(leaseholdExitSentence(r)).toMatch(/^The ground lease ends in 2027, in year 1 of the model's 5-year hold/);
    });
  });

  describe("a single tenant's lease, and its right to leave early", () => {
    const tenant: ExtractedSingleTenant = { tenant: "Walgreens Co.", guarantor: "", leaseType: "Absolute NNN", landlordObligations: "", tenantRights: "", page: "" };
    const ex = (rows: Row[]) =>
      ({
        dealName: "Walgreens | Tulsa, OK",
        assetClass: "net_lease",
        totalPages: 30,
        singleTenant: tenant,
        metrics: [row("Asking price", "$6,500,000"), ...rows],
      }) as unknown as ExtractionResult;
    const model = { holdMonths: 60, rentGrowthPct: 0.02, vacancyPct: 0.05, exitCapPct: 0.065 };

    it("the lease ends this year inside its year, and has passed only once it is out", () => {
      const rows = [row("Lease expiration", "2027")];
      const at = (iso: string) => readSingleTenant(ex(rows), day(iso))!;
      expect(at(Y.before).term!.ends).toBe("2027-01-01");
      expect(at(Y.before).headline).toContain(`The lease ends in 2027, under a month from today${YEAR_ALONE}.`);
      for (const iso of Y.inside) {
        const r = at(iso);
        expect(r.headline, iso).toContain(`The lease ends in 2027, this year${YEAR_ALONE}.`);
        expect(r.headline, iso).not.toMatch(/today|has passed/);
        expect(singleTenantShortLine(r), iso).toContain("the lease ends in 2027, this year");
        expect(singleTenantTag(ex(rows), day(iso)), iso).toBe("Single tenant, under 1 yr left");
        expect(singleTenantModelLine(r, model), iso).toMatch(/^The lease ends in 2027, inside the model's 5-year hold/);
        expect(singleTenantNote(r), iso).toContain("(b) THE TERM AT THE EXIT — the lease ends this year, as stated:");
        expect(gluedWords(r.headline), iso).toEqual([]);
      }
      expect(at(Y.after).headline).toContain("The lease's stated end, 2027, has passed");
    });

    it("a right to leave early opens on its year's first day, comes this year inside it, and has opened after it", () => {
      const rows = [row("Lease expiration", "December 31, 2035"), row("Early termination date", "2027")];
      const at = (iso: string) => readSingleTenant(ex(rows), day(iso))!;
      expect(at(Y.before).early!.ends).toBe("2027-01-01");
      expect(at(Y.before).headline).toContain("The tenant may end the lease early from 2027, under a month from today, as stated");
      for (const iso of Y.inside) {
        const r = at(iso);
        expect(r.early!.thisYear, iso).toBe(true);
        expect(r.headline, iso).toContain("The tenant may end the lease early from 2027, this year, as stated");
        expect(singleTenantShortLine(r), iso).toContain("the tenant may end it early from 2027");
        expect(singleTenantModelLine(r, model), iso).toMatch(/^The lease may end in 2027, inside the model's 5-year hold/);
        expect(singleTenantTag(ex(rows), day(iso)), iso).toBe("Single tenant, may leave in under 1 yr");
        expect(singleTenantNote(r), iso).toContain("(b) THE TERM AT THE EXIT — the tenant may end the lease this year, as stated:");
      }
      expect(at(Y.after).headline).toContain("The tenant's right to end the lease early opened 2027, as stated");
    });
  });

  describe("an affordable deal's clocks", () => {
    const ex = (rows: Row[]) =>
      ({
        dealName: "Maple Court",
        assetClass: "multifamily",
        totalPages: 60,
        affordable: { programs: ["lihtc", "section8"], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
        metrics: [row("Asking price", "$38,000,000"), row("Units", "240"), row("Restricted units", "180"), row("Units under HAP contract", "82"), ...rows],
      }) as unknown as ExtractionResult;

    it("a HAP contract is read from its year's first day, and expires this year inside it", () => {
      const at = (iso: string) => readAffordable(ex([row("HAP contract expiration", "2027")]), day(iso))!;
      expect(at(Y.before).hapEnds).toMatchObject({ ends: "2027-01-01", from: "year", thisYear: false });
      expect(at(Y.before).headline).toContain("that expires in 2027, under a month from today");
      for (const iso of Y.inside) {
        const r = at(iso);
        expect(r.hapEnds!.thisYear, iso).toBe(true);
        expect(r.headline, iso).toContain("that expires in 2027, this year");
        expect(affordableShortLine(r), iso).toContain("to 2027");
      }
      const after = at(Y.after);
      expect(after.headline).toContain("whose stated expiry, 2027, has passed");
      expect(affordableShortLine(after)).toContain("(its stated expiry has passed)");
    });

    it("a rent restriction is read to its year's last day, as its rule says, and runs this year inside it", () => {
      const at = (iso: string) => readAffordable(ex([row("Affordability expiration", "2027")]), day(iso))!;
      expect(at(Y.before).restrictionEnds).toMatchObject({ ends: "2027-12-31", from: "year" });
      expect(at(Y.before).headline).toContain("until the end of 2027, 1 year from today");
      for (const iso of Y.inside) {
        const r = at(iso);
        expect(r.headline, iso).toContain("until the end of 2027, this year");
        expect(r.headline, iso).not.toMatch(/2027, today|has passed/);
      }
      expect(at(Y.after).headline).toContain("its stated end, 2027, has passed");
    });
  });

  describe("a hotel's franchise and management agreement", () => {
    const hotel: ExtractedHotel = { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "management", pip: "", page: "" };
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

    it("a franchise ends this year inside its year — inside the model's hold — and has passed only once it is out", () => {
      expect(readHotelDeal(ex("2027"), day(Y.before))!.headline).toContain("The franchise ends in 2027, under a month from today.");
      for (const iso of Y.inside) {
        const r = readHotelDeal(ex("2027"), day(iso))!;
        expect(r.franchiseEnds!.ends, iso).toBe("2027-01-01");
        expect(r.headline, iso).toContain("The franchise ends in 2027, this year.");
        expect(hotelModelLine(r, model), iso).toContain("The franchise ends in 2027, inside the model's 5-year hold");
      }
      expect(readHotelDeal(ex("2027"), day(Y.after))!.headline).toContain("The franchise's stated end, 2027, has passed");
    });

    it("a management agreement is read to its year's last day, and ends this year inside it", () => {
      for (const iso of Y.inside) {
        const r = readHotelDeal(ex("2040", "2027"), day(iso))!;
        expect(r.managementEnds!.ends, iso).toBe("2027-12-31");
        expect(r.headline, iso).toContain("The management agreement ends in 2027, this year.");
      }
      expect(readHotelDeal(ex("2040", "2027"), day(Y.after))!.headline).toContain("The management agreement's stated end, 2027, has passed");
    });
  });

  describe("a tax abatement", () => {
    const ex = (end: string) =>
      ({
        dealName: "The Fairmount",
        assetClass: "multifamily",
        totalPages: 40,
        metrics: [
          row("Asking price", "$55,000,000"),
          row("NOI (in-place)", "$3,000,000"),
          row("Tax abatement", "10-year Philadelphia tax abatement"),
          row("Tax abatement expiration", end),
          row("Abated real estate taxes", "$70,000"),
          row("Unabated real estate taxes", "$520,000"),
        ],
      }) as unknown as ExtractionResult;

    it("keeps its own rule, read early: abated the day before the year, gone from its first day — never 'this year'", () => {
      const before = readTaxAbatement(ex("2027"), day(Y.before))!;
      expect(before.end).toMatchObject({ ends: "2027-01-01", from: "year" });
      expect(taxAbatementShortLine(before)).toContain("ends 2027, under a month from today");
      expect(taxAbatementTag(ex("2027"), day(Y.before))).toMatch(/^Tax abated, under 1 yr left/);
      for (const iso of [...Y.inside, Y.after]) {
        const r = readTaxAbatement(ex("2027"), day(iso))!;
        expect(taxAbatementTag(ex("2027"), day(iso)), iso).toBe("Abatement ended");
        expect(r.headline, iso).toContain("ended 2027");
        expect(r.headline, iso).not.toMatch(/this year|under a month/);
      }
    });
  });
});
