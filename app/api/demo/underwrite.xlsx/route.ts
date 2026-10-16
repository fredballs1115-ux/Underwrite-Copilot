import { sampleDerivedInputs } from "@/lib/sample-derive";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import type { ExtractionResult } from "@/lib/anthropic/types";
import type { StructuredAddress } from "@/lib/address";
import type { ExportBranding } from "@/lib/excel-branding";
import { countyOf, placeDeal } from "@/lib/market-county";
import { todayReads } from "@/lib/model-vs-market-read";
import { modelVsMarketFor, type ModelVsMarket } from "@/lib/model-vs-market";
import { readPortfolio } from "@/lib/portfolio";
import { regulationForDeal } from "@/lib/rent-regulation";
import { assessPlausibility, inferStrategy } from "@/lib/deal-strategy";
import { modelReturnsRead } from "@/lib/compare-interest";
import { screeningCompareModel } from "@/lib/underwrite/report-grid";
import { readOmFacts } from "@/lib/underwrite/om-facts";
import { readerToday } from "@/lib/reader-day";

export const runtime = "nodejs";

// The fixture never changes within a day, so build the workbook once per day
// per process and serve the same bytes: this is a public unauthenticated
// route, and Render doesn't edge-cache dynamic responses, so without this
// every request would pay a full ExcelJS build. The promise (not the buffer)
// is cached so concurrent first hits share one build; a failed build clears
// the slot to allow retry. By the day, as the demo memo and report are: the
// cover's "Prepared" date and its dated lines read on it, and the Market
// Read tab is today's.
let cachedBuild: { day: string; xlsx: Promise<Buffer> } | null = null;

/**
 * The workbook the signed-in route (app/api/deals/[id]/underwrite.xlsx)
 * builds for the sample, argument for argument (a test holds the two
 * `buildUnderwriteWorkbook` argument lists equal, as lib/sample-cover's test
 * does for the memo and the report): the OM Facts tab, the Market Read tab,
 * the plausibility findings and what the price buys, on the day it is read.
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

  // The model's assumptions against the published figures, read today for
  // the market the sample sits in. Its own try, as there: a failed live
  // read leaves the tab out, never the workbook.
  let marketRead: ModelVsMarket | null = null;
  try {
    const metro = placeDeal(address, countyOf(address, null)).live;
    marketRead = modelVsMarketFor({
      derived: model,
      extraction,
      firstSignal: null,
      storedAssetClass: SAMPLE_DEAL.asset_class,
      metro,
      reads: await todayReads(metro),
      regulation,
    });
  } catch (err) {
    console.warn("sample workbook market read failed:", err instanceof Error ? err.message : err);
  }

  // The deal page's own reads: its findings (no first signal on the sample)
  // and what the price buys.
  const findings = assessPlausibility(extraction, inferStrategy(extraction, null));
  const interest = modelReturnsRead(extraction, screeningCompareModel(model.inputs), asOf);

  const buffer = await buildUnderwriteWorkbook(model, branding, marketRead, readPortfolio(extraction), asOf, findings, interest, new Date(), readOmFacts(extraction));
  return buffer;
}

function getSampleWorkbook(readerDay: string): Promise<Buffer> {
  if (cachedBuild && cachedBuild.day === readerDay) return cachedBuild.xlsx;
  const next = {
    day: readerDay,
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
  const readerDay = readerToday(null, new Date());
  try {
    const buffer = await getSampleWorkbook(readerDay);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="sample-underwrite-copilot.xlsx"',
        // Fixture-only output — safe to cache at the edge for a day.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("sample workbook build failed", err);
    return new Response("Sample workbook unavailable", { status: 500 });
  }
}
