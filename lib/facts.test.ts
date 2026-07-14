import { describe, it, expect } from "vitest";
import {
  parsePageNumber,
  deriveUnit,
  confidenceFor,
  buildDealFacts,
  type FactMetric,
} from "./facts";
import { countPdfPages } from "./pdf";

describe("parsePageNumber", () => {
  it("reads the common forms", () => {
    expect(parsePageNumber("p. 12")).toBe(12);
    expect(parsePageNumber("Page 7")).toBe(7);
    expect(parsePageNumber("pp. 3-4")).toBe(3);
    expect(parsePageNumber("14")).toBe(14);
  });
  it("rejects missing / non-numeric", () => {
    expect(parsePageNumber("")).toBeNull();
    expect(parsePageNumber(undefined)).toBeNull();
    expect(parsePageNumber("n/a")).toBeNull();
    expect(parsePageNumber("0")).toBeNull();
  });
});

describe("deriveUnit", () => {
  it("classifies value strings", () => {
    expect(deriveUnit("$50,000,000")).toBe("$");
    expect(deriveUnit("6.0%")).toBe("%");
    expect(deriveUnit("$274,000/unit")).toBe("$/unit");
    expect(deriveUnit("$210/SF")).toBe("$/SF");
    expect(deriveUnit("1.35x")).toBe("x");
    expect(deriveUnit("300,000 SF")).toBe("SF");
    expect(deriveUnit("312 units")).toBe("units");
  });
});

describe("confidenceFor", () => {
  it("flagged => low, pro forma => medium, else high", () => {
    expect(confidenceFor({ label: "", value: "", flagged: true })).toBe("low");
    expect(confidenceFor({ label: "", value: "", basis: "pro_forma" })).toBe("medium");
    expect(confidenceFor({ label: "", value: "", basis: "in_place" })).toBe("high");
  });
});

describe("buildDealFacts — the absolute source-validation rule", () => {
  const metrics: FactMetric[] = [
    { label: "Asking price", value: "$50,000,000", page: "p. 5", flagged: false, locatorSnippet: "Offering price of fifty million dollars for the asset overall here today extra" },
    { label: "Going-in cap", value: "6.0%", page: "p. 6", flagged: true, basis: "pro_forma" },
    { label: "Phantom metric", value: "$1", page: "p. 900", flagged: false }, // out of range
    { label: "No page", value: "42", flagged: false }, // no citation
  ];

  it("locates an in-range page and derives its unit", () => {
    const f = buildDealFacts(metrics, 120)[0];
    expect(f.located).toBe(true);
    expect(f.pageNumber).toBe(5);
    expect(f.unit).toBe("$");
    expect(f.provenance).toBe("extracted");
  });

  it("truncates the locator snippet to ~12 words", () => {
    const f = buildDealFacts(metrics, 120)[0];
    expect(f.locatorSnippet!.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it("marks an out-of-range page 'source not located' — never shows it", () => {
    const f = buildDealFacts(metrics, 120)[2];
    expect(f.located).toBe(false);
    expect(f.pageNumber).toBeNull();
  });

  it("marks a metric with no cited page as not located", () => {
    const f = buildDealFacts(metrics, 120)[3];
    expect(f.located).toBe(false);
    expect(f.pageNumber).toBeNull();
  });

  it("when the page count is unknown, NOTHING is located (no guessed pages)", () => {
    const facts = buildDealFacts(metrics, null);
    expect(facts.every((f) => !f.located && f.pageNumber === null)).toBe(true);
  });

  it("carries confidence through from the metric", () => {
    expect(buildDealFacts(metrics, 120)[1].confidence).toBe("low"); // flagged
  });
});

describe("countPdfPages (fail-safe leaf counter)", () => {
  it("counts /Type /Page leaves (not the /Pages tree node)", () => {
    const pdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type /Pages /Kids[3 0 R 4 0 R 5 0 R] /Count 3>>endobj\n" +
        "3 0 obj<</Type /Page>>endobj 4 0 obj<</Type /Page>>endobj 5 0 obj<</Type /Page>>endobj\n%%EOF",
      "latin1",
    );
    expect(countPdfPages(pdf)).toBe(3);
  });
  it("does NOT overcount from a bookmark/outline /Count (the fabrication risk)", () => {
    // A 3-page doc whose Outlines dict carries /Count 500 must still read 3 —
    // never 500, which would validate nonexistent cited pages.
    const pdf = Buffer.from(
      "%PDF-1.5\n1 0 obj<</Type /Catalog /Pages 2 0 R /Outlines 9 0 R>>endobj\n" +
        "2 0 obj<</Type /Pages /Kids[3 0 R 4 0 R 5 0 R] /Count 3>>endobj\n" +
        "3 0 obj<</Type /Page>>endobj 4 0 obj<</Type /Page>>endobj 5 0 obj<</Type /Page>>endobj\n" +
        "9 0 obj<</Type /Outlines /Count 500>>endobj\n%%EOF",
      "latin1",
    );
    expect(countPdfPages(pdf)).toBe(3);
  });
  it("returns null when no page leaves are visible (e.g. object streams) — fails safe", () => {
    expect(countPdfPages(Buffer.from("not a pdf at all"))).toBeNull();
    // An object-stream PDF hides page objects in a compressed /ObjStm; the
    // counter finds none and returns null → citations mark 'source not
    // located' rather than validating against a wrong number.
    expect(countPdfPages(Buffer.from("%PDF-1.6\n1 0 obj<</Type /ObjStm>>stream ...", "latin1"))).toBeNull();
  });
});

describe("parsePageNumber handles thousands separators", () => {
  it("reads 'p. 1,024' as 1024, not 1", () => {
    expect(parsePageNumber("p. 1,024")).toBe(1024);
  });
});
