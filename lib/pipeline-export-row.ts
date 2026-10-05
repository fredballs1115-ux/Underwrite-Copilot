// One deal's row in the meeting workbook (lib/pipeline-workbook), read
// through the readers every other surface uses. Pure: the deal row and what
// the route read beside it — the buy box, the latest job, the deadline, the
// teammate's name — come in, so a test reads a row as the route builds it.
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { addressUpgrade, type StructuredAddress } from "@/lib/address";
import { buyBoxCheckSource, evaluateBuyBox, foldBuyBoxChecks, screenYearOf, type BuyBox } from "@/lib/criteria";
import { capSlotWithheld, noteCapSlot, ownYieldText } from "@/lib/compare-interest";
import { findPriceMetric, inferStrategy, planSummary, signalAskPrice } from "@/lib/deal-strategy";
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
import { sandwichTag } from "@/lib/sandwich-lease";
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
   *  it decides the rent allowance in force (lib/rent-regulation), the
   *  clock to a forward purchase's delivery (lib/forward-purchase) and every
   *  other dated cell — what the price buys and a leasehold's years left, a
   *  note's yield to its maturity, a lease's or an abatement's years left */
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
  // The route's day, which every dated cell is read on — the interest's
  // tag, a lease's years left, a note's months to maturity — as the pipeline
  // card reads them on the reader's (the tags had read the clock).
  const asOf = new Date(`${ctx.today}T12:00:00Z`);
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
    // The pipeline card's own price reader: the memorandum's, else the first
    // signal's ask before the extraction lands — only where it is a figure
    // (`signalAskPrice`). A first screen's row had read "—" beside the
    // card's price.
    price: findPriceMetric(metrics, strategy.kind, screenYearOf(extraction))?.value ?? signalAskPrice(signal),
    interest: interestTag(extraction, asOf),
    debt: assumableTag(extraction),
    affordable: affordableTag(extraction),
    tenancy: singleTenantTag(extraction, asOf),
    hotel: hotelTag(extraction, asOf),
    sale: saleTag(extraction, asOf),
    roster: rosterTag(extraction, asOf),
    valueAdd: valueAddTag(extraction),
    abatement: taxAbatementTag(extraction, asOf),
    sellerNote: sellerFinancingTag(extraction),
    reports: siteReportsTag(extraction, asOf),
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
    forward: forwardTag(readForwardPurchase(extraction, asOf, strategy)),
    mixedUse: mixedUseTag(extraction, asOf),
    goingConcern: goingConcernTag(extraction, asOf),
    condo: condoTag(extraction, asOf),
    sandwich: sandwichTag(extraction, asOf),
    // The pipeline card's own cap reader: the memorandum's, else the first
    // signal's (the deal header's fallback, before the extraction lands
    // too); none on a plan deal, none where the slot is withheld — a note,
    // a position, a share beside its entity's loan — and the cell says so.
    cap: statedCapSlot(extraction, plan != null, signal),
    capWithheld: !plan ? capSlotWithheld(extraction) : null,
    // A note's yield to maturity, or a position's to redemption, at its
    // price — the figure the pipeline card shows in the cap slot ("17.0% to
    // maturity"), read on the route's day; the cell had said "n/a — note".
    noteYield: (() => {
      const own = plan ? null : noteCapSlot(extraction, asOf);
      return own?.ytmPct != null ? ownYieldText(own.ytmPct) : null;
    })(),
    // The plan's own figure, unrounded: the workbook writes it into a
    // percent cell, where a string rounded to "6.3%" and read back printed
    // the header's 6.27% as "6.30%".
    yieldOnCost: plan?.yieldOnCost ?? null,
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
