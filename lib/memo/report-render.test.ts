// Render smoke test for the FULL multi-page report, mirroring the memo's:
// react-pdf failures (bad style shape, unsupported prop, a chip that breaks
// layout) only surface at render time. This renders the sample deal through
// the same path as /api/deals/[id]/report — buildReportData with buy-box
// checks AND the sensitivity grids — so a redesign that breaks any page
// fails in CI, not at a user's download click.
import { afterEach, describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildReportData, rangeRead, ReportDocument } from "./report-document";
import { assumableView, readAssumable } from "@/lib/assumable-debt";
import { leaseholdExitView, readLeaseholdExit } from "@/lib/leasehold-exit";
import { pdfFillCountOf, pdfTextOf } from "./pdf-text-of";
import { TINY_PNG_DATA_URI, tinyPng } from "./test-png";
import { floodKey, floodZoneLine, type FloodMapView } from "@/lib/site-flags/core";

const tinyDataUri = (rgb: [number, number, number]) => `data:image/png;base64,${tinyPng(rgb).toString("base64")}`;
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { evaluateBuyBox } from "@/lib/criteria";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildSensitivityData } from "@/lib/underwrite/report-grid";
import { buildPlanReport } from "@/lib/plan-sensitivity";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult } from "@/lib/anthropic/types";

