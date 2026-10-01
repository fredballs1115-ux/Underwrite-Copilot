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
// books, records and leases. Three rules.
//
//   THE WRONG DOCUMENT IS REFUSED, WITH THE REASON. A note, a share of the
//   owning entity and the leased fee are not the property; an auction and a
//   bankruptcy sale are bid for under their own terms, and so is a sale with
//   a stalking-horse bid. No draft is made, and the panel and the route say
//   the same one sentence (lib/loi-refusal).
//
//   WHAT THE MEMORANDUM STATES IS SAID, AND NOTHING IS INVENTED. A
//   leasehold's draft names the leasehold interest under its ground lease as
//   what is bought; a receiver's or a lender's sale names that seller; a
//   portfolio's lists its properties by name. Each such line is the
//   memorandum's fact, marked in the draft for review beside its own words —
//   no clause is added for it, since the legal terms are the buyer's
//   counsel's to write.
//
//   A BLANK IS NULL. An extraction saved before the interest or the sale was
//   read is a fee simple sold the usual way, and drafts as before.
//
// The page computes this on the server and hands the panel plain data; the
// route computes it from the same row.

import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { inferStrategy, isPlanDeal, type StrategyKind } from "@/lib/deal-strategy";
import { interestOf, readInterest } from "@/lib/interest";
import { readSale } from "@/lib/sale-terms";
import { readPortfolio } from "@/lib/portfolio";
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
  if (kind === "partial_interest") return "share";
  if (kind === "leased_fee") return "leased_fee";
  const sale = readSale(ex);
  if (!sale) return null;
  if (sale.method === "bankruptcy") return "bankruptcy";
  // An auction's figures make an auction whoever runs it (lib/sale-terms):
  // a receiver's or a lender's sale with a starting bid is bid for too.
  if (sale.method === "auction" || sale.startingBid != null || sale.premium != null || sale.premiumStated) {
    return "auction";
  }
  if (sale.stalkingHorse != null) return "bids";
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

  return { plan, refusal: null, leasehold, seller, properties, notes };
}
