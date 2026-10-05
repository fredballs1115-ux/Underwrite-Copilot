import { compactUsd } from "@/lib/money";
import { floodContextLine, type SiteFlagsResult } from "@/lib/site-flags/core";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { withArticle } from "@/lib/article";
import { askingPriceOf, findPriceMetric, inferStrategy, planSummary, planWithBasisChecked, type StrategyKind } from "@/lib/deal-strategy";
import { priceRange, priceRangeShort, screenYearOf } from "@/lib/criteria";
import { yieldOnCostText } from "@/lib/plan-facts";
import { assetWords } from "@/lib/asset-words";
import { dealTypeLabel, interestContextLine, readInterest } from "@/lib/interest";
import { assumableContextLine, readAssumable } from "@/lib/assumable-debt";
import { affordableContextLine, readAffordable } from "@/lib/affordable";
import { readSingleTenant, singleTenantContextLine } from "@/lib/single-tenant";
import { hotelContextLine, readHotelDeal } from "@/lib/hotel-deal";
import { readSale, saleContextLine } from "@/lib/sale-terms";
import { readRoster, rosterContextLine } from "@/lib/tenant-roster";
import { readValueAdd, valueAddContextLine } from "@/lib/value-add";
import { readTaxAbatement, taxAbatementContextLine } from "@/lib/tax-abatement";
import {
  notePurchaseFinancing,
  notePurchaseFinancingContextLine,
  readSellerFinancing,
  sellerFinancingContextLine,
} from "@/lib/seller-financing";
import { readSiteReports, siteReportsContextLine } from "@/lib/site-reports";
import { readStudentHousing, studentContextLine } from "@/lib/student-housing";
import { mhContextLine, readManufacturedHousing } from "@/lib/manufactured-housing";
import { readSelfStorage, storageContextLine } from "@/lib/self-storage";
import { regulationContextLine, regulationSaidByPark, type RegulationRead } from "@/lib/rent-regulation";
import { forwardContextLine, readForwardPurchase } from "@/lib/forward-purchase";
import { mixedUseContextLine, readMixedUse } from "@/lib/mixed-use";
import { goingConcernContextLine, readGoingConcern } from "@/lib/going-concern";
import { condoContextLine, readCondo } from "@/lib/condo";
import { readSandwichLease, sandwichContextLine } from "@/lib/sandwich-lease";
import { portfolioContextLine, readPortfolio } from "@/lib/portfolio";

const compact = (n: number): string => compactUsd(n);

/**
 * A price the OM states as a range — pricing guidance, a whisper — said once,
 * with the end every figure is struck at (#466): the price readers take its
 * top (lib/criteria `parsePrice`), the end that does not flatter a return,
 * and a step that reads the memorandum's "$40–42M" would otherwise strike its
 * own cap or basis on either end. "" where the price row states one figure.
 * The challenger's notes carry it too (lib/anthropic/pipeline, research pass
 * 41): its BASIS test reads the same "$40–42M".
 */
export function priceRangeLine(extraction: ExtractionResult | null, kind: StrategyKind): string {
  const row = findPriceMetric(extraction?.metrics ?? [], kind, screenYearOf(extraction));
  const r = row ? priceRange(row.value) : null;
  if (!row || !r) return "";
  return `The ${row.label.trim().toLowerCase()} is stated as a range, ${priceRangeShort(r)}: every figure here is struck at its top, ${compact(r.high)}, the end that does not flatter a return.`;
}

