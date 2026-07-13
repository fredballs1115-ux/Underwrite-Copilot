import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { MemoDocument, buildMemoData } from "@/lib/memo/memo-document";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { evaluateBuyBox } from "@/lib/criteria";
import type { DealRow } from "@/lib/deals";

export const runtime = "nodejs";

/**
 * The sample deal's IC memo as a PUBLIC download — a prospect sees the actual
 * deliverable before creating an account. Pure fixture data (no user rows,
 * no auth), rendered by the same document code the product ships, judged
 * against the same hypothetical mandate the /demo buy-box tab shows.
 */
export async function GET() {
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

  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  try {
    const memo = buildMemoData(deal, dateStr, checks);
    const element = React.createElement(MemoDocument, {
      data: memo,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(element);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="sample-ic-memo.pdf"',
        // Fixture-only output — safe to cache at the edge for a day.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("sample memo render failed", err);
    return Response.redirect(new URL("/demo", process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com"), 302);
  }
}
