import { sampleDerivedInputs } from "@/lib/sample-derive";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { StructuredAddress } from "@/lib/address";
import type { ExportBranding } from "@/lib/excel-branding";
import { countyOf, placeDeal } from "@/lib/market-county";
import { todayReads, type TodayReads } from "@/lib/model-vs-market-read";
import { sampleStressTest } from "@/lib/sample-stress";
import type { StressTest } from "@/lib/stress-test-types";
import { modelVsMarketFor, type ModelVsMarket } from "@/lib/model-vs-market";
import { readPortfolio } from "@/lib/portfolio";
import { regulationForDeal } from "@/lib/rent-regulation";
import { assessPlausibility, inferStrategy } from "@/lib/deal-strategy";
import { modelReturnsRead } from "@/lib/compare-interest";
import { screeningCompareModel } from "@/lib/underwrite/report-grid";
import { readOmFacts } from "@/lib/underwrite/om-facts";
import { readerToday } from "@/lib/reader-day";
import { DEMO_DOC_CACHE_CONTROL, heldRenderFresh, type HeldRender } from "@/lib/demo-doc-cache";

export const runtime = "nodejs";

// Build the workbook once per /demo ISR window per process and serve the
// same bytes inside it (lib/demo-doc-cache, as the demo memo and report
// are): this is a public unauthenticated route, and Render doesn't
// edge-cache dynamic responses, so without this every request would pay a
// full ExcelJS build, while the Market Read tab is today's published
// figures, which a day's hold would leave behind /demo's. The promise (not
// the buffer) is cached so concurrent first hits share one build; a failed
// build clears the slot to allow retry. The cover's "Prepared" date and its
// dated lines read on the reader's day.
let cachedBuild: (HeldRender & { xlsx: Promise<Buffer> }) | null = null;

/**
 * The workbook the signed-in route (app/api/deals/[id]/underwrite.xlsx)
 * builds for the sample, argument for argument (a test holds the two
 * `buildUnderwriteWorkbook` argument lists equal, as lib/sample-cover's test
 * does for the memo and the report): the OM Facts tab, the Market Read tab,
 * the plausibility findings, what the price buys and the Stress Test tab, on
 * the day it is read.
 */
async function buildSampleWorkbook(readerDay: string): Promise<Buffer> {
  const extraction = SAMPLE_DEAL.extraction as ExtractionResult;
  const address = SAMPLE_DEAL.address as unknown as StructuredAddress;
  // Its noon, the day every dated reader of the model reads on.
  const asOf = new Date(`${readerDay}T12:00:00Z`);

  // The rent rules, read as the signed-in route reads them — the sample's
  // stored address, on the day. The sample's row stores no site flags here:
  // those are a lookup made on the signed-in deal's first view, and a public
  // document makes none.
  const regulation = regulationForDeal(
    { extraction, address, siteFlags: null, assetClass: SAMPLE_DEAL.asset_class },
    readerDay,
  );
  // One derivation with the demo page and the demo report (lib/sample-
  // derive), actuals included, told the rent rules and the day as the
  // signed-in route tells it (the cover's lines; no figure moves). The
  // sample is never seeded from today's rates (lib/model-market).
  const model = sampleDerivedInputs({ regulation, asOf });

  // A visitor has no firm to brand the workbook with.
  const branding: ExportBranding | null = null;

  // Today's published figures for the market the sample sits in, read once
  // for the Market Read tab and the stress test. A failed live read leaves
  // the Market Read out and the stress test's published rows unchecked,
  // never the workbook.
  const metro = placeDeal(address, countyOf(address, null)).live;
  let reads: TodayReads | null = null;
  try {
    reads = await todayReads(metro);
  } catch (err) {
    console.warn("sample workbook market read failed:", err instanceof Error ? err.message : err);
  }
  // The model's assumptions against the published figures. Its own try, as
  // there: a failed read leaves the tab out, never the workbook.
  let marketRead: ModelVsMarket | null = null;
  try {
    marketRead = reads
      ? modelVsMarketFor({
          derived: model,
          extraction,
          firstSignal: null,
          storedAssetClass: SAMPLE_DEAL.asset_class,
          metro,
          reads,
          regulation,
        })
      : null;
  } catch (err) {
    console.warn("sample workbook market read failed:", err instanceof Error ? err.message : err);
  }
  // The sample's stress test — lib/sample-stress's one build, the one /demo,
  // the homepage and the signed-in sample's page print — on the same day and
  // the same reads, so the Stress Test tab prints that StressTest.
  let stressTest: StressTest | null = null;
  try {
    stressTest = sampleStressTest({ today: readerDay, reads });
  } catch (err) {
    console.warn("sample workbook stress test failed:", err instanceof Error ? err.message : err);
  }

  // The deal page's own reads: its findings (no first signal on the sample)
  // and what the price buys.
  const findings = assessPlausibility(extraction, inferStrategy(extraction, null));
  const interest = modelReturnsRead(extraction, screeningCompareModel(model.inputs), asOf);

  const buffer = await buildUnderwriteWorkbook(model, branding, marketRead, readPortfolio(extraction), asOf, findings, interest, new Date(), readOmFacts(extraction), stressTest);
  return buffer;
}

function getSampleWorkbook(readerDay: string, now: number): Promise<Buffer> {
  if (cachedBuild && heldRenderFresh(cachedBuild, readerDay, now)) return cachedBuild.xlsx;
  const next = {
    day: readerDay,
    at: now,
    xlsx: buildSampleWorkbook(readerDay).catch((err) => {
      if (cachedBuild === next) cachedBuild = null;
      throw err;
    }),
  };
  cachedBuild = next;
  return next.xlsx;
}

/**
 * The sample deal's live-formula underwriting workbook as a PUBLIC download —
 * the actual deliverable, not a screenshot of it. Pure fixture data through
 * the same derivation + builder the product ships (actuals folded in, so the
 * workbook's base case matches the /demo playground's).
 */
export async function GET() {
  // On the day the signed-in route reads for a reader whose browser has not
  // told it a time zone (lib/reader-day).
  const now = new Date();
  const readerDay = readerToday(null, now);
  try {
    const buffer = await getSampleWorkbook(readerDay, now.getTime());
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="sample-underwrite-copilot.xlsx"',
        // Held as long as /demo's own page is, never a day: its Market Read
        // tab is today's published figures.
        "Cache-Control": DEMO_DOC_CACHE_CONTROL,
      },
    });
  } catch (err) {
    console.error("sample workbook build failed", err);
    return new Response("Sample workbook unavailable", { status: 500 });
  }
}