/**
 * What the screen established about the deal, in two to four sentences, for
 * every Claude step that reads the OM after the extraction — ask-the-deal,
 * the broker-comp scrutiny, the market check, the reconciler: the deal's
 * strategy and, on a plan deal, the plan's headline figures, the all-in
 * basis per planned unit and the stated timeline. So an answer about "the
 * NOI", or a comp held against "the price", names which figure the OM's
 * number is. A portfolio OM adds a line naming its properties, the markets
 * they sit in and the largest (lib/portfolio). Null when the strategy is
 * unknown and the OM offers one property: nothing established, nothing
 * asserted. Pure — no I/O — so it is testable and the worker can
 * use it.
 *
 * The deal's kind is read with the first signal beside the extraction, as
 * the deal page and the market check's figures read it (lib/deal-strategy
 * `inferStrategy`): a deal only the first signal calls a conversion is a
 * conversion in every step's context, never "Stabilized" in one and a plan
 * in the next. Ask passes the signal and the answered flood zone too, as the
 * pipeline does; it had passed neither, so a deal the signal calls a
 * conversion read "Stabilized" there. A caller with no signal reads as
 * before.
 *
 * The rent regulation (lib/rent-regulation) is read by the caller, which
 * holds what the extraction does not — the deal's address, the Census place
 * and county its answered site flags carry, and its class — through
 * `regulationForDeal`, and handed in: said beside a covenant on the rents,
 * since a regime's allowance, not the market, sets a regulated unit's rent.
 */
