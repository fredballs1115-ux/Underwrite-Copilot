// Manufactured housing (#470) — a park of home sites, most of them leased to
// the people who own the homes on them. The screen read a park as an
// apartment building counted in pads: the lot rent against the market's,
// the homes the park owns, the water and sewer it may run itself and the
// age restriction it may carry were in none of its surfaces.
//
// Pure — no I/O, no model call. The extraction files the figures as rows of
// their own, each only as stated: "Pads" (the count), "Occupied pads",
// "Lot rent" (the average monthly lot rent in place), "Market lot rent",
// "Park-owned homes", "Tenant-owned homes", "Park-owned home rent" (a home
// and its lot together, a month), "Water and sewer" (the source), "Utility
// billing" (who pays for it), "Age restriction", "RV sites" and "Rent
// control".
//
// Six rules.
//
// THE LOT IS THE ASSET. A resident who owns the home pays to keep it on the
// land, and moving it costs thousands, so the lot rent is the durable
// income. A park-owned home is occupancy the park bought: a house it rents
// out, repairs and turns over, whose rent above its lot's is the home's
// income rather than the land's — and lenders commonly count that income
// apart from the lots', or limit how much of it they count. The share of
// the pads the park's own homes stand on is said, and so is the most of
// the occupancy they can be (every one of them rented).
//
// THE GAP TO MARKET IS THE UPSIDE, AND IT CLOSES SLOWLY. The memorandum's
// market lot rent against the average in place is the value-add, said a
// month, as a share and a year across the occupied pads. A range is read at
// its low end, the smaller gap. Each increase runs through the notice the
// law requires, and through the rent rules where the memorandum names any.
//
// A VACANT PAD NEEDS A HOME. It earns nothing until a home is bought and set
// on it, by the park or by a buyer: the fill is a home, not a lease.
//
// A PRIVATE UTILITY IS THE PARK'S TO RUN. Wells, septic fields, a package
// treatment plant or a lagoon are a water utility the owner permits, tests
// and replaces, a capital item the lot rent never shows; city water and
// sewer is none of it. Read only from words that name a source, the water
// and the sewer apart.
//
// AN AGE RESTRICTION IS A NARROWER POOL, KEPT BY A RULE. A 55+ park keeps
// its Fair Housing Act exemption only while at least 80% of its occupied
// homes have a resident 55 or older.
//
// A BLANK IS NULL. An RV site is never a pad, and no count is derived from
// another the memorandum does not state.

import type { ExtractionResult } from "@/lib/anthropic/types";
import { assetClassKey } from "@/lib/asset-words";
import { parseCount, parsePct, priceRange } from "@/lib/criteria";
import { askingPriceOf, buildingPriceOf } from "@/lib/deal-strategy";
import { parsePageNumber } from "@/lib/facts";

type Row = { label: string; value: string; page?: string };
const isRow = (m: unknown): m is Row =>
  !!m && typeof m === "object" && typeof (m as Row).label === "string" && typeof (m as Row).value === "string";
const NOT_STATED = /^(?:n\/?a|not\s+(?:applicable|stated|provided|available|disclosed)|unknown|tbd|[-–—])?\.?$/i;

const SITE = String.raw`(?:pads?|lots?|(?:home\s*)?sites?|(?:home\s+)?spaces?)`;
const PADS = new RegExp(
  String.raw`^(?:total\s+)?(?:(?:mh|manufactured[- ]home|mobile[- ]home)\s+)?${SITE}\b(?!.*\b(?:per|rents?|occupied|vacant|rv|size|area|acres?|proposed|planned|expansion|owned|premium)\b)`,
  "i",
);
const OCCUPIED = new RegExp(String.raw`^occupied\s+${SITE}\b`, "i");
const OCCUPANCY = /^(?:(?:pad|lot|site|space|physical)\s+)?occupancy\b(?!.*\b(?:stabilized|projected|pro\s*forma|economic|rv|home)\b)/i;
const LOT_RENT = /^(?:(?:average|avg\.?|in-?place|current|monthly)\s+)*(?:lot|pad|site|space)\s+rents?\b(?!.*\b(?:market|increases?|growth|proposed|pro\s*forma|control|regulation|stabilization)\b)/i;
const MARKET_LOT_RENT = /^market\s+(?:lot|pad|site|space)\s+rents?\b|^(?:lot|pad|site|space)\s+rents?\b.*\bmarket\b/i;
const PARK_OWNED = /^(?:(?:park|community)[- ]owned\s+homes?|poh|rental\s+homes?)\b(?!.*\brents?\b)/i;
const RESIDENT_OWNED = /^(?:(?:tenant|resident)[- ]owned\s+homes?|toh)\b/i;
const HOME_RENT = /^(?:average\s+)?(?:(?:park|community)[- ]owned\s+home|poh|rental\s+home|home)\s+rents?\b/i;
const WATER_SEWER = /^(?:water\s*(?:and|&|\/)\s*sewer|utilities|water|sewer|wastewater|utility\s+(?:service|infrastructure|systems?))\b(?!.*\b(?:billing|billed|bill-?back|expenses?|costs?|paid|reimbursements?)\b)/i;
const UTILITY_BILLING = /^(?:(?:utility|utilities|water(?:\s*(?:and|&|\/)\s*sewer)?)\s+(?:billing|bill-?backs?|reimbursements?|billed)|rubs|sub-?meter(?:ing|ed)?)\b/i;
const AGE = /^(?:age\s+(?:restrictions?|restricted|designation|qualified|qualification)|age-restricted|community\s+type|resident\s+age)\b/i;
const RV_SITES = /^(?:rv|r\.v\.)\s+(?:sites?|pads?|spaces?|lots?)\b(?!.*\b(?:rents?|rates?|income|occupied)\b)/i;
const RENT_CONTROL = /^(?:(?:lot\s+)?rent\s+(?:control|stabilization|regulation)s?)\b/i;

