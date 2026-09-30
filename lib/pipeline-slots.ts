// The three figures a pipeline row shows beside a deal's name — its price,
// its going-in cap and, on a plan deal, its yield on total cost — read
// through the same readers every other surface uses, so the row, the deal
// page, the meeting .xlsx and the analytics agree on which figure a deal
// carries, and what the price buys where it is not the building (#415).
// Pure: no I/O, no LLM.
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { ASSET_CLASS_LABEL } from "@/lib/asset-class";
import { findGoingInCap, unitCountRow } from "@/lib/criteria";
import { findPriceMetric, inferStrategy, planSummary, signalAskPrice, type StrategyKind } from "@/lib/deal-strategy";
import { interestOf, interestTag } from "@/lib/interest";
import { assetWords, countNoun } from "@/lib/asset-words";
import { subjectBasis } from "@/lib/comp-detail";
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
import { brokerageOf } from "@/lib/offering";
import { studentHousingTag } from "@/lib/student-housing";
import { manufacturedHousingTag } from "@/lib/manufactured-housing";

export interface PipelineSlots {
  /** the going-in cap as the OM states it — null on a plan deal, which has
   *  none (its stabilized cap or yield on cost is the finished project's) */
  cap: string | null;
  price: string | null;
  /** a plan deal's yield on total cost — its answer where a stabilized
   *  asset shows a cap — null for a stabilized asset or an unstated plan */
  yoc: string | null;
  /** what the price buys where it is not the building outright — "49%
   *  share", "Note", "Leasehold", "Leased fee" (lib/interest
   *  `interestTag`); absent or null on a fee simple */
  interest?: string | null;
  /** the seller's loan where it is offered for assumption — "Assumable
   *  3.45%" (lib/assumable-debt `assumableTag`, #419); absent or null
   *  where none is */
  debt?: string | null;
  /** a covenant or a contract that sets the rents — "LIHTC, 75%
   *  restricted", "Section 8, 34% of units" (lib/affordable
   *  `affordableTag`, #453); absent or null on a market-rate deal */
  affordable?: string | null;
  /** one tenant leases the whole property — "Single tenant, 9 yrs left",
   *  "Single tenant, may leave in 4 yrs" (lib/single-tenant
   *  `singleTenantTag`, #454); absent or null otherwise */
  tenancy?: string | null;
  /** what a hotel is sold with — "Mgmt encumbered, PIP $35k/key",
   *  "Unencumbered", "Independent" (lib/hotel-deal `hotelTag`, #455);
   *  absent or null on anything but a hotel */
  hotel?: string | null;
  /** how the property is sold — "Auction, 5% premium", "Receivership
   *  sale", "Bank-owned (REO)" (lib/sale-terms `saleTag`, #456); absent or
   *  null on a negotiated sale */
  sale?: string | null;
  /** a multi-tenant property's listed tenants — "Shadow-anchored", "56%
   *  rolls in 5 yrs" or both (lib/tenant-roster `rosterTag`, #457); absent
   *  or null where the roll is small and every anchor is in the sale */
  roster?: string | null;
  /** a value-add renovation program — "Reno $250/mo, 20% on cost"
   *  (lib/value-add `valueAddTag`, #460); absent or null where the
   *  memorandum states no premium */
  valueAdd?: string | null;
  /** a property-tax abatement — "Tax abated, 4 yrs left, +$450k/yr",
   *  "Abatement ended" (lib/tax-abatement `taxAbatementTag`, #461); absent
   *  or null where the memorandum states none */
  abatement?: string | null;
  /** a note the seller offers to carry — "Seller financing 5.00%"
   *  (lib/seller-financing `sellerFinancingTag`, #462); absent or null
   *  where the memorandum offers none */
  sellerNote?: string | null;
  /** what the third-party reports found — "Phase I: REC", "PML 24%",
   *  "Legal non-conforming", "Repairs $630k" (lib/site-reports
   *  `siteReportsTag`, #465); absent or null where there is nothing to
   *  flag */
  reports?: string | null;
  /** the brokerage offering the deal, as the memorandum prints it —
   *  "CBRE", "Newmark · JLL" (lib/offering `brokerageOf`, #467); absent or
   *  null where it names no firm */
  broker?: string | null;
  /** a student building's pre-leasing — "Pre-leased 87%, +5 pts y/y",
   *  "Drive-to campus" (lib/student-housing `studentHousingTag`, #468);
   *  absent or null on anything else */
  student?: string | null;
  /** a manufactured-housing park's lot rent against the market's and what
   *  it runs — "Lot rent $430 vs $525 mkt, Private water & sewer"
   *  (lib/manufactured-housing `manufacturedHousingTag`, #470); absent or
   *  null on anything else */
  mh?: string | null;
  /** the price by the class's own basis, as a listing card shows it —
   *  "$274k/unit", "$200k/key", "$212/SF" (`basisTag`, #469); absent or
   *  null on a plan deal, a note, the land, a share with no stated
   *  percentage, or where the count or the area is not stated */
  basis?: string | null;
}

