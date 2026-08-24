import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildReportData, ReportDocument } from "@/lib/memo/report-document";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { evaluateBuyBox } from "@/lib/criteria";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildSensitivityData } from "@/lib/underwrite/report-grid";
import type { DealRow } from "@/lib/deals";
import type { ExtractionResult } from "@/lib/anthropic/types";

export const runtime = "nodejs";

// Same once-per-day render cache as the sample memo route: public route,
// pure fixture, and the full report is ~7 pages of @react-pdf work — cache
// the promise so concurrent first hits share one render, clear on failure.
let cachedRender: { dateStr: string; pdf: Promise<Buffer> } | null = null;

function getSampleReport(dateStr: string): Promise<Buffer> {
  if (cachedRender && cachedRender.dateStr === dateStr) return cachedRender.pdf;

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

  // The real report route's derivation chain, minus the per-user actuals
  // (the public sample has no rent roll / T-12 rows): extraction → model
  // inputs → both heat grids, graded against the demo mandate's IRR target.
  const derived = deriveUnderwriteInputs(
    SAMPLE_DEAL.extraction as ExtractionResult,
    SAMPLE_DEAL.name,
  );
  const sensitivity = buildSensitivityData(
    derived.inputs,
    SAMPLE_DEMO_BOX.minIrrPct ?? null,
  );

  const input = buildReportData(deal, dateStr, checks, sensitivity);
  const element = React.createElement(ReportDocument, {
    input,
  }) as unknown as Parameters<typeof renderToBuffer>[0];
  const next = {
    dateStr,
    pdf: renderToBuffer(element).catch((err) => {
      if (cachedRender === next) cachedRender = null;
      throw err;
    }),
  };
  cachedRender = next;
  return next.pdf;
}

/**
 * The sample deal's FULL screening report as a PUBLIC download — the
 * multi-page artifact behind the one-page memo: sensitivity grids, every
 * extracted term with its basis, the grilled assumptions, the rated comp
 * set, market checks, and the OM-vs-your-model reconciliation. Pure fixture
 * data rendered by the same document code the product ships.
 */
export async function GET() {
  const dateStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  try {
    const buffer = await getSampleReport(dateStr);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="sample-full-report.pdf"',
        // Fixture-only output — safe to cache at the edge for a day.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("sample report render failed", err);
    return Response.redirect(
      new URL(
        "/demo",
        process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com",
      ),
      302,
    );
  }
}
