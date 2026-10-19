import "server-only";
// The sample deal's two public documents — /api/demo/memo and
// /api/demo/report — draw their cover, their deal row and their buy-box
// checks from here, so the two cannot disagree with each other or with the
// documents a signed-in reader downloads for the sample. The full report had
// printed no cover at all while the memo beside it printed the aerial
// (home-demo-gap M7): the signed-in sample's report opens on its picture.
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { evaluateBuyBox, type BuyBoxCheck } from "@/lib/criteria";
import { dealCheckSource } from "@/lib/buy-box-chip";
import type { DealRow } from "@/lib/deals";
import type { BrokerCompsResult, ChallengerResult, ExtractionResult, FirstSignal, MarketResult } from "@/lib/anthropic/types";
import type { StructuredAddress } from "@/lib/address";
import { COVER_SIZE, coverFrom } from "@/lib/memo/cover-aerial";
import type { MemoCover } from "@/lib/memo/memo-document";
import { fetchAerialImage } from "@/lib/imagery";
import { actualsFromRows, actualsShortLine, type ActualsRead } from "@/lib/actuals/actuals-read";
import { inferStrategy } from "@/lib/deal-strategy";
import { shownAssetClass } from "@/lib/asset-class";
import { pdfSafe } from "@/lib/memo/pdf-text";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { buildStressTest } from "@/lib/stress-test";
import type { StressTest } from "@/lib/stress-test-types";
import type { ModelVsMarket } from "@/lib/model-vs-market";
import { modelVsMarketFor } from "@/lib/model-vs-market";
import { countyOf, placeDeal } from "@/lib/market-county";
import { todayReads } from "@/lib/model-vs-market-read";
import { regulationForDeal } from "@/lib/rent-regulation";

/** The sample is placed at neighbourhood level on purpose (lib/sample-deal:
 *  never a street address), so its cover is the USGS frame of Brewerytown
 *  itself — a real place, the building invented. Fixed coordinates, no
 *  geocode and no deal row to cache a location on. */
export const SAMPLE_COVER_POINT = { lat: 39.9735, lng: -75.185, precision: "area" as const };

/** One cover a day, shared by the memo and the report: the promise is held
 *  so a memo and a report asked for at once make one USGS request, and a
 *  cover that did not come through is forgotten, so the next document asks
 *  again rather than the day's every document printing without one. */
let held: { day: string; cover: Promise<MemoCover | null> } | null = null;

/**
 * The sample's cover for `day` (an ISO day): the aerial of Brewerytown at
 * the cover's frame, through the same bounded, validated path every memo's
 * cover takes (lib/memo/cover-aerial `coverFrom`: a few seconds and then no
 * cover, the bytes held to `intactImage` before react-pdf sees them, the
 * credit the source's own). Never throws.
 */
export function sampleCover(day: string): Promise<MemoCover | null> {
  if (held && held.day === day) return held.cover;
  const next: { day: string; cover: Promise<MemoCover | null> } = {
    day,
    cover: coverFrom(() =>
      fetchAerialImage(SAMPLE_COVER_POINT, COVER_SIZE).then((res) =>
        res ? { response: res, source: "aerial" as const } : null,
      ),
    ).then((cover) => {
      // Only our own entry — a newer day's may have replaced it.
      if (!cover && held === next) held = null;
      return cover;
    }),
  };
  held = next;
  return next.cover;
}

/** Test tooling: forget the held cover. */
export function forgetSampleCover(): void {
  held = null;
}

/**
 * The sample's row as the signed-in sample's documents read it: the columns
 * the "Try a sample deal" action seeds (app/(app)/deals/actions.ts), the
 * neighbourhood address and `is_sample` included — the memo and the report
 * read the address as stored on the sample and the stress-test heading off
 * the flag. No first signal: the seeded row has none. Built by hand only
 * because the public documents have no row to read.
 */
export function sampleDocumentRow(): DealRow {
  return {
    name: SAMPLE_DEAL.name,
    asset_class: SAMPLE_DEAL.asset_class,
    is_sample: true,
    address: SAMPLE_DEAL.address,
    extraction: SAMPLE_DEAL.extraction,
    challenges: SAMPLE_DEAL.challenges,
    comps: SAMPLE_DEAL.comps,
    market: SAMPLE_DEAL.market,
    reconciliation: SAMPLE_DEAL.reconciliation,
    verdict: SAMPLE_DEAL.verdict,
    first_signal: null,
    prior_screen: null,
  } as unknown as DealRow;
}

