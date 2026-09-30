import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import {
  esaAge,
  esaFinding,
  readSiteReports,
  reportDate,
  siteReportTermRows,
  siteReportsContextLine,
  siteReportsModelLine,
  siteReportsNote,
  siteReportsShortLine,
  siteReportsTag,
  zoningStatus,
} from "./site-reports";

const ASOF = new Date("2026-09-30T12:00:00Z");
const row = (label: string, value: string, page = "p. 48") => ({ label, value, page });
const deal = (metrics: { label: string; value: string; page?: string }[]): ExtractionResult =>
  ({ propertyName: "The Maddox", assetClass: "Multifamily", totalPages: 80, metrics: [row("Asking price", "$42,000,000", "p. 2"), ...metrics] }) as unknown as ExtractionResult;

describe("what a Phase I found, by its words (#465)", () => {
  it("reads a recognized condition, a controlled one, a historical one and none apart", () => {
    const cases: [string, ReturnType<typeof esaFinding>][] = [
      ["No RECs identified", "none"],
      ["No recognized environmental conditions were identified.", "none"],
      ["The assessment did not identify any RECs", "none"],
      ["RECs: none", "none"],
      ["No evidence of RECs, CRECs or HRECs", "none"],
      ["0 RECs", "none"],
      ["Clean Phase I", "none"],
      ["No further investigation is recommended", "none"],
      ["One REC: former dry cleaner on the adjacent parcel", "rec"],
      ["Recognized environmental condition associated with a former gas station", "rec"],
      ["No RECs; one HREC (closed UST, 2011)", "hrec"],
      ["Historical recognized environmental condition: removed heating-oil tank", "hrec"],
      ["A controlled recognized environmental condition (CREC) with an activity and use limitation", "crec"],
      ["CREC — deed restriction on groundwater use", "crec"],
      ["De minimis conditions only", "de_minimis"],
      ["Phase II recommended for the former auto repair bays", "stated"],
      ["No further action letter issued for a former UST", "stated"],
      // A denial said after the condition it denies.
      ["RECs were not identified", "none"],
      ["Recognized environmental conditions were not identified.", "none"],
      // An exception to a denial, in the denial's own clause, is the finding.
      [
        "This assessment has revealed no evidence of recognized environmental conditions in connection with the property except for the following: a former dry cleaner",
        "rec",
      ],
      ["No RECs except de minimis conditions", "de_minimis"],
      ["No RECs other than a CREC for the capped former landfill cell", "crec"],
      // An exception in a clause of its own is not one.
      ["No RECs were identified; all areas were accessible except the basement", "none"],
    ];
    for (const [words, want] of cases) expect(esaFinding(words), words).toBe(want);
  });

  it("dates a report as early as its words allow, and ages it against the 180-day and one-year marks", () => {
    expect(reportDate("March 15, 2026")).toBe("2026-03-15");
    expect(reportDate("2026-03-15")).toBe("2026-03-15");
    expect(reportDate("3/15/2026")).toBe("2026-03-15");
    expect(reportDate("March 2026")).toBe("2026-03-01");
    expect(reportDate("3/2026")).toBe("2026-03-01");
    expect(reportDate("2025")).toBe("2025-01-01");
    expect(reportDate("Recent")).toBeNull();
    expect(esaAge(180)).toBe("current");
    expect(esaAge(181)).toBe("update");
    expect(esaAge(365)).toBe("update");
    expect(esaAge(366)).toBe("redo");
  });

  it("reads zoning as stated: conforming, legal non-conforming, non-conforming", () => {
    expect(zoningStatus("Legal conforming")).toBe("conforming");
    expect(zoningStatus("Legal non-conforming use (density)")).toBe("legal_non_conforming");
    expect(zoningStatus("Grandfathered")).toBe("legal_non_conforming");
    expect(zoningStatus("Non-conforming as to parking")).toBe("non_conforming");
    expect(zoningStatus("Illegal non-conforming")).toBe("non_conforming");
    expect(zoningStatus("Complies with RM-2")).toBe("conforming");
    expect(zoningStatus("RM-2")).toBe("stated");
    expect(zoningStatus("Complies with RM-2; no open zoning violations")).toBe("conforming");
    expect(zoningStatus("Legal conforming; no violations of record")).toBe("conforming");
    expect(zoningStatus("Legal, non-conforming as to density")).toBe("legal_non_conforming");
    expect(zoningStatus("Legally nonconforming")).toBe("legal_non_conforming");
  });
});