/** A row a utility label names is read only where its words name a source:
 *  a "Utilities" or "Water" row carrying a dollar expense is none. */
const namesSource = (value: string) => {
  const u = readUtilities(value);
  return u.water != null || u.sewer != null;
};

/** The rows a key-terms block leads with on a park: the lot rent and the
 *  market's, the park-owned homes, the water and sewer and the age
 *  restriction. */
export function mhTermRows<M extends { label: string; value: string }>(metrics: ReadonlyArray<M>): M[] {
  const rows = metrics.filter((m) => isRow(m) && !NOT_STATED.test(m.value.trim()));
  const pick = (re: RegExp, ok: (m: M) => boolean = () => true) => rows.find((m) => re.test(m.label.trim()) && ok(m));
  return [
    pick(LOT_RENT),
    pick(MARKET_LOT_RENT),
    pick(PARK_OWNED),
    pick(WATER_SEWER, (m) => namesSource(m.value)),
    pick(AGE),
  ].filter((m): m is M => m != null);
}

export type UtilitySource = "public" | "private";

export interface MhUtilities {
  stated: string;
  water: UtilitySource | null;
  sewer: UtilitySource | null;
  /** both public; any private and none public; one of each */
  kind: "public" | "private" | "mixed" | null;
  /** "Public water & sewer", "Public water, private sewer" (`utilityLabel`);
   *  "" where the words name no source */
  label: string;
  /** who pays for water and sewer, where the words say */
  billing: "residents" | "park" | null;
  billingStated: string;
}

const PUBLIC_WORD = String.raw`(?:city|municipal|public|county|town|village|borough|township)`;
const PRIVATE_WORD = String.raw`(?:private|privately[- ]owned|on-?site|park[- ]owned|community[- ]owned)`;
const BOTH = String.raw`(?:water\s*(?:and|&|\/)\s*(?:sewer|wastewater)|utilities|utility\s+systems?)`;

/** Who pays for the water and sewer, where the words say: "billed back",
 *  "submetered" and "residents pay" are the residents; "included in the lot
 *  rent" and "owner-paid" the park. The park's words are read first, so
 *  "not billed back" is the park's. */
function billingOf(stated: string): MhUtilities["billing"] {
  const s = stated.toLowerCase();
  if (
    /\b(?:included\s+in\s+(?:the\s+)?(?:lot\s+|pad\s+|site\s+)?rents?|owner[- ]paid|landlord[- ]paid|paid\s+by\s+(?:the\s+)?(?:owner|park|community|landlord)|(?:park|community|owner|landlord)\s+pays|not\s+(?:billed\s+back|sub-?metered|reimbursed)|no\s+(?:bill-?backs?|reimbursements?|sub-?meters?))\b/.test(s)
  )
    return "park";
  if (
    /\b(?:billed\s+back|bill-?backs?|sub-?meter(?:ed|ing|s)?|rubs|individually\s+metered|direct(?:ly)?\s+(?:metered|billed)|(?:residents?|tenants?)\s+(?:pay|are\s+billed|reimburse)|reimbursed\s+by\s+(?:the\s+)?(?:residents?|tenants?)|paid\s+(?:directly\s+)?by\s+(?:the\s+)?(?:residents?|tenants?))\b/.test(s)
  )
    return "residents";
  return null;
}

/**
 * The water and the sewer, each public or the park's own, from words that
 * name the source: "City water and sewer", "Private well and septic",
 * "Municipal water; package treatment plant". A negated source ("no
 * septic") is dropped rather than read, and where the words name both, the
 * park's own wins — the side that does not flatter the buyer.
 */
