// What a public-web comp candidate says of itself (the comps research pass's
// M15): a search that admits brokerage pages can return a listing, and a
// listing's figure is an ask, not a sale. Read only off the candidate's own
// words — its name, detail, note and source name — never inferred: a
// candidate that does not say "listing", "listed", "asking" or "for sale"
// is not called one.
//
// Pure, no imports.

const LISTING_WORDS = /\b(listings?|listed|asking|for sale|on the market)\b/i;

export function saysListing(c: {
  name?: string | null;
  detail?: string | null;
  note?: string | null;
  sourceName?: string | null;
}): boolean {
  return [c.name, c.detail, c.note, c.sourceName].some((t) => typeof t === "string" && LISTING_WORDS.test(t));
}

/** The line a candidate that says it is a listing carries. */
export const LISTING_NOT_SALE = "Its source calls it a listing: the figure is an ask, not a sale price.";