describe("the reports a memorandum cites, read (#465)", () => {
  const cited = deal([
    row("Phase I ESA date", "November 2024"),
    row("Phase I ESA findings", "One REC: former dry cleaner on the adjacent parcel"),
    row("Phase II ESA", "Recommended; not completed"),
    row("PCA date", "February 2026"),
    row("PCA immediate repairs", "$630,000"),
    row("PCA replacement reserves", "$300 per unit per year"),
    row("Seismic PML", "24%"),
    row("Zoning conformance", "Legal non-conforming (density)"),
  ]);

  it("reads every report, the most serious first, each only as stated", () => {
    const r = readSiteReports(cited, ASOF)!;
    expect(r.phaseI).toMatchObject({ date: "2024-11-01", age: "redo", finding: "rec", words: "One REC: former dry cleaner on the adjacent parcel" });
    expect(r.phaseII).toBe("Recommended; not completed");
    expect(r.pca).toMatchObject({ date: "2026-02-01", immediate: 630_000, reserves: "$300 per unit per year" });
    expect(r.pmlPct).toBe(24);
    expect(r.zoning).toEqual({ status: "legal_non_conforming", words: "Legal non-conforming (density)" });
    expect(r.price).toBe(42_000_000);
    expect(r.page).toBe("p. 48");
    expect(r.headline).toContain("The seller's Phase I, dated Nov 2024, found a recognized environmental condition");
    expect(r.headline).toContain("It is dated 22 months before today: past the year a Phase I is good for before a purchase");
    expect(r.headline).toContain("puts the immediate repairs at $630,000, 1.5% of the asking price");
    expect(r.headline).toContain("The seismic PML is 24%: most lenders ask for earthquake insurance or a retrofit at 20% or more");
    expect(r.headline).toContain("law-and-ordinance cover");
    expect(siteReportsTag(cited, ASOF)).toBe("Phase I: REC");
  });

  it("says a report inside the year but past 180 days needs updating, not replacing", () => {
    const r = readSiteReports(deal([row("Phase I ESA date", "January 10, 2026"), row("Phase I ESA findings", "No RECs")]), ASOF)!;
    expect(r.phaseI).toMatchObject({ age: "update", finding: "none", ageDays: 263 });
    expect(r.headline).toBe(
      'The seller\'s Phase I, dated Jan 2026, found no recognized environmental conditions ("No RECs"). It is dated 263 days before today: inside the year a Phase I is good for, but past 180 days, so its interviews, record searches and site visit must be updated before closing.',
    );
    expect(siteReportsTag(deal([row("Phase I ESA date", "January 10, 2026"), row("Phase I ESA findings", "No RECs")]), ASOF)).toBeNull();
  });

  it("flags in order: a PML over the line, a CREC, zoning, repairs, a stale report", () => {
    expect(siteReportsTag(deal([row("Seismic PML", "21.5%"), row("Phase I ESA findings", "CREC")]), ASOF)).toBe("PML 21.5%");
    expect(siteReportsTag(deal([row("Seismic PML", "12"), row("Phase I ESA findings", "CREC: AUL on groundwater")]), ASOF)).toBe("Phase I: CREC");
    expect(siteReportsTag(deal([row("Zoning conformance", "Non-conforming as to parking")]), ASOF)).toBe("Non-conforming");
    expect(siteReportsTag(deal([row("PCA immediate repairs", "$1,250,000")]), ASOF)).toBe("Repairs $1.3M");
    expect(siteReportsTag(deal([row("Phase I ESA date", "2024"), row("Phase I ESA findings", "No RECs")]), ASOF)).toBe("Phase I over a year old");
    expect(siteReportsTag(deal([row("PCA immediate repairs", "None")]), ASOF)).toBeNull();
  });

  it("reads 'None' as a finding, a range or a per-unit figure as no figure, and absent as absent", () => {
    expect(readSiteReports(deal([row("PCA immediate repairs", "None")]), ASOF)!.pca!.immediate).toBe(0);
    expect(readSiteReports(deal([row("PCA immediate repairs", "$400,000–$600,000")]), ASOF)!.pca!.immediate).toBeNull();
    expect(readSiteReports(deal([row("PCA immediate repairs", "$2,500 per unit")]), ASOF)!.pca!.immediate).toBeNull();
    expect(readSiteReports(deal([row("PCA immediate repairs", "None identified")]), ASOF)!.pca!.immediate).toBe(0);
    expect(readSiteReports(deal([row("PCA immediate repairs", "No immediate repairs")]), ASOF)!.pca!.immediate).toBe(0);
    expect(readSiteReports(deal([]), ASOF)).toBeNull();
    expect(readSiteReports(null, ASOF)).toBeNull();
  });

  it("reads a row that states nothing as no row, never as a clean report", () => {
    // "N/A" is not "None": a Phase I whose finding nobody states was not found clean.
    expect(readSiteReports(deal([row("Phase I ESA findings", "N/A")]), ASOF)).toBeNull();
    expect(readSiteReports(deal([row("PCA immediate repairs", "Not stated"), row("Seismic PML", "—")]), ASOF)).toBeNull();
    const dated = readSiteReports(deal([row("Phase I ESA date", "May 2026"), row("Phase I ESA findings", "Not stated")]), ASOF)!;
    expect(dated.phaseI).toMatchObject({ date: "2026-05-01", ageDays: 152, age: "current", finding: null, words: "" });
    expect(dated.headline).toBe("The memorandum cites the seller's Phase I, dated May 2026, and states no finding.");
    expect(siteReportTermRows([row("Phase I ESA findings", "N/A"), row("Seismic PML", "14%")]).map((m) => m.label)).toEqual(["Seismic PML"]);
  });

  it("reads a date filed under the report's own name as its date, never its finding", () => {
    const r = readSiteReports(deal([row("Phase I ESA", "March 2026")]), ASOF)!;
    expect(r.phaseI).toMatchObject({ date: "2026-03-01", finding: null });
    // A finding under that name is still a finding.
    expect(readSiteReports(deal([row("Phase I ESA", "No RECs")]), ASOF)!.phaseI).toMatchObject({ date: null, finding: "none" });
  });

  it("never reads a development's phase, or a Phase II, as the Phase I", () => {
    const phased = deal([row("Phase I units", "120"), row("Phase II delivery", "2028")]);
    expect(readSiteReports(phased, ASOF)).toBeNull();
    const two = readSiteReports(deal([row("Phase II ESA", "Completed March 2026; no further action")]), ASOF)!;
    expect(two.phaseI).toBeNull();
    expect(two.phaseII).toBe("Completed March 2026; no further action");
  });

  it("drops a page the memorandum does not have", () => {
    const r = readSiteReports(deal([row("Seismic PML", "14%", "p. 212")]), ASOF)!;
    expect(r.page).toBe("");
    expect(r.headline).toBe("The seismic PML is 14%, under the 20% at which most lenders ask for earthquake insurance.");
  });
});

