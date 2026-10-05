// What the letter of intent drafts — PURE, and the one reader the deal
// page's LOI panel and the LOI route share, so the panel never promises a
// clause the download lacks.
//
// The deal's kind shapes the paper: a conversion or a development carries an
// entitlements contingency, and every plan deal's diligence names the work
// (lib/loi). The kind is inferred WITH the deal's first signal, as the deal
// page infers it everywhere else. The route had read the extraction alone,
// so a deal its first signal called a conversion read "conversion" on the
// panel — which said the draft "carries an entitlements contingency" — and
// "stabilized" in the route, whose .docx carried no such clause.
//
// What is sold, and how, decides whether the letter is the document at all
// (#414, #456, #411). The draft is a property purchase: the buyer acquires
// the property from its owner for cash at closing and asks for the seller's
// books, records and leases. Four rules.
//
//   THE WRONG DOCUMENT IS REFUSED, WITH THE REASON. A note, a share of the
//   owning entity, a preferred equity position in it and the leased fee are
//   not the property; an auction and a bankruptcy sale are bid for under
//   their own terms, and so is a sale with a stalking-horse bid — priced or
//   not, and whatever method the memorandum names (it had been refused only
//   where the bid parsed as dollars, so "In place — terms in the data room"
//   drafted a purchase from the owner). No draft is made, and the panel and
//   the route say the same one sentence (lib/loi-refusal).
//
//   WHAT THE MEMORANDUM STATES IS SAID, AND NOTHING IS INVENTED. A
//   leasehold's draft names the leasehold interest under its ground lease as
//   what is bought; a receiver's or a lender's sale names that seller; a
//   portfolio's lists its properties by name. Each such line is the
//   memorandum's fact, marked in the draft for review beside its own words —
//   no clause is added for it, since the legal terms are the buyer's
//   counsel's to write.
//
//   A SHORT SALE CLOSES ON ITS LENDER'S APPROVAL. The owner sells for less
//   than its loan's balance, so the sale closes only once its lender
//   approves it and the payoff it will accept (research pass 23). That is
//   the one condition the memorandum's own words add to the paper: the
//   draft makes the closing conditional on it, as a conversion's draft
//   carries an entitlements contingency — a condition, with no figure in
//   it, marked for review beside the memorandum's words.
//
//   A HOTEL'S FLAG WAITS ON ITS FRANCHISOR. Where the memorandum sells a
//   hotel with a flag, a brand encumbrance or a PIP (lib/hotel-deal), the
//   draft notes under its Closing clause what the memorandum says the sale
//   carries, and that the PSA should condition the closing on the
//   franchisor approving the transfer and the PIP as issued (research pass
//   35) — a note for review, with no clause drafted for it.
//
//   A BLANK IS NULL. An extraction saved before the interest or the sale was
//   read is a fee simple sold the usual way, and drafts as before.
//
// The page computes this on the server and hands the panel plain data; the
// route computes it from the same row.

import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { inferStrategy, isPlanDeal, type StrategyKind } from "@/lib/deal-strategy";
import { interestOf, isGpStake, isTenancyInCommon, isWholeShare, readInterest } from "@/lib/interest";
import { readSale, statesStalkingHorse } from "@/lib/sale-terms";
import { readPortfolio } from "@/lib/portfolio";
import { hotelSaleFacts, readHotelDeal } from "@/lib/hotel-deal";
import { LOI_REFUSAL, type LoiRefusalKind } from "@/lib/loi-refusal";

/** A fact the draft takes from the memorandum: its own words where it
 *  states them ("" where not), and its page where the page parses and falls
 *  inside the document ("" otherwise). */
export interface LoiStated {
  stated: string;
  page: string;
}

export interface LoiTerms {
  /** the deal's plan, where it has one: a conversion or a development gets
   *  an entitlements contingency and a diligence clause that names the
   *  work, a value-add or a lease-up names the work only. Null on a
   *  stabilized asset, and on a deal nothing has read yet. */
  plan: { kind: StrategyKind; label: string } | null;
  /** why no letter is drafted for this deal — null where one is */
  refusal: { kind: LoiRefusalKind; sentence: string } | null;
  /** a leasehold: the draft names the leasehold interest under its ground
   *  lease as what is bought */
  leasehold: LoiStated | null;
  /** a seller that is not the owner: the draft names the court-appointed
   *  receiver or the lender that took the property back */
  seller: ({ method: "receivership" | "reo" } & LoiStated) | null;
  /** a short sale: the draft makes the closing conditional on the seller's
   *  lender approving the sale and the payoff it will accept — the sale's
   *  terms as stated beside it */
  shortSale: LoiStated | null;
  /** a hotel with a flag, a brand encumbrance or a PIP: what the memorandum
   *  says the sale carries (lib/hotel-deal `hotelSaleFacts`, our words from
   *  its facts, never a quote) and the hotel's page, for the note under the
   *  draft's Closing clause */
  hotel: LoiStated | null;
  /** a portfolio's properties, in the memorandum's order: the draft lists
   *  them by name ("" for an address the memorandum does not print, or one
   *  that is the name itself) */
  properties: { name: string; address: string }[];
  /** what the draft says differently from the usual letter, a sentence
   *  each, for the panel — each line is marked in the draft for review */
  notes: string[];
}

