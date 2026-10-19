import { buildReportData, renderReportPdf, withActuals } from "@/lib/memo/report-document";
import type { MemoCover, MemoData } from "@/lib/memo/memo-document";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { buildSensitivityData, screeningCompareModel } from "@/lib/underwrite/report-grid";
import { bidFloors } from "@/lib/underwrite/solver";
import { buildPlanReport } from "@/lib/plan-sensitivity";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { StructuredAddress } from "@/lib/address";
import type { FloodMapView } from "@/lib/site-flags/core";
import { assessPlausibility, inferStrategy } from "@/lib/deal-strategy";
import { modelReturnsRead } from "@/lib/compare-interest";
import { assumableView, readAssumable } from "@/lib/assumable-debt";
import { readSellerFinancing, sellerFinancingView } from "@/lib/seller-financing";
import { leaseholdExitView, readLeaseholdExit, termReadFor } from "@/lib/leasehold-exit";
import { SALE_HURDLE_PCT, saleCeilingRead } from "@/lib/sale-ceiling";
import { regulationForDeal, regulationShortLine } from "@/lib/rent-regulation";
import { readerDateLong, readerToday } from "@/lib/reader-day";
import { sampleActuals, sampleCover, sampleDocumentChecks, sampleDocumentRow, sampleModelVsMarket, sampleStressTest } from "@/lib/sample-cover";

export const runtime = "nodejs";

// Same once-per-day render cache as the sample memo route: public route,
// pure fixture, and the full report is many pages of @react-pdf work — cache
// the promise so concurrent first hits share one render, clear on failure.
let cachedRender: { day: string; pdf: Promise<Buffer> } | null = null;

/**
 * The full report the signed-in route (app/api/deals/[id]/report) builds for
 * the sample, call for call: the same row, the same model reads off the same
 * derivation, the same arguments to `buildReportData` in the same order,
 * wrapped in `withActuals` with the sample's rent roll and T-12 and drawn
 * by `renderReportPdf` (lib/sample-documents.render.test.ts renders both
 * routes and holds the two PDFs' text equal). What a visitor's copy cannot
 * have, and why, is said where each is set below.
 */