describe("the reports wherever the deal is summarized (#465)", () => {
  const r = readSiteReports(
    deal([
      row("Phase I ESA date", "March 2026"),
      row("Phase I ESA findings", "No RECs"),
      row("PCA immediate repairs", "$630,000"),
      row("Seismic PML", "14%"),
    ]),
    ASOF,
  )!;

  it("says them in one line for the memo, the workbook and the report", () => {
    expect(siteReportsShortLine(r)).toBe(
      "Reports: Phase I Mar 2026, no recognized environmental conditions (past 180 days: to update before closing); PCA immediate repairs $630,000; seismic PML 14%",
    );
  });

  it("says what the model does with the immediate repairs", () => {
    expect(siteReportsModelLine(r, { capitalYr1: 630_000, capitalIsRepairs: true })).toBe(
      "The model carries the PCA's $630,000 of immediate repairs as its year-1 capital, as stated; a lender may hold more than that in escrow at closing.",
    );
    expect(siteReportsModelLine(r, { capitalYr1: 2_400_000, capitalIsRepairs: false })).toContain("is read as including the PCA's $630,000 of immediate repairs");
    const clean = readSiteReports(deal([row("Phase I ESA findings", "No RECs")]), ASOF)!;
    expect(siteReportsModelLine(clean, { capitalYr1: 0, capitalIsRepairs: false })).toBe("");
  });

  it("hands the steps after the extraction the read, and the review its traps by name", () => {
    expect(siteReportsContextLine(r)).toMatch(/^The third-party reports: The seller's Phase I, dated Mar 2026/);
    const note = siteReportsNote(r);
    expect(note).toContain("SITE-REPORT TRAPS");
    for (const t of ["(a) RELIANCE", "(b) THE PHASE I'S AGE AND FINDINGS", "(c) THE IMMEDIATE REPAIRS", "(d) THE RESERVES", "(e) SEISMIC AND ZONING"]) {
      expect(note).toContain(t);
    }
  });

  it("leads the key terms with the findings, the date, the repairs, the PML and the zoning", () => {
    const rows = [
      row("NOI", "$2,100,000"),
      row("Zoning conformance", "Legal conforming"),
      row("Phase I ESA findings", "No RECs"),
      row("Seismic PML", "14%"),
      row("PCA immediate repairs", "$630,000"),
      row("Phase I ESA date", "March 2026"),
      row("Phase I units", "120"),
    ];
    expect(siteReportTermRows(rows).map((m) => m.label)).toEqual([
      "Phase I ESA findings",
      "Phase I ESA date",
      "PCA immediate repairs",
      "Seismic PML",
      "Zoning conformance",
    ]);
  });
});

describe("the prompt asks for what the reader reads (#465)", () => {
  it("names every report row by the label the reader takes", () => {
    const prompt = extractionInstruction("multifamily" as never);
    const labels = [
      "Phase I ESA date",
      "Phase I ESA findings",
      "Phase II ESA",
      "PCA date",
      "PCA immediate repairs",
      "PCA replacement reserves",
      "Seismic PML",
      "Zoning conformance",
    ];
    for (const label of labels) expect(prompt).toContain(`"${label}"`);
    // And each label, filed as a row, is read.
    const r = readSiteReports(
      deal([
        row("Phase I ESA date", "March 2026"),
        row("Phase I ESA findings", "No RECs"),
        row("Phase II ESA", "Not recommended"),
        row("PCA date", "March 2026"),
        row("PCA immediate repairs", "$120,000"),
        row("PCA replacement reserves", "$300 per unit per year"),
        row("Seismic PML", "9%"),
        row("Zoning conformance", "Legal conforming"),
      ]),
      ASOF,
    )!;
    expect([r.phaseI?.date, r.phaseI?.finding, r.phaseII, r.pca?.date, r.pca?.immediate, r.pca?.reserves, r.pmlPct, r.zoning?.status]).toEqual([
      "2026-03-01",
      "none",
      "Not recommended",
      "2026-03-01",
      120_000,
      "$300 per unit per year",
      9,
      "conforming",
    ]);
  });
});