const compactUsd = (n: number) =>
  n >= 1e6 ? `$${(Math.round(n / 1e5) / 10).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;

/**
 * The price by the class's own basis — "$274k/unit", "$200k/key", "$212/SF"
 * — read through the comps page's subject reader (lib/comp-detail
 * `subjectBasis`), so the card and the comps' tick agree on the figure: the
 * building's price (a share's grossed up, none for a note or the land)
 * over the count in the memorandum's own noun, or over the building's
 * area where the class is priced by the foot. None on a conversion or a
 * development, whose basis is the all-in cost, not the shell's price.
 */
export function basisTag(extraction: ExtractionResult, kind: StrategyKind): string | null {
  const metrics = extraction.metrics ?? [];
  const words = assetWords(extraction.assetClass);
  const b = subjectBasis(metrics, kind, interestOf(extraction));
  if (words.basis === "sf") return b.perSf != null ? `$${Math.round(b.perSf).toLocaleString("en-US")}/SF` : null;
  if (words.basis === "unit" && b.perUnit != null) {
    const noun = countNoun(unitCountRow(metrics)?.label, words.key).replace(/s$/, "");
    return `${compactUsd(b.perUnit)}/${noun}`;
  }
  return null;
}

/**
 * The asset class a pipeline row shows. A deal created with "Auto-detect"
 * keeps "auto" in its column, and what the deck turned out to be lives in
 * the extraction — so the row shows that read, and shows nothing (no rail,
 * no dot, a dash) while nothing has read the deck yet. "Auto" was never an
 * asset class, and a row that said so read as one.
 *
 * A known class comes back as its key, whatever its case, so the filter
 * and the colour rail match it; a class the model phrased itself keeps
 * its case — "NNN retail" is not "Nnn retail" — and `assetClassLabel`
 * only raises its first letter.
 */
export function shownAssetClass(
  stored: string | null | undefined,
  extraction: { assetClass?: string | null } | null | undefined,
): string {
  const norm = (v: string | null | undefined): string => {
    const t = (v ?? "").trim();
    const lower = t.toLowerCase();
    if (!t || lower === "auto") return "";
    return ASSET_CLASS_LABEL[lower] ? lower : t;
  };
  return norm(stored) || norm(extraction?.assetClass);
}

export function pickSlots(extraction: ExtractionResult, signal: FirstSignal | null): PipelineSlots {
  const metrics = extraction.metrics ?? [];
  // The same read the deal page makes — extraction plus the first signal —
  // so a deal never shows a price on one surface and none on the other.
  const strategy = inferStrategy(extraction, signal);
  const plan = planSummary(extraction, strategy);
  return {
    // The going-in cap only, and only on an operating asset: the same rule
    // the meeting .xlsx, the analytics and the comp memory apply, so a
    // value-add's row shows its yield on cost where the export shows "n/a
    // — plan", never a cap on one and a yield on the other.
    cap: plan ? null : (findGoingInCap(metrics)?.value ?? null),
    // The shared price reader; on a development with no asking price the
    // land or site cost is what is being bought. The first signal's ask
    // fills the slot before the extraction lands, as on the deal page —
    // only when it is a figure, never an "unpriced" or "call for offers".
    price: findPriceMetric(metrics, strategy.kind)?.value ?? signalAskPrice(signal),
    yoc: plan?.yieldOnCost != null ? `${(plan.yieldOnCost * 100).toFixed(1)}%` : null,
    // A share's price, a note's or the land's under a ground lease is not
    // the building's, and the row says so beside the figure.
    interest: interestTag(extraction),
    // Debt a buyer can take over is a screening fact of its own in 2026:
    // the row says so beside the price, and the deal page prices it.
    debt: assumableTag(extraction),
    // A restricted building's rents move with the limits, not the market:
    // the row says so beside the price, where a scan of the pipeline reads.
    affordable: affordableTag(extraction),
    // One lease is the whole income: the row says how long it has left.
    tenancy: singleTenantTag(extraction),
    // A hotel's contracts and its PIP change what the price buys.
    hotel: hotelTag(extraction),
    // An auction's price is whatever clears; a court's or a lender's sale
    // is as-is — said beside the price.
    sale: saleTag(extraction),
    // A shadow anchor is not bought, and a roll inside the hold is the
    // income the model counts and the buyer may not have.
    roster: rosterTag(extraction),
    // A renovation program's premium and its return on cost (#460).
    valueAdd: valueAddTag(extraction),
    // The NOI is on an abated tax bill that ends (#461): how long it has,
    // and what the owner pays more once it does.
    abatement: taxAbatementTag(extraction),
    // A note the seller will carry, and its rate (#462).
    sellerNote: sellerFinancingTag(extraction),
    // The most serious thing the third-party reports found (#465).
    reports: siteReportsTag(extraction),
    // Who is selling it (#467): the brokerage the memorandum names.
    broker: brokerageOf(extraction),
    // A student building's pre-leasing against last year's (#468).
    student: studentHousingTag(extraction),
    // A park's lot rent against the market's, and its private utilities
    // (#470).
    mh: manufacturedHousingTag(extraction),
    // The price by the unit or the foot, as a listing card shows it (#469).
    basis: basisTag(extraction, strategy.kind),
  };
}
