// A short-term rental is filed with the hotels (lib/asset-words' lodging
// class, `hospitality_str`), but it is not one: it has no brand, so no
// franchise agreement or property improvement plan, and no STR report (STR
// benchmarks hotels against their competitive set). What it keeps is its
// bookings and the permits it lets under. This reads which one a deal is
// from the deck's own words for its class — "Short-term rental portfolio",
// "Vacation rentals", "Airbnb" — never from the stored class's label
// ("Hospitality / STR" names both). A phrase that also names a hotel, a
// motel or an inn is a hotel. No imports, so the client card reads it.

const STR_WORDS = /\b(?:short[\s-]+term[\s-]+rentals?|vacation[\s-]+rentals?|str|airbnb|vrbo)\b/i;
const HOTEL_WORDS = /\b(?:hotels?|motels?|inns?)\b/i;

/** Whether the deck's words for its class name a short-term rental. */
export function isShortTermRental(classWords: string | null | undefined): boolean {
  const s = classWords ?? "";
  return STR_WORDS.test(s) && !HOTEL_WORDS.test(s);
}
