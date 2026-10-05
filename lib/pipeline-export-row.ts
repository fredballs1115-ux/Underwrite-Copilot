// One deal's row in the meeting workbook (lib/pipeline-workbook), read
// through the readers every other surface uses. Pure: the deal row and what
// the route read beside it — the buy box, the latest job, the deadline, the
// teammate's name — come in, so a test reads a row as the route builds it.
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import { buyBoxCheckSource, evaluateBuyBox, foldBuyBoxChecks, screenYearOf, type BuyBox } from "@/lib/criteria";
import { noteCapSlot } from "@/lib/compare-interest";
import { findPriceMetric, inferStrategy, planSummary } from "@/lib/deal-strategy";
import { dealTypeLabel, interestTag } from "@/lib/interest";
import { assumableTag } from "@/lib/assumable-debt";
import { affordableTag } from "@/lib/affordable";
import { singleTenantTag } from "@/lib/single-tenant";
import { hotelTag } from "@/lib/hotel-deal";
import { saleTag } from "@/lib/sale-terms";
import { rosterTag } from "@/lib/tenant-roster";
import { valueAddTag } from "@/lib/value-add";
import { taxAbatementTag } from "@/lib/tax-abatement";
import { sellerFinancingTag } from "@/lib/seller-financing";
import { siteReportsTag } from "@/lib/site-reports";
import { studentHousingTag } from "@/lib/student-housing";
import { manufacturedHousingTag } from "@/lib/manufactured-housing";
import { selfStorageTag } from "@/lib/self-storage";
import { regulationForDeal, regulationTag } from "@/lib/rent-regulation";
import { forwardTag, readForwardPurchase } from "@/lib/forward-purchase";
import { mixedUseTag } from "@/lib/mixed-use";
import { goingConcernTag } from "@/lib/going-concern";
import { condoTag } from "@/lib/condo";
import type { SiteFlagsResult } from "@/lib/site-flags/core";
import { verdictBehind, type JobLike } from "@/lib/screen-run";
import { shownAssetClass, statedCapSlot } from "@/lib/pipeline-slots";
import type { PipelineExportRow } from "@/lib/pipeline-workbook";

/** The deal columns the workbook's row reads. */
export interface ExportDeal {
  name: string;
  asset_class: string;
  created_at: string;
  verdict: unknown;
  extraction: unknown;
  /** the screen's fast first read (FirstSignal), which the pipeline page
   *  reads beside the extraction for the deal's kind and its buy-box fit */
  first_signal?: unknown;
  /** the deal's address as stored (StructuredAddress), which widens the
   *  buy box's geography as it does on the pipeline page */
  address?: unknown;
  /** the deal's stored site-flags lookup (SiteFlagsResult): the Census place
   *  and county the rent rules read, only where it answered for the address
   *  the deal has now */
  site_flags?: unknown;
  stage: string | null;
}

/** What the route read beside the deal. */
export interface ExportRowContext {
  /** the buy box of the deal's owning scope (its team's, else its owner's) */
  box: BuyBox | null;
  /** the deal's latest job (lib/screen-run) */
  job: JobLike | null | undefined;
  offersDue: string | null;
  /** the teammate who added the deal, where it is not the reader's own */
  addedBy: string | null;
  /** the day the rows are read on, an ISO day — the route's own UTC day:
   *  it decides the rent allowance in force (lib/rent-regulation) and the
   *  clock to a forward purchase's delivery (lib/forward-purchase) */
  today: string;
  /** the moment the rows are read, in ms — a run that stopped making
   *  progress by then is stalled, never "Re-screening" (lib/screen-run
   *  `isStalled`); the caller's clock where it is not given */
  now?: number;
}