/** Why the letter is the wrong document for this deal, if it is. */
function refusalOf(ex: ExtractionResult | null | undefined): LoiRefusalKind | null {
  const { kind } = interestOf(ex);
  if (kind === "note") return "note";
  // An undivided interest held as a tenant in common is the real estate's,
  // never an entity's share (research pass 37) — still not the whole
  // property this draft buys.
  // A share of the general partner's interest is a share of a share, said as
  // one (research pass 37).
  // All the tenant-in-common interests are the whole property, conveyed by
  // each co-owner (the audit C3b LOW-1).
  if (kind === "partial_interest") {
    if (isTenancyInCommon(ex)) return isWholeShare(interestOf(ex).sharePct) ? "tic_all" : "tic";
    return isGpStake(ex) ? "gp_stake" : "share";
  }
  // A preferred equity position, its own kind or a share whose rows say one
  // (lib/interest `interestOf`).
  if (kind === "preferred_equity") return "position";
  if (kind === "leased_fee") return "leased_fee";
  const sale = readSale(ex);
  if (sale) {
    if (sale.method === "bankruptcy") return "bankruptcy";
    // An auction's figures make an auction whoever runs it (lib/sale-terms):
    // a receiver's or a lender's sale with a starting bid is bid for too.
    if (sale.method === "auction" || sale.startingBid != null || sale.premium != null || sale.premiumStated) {
      return "auction";
    }
  }
  // A stalking-horse bid the memorandum states, priced or not: higher bids
  // can reopen the sale, whatever method the extraction named.
  if (statesStalkingHorse(ex)) return "bids";
  return null;
}

/** The letter's terms for a deal: its extraction and its first signal, as
 *  the deal row holds them. */
export function loiTermsFor(
  extraction: ExtractionResult | null | undefined,
  signal: FirstSignal | null | undefined,
): LoiTerms {
  const strategy = inferStrategy(extraction ?? null, signal ?? null);
  const plan = isPlanDeal(strategy.kind) ? { kind: strategy.kind, label: strategy.label } : null;
  const refused = refusalOf(extraction);
  if (refused) {
    return {
      plan,
      refusal: { kind: refused, sentence: LOI_REFUSAL[refused] },
      leasehold: null,
      seller: null,
      shortSale: null,
      hotel: null,
      properties: [],
      notes: [],
    };
  }

  // The interest's own sentence and page (lib/interest validates the page
  // against the memorandum's length); the price plays no part here.
  const interest = interestOf(extraction).kind === "leasehold" ? readInterest(extraction, null) : null;
  const leasehold = interest ? { stated: interest.summary, page: interest.page } : null;

  const sale = readSale(extraction);
  const seller =
    sale && (sale.method === "receivership" || sale.method === "reo")
      ? { method: sale.method, stated: sale.terms, page: sale.page }
      : null;
  // The owner sells, but its lender decides: the closing waits on the
  // lender's approval of the sale and the payoff it will accept.
  const shortSale = sale?.method === "short_sale" ? { stated: sale.terms, page: sale.page } : null;

  // A flagged hotel: its franchisor approves the transfer and issues the
  // PIP the buyer funds. The page is the hotel's, else its PIP row's, each
  // validated against the memorandum's length (lib/hotel-deal).
  const hotelRead = readHotelDeal(extraction);
  const hotelFacts = hotelRead ? hotelSaleFacts(hotelRead) : null;
  const hotel = hotelRead && hotelFacts ? { stated: hotelFacts, page: hotelRead.page || hotelRead.pipPage } : null;

  const properties = (readPortfolio(extraction)?.assets ?? []).map((a) => ({
    name: a.name,
    address: a.address && a.address !== a.name ? a.address : "",
  }));

  const notes: string[] = [];
  if (leasehold) {
    notes.push("The memorandum sells a leasehold, so the draft names the leasehold interest under its ground lease as what is bought.");
  }
  if (seller) {
    notes.push(
      seller.method === "receivership"
        ? "A court-appointed receiver is selling it, so the draft names the receiver as the seller."
        : "The lender that took it back is selling it, so the draft names the lender as the seller.",
    );
  }
  if (properties.length) {
    notes.push(`The draft lists the ${properties.length} properties by name, as the memorandum does.`);
  }
  if (shortSale) {
    notes.push(
      "It is a short sale, so the draft makes the closing conditional on the seller's lender approving the sale and the payoff it will accept.",
    );
  }
  if (hotel) {
    notes.push(
      "It is a flagged hotel, so the draft notes under its closing that the PSA should condition the closing on the franchisor approving the transfer and the PIP as issued.",
    );
  }

  return { plan, refusal: null, leasehold, seller, shortSale, hotel, properties, notes };
}
