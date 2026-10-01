// Why no letter of intent is drafted for a deal — the sentences, and the
// codes the LOI route redirects with. No imports, so the deal page's client
// banner and the panel say the very words the route's reader chose
// (lib/loi-terms).
//
// The draft (lib/loi) is a property purchase: the buyer acquires the
// property from its owner, pays cash at closing, and asks for the seller's
// books, records and leases. Where the memorandum sells something else, or
// sells it some other way, that is the wrong document, and the page says so
// rather than drafting it.

export type LoiRefusalKind = "note" | "share" | "leased_fee" | "auction" | "bankruptcy" | "bids";

/** One sentence a refusal: what the memorandum sells or how, and why this
 *  letter is not the document for it. */
export const LOI_REFUSAL: Record<LoiRefusalKind, string> = {
  note: "No LOI draft here: this memorandum sells a loan secured by the property, not the property — a note is bought under a loan sale agreement, not a property letter of intent.",
  share:
    "No LOI draft here: this memorandum sells a share of the owning entity, not the property — a share is bought under the entity's own agreements, not a property letter of intent.",
  leased_fee:
    "No LOI draft here: this memorandum sells the leased fee — the land under a building someone else owns, with its ground lease — and this draft is written to buy a property outright, with no terms for the lease the land is sold with.",
  auction:
    "No LOI draft here: this memorandum sells the property at auction — it is bid for under the auction's own terms, not offered for in a letter of intent.",
  bankruptcy:
    "No LOI draft here: this memorandum sells the property out of a bankruptcy — the court approves the sale and higher bids can reopen it, so it is bought under the court's process, not a letter of intent.",
  bids: "No LOI draft here: this memorandum states a stalking-horse bid — the property is sold through bidding that higher bids can reopen, not under a letter of intent.",
};

/** The `?error=` code the route redirects with, which the deal page's
 *  banner reads back to the same sentence. */
export const LOI_REFUSAL_CODE: Record<LoiRefusalKind, string> = {
  note: "loinote",
  share: "loishare",
  leased_fee: "loileasedfee",
  auction: "loiauction",
  bankruptcy: "loibankruptcy",
  bids: "loibids",
};

/** The banner's copy for each code: the refusal's own sentence. */
export const LOI_REFUSAL_BANNERS: Record<string, string> = Object.fromEntries(
  (Object.keys(LOI_REFUSAL) as LoiRefusalKind[]).map((k) => [LOI_REFUSAL_CODE[k], LOI_REFUSAL[k]]),
);
