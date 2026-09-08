// Render smoke test for the redesigned IC memo: react-pdf style mistakes
// (an unsupported prop, a bad style shape) only surface at RENDER time, not
// compile time — so this test renders the real sample memo to real PDF
// bytes, exactly the way the public /api/demo/memo route does. If the memo
// design breaks, this fails in CI instead of at a user's download click.
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { MemoDocument, basePosition, buildMemoData } from "./memo-document";
import { pdfFillCountOf } from "./pdf-text-of";
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
});
