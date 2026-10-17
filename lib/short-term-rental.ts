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
// that also names a hotel, a motel or an inn is a hotel; one that names
// hospitality, lodging or a resort beside short-term or vacation rentals by
// name is the rentals ("Short-term rental resort", "Hospitality / short-term
// rental portfolio", audit C11, M4), since those words are the class's label
// and a resort's, not a brand's. A deal whose memorandum states a flag or a
// franchise is a hotel (the hotel reader's `ex.hotel`, audit C10, M2) — but a
// field that negates one ("None (independent)", "No franchise agreement",
// "Unbranded") states none, and a manager's name ("Managed by Vacasa") is no
// flag. No imports, so the client card reads it.

const STR_WORDS = /\b(?:short[\s-]+term[\s-]+rentals?|vacation[\s-]+rentals?|airbnb|vrbo)\b/i;
/** A hotel by name, whatever else the phrase says. */
const HOTEL_WORDS = /\b(?:hotels?|motels?|inns?)\b/i;
// Hospitality, lodging and a resort are a hotel's words only where the
// phrase names no short-term or vacation rental, so STR_WORDS outranks them
// and they are not read here.

/** A stated field that states nothing: blank, "None", "N/A", a dash. */
const STATES_NOTHING = /^\s*(?:|none|n\/?a|not applicable|not stated|[-–—]+)\s*\.?\s*$/i;
/** A field that says there is none: "No franchise agreement", "None
 *  (independent)", "Not flagged", "Non-branded", "N/A — independent". */
const NEGATES = /^\s*(?:no\b|none\b|not\b|non[-\s]?(?:brand|flag|franchis|affiliat)|n\/a\b|un(?:branded|flagged|affiliated)\b)/i;
/** A flag that says the hotel carries none, anywhere in it. */
const NO_FLAG = /\b(?:independent|unbranded|unflagged|unaffiliated|no (?:brand|flag|franchise))\b/i;
/** A manager named where the flag goes: no flag. */
const MANAGER = /^\s*(?:(?:managed|operated|run)\s+by\b|(?:property\s+|third[-\s]party\s+)?manage(?:ment|r)\b|operator\b)/i;

/** What the hotel reader reads (lib/anthropic/types `ExtractedHotel`): the
 *  flag as stated ("Independent" where the OM says it carries none) and
 *  the franchise agreement as stated. */
export interface HotelSignal {
  brand?: string | null;
  franchise?: string | null;
  /** the management as stated: a brand field that only repeats it names
   *  the manager, not a flag */
  management?: string | null;
}

/** Whether the memorandum states a flag or a franchise: a hotel's, which a
 *  short-term rental never has. "Independent", a field that negates one and
 *  a manager's name are no flag. */
export function statesFlagOrFranchise(hotel: HotelSignal | null | undefined): boolean {
  if (!hotel) return false;
  const brand = (hotel.brand ?? "").trim();
  const management = (hotel.management ?? "").trim();
  const flag =
    !STATES_NOTHING.test(brand) &&
    !NEGATES.test(brand) &&
    !NO_FLAG.test(brand) &&
    !MANAGER.test(brand) &&
    !(management !== "" && brand.toLowerCase() === management.toLowerCase());
  const franchiseWords = hotel.franchise ?? "";
  const franchise = !STATES_NOTHING.test(franchiseWords) && !NEGATES.test(franchiseWords) && !/\bno franchise\b/i.test(franchiseWords);
  return flag || franchise;
}

/** Whether the deck's words for its class name a short-term rental — never
 *  where they name a hotel, a motel or an inn, or the memorandum states a
 *  flag or a franchise. */
export function isShortTermRental(classWords: string | null | undefined, hotel?: HotelSignal | null): boolean {
  const s = classWords ?? "";
  return STR_WORDS.test(s) && !HOTEL_WORDS.test(s) && !statesFlagOrFranchise(hotel);
}
