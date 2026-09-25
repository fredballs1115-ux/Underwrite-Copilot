import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { dealContextFor } from "@/lib/deal-context";
import { interestShortLine, interestTag, readInterest } from "@/lib/interest";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import {
  leaseholdExitSentence,
  leaseholdExitView,
  leaseholdLenderLine,
  leaseholdOptionsLine,
  readLeaseholdExit,
  subordinationOf,
  termShare,
} from "@/lib/leasehold-exit";
import { gluedWords } from "@/lib/render-lint";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { leaseholdPv } from "@/lib/tools/ground-lease";
import { computeUnderwrite } from "@/lib/underwrite/engine";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";

const row = (label: string, value: string, page = "p. 12") => ({ label, value, flagged: false, page, basis: "na" as const });
// The sample's $68M apartment building sold as a LEASEHOLD, read on Sep 25,
// 2026 — its model runs a five-year hold and sells at a 5.45% exit cap on
// NOI growing 3.0% in the year after the sale.
const AS_OF = new Date(Date.UTC(2026, 8, 25));
const leasehold = (rows: ReturnType<typeof row>[], groundLease = "Ground lease through December 31, 2071; unsubordinated.") =>
  ({
    ...SAMPLE_DEAL.extraction,
    totalPages: 40,
    interest: { kind: "leasehold", summary: "The leasehold interest in the building", share: "", groundLease, loan: "", page: "p. 12" },
    metrics: [...SAMPLE_DEAL.extraction.metrics, ...rows],
  }) as ExtractionResult;
const modelOf = (ex: ExtractionResult) => deriveUnderwriteInputs(ex, SAMPLE_DEAL.name).inputs;
const read = (end: string, extra: ReturnType<typeof row>[] = [], groundLease?: string) => {
  const ex = leasehold([row("Ground lease expiration", end), ...extra], groundLease);
  return readLeaseholdExit(ex, modelOf(ex), AS_OF)!;
};

describe("termShare — the years left, at the return a perpetuity at the cap implies", () => {
  it("is the year-by-year sum, and /tools' own leasehold arithmetic, to the cent", () => {
    const cap = 6.5;
    const g = 3;
    const n = 40;
    const noi = 1_000_000;
    let sum = 0;
    for (let t = 1; t <= n; t += 1) sum += (noi * Math.pow(1 + g / 100, t - 1)) / Math.pow(1 + (cap + g) / 100, t);
    const capitalised = noi / (cap / 100);
    expect(termShare(cap, g, n) * capitalised).toBeCloseTo(sum, 2);
    // A ground rent of nothing, the same growth, the same rate: the card's
    // leaseholdPv is the same stream.
    expect(termShare(cap, g, n) * capitalised).toBeCloseTo(leaseholdPv(noi, 0, g, 0, n, cap + g), 2);
  });

  it("runs from nothing at no years left toward the whole as the term lengthens", () => {
    expect(termShare(6.5, 3, 0)).toBe(0);
    expect(termShare(6.5, 3, 10)).toBeLessThan(termShare(6.5, 3, 20));
    expect(termShare(6.5, 3, 20)).toBeLessThan(termShare(6.5, 3, 40));
    expect(termShare(6.5, 3, 500)).toBeCloseTo(1, 6);
  });
});

