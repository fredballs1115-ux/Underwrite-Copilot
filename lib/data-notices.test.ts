import { describe, expect, it } from "vitest";
import {
  BLS_NOTICE,
  DTCC_SOFR_SENTENCE,
  FRED_NOTICE,
  NY_FED_NOTICE_TEMPLATE,
  NY_FED_PUBLISHER,
  NY_FED_SERIES,
  NY_FED_SOFR_NOTICE,
  NY_FED_SOFR_NOTICES,
  carriesNyFedNotice,
  documentNotices,
  nyFedNotice,
} from "./data-notices";

// Each notice in the provider's own words, as the GitHub runner printed its
// terms page. The words below are typed from those prints, apart from the
// module, so an edit to a notice fails here rather than shipping a sentence
// the provider never wrote.

describe("the providers' notices, in their printed words", () => {
  it("FRED's notice (fred.stlouisfed.org/docs/api/terms_of_use.html, zori probe run 37262488972)", () => {
    expect(FRED_NOTICE).toBe(
      "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.",
    );
  });

  it("the BLS's sentence (bls.gov/developers/termsOfService.htm, the same run)", () => {
    expect(BLS_NOTICE).toBe(
      "BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.",
    );
  });

  it("the New York Fed's template, exactly as printed (zori probe runs 37262564561 and 37262665824)", () => {
    expect(NY_FED_NOTICE_TEMPLATE).toBe(
      "The [NAME OF DATA or CONTENT]* is subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the [DATA NAME] by [NAME OF PUBLISHER], does not [sanction] or [endorse] any particular republication, and has no liability for your use.",
    );
  });

  it("the template filled for SOFR with the site's own name as the publisher, and nothing else changed", () => {
    expect(NY_FED_PUBLISHER).toBe("Underwrite Copilot");
    expect(NY_FED_SOFR_NOTICE).toBe(
      "The SOFR data is subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the SOFR data by Underwrite Copilot, does not sanction or endorse any particular republication, and has no liability for your use.",
    );
    // No blank, bracket or footnote mark is left, whatever is filled in.
    for (const filled of [NY_FED_SOFR_NOTICE, nyFedNotice("BGCR", "a publisher")]) {
      expect(filled).not.toMatch(/[[\]*]/);
    }
  });

  it("the DTCC sentence the same terms print for SOFR's data", () => {
    expect(DTCC_SOFR_SENTENCE).toBe(
      "The Secured Overnight Financing Rate (SOFR) Data and Broad General Collateral Rate (BGCR) Data are calculated using data provided under a license granted to the New York Fed by DTCC Solutions LLC (“Solutions”), an affiliate of The Depository Trust & Clearing Corporation. Solutions, its affiliates, and third parties from which they obtained data have no liability for the content of this material.",
    );
    expect(NY_FED_SOFR_NOTICES).toBe(`${NY_FED_SOFR_NOTICE} ${DTCC_SOFR_SENTENCE}`);
  });

  it("the New York Fed's notice covers SOFR and its 30-day average, and no other series", () => {
    expect([...NY_FED_SERIES]).toEqual(["SOFR", "SOFR30DAYAVG"]);
    expect(carriesNyFedNotice("SOFR")).toBe(true);
    expect(carriesNyFedNotice("SOFR30DAYAVG")).toBe(true);
    for (const id of ["DFF", "DPRIME", "DGS10", "MORTGAGE30US", "", null, undefined]) {
      expect(carriesNyFedNotice(id)).toBe(false);
    }
  });

  it("every notice can be set in a PDF's standard Helvetica (WinAnsi), should a document print one", () => {
    // WinAnsi carries Latin-1 and the curly quotes, the dashes and the ®.
    const winAnsi = /^[\x20-\x7e -ÿ–—‘’“”•…]*$/;
    for (const notice of [FRED_NOTICE, BLS_NOTICE, NY_FED_SOFR_NOTICE, DTCC_SOFR_SENTENCE]) {
      expect(notice).toMatch(winAnsi);
    }
  });
});

// The batch-2 audit, LOW-7: the report's market page and the workbook's
// Market Read tab print FRED's and the BLS's figures with no page around them.
describe("documentNotices — the notices an export prints under its figures", () => {
  it("says FRED's wherever a figure came through FRED, the BLS's only for its own API", () => {
    expect(documentNotices(["Unemployment 3.4% (Jul 2026, Washington MSA; FRED)"])).toEqual([FRED_NOTICE]);
    expect(
      documentNotices([
        "Unemployment 3.4% (Jul 2026, Washington MSA; FRED)",
        "Rent paid by sitting tenants (CPI rent of primary residence) +5.0% from a year ago (Jul 2026, Washington-Arlington-Alexandria; the BLS)",
      ]),
    ).toEqual([FRED_NOTICE, BLS_NOTICE]);
    // A BLS series FRED carries is FRED's to notice, however its label reads.
    expect(documentNotices(["Rents charged by lessors, national (BLS producer price index): +2.1% from a year ago (Aug 2026; BLS via FRED)"])).toEqual([FRED_NOTICE]);
    // A read's publishers.
    expect(documentNotices(["Zillow Research", "BLS", "FRED"])).toEqual([FRED_NOTICE, BLS_NOTICE]);
    expect(documentNotices(["BLS via FRED"])).toEqual([FRED_NOTICE]);
    expect(documentNotices(["Zillow Research", "Census Bureau"])).toEqual([]);
    expect(documentNotices([])).toEqual([]);
  });
});
