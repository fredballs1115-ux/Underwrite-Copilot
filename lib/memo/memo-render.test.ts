// Render smoke test for the redesigned IC memo: react-pdf style mistakes
// (an unsupported prop, a bad style shape) only surface at RENDER time, not
// compile time — so this test renders the real sample memo to real PDF
// bytes, exactly the way the public /api/demo/memo route does. If the memo
// design breaks, this fails in CI instead of at a user's download click.
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { MemoDocument, basePosition, buildMemoData } from "./memo-document";
import { pdfFillCountOf, pdfTextOf } from "./pdf-text-of";
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