async function renderSampleReport(dateStr: string, readerDay: string): Promise<Buffer> {
  const deal = sampleDocumentRow();
  const extraction = SAMPLE_DEAL.extraction as ExtractionResult;
  const address = SAMPLE_DEAL.address as unknown as StructuredAddress;
  // Its noon, the day every dated reader of the model reads on.
  const readerNoon = new Date(`${readerDay}T12:00:00Z`);

  // The demo mandate, where a signed-in reader's report judges the reader's
  // own box: a visitor has none (lib/sample-cover `sampleDocumentChecks`).
  const buyBoxChecks = sampleDocumentChecks();
  const hurdlePct = SAMPLE_DEMO_BOX.minIrrPct ?? null;
  const floors = bidFloors(SAMPLE_DEMO_BOX);

  // The rent rules, read as the signed-in route reads them — the sample's
  // stored address, on the day the report is dated. The sample's row stores
  // no site flags here: those are a lookup made on the signed-in deal's
  // first view, and a public document makes none.
  const regulationRead = regulationForDeal(
    { extraction, address, siteFlags: null, assetClass: SAMPLE_DEAL.asset_class },
    readerDay,
  );
  let regulation: { line: string; read: string } | null = regulationRead
    ? { line: regulationShortLine(regulationRead), read: "" }
    : null;

  // The real report route's derivation chain, actuals included — the same
  // derivation the demo page and the demo workbook run (lib/sample-derive),
  // so the report's grids, max bid and hurdle verdict are the page's. The
  // sample is never seeded from today's rates (lib/model-market), so the
  // signed-in derivation is this one too.
  const derived = sampleDerivedInputs();
  // The max bid on the demo mandate's floors, as the demo page's
  // playground solves it — the two print one bid — with every gate the
  // signed-in route passes.
  const sensitivity = buildSensitivityData(derived.inputs, hurdlePct, {
    sources: derived.sources,
    floors,
    termRead: termReadFor(extraction),
    occupancyPct: derived.meta.occupancyPct ?? null,
    interest: modelReturnsRead(extraction, screeningCompareModel(derived.inputs)),
    findings: assessPlausibility(extraction, inferStrategy(extraction, null)),
  });
  // Null for the stabilized sample — the plan page only exists on a deal
  // with a plan — but the same call the real route makes.
  const plan = buildPlanReport(
    extraction,
    {
      pct: derived.inputs.exitCapPct,
      provenance: derived.sources.exitCapPct?.provenance ?? "assumption",
    },
    null,
  );
  // Each read the signed-in route makes off the model — none of them
  // reaches the stabilized fee-simple sample today, every one of them would
  // print here as it prints there.
  const assumableRead = readAssumable(extraction, derived.inputs, readerNoon);
  const assumable = assumableRead
    ? assumableView(assumableRead, derived.sources.allInRatePct?.note ?? null, !!derived.meta.rateSeed)
    : null;
  const sellerRead = readSellerFinancing(extraction, derived.inputs);
  const sellerNote = sellerRead
    ? sellerFinancingView(sellerRead, derived.sources.allInRatePct?.note ?? null, !!derived.meta.rateSeed)
    : null;
  const leaseholdRead = readLeaseholdExit(extraction, derived.inputs, readerNoon);
  const leasehold = leaseholdRead ? leaseholdExitView(leaseholdRead) : null;
  const singleTenant = derived.meta.singleTenant ?? null;
  const hotel = derived.meta.hotel ?? null;
  const roster = derived.meta.roster ?? null;
  const valueAdd = derived.meta.valueAdd ?? null;
  const taxAbatement = derived.meta.taxAbatement ?? null;
  const siteReports = derived.meta.siteReports ?? null;
  const student = derived.meta.student ?? null;
  const mh = derived.meta.mh ?? null;
  const storage = derived.meta.storage ?? null;
  const forward = derived.meta.forward ?? null;
  const mixedUse = derived.meta.mixedUse ?? null;
  const goingConcern = derived.meta.goingConcern ?? null;
  const condo = derived.meta.condo ?? null;
  const sandwich = derived.meta.sandwich ?? null;
  regulation = derived.meta.regulation ?? regulation;
  const sale = derived.meta.sale
    ? { line: derived.meta.sale.line, read: saleCeilingRead(extraction, derived.inputs, hurdlePct ?? SALE_HURDLE_PCT, readerNoon) }
    : null;

  // The model's assumptions against the published figures, read today for
  // the market the sample sits in — the signed-in sample's report prints
  // this block, so the visitor's does too. Its own try, as there (lib/
  // sample-cover `sampleModelVsMarket`): a failed live read leaves the
  // grids in place and the block out.
  const assumptions = await sampleModelVsMarket(readerDay);
  // The OM's assumptions tested in code, as the signed-in report builds it
  // for the sample: the same derivation, actuals and published-figure read
  // (lib/sample-cover `sampleStressTest`).
  const stressTest = sampleStressTest(readerDay, assumptions);

  // What a visitor's copy has none of, by design: no firm's branding (a
  // visitor has no account to brand it), no dismissed submarket checks (the
  // reader's own rows), and no flood page or photographs page — the sample
  // has no street address to draw FEMA's map at (lib/sample-deal: never one)
  // and no photographs, so the signed-in sample's report has neither page.
  const branding: MemoData["branding"] = null;
  const overrides: string[] | null = null;
  const floodMap: FloodMapView | null = null;
  const photos: MemoCover[] | null = null;
  // Its first page is the memo, cover and all, as the signed-in sample's
  // report opens on its picture: the aerial the sample memo prints, through
  // the one bounded, validated helper (lib/sample-cover).
  const cover = await sampleCover(readerDay);

  // The sample's rent roll and T-12 against its memorandum: the seed action
  // stores both beside the signed-in sample, whose report wraps its data
  // in `withActuals` and so prints "The actuals" page — this one does too
  // (audit C8, H1).
  const actuals = sampleActuals();

  const input = withActuals(
    buildReportData(deal, dateStr, buyBoxChecks, sensitivity, branding, plan, overrides, cover, assumptions, assumable, leasehold, floodMap, singleTenant, hotel, sale, roster, photos, valueAdd, taxAbatement, sellerNote, siteReports, student, mh, storage, regulation, forward, mixedUse, goingConcern, condo, sandwich, readerDay, stressTest),
    actuals,
  );
  // The sample: its stress test is the first-draft model's run, which the
  // challenger page's heading says (lib/stress-test-title) — the row's
  // `is_sample` says so too.
  return renderReportPdf({ ...input, sample: true });
}

function getSampleReport(dateStr: string, readerDay: string): Promise<Buffer> {
  if (cachedRender && cachedRender.day === readerDay) return cachedRender.pdf;
  const next = {
    day: readerDay,
    pdf: renderSampleReport(dateStr, readerDay).catch((err) => {
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
  // Dated as the signed-in route dates a reader whose browser has not told
  // it a time zone (lib/reader-day), the day its dated lines read on too.
  const now = new Date();
  const dateStr = readerDateLong(null, now);
  const readerDay = readerToday(null, now);

  try {
    const buffer = await getSampleReport(dateStr, readerDay);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="sample-full-report.pdf"',
        // Sample-only output — safe to cache at the edge for a day.
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