describe("ReportDocument (full report)", () => {
  it("renders the sample deal to a multi-page PDF with every section", async () => {
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: SAMPLE_DEAL.comps,
      market: SAMPLE_DEAL.market,
      reconciliation: SAMPLE_DEAL.reconciliation,
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

    // Same derivation chain as the report route: extraction → model inputs →
    // both heat grids, graded against the buy box's IRR hurdle.
    const derived = deriveUnderwriteInputs(
      SAMPLE_DEAL.extraction as ExtractionResult,
      SAMPLE_DEAL.name,
    );
    const sensitivity = buildSensitivityData(
      derived.inputs,
      SAMPLE_DEMO_BOX.minIrrPct ?? null,
    );
    expect(sensitivity).not.toBeNull();

    const input = buildReportData(deal, "August 24, 2026", checks, sensitivity);
    const element = React.createElement(ReportDocument, {
      input,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buf = await renderToBuffer(element);

    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(10000);
    // The sample deal populates every section: memo + sensitivity + terms +
    // challenges + comps + market + reconciliation = at least 7 pages (long
    // tables may wrap onto more; a hard upper bound guards runaway layout).
    const pages = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(7);
    expect(pages.length).toBeLessThanOrEqual(14);

    // The market page draws each OM figure on its typical range — a track,
    // the span to the figure and a dot, three fills a check — so the same
    // report with ranges that do not parse draws nine fewer shapes.
    const checksCount = SAMPLE_DEAL.market.checks.length;
    expect(checksCount).toBe(3);
    const unranged = {
      ...deal,
      market: {
        ...SAMPLE_DEAL.market,
        checks: SAMPLE_DEAL.market.checks.map((c) => ({ ...c, typicalRange: "varies by submarket" })),
      },
    } as unknown as DealRow;
    const plain = await renderToBuffer(
      React.createElement(ReportDocument, {
        input: buildReportData(unranged, "August 24, 2026", checks, sensitivity),
      }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    expect(pdfFillCountOf(buf) - pdfFillCountOf(plain)).toBe(checksCount * 3);

    // A check that read the metro's published figures prints them under the
    // checks, dated and named as the metro's — the report carries the
    // check's evidence as the deal page does. The sample read none.
    const withBrief = {
      ...deal,
      market: {
        ...SAMPLE_DEAL.market,
        liveBrief: {
          metro: "Philadelphia, PA",
          readOn: "2026-09-23",
          lines: [
            "Unemployment 4.1% (Jul 2026, Philadelphia MSA; FRED), +0.1 pt on the month before",
            "Debt market — 10-year Treasury 4.94% (Sep 17, 2026; FRED), -3 bps on the day before",
          ],
          figures: [],
        },
      },
    } as unknown as DealRow;
    const briefed = await renderToBuffer(
      React.createElement(ReportDocument, {
        input: buildReportData(withBrief, "August 24, 2026", checks, sensitivity),
      }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const briefedText = await pdfTextOf(briefed);
    expect(briefedText).toContain("Figures the check read beside the rules of thumb");
    expect(briefedText).toContain("Philadelphia, PA market's, as published, read on 2026-09-23");
    expect(briefedText).toContain("Unemployment 4.1% (Jul 2026, Philadelphia MSA; FRED)");
    expect(briefedText).toContain("10-year Treasury 4.94%");
    expect(await pdfTextOf(buf)).not.toContain("Figures the check read");

    // The model's assumptions against the published figures land under the
    // sensitivity grids when the route read them; the plain report has no
    // such block rather than an empty one.
    const assumed = await renderToBuffer(
      React.createElement(ReportDocument, {
        input: buildReportData(deal, "August 24, 2026", checks, sensitivity, undefined, null, null, undefined, {
          readOn: "2026-09-21",
          metro: "Philadelphia",
          checks: [
            {
              key: "rent_growth",
              title: "Rent growth",
              model: "3.0%/yr",
              modelSource: "a screening default",
              published: [{ label: "Asking rent, all home types", text: "+2.3% over the year to Aug 2026", value: 2.3, asOf: "2026-08-31", publisher: "Zillow Research" }],
              tone: "ahead",
              toneLabel: "ahead of the published figures",
              scope: "metro",
              read: "The model grows rents 3.0%/yr. Over the past year the metro's asking rents moved +2.3% over the year to Aug 2026 (Zillow). The model runs ahead of every published figure, by 0.7 points. A trailing year is what the assumption is being asked to beat, not a forecast.",
            },
            {
              key: "exit_cap",
              title: "Exit cap",
              model: "6.00%",
              modelSource: "derived from the documents",
              published: [{ label: "10-year Treasury", text: "4.94% on Sep 17, 2026", value: 4.94, asOf: "2026-09-17", publisher: "FRED" }],
              tone: "widens",
              toneLabel: "spread widens at the exit",
              scope: "national",
              read: "The exit cap 6.00% is 106 bps over today's 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap 5.45% is 51 bps over it, so the exit assumes the spread widens 55 bps with the 10-year where it is today - the conservative direction.",
            },
          ],
        }),
      }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    // The PDF's text comes back a line at a time, so a sentence is read
    // with its line breaks folded — the wrap is the page's, not the words'.
    const assumedText = (await pdfTextOf(assumed)).replace(/\s+/g, " ");
    expect(assumedText).toContain("Assumptions against the published figures");
    expect(assumedText).toContain("Philadelphia market and the national series have actually done, read on 2026-09-21");
    expect(assumedText).toContain("Rent growth 3.0%/yr (a screening default)");
    expect(assumedText).toContain("ahead of the published figures");
    expect(assumedText).toContain("Exit cap 6.00% (derived from the documents)");
    expect(assumedText).toContain("spread widens 55 bps with the 10-year where it is today");
    expect(await pdfTextOf(buf)).not.toContain("Assumptions against the published figures");

    // The comp page draws each sale comp's stated basis on one track with
    // the subject's tick — a track, the fill and the tick, three fills a
    // comp — so the same report with comps that state no basis draws nine
    // fewer shapes. The lease comp ("$2,520/mo") states none either way.
    const saleCount = SAMPLE_DEAL.comps.saleComps.length;
    expect(saleCount).toBe(3);
    const noBasis = {
      ...deal,
      comps: {
        ...SAMPLE_DEAL.comps,
        saleComps: SAMPLE_DEAL.comps.saleComps.map((c) => ({ ...c, detail: "traded, terms withheld" })),
      },
    } as unknown as DealRow;
    const bare = await renderToBuffer(
      React.createElement(ReportDocument, {
        input: buildReportData(noBasis, "August 24, 2026", checks, sensitivity),
      }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    expect(pdfFillCountOf(buf) - pdfFillCountOf(bare)).toBe(saleCount * 3);

    // The reconciliation page draws each stated gap from a centre line — a
    // track, the fill and the centre tick, three fills a drawn row. Two of
    // the sample's three rows state a figure ("$174k below", "300 bps
    // higher"); "In agreement" draws none — so a report whose rows all
    // agree draws six fewer shapes.
    const drawnGaps = SAMPLE_DEAL.reconciliation.rows.filter((r) => r.direction !== "neutral").length;
    expect(drawnGaps).toBe(2);
    const agreed = {
      ...deal,
      reconciliation: {
        ...SAMPLE_DEAL.reconciliation,
        rows: SAMPLE_DEAL.reconciliation.rows.map((r) => ({ ...r, gap: "In agreement" })),
      },
    } as unknown as DealRow;
    const flat = await renderToBuffer(
      React.createElement(ReportDocument, {
        input: buildReportData(agreed, "August 24, 2026", checks, sensitivity),
      }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    expect(pdfFillCountOf(buf) - pdfFillCountOf(flat)).toBe(drawnGaps * 3);
  }, 120000);

  afterEach(() => {
    vi.useRealTimers();
  });

  it("on a note, prints what the note itself earns under the model's caveat (#416)", async () => {
    // The day the yield is read on: thirty months before the stated maturity.
    vi.useFakeTimers({ now: new Date(Date.UTC(2025, 8, 30)), toFake: ["Date"] });
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3", basis: "na" as const });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      interest: { kind: "note" as const, summary: "", share: "", groundLease: "", loan: "", page: "" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        // The sample's $68.0M ask for an $80.0M balance: 85 cents.
        row("Unpaid principal balance", "$80,000,000"),
        row("Note rate", "5.25%"),
        row("Maturity date", "March 31, 2028"),
        row("Amortization", "Interest-only"),
        row("Payment status", "Performing"),
      ],
    } as ExtractionResult;
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const derived = deriveUnderwriteInputs(extraction, SAMPLE_DEAL.name);
    const sensitivity = buildSensitivityData(derived.inputs, null);
    expect(sensitivity).not.toBeNull();
    const input = buildReportData(deal, "September 30, 2025", [], sensitivity);
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("not the note's return");
    expect(text).toMatch(/The note, on its own terms: Held to its Mar 2028 maturity it yields \d+\.\d% on the price \(interest-only as stated\)/);
    // The memo page under the title says it in a clause.
    expect(text).toMatch(/balance, \d+\.\d% to its Mar 2028 maturity/);
  }, 45000);

  it("prints the seller's loan offered for assumption beside the model it was priced against (#419)", async () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 25)), toFake: ["Date"] });
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 12", basis: "na" as const });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        row("Assumable loan balance", "$30,000,000"),
        row("Assumable loan rate", "3.45%"),
        row("Assumable loan maturity", "March 31, 2031"),
        row("Assumable loan amortization", "Interest-only"),
      ],
    } as ExtractionResult;
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    // The route's own chain: the model, then the loan read against it.
    const derived = deriveUnderwriteInputs(extraction, SAMPLE_DEAL.name);
    const sensitivity = buildSensitivityData(derived.inputs, null);
    const a = readAssumable(extraction, derived.inputs)!;
    const view = assumableView(a, derived.sources.allInRatePct?.note ?? null, !!derived.meta.rateSeed);
    const input = buildReportData(deal, "September 25, 2026", [], sensitivity, undefined, undefined, undefined, undefined, null, view);
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("The seller's loan, offered for assumption");
    expect(text).toContain("$30.0M at 3.45% to Mar 2031, interest-only as stated");
    expect(text).toContain("The loan's 3.45% against 6.00% for a new one — 255 bps under.");
    // No assumption fee stated, so none charged — and at no fee the loan is
    // worth a sliver of price where the deal page's 1%-fee case was not.
    expect(text).toContain("Assuming it is worth $93k of price (0.1% of the ask) on the model's own figures");
    expect(text).toContain("The memorandum states no assumption fee, so none is charged here");
    // A placeholder rate is said as one — this model was not seeded.
    expect(text).toContain("the rates table was not fresh enough to seed it");
    // The memo on page one carries the line too.
    expect(text).toContain("The seller's loan is offered for assumption: $30.0M at 3.45% to Mar 2031");
  }, 45000);

  it("prints a leasehold's exit on the term its lease has left at the sale, with the term and the two exits drawn (#422)", async () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 25)), toFake: ["Date"] });
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 12", basis: "na" as const });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      totalPages: 40,
      interest: { kind: "leasehold", summary: "The leasehold interest in the building", share: "", groundLease: "Ground lease through December 31, 2071; unsubordinated.", loan: "", page: "p. 12" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        row("Ground lease expiration", "December 31, 2071"),
        row("Ground lease extension options", "Four 10-year options"),
      ],
    } as ExtractionResult;
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    // The route's own chain: the model, then the lease read against it.
    const derived = deriveUnderwriteInputs(extraction, SAMPLE_DEAL.name);
    const sensitivity = buildSensitivityData(derived.inputs, null);
    const view = leaseholdExitView(readLeaseholdExit(extraction, derived.inputs)!);
    const render = async (leasehold: typeof view | null) =>
      renderToBuffer(
        React.createElement(ReportDocument, {
          input: buildReportData(deal, "September 25, 2026", [], sensitivity, undefined, undefined, undefined, undefined, null, null, leasehold),
        }) as unknown as Parameters<typeof renderToBuffer>[0],
      );
    const buf = await render(view);
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("The exit, on the ground lease's term");
    expect(text).toContain("The ground lease ends Dec 2071, 45.3 years from today, with extension options after it as stated: four of 10 years, 40 years in all.");
    expect(text).toContain("Dark: the model's 5-year hold; light: the 40.3 years left at the sale, to Dec 2071; dashed: 40 years of extension options, if exercised.");
    expect(text).toContain("Capitalised, as the model runs it $82.5M");
    expect(text).toContain("On the 40.3 years left at the sale $72.2M");
    expect(text).toContain(
      "With 40.3 years left at the model's sale in year 5, the term bears 87% of the capitalised exit — $72.2M against $82.5M — which is the model's 5.45% exit cap read as 6.23% on a building that reverts.",
    );
    expect(text).toContain("It will have 40.3 years.");
    // The two pictures are filled shapes the report without the block does
    // not draw: the term's segments and the two exits.
    const without = await render(null);
    expect((await pdfFillCountOf(buf)) - (await pdfFillCountOf(without))).toBeGreaterThanOrEqual(6);
    expect(await pdfTextOf(without)).not.toContain("The exit, on the ground lease's term");
  }, 45000);

  it("gives a portfolio memorandum a page of its own: each property, its bars and what the memorandum states", async () => {
    const prop = (name: string, address: string, count: string, noi: string, occupancy: string, allocatedPrice: string, page: string) => ({
      name, address, count, area: "", noi, occupancy, yearBuilt: "", allocatedPrice, page,
    });
    const properties = [
      prop("Liberty Lofts", "1200 Liberty Ave, Pittsburgh, PA 15222", "128", "$1,420,000", "95%", "$28,000,000", "p. 14"),
      prop("Ohio City Commons", "1850 W 25th St, Cleveland, OH 44113", "210", "$2,050,000", "94%", "$38,000,000", "p. 22"),
      prop("Marion Gardens", "400 Barks Rd, Marion, OH 43302", "60", "$310,000", "82%", "$4,000,000", "p. 30"),
    ];
    const extraction: ExtractionResult = {
      dealName: "Rust Belt Residential Portfolio",
      assetClass: "multifamily",
      market: "Pittsburgh, PA",
      address: "1200 Liberty Ave, Pittsburgh, PA 15222",
      metrics: [
        { label: "Asking price", value: "$75,000,000", flagged: false, page: "p. 3" },
        { label: "Units", value: "398", flagged: false, page: "p. 3" },
        { label: "Net operating income", value: "$3,780,000", flagged: false, page: "p. 9" },
      ],
      properties,
      totalPages: 28,
    };
    const dealOf = (ex: ExtractionResult) =>
      ({
        name: ex.dealName,
        asset_class: "multifamily",
        extraction: ex,
        challenges: null,
        comps: null,
        market: null,
        reconciliation: null,
        verdict: SAMPLE_DEAL.verdict,
        prior_screen: null,
      }) as unknown as DealRow;
    const render = (ex: ExtractionResult) =>
      renderToBuffer(
        React.createElement(ReportDocument, {
          input: buildReportData(dealOf(ex), "September 24, 2026", []),
        }) as unknown as Parameters<typeof renderToBuffer>[0],
      );
    const pagesOf = (buf: Buffer) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

    const buf = await render(extraction);
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("The portfolio");
    expect(text).toContain("3 properties · 3 markets");
    expect(text).toContain("Pittsburgh PA · 1");
    expect(text).toContain("Ohio · 1");
    expect(text).toContain("Ohio City Commons carries 54% of the stated NOI — the portfolio's income rides on one property.");
    expect(text).toContain("The allocated prices sum to $70.0M against the $75.0M ask (-6.7%) — the memorandum does not add up.");
    expect(text).toContain("Marion Gardens");
    expect(text).toContain("Marion, OH");
    expect(text).toContain("60 units · 82% occupied · NOI $310k · allocated $4.0M ($67k per unit), a 7.8% cap on the allocation");
    // A page prints only inside the memorandum's 28: Marion Gardens' p. 30
    // is past it, so it cites none.
    expect(text).toContain("p. 22");
    expect(text).not.toContain("p. 30");

    // One page more than the same deal offering one property.
    const single = await render({ ...extraction, properties: [properties[0]] });
    expect(await pdfTextOf(single)).not.toContain("The portfolio");
    expect(pagesOf(buf)).toBe(pagesOf(single) + 1);

    // The bars: a track and its fill for the share of the units, and again
    // for the share of the NOI — four fills a property — so the same page
    // with one property's count missing (no share of anything can be drawn)
    // draws twelve fewer shapes.
    const unbarred = await render({ ...extraction, properties: properties.map((x, i) => (i === 2 ? { ...x, count: "" } : x)) });
    expect(pdfFillCountOf(buf) - pdfFillCountOf(unbarred)).toBe(properties.length * 4);
    expect((await pdfTextOf(unbarred)).replace(/\s+/g, " ")).toContain("No bars: the properties do not all state a count, nor all an area");
  }, 60000);

  it("prints each market's figures the check read under a heading saying whose they are — a state's as the state's, a portfolio's other markets with their properties", async () => {
    const market = {
      checks: [{ assumption: "Rent growth", omSays: "4.0%", typicalRange: "2.5%–3.5%", assessment: "aggressive", note: "Above the index.", page: "" }],
      summary: "One aggressive assumption.",
      liveBrief: {
        metro: "Pennsylvania",
        grain: "state" as const,
        readOn: "2026-09-23",
        lines: ["Unemployment 3.7% (Aug 2026, Pennsylvania; FRED)", "Debt market — 10-year Treasury 4.94% (Sep 17, 2026; FRED)"],
        national: 1,
        portfolio: { here: 1, of: 3 },
      },
      otherBriefs: [
        { metro: "Cleveland OH", grain: "metro" as const, readOn: "2026-09-23", lines: ["Unemployment 4.4% (Jul 2026, Cleveland MSA; FRED)"], portfolio: { here: 2, of: 3 } },
      ],
    };
    const deal = {
      name: "Two-State Portfolio",
      asset_class: "multifamily",
      extraction: { dealName: "Two-State Portfolio", assetClass: "multifamily", metrics: [{ label: "Asking price", value: "$40,000,000", flagged: false, page: "p. 3" }] },
      challenges: null,
      comps: null,
      market,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input: buildReportData(deal, "September 24, 2026", []) }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain(
      "Figures the check read beside the rules of thumb: the state of Pennsylvania's, as published, read on 2026-09-23 - the address lies outside the metros the site tracks. The first is the state's, not any metro's, the submarket's or the building's. The last is the nation's, and says so.",
    );
    expect(text).not.toContain("the Pennsylvania market's");
    expect(text).toContain("They speak for the portfolio's 1 property in Pennsylvania of its 3, never for the portfolio.");
    expect(text).toContain("• Unemployment 3.7% (Aug 2026, Pennsylvania; FRED)");
    expect(text).toContain(
      "And the Cleveland OH market's own, where 2 of the portfolio's 3 properties sit, read on 2026-09-23. Each is the metro's - not those properties' own, and never the portfolio's.",
    );
    expect(text).toContain("• Unemployment 4.4% (Jul 2026, Cleveland MSA; FRED)");
  }, 60000);

  it("reads the OM's figure onto its typical range", () => {
    // The sample's three checks: at the low end, past the high end, inside.
    expect(rangeRead("5.25%", "5.25–5.75%")).toBe(0);
    expect(rangeRead("4.0%", "2.5–3.5%")).toBe(1);
    expect(rangeRead("6.0%", "5–7%")).toBeCloseTo(0.5, 6);
    // Dollar ranges, a spelled "to", and a range that is not one.
    expect(rangeRead("$1,300", "$1,200–$1,400")).toBeCloseTo(0.5, 6);
    expect(rangeRead("55%", "50 to 60%")).toBeCloseTo(0.5, 6);
    expect(rangeRead("5%", "varies")).toBeNull();
    expect(rangeRead("n/a", "5–7%")).toBeNull();
    // The shapes the market prompt names (#268): the unit after the low
    // figure too, a hyphen for the dash, spaces around it, a per-month
    // dollar range.
    expect(rangeRead("5.45%", "5.25%–5.75%")).toBeCloseTo(0.4, 6);
    expect(rangeRead("5.45%", "5.25%-5.75%")).toBeCloseTo(0.4, 6);
    expect(rangeRead("$2,400/mo", "$2,150–$2,450/mo")).toBeCloseTo(0.8333, 3);
    expect(rangeRead("$2,400/mo", "$2,150 – $2,450 per month")).toBeCloseTo(0.8333, 3);
    expect(rangeRead("4.0%/yr", "2.5%–3.5%")).toBe(1);
  });
  it("renders a conversion with the plan page — yield on cost, stressed — and one more page than without it", async () => {
    const extraction: ExtractionResult = {
      dealName: "1200 K Street — Office-to-Residential Conversion",
      assetClass: "multifamily",
      market: "Washington, DC",
      address: "1200 K St NW, Washington, DC",
      strategy: {
        kind: "conversion",
        summary: "Convert a vacant 300,000 SF office building into 320 apartments.",
        capitalBudget: "$160M hard and soft costs",
        timeline: "24 months of construction, 12 months of lease-up",
      },
      metrics: [
        { label: "Purchase price", value: "$20,000,000", flagged: false, page: "p. 3" },
        { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: false, page: "p. 12" },
        { label: "Total project cost", value: "$180,000,000", flagged: false, page: "p. 14" },
        { label: "Rentable square feet", value: "300,000", flagged: false, page: "p. 4" },
      ],
    };
    const deal = {
      name: extraction.dealName,
      asset_class: "multifamily",
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;

    const derived = deriveUnderwriteInputs(extraction, extraction.dealName!);
    const refCap = {
      pct: derived.inputs.exitCapPct,
      provenance: derived.sources.exitCapPct?.provenance ?? ("assumption" as const),
    };
    const plan = buildPlanReport(extraction, refCap);
    expect(plan).not.toBeNull();
    expect(plan!.label).toBe("Conversion");
    expect(plan!.grid.cells[plan!.grid.baseRow][plan!.grid.baseCol].yieldOnCost).toBeCloseTo(21 / 180, 6);
    // No going-in cap in this OM: the reference cap is the screening default.
    expect(refCap.provenance).toBe("assumption");
    expect(plan!.breakevens.overrunToRefCap).not.toBeNull();

    const sensitivity = buildSensitivityData(derived.inputs, null);
    const render = async (withPlan: boolean) => {
      const input = buildReportData(deal, "September 8, 2026", [], sensitivity, undefined, withPlan ? plan : null);
      const element = React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0];
      const buf = await renderToBuffer(element);
      expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
      return (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    };
    const [withPlan, without] = await Promise.all([render(true), render(false)]);
    // memo + plan + extracted terms, versus the same minus the plan. The IRR
    // sensitivity page is omitted on a plan deal (the annual model's IRR is
    // not the plan's return — the plan page carries its own grid), so the
    // sensitivity passed in never adds a page here.
    expect(withPlan).toBeGreaterThanOrEqual(3);
    expect(withPlan).toBe(without + 1);
  }, 45000);

  it("gives the site a page of its own: FEMA's flood map as one picture, the ring on the building, FEMA's key with the building's zone marked, and the zone's sentence (#427)", async () => {
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const flag = { zone: "AE", subtype: null, isHighRisk: true };
    const legend = [
      { label: "1% Annual Chance Flood Hazard", image: TINY_PNG_DATA_URI, values: ["A,<Null>", "AE,<Null>"] },
      { label: "Regulatory Floodway", image: tinyDataUri([200, 40, 40]), values: ["AE,FLOODWAY"] },
      { label: "0.2% Annual Chance Flood Hazard", image: tinyDataUri([240, 150, 40]), values: ["X,0.2 PCT ANNUAL CHANCE FLOOD HAZARD"] },
    ];
    const line = floodZoneLine(flag, legend)!;
    const view: FloodMapView = { image: tinyDataUri([90, 120, 80]), key: floodKey(legend, flag), line };
    const render = (floodMap: FloodMapView | null) =>
      renderToBuffer(
        React.createElement(ReportDocument, {
          input: buildReportData(deal, "September 25, 2026", [], null, undefined, undefined, undefined, undefined, null, null, null, floodMap),
        }) as unknown as Parameters<typeof renderToBuffer>[0],
      );
    const pagesOf = (buf: Buffer) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const imagesOf = (buf: Buffer) => (buf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;

    const buf = await render(view);
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("The site");
    expect(text).toContain("FEMA flood map");
    expect(text).toContain("FEMA National Flood Hazard Layer over USGS The National Map; the ring marks the building.");
    expect(text).toContain("1% Annual Chance Flood Hazard - at the building");
    expect(text).toContain("Regulatory Floodway");
    expect(text).toContain("0.2% Annual Chance Flood Hazard");
    expect(text).toContain(
      "The building sits in Zone AE (1% annual chance flood hazard), a Special Flood Hazard Area: a federally backed loan requires flood insurance, and the premium belongs in the expense line.",
    );

    // One page more than the report without it, carrying the map and the
    // three swatches as images, and the ring as a stroke of its own.
    const without = await render(null);
    expect(await pdfTextOf(without)).not.toContain("FEMA flood map");
    expect(pagesOf(buf)).toBe(pagesOf(without) + 1);
    expect(imagesOf(buf) - imagesOf(without)).toBeGreaterThanOrEqual(4);

    // FEMA answered the zone and not the picture: the words stand alone,
    // with no credit for a picture that is not there.
    const wordsOnly = (await pdfTextOf(await render({ image: null, key: [], line }))).replace(/\s+/g, " ");
    expect(wordsOnly).toContain("The site");
    expect(wordsOnly).toContain("a Special Flood Hazard Area");
    expect(wordsOnly).not.toContain("the ring marks the building");
  }, 45000);
});