describe("readLeaseholdExit — the model's exit on the term left at its sale", () => {
  it("values the exit on the 40.3 years left at the sale, and runs the model again at that exit", () => {
    const r = read("December 31, 2071");
    expect(r.holdYears).toBe(5);
    expect(r.exitCapPct).toBeCloseTo(5.45, 6);
    expect(r.growthPct).toBeCloseTo(3, 6);
    expect(r.returnPct).toBeCloseTo(8.45, 6);
    const t = r.onTerm!;
    expect(t.yearsAtSale).toBeCloseTo(40.25, 6);
    expect(Math.round(t.sharePct)).toBe(87);
    expect(t.onTerm).toBeCloseTo(r.capitalised * (t.sharePct / 100), 2);
    expect(t.termCapPct).toBeCloseTo(r.exitCapPct / (t.sharePct / 100), 6);
    // The round trip: the engine at the term's cap sells for the term's value.
    const again = computeUnderwrite({ ...modelOf(leasehold([row("Ground lease expiration", "December 31, 2071")])), exitCapPct: t.termCapPct / 100 });
    expect(again.residual.grossSaleProceeds).toBeCloseTo(t.onTerm, 2);
    // A smaller exit is a smaller return.
    expect(t.leveredIrrPct!).toBeLessThan(r.leveredIrrPct!);
    expect(t.unleveredIrrPct!).toBeLessThan(r.unleveredIrrPct!);
    expect(leaseholdExitSentence(r)).toBe(
      "With 40.3 years left at the model's sale in year 5, the term bears 87% of the capitalised exit — $72.2M against $82.5M — which is the model's 5.45% exit cap read as 6.23% on a building that reverts. At that exit the model's levered IRR is 6.2%, against 11.7% as it runs.",
    );
  });

  it("the shorter the term at the sale, the less of the exit it bears", () => {
    const long = read("December 31, 2071").onTerm!;
    const short = read("December 31, 2045").onTerm!;
    expect(short.yearsAtSale).toBeCloseTo(14.25, 6);
    expect(Math.round(short.sharePct)).toBe(52);
    expect(short.termCapPct).toBeGreaterThan(long.termCapPct);
    // A negative return is said with a minus sign.
    expect(leaseholdExitSentence(read("December 31, 2045"))).toContain("the model's levered IRR is −24.4%, against 11.7% as it runs");
  });

  it("says the sale does not repay the loan where no levered return solves", () => {
    const r = read("December 31, 2036");
    expect(r.onTerm!.leveredIrrPct).toBeNull();
    expect(leaseholdExitSentence(r)).toContain("At that exit the sale does not repay the model's loan, so no levered return solves.");
  });

  it("prices no sale where the lease ends inside the hold — the building reverts first", () => {
    const r = read("March 2029");
    expect(r.endsInHold).toBe(true);
    expect(r.endsInYear).toBe(3);
    expect(r.onTerm).toBeNull();
    expect(leaseholdExitSentence(r)).toBe(
      "The ground lease ends Mar 2029, in year 3 of the model's 5-year hold: the building reverts to the landowner before the model sells it, so the income after that and the sale proceeds are not this buyer's to collect.",
    );
    expect(leaseholdLenderLine(r)).toBeNull();
  });

  it("says a term long enough to bear the capitalised exit does, and adds no options to it", () => {
    const r = read("June 30, 2150", [row("Ground lease extension options", "Four 10-year options")]);
    expect(r.onTerm!.sharePct).toBeGreaterThan(99.5);
    expect(leaseholdExitSentence(r)).toBe(
      "With 118.8 years left at the model's sale in year 5, the term bears the capitalised exit within 1% — the model's exit holds as it runs.",
    );
    expect(leaseholdOptionsLine(r)).toBeNull();
  });

  it("reads the options beside the term as the ceiling, never instead of it", () => {
    const r = read("December 31, 2071", [row("Ground lease extension options", "Four (4) ten (10) year options")]);
    expect(r.withOptions!.yearsAtSale).toBeCloseTo(80.25, 6);
    expect(r.withOptions!.sharePct).toBeGreaterThan(r.onTerm!.sharePct);
    expect(leaseholdOptionsLine(r)).toBe(
      "Were every extension option exercised (four of 10 years, as stated), 80.3 years would be left at the sale and the term would bear 98% of the capitalised exit ($81.2M). An option adds years only if the leaseholder exercises it, and its rent usually resets to market when it does, so that is the ceiling.",
    );
    // Where the lease ends inside the hold, the options are the way past it.
    const ends = read("March 2029", [row("Ground lease extension options", "Four 10-year options")]);
    expect(ends.onTerm).toBeNull();
    expect(leaseholdOptionsLine(ends)).toContain("37.5 years would be left at the sale");
  });

  it("asks whether the buyer at the sale can finance the term that is left", () => {
    expect(leaseholdLenderLine(read("December 31, 2071"))).toBe(
      "The lease as stated is unsubordinated, and a buyer's 10-year loan at the sale needs 20 years of lease left — the loan's term and the 10-year margin lenders want. It will have 40.3 years.",
    );
    expect(leaseholdLenderLine(read("December 31, 2045", [], "Ground lease through 2045."))).toBe(
      "Unless the landowner subordinates, a buyer's 10-year loan at the sale needs 20 years of lease left — the loan's term and the 10-year margin lenders want — and it will have 14.3 years: the buyer the model sells to may not be able to finance it at all, which costs more than the term's arithmetic says.",
    );
    expect(leaseholdLenderLine(read("December 31, 2045", [], "The fee owner has subordinated to leasehold financing."))).toBe(
      "The lease as stated is subordinated: the landowner has agreed to stand behind the mortgage, so a lender can take the building without the lease ending under it.",
    );
  });

  it("reads subordination only as the lease states it", () => {
    expect(subordinationOf("The ground lease is unsubordinated.")).toBe(false);
    expect(subordinationOf("The fee is not subordinated to any mortgage.")).toBe(false);
    expect(subordinationOf("Fee subordinated to leasehold mortgage.")).toBe(true);
    expect(subordinationOf("Ground lease through 2071.")).toBeNull();
  });

  it("is null for anything but a leasehold, for a term the memorandum does not state, and with no model", () => {
    const ex = leasehold([row("Ground lease expiration", "December 31, 2071")]);
    expect(readLeaseholdExit({ ...ex, interest: { ...ex.interest!, kind: "fee_simple" } }, modelOf(ex), AS_OF)).toBeNull();
    expect(readLeaseholdExit({ ...ex, interest: { ...ex.interest!, kind: "leased_fee" } }, modelOf(ex), AS_OF)).toBeNull();
    const noTerm = leasehold([]);
    expect(readLeaseholdExit(noTerm, modelOf(noTerm), AS_OF)).toBeNull();
    expect(readLeaseholdExit(ex, null, AS_OF)).toBeNull();
    expect(readLeaseholdExit(null, modelOf(ex), AS_OF)).toBeNull();
  });

  it("hands the card plain data whose sentences read clean", () => {
    const v = leaseholdExitView(read("December 31, 2071", [row("Ground lease extension options", "Four 10-year options")]));
    expect(v.endLabel).toBe("Dec 2071");
    expect(v.page).toBe("p. 12");
    expect(v.yearsAtSale).toBeCloseTo(40.25, 6);
    expect(v.optionYears).toBe(40);
    for (const line of [v.termLine, v.sentence, v.optionsLine, v.lenderLine, v.basisLine]) {
      expect(line).toBeTruthy();
      expect(gluedWords(line!)).toEqual([]);
    }
    expect(v.basisLine).toBe(
      "The years left are valued at the model's own exit return: its 5.45% exit cap plus the 3.0% its NOI grows in the year after the sale, 8.45% — what a buyer paying that cap for a building that never reverts would earn. It is the term's arithmetic alone: a leasehold buyer asks a premium on top for the lease's resets, subordination and coverage, so the truth is at or under it.",
    );
  });
});