export function readUtilities(stated: string, billingStated = ""): MhUtilities {
  const s = ` ${stated.toLowerCase()} `.replace(/\b(?:no|not|without|never)\b[^;,.()—–]*/g, " ");
  const has = (re: string) => new RegExp(re, "i").test(s);
  const bothPublic = has(String.raw`\b${PUBLIC_WORD}\s+${BOTH}\b`);
  const bothPrivate = has(String.raw`\b${PRIVATE_WORD}\s+${BOTH}\b`) || has(String.raw`\bwells?\s*(?:and|&|\/)\s*septic\b`);
  const waterPrivate =
    bothPrivate ||
    has(String.raw`\b${PRIVATE_WORD}\s+(?:water|wells?)\b`) ||
    has(String.raw`\bwells\b|\bwell\s+(?:water|system|field)\b|\b(?:served\s+by|on)\s+(?:an?\s+)?(?:private\s+|on-?site\s+)?wells?\b|\bwater\s+(?:from|by|via)\s+(?:an?\s+)?(?:private\s+|on-?site\s+)?wells?\b`);
  const waterPublic = bothPublic || has(String.raw`\b${PUBLIC_WORD}\s+water\b`);
  const sewerPrivate =
    bothPrivate ||
    has(String.raw`\bseptic\b|\bpackage[d]?\s+(?:(?:wastewater\s+)?treatment\s+)?plant\b|\b(?:wastewater|sewage|sewer)\s+treatment\s+plant\b|\blagoons?\b`) ||
    has(String.raw`\b${PRIVATE_WORD}\s+(?:sewer|sewage|wastewater)\b`);
  const sewerPublic = bothPublic || has(String.raw`\b${PUBLIC_WORD}\s+(?:sewer|sewage|wastewater)\b`);
  const water: UtilitySource | null = waterPrivate ? "private" : waterPublic ? "public" : null;
  const sewer: UtilitySource | null = sewerPrivate ? "private" : sewerPublic ? "public" : null;
  const anyPrivate = water === "private" || sewer === "private";
  const anyPublic = water === "public" || sewer === "public";
  const kind = anyPrivate ? (anyPublic ? "mixed" : "private") : anyPublic ? "public" : null;
  const billingWords = billingStated.trim();
  const read: MhUtilities = {
    stated: stated.trim(),
    water,
    sewer,
    kind,
    label: "",
    billing: billingOf(billingWords) ?? billingOf(stated),
    billingStated: billingWords,
  };
  read.label = utilityLabel(read);
  return read;
}

const capFirst = (s: string) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);

/** "Public water & sewer", "Private water & sewer", "Public water, private
 *  sewer", "Private sewer": the source of each the words name. */
export function utilityLabel(u: MhUtilities): string {
  if (u.water && u.water === u.sewer) return `${capFirst(u.water)} water & sewer`;
  return capFirst([u.water ? `${u.water} water` : "", u.sewer ? `${u.sewer} sewer` : ""].filter(Boolean).join(", "));
}

/** The private part alone, for a tag: "Private water & sewer", "Private
 *  sewer"; null where nothing is the park's own. */
function privateLabel(u: MhUtilities | null): string | null {
  if (!u) return null;
  if (u.water === "private" && u.sewer === "private") return "Private water & sewer";
  if (u.water === "private") return "Private water";
  if (u.sewer === "private") return "Private sewer";
  return null;
}

/**
 * A monthly rent as stated — "$430", "$430 per month", "$5,160 a year" (a
 * twelfth of it) — to the cent. Null for a range, which is not an average,
 * and for a figure outside $50 to $5,000 a month.
 */
export function monthlyRentOf(stated: string): number | null {
  if (priceRange(stated)) return null;
  const m = /\$\s*(\d[\d,]*(?:\.\d{1,2})?)/.exec(stated) ?? /(?:^|\s)(\d[\d,]*(?:\.\d{1,2})?)(?!\s*%)/.exec(stated);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  const monthly = /\b(?:mo|month|monthly)\b/i.test(stated);
  if (!monthly && /\b(?:yr|year|annual|annually|per\s+annum)\b/i.test(stated)) n /= 12;
  n = Math.round(n * 100) / 100;
  return Number.isFinite(n) && n >= 50 && n <= 5_000 ? n : null;
}

/** A market rent's range read at its low end — the smaller gap, the side
 *  that does not flatter the buyer. */
