// A short-term rental is filed with the hotels (lib/asset-words' lodging
// class, `hospitality_str`), but it is not one: it has no brand, so no
// franchise agreement or property improvement plan, and no STR report (STR
// benchmarks hotels against their competitive set). What it keeps is its
// bookings and the permits it lets under. This reads which one a deal is
// from the deck's own words for its class — "Short-term rental portfolio",
// "Vacation rentals", "Airbnb" — never from the stored class's label
// ("Hospitality / STR" names both, and the extraction is told that label,
// so the deck's class can echo it). A bare "STR" is no short-term rental:
// it is the label's word for both, and the hotel benchmark's name. A phrase
// that also names a hotel, a motel, an inn, hospitality, lodging or a
// resort is a hotel, and so is a deal whose memorandum states a flag or a
// franchise (the hotel reader's `ex.hotel`, audit C10, M2). No imports, so
// the client card reads it.

const STR_WORDS = /\b(?:short[\s-]+term[\s-]+rentals?|vacation[\s-]+rentals?|airbnb|vrbo)\b/i;
const HOTEL_WORDS = /\b(?:hotels?|motels?|inns?|hospitality|lodging|resorts?)\b/i;

/** A stated field that states nothing: blank, "None", "N/A", a dash. */
const STATES_NOTHING = /^\s*(?:|none|n\/?a|not applicable|not stated|[-–—]+)\s*\.?\s*$/i;

/** What the hotel reader reads (lib/anthropic/types `ExtractedHotel`): the
 *  flag as stated ("Independent" where the OM says it carries none) and
 *  the franchise agreement as stated. */
export interface HotelSignal {
  brand?: string | null;
  franchise?: string | null;
}

/** Whether the memorandum states a flag or a franchise: a hotel's, which a
 *  short-term rental never has. "Independent" is no flag. */
export function statesFlagOrFranchise(hotel: HotelSignal | null | undefined): boolean {
  if (!hotel) return false;
  const brand = hotel.brand ?? "";
  const flag = !STATES_NOTHING.test(brand) && !/^\s*independent\b/i.test(brand);
  const franchise = !STATES_NOTHING.test(hotel.franchise ?? "");
  return flag || franchise;
}

/** Whether the deck's words for its class name a short-term rental — never
 *  where the memorandum states a flag or a franchise. */
export function isShortTermRental(classWords: string | null | undefined, hotel?: HotelSignal | null): boolean {
  const s = classWords ?? "";
  return STR_WORDS.test(s) && !HOTEL_WORDS.test(s) && !statesFlagOrFranchise(hotel);
}