export function dealContextFor(
  extraction: ExtractionResult | null,
  site?: { flood?: SiteFlagsResult["flood"]; pointIsBuilding?: boolean } | null,
  signal?: { take?: string; dealName?: string | null } | null,
  regulation?: RegulationRead | null,
): string | null {
  const strategy = inferStrategy(extraction, signal ?? null);
  // A portfolio is said whatever the strategy: several properties in one
  // OM change what every whole-deal figure means (lib/portfolio).
  const portfolio = readPortfolio(extraction);
  // What is being sold is said FIRST whatever the strategy (#414): a note's
  // price or a share's changes what every figure after it means.
  const interest = readInterest(extraction, askingPriceOf(extraction));
  // A sandwich position (lib/sandwich-lease): a master lease of the
  // building, sublet — the sublease income against the master rent, the
  // spread and its cover, and the master lease's end, right after what is
  // being sold, since the position is the income between the two rents.
  const sandwich = readSandwichLease(extraction);
  // The seller's loan, where it is offered for assumption (#417): its terms
  // as stated and what its value turns on, right after what is being sold.
  const assumable = readAssumable(extraction, null);
  // A covenant or a contract that sets the rents (#453): the restricted
  // units' rents move with the limits, not the market, and a gap to market
  // on them is not loss to lease — said before any rent is read.
  const affordable = readAffordable(extraction);
  // One tenant leases the whole property (#454): the lease is the income —
  // its guarantor, its term and its increases — said before any figure is
  // read as a market's.
  const singleTenant = readSingleTenant(extraction);
  // What a hotel is sold with (#455): its flag, its manager, whether the
  // sale is encumbered by them, and the brand's PIP.
  const hotel = readHotelDeal(extraction);
  // How it is sold (#456): an auction's starting bid is not a price, and a
  // receiver, a trustee or a lender never ran the building.
  const sale = readSale(extraction);
  // A forward purchase or a build-to-suit bought at delivery (research pass
  // 28): the price is paid at delivery and the developer funds the works —
  // the clock, the deposit and the yield at delivery, read with the kind
  // the screen reads.
  const forward = readForwardPurchase(extraction, new Date(), strategy);
  // An operating business on its real estate (lib/going-concern): whether
  // the business is sold with it or leased from it, the operator's earnings
  // and their coverage of the rent, the split and the contracts as stated.
  const goingConcern = readGoingConcern(extraction);
  // The listed tenants of a multi-tenant property (#457): how much of the
  // rent rolls before the model's sale, the anchors in and out of the
  // sale, and the rights that ride on them.
  const roster = readRoster(extraction);
  // A value-add renovation program (#460): the doors, what a door costs,
  // the premium and whether it is proven, and the pace turnover allows.
  const valueAdd = readValueAdd(extraction);
  // A property-tax abatement (#461): the NOI is on an abated bill, when it
  // ends and what the owner pays more once it does.
  const abatement = readTaxAbatement(extraction);
  // A note the seller offers to carry (#462): its terms, and what its value
  // turns on — never its rate alone.
  const sellerNote = readSellerFinancing(extraction, null);
  // On a note, the seller's financing is of the note's purchase: said as
  // that, as stated, and never run against the model.
  const noteFinancing = notePurchaseFinancing(extraction);
  // What the third-party reports found (#465): the Phase I, the immediate
  // repairs, the seismic PML and the zoning — each a lender's condition.
  const reports = readSiteReports(extraction);
  // A student building (#468): its pre-leasing against last year's, its
  // beds and its walk to campus.
  const student = readStudentHousing(extraction);
  // A manufactured-housing park (#470): its lot rent against the market's,
  // the homes it owns, the water and sewer it runs and its age restriction.
  const park = readManufacturedHousing(extraction);
  // A self-storage facility (#471): its two occupancies, the rent sitting
  // tenants pay against the street rate and whose platform it rides on.
  const storage = readSelfStorage(extraction);
  // A mixed-use building (lib/mixed-use): its residential and commercial
  // incomes as stated, the commercial share of each and the shops' roll.
  const mixedUse = readMixedUse(extraction);
  // Condominium units bought in bulk (lib/condo): the buyer's share of the
  // association, a year of its dues, a lender's limit on a single owner and
  // the reserves and restrictions as stated.
  const condo = readCondo(extraction);
  // FEMA's flood zone at the building, where the site lookup has answered
  // by the time the step runs (#426): a Special Flood Hazard Area is a
  // premium in the expense line and a lender's condition. The point is the
  // building's only where the lookup recorded it was (the audit's L10).
  const flood = floodContextLine(site?.flood, site?.pointIsBuilding === true);
  // A price stated as a range (#466): which end every figure is struck at.
  const range = priceRangeLine(extraction, strategy.kind);
  const head = [
    // A sandwich position's own read says the master lease's end (and that
    // the position ends with it): the interest's line leaves it to that one.
    ...(interest ? [interestContextLine(interest, { term: !sandwich?.term })] : []),
    ...(sandwich ? [sandwichContextLine(sandwich)] : []),
    ...(sale ? [saleContextLine(sale)] : []),
    ...(range ? [range] : []),
    ...(forward ? [forwardContextLine(forward)] : []),
    ...(goingConcern ? [goingConcernContextLine(goingConcern)] : []),
    ...(assumable ? [assumableContextLine(assumable)] : []),
    ...(sellerNote ? [sellerFinancingContextLine(sellerNote)] : []),
    ...(noteFinancing ? [notePurchaseFinancingContextLine(noteFinancing)] : []),
    ...(affordable ? [affordableContextLine(affordable)] : []),
    // The rent rules that reach the building (lib/rent-regulation): the
    // regime, the regulated share as stated and the allowance in force —
    // never a park's own row said twice (`regulationSaidByPark`).
    ...(regulation && !regulationSaidByPark(regulation, park) ? [regulationContextLine(regulation)] : []),
    ...(singleTenant ? [singleTenantContextLine(singleTenant)] : []),
    ...(roster ? [rosterContextLine(roster)] : []),
    ...(valueAdd ? [valueAddContextLine(valueAdd)] : []),
    ...(abatement ? [taxAbatementContextLine(abatement)] : []),
    ...(hotel ? [hotelContextLine(hotel)] : []),
    ...(student ? [studentContextLine(student)] : []),
    ...(park ? [mhContextLine(park)] : []),
    ...(storage ? [storageContextLine(storage)] : []),
    ...(mixedUse ? [mixedUseContextLine(mixedUse)] : []),
    ...(condo ? [condoContextLine(condo)] : []),
    ...(reports ? [siteReportsContextLine(reports)] : []),
    ...(flood ? [flood] : []),
  ];
  const tail = [...(portfolio ? [portfolioContextLine(portfolio)] : [])];
  if (strategy.kind === "unknown") return head.length || tail.length ? [...head, ...tail].join(" ") : null;
  // No all-in basis where the plausibility check finds it outside the band:
  // its sentence goes to every step in its place (research pass 38).
  const plan = planWithBasisChecked(extraction, strategy, planSummary(extraction, strategy));
  // Whose strategy it is on a note or a leased fee (the deal header's own
  // label): the steps read the type as the collateral's, never the price's.
  // The summary ends its own sentence (research pass 41: a summary with no
  // period of its own ran into "The OM's NOI at delivery…").
  const summary = strategy.summary.trim().replace(/[.\s]+$/, "");
  const lines = [`Deal type: ${dealTypeLabel(strategy.label, extraction)}${summary ? ` — ${summary}.` : "."}`];
  if (plan?.stabilizedNoi && plan.forward) {
    // A forward purchase's NOI is the one stated at delivery (on a
    // build-to-suit the lease's first year), over the price the buyer pays
    // then — its whole cost, since the developer funds the works.
    lines.push(
      `The OM's NOI at delivery (${plan.stabilizedNoi.label}) of ${compact(plan.stabilizedNoi.value)} is the delivered building's figure${
        plan.totalCost != null && plan.yieldOnCost != null
          ? ` — over the ${compact(plan.totalCost)} price, the buyer's whole cost, it is ${withArticle(yieldOnCostText(plan.yieldOnCost))} yield on cost`
          : ""
      }, not today's income.`,
    );
  } else if (plan?.stabilizedNoi) {
    lines.push(
      `The OM's stabilized NOI of ${compact(plan.stabilizedNoi.value)} is the finished project's figure${
        plan.totalCost != null && plan.yieldOnCost != null
          ? ` — over ${compact(plan.totalCost)} of total cost it is ${withArticle(yieldOnCostText(plan.yieldOnCost))} yield on cost`
          : ""
      }, not today's income and not a cap rate on the price.`,
    );
  }
  // A yield no project earns is refused, and said why (research pass 38):
  // "over $49k of total cost it is a 6597.94% yield on cost" had gone to
  // every step.
  if (plan?.yieldWithheld) lines.push(plan.yieldWithheld);
  // A share's price grossed up beside its entity's loan is the equity's
  // whole: the plan strikes no total cost on it, and says why.
  if (plan?.costWithheld) lines.push(plan.costWithheld);
  // A conversion or a development whose memorandum labels no count proposed
  // or planned: no basis per unit, and why.
  if (plan?.costPerUnitWithheld) lines.push(plan.costPerUnitWithheld);
  // A basis outside the band any market delivers at: none, and why
  // (lib/deal-strategy `planWithBasisChecked`).
  if (plan?.basisWithheld) lines.push(plan.basisWithheld);
  if (plan?.costPerUnit != null && plan.units != null) {
    // The basis a comp or a per-unit norm is held against on a plan deal:
    // what a finished unit costs all-in — never the shell's or the land's
    // price over apartments that do not exist yet.
    // In the class's own noun (lib/asset-words): a hotel's plan is costed
    // per key, a student deal's per bed.
    const noun = assetWords(extraction?.assetClass).noun ?? { one: "unit", many: "units" };
    // What the price alone buys, by the kind of plan: a development's land,
    // a conversion's shell, and a value-add's or a lease-up's standing
    // building — never "the shell's" there (research pass 41).
    const priceAlone =
      plan.kind === "development" ? "the land price" : plan.kind === "conversion" ? "the shell's price" : "the price alone";
    lines.push(
      `Total cost is ${compact(plan.costPerUnit)} per planned ${noun.one} (${plan.units.toLocaleString("en-US")} ${noun.many}) — the basis to hold sale comps and per-${noun.one} norms against, never ${priceAlone}.`,
    );
  }
  if (plan?.timeline) lines.push(`Timeline as stated: ${plan.timeline.replace(/\.\s*$/, "")}.`);
  return [...head, ...lines, ...tail].join(" ");
}