function marketRentOf(stated: string): { rent: number | null; range: { low: number; high: number } | null } {
  const range = priceRange(stated);
  if (range) {
    const monthly = /\b(?:mo|month|monthly)\b/i.test(stated);
    const scale = !monthly && /\b(?:yr|year|annual|annually)\b/i.test(stated) ? 1 / 12 : 1;
    const low = Math.round(range.low * scale * 100) / 100;
    const high = Math.round(range.high * scale * 100) / 100;
    return low >= 50 && high <= 5_000 ? { rent: low, range: { low, high } } : { rent: null, range: null };
  }
  return { rent: monthlyRentOf(stated), range: null };
}

/** "55+", "62+" or "all-age", from the words; null where they say
 *  neither. */
export function ageOf(stated: string): ManufacturedHousingRead["age"] {
  const s = stated.toLowerCase();
  if (/\b62\s*(?:\+|plus\b|\s+(?:and|or)\s+(?:over|older))|\b62-plus\b/.test(s)) return "62+";
  if (/\b55\s*(?:\+|plus\b|\s+(?:and|or)\s+(?:over|older))|\b55-plus\b|\bage[- ]qualified\b|\bsenior\s+(?:community|park)\b/.test(s)) return "55+";
  if (/\ball[- ]ages?\b|\bfamily\b|\bno\s+age\s+restrictions?\b|\bnot\s+age[- ]restricted\b/.test(s)) return "all-age";
  return null;
}

export interface ManufacturedHousingRead {
  pads: number | null;
  occupied: number | null;
  /** occupied over pads, %, or the stated occupancy */
  occupancyPct: number | null;
  /** homes the park owns, rented or for sale; 0 where the memorandum says
   *  none */
  parkOwned: number | null;
  /** the park-owned homes as a share of the pads, % */
  parkOwnedPct: number | null;
  /** the most of the occupied pads the park's homes can be — every one of
   *  them rented — % */
  parkOwnedOfOccupiedMaxPct: number | null;
  residentOwned: number | null;
  residentOwnedPct: number | null;
  /** the average lot rent in place, a month */
  lotRent: number | null;
  /** the memorandum's market lot rent, a month (a range's low end) */
  marketLotRent: number | null;
  marketRange: { low: number; high: number } | null;
  /** market less in place, a month: positive where the rents are under
   *  market */
  gap: number | null;
  gapPct: number | null;
  /** the gap a year across the occupied pads, where both are known */
  gapAnnual: number | null;
  /** a park-owned home's rent, home and lot together, a month */
  homeRent: number | null;
  /** a park-owned home's rent above its lot's, a month */
  homeAboveLot: number | null;
  /** that across every park-owned home a year — the most the homes' own
   *  income can be */
  homeIncomeAnnualMax: number | null;
  /** the building's price over the pads (none on a note or the land) */
  pricePerPad: number | null;
  utilities: MhUtilities | null;
  age: "55+" | "62+" | "all-age" | null;
  ageStated: string;
  rvSites: number | null;
  rentControl: { stated: string; regulated: boolean | null } | null;
  page: string;
  sentences: string[];
  headline: string;
}

