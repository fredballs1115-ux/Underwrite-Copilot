// The three figures a pipeline row shows beside a deal's name — its price,
// its going-in cap and, on a plan deal, its yield on total cost — read
// through the same readers every other surface uses, so the row, the deal
// page, the meeting .xlsx and the analytics agree on which figure a deal
// carries, and what the price buys where it is not the building (#415).
// Pure: no I/O, no LLM.
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { shownAssetClass } from "@/lib/asset-class";
import { findGoingInCap, screenYearOf, unitCountRow } from "@/lib/criteria";
import { findPriceMetric, inferStrategy, planSummary, signalAskPrice, type StrategyKind } from "@/lib/deal-strategy";
import { interestOf, interestTag } from "@/lib/interest";
import { noteCapSlot } from "@/lib/compare-interest";
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
import { selfStorageTag } from "@/lib/self-storage";
import { regulationForDeal, regulationTag, type DealForRegulation } from "@/lib/rent-regulation";
import { forwardTag, readForwardPurchase } from "@/lib/forward-purchase";
import { mixedUseTag } from "@/lib/mixed-use";
import { goingConcernTag } from "@/lib/going-concern";
import { condoTag } from "@/lib/condo";
import { sandwichTag } from "@/lib/sandwich-lease";
import { exchangeForDeal } from "@/lib/exchange-deal";
import type { ExchangeBlock } from "@/lib/exchange-window";
import type { SiteFlagsResult } from "@/lib/site-flags/core";
import type { ListJobStatus } from "@/lib/screen-run";

export interface PipelineSlots {
  /** the going-in cap as the OM states it — null on a plan deal, which has
   *  none (its stabilized cap or yield on cost is the finished project's),
   *  and on a note, whose collateral's cap is not the buyer's (`capWithheld`) */
  cap: string | null;
  /** "note" where the going-in cap is withheld because the price is a
   *  loan's, "position" where it is a preferred equity position's
   *  (lib/compare-interest `noteCapSlot`); absent or null otherwise */
  capWithheld?: "note" | "position" | null;
  /** the buyer's own yield at its price — "13.8%" — in the cap slot: a
   *  note's to maturity where it pays or may, a position's to redemption
   *  where the date has not gone by; absent or null otherwise */
  noteYield?: string | null;
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
  /** a self-storage facility's lease-up, the premium sitting tenants pay
   *  over street and its economic occupancy — "In-place 21.1% over street,
   *  Economic 84%", "Lease-up, 72% occupied" (lib/self-storage
   *  `selfStorageTag`, #471); absent or null on anything else */
  storage?: string | null;
  /** the rent rules that reach the building — "Rent-stabilized, 41 of 48",
   *  "LA RSO, 3% cap", "Rent rules: check" where a regime possibly applies,
   *  "Rent-regulated (OM)" where only the memorandum says so
   *  (lib/rent-regulation `regulationTag`); absent or null where none reaches
   *  it, and where the caller passed no place to read the rules at */
  regulation?: string | null;
  /** a forward purchase or a build-to-suit bought at delivery — "Forward,
   *  delivers Q2 2028", "Build-to-suit, 6.00% at delivery" (lib/forward-
   *  purchase `forwardTag`); absent or null where the buyer is not paying
   *  for a building at its completion */
  forward?: string | null;
  /** a mixed-use building's commercial share — "Commercial 29% of income",
   *  else "Commercial 15% of area" (lib/mixed-use `mixedUseTag`); absent or
   *  null where neither share is read */
  mixedUse?: string | null;
  /** an operating business on its real estate — "Going concern", "Operator
   *  lease, 2.61x coverage", "Operating business" (lib/going-concern
   *  `goingConcernTag`); absent or null where the memorandum names no
   *  operating business and states no EBITDA */
  goingConcern?: string | null;
  /** condominium units bought in bulk — "Bulk 42 of 120 (35%)", "Condo
   *  units" (lib/condo `condoTag`); absent or null where the deal's own words
   *  name no condominium or the memorandum states none of its figures */
  condo?: string | null;
  /** a sandwich position's spread — "Spread $720k, 1.65× cover", "Subleases
   *  under the master rent" (lib/sandwich-lease `sandwichTag`); absent or
   *  null on anything but a master lease of the building whose memorandum
   *  states both rents. Its term is the interest's tag ("Master lease, 15
   *  yrs left") */
  sandwich?: string | null;
  /** the reader's 1031 exchange against the deal — "1031: identify by Oct
   *  30", "1031: offers due after ID", "1031: note — ask counsel"
   *  (lib/exchange-deal); absent or null where the caller passed no
   *  exchange (the reader's buy box holds none, or its period is over). The
   *  box is the reader's: never on the shared screen */
  exchange?: string | null;
  /** the price by the class's own basis, as a listing card shows it —
   *  "$274k/unit", "$200k/key", "$212/SF" (`basisTag`, #469); absent or
   *  null on a conversion or a development (whose basis is the all-in cost,
   *  not the shell's price), a note, the land, a share with no stated
   *  percentage or beside the loan its entity carries (its grossed-up price
   *  is the equity's whole), or where the count or the area is not stated.
   *  A value-add's and a lease-up's is the price over the building as it
   *  stands, never the plan's all-in basis per unit, which the plan's own
   *  facts print under their own label */
  basis?: string | null;
}