export function pipelineExportRow(d: ExportDeal, ctx: ExportRowContext): PipelineExportRow {
  const extraction = d.extraction as ExtractionResult | null;
  const metrics = extraction?.metrics ?? [];
  const signal = (d.first_signal as FirstSignal | null | undefined) ?? null;
  // The deal's kind first, read as the pipeline card and the deal page read
  // it: the extraction and the first signal. A plan deal (value-add,
  // lease-up, conversion, development) has no going-in cap — its stabilized
  // figure is the finished project's, judged on yield on total cost — and a
  // development's price is its land cost when the OM states no asking price.
  const strategy = inferStrategy(extraction ? { ...extraction, metrics } : null, signal);
  const plan = planSummary(extraction ? { ...extraction, metrics } : null, strategy);
  // The buy-box fit on the pipeline page's own inputs: the extraction, else
  // the first signal, with the address widening the geography (a typed
  // line read for its city and state, a blank one the memorandum's), and
  // the inferred kind, so the fit column judges the land cost this row
  // prints as a development's price.
  const address =
    addressUpgrade(d.address, extraction) ?? ((d.address as StructuredAddress | null | undefined) ?? null);
  const source = ctx.box ? buyBoxCheckSource(extraction, signal, address, strategy.kind) : null;
  const fit: PipelineExportRow["fit"] =
    ctx.box && source ? foldBuyBoxChecks(evaluateBuyBox(d.asset_class, source, ctx.box)) : null;
  return {
    name: d.name,
    stage: d.stage ?? "screening",
    // The deal's one class, as every surface shows it: the analyst's where
    // they filed one, the deck's where they left "Auto" — never a dash for a
    // deal the extraction has read.
    assetClass: shownAssetClass(d.asset_class, extraction),
    market: extraction?.market ?? "",
    // Whose strategy it is on a note or a leased fee, as the deal header
    // says it (lib/interest `dealTypeLabel`).
    dealType: strategy.kind === "unknown" ? null : dealTypeLabel(strategy.label, extraction),
    planDeal: plan != null,
    price: findPriceMetric(metrics, strategy.kind, screenYearOf(extraction))?.value ?? null,
    interest: interestTag(extraction),
    debt: assumableTag(extraction),
    affordable: affordableTag(extraction),
    tenancy: singleTenantTag(extraction),
    hotel: hotelTag(extraction),
    sale: saleTag(extraction),
    roster: rosterTag(extraction),
    valueAdd: valueAddTag(extraction),
    abatement: taxAbatementTag(extraction),
    sellerNote: sellerFinancingTag(extraction),
    reports: siteReportsTag(extraction),
    student: studentHousingTag(extraction),
    mh: manufacturedHousingTag(extraction),
    storage: selfStorageTag(extraction),
    // The rent rules that reach the building, read through the one call
    // every surface makes (lib/rent-regulation `regulationForDeal`), at the
    // address the row is placed at, as the pipeline card reads them.
    regulation: regulationTag(
      regulationForDeal(
        {
          extraction,
          address,
          siteFlags: (d.site_flags as SiteFlagsResult | null | undefined) ?? null,
          assetClass: d.asset_class,
        },
        ctx.today,
      ),
    ),
    // A forward purchase (lib/forward-purchase), read on the route's day as
    // the pipeline card reads it on the reader's.
    forward: forwardTag(readForwardPurchase(extraction, new Date(`${ctx.today}T12:00:00Z`), strategy)),
    mixedUse: mixedUseTag(extraction, new Date(`${ctx.today}T12:00:00Z`)),
    goingConcern: goingConcernTag(extraction, new Date(`${ctx.today}T12:00:00Z`)),
    condo: condoTag(extraction, new Date(`${ctx.today}T12:00:00Z`)),
    // The pipeline card's own cap reader: none on a plan deal, none on a
    // note (its collateral's cap is not the buyer's figure, and the cell
    // says the cap is withheld).
    cap: extraction ? statedCapSlot(extraction, plan != null) : null,
    capWithheld: extraction && !plan && noteCapSlot(extraction) ? "note" : null,
    yieldOnCost: plan?.yieldOnCost != null ? `${(plan.yieldOnCost * 100).toFixed(1)}%` : null,
    fit,
    // Judged on the first signal alone until the extraction lands, as the
    // pipeline page marks it (the card's "First read").
    fitFirstRead: fit != null && !extraction && signal != null,
    verdict: (d.verdict as { verdict?: string } | null)?.verdict ?? null,
    verdictBehind: verdictBehind(ctx.job, ctx.now),
    offersDue: ctx.offersDue,
    createdAt: d.created_at,
    addedBy: ctx.addedBy,
  };
}