const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const rent = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toFixed(2)}`);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money = (n: number) =>
  Math.abs(n) >= 1e6 ? `$${(Math.round(n / 1e5) / 10).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3).toLocaleString("en-US")}k` : usd(n);
const count = (n: number) => n.toLocaleString("en-US");

/** Whether the deal is a manufactured-housing park: the class the deck was
 *  read as, or a stated lot rent beside a count of pads or park-owned
 *  homes. */
function isPark(ex: ExtractionResult, rows: Row[]): boolean {
  if (assetClassKey(ex.assetClass) === "manufactured_housing") return true;
  const has = (re: RegExp) => rows.some((r) => re.test(r.label.trim()));
  return has(LOT_RENT) && (has(PADS) || has(PARK_OWNED));
}

/** A count the memorandum states, "0" and "None" included for the homes the
 *  park owns — a stated none is a fact, not a blank. */
function homesCount(value: string): number | null {
  if (/^\s*(?:0|none|zero|no\s+(?:park[- ]owned\s+)?homes?)\b/i.test(value)) return 0;
  return /%/.test(value.replace(/\([^)]*\)/g, "")) ? null : parseCount(value);
}

/**
 * A park's pads, its homes, its rents and its utilities, as stated. Null on
 * anything but manufactured housing, and where the memorandum states none of
 * what makes a park a park (the pads and the occupancy alone are the key
 * terms' already).
 */
export function readManufacturedHousing(ex: ExtractionResult | null | undefined): ManufacturedHousingRead | null {
  if (!ex) return null;
  const rows = (Array.isArray(ex.metrics) ? ex.metrics : []).filter(isRow).filter((m) => !NOT_STATED.test(m.value.trim()));
  if (!isPark(ex, rows)) return null;
  const find = (re: RegExp, ok: (r: Row) => boolean = () => true) => rows.find((m) => re.test(m.label.trim()) && ok(m)) ?? null;

  const padsRow = find(PADS, (r) => parseCount(r.value) != null);
  const pads = padsRow ? parseCount(padsRow.value) : null;
  const occRow = find(OCCUPIED, (r) => parseCount(r.value) != null);
  let occupied = occRow ? parseCount(occRow.value) : null;
  if (occupied != null && pads != null && occupied > pads) occupied = null;
  const occPctRow = find(OCCUPANCY, (r) => parsePct(r.value) != null);
  const statedOccPct = occPctRow ? parsePct(occPctRow.value) : null;
  const occupancyPct =
    occupied != null && pads != null && pads > 0
      ? Math.round((occupied / pads) * 1000) / 10
      : statedOccPct != null && statedOccPct > 0 && statedOccPct <= 100
        ? statedOccPct
        : null;
  if (occupied == null && pads != null && occupancyPct != null) occupied = Math.round((occupancyPct / 100) * pads);

  const pohRow = find(PARK_OWNED);
  let parkOwned = pohRow ? homesCount(pohRow.value) : null;
  if (parkOwned == null && pohRow) {
    // "12% of the sites": a share of the pads, or of the occupied pads where
    // the words say so, turned into the count it describes.
    const share = parsePct(pohRow.value);
    const base = /\boccupied\b/i.test(pohRow.value) ? occupied : pads;
    if (share != null && share >= 0 && share <= 100 && base != null) parkOwned = Math.round((share / 100) * base);
  }
  if (parkOwned != null && pads != null && parkOwned > pads) parkOwned = null;
  const tohRow = find(RESIDENT_OWNED);
  let residentOwned = tohRow ? homesCount(tohRow.value) : null;
  if (residentOwned != null && pads != null && residentOwned > pads) residentOwned = null;
  if (residentOwned != null && parkOwned != null && pads != null && residentOwned + parkOwned > pads) residentOwned = null;

  const lotRow = find(LOT_RENT);
  const lotRent = lotRow ? monthlyRentOf(lotRow.value) : null;
  const marketRow = find(MARKET_LOT_RENT);
  const market = marketRow ? marketRentOf(marketRow.value) : { rent: null, range: null };
  const gap = lotRent != null && market.rent != null ? Math.round((market.rent - lotRent) * 100) / 100 : null;
  const homeRow = find(HOME_RENT);
  const homeRent = homeRow ? monthlyRentOf(homeRow.value) : null;
  const homeAboveLot = homeRent != null && lotRent != null && homeRent > lotRent ? Math.round((homeRent - lotRent) * 100) / 100 : null;

  const utilityRow = find(WATER_SEWER, (r) => namesSource(r.value));
  const billingRow = find(UTILITY_BILLING);
  const utilities = utilityRow
    ? readUtilities(utilityRow.value, billingRow?.value ?? "")
    : billingRow && billingOf(billingRow.value)
      ? { stated: "", water: null, sewer: null, kind: null, label: "", billing: billingOf(billingRow.value), billingStated: billingRow.value.trim() }
      : null;

  const ageRow = find(AGE);
  const age = ageRow ? ageOf(ageRow.value) : null;
  const rvRow = find(RV_SITES, (r) => parseCount(r.value) != null);
  const rvSites = rvRow ? parseCount(rvRow.value) : null;
  const controlRow = find(RENT_CONTROL);
  const rentControl = controlRow
    ? {
        stated: controlRow.value.trim(),
        regulated: /^\s*(?:none|no)\b|\bnot\s+(?:subject|rent[- ]controlled|regulated|covered)\b|\bexempt\b|\bunregulated\b/i.test(controlRow.value)
          ? false
          : /\b(?:yes|subject|ordinance|regulated|controlled|stabiliz\w*|capped|cap\s+of|limited\s+to)\b/i.test(controlRow.value)
            ? true
            : null,
      }
    : null;

  const price = buildingPriceOf(ex, askingPriceOf(ex));
  const read: Omit<ManufacturedHousingRead, "sentences" | "headline"> = {
    pads,
    occupied,
    occupancyPct,
    parkOwned,
    parkOwnedPct: parkOwned != null && pads != null && pads > 0 ? Math.round((parkOwned / pads) * 1000) / 10 : null,
    parkOwnedOfOccupiedMaxPct:
      parkOwned != null && parkOwned > 0 && occupied != null && occupied > 0 ? Math.round((Math.min(parkOwned, occupied) / occupied) * 1000) / 10 : null,
    residentOwned,
    residentOwnedPct: residentOwned != null && pads != null && pads > 0 ? Math.round((residentOwned / pads) * 1000) / 10 : null,
    lotRent,
    marketLotRent: market.rent,
    marketRange: market.range,
    gap,
    gapPct: gap != null && lotRent != null && lotRent > 0 ? Math.round((gap / lotRent) * 1000) / 10 : null,
    gapAnnual: gap != null && gap > 0 && occupied != null ? Math.round(gap * 12 * occupied) : null,
    homeRent,
    homeAboveLot,
    homeIncomeAnnualMax: homeAboveLot != null && parkOwned != null && parkOwned > 0 ? Math.round(homeAboveLot * 12 * parkOwned) : null,
    pricePerPad: price != null && pads != null && pads > 0 ? Math.round(price / pads) : null,
    utilities,
    age,
    ageStated: ageRow?.value.trim() ?? "",
    rvSites,
    rentControl,
    page: "",
  };
  const parkFacts =
    read.lotRent != null ||
    read.marketLotRent != null ||
    read.parkOwned != null ||
    read.residentOwned != null ||
    read.homeRent != null ||
    read.utilities != null ||
    read.age != null ||
    read.rvSites != null ||
    read.rentControl != null;
  if (!parkFacts) return null;
  const pages = typeof ex.totalPages === "number" && ex.totalPages > 0 ? ex.totalPages : null;
  const pageRow = lotRow ?? pohRow ?? utilityRow ?? padsRow;
  const n = parsePageNumber(pageRow?.page);
  read.page = n != null && pages != null && n <= pages ? (pageRow?.page ?? "").trim() : "";
  const sentences = sentencesOf(read);
  return { ...read, sentences, headline: sentences.join(" ") };
}

function sentencesOf(r: Omit<ManufacturedHousingRead, "sentences" | "headline">): string[] {
  const out: string[] = [];

  // The pads, and whose homes stand on them.
  if (r.pads != null) {
    const basis = r.pricePerPad != null ? ` at ${usd(r.pricePerPad)} a pad` : "";
    const occ =
      r.occupied != null && r.occupancyPct != null
        ? `, ${count(r.occupied)} occupied (${pct1(r.occupancyPct)})`
        : r.occupancyPct != null
          ? `, ${pct1(r.occupancyPct)} occupied`
          : "";
    const homes: string[] = [];
    if (r.residentOwned != null && r.residentOwnedPct != null) {
      homes.push(`${count(r.residentOwned)} carry a home its resident owns (${pct1(r.residentOwnedPct)})`);
    }
    if (r.parkOwned != null && r.parkOwned > 0 && r.parkOwnedPct != null) {
      homes.push(
        `${count(r.parkOwned)} carry a home the park owns (${pct1(r.parkOwnedPct)} of the pads${
          r.parkOwnedOfOccupiedMaxPct != null ? `, as much as ${pct1(r.parkOwnedOfOccupiedMaxPct)} of the occupancy` : ""
        })`,
      );
    }
    out.push(`It has ${count(r.pads)} pads${basis}${occ}${homes.length ? `; ${homes.join("; ")}` : ""}.`);
  }
  if (r.parkOwned === 0) {
    out.push("No home is the park's own, as stated: the occupancy is the residents' homes on the park's land.");
  } else if (r.parkOwned != null) {
    out.push(
      "A park-owned home is occupancy the park bought: a house it rents out, repairs and turns over, and lenders commonly count its income apart from the lots' or limit how much of it they count.",
    );
  }
  if (r.pads != null && r.occupied != null && r.pads - r.occupied > 0) {
    const vacant = r.pads - r.occupied;
    out.push(
      `The ${count(vacant)} vacant ${vacant === 1 ? "pad earns" : "pads earn"} nothing until a home is moved onto ${vacant === 1 ? "it" : "each"}: filling one means a home bought and set, by the park or by a buyer, not a lease signed.`,
    );
  }

  // The lot rent against the market's.
  if (r.lotRent != null && r.marketLotRent != null && r.gap != null) {
    const market = r.marketRange
      ? `the memorandum's market ${rent(r.marketLotRent)} (the low end of the ${rent(r.marketRange.low)}–${rent(r.marketRange.high)} it states)`
      : `the memorandum's market ${rent(r.marketLotRent)}`;
    if (r.gap > 0) {
      const year = r.gapAnnual != null && r.occupied != null ? `, ${usd(r.gapAnnual)} a year across the ${count(r.occupied)} occupied pads were every lot at market` : "";
      out.push(`The average lot rent is ${rent(r.lotRent)} a month against ${market}: ${rent(r.gap)} a month (${pct1(r.gapPct ?? 0)}) under${year}.`);
      out.push(
        `A resident who owns the home pays thousands to move it, so the lot rent can rise — but each increase runs through the notice the law requires${
          r.rentControl?.regulated ? " and the rent rules the memorandum names" : ""
        }, and the market figure is the broker's until the comparable parks' own lot rents prove it.`,
      );
    } else {
      out.push(`The average lot rent is ${rent(r.lotRent)} a month, at or above ${market}: the upside is not in the lot rents.`);
    }
  } else if (r.lotRent != null) {
    out.push(`The average lot rent is ${rent(r.lotRent)} a month; the memorandum states no market lot rent to set it against.`);
  } else if (r.marketLotRent != null) {
    out.push(`The memorandum's market lot rent is ${rent(r.marketLotRent)} a month; it states no average lot rent in place to set against it.`);
  }

  // What a park-owned home earns above its lot.
  if (r.homeRent != null && r.homeAboveLot != null && r.lotRent != null) {
    const across =
      r.homeIncomeAnnualMax != null && r.parkOwned != null
        ? `: across the ${count(r.parkOwned)} ${r.parkOwned === 1 ? "home" : "homes"}, up to ${usd(r.homeIncomeAnnualMax)} a year of the income is the homes' rather than the land's`
        : "";
    out.push(`A park-owned home rents for ${rent(r.homeRent)} a month, ${rent(r.homeAboveLot)} above its lot's ${rent(r.lotRent)}${across}.`);
  }

  // The water and the sewer.
  const u = r.utilities;
  if (u && (u.water || u.sewer)) {
    const priv = [u.water === "private" ? "water" : "", u.sewer === "private" ? "sewer" : ""].filter(Boolean);
    const pub = [u.water === "public" ? "water" : "", u.sewer === "public" ? "sewer" : ""].filter(Boolean);
    if (priv.length) {
      out.push(
        `The ${priv.join(" and ")} ${priv.length > 1 ? "are" : "is"} the park's own${pub.length ? `, the ${pub.join(" and ")} public` : ""} (as stated: ${u.stated}): the park runs a utility — its permits, its testing and its replacement are the owner's, a capital item the lot rent never shows.`,
      );
    } else {
      out.push(
        pub.length > 1
          ? `Water and sewer are public (as stated: ${u.stated}): no utility of the park's own to run.`
          : `The ${pub[0]} is public, as stated: ${u.stated}.`,
      );
    }
  }
  if (u?.billing === "park") {
    out.push(
      `The park pays for the water and sewer${u.billingStated ? ` (as stated: ${u.billingStated})` : ""}: an expense that rises with the utility's rates, which a bill-back would move to the residents where the law allows it.`,
    );
  } else if (u?.billing === "residents") {
    out.push(`The residents pay for the water and sewer${u.billingStated ? ` (as stated: ${u.billingStated})` : ""}.`);
  }

  // The age restriction, the RV sites and the rent rules.
  if (r.age === "55+") {
    out.push(
      "It is a 55+ community, as stated: a narrower pool of residents than an all-age park's, and the Fair Housing Act's exemption holds only while at least 80% of the occupied homes have a resident 55 or older.",
    );
  } else if (r.age === "62+") {
    out.push("It is a 62+ community, as stated: a narrower pool of residents than an all-age park's, and the Fair Housing Act's exemption for it requires its residents to be 62 or older.");
  } else if (r.age === "all-age") {
    out.push("It is an all-age community, as stated.");
  }
  if (r.rvSites != null) {
    out.push(
      `It also has ${count(r.rvSites)} RV ${r.rvSites === 1 ? "site" : "sites"}, apart from the pads: nightly, weekly or seasonal income, a campground's business rather than a land lease, to be counted and valued apart from the lot rents.`,
    );
  }
  if (r.rentControl) {
    out.push(
      r.rentControl.regulated === true
        ? `Its lot rents are regulated, as stated (${r.rentControl.stated}): the rules, not the market, set how fast they rise.`
        : r.rentControl.regulated === false
          ? "It is not subject to rent control, as the memorandum states — a claim to check against the state's and the city's own mobile-home rules."
          : `On rent control, as stated: ${r.rentControl.stated}.`,
    );
  }
  return out;
}

