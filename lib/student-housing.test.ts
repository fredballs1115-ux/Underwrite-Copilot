import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { extractionInstruction } from "@/lib/anthropic/prompts";
import {
  academicTerm,
  campusWalk,
  readStudentHousing,
  studentContextLine,
  studentHousingTag,
  studentModelLine,
  studentNote,
  studentShortLine,
  studentTermRows,
} from "./student-housing";

const row = (label: string, value: string, page = "p. 6") => ({ label, value, page, flagged: false });
const deal = (metrics: ReturnType<typeof row>[], assetClass = "student_housing"): ExtractionResult =>
  ({ dealName: "The Standard", assetClass, totalPages: 60, metrics: [row("Asking price", "$61,200,000", "p. 2"), ...metrics] }) as unknown as ExtractionResult;

describe("student housing, read as stated (#468)", () => {
  const full = deal([
    row("Beds", "612"),
    row("Units", "204"),
    row("Pre-leased", "87% for Fall 2026 as of September 1, 2026"),
    row("Pre-leased last year", "82% at the same point last year"),
    row("Distance to campus", "0.3 miles"),
    row("University", "The Ohio State University"),
    row("University enrollment", "61,369 (Fall 2025, +2.1% y/y)"),
    row("Parental guarantees", "78%"),
    row("Rent per bed", "$1,085 per month"),
    row("Lease term", "12-month individual leases"),
  ]);

  it("reads the pace against last year, the beds and the walk", () => {
    const r = readStudentHousing(full)!;
    expect(r).toMatchObject({
      preLeasedPct: 87,
      priorPct: 82,
      pacePts: 5,
      term: "Fall 2026",
      beds: 612,
      units: 204,
      pricePerBed: 100_000,
      rentPerBed: 1085,
      guaranteesPct: 78,
      university: "The Ohio State University",
      page: "p. 6",
    });
    expect(r.walk).toEqual({ stated: "0.3 miles", miles: 0.3, pedestrian: true });
    expect(r.headline).toContain(
      "The building is 87% pre-leased for Fall 2026, 5 points ahead of last year's 82% at the same point: the leases signed for the fall are the occupancy the year opens at.",
    );
    expect(r.headline).toContain("It leases by the bed: 612 beds, 3 a unit across 204 units, $100,000 a bed at the price and $1,085 a bed a month in rent.");
    expect(r.headline).toContain("It is 0.3 miles from campus: pedestrian, within the half mile a student walks.");
    expect(r.headline).toContain("78% of the leases carry a parent's guarantee.");
    expect(studentHousingTag(full)).toBe("Pre-leased 87%, +5 pts y/y");
  });

  it("reads a rent a bed with a hyphenated word beside the figure (research pass 37)", () => {
    // Any hyphen in the value had read as no rent.
    expect(readStudentHousing(deal([row("Beds", "612"), row("Rent per bed", "$1,085 per month (2026-27, all-inclusive)")]))!.rentPerBed).toBe(1085);
    expect(readStudentHousing(deal([row("Beds", "612"), row("Rent per bed", "$1,085-$1,250 per month")]))!.rentPerBed).toBeNull();
  });

  it("reads last year's pace from the same row where the words say so, and a pace behind as behind", () => {
    const r = readStudentHousing(deal([row("Beds", "400"), row("Pre-leased", "71.5% for 2026-27 vs. 78% a year ago")]))!;
    expect(r).toMatchObject({ preLeasedPct: 71.5, priorPct: 78, pacePts: -6.5, term: "2026–27" });
    expect(r.headline).toContain("6.5 points behind last year's 78% at the same point");
    expect(studentHousingTag(deal([row("Beds", "400"), row("Pre-leased", "71.5% for 2026-27 vs. 78% a year ago")]))).toBe("Pre-leased 71.5%, −6.5 pts y/y");
    // Two figures that do not say which is last year's are not a pace.
    expect(readStudentHousing(deal([row("Beds", "400"), row("Pre-leased", "71% (beds), 74% (units)")]))!.priorPct).toBeNull();
  });

  it("classifies the walk only from a stated distance", () => {
    expect(campusWalk("1.8 miles")).toEqual({ stated: "1.8 miles", miles: 1.8, pedestrian: false });
    expect(campusWalk("1,200 feet")).toMatchObject({ miles: 0.23, pedestrian: true });
    expect(campusWalk("an 8-minute walk to the Quad")).toMatchObject({ miles: null, pedestrian: true });
    expect(campusWalk("15 minute walk")).toMatchObject({ pedestrian: false });
    expect(campusWalk("Adjacent to campus")).toMatchObject({ pedestrian: true });
    expect(campusWalk("Close to campus")).toMatchObject({ miles: null, pedestrian: null });
    expect(academicTerm("92% for Fall 2026")).toBe("Fall 2026");
    expect(academicTerm("as of March 1")).toBe("");
    const drive = deal([row("Beds", "300"), row("Distance to campus", "2.1 miles, on the campus shuttle route")]);
    expect(studentHousingTag(drive)).toBe("Drive-to campus");
    expect(readStudentHousing(drive)!.headline).toContain("past the half mile a student walks");
  });

  it("says what the model's vacancy assumes against the pre-leasing", () => {
    const r = readStudentHousing(full)!;
    expect(studentModelLine(r, { vacancyPct: 5 })).toBe(
      "The model's 5% vacancy assumes 95% of the beds leased; the building is 87% pre-leased for Fall 2026, so 8 points of the fall's leasing is still to sign.",
    );
    expect(studentModelLine(r, { vacancyPct: 15 })).toBe(
      "The model's 15% vacancy is covered: the building is already 87% pre-leased for Fall 2026, against the 85% the model runs at.",
    );
  });

  it("is null on anything but student housing, and where nothing is stated", () => {
    expect(readStudentHousing(deal([row("Units", "240"), row("Occupancy", "95%")], "multifamily"))).toBeNull();
    expect(readStudentHousing(deal([], "student_housing"))).toBeNull();
    expect(readStudentHousing(deal([row("Pre-leased", "N/A"), row("Distance to campus", "—")]))).toBeNull();
    expect(readStudentHousing(null)).toBeNull();
    // A pre-leasing figure beside beds reads even where the class was not.
    expect(readStudentHousing(deal([row("Beds", "500"), row("Pre-leased", "90%")], "multifamily"))?.preLeasedPct).toBe(90);
  });

  it("says it in one line, hands the steps after the extraction the read, and leads the key terms", () => {
    const r = readStudentHousing(full)!;
    expect(studentShortLine(r)).toBe(
      "Student housing: 87% pre-leased for Fall 2026 (+5 pts on last year); 612 beds at $100k a bed; 0.3 miles to campus (pedestrian); The Ohio State University",
    );
    expect(studentContextLine(r)).toMatch(/^Student housing: The building is 87% pre-leased/);
    expect(studentNote(r)).toContain("STUDENT HOUSING AS STATED:");
    expect(studentTermRows(full.metrics).map((m) => m.label)).toEqual(["Pre-leased", "Pre-leased last year", "Distance to campus", "Rent per bed"]);
  });
});

describe("the prompt asks for what the reader reads (#468)", () => {
  it("names every student-housing row by the label the reader takes", () => {
    const prompt = extractionInstruction("student_housing" as never);
    for (const label of ["Pre-leased", "Pre-leased last year", "Beds", "Distance to campus", "University", "University enrollment", "Parental guarantees", "Rent per bed", "Lease term"]) {
      expect(prompt).toContain(`"${label}"`);
    }
  });
});