describe("the term, wherever the deal is read after the extraction", () => {
  it("the deal context says when the ground lease ends", () => {
    const ex = leasehold([row("Ground lease expiration", "December 31, 2071"), row("Ground lease extension options", "Four 10-year options")]);
    const ctx = dealContextFor(ex)!;
    expect(ctx).toMatch(/The ground lease ends Dec 2071, \d+\.\d years from today, with extension options after it as stated: four of 10 years, 40 years in all\./);
  });
});

describe("the term, wherever a leasehold is summarized (#422)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("the pipeline's tag carries the years left, in whole years down; either side of the lease", () => {
    const ex = leasehold([row("Ground lease expiration", "December 31, 2071")]);
    expect(interestTag(ex, AS_OF)).toBe("Leasehold, 45 yrs left");
    expect(interestTag({ ...ex, interest: { ...ex.interest!, kind: "leased_fee" } }, AS_OF)).toBe("Leased fee, reverts in 45 yrs");
    expect(interestTag(leasehold([row("Ground lease expiration", "March 2027")]), AS_OF)).toBe("Leasehold, under 1 yr left");
    // A term that has passed, or none stated: the kind alone.
    expect(interestTag(leasehold([row("Ground lease expiration", "March 2020")]), AS_OF)).toBe("Leasehold");
    expect(interestTag(leasehold([]), AS_OF)).toBe("Leasehold");
  });

  it("the documents' short line says when the lease ends — the memo's header and the workbook's cover", () => {
    const r = readInterest(leasehold([row("Ground lease expiration", "December 31, 2071")]), 68_000_000, AS_OF)!;
    expect(interestShortLine(r)).toBe(
      "A leasehold — the building and a lease on the land, not the land; the lease ends Dec 2071, 45.3 years from today",
    );
    const year = readInterest(leasehold([row("Ground lease expiration", "2071")]), 68_000_000, AS_OF)!;
    expect(interestShortLine(year)).toBe("A leasehold — the building and a lease on the land, not the land; the lease ends in 2071, 44.3 years from today");
    expect(interestShortLine(readInterest(leasehold([]), 68_000_000, AS_OF)!)).toBe("A leasehold — the building and a lease on the land, not the land");
  });

  it("the workbook's cover carries the read and the exit cap that runs it on the term", async () => {
    vi.useFakeTimers({ now: AS_OF, toFake: ["Date"] });
    const ex = leasehold([row("Ground lease expiration", "December 31, 2071")]);
    const derived = deriveUnderwriteInputs(ex, SAMPLE_DEAL.name);
    expect(derived.meta.leasehold?.line).toBe(
      "With 40.3 years left at the model's sale in year 5, the term bears 87% of the capitalised exit — $72.2M against $82.5M — which is the model's 5.45% exit cap read as 6.23% on a building that reverts. At that exit the model's levered IRR is 6.2%, against 11.7% as it runs. Enter 6.23% as the Exit Cap to run this workbook on the term.",
    );
    expect(derived.meta.leasehold?.read).toContain("It will have 40.3 years.");
    expect(derived.meta.leasehold?.read).toContain("The years left are valued at the model's own exit return");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(derived)) as unknown as ArrayBuffer);
    const cover = wb.getWorksheet("Cover")!;
    let at = 0;
    cover.eachRow((r, n) => {
      if (String(r.getCell(2).value ?? "") === "The exit, on the lease's term") at = n;
    });
    expect(at).toBeGreaterThan(0);
    expect(String(cover.getCell(at, 3).value)).toContain("Enter 6.23% as the Exit Cap to run this workbook on the term.");
    expect(String(cover.getCell(at + 1, 3).value)).toContain("It will have 40.3 years.");
    // "What is being sold" carries the lease's end above it.
    let sold = 0;
    cover.eachRow((r, n) => {
      if (String(r.getCell(2).value ?? "") === "What is being sold") sold = n;
    });
    expect(String(cover.getCell(sold, 3).value)).toContain("the lease ends Dec 2071, 45.3 years from today");
    // A fee simple's cover says none of it.
    expect(deriveUnderwriteInputs(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name).meta.leasehold).toBeNull();
  });
});