/**
 * What the screening model does with the park: it grows today's lot rents
 * at one rate and reads no market rent, so closing the gap is in none of
 * its returns; it capitalises the whole income at one exit cap, the
 * park-owned homes' rent with the lots'; and its reserve is the class's
 * screening default, never a figure for the park's own water and sewer. ""
 * where none of it applies.
 */
export function mhModelLine(r: ManufacturedHousingRead, m: { rentGrowthPct: number; exitCapPct: number }): string {
  const parts: string[] = [];
  const cap = m.exitCapPct;
  const capWord = `${(cap * 100).toFixed(2)}%`;
  if (r.gapAnnual != null && r.gapAnnual > 0 && cap > 0) {
    parts.push(
      `Closed by the sale, the gap to the memorandum's market lot rent is ${money(r.gapAnnual)} a year of income, ${money(r.gapAnnual / cap)} at the model's ${capWord} exit cap${
        r.rentControl?.regulated ? " if the rent rules allow it" : ""
      }; the model grows today's lot rents at ${(m.rentGrowthPct * 100).toFixed(1)}% a year and reads no market rent, so closing the gap is in none of its returns.`,
    );
  }
  if (r.parkOwned != null && r.parkOwned > 0 && cap > 0) {
    parts.push(
      r.homeIncomeAnnualMax != null
        ? `It capitalises the whole income at one exit cap, the park-owned homes' rent with the lots': up to ${money(r.homeIncomeAnnualMax)} a year of it is the homes', ${money(r.homeIncomeAnnualMax / cap)} of the exit's value at ${capWord}.`
        : "It capitalises the whole income at one exit cap, the park-owned homes' rent with the lots'.",
    );
  }
  if (r.utilities?.kind === "private" || r.utilities?.kind === "mixed") {
    parts.push("Its reserve is the class's screening default, not a figure for the park's own water and sewer.");
  }
  return parts.join(" ");
}

