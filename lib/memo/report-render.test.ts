// Render smoke test for the FULL multi-page report, mirroring the memo's:
// react-pdf failures (bad style shape, unsupported prop, a chip that breaks
// layout) only surface at render time. This renders the sample deal through
// the same path as /api/deals/[id]/report — buildReportData with buy-box
// checks AND the sensitivity grids — so a redesign that breaks any page
// fails in CI, not at a user's download click.
import { readSellerFinancing, sellerFinancingView } from "@/lib/seller-financing";
import { afterEach, describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildReportData, rangeRead, readDay, ReportDocument } from "./report-document";
import { assumableView, readAssumable } from "@/lib/assumable-debt";
import { leaseholdExitView, readLeaseholdExit } from "@/lib/leasehold-exit";
import { pdfFillCountOf, pdfFillRectsOf, pdfPageTextsOf, pdfTextOf } from "./pdf-text-of";
import { readPortfolio } from "@/lib/portfolio";
import { TINY_PNG_DATA_URI, tinyPng } from "./test-png";
import { floodZoneLine, type FloodMapView } from "@/lib/site-flags/core";

const tinyDataUri = (rgb: [number, number, number]) => `data:image/png;base64,${tinyPng(rgb).toString("base64")}`;
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { evaluateBuyBox } from "@/lib/criteria";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { regulationForDeal } from "@/lib/rent-regulation";
import { buildSensitivityData, gridTakeaway, pageBaseLevers } from "@/lib/underwrite/report-grid";
import { bidFloors, fmtBid, solveMaxBid } from "@/lib/underwrite/solver";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { buildPlanReport } from "@/lib/plan-sensitivity";
import { challengerInstruction } from "@/lib/anthropic/prompts";
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
    expect(briefedText).toContain("Philadelphia, PA market's, as published, read on Sep 23, 2026");
    expect(briefedText).toContain("Unemployment 4.1% (Jul 2026, Philadelphia MSA; FRED)");
    expect(briefedText).toContain("10-year Treasury 4.94%");
    expect(await pdfTextOf(buf)).not.toContain("Figures the check read");

    // A covered market whose figures could not be read that day says so
    // under the checks (lib/market-read-failed, research pass 30).
    const readFailed = {
      ...deal,
      market: { ...SAMPLE_DEAL.market, liveReadFailed: { market: "Philadelphia PA", grain: "metro" } },
    } as unknown as DealRow;
    const failedText = (
      await pdfTextOf(
        await renderToBuffer(
          React.createElement(ReportDocument, {
            input: buildReportData(readFailed, "August 24, 2026", checks, sensitivity),
          }) as unknown as Parameters<typeof renderToBuffer>[0],
        ),
      )
    ).replace(/\s+/g, " ");
    expect(failedText).toMatch(
      /The published figures for the Philadelphia PA market could not be read when this check ran, so it reasoned from rules of thumb alone . re-screen to include them\./,
    );
    expect(await pdfTextOf(buf)).not.toContain("could not be read when this check ran");

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
              read: "The exit cap 6.00% is 106 bps over the latest 10-year (4.94%, Sep 17, 2026; FRED). The going-in cap 5.45% is 51 bps over it, so the exit assumes the spread widens 55 bps with the 10-year unchanged - the conservative direction.",
            },
          ],
        }),
      }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    // The PDF's text comes back a line at a time, so a sentence is read
    // with its line breaks folded — the wrap is the page's, not the words'.
    const assumedText = (await pdfTextOf(assumed)).replace(/\s+/g, " ");
    expect(assumedText).toContain("Assumptions against the published figures");
    expect(assumedText).toContain("set against the published figures for the Philadelphia market and the nation, read on Sep 21, 2026");
    expect(assumedText).not.toContain("actually done");
    expect(assumedText).toContain("Rent growth 3.0%/yr (a screening default)");
    expect(assumedText).toContain("ahead of the published figures");
    expect(assumedText).toContain("Exit cap 6.00% (derived from the documents)");
    expect(assumedText).toContain("spread widens 55 bps with the 10-year unchanged");
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

    // The reconciliation page draws each gap from a centre line — a track,
    // the fill and the centre tick, three fills a drawn row. Two of the
    // sample's three rows are a gap (their figures' own: $173,500 and 300
    // bps); a neutral row draws none — so a report whose rows all agree
    // draws six fewer shapes. (The bar is the two figures' subtraction, so
    // agreement is the row's direction, not its line alone.)
    const drawnGaps = SAMPLE_DEAL.reconciliation.rows.filter((r) => r.direction !== "neutral").length;
    expect(drawnGaps).toBe(2);
    const agreed = {
      ...deal,
      reconciliation: {
        ...SAMPLE_DEAL.reconciliation,
        rows: SAMPLE_DEAL.reconciliation.rows.map((r) => ({ ...r, gap: "In agreement", direction: "neutral" })),
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

  it("says the challenges run most severe first, the order the challenger is asked for, never the order deals die", async () => {
    // The prompt's own order, so the subtitle cannot drift from it again.
    expect(challengerInstruction("multifamily")).toContain("Give 3–6 challenges, most severe first.");
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const text = pdfTextOf(
      await renderToBuffer(
        React.createElement(ReportDocument, { input: buildReportData(deal, "September 30, 2026", []) }) as unknown as Parameters<typeof renderToBuffer>[0],
      ),
    ).replace(/\s+/g, " ");
    expect(text).toContain("The pro forma's assumptions, challenged most severe first, each with the exact question to put to the broker.");
    expect(text).not.toContain("in the order deals die");
    // The challenger's stress test estimates what a revert does to the
    // returns without the engine, and its box says whose estimate it is.
    expect(text).toContain("STRESS TEST — THE SCREEN'S ESTIMATE, NOT THE MODEL'S");
    expect(text).toContain(SAMPLE_DEAL.challenges.stressTest.slice(0, 40));
  }, 45000);

  it("prints the call in full after the memo: the whole rationale, every risk and step, each range's source, basis and confidence", async () => {
    const reason =
      "The going-in basis is rich for a receivership sale and the returns lean on an aggressive exit, a rent ramp the LIHTC limits cap, and an assumable HUD loan whose rate advantage mostly sits in the price. Worth a closer look only if the receiver moves on price or the ramp is de-risked.";
    const verdict = {
      ...SAMPLE_DEAL.verdict,
      generatedAt: "2026-09-28T14:00:00.000Z",
      reason,
      topRisks: [...SAMPLE_DEAL.verdict.topRisks, "A fourth risk the memo has no room for.", "And a fifth."],
    };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      extraction: SAMPLE_DEAL.extraction,
      challenges: SAMPLE_DEAL.challenges,
      comps: null,
      market: null,
      reconciliation: null,
      verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const input = buildReportData(deal, "September 30, 2026", []);
    // The memo on page one clamps the rationale and keeps two risks.
    expect(input.memo.verdictReason).not.toBe(reason);
    expect(input.memo.topRisks).toHaveLength(2);
    const pages = pdfPageTextsOf(
      await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]),
    ).map((p) => p.replace(/\s+/g, " "));
    const at = pages.findIndex((p) => p.includes("The call, in full"));
    // Right after the memo's page (or pages), before any page the model computed.
    expect(at).toBeGreaterThanOrEqual(1);
    expect(pages.slice(0, at).every((p) => p.includes("Deal Screening Memo") || p.includes("screening memo, continued"))).toBe(true);
    const text = pages.slice(at).join(" ");
    expect(text).toContain("Caution · Screened Sep 28, 2026");
    expect(text).toContain(reason);
    for (const r of verdict.topRisks) expect(text).toContain(r);
    for (const n of verdict.nextSteps) expect(text).toContain(n);
    for (const r of verdict.screen!.ranges) {
      expect(text).toContain(`Source: ${r.source}`);
      expect(text).toContain(`What drives the spread: ${r.basis}`);
    }
    for (const k of verdict.screen!.dealKillers) expect(text).toContain(`Breaks if (screen's estimate): ${k.risk}`);
    for (const f of verdict.screen!.sensitivity) expect(text).toContain(f.note);
    // No verdict, no page.
    const bare = buildReportData({ ...deal, verdict: null } as unknown as DealRow, "September 30, 2026", []);
    const bareText = pdfTextOf(await renderToBuffer(React.createElement(ReportDocument, { input: bare }) as unknown as Parameters<typeof renderToBuffer>[0]));
    expect(bareText).not.toContain("The call, in full");
  }, 60000);

  it("prints the deal page's max bid — solved on the buy box's every floor, the binding one named — never the IRR floor's alone", async () => {
    // The demo report route's own chain, beside the demo page's playground.
    const derived = sampleDerivedInputs();
    const floors = bidFloors(SAMPLE_DEMO_BOX)!;
    const sensitivity = buildSensitivityData(derived.inputs, SAMPLE_DEMO_BOX.minIrrPct ?? null, { sources: derived.sources, floors });
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
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input: buildReportData(deal, "September 30, 2026", [], sensitivity) }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    // The page's figure, as the page prints it (rounded down).
    const page = solveMaxBid(derived.inputs, floors, pageBaseLevers(derived.inputs));
    expect(text).toContain(`Max bid clearing your buy box's floors (13% IRR, 5% cash-on-cash, 5.75% going-in cap): ${fmtBid(page.price!)}`);
    expect(text).toContain("your 5% cash-on-cash floor binds");
    expect(text).not.toContain("Max bid holding 13% IRR");
  }, 45000);

  it("prints no max bid on a note, whose model is the collateral's, and says a share's is the whole building's", async () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 30)), toFake: ["Date"] });
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3", basis: "na" as const });
    const render = async (extraction: ExtractionResult) => {
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
      const sensitivity = buildSensitivityData(derived.inputs, null, { sources: derived.sources });
      const buf = await renderToBuffer(
        React.createElement(ReportDocument, { input: buildReportData(deal, "September 30, 2026", [], sensitivity) }) as unknown as Parameters<typeof renderToBuffer>[0],
      );
      return (await pdfTextOf(buf)).replace(/\s+/g, " ");
    };
    const note = await render({
      ...SAMPLE_DEAL.extraction,
      interest: { kind: "note", summary: "", share: "", groundLease: "", loan: "", page: "" },
      metrics: [...SAMPLE_DEAL.extraction.metrics, row("Unpaid principal balance", "$80,000,000"), row("Note rate", "5.25%"), row("Maturity date", "March 31, 2028")],
    } as ExtractionResult);
    expect(note).toContain("No max bid: the model's price is the collateral's");
    expect(note).not.toMatch(/Max bid (clearing|holding)/);
    const share = await render({
      ...SAMPLE_DEAL.extraction,
      interest: { kind: "partial_interest", summary: "", share: "A 49% limited partnership interest", groundLease: "", loan: "", page: "" },
      metrics: SAMPLE_DEAL.extraction.metrics.map((m) => (m.label === "Asking price" ? { ...m, value: "$33,320,000" } : m)),
    } as ExtractionResult);
    expect(share).toMatch(/Max bid holding the 15% screening hurdle: \$[\d.]+M \([-+]?\d+\.\d% vs the modeled price\)\..* It is the whole building's price, not the share's\./);
    const unstated = await render({
      ...SAMPLE_DEAL.extraction,
      interest: { kind: "partial_interest", summary: "", share: "A minority interest in the owning entity", groundLease: "", loan: "", page: "" },
    } as ExtractionResult);
    expect(unstated).toContain("No max bid: the memorandum states no single percentage for the share");
    expect(unstated).not.toMatch(/Max bid (clearing|holding)/);
    // All of the entity's interests (a stated 100%, research pass 28): the
    // bid is solved on the price itself, and it is no share's.
    const whole = await render({
      ...SAMPLE_DEAL.extraction,
      interest: { kind: "partial_interest", summary: "", share: "100% of the beneficial interests, offered in $100,000 units", groundLease: "", loan: "", page: "" },
    } as ExtractionResult);
    expect(whole).toMatch(/Max bid holding the 15% screening hurdle: \$[\d.]+M/);
    expect(whole).not.toContain("no single percentage");
    expect(whole).not.toContain("not the share's");
    expect(whole).toContain("All of the owning entity's interests");
  }, 60000);

  it("prints the base case the grids are struck around, each input with its source, and the terms every cell runs on under the grid", async () => {
    const extraction = { ...(SAMPLE_DEAL.extraction as ExtractionResult), totalPages: 40 };
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
    const render = async (derived: ReturnType<typeof deriveUnderwriteInputs>) => {
      const sensitivity = buildSensitivityData(derived.inputs, null, { sources: derived.sources });
      const buf = await renderToBuffer(
        React.createElement(ReportDocument, { input: buildReportData(deal, "September 30, 2026", [], sensitivity) }) as unknown as Parameters<typeof renderToBuffer>[0],
      );
      return { text: pdfTextOf(buf).replace(/\s+/g, " "), b: sensitivity.baseCase! };
    };
    const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
    const { text, b } = await render(deriveUnderwriteInputs(extraction, SAMPLE_DEAL.name));
    expect(text).toContain("The base case");
    expect(text).toContain(`LEVERED IRR ${(b.leveredIrr! * 100).toFixed(1)}%`);
    expect(text).toContain(`EQUITY MULTIPLE ${b.equityMultiple!.toFixed(2)}x`);
    expect(text).toContain(`YEAR-1 DSCR ${b.dscrY1!.toFixed(2)}x`);
    // The inputs, each with its provenance: the ask cited to its page, the
    // defaults said as assumptions.
    expect(text).toContain("Price $68,000,000 · OM p. 3");
    expect(text).toContain(`Loan ${usd(b.loan)} · 60% of cost · assumption`);
    expect(text).toContain(`Equity ${usd(b.equity)} · total uses less the loan`);
    expect(text).toContain("Hold 5 years · assumption");
    expect(text).toContain(`Year-1 NOI ${usd(b.noiY1)} · derived`);
    expect(text).toContain(`Total uses ${usd(b.totalUses)}`);
    expect(text).toContain(`Total sources ${usd(b.loan + b.equity)}`);
    // The grid's terms: the rate a placeholder, said only as an assumption.
    expect(text).toContain(
      "The grids run on a 5-year hold (assumption); a loan of 60% of cost (assumption), amortizing over 30 years; and a 6.00% all-in rate (assumption). These returns carry a 1.0% closing hold and a 2.0% cost of sale, and no transfer or recordation tax: none is modelled on the purchase, and the cost of sale carries none a seller may owe at the exit. Set each in the Excel model, entering the jurisdiction's tax where it levies one.",
    );
    // A rate seeded off today's curve prints its dated source note.
    const seeded = await render(
      deriveUnderwriteInputs(extraction, SAMPLE_DEAL.name, undefined, {
        debtIndex: { id: "DGS5", short: "5-yr", pct: 4.78, asOf: "2026-09-17", kind: "treasury" },
      }),
    );
    expect(seeded.text).toContain(
      "and a 6.78% all-in rate: 5-yr Treasury 4.78% (FRED, Sep 17, 2026) + 200 bps multifamily spread, a screening default — enter your quote (assumption).",
    );
  }, 60000);

  it("labels the retrade grid's base row the modeled price, never the ask, and says what the model priced it at", async () => {
    const render = async (extraction: ExtractionResult) => {
      const deal = {
        name: extraction.dealName ?? SAMPLE_DEAL.name,
        asset_class: SAMPLE_DEAL.asset_class,
        extraction,
        challenges: null,
        comps: null,
        market: null,
        reconciliation: null,
        verdict: SAMPLE_DEAL.verdict,
        prior_screen: null,
      } as unknown as DealRow;
      const derived = deriveUnderwriteInputs(extraction, deal.name);
      const input = buildReportData(deal, "September 30, 2026", [], buildSensitivityData(derived.inputs, null, { sources: derived.sources }));
      const buf = await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]);
      return (await pdfTextOf(buf)).replace(/\s+/g, " ");
    };
    // The sample: the ask is what the model runs at, cited to its page.
    const sample = await render({ ...(SAMPLE_DEAL.extraction as ExtractionResult), totalPages: 40 });
    expect(sample).toContain("$68M (modeled)");
    expect(sample).toContain("The modeled price is $68,000,000: OM asking / purchase price (p. 3).");
    expect(sample).not.toContain("(ask)");
    // A 49% share: the $33.3M ask grossed up to the $68M whole the model runs.
    const share = await render({
      ...(SAMPLE_DEAL.extraction as ExtractionResult),
      dealName: "49% LP interest — The Maddox",
      interest: { kind: "partial_interest", summary: "", share: "A 49% limited partnership interest in the owning entity", groundLease: "", loan: "", page: "" },
      metrics: SAMPLE_DEAL.extraction.metrics.map((m) => (m.label === "Asking price" ? { ...m, value: "$33,320,000" } : m)),
    } as ExtractionResult);
    expect(share).toContain("$68M (modeled)");
    expect(share).toContain("The modeled price is $68,000,000: The OM's $33,320,000 for a 49% share, grossed up to the whole asset");
    expect(share).toContain("(derived).");
    expect(share).not.toContain("(ask)");
  }, 60000);

  it("leaves the IRR grids, the max bid and every model read out of an unpriced memorandum's report, and says why where the grids would have been", async () => {
    const row = (label: string, value: string, page = "p. 3") => ({ label, value, flagged: false, page, basis: "na" as const });
    const unpriced = {
      dealName: "Unpriced — Call for Offers",
      assetClass: "multifamily",
      market: "Philadelphia, PA",
      totalPages: 60,
      metrics: [
        row("Asking price", "Unpriced — call for offers", "p. 2"),
        row("NOI (in-place)", "$3,880,000", "p. 8"),
        row("Units", "248"),
        // An assumable loan is priced against the model's own new loan —
        // on a placeholder price, a placeholder's figure too.
        row("Assumable loan balance", "$30,000,000"),
        row("Assumable loan rate", "3.45%"),
        row("Assumable loan maturity", "March 31, 2031"),
      ],
    } as ExtractionResult;
    const deal = {
      name: unpriced.dealName,
      asset_class: "multifamily",
      extraction: unpriced,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    // The route's own chain.
    const derived = deriveUnderwriteInputs(unpriced, unpriced.dealName!);
    expect(derived.sources.purchasePrice?.provenance).toBe("assumption");
    const sensitivity = buildSensitivityData(derived.inputs, null, { sources: derived.sources });
    const a = readAssumable(unpriced, derived.inputs)!;
    const view = assumableView(a, derived.sources.allInRatePct?.note ?? null, !!derived.meta.rateSeed);
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, view);
    expect(input.sensitivity).toBeNull();
    expect(input.assumable).toBeNull();
    const buf = await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]);
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Sensitivity analysis");
    expect(text).toContain("left out");
    expect(text).toContain(
      "The IRR grids and the max bid are left out: no price was read from the memorandum, nor a year-1 NOI the model could run on, so the model runs on a $10,000,000 placeholder price and an assumed NOI, and its returns would be a placeholder's.",
    );
    expect(text).not.toContain("(ask)");
    expect(text).not.toContain("Max bid");
    expect(text).not.toContain("The retrade grid");
    expect(text).not.toContain("The seller's loan, offered for assumption");
    // Page one still says the loan is offered, as the memorandum states it.
    expect(text).toContain("The seller's loan is offered for assumption: $30.0M at 3.45% to Mar 2031");

    // The same deal with its price stated prints its grids.
    const priced = { ...unpriced, metrics: unpriced.metrics.map((m) => (m.label === "Asking price" ? { ...m, value: "$68,000,000" } : m)) } as ExtractionResult;
    const pd = deriveUnderwriteInputs(priced, priced.dealName!);
    const pricedInput = buildReportData({ ...deal, extraction: priced } as unknown as DealRow, "September 30, 2026", [], buildSensitivityData(pd.inputs, null, { sources: pd.sources }));
    expect(pricedInput.sensitivity).not.toBeNull();
    expect(pricedInput.withheld).toBeNull();
  }, 45000);

  it("puts the grid's takeaway and the assumptions read through the WinAnsi filter, so a symbol prints as its stand-in, never as a wrong glyph or nothing", async () => {
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
    const derived = deriveUnderwriteInputs(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.name);
    const sensitivity = { ...buildSensitivityData(derived.inputs, null), takeaway: "The deal holds ≥15% up to a 5.70% exit cap." };
    const read = {
      readOn: "2026-09-21",
      metro: "Philadelphia",
      checks: [
        {
          key: "rent_growth" as const,
          title: "Rent growth",
          model: "3.0%/yr",
          modelSource: "a screening default",
          published: [],
          tone: "ahead" as const,
          toneLabel: "ahead ↑ of the published figures",
          scope: "metro" as const,
          read: "Asking rents moved ↓ 0.4 points on the year; the model runs ≈0.7 points ahead.",
        },
      ],
    };
    const input = buildReportData(deal, "September 21, 2026", [], sensitivity, undefined, null, null, undefined, read as never);
    const buf = await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]);
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("The deal holds >=15% up to a 5.70% exit cap.");
    expect(text).toContain("ahead up of the published figures");
    expect(text).toContain("Asking rents moved down 0.4 points on the year; the model runs ~0.7 points ahead.");
  }, 45000);

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

  it("on a note behind a senior loan, prints no loan-to-value and says why", async () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2025, 8, 30)), toFake: ["Date"] });
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3", basis: "na" as const });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      interest: {
        kind: "note" as const,
        summary: "Sale of a mezzanine loan",
        share: "",
        groundLease: "",
        loan: "$80M mezzanine loan behind a senior mortgage",
        page: "",
      },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        row("Unpaid principal balance", "$80,000,000"),
        row("Note rate", "9.00%"),
        row("Maturity date", "March 31, 2028"),
        row("Amortization", "Interest-only"),
        row("Payment status", "Performing"),
        row("Whole-asset value", "$300,000,000"),
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
    const input = buildReportData(deal, "September 30, 2025", [], buildSensitivityData(derived.inputs, null));
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("it sits behind a senior loan, and its loan-to-value at its last dollar needs that loan's balance, which the screen did not read as a figure of its own.");
    // $80M over $300M alone would read 27%: never printed.
    expect(text).not.toMatch(/puts the balance at \d+% of its value/);
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

  it("prints a covenant on the rents over the grids its rent growth axis would mislead (#453)", async () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 30)), toFake: ["Date"] });
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3", basis: "na" as const });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      affordable: { programs: ["lihtc" as const], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
      metrics: [...SAMPLE_DEAL.extraction.metrics, row("Restricted units", "186"), row("Affordability expiration", "December 31, 2054")],
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity);
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("186 of 248 units (75%) rent-restricted under LIHTC until Dec 2054.");
    expect(text).toContain("The screening model grows every unit's rent at one rate.");
    expect(text).toContain("read its rent growth as the 62 market-rate units");
  }, 45000);

  it("prints a single tenant's lease over the grids: the years left at the sale and its increases against the model's growth (#454)", async () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 30)), toFake: ["Date"] });
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 4", basis: "na" as const });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      singleTenant: { tenant: "Walgreens Co.", guarantor: "Walgreens Boots Alliance, Inc.", leaseType: "Absolute NNN", landlordObligations: "", tenantRights: "", page: "" },
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        row("Lease expiration", "March 31, 2036"),
        row("Renewal options", "Eight 5-year options"),
        row("Rent increases", "10% every 5 years"),
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, derived.meta.singleTenant ?? null);
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Single tenant: Walgreens Co., guaranteed by Walgreens Boots Alliance, Inc., Absolute NNN; the lease ends Mar 2036, 9.5 years from today");
    expect(text).toContain("At the model's sale in 5 years the lease has 4.5 years left, before the tenant's renewal options");
    expect(text).toContain("enter 1.92% as the rent growth to run the model on the lease");
    // A caller that built no model prints the lease's line alone.
    const bare = buildReportData(deal, "September 30, 2026", [], sensitivity);
    const bareText = (await pdfTextOf(
      await renderToBuffer(React.createElement(ReportDocument, { input: bare }) as unknown as Parameters<typeof renderToBuffer>[0]),
    )).replace(/\s+/g, " ");
    expect(bareText).toContain("Single tenant: Walgreens Co.");
    expect(bareText).not.toContain("At the model's sale in 5 years");
  }, 60000);

  it("prints what a hotel is sold with over the grids, and the PIP the model carries (#455)", async () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 30)), toFake: ["Date"] });
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 6", basis: "na" as const });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      hotel: { brand: "Courtyard by Marriott", franchise: "", management: "", encumbrance: "unencumbered" as const, pip: "", page: "" },
      metrics: [...SAMPLE_DEAL.extraction.metrics, row("PIP cost", "$4,200,000")],
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, derived.meta.hotel ?? null);
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Hotel: flagged Courtyard by Marriott, sold unencumbered; PIP $4.2M");
    expect(text).toContain("The model carries the $4.2M PIP as its first year's capital");
  }, 60000);

  it("prints how the property is sold over the grids, and the ceiling bid (#456)", async () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 30)), toFake: ["Date"] });
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3", basis: "na" as const });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      sale: { method: "auction" as const, terms: "", condition: "", page: "" },
      metrics: [...SAMPLE_DEAL.extraction.metrics, row("Starting bid", "$2,500,000"), row("Buyer's premium", "5%")],
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, derived.meta.sale ?? null);
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Sold at auction: bidding opens at $2.5M; a 5% buyer's premium");
  }, 60000);

  it("prints a multi-tenant property's listed tenants over the grids, and the leasing capital the model does not carry (#457)", async () => {
    vi.useFakeTimers({ now: new Date(Date.UTC(2026, 8, 30)), toFake: ["Date"] });
    const t = (name: string, over: Record<string, string>) => ({
      name, role: "inline" as const, inSale: "yes" as const, sf: "", rent: "", leaseExpiration: "", options: "", earlyTermination: "", rights: "", page: "", ...over,
    });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "office",
      tenants: [
        t("Acme Law", { sf: "12,000 SF", rent: "$420,000", leaseExpiration: "June 30, 2028" }),
        t("Birch Health", { sf: "8,000 SF", rent: "$280,000", leaseExpiration: "2035" }),
      ],
    } as ExtractionResult;
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "office",
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, derived.meta.roster ?? null);
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Two tenants listed; 60% of their rent expires before year 5, the most in year 2; Acme Law pays 60% of the listed rent.");
    expect(text).toContain("The model carries no leasing capital");
  }, 60000);

  it("prints a value-add program over the grids, and the premium the model does not carry (#460)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Units to renovate", value: "192", flagged: false, page: "", basis: "na" as const },
        { label: "Renovation cost per unit", value: "$15,000", flagged: false, page: "", basis: "na" as const },
        { label: "Renovation premium", value: "$250", flagged: false, page: "", basis: "na" as const },
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
    // A value-add is a plan deal: the IRR page is omitted and the read
    // lands on the plan's page, under the grid the deal is judged on.
    const plan = buildPlanReport(extraction, {
      pct: derived.inputs.exitCapPct,
      provenance: derived.sources.exitCapPct?.provenance ?? ("assumption" as const),
    });
    expect(plan).not.toBeNull();
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, plan, null, undefined, null, null, null, null, null, null, null, null, null, derived.meta.valueAdd ?? null);
    expect(input.sensitivity).toBeNull();
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Value-add program: 192 doors to renovate; $15,000 a door; $250 a month premium (20% on cost)");
    expect(text).toContain("the premium breaks even at");
    expect(text).toContain("the premium is in none of its returns");
  }, 60000);

  it("prints a tax abatement over the grids, and where it ends against the model's sale (#461)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Tax abatement", value: "10-year Philadelphia tax abatement", flagged: false, page: "", basis: "na" as const },
        { label: "Tax abatement expiration", value: "2099", flagged: false, page: "", basis: "na" as const },
        { label: "Abated real estate taxes", value: "$70,000", flagged: false, page: "", basis: "na" as const },
        { label: "Unabated real estate taxes", value: "$520,000", flagged: false, page: "", basis: "na" as const },
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, derived.meta.taxAbatement ?? null);
    expect(input.sensitivity).not.toBeNull();
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Tax abatement: 10-year Philadelphia tax abatement; ends 2099");
    expect(text).toContain("so the next buyer takes the step-up and prices it");
  }, 60000);

  it("prints a student building's pre-leasing over the grids, and the beds still to sign (#468)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "student_housing",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Beds", value: "612", flagged: false, page: "", basis: "na" as const },
        { label: "Pre-leased", value: "80% for Fall 2026", flagged: false, page: "", basis: "na" as const },
      ],
    } as ExtractionResult;
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "student_housing",
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, null, null, null, derived.meta.student ?? null);
    expect(input.sensitivity).not.toBeNull();
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Student housing: 80% pre-leased for Fall 2026; 612 beds");
    expect(text).toContain("of the fall's leasing is still to sign");
  }, 60000);

  it("prints a manufactured-housing park over the grids, and what the model does with its gap to market (#470)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "manufactured_housing",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Pads", value: "150", flagged: false, page: "", basis: "na" as const },
        { label: "Occupied pads", value: "132", flagged: false, page: "", basis: "na" as const },
        { label: "Lot rent", value: "$430", flagged: false, page: "", basis: "in_place" as const },
        { label: "Market lot rent", value: "$525", flagged: true, page: "", basis: "pro_forma" as const },
      ],
    } as ExtractionResult;
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "manufactured_housing",
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, null, null, null, null, derived.meta.mh ?? null);
    expect(input.sensitivity).not.toBeNull();
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Manufactured housing: 150 pads");
    expect(text).toContain("lot rent $430 (market $525)");
    expect(text).toContain("so closing the gap is in none of its returns");
  }, 60000);

  it("prints a self-storage facility over the grids, and what the model does with the premium over street (#471)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "self_storage",
      metrics: [
        // The sample's apartment rent is no storage rate.
        ...SAMPLE_DEAL.extraction.metrics.filter((m) => !/in-place rent/i.test(m.label)),
        { label: "In-place rent", value: "$1.38/SF/month", flagged: false, page: "", basis: "in_place" as const },
        { label: "Street rate", value: "$1.14/SF/month", flagged: false, page: "", basis: "in_place" as const },
      ],
    } as ExtractionResult;
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "self_storage",
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, derived.meta.storage ?? null);
    expect(input.sensitivity).not.toBeNull();
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("in-place $1.38/SF a month against street $1.14/SF a month (+21.1%)");
    expect(text).toContain("a downside it does not run");
  }, 60000);

  it("prints the rent rules over the grids, and the model's one growth rate beside the allowance in force (lib/rent-regulation)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Year built", value: "1931", flagged: false, page: "", basis: "na" as const },
        { label: "Rent-regulated units", value: "180", flagged: false, page: "", basis: "na" as const },
      ],
    } as ExtractionResult;
    const address = { label: "100 Walk-up St, Brooklyn, NY 11215", street: "100 Walk-up St", city: "Brooklyn", state: "NY", zip: "11215", county: "Kings County", submarket: "" };
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      address,
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    // As the route reads it: through the one call, on the route's day.
    const read = regulationForDeal({ extraction, address, siteFlags: null, assetClass: SAMPLE_DEAL.asset_class }, "2026-10-05");
    const derived = deriveUnderwriteInputs(extraction, SAMPLE_DEAL.name, undefined, undefined, { regulation: read });
    const sensitivity = buildSensitivityData(derived.inputs, null);
    const input = buildReportData(
      deal,
      "October 5, 2026",
      [],
      sensitivity,
      undefined,
      null,
      null,
      undefined,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      derived.meta.regulation ?? null,
    );
    expect(input.sensitivity).not.toBeNull();
    expect(input.regulation?.read).toMatch(/^The model grows every rent /);
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Rent regulation: NYC rent stabilization applies; 180 of the 248 units rent-regulated as stated (73%)");
    expect(text).toContain("NYC rent stabilization allows 0% on a one-year lease for leases commencing Oct 1, 2026 to Sep 30, 2027");
    expect(text).toContain("The model's one growth rate is the market-rate units', not the regulated ones'.");
    // A model on a placeholder figure prints no read of its own: the rules'
    // line stands alone.
    const withheld = buildReportData(
      deal,
      "October 5, 2026",
      [],
      { ...sensitivity, withheld: "The model runs on a placeholder price." },
      undefined,
      null,
      null,
      undefined,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      derived.meta.regulation ?? null,
    );
    expect(withheld.regulation).toEqual({ line: derived.meta.regulation!.line, read: "" });
  }, 60000);

  it("carries a forward purchase as buildReportData's last argument, and prints it under the plan page's grid where the report has one (lib/forward-purchase)", async () => {
    const extraction: ExtractionResult = {
      dealName: "Ridgeline Distribution",
      assetClass: "industrial",
      market: "Columbus, OH",
      address: "",
      strategy: { kind: "development", summary: "Forward purchase of a build-to-suit distribution center at completion", capitalBudget: "", timeline: "" },
      metrics: [
        { label: "Purchase price", value: "$48,000,000", flagged: false, page: "p. 2" },
        { label: "NOI (stabilized, pro forma)", value: "$2,880,000", flagged: false, page: "p. 4" },
        { label: "Delivery cap rate", value: "6.00%", flagged: false, page: "p. 4" },
        { label: "Construction budget", value: "$31,000,000", flagged: false, page: "p. 6" },
        { label: "Delivery date", value: "Q3 2027", flagged: false, page: "p. 4" },
      ],
    };
    const deal = {
      name: extraction.dealName,
      asset_class: "industrial",
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const derived = deriveUnderwriteInputs(extraction, extraction.dealName!);
    expect(derived.meta.forward?.read).toMatch(/^The model runs the price as paid at closing with income from its first year/);
    const refCap = { pct: derived.inputs.exitCapPct, provenance: derived.sources.exitCapPct?.provenance ?? ("assumption" as const) };
    // The developer funds the works: no budget is the buyer's, so the plan
    // has no yield-on-cost grid to stress and the route builds no plan page.
    expect(buildPlanReport(extraction, refCap)).toBeNull();
    const args = (plan: ReturnType<typeof buildPlanReport>) =>
      buildReportData(deal, "October 5, 2026", [], null, undefined, plan, null, undefined, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, derived.meta.forward ?? null);
    const input = args(null);
    expect(input.forward).toEqual(derived.meta.forward);
    // Page one is the memo, which says the purchase under the title.
    const page1 = (await pdfTextOf(await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]))).replace(/\s+/g, " ");
    expect(page1).toContain("Build-to-suit: $48.0M paid at delivery (Q3 2027), the works the developer's; 6.00% at delivery");
    // Where a plan page is drawn — here the same deck's grid, as if the
    // buyer built it — the purchase and the model's read print under it.
    const own = { ...extraction, strategy: { ...extraction.strategy!, summary: "Ground-up distribution center" } };
    const ownPlan = buildPlanReport(own, refCap);
    expect(ownPlan).not.toBeNull();
    const text = (await pdfTextOf(await renderToBuffer(React.createElement(ReportDocument, { input: args(ownPlan) }) as unknown as Parameters<typeof renderToBuffer>[0]))).replace(/\s+/g, " ");
    expect(text).toContain("The model runs the price as paid at closing with income from its first year: on a forward purchase that day is delivery, Q3 2027.");
  }, 60000);

  it("prints a mixed-use building's two incomes over the grids, and the one exit cap the model runs both at (lib/mixed-use)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      assetClass: "Retail / Multifamily",
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Residential income", value: "$1,520,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "Commercial income", value: "$610,000", flagged: false, page: "", basis: "in_place" as const },
      ],
    } as ExtractionResult;
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "mixed_use",
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
    const input = buildReportData(deal, "October 5, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, derived.meta.mixedUse ?? null);
    expect(input.sensitivity).not.toBeNull();
    expect(input.mixedUse).toEqual(derived.meta.mixedUse);
    const text = (await pdfTextOf(await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]))).replace(/\s+/g, " ");
    expect(text).toContain("Mixed-use: $1.52M residential and $610k commercial income (28.6% commercial). The model capitalises the $610k of commercial income at the same");
  }, 60000);

  it("prints an operating business over the grids, and the income the model capitalises as rent (lib/going-concern)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      dealName: "Route 9 Fuel & Market",
      assetClass: "Gas Station / Convenience Store",
      strategy: { kind: "stabilized", summary: "Sale of the going concern: real estate, fuel business and store", capitalBudget: "", timeline: "" },
      metrics: [
        { label: "Asking price", value: "$3,200,000", flagged: false, page: "", basis: "na" as const },
        { label: "NOI (in-place)", value: "$256,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "EBITDA (T-12)", value: "$410,000", flagged: false, page: "", basis: "in_place" as const },
      ],
    } as ExtractionResult;
    const deal = {
      name: "Route 9 Fuel & Market",
      asset_class: "auto",
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const derived = deriveUnderwriteInputs(extraction, "Route 9 Fuel & Market");
    const sensitivity = buildSensitivityData(derived.inputs, null);
    const input = buildReportData(deal, "October 5, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, derived.meta.goingConcern ?? null);
    expect(input.sensitivity).not.toBeNull();
    expect(input.goingConcern).toEqual(derived.meta.goingConcern);
    const text = (await pdfTextOf(await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]))).replace(/\s+/g, " ");
    expect(text).toContain("Fuel station and its store: sold with the business; EBITDA (T-12) $410k. The model capitalises its $256k year-one income");
  }, 60000);

  it("prints condominium units over the grids, and the model's one building (lib/condo)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      dealName: "Harbor View",
      assetClass: "Condominium Units (bulk sale)",
      metrics: [
        { label: "Asking price", value: "$16,800,000", flagged: false, page: "", basis: "na" as const },
        { label: "Units", value: "42", flagged: false, page: "", basis: "na" as const },
        { label: "NOI (in-place)", value: "$840,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "HOA dues", value: "$650 per unit per month", flagged: false, page: "", basis: "in_place" as const },
        { label: "Units in building", value: "120", flagged: false, page: "", basis: "na" as const },
      ],
    } as ExtractionResult;
    const deal = {
      name: "Harbor View",
      asset_class: "auto",
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const derived = deriveUnderwriteInputs(extraction, "Harbor View");
    const sensitivity = buildSensitivityData(derived.inputs, null);
    const input = buildReportData(deal, "October 5, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, derived.meta.condo ?? null);
    expect(input.sensitivity).not.toBeNull();
    expect(input.condo).toEqual(derived.meta.condo);
    const text = (await pdfTextOf(await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]))).replace(/\s+/g, " ");
    expect(text).toContain("Condominium units: 42 of 120 units; dues $328k a year. The model sells the 42 units as one building");
  }, 60000);

  it("prints a sandwich position over the grids, and the model's perpetuity against its master lease (lib/sandwich-lease)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      dealName: "Founders Plaza",
      assetClass: "Office",
      interest: {
        kind: "leasehold",
        summary: "Leasehold interest under a master lease of the building, sublet to 14 office tenants",
        share: "",
        groundLease: "Master lease of the building from its owner",
        loan: "",
        page: "",
      },
      metrics: [
        { label: "Asking price", value: "$6,500,000", flagged: false, page: "", basis: "na" as const },
        { label: "Master lease rent", value: "$1,100,000 a year", flagged: false, page: "", basis: "in_place" as const },
        { label: "Sublease income", value: "$1,820,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "NOI (T-12)", value: "$720,000", flagged: false, page: "", basis: "in_place" as const },
        { label: "Master lease expiration", value: "December 31, 2091", flagged: false, page: "", basis: "na" as const },
      ],
    } as ExtractionResult;
    const deal = {
      name: "Founders Plaza",
      asset_class: "auto",
      extraction,
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const derived = deriveUnderwriteInputs(extraction, "Founders Plaza");
    const sensitivity = buildSensitivityData(derived.inputs, null);
    const input = buildReportData(deal, "October 5, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, derived.meta.sandwich ?? null);
    expect(input.sensitivity).not.toBeNull();
    expect(input.sandwich).toEqual(derived.meta.sandwich);
    const text = (await pdfTextOf(await renderToBuffer(React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0]))).replace(/\s+/g, " ");
    expect(text).toContain(
      "Sandwich position: subleases $1.82M against a $1.10M master rent (1.65×); the master lease ends Dec 2091. The model capitalises the position's income at its sale as if it ran forever; the master lease ends Dec 2091",
    );
  }, 60000);

  it("prints what the third-party reports found over the grids, and the repairs the model carries (#465)", async () => {
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        { label: "Phase I ESA findings", value: "No RECs", flagged: false, page: "", basis: "na" as const },
        { label: "PCA immediate repairs", value: "$630,000", flagged: false, page: "", basis: "na" as const },
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
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, null, null, derived.meta.siteReports ?? null);
    expect(input.sensitivity).not.toBeNull();
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("Reports: Phase I, no recognized environmental conditions; PCA immediate repairs $630,000");
    expect(text).toMatch(/immediate repairs/);
  }, 60000);

  it("prints a seller's note beside the grids, priced against the model's new loan (#462)", async () => {
    const row = (label: string, value: string) => ({ label, value, flagged: false, page: "", basis: "na" as const });
    const extraction = {
      ...SAMPLE_DEAL.extraction,
      metrics: [
        ...SAMPLE_DEAL.extraction.metrics,
        row("Seller financing amount", "70% of the purchase price"),
        row("Seller financing rate", "5.00%"),
        row("Seller financing term", "5 years"),
        row("Seller financing amortization", "25 years"),
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
    const s = readSellerFinancing(extraction, derived.inputs)!;
    const input = buildReportData(deal, "September 30, 2026", [], sensitivity, undefined, null, null, undefined, null, null, null, null, null, null, null, null, null, null, null, sellerFinancingView(s, null, false));
    const buf = await renderToBuffer(
      React.createElement(ReportDocument, { input }) as unknown as Parameters<typeof renderToBuffer>[0],
    );
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("The seller's note, offered to carry the price");
    expect(text).toContain("The note's 5.00% against 6.00% for a new one — 100 bps under.");
    expect(text).toMatch(/The seller's note (is worth|returns)/);
  }, 60000);

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
    // Each fill is its share of the whole along the 84pt track — Ohio City
    // Commons' 52.8% of the units at 44.3pt — never its length against the
    // largest share in either set, which drew that 52.8% at 81.7pt.
    const rects = pdfFillRectsOf(buf);
    const read = readPortfolio(extraction)!;
    const rows = rects.flatMap((r, i) =>
      r.w === 84 && r.h === 4 && rects[i + 1]?.h === 4 && rects[i + 2]?.w === 84 && rects[i + 2]?.h === 2.5 && rects[i + 3]?.h === 2.5
        ? [{ units: rects[i + 1].w, noi: rects[i + 3].w }]
        : [],
    );
    expect(rows).toHaveLength(properties.length);
    rows.forEach((row, i) => {
      expect(row.units).toBeCloseTo((read.shares![i] / 100) * 84, 3);
      expect(row.noi).toBeCloseTo((read.noiShares![i] / 100) * 84, 3);
    });
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
      "Figures the check read beside the rules of thumb: the state of Pennsylvania's, as published, read on Sep 23, 2026 - the address lies outside the metros the site tracks. The first is the state's, not any metro's, the submarket's or the building's. The last is the nation's, and says so.",
    );
    expect(text).not.toContain("the Pennsylvania market's");
    expect(text).toContain("They speak for the portfolio's 1 property in Pennsylvania of its 3, never for the portfolio.");
    expect(text).toContain("• Unemployment 3.7% (Aug 2026, Pennsylvania; FRED)");
    expect(text).toContain(
      "And the Cleveland OH market's own, where 2 of the portfolio's 3 properties sit, read on Sep 23, 2026. Each is the metro's - not those properties' own, and never the portfolio's.",
    );
    expect(text).toContain("• Unemployment 4.4% (Jul 2026, Cleveland MSA; FRED)");
  }, 60000);

  it("says how a county-placed deal reached its market's figures (#447)", async () => {
    const market = {
      checks: [{ assumption: "Rent growth", omSays: "4.0%", typicalRange: "2.5%–3.5%", assessment: "aggressive", note: "Above the index.", page: "" }],
      summary: "One aggressive assumption.",
      liveBrief: {
        metro: "Dallas-Fort Worth",
        grain: "metro" as const,
        readOn: "2026-09-23",
        lines: ["Unemployment 4.1% (Jul 2026, Dallas-Fort Worth MSA; FRED)"],
        placedBy: { county: "Collin County, TX", area: "Dallas-Fort Worth-Arlington, TX" },
      },
    };
    const deal = {
      name: "Riverbend Site",
      asset_class: "multifamily",
      extraction: { dealName: "Riverbend Site", assetClass: "multifamily", metrics: [{ label: "Asking price", value: "$4,000,000", flagged: false, page: "p. 3" }] },
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
      "Figures the check read beside the rules of thumb: the Dallas-Fort Worth market's, as published, read on Sep 23, 2026. The deal was placed in this market by its county: Collin County, TX, which the Census Bureau files in the Dallas-Fort Worth-Arlington, TX metro area. Its address names no place the market's own list does, so these are the metro area's figures, not the county's.",
    );
  }, 60000);

  it("repeats a long table's column headers on every page its rows run onto", async () => {
    const metrics = [
      ...SAMPLE_DEAL.extraction.metrics,
      ...Array.from({ length: 60 }, (_, i) => ({ label: `Figure ${i + 1} from the rent roll summary`, value: `$${(i + 1) * 1000}`, flagged: i % 7 === 0, page: `p. ${i + 2}`, basis: "in_place" })),
    ];
    const deal = {
      name: SAMPLE_DEAL.name,
      asset_class: "multifamily",
      extraction: { ...SAMPLE_DEAL.extraction, metrics, totalPages: 80 },
      challenges: null,
      comps: null,
      market: null,
      reconciliation: null,
      verdict: SAMPLE_DEAL.verdict,
      prior_screen: null,
    } as unknown as DealRow;
    const pages = pdfPageTextsOf(
      await renderToBuffer(React.createElement(ReportDocument, { input: buildReportData(deal, "September 30, 2026", []) }) as unknown as Parameters<typeof renderToBuffer>[0]),
    );
    const termPages = pages.filter((p) => /Figure \d+ from the rent roll summary/.test(p));
    expect(termPages.length).toBeGreaterThanOrEqual(2);
    for (const p of termPages) expect(p, p.slice(0, 200)).toMatch(/\nTERM\nVALUE\nBASIS\nPAGE\nFLAG\n/);
  }, 45000);

  it("calls a hotel's growth axis RevPAR growth, which is what the model's growth lever grows there", async () => {
    const hotel = {
      dealName: "Hilton Garden Inn Midtown",
      assetClass: "hospitality",
      market: "Nashville, TN",
      metrics: [
        { label: "Asking price", value: "$36,000,000", flagged: false, page: "p. 3", basis: "na" },
        { label: "Keys", value: "180", flagged: false, page: "p. 3", basis: "na" },
        { label: "Going-in cap", value: "8.0%", flagged: false, page: "p. 5", basis: "in_place" },
        { label: "NOI (T-12)", value: "$2,880,000", flagged: false, page: "p. 5", basis: "in_place" },
      ],
    } as unknown as ExtractionResult;
    const render = async (ex: ExtractionResult, cls: string) => {
      const deal = { name: ex.dealName, asset_class: cls, extraction: ex, challenges: null, comps: null, market: null, reconciliation: null, verdict: SAMPLE_DEAL.verdict, prior_screen: null } as unknown as DealRow;
      const derived = deriveUnderwriteInputs(ex, ex.dealName!);
      const sensitivity = buildSensitivityData(derived.inputs, null, { sources: derived.sources });
      const text = pdfTextOf(
        await renderToBuffer(React.createElement(ReportDocument, { input: buildReportData(deal, "September 30, 2026", [], sensitivity) }) as unknown as Parameters<typeof renderToBuffer>[0]),
      ).replace(/\s+/g, " ");
      return { text, takeaway: gridTakeaway(sensitivity.grid, sensitivity.hurdlePct, "RevPAR growth") };
    };
    const { text, takeaway } = await render(hotel, "hospitality_str");
    expect(text).toContain("REVPAR GROWTH (ANNUAL)");
    expect(text).not.toContain("RENT GROWTH (ANNUAL)");
    expect(text).toContain(takeaway);
    expect(text).not.toMatch(/rent growth at the base exit cap/);
    // An apartment building's axis is its rent.
    const sample = await render(SAMPLE_DEAL.extraction as ExtractionResult, SAMPLE_DEAL.asset_class);
    expect(sample.text).toContain("RENT GROWTH (ANNUAL)");
  }, 60000);

  it("prints a stored day the way a reader writes it, and a value that is no date as stored", () => {
    expect(readDay("2026-09-28")).toBe("Sep 28, 2026");
    expect(readDay("2026-09-25T23:30:00Z")).toBe("Sep 25, 2026");
    expect(readDay("")).toBe("");
    expect(readDay(null)).toBe("");
    expect(readDay("last week")).toBe("last week");
  });

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
      return { pages: (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length, buf };
    };
    const [planned, plain] = await Promise.all([render(true), render(false)]);
    const withPlan = planned.pages;
    const without = plain.pages;
    // The spread bands are a rule of thumb, said beside the swatches; the
    // legend's ranges carry no verdict of their own.
    const planText = (await pdfTextOf(planned.buf)).replace(/\s+/g, " ");
    expect(planText).toContain("Shaded by a rule of thumb, not a verdict: 150-200 bps over the cap is the conventional ask for construction and lease-up risk.");
    expect(planText).not.toContain("built for the market's cap");
    // memo + plan + extracted terms, versus the same minus the plan. The IRR
    // sensitivity page is omitted on a plan deal (the annual model's IRR is
    // not the plan's return — the plan page carries its own grid), so the
    // sensitivity passed in never adds a page here.
    expect(withPlan).toBeGreaterThanOrEqual(3);
    expect(withPlan).toBe(without + 1);
  }, 45000);

  it("gives the site a page of its own: FEMA's flood map as one picture, the ring on the building, the key with the building's zone marked, and the zone's sentence (#427, #472)", async () => {
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
    // The key as lib/flood-map's floodMapFor builds it (#472): the classes
    // the band shows, in the site's words, each with its swatch.
    const view: FloodMapView = {
      image: tinyDataUri([90, 120, 80]),
      key: [
        { label: "1% annual chance flood hazard", image: TINY_PNG_DATA_URI, here: true },
        { label: "Floodway", image: tinyDataUri([200, 40, 40]), here: false },
        { label: "0.2% annual chance flood hazard", image: tinyDataUri([240, 150, 40]), here: false },
      ],
      line,
    };
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
    expect(text).toContain("1% annual chance flood hazard - at the building");
    expect(text).toContain("Floodway");
    expect(text).toContain("0.2% annual chance flood hazard");
    expect(text).toContain(
      "FEMA's map puts the building's point in Zone AE (1% annual chance flood hazard), a Special Flood Hazard Area: where the community takes part in the National Flood Insurance Program, federal law requires flood insurance on a loan from a federally regulated or federal agency lender, one Fannie Mae or Freddie Mac buys, or one a federal agency insures or guarantees — the lender's own flood determination decides — and the premium belongs in the expense line.",
    );

    // One page more than the report without it, carrying the map and the
    // three swatches as images, and the ring as a stroke of its own.
    const without = await render(null);
    expect(await pdfTextOf(without)).not.toContain("FEMA flood map");
    expect(pagesOf(buf)).toBe(pagesOf(without) + 1);
    expect(imagesOf(buf) - imagesOf(without)).toBeGreaterThanOrEqual(4);

    // The stored lookup says when it was made: the page says the zone's day.
    expect(text).not.toContain("gave it on");
    const lookedUp = { ...deal, site_flags: { status: "ok", tractGeoid: null, opportunityZone: null, flood: flag, retrievedAt: "2026-09-25T14:30:00Z", note: "" } } as unknown as DealRow;
    const dated = pdfTextOf(
      await renderToBuffer(
        React.createElement(ReportDocument, {
          input: buildReportData(lookedUp, "September 30, 2026", [], null, undefined, undefined, undefined, undefined, null, null, null, view),
        }) as unknown as Parameters<typeof renderToBuffer>[0],
      ),
    ).replace(/\s+/g, " ");
    expect(dated).toContain("The zone as FEMA's National Flood Hazard Layer gave it on Sep 25, 2026.");
    // A lookup made for an address the deal has since changed from is not this map's.
    const moved = {
      ...lookedUp,
      address: { label: "200 Main St, Dallas, TX 75201" },
      site_flags: { ...(lookedUp as unknown as { site_flags: object }).site_flags, subject: { lat: 1, lng: 1, label: "100 Elm St, Dallas, TX 75201" } },
    } as unknown as DealRow;
    expect(
      pdfTextOf(
        await renderToBuffer(
          React.createElement(ReportDocument, {
            input: buildReportData(moved, "September 30, 2026", [], null, undefined, undefined, undefined, undefined, null, null, null, view),
          }) as unknown as Parameters<typeof renderToBuffer>[0],
        ),
      ),
    ).not.toContain("gave it on");

    // FEMA answered the zone and not the picture: the words stand alone,
    // with no credit for a picture that is not there.
    const wordsOnly = (await pdfTextOf(await render({ image: null, key: [], line }))).replace(/\s+/g, " ");
    expect(wordsOnly).toContain("The site");
    expect(wordsOnly).toContain("a Special Flood Hazard Area");
    expect(wordsOnly).not.toContain("the ring marks the building");
  }, 45000);

  it("gives the memorandum's other photographs a page of their own, each with its page's credit, and none for fewer than two (#459)", async () => {
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
    const photos = [
      { dataUri: tinyDataUri([120, 90, 60]), credit: "From the offering memorandum, page 3" },
      { dataUri: tinyDataUri([60, 90, 120]), credit: "From the offering memorandum, page 7" },
      { dataUri: tinyDataUri([90, 120, 60]), credit: "From the offering memorandum, page 9" },
    ];
    const render = (p: typeof photos | null) =>
      renderToBuffer(
        React.createElement(ReportDocument, {
          input: buildReportData(deal, "September 30, 2026", [], null, undefined, undefined, undefined, undefined, null, null, null, null, null, null, null, null, p),
        }) as unknown as Parameters<typeof renderToBuffer>[0],
      );
    const pagesOf = (buf: Buffer) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const imagesOf = (buf: Buffer) => (buf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
    const buf = await render(photos);
    const text = (await pdfTextOf(buf)).replace(/\s+/g, " ");
    expect(text).toContain("The property");
    expect(text).toContain("3 photographs from the memorandum");
    expect(text).toContain("From the offering memorandum, page 3");
    expect(text).toContain("From the offering memorandum, page 9");
    const without = await render(null);
    expect(pagesOf(buf)).toBe(pagesOf(without) + 1);
    expect(imagesOf(buf) - imagesOf(without)).toBe(3);
    // One photograph is what the memo's cover already prints: no page.
    const one = await render(photos.slice(0, 1));
    expect(pagesOf(one)).toBe(pagesOf(without));
    expect(await pdfTextOf(one)).not.toContain("photographs from the memorandum");
  }, 45000);
});