const compactUsd = (n: number) =>
  n >= 1e6 ? `$${(Math.round(n / 1e5) / 10).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;

/**
 * The price by the class's own basis — "$274k/unit", "$200k/key", "$212/SF"
 * — read through the comps page's subject reader (lib/comp-detail
 * `subjectBasis`), so the card and the comps' tick agree on the figure: the
 * building's price (a share's grossed up, none for a note, the land or a
 * share beside the loan its entity carries, whose grossed-up price is the
 * equity's whole) over the count in the memorandum's own noun, or over the
 * building's area where the class is priced by the foot. None on a conversion or a
 * development, whose basis is the all-in cost, not the shell's price, and
 * none by the foot on an outdoor-storage yard, which trades by the acre
 * (the deck's own words, lib/deal-strategy `isOutdoorStorageYard`). The
 * class is the deal's one class (`shownAssetClass`): the analyst's where
 * they filed one, the deck's where they left "Auto".
 */
export function basisTag(extraction: ExtractionResult, kind: StrategyKind, storedClass?: string | null): string | null {
  const metrics = extraction.metrics ?? [];
  const words = assetWords(shownAssetClass(storedClass, extraction));
  const b = subjectBasis(metrics, kind, screenYearOf(extraction), interestOf(extraction), extraction.assetClass);
  if (words.basis === "sf") return b.perSf != null ? `$${Math.round(b.perSf).toLocaleString("en-US")}/SF` : null;
  if (words.basis === "unit" && b.perUnit != null) {
    const noun = countNoun(unitCountRow(metrics)?.label, words.key).replace(/s$/, "");
    return `${compactUsd(b.perUnit)}/${noun}`;
  }
  return null;
}

/**
 * The going-in cap the memorandum states, as a pipeline row's Cap slot
 * shows it: none on a plan deal, whose stabilized cap or yield on cost is the
 * finished project's (its slot carries the yield on total cost), and none on
 * a note, whose collateral's cap is not the buyer's figure (lib/compare-
 * interest `noteCapSlot`: its slot carries the note's yield). The compare
 * table reads it where a deal's model has no cap (lib/compare-figures), and
 * the meeting workbook's row reads it too, so the three show one figure.
 */
export function statedCapSlot(extraction: ExtractionResult, planDeal: boolean): string | null {
  const { kind } = interestOf(extraction);
  if (planDeal || kind === "note" || kind === "preferred_equity") return null;
  return findGoingInCap(extraction.metrics ?? [])?.value ?? null;
}

// The asset class a pipeline row shows — the deal's one class — is
// `shownAssetClass` in lib/asset-class, beside the labels it reads, so the
// modules the browser loads (lib/market-memory, through the deal page's
// strip) can file a deal by it without loading every slot reader here.
// Every surface still imports it from here.
export { shownAssetClass };

/**
 * Whether a card's empty slots are still being read rather than not stated:
 * a screen is live (`listJobStatus`'s "running") on a memorandum whose terms
 * nothing has read yet — a first screen before its extraction lands. A
 * figure a finished read did not find keeps its dash, a re-screen's
 * included (its slots are the last finished read's until the new terms
 * land); a deal typed in by hand has no memorandum to read; a stalled run
 * is reading nothing.
 */
export function readingTerms(status: ListJobStatus | undefined, hasExtraction: boolean, hasOm: boolean): boolean {
  return status === "running" && !hasExtraction && hasOm;
}

/** Where a deal is, and the day it is read on, for the slot that reads the
 *  rent rules at the building (lib/rent-regulation): the deal's address as
 *  the page reads it, its stored site flags (the Census place and county are
 *  read only from a lookup answered for that address) and the reader's own
 *  day (lib/reader-day `readerToday`), which decides the allowance in force. */
export interface SlotPlace {
  address: DealForRegulation["address"];
  siteFlags: SiteFlagsResult | null;
  today: string;
}

/** The reader's buy box's 1031 exchange and the deadline the deal carries
 *  (`deals.offers_due`, an ISO day), for the slot that sets the deal against
 *  the exchange's two deadlines (lib/exchange-deal) on the slots' day. Only
 *  the reader's own pages pass it; the box is never the shared screen's. */
export interface SlotExchange {
  block: ExchangeBlock | null | undefined;
  offersDue: string | null;
}

/** The row's slots. `storedClass` is the class the deal was filed under
 *  ("auto" where the analyst left it to the deck), read with the
 *  extraction's through `shownAssetClass` wherever a slot speaks in the
 *  class's terms. Before the extraction lands — a first screen's first
 *  minute — the first signal is all there is: its ask fills the price, as
 *  on the deal page, and every other slot waits for the terms. `place` is
 *  where the deal is and the day it is read on: the rent rules are read only
 *  where it is given, and the slot is null where it is not; a forward
 *  purchase's clock counts from its day, else from the clock's. `exchange`
 *  is the reader's 1031 exchange and the deal's deadline: the exchange slot
 *  is read only where it is given. */
export function pickSlots(
  extraction: ExtractionResult | null,
  signal: FirstSignal | null,
  storedClass?: string | null,
  place?: SlotPlace | null,
  exchange?: SlotExchange | null,
): PipelineSlots {
  if (!extraction) return { cap: null, price: signalAskPrice(signal), yoc: null };
  const metrics = extraction.metrics ?? [];
  // The same read the deal page makes — extraction plus the first signal —
  // so a deal never shows a price on one surface and none on the other.
  const strategy = inferStrategy(extraction, signal);
  const plan = planSummary(extraction, strategy);
  // A note's cap slot (#423's rule): the collateral's cap withheld, the
  // note's yield to maturity in its place where the note pays or may.
  const note = plan ? null : noteCapSlot(extraction);
  // The day a dated slot is read on: the reader's own where the caller
  // hands it (lib/reader-day), else the clock's.
  const asOf = place?.today ? new Date(`${place.today}T12:00:00Z`) : new Date();
  return {
    // The going-in cap only, and only on an operating asset: the same rule
    // the meeting .xlsx, the analytics and the comp memory apply, so a
    // value-add's row shows its yield on cost where the export shows "n/a
    // — plan", never a cap on one and a yield on the other.
    cap: statedCapSlot(extraction, plan != null),
    capWithheld: note ? note.of : null,
    noteYield: note?.ytmPct != null ? `${note.ytmPct.toFixed(1)}%` : null,
    // The shared price reader; on a development with no asking price the
    // land or site cost is what is being bought. The first signal's ask
    // fills the slot before the extraction lands, as on the deal page —
    // only when it is a figure, never an "unpriced" or "call for offers".
    price: findPriceMetric(metrics, strategy.kind, screenYearOf(extraction))?.value ?? signalAskPrice(signal),
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
    // A storage facility's lease-up and the premium over street (#471).
    storage: selfStorageTag(extraction),
    // The rent rules that reach the building, read through the one call
    // every surface makes (lib/rent-regulation `regulationForDeal`): a
    // regime that applies, one to check, or the memorandum's own claim.
    regulation: place
      ? regulationTag(
          regulationForDeal({ extraction, address: place.address, siteFlags: place.siteFlags, assetClass: storedClass ?? null }, place.today),
        )
      : null,
    // A forward purchase (lib/forward-purchase): the price is paid at
    // delivery — the yield then, or the delivery it counts down to — read
    // with the kind the row reads.
    forward: forwardTag(readForwardPurchase(extraction, asOf, strategy)),
    // A mixed-use building's commercial share of the income or the area
    // (lib/mixed-use), each only where both halves are stated.
    mixedUse: mixedUseTag(extraction, asOf),
    // An operating business on its real estate (lib/going-concern): sold
    // with the business, or leased to the operator and its coverage.
    goingConcern: goingConcernTag(extraction, asOf),
    // Condominium units bought in bulk (lib/condo): the units offered of the
    // condominium's, where both are stated.
    condo: condoTag(extraction, asOf),
    // A sandwich position (lib/sandwich-lease): the sublease income less the
    // master rent, and its cover, where both rents are stated.
    sandwich: sandwichTag(extraction, asOf),
    // The reader's 1031 exchange (lib/exchange-deal): the deal's deadline
    // and what its price buys against the exchange's two deadlines.
    exchange: exchange ? (exchangeForDeal(exchange.block, extraction, exchange.offersDue, asOf)?.tag ?? null) : null,
    // The price by the unit or the foot, as a listing card shows it (#469),
    // in the deal's one class.
    basis: basisTag(extraction, strategy.kind, storedClass),
  };
}