/** The pipeline row's tag, its parts in order of what a scan wants first:
 *  "Lot rent $430 vs $525 mkt", "Private water & sewer", "POH 12%",
 *  "55+". `max` parts (two on a card and a row; all of them in the
 *  CSV). Null where there is nothing to say. */
export function manufacturedHousingTag(ex: ExtractionResult | null | undefined, max = 2): string | null {
  const r = readManufacturedHousing(ex);
  if (!r) return null;
  const parts: string[] = [];
  if (r.lotRent != null) {
    parts.push(r.marketLotRent != null ? `Lot rent ${usd(r.lotRent)} vs ${usd(r.marketLotRent)} mkt` : `Lot rent ${usd(r.lotRent)}`);
  }
  const priv = privateLabel(r.utilities);
  if (priv) parts.push(priv);
  if (r.parkOwnedPct != null) parts.push(r.parkOwned === 0 ? "No POH" : `POH ${pct1(r.parkOwnedPct)}`);
  if (r.age === "55+" || r.age === "62+") parts.push(r.age);
  return parts.length ? parts.slice(0, max).join(", ") : null;
}

/** The park in one line, for the memo, the workbook's cover and the
 *  report. */
export function mhShortLine(r: ManufacturedHousingRead): string {
  const parts: string[] = [];
  if (r.pads != null) {
    parts.push(
      `${count(r.pads)} pads${r.pricePerPad != null ? ` at ${money(r.pricePerPad)} a pad` : ""}${r.occupancyPct != null ? `, ${pct1(r.occupancyPct)} occupied` : ""}`,
    );
  }
  if (r.lotRent != null) parts.push(`lot rent ${rent(r.lotRent)}${r.marketLotRent != null ? ` (market ${rent(r.marketLotRent)})` : ""}`);
  else if (r.marketLotRent != null) parts.push(`market lot rent ${rent(r.marketLotRent)}`);
  if (r.parkOwned === 0) parts.push("no park-owned homes");
  else if (r.parkOwned != null) parts.push(`${count(r.parkOwned)} park-owned ${r.parkOwned === 1 ? "home" : "homes"}${r.parkOwnedPct != null ? ` (${pct1(r.parkOwnedPct)})` : ""}`);
  if (r.utilities?.label) parts.push(r.utilities.label.toLowerCase());
  if (r.age === "55+" || r.age === "62+") parts.push(r.age);
  if (r.age === "all-age") parts.push("all-age");
  if (r.rvSites != null) parts.push(`${count(r.rvSites)} RV ${r.rvSites === 1 ? "site" : "sites"}`);
  if (r.rentControl?.regulated === true) parts.push("lot rents regulated");
  return `Manufactured housing: ${parts.join("; ")}`;
}

/** The read as the steps after the extraction see it (lib/deal-context). */
export function mhContextLine(r: ManufacturedHousingRead): string {
  return `Manufactured housing: ${r.headline}${r.page ? ` (${r.page})` : ""}`;
}

/** The facts beside the class's own traps, for the assumption review. */
export function mhNote(r: ManufacturedHousingRead): string {
  return [
    `MANUFACTURED HOUSING AS STATED: ${r.headline}`,
    "Check by name: the lot rent against the comparable parks' own lot rents, not the broker's market figure alone; the park-owned homes' rent, age and condition, and how much of the occupancy they are; who owns the water and sewer systems, how old they are, and their permits and any notice of violation; the notice and the rent rules a lot-rent increase runs through in this state and city; and, where the park is age-restricted, the survey behind its 80% rule.",
  ].join(" ");
}