/**
 * The sample against the demo mandate, judged on the source the deal page,
 * the signed-in memo and report and the homepage's chip all judge
 * (lib/buy-box-chip `dealCheckSource`: the extraction with the first signal
 * and the structured address folded in). The mandate is the public demo's
 * (`SAMPLE_DEMO_BOX`), where a signed-in reader's documents judge the
 * reader's own box — a deliberate difference: a visitor has none.
 */
export function sampleDocumentChecks(): BuyBoxCheck[] {
  return evaluateBuyBox(
    SAMPLE_DEAL.asset_class,
    dealCheckSource(
      SAMPLE_DEAL.extraction as ExtractionResult,
      null,
      SAMPLE_DEAL.address as unknown as StructuredAddress,
    ),
    SAMPLE_DEMO_BOX,
  );
}

/**
 * The sample's rent roll and T-12 against its memorandum (research pass 24,
 * B3), as the signed-in report and memo read them for the sample: the seed
 * action stores both documents beside the deal (app/(app)/deals/actions.ts,
 * `SAMPLE_DEAL.rentRoll` / `.t12`), and the two routes read them through
 * `actualsFromRows` with the row's kind and class — the same expressions,
 * on the same row (`sampleDocumentRow`). The public report wraps its data in
 * `withActuals` with this, so it carries "The actuals" page the signed-in
 * sample's report carries (audit C8, H1).
 */
export function sampleActuals(): ActualsRead | null {
  const deal = sampleDocumentRow();
  const extraction = (deal.extraction as ExtractionResult | null) ?? null;
  return actualsFromRows(
    extraction,
    inferStrategy(extraction, (deal.first_signal as FirstSignal | null) ?? null),
    shownAssetClass(deal.asset_class as string | null, extraction) || null,
    SAMPLE_DEAL.rentRoll,
    SAMPLE_DEAL.t12,
  );
}

/** The memo's actuals line for the sample, as the signed-in memo route
 *  writes it (`pdfSafe(actualsShortLine(…))`); `renderMemoPdf` drops it
 *  where it would push the one-page memo onto a second page. */
export function sampleActualsLine(): string {
  return pdfSafe(actualsShortLine(sampleActuals()));
}

/**
 * The sample's model against today's published figures, as the signed-in
 * report route reads it for the sample (lib/model-vs-market-read
 * `todayReads` through `modelVsMarketFor`, on the market the sample's
 * stored address places it in): the public report prints the same block.
 * Null where the read fails — the report keeps its grids and leaves the
 * block out, there as here. Never throws.
 */
export async function sampleModelVsMarket(readerDay: string): Promise<ModelVsMarket | null> {
  const deal = sampleDocumentRow();
  const extraction = SAMPLE_DEAL.extraction as ExtractionResult;
  const address = SAMPLE_DEAL.address as unknown as StructuredAddress;
  try {
    const metro = placeDeal(address, countyOf(address, null)).live;
    return modelVsMarketFor({
      derived: sampleDerivedInputs(),
      extraction,
      firstSignal: null,
      storedAssetClass: deal.asset_class as string | null,
      metro,
      reads: await todayReads(metro),
      regulation: regulationForDeal({ extraction, address, siteFlags: null, assetClass: SAMPLE_DEAL.asset_class }, readerDay),
    });
  } catch (err) {
    console.warn("sample report assumptions read failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The sample's stress test (lib/stress-test), as the signed-in routes build
 * it for the sample: the stored results (the challenger, the market check,
 * the memorandum's comps), the stored rent roll and T-12 (`sampleActuals`)
 * and the one derivation every public entry point runs
 * (lib/sample-derive). The memo reads no published figure today, so its
 * test takes none (`modelVsMarket` null); the report hands in the read it
 * already makes. `readOn` is the reader's day.
 */
export function sampleStressTest(readOn: string, modelVsMarket: ModelVsMarket | null = null): StressTest {
  const deal = sampleDocumentRow();
  return buildStressTest({
    extraction: SAMPLE_DEAL.extraction as ExtractionResult,
    firstSignal: null,
    challenger: SAMPLE_DEAL.challenges as ChallengerResult,
    market: SAMPLE_DEAL.market as MarketResult,
    modelVsMarket,
    actuals: sampleActuals(),
    derived: sampleDerivedInputs(),
    storedAssetClass: deal.asset_class as string | null,
    brokerComps: SAMPLE_DEAL.comps as BrokerCompsResult,
    readOn,
  });
}
