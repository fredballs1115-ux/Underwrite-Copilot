// The sample's IC memo as data: the inputs the public memo download
// (app/api/demo/memo/route.ts) hands `buildMemoData` — the sample's stored
// results and its checks against the public sample's buy box — so a page
// that previews the memo (the homepage's artifact tile, app/memo-preview)
// draws the memo's own words and figures, never a drawing of a memo.
// Server-only, as the memo document is. The download adds the cover
// picture, which it fetches; a preview carries none.
import { buildMemoData, type MemoData } from "@/lib/memo/memo-document";
import { evaluateBuyBox } from "@/lib/criteria";
import type { DealRow } from "@/lib/deals";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";

export function sampleMemoData(dateStr: string): MemoData {
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
  return buildMemoData(deal, dateStr, checks, null, null, null);
}
