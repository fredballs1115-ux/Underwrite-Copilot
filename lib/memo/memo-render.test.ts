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
  }, 30000);
});
