// Render smoke test for the redesigned IC memo: react-pdf style mistakes
// (an unsupported prop, a bad style shape) only surface at RENDER time, not
// compile time — so this test renders the real sample memo to real PDF
// bytes, exactly the way the public /api/demo/memo route does. If the memo
// design breaks, this fails in CI instead of at a user's download click.
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { MemoDocument, buildMemoData } from "./memo-document";
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
});
