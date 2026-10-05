// Render smoke test for the redesigned IC memo: react-pdf style mistakes
// (an unsupported prop, a bad style shape) only surface at RENDER time, not
// compile time — so this test renders the real sample memo to real PDF
// bytes, exactly the way the public /api/demo/memo route does. If the memo
// design breaks, this fails in CI instead of at a user's download click.
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { MemoDocument, basePosition, buildMemoData, clampWords } from "./memo-document";
import { pdfFillCountOf, pdfPageTextsOf, pdfTextOf } from "./pdf-text-of";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { evaluateBuyBox } from "@/lib/criteria";
import type { DealRow } from "@/lib/deals";
import { TINY_PNG_DATA_URI } from "./test-png";

describe("MemoDocument (redesigned)", () => {
  it("renders the sample memo to a one-page PDF", async () => {
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;

    const checks = evaluateBuyBox(
      SAMPLE_DEAL.asset_class,
      {
        assetClass: SAMPLE_DEAL.extraction.assetClass,
        market: SAMPLE_DEAL.extraction.market,
        metrics: SAMPLE_DEAL.extraction.metrics,
      },
      SAMPLE_DEMO_BOX,
    );

    const data = buildMemoData(deal, "August 24, 2026", checks);
    // The screen block and the buy-box chips must actually be in the data —
    // otherwise the smoke test silently renders a thinner memo than users get.
    expect(data.verdictWord).toBeTruthy();
    expect(data.buyBox.length).toBeGreaterThan(0);

    const element = React.createElement(MemoDocument, {
      data,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buf = await renderToBuffer(element);

    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(4000);
    // One page: the memo's whole contract. react-pdf writes one /Type /Page
    // object per page.
    const pages = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBe(1);
    // No cover was given, so the PDF embeds no image at all.
    expect(buf.toString("latin1")).not.toMatch(/\/Subtype\s*\/Image/);
  }, 30000);

  it("says what is being sold under the title on a note, and nothing on the sample's fee simple (#414)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Unpaid principal balance", value: "$60,000,000", flagged: false, page: "p. 3", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 24, 2026", []);
    expect(data.interestLine).toMatch(/^A loan secured by the property, not the property — the \$[\d.]+M price is a [\d.]+% (discount to|premium over) the \$60\.0M balance$/);
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("A loan secured by the property, not the property");
    // The sample itself is a fee simple: its memo carries no such line.
    const plain = buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 24, 2026", []);
    expect(plain.interestLine).toBe("");
  }, 30000);

  it("prints the day the verdict was written, so a memo printed later never passes an old call off as the day's", async () => {
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: { ...SAMPLE_DEAL.verdict, generatedAt: "2026-09-12T14:03:00.000Z" },
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.screened).toBe("Screened Sep 12, 2026");
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("September 30, 2026");
    expect(text).toContain("Screened Sep 12, 2026");
    // A verdict saved before the pipeline stamped one prints no screen date.
    expect(buildMemoData({ ...deal, verdict: SAMPLE_DEAL.verdict } as unknown as DealRow, "September 30, 2026", []).screened).toBe("");
  }, 30000);

  it("prints FEMA's flood zone under the title in a Special Flood Hazard Area, and nothing for minimal hazard or a pending lookup (#426)", async () => {
    const base = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    };
    const flags = (flood: unknown, status = "ok") => ({ status, tractGeoid: null, opportunityZone: null, flood, retrievedAt: "2026-09-25T00:00:00Z", note: "" });
    const data = buildMemoData(
      { ...base, site_flags: flags({ zone: "AE", subtype: null, isHighRisk: true }) } as unknown as DealRow,
      "September 25, 2026",
      [],
    );
    expect(data.floodLine).toBe("Flood zone AE: a Special Flood Hazard Area, where flood insurance is required on federally backed debt (FEMA)");
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    expect((await pdfTextOf(buf)).replace(/\s+/g, " ")).toContain("Flood zone AE: a Special Flood Hazard Area");
    const minimal = buildMemoData(
      { ...base, site_flags: flags({ zone: "X", subtype: "AREA OF MINIMAL FLOOD HAZARD", isHighRisk: false }) } as unknown as DealRow,
      "September 25, 2026",
      [],
    );
    expect(minimal.floodLine).toBe("");
    const pending = buildMemoData(
      { ...base, site_flags: flags({ zone: "AE", subtype: null, isHighRisk: true }, "pending") } as unknown as DealRow,
      "September 25, 2026",
      [],
    );
    expect(pending.floodLine).toBe("");
    expect(buildMemoData(base as unknown as DealRow, "September 25, 2026", []).floodLine).toBe("");
  }, 30000);

  it("prints no flood zone looked up for an address the deal has since changed from — the deal page's rule (the audit of 2026-09-30)", () => {
    const base = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    };
    const ELM = "100 Elm St, Dallas, TX 75201";
    const lookedUpFor = (label: string) => ({
      status: "ok",
      subject: { lat: 32.8, lng: -96.8, label },
      tractGeoid: null,
      opportunityZone: null,
      flood: { zone: "AE", subtype: null, isHighRisk: true },
      retrievedAt: "2026-09-25T00:00:00Z",
      note: "",
    });
    const address = (label: string) => ({ label, street: label.split(",")[0], city: "Dallas", state: "TX", zip: "75201", county: "", submarket: "" });
    const current = buildMemoData(
      { ...base, address: address(ELM), site_flags: lookedUpFor(ELM) } as unknown as DealRow,
      "September 30, 2026",
      [],
    );
    expect(current.floodLine).toMatch(/^Flood zone AE: a Special Flood Hazard Area/);
    // The address was edited since: the lookup is the old building's.
    const moved = buildMemoData(
      { ...base, address: address("200 Main St, Dallas, TX 75201"), site_flags: lookedUpFor(ELM) } as unknown as DealRow,
      "September 30, 2026",
      [],
    );
    expect(moved.floodLine).toBe("");
  });

  it("says the seller's loan under the title where it is offered for assumption (#419)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Assumable loan balance", value: "$30,000,000", flagged: false, page: "p. 3", basis: "na" },
        { label: "Assumable loan rate", value: "3.45%", flagged: false, page: "p. 3", basis: "na" },
        { label: "Assumable loan maturity", value: "March 31, 2031", flagged: false, page: "p. 3", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 25, 2026", []);
    expect(data.assumableLine).toBe("The seller's loan is offered for assumption: $30.0M at 3.45% to Mar 2031");
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("The seller's loan is offered for assumption: $30.0M at 3.45% to Mar 2031");
    // Still one page.
    expect((buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
    // The sample itself offers none.
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 25, 2026", []).assumableLine).toBe("");
  }, 30000);

  it("says a covenant on the rents under the title (#453), and nothing on the market-rate sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      affordable: { programs: ["lihtc", "section8"], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Restricted units", value: "186", flagged: false, page: "p. 3", basis: "na" },
        { label: "Units under HAP contract", value: "82", flagged: false, page: "p. 3", basis: "na" },
        { label: "Affordability expiration", value: "December 31, 2054", flagged: false, page: "p. 3", basis: "na" },
        { label: "HAP contract expiration", value: "June 30, 2029", flagged: false, page: "p. 3", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.affordableLine).toBe(
      "Affordable housing: 186 of 248 units (75%) rent-restricted under LIHTC until Dec 2054; 82 under a Section 8 HAP contract to Jun 2029",
    );
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("186 of 248 units (75%) rent-restricted under LIHTC until Dec 2054");
    // Still one page.
    expect((buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).affordableLine).toBe("");
  }, 30000);

  it("says a single tenant's lease under the title (#454), and nothing on the multi-tenant sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      singleTenant: { tenant: "Walgreens Co.", guarantor: "Walgreens Boots Alliance, Inc.", leaseType: "Absolute NNN", landlordObligations: "", tenantRights: "", page: "" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Lease expiration", value: "December 31, 2046", flagged: false, page: "p. 4", basis: "na" },
        { label: "Renewal options", value: "Four 5-year options", flagged: false, page: "p. 4", basis: "na" },
        { label: "Rent increases", value: "10% every 5 years", flagged: false, page: "p. 4", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.singleTenantLine).toMatch(
      /^Single tenant: Walgreens Co\., guaranteed by Walgreens Boots Alliance, Inc\., Absolute NNN; the lease ends Dec 2046, [\d.]+ years from today, then renewal options \(four of 5 years\); the rent rises 10% every 5 years$/,
    );
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Single tenant: Walgreens Co., guaranteed by Walgreens Boots Alliance, Inc., Absolute NNN; the lease ends Dec 2046");
    // Still one page.
    expect((buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).singleTenantLine).toBe("");
  }, 30000);

  it("says what a hotel is sold with under the title (#455), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      hotel: { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "management", pip: "", page: "" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "PIP cost", value: "$4,200,000", flagged: false, page: "p. 6", basis: "na" },
        { label: "Franchise expiration", value: "June 30, 2034", flagged: false, page: "p. 6", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.hotelLine).toMatch(/^Hotel: flagged Courtyard by Marriott, sold encumbered by management; PIP \$4\.2M \(\$[\d.]+k a unit\); the franchise ends Jun 2034$/);
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Hotel: flagged Courtyard by Marriott, sold encumbered by management; PIP $4.2M");
    expect((buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).hotelLine).toBe("");
  }, 30000);

  it("says a multi-tenant property's listed tenants under the title (#457), and nothing on the sample", async () => {
    const t = (name: string, over: Record<string, string>) => ({
      name, role: "inline", inSale: "yes", sf: "", rent: "", leaseExpiration: "", options: "", earlyTermination: "", rights: "", page: "", ...over,
    });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "office",
      tenants: [
        t("Acme Law", { sf: "12,000 SF", rent: "$420,000", leaseExpiration: "2124" }),
        t("Birch Health", { sf: "8,000 SF", rent: "$280,000", leaseExpiration: "2125" }),
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "office",
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.rosterLine).toBe("Two tenants listed; none of their rent expires before year 5; Acme Law pays 60% of the listed rent");
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Two tenants listed; none of their rent expires before year 5");
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).rosterLine).toBe("");
  }, 30000);

  it("says a value-add program under the title (#460), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Units to renovate", value: "192", flagged: false, page: "", basis: "na" },
        { label: "Renovation cost per unit", value: "$15,000", flagged: false, page: "", basis: "na" },
        { label: "Renovation premium", value: "$250", flagged: false, page: "", basis: "na" },
        { label: "Achieved renovation premium", value: "$235", flagged: false, page: "", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.valueAddLine).toBe("Value-add program: 192 doors to renovate; $15,000 a door; $250 a month premium (20% on cost); $235 achieved on renovated units");
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Value-add program: 192 doors to renovate");
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).valueAddLine).toBe("");
  }, 30000);

  it("says a student building's pre-leasing under the title (#468), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "student_housing",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Beds", value: "612", flagged: false, page: "", basis: "na" },
        { label: "Pre-leased", value: "87% for Fall 2026", flagged: false, page: "", basis: "na" },
        { label: "Distance to campus", value: "0.3 miles", flagged: false, page: "", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "student_housing",
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.studentLine).toMatch(/^Student housing: 87% pre-leased for Fall 2026; 612 beds at \$\d+k a bed; 0\.3 miles to campus \(pedestrian\)$/);
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Student housing: 87% pre-leased for Fall 2026");
    expect(buildMemoData({ ...deal, asset_class: SAMPLE_DEAL.asset_class, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).studentLine).toBe("");
  }, 30000);

  it("says a manufactured-housing park's lot rent and utilities under the title (#470), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "manufactured_housing",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Pads", value: "150", flagged: false, page: "", basis: "na" },
        { label: "Lot rent", value: "$430", flagged: false, page: "", basis: "in_place" },
        { label: "Market lot rent", value: "$525", flagged: true, page: "", basis: "pro_forma" },
        { label: "Water and sewer", value: "City water; septic", flagged: false, page: "", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "manufactured_housing",
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.mhLine).toMatch(/^Manufactured housing: 150 pads at \$[\d.,]+[kM] a pad; lot rent \$430 \(market \$525\); public water, private sewer$/);
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("lot rent $430 (market $525); public water, private sewer");
    expect(buildMemoData({ ...deal, asset_class: SAMPLE_DEAL.asset_class, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).mhLine).toBe("");
  }, 30000);

  it("says a self-storage facility's occupancies and rates under the title (#471), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "self_storage",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Economic occupancy", value: "84%", flagged: false, page: "", basis: "in_place" },
        { label: "Street rate", value: "$1.14/SF/month", flagged: false, page: "", basis: "in_place" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "self_storage",
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.storageLine).toMatch(/^Self-storage: .*84% economic; street \$1\.14\/SF a month$/);
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("84% economic; street $1.14/SF a month");
    expect(buildMemoData({ ...deal, asset_class: SAMPLE_DEAL.asset_class, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).storageLine).toBe("");
  }, 30000);

  it("says the rent rules that reach the building under the title, on the day it is given (lib/rent-regulation), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Year built", value: "1931", flagged: false, page: "", basis: "na" },
        { label: "Rent-regulated units", value: "180", flagged: false, page: "", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      address: { label: "100 Walk-up St, Brooklyn, NY 11215", street: "100 Walk-up St", city: "Brooklyn", state: "NY", zip: "11215", county: "Kings County", submarket: "" },
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "October 5, 2026", [], null, null, null, "2026-10-05");
    expect(data.regulationLine).toBe(
      "Rent regulation: NYC rent stabilization applies; 180 of the 248 units rent-regulated as stated (73%); 0% on a one-year lease for leases commencing Oct 1, 2026 to Sep 30, 2027",
    );
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Rent regulation: NYC rent stabilization applies; 180 of the 248 units rent-regulated as stated (73%)");
    // Past the period's end the allowance is no longer said as in force.
    expect(buildMemoData(deal, "November 15, 2027", [], null, null, null, "2027-11-15").regulationLine).toBe(
      "Rent regulation: NYC rent stabilization applies; 180 of the 248 units rent-regulated as stated (73%)",
    );
    // The sample, in Philadelphia, sits under no regime the site holds.
    expect(buildMemoData(SAMPLE_DEAL as unknown as DealRow, "October 5, 2026", [], null, null, null, "2026-10-05").regulationLine).toBe("");
  }, 30000);

  it("says what the third-party reports found under the title (#465), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Phase I ESA date", value: "June 2019", flagged: false, page: "", basis: "na" },
        { label: "Phase I ESA findings", value: "One REC: former dry cleaner", flagged: false, page: "", basis: "na" },
        { label: "Seismic PML", value: "24%", flagged: false, page: "", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.siteReportsLine).toBe(
      "Reports: Phase I Jun 2019, a recognized environmental condition (over a year old: a new report); seismic PML 24%",
    );
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Reports: Phase I Jun 2019, a recognized environmental condition");
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).siteReportsLine).toBe("");
  }, 30000);

  it("says a tax abatement under the title (#461), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Tax abatement", value: "10-year Philadelphia tax abatement", flagged: false, page: "", basis: "na" },
        { label: "Tax abatement expiration", value: "2099", flagged: false, page: "", basis: "na" },
        { label: "Abated real estate taxes", value: "$70,000", flagged: false, page: "", basis: "na" },
        { label: "Unabated real estate taxes", value: "$520,000", flagged: false, page: "", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.taxAbatementLine).toMatch(/^Tax abatement: 10-year Philadelphia tax abatement; ends 2099, [\d.]+ years from today; \$450,000 a year more once it ends/);
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Tax abatement: 10-year Philadelphia tax abatement; ends 2099");
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).taxAbatementLine).toBe("");
  }, 30000);

  it("says a seller's note under the title (#462), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Seller financing amount", value: "$40,000,000", flagged: false, page: "", basis: "na" },
        { label: "Seller financing rate", value: "5.00%", flagged: false, page: "", basis: "na" },
        { label: "Seller financing term", value: "5 years", flagged: false, page: "", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.sellerNoteLine).toBe("The seller offers to carry financing: $40.0M at 5.00% for 5 years");
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("The seller offers to carry financing: $40.0M at 5.00% for 5 years");
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).sellerNoteLine).toBe("");
    // On a note the seller's financing is of the note's purchase: the memo
    // says so, where it had printed nothing (research pass 23).
    const onNote = buildMemoData(
      { ...deal, extraction: { ...extraction, interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" } } } as unknown as DealRow,
      "September 30, 2026",
      [],
    );
    expect(onNote.sellerNoteLine).toBe(
      "The seller offers to finance the note purchase: $40.0M at 5.00% for 5 years — financing of the buyer's purchase of the loan, not of the property, and not run against the model",
    );
    const noteText = (
      await pdfTextOf(await renderToBuffer(React.createElement(MemoDocument, { data: onNote }) as unknown as Parameters<typeof renderToBuffer>[0]))
    ).replace(/\s+/g, " ");
    expect(noteText).toContain("The seller offers to finance the note purchase: $40.0M at 5.00% for 5 years");
  }, 30000);

  it("says how the property is sold under the title (#456), and nothing on the sample", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      sale: { method: "auction", terms: "", condition: "As-is", page: "" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Starting bid", value: "$2,500,000", flagged: false, page: "p. 3", basis: "na" },
        { label: "Buyer's premium", value: "5%", flagged: false, page: "p. 3", basis: "na" },
      ],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    expect(data.saleLine).toBe("Sold at auction: bidding opens at $2.5M; a 5% buyer's premium ($2.63M all-in at the opening bid)");
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Sold at auction: bidding opens at $2.5M");
    expect((buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
    expect(buildMemoData({ ...deal, extraction: SAMPLE_DEAL.extraction } as unknown as DealRow, "September 30, 2026", []).saleLine).toBe("");
  }, 30000);

  it("the cover aerial prints on page one, and the memo is still one page", async () => {
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const checks = evaluateBuyBox(
      SAMPLE_DEAL.asset_class,
      {
        assetClass: SAMPLE_DEAL.extraction.assetClass,
        market: SAMPLE_DEAL.extraction.market,
        metrics: SAMPLE_DEAL.extraction.metrics,
      },
      SAMPLE_DEMO_BOX,
    );
    // A one-pixel PNG stands in for the USGS frame — the embedding is what is
    // tested. Built, not typed: a hand-typed fixture with a bad zlib check
    // once hung this very render.
    const cover = { dataUri: TINY_PNG_DATA_URI, credit: "Imagery: USGS The National Map" };
    const data = buildMemoData(deal, "September 8, 2026", checks, null, null, cover);
    expect(data.cover).toEqual(cover);
    const element = React.createElement(MemoDocument, {
      data,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buf = await renderToBuffer(element);
    const pdf = buf.toString("latin1");
    expect((pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
    expect(pdf).toMatch(/\/Subtype\s*\/Image/);
  }, 30000);

  it("draws where the base sits in each range as a track and a dot, and the calls as dots", async () => {
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 8, 2026", []);
    expect(data.ranges.length).toBe(4);
    // The vacancy base at 9.0% between 6.0% and 9.5% hugs the high end; the
    // market rent base at $2,480 between $2,400 and $2,600 does not.
    expect(basePosition(data.ranges[1])).toBeCloseTo(0.857, 2);
    expect(basePosition(data.ranges[0])).toBeCloseTo(0.4, 2);
    expect(basePosition({ low: "n/a", base: "5%", high: "6%" })).toBeNull();
    // A base below the low end sits at the start of the track; a range with
    // no width is no scale at all.
    expect(basePosition({ low: "4%", base: "3%", high: "6%" })).toBe(0);
    expect(basePosition({ low: "6%", base: "5%", high: "6%" })).toBeNull();

    const render = (d: typeof data) =>
      renderToBuffer(
        React.createElement(MemoDocument, { data: d }) as unknown as Parameters<typeof renderToBuffer>[0],
      );
    const withBars = await render(data);
    // The same memo with ranges that do not parse as one scale: no bars.
    const withoutBars = await render({
      ...data,
      ranges: data.ranges.map((r) => ({ ...r, low: "n/a", high: "n/a" })),
    });
    // A track (with its fill) and a dot per range: three fills each.
    expect(pdfFillCountOf(withBars) - pdfFillCountOf(withoutBars)).toBe(data.ranges.length * 3);
    // The three scenario dots are drawn in both.
    expect(pdfFillCountOf(withoutBars)).toBeGreaterThanOrEqual(data.sensitivity.length);
    // Still one page, with the footer band now reserved.
    expect((withBars.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);
  }, 45000);

  it("a memo too long for one page flows to a second headed with the deal's name, and never cuts a card, a heading or the call's flips across the break", async () => {
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3", basis: "na" });
    const checks = evaluateBuyBox(
      SAMPLE_DEAL.asset_class,
      { assetClass: SAMPLE_DEAL.extraction.assetClass, market: SAMPLE_DEAL.extraction.market, metrics: SAMPLE_DEAL.extraction.metrics },
      SAMPLE_DEMO_BOX,
    );
    const base = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    };
    const render = async (
      deal: Record<string, unknown>,
      overrides: string[] | null = null,
      opts: { checks?: typeof checks; cover?: boolean } = {},
    ) =>
      pdfPageTextsOf(
        await renderToBuffer(
          React.createElement(MemoDocument, {
            data: buildMemoData(
              deal as unknown as DealRow,
              "September 30, 2026",
              opts.checks ?? checks,
              null,
              overrides,
              opts.cover ? { dataUri: TINY_PNG_DATA_URI, credit: "From the offering memorandum" } : null,
            ),
          }) as unknown as Parameters<typeof renderToBuffer>[0],
        ),
      ).map((t) => t.replace(/\s+/g, " "));
    const onePage = (pages: string[], ...parts: string[]) =>
      pages.some((p) => parts.every((part) => p.includes(part)));

    // The ordinary sample, its buy box included: one page, no continuation.
    const sample = await render(base);
    expect(sample).toHaveLength(1);
    expect(sample[0]).not.toContain("continued");

    // The sample with an analyst's override: the override's section moves
    // whole to page two, which says whose memo it is.
    const overridden = await render(base, ["Rent growth check dismissed: the renovated comps support 4% for two years (analyst)"]);
    expect(overridden).toHaveLength(2);
    expect(overridden[0]).not.toContain("screening memo, continued");
    expect(overridden[1]).toMatch(/^Sample — The Maddox at Brewerytown — screening memo, continued /);
    expect(onePage(overridden, "SUBMARKET CHECKS OVERRIDDEN", "Rent growth check dismissed")).toBe(true);

    // Lines under the title push the break down into the screen's cards:
    // two fixtures, measured so that without the guards the first cuts the
    // call's flips from their label and the second cuts each deal-killer
    // card from its "breaks if".
    const screen = SAMPLE_DEAL.verdict.screen!;
    const wideBox = evaluateBuyBox(
      SAMPLE_DEAL.asset_class,
      { assetClass: SAMPLE_DEAL.extraction.assetClass, market: SAMPLE_DEAL.extraction.market, metrics: SAMPLE_DEAL.extraction.metrics },
      { ...SAMPLE_DEMO_BOX, markets: "Philadelphia, Pittsburgh", priceMaxM: 60, maxPerUnitK: 250, sfMin: 150000 } as typeof SAMPLE_DEMO_BOX,
    );
    const crowd = (name: string, hotel: boolean) => ({
      ...base,
      name,
      verdict: {
        ...SAMPLE_DEAL.verdict,
        reason:
          "The going-in basis is rich for a receivership sale and the returns lean on an aggressive exit, a rent ramp the LIHTC limits cap, and an assumable HUD loan whose rate advantage mostly sits in the price. Worth a closer look only if the receiver moves on price or the ramp is de-risked.",
      },
      extraction: {
        ...SAMPLE_DEAL.extraction,
        affordable: { programs: ["lihtc", "section8"], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
        sale: { method: "receivership", terms: "", condition: "As-is", page: "" },
        ...(hotel ? { hotel: { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "management", pip: "", page: "" } } : {}),
        metrics: [
          ...SAMPLE_DEAL.extraction.metrics,
          row("Restricted units", "186"),
          row("Units under HAP contract", "82"),
          row("Affordability expiration", "December 31, 2054"),
          row("Assumable loan balance", "$30,000,000"),
          row("Assumable loan rate", "3.45%"),
          row("Assumable loan maturity", "March 31, 2031"),
          row("Phase I ESA date", "June 2019"),
          row("Phase I ESA findings", "One REC: former dry cleaner"),
          row("Units to renovate", "192"),
          row("Renovation cost per unit", "$15,000"),
          row("Renovation premium", "$250"),
          ...(hotel ? [row("PIP cost", "$4,200,000"), row("Franchise expiration", "June 30, 2034")] : []),
          row("Tax abatement", "PILOT agreement"),
          row("Tax abatement expiration", "2031"),
          row("Abated real estate taxes", "$70,000"),
          row("Unabated real estate taxes", "$520,000"),
        ],
      },
      site_flags: { status: "ok", tractGeoid: null, opportunityZone: null, flood: { zone: "AE", subtype: null, isHighRisk: true }, retrievedAt: "2026-09-25T00:00:00Z", note: "" },
    });
    const flipsAtBreak = await render(crowd("Riverside Gardens Apartments (Receivership Sale)", false), null, { checks: wideBox, cover: true });
    const killersAtBreak = await render(
      crowd("Riverside Gardens Apartments and Townhomes at the Brewerytown Riverfront (Receivership Sale)", true),
      null,
      { checks: wideBox, cover: true },
    );
    for (const pages of [flipsAtBreak, killersAtBreak]) {
      expect(pages.length).toBeGreaterThanOrEqual(2);
      expect(pages[0]).not.toContain("screening memo, continued");
      for (const p of pages.slice(1)) expect(p).toMatch(/^Riverside Gardens Apartments .*\(Receivership Sale\) — screening memo, continued /);
      // Each deal-killer card whole on one page: its name and its "breaks if".
      screen.dealKillers.forEach((k, i) => {
        const name = `${i + 1}. ${{ basis: "Basis", exit: "Exit", debt: "Debt" }[k.lever]}`;
        expect(onePage(pages, name, k.risk.slice(0, 30)), name).toBe(true);
      });
      // The call's flips whole on one page: the label, the three calls, the notes.
      expect(onePage(pages, "WHERE THE CALL FLIPS", "CONSERVATIVE", "SPONSOR", ...screen.sensitivity.map((sc) => sc.note.slice(0, 30)))).toBe(true);
      // The risks and the next steps travel together.
      expect(onePage(pages, "TOP RISKS", "NEXT STEPS", ...SAMPLE_DEAL.verdict.topRisks.slice(0, 2).map((r) => r.slice(0, 30)))).toBe(true);
    }
    // The guards moved what they guard to the next page, where each fixture
    // was measured to break.
    expect(flipsAtBreak[1]).toMatch(/screening memo, continued WHERE THE CALL FLIPS/);
    expect(killersAtBreak[1]).toMatch(/screening memo, continued 1\. Basis/);
  }, 60000);

  it("says a portfolio is a portfolio under the title, and the basis under the price tile, and keeps the ordinary sample on one page", async () => {
    const prop = (name: string, address: string, count: string, noi: string, occupancy: string, allocatedPrice: string, page: string) => ({
      name, address, count, area: "", noi, occupancy, yearBuilt: "", allocatedPrice, page,
    });
    const portfolio = {
      dealName: "Rust Belt Residential Portfolio",
      assetClass: "multifamily",
      market: "Pittsburgh, PA",
      address: "1200 Liberty Ave, Pittsburgh, PA 15222",
      metrics: [
        { label: "Asking price", value: "$75,000,000", flagged: false, page: "p. 3" },
        { label: "Units", value: "398", flagged: false, page: "p. 3" },
        { label: "Net operating income", value: "$3,780,000", flagged: false, page: "p. 9" },
      ],
      properties: [
        prop("Liberty Lofts", "1200 Liberty Ave, Pittsburgh, PA 15222", "128", "$1,420,000", "95%", "$28,000,000", "p. 14"),
        prop("Ohio City Commons", "1850 W 25th St, Cleveland, OH 44113", "210", "$2,050,000", "94%", "$38,000,000", "p. 22"),
        prop("Marion Gardens", "400 Barks Rd, Marion, OH 43302", "60", "$310,000", "82%", "$4,000,000", "p. 30"),
      ],
      totalPages: 28,
    };
    const base = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    };
    const data = buildMemoData({ ...base, name: portfolio.dealName, extraction: portfolio } as unknown as DealRow, "September 30, 2026", []);
    expect(data.portfolioLine).toBe(
      "A portfolio of 3 properties across 3 markets — Pittsburgh PA (1), Cleveland OH (1) and Ohio (1). Ohio City Commons carries 54% of the stated NOI — the portfolio's income rides on one property. The allocated prices sum to $70.0M against the $75.0M ask (-6.7%) — the memorandum does not add up.",
    );
    // $75M over the 398 units the memorandum counts, under the price.
    expect(data.keyTerms[0]).toEqual({ label: "Asking price", value: "$75,000,000", flagged: false, sub: "$188k/unit" });
    const text = (await pdfTextOf(await renderToBuffer(React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0]))).replace(/\s+/g, " ");
    expect(text).toContain("A portfolio of 3 properties across 3 markets — Pittsburgh PA (1), Cleveland OH (1) and Ohio (1).");
    expect(text).toContain("ASKING PRICE $75,000,000 $188k/unit");

    // The ordinary sample, its buy box included: no portfolio line, the
    // basis under its price, and still one page.
    const checks = evaluateBuyBox(
      SAMPLE_DEAL.asset_class,
      { assetClass: SAMPLE_DEAL.extraction.assetClass, market: SAMPLE_DEAL.extraction.market, metrics: SAMPLE_DEAL.extraction.metrics },
      SAMPLE_DEMO_BOX,
    );
    const sample = buildMemoData(base as unknown as DealRow, "September 30, 2026", checks);
    expect(sample.portfolioLine).toBe("");
    expect(sample.keyTerms[0].sub).toBe("$274k/unit");
    const buf = await renderToBuffer(React.createElement(MemoDocument, { data: sample }) as unknown as Parameters<typeof renderToBuffer>[0]);
    expect(pdfPageTextsOf(buf)).toHaveLength(1);
    // A note's price is a loan's: no basis under it.
    const note = buildMemoData(
      {
        ...base,
        extraction: {
          ...SAMPLE_DEAL.extraction,
          interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" },
          metrics: [...SAMPLE_DEAL.extraction.metrics, { label: "Unpaid principal balance", value: "$80,000,000", flagged: false, page: "p. 3", basis: "na" }],
        },
      } as unknown as DealRow,
      "September 30, 2026",
      [],
    );
    expect(note.keyTerms.some((t) => t.sub)).toBe(false);
  }, 45000);

  it("says the deal-killers' and the flips' IRR moves are the screen's estimates, never the model's", async () => {
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data: buildMemoData(deal, "September 30, 2026", []) }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    // The sample's exit killer: "A flat 5.5% exit knocks roughly N bps off
    // the IRR" — the verdict step's estimate, computed by no engine.
    expect(text).toMatch(/Breaks if \(screen's estimate\): A flat 5\.5% exit knocks roughly \d+ bps off the IRR\./);
    expect(text).not.toContain("Breaks if: ");
    expect(text).toContain("WHERE THE CALL FLIPS — THE SCREEN'S ESTIMATE, NOT THE MODEL'S");
  }, 30000);

  it("clamps a line to its box at a word boundary, never inside a figure or on a word that leaves the clause hanging", () => {
    const reason =
      "The going-in basis is rich for a receivership sale and the returns lean on an aggressive exit, a rent ramp the LIHTC limits cap, and an assumable HUD loan whose rate advantage mostly sits in the price. Worth a closer look only if the receiver moves on price or the ramp is de-risked.";
    // The old clamp printed "…or the ramp is de-ris…".
    const r = clampWords(reason, 280);
    expect(r.length).toBeLessThanOrEqual(280);
    expect(r).toMatch(/…$/);
    expect(r).not.toMatch(/de-ris…$/);
    expect(reason.startsWith(r.slice(0, -1).trimEnd())).toBe(true);
    expect(r).toMatch(/ or the ramp…$/);
    // "…to 9.3% from 11.1%" once lost its second figure and kept "from".
    const killer = "A 100 bps rate shock takes the levered IRR to 9.3% from 11.1% at exit.";
    expect(clampWords(killer, 60)).toBe("A 100 bps rate shock takes the levered IRR to 9.3%…");
    // A figure is never cut, nor a range's two ends apart.
    expect(clampWords("Market rents of $2,400 – $2,600 a month across the comps", 28)).toBe("Market rents…");
    expect(clampWords("Exit cap 5.25% to 5.75% on the comps", 20)).toBe("Exit cap…");
    expect(clampWords("A flat 5.5% exit knocks roughly 180 bps off the IRR.", 40)).toBe("A flat 5.5% exit knocks roughly 180 bps…");
    expect(clampWords("A flat 5.5% exit knocks roughly 180 bps off the IRR.", 38)).toBe("A flat 5.5% exit knocks roughly…");
    // A whole sentence kept is ended as one, with the ellipsis after it.
    expect(clampWords("The basis is rich. Worth a look only on price.", 24)).toBe("The basis is rich. …");
    // What fits is untouched; one word longer than the box is cut.
    expect(clampWords("Rent roll actual", 28)).toBe("Rent roll actual");
    expect(clampWords("https://example.com/a-very-long-path-with-no-spaces", 20)).toBe("https://example.com…");
  });

  it("labels a market flag's typical range as the rule of thumb it is, as the deal page and the report do", async () => {
    // A verdict without the pre-model screen keeps the comp & market flags.
    const { screen: _screen, ...verdict } = SAMPLE_DEAL.verdict as unknown as Record<string, unknown>;
    void _screen;
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: {
        checks: [{ assumption: "Rent growth", omSays: "4.0%", typicalRange: "2.5%–3.5%", assessment: "aggressive", note: "Above the index.", page: "" }],
        summary: "One aggressive assumption.",
      },
      verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const data = buildMemoData(deal, "September 30, 2026", []);
    const market = data.flags.find((f) => f.label === "Market");
    // (The memo's text is PDF-safe: the range's en dash prints as a hyphen.)
    expect(market?.text).toBe("Rent growth: OM 4.0% vs. typical 2.5%-3.5% (a rule of thumb, not a live comps feed)");
    const buf = await renderToBuffer(
      React.createElement(MemoDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("a rule of thumb, not a live comps feed");
  }, 30000);
});
