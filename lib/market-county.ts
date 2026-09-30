import "server-only";
import countyTable from "@/data/cbsa-counties.json";
import { US_STATE_ABBREV, abbrevState } from "@/lib/address";
import {
  DATA_METROS,
  marketsForAddress,
  readableAddress,
  stateForAddress,
  type AddressLike,
  type CoveredMetro,
} from "@/lib/market-match";
import metrosSeed from "@/data/research/metros.json";
import { siteFlagsStale, type SiteFlagsResult } from "@/lib/site-flags/core";

// Where a deal's COUNTY places it (#447).
//
// A deal is matched to its market by words in its address: the city, the
// county and the submarket against each market's keywords, which name the
// principal cities and a few counties. A deal in Irving, Frisco, Bellevue,
// Pasadena or Cranberry Township named none of them, and read its STATE's
// figures where its metro area publishes its own. The Census Bureau's
// delineation (data/cbsa-counties.json, written by
// scripts/fetch-cbsa-counties.mjs from the file the runner printed) files
// every county of every metro area, so the county a deal sits in places it
// in its metro area whatever its city is called.
//
// The county comes from the building's census tract, which the site flags
// look up from its point (lib/site-flags), else the county its address names
// ("Collin County", as the address search fills it). Three rules:
//
//   - The county decides the METRO AREA. The keywords only choose among the
//     site's markets inside it (Washington's four, New York's two), and a
//     keyword that named a place in another metro area is dropped: "king"
//     is Seattle's for King County, not for Kingston in Kitsap County, and a
//     county in no metro area at all places the deal in none.
//   - A county the market's own keywords name is that market's, brief and
//     all (Irving read by its tract is in Dallas County, and "dallas" is the
//     Dallas market's word). A county they do not name reads the metro
//     area's PUBLISHED FIGURES and nothing else: no brief, no tracker, no
//     benchmarks — the Los Angeles brief's office vacancy is Los Angeles
//     County's, and Orange County is in the same metro area and a different
//     market.
//   - Everything is said. A deal placed by its county says which county and
//     which metro area, on every surface that prints the figures.
//
// Server-side only: the table is 130 KB, and lib/market-match is universal.

/** A county as the delineation files it. */
interface CountyEntry {
  cbsa: string;
  division?: string;
  county: string;
  state: string;
}

const TABLE = countyTable as unknown as {
  source: string;
  url: string;
  retrieved: string;
  titles: Record<string, string>;
  counties: Record<string, CountyEntry>;
};

/** "48" → "TX", from the table itself: every state has a metropolitan county. */
const STATE_BY_FIPS = new Map<string, string>();
for (const [fips, c] of Object.entries(TABLE.counties)) {
  const code = US_STATE_ABBREV[c.state.toLowerCase()];
  if (code) STATE_BY_FIPS.set(fips.slice(0, 2), code);
}

/** A county's name the way names compare: "St. Louis city" and "Saint Louis
 *  City" are one, "Prince George's County" is "prince georges county", "Doña
 *  Ana" is "dona ana". The kind of place stays in: "Fairfax city" is not
 *  "Fairfax County". */
function countyKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/^\s*city of\s+(.+)$/, "$1 city")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsaint\b/g, "st")
    .trim();
}

/** Each state's metropolitan counties by their name's key. */
const BY_STATE_NAME = new Map<string, Map<string, string>>();
for (const [fips, c] of Object.entries(TABLE.counties)) {
  const code = US_STATE_ABBREV[c.state.toLowerCase()];
  if (!code) continue;
  const names = BY_STATE_NAME.get(code) ?? new Map<string, string>();
  names.set(countyKey(c.county), fips);
  BY_STATE_NAME.set(code, names);
}

/** The deal's county, and the metro area the delineation files it in. */
export interface DealCounty {
  /** state and county, five digits: "48085" */
  fips: string;
  /** the county's name as the delineation files it ("Collin County"); null
   *  for a county in no metro area, which the table does not list */
  name: string | null;
  /** its state, two letters */
  state: string;
  /** the metro area (CBSA) it lies in; null where it lies in none */
  cbsa: string | null;
  /** the metro area's title: "Dallas-Fort Worth-Arlington, TX" */
  area: string | null;
  /** how it was known: the building's census tract, or the county its address names */
  from: "tract" | "address";
}

function countyAt(fips: string, from: DealCounty["from"]): DealCounty | null {
  const state = STATE_BY_FIPS.get(fips.slice(0, 2));
  if (!state) return null;
  const entry = TABLE.counties[fips];
  return {
    fips,
    name: entry?.county ?? null,
    state,
    cbsa: entry?.cbsa ?? null,
    area: entry ? (TABLE.titles[entry.cbsa] ?? null) : null,
    from,
  };
}

/**
 * The county a deal sits in: its census tract's (the site flags' lookup of
 * the building's point), where the tract is in the state the address names —
 * a point in another state is a geocode gone astray, not the building — else
 * the county the address names, read only where it names one of that
 * state's metropolitan counties whole ("Collin County", "Alexandria city",
 * "City of Alexandria"). A bare "Richmond" is never read: Virginia has a
 * Richmond city and a Richmond County in different places, and the table
 * lists only the one in a metro area, so a bare name could be the other.
 * Null where neither says.
 */
export function countyOf(
  address: AddressLike | null | undefined,
  flags?: Pick<SiteFlagsResult, "subject"> & { status?: string | null; tractGeoid?: string | null } | null,
): DealCounty | null {
  const addr = readableAddress(address ?? {});
  const state = abbrevState((addr.state ?? "").trim()).trim().toUpperCase();
  // A tract looked up for the address the deal had before an edit is the old
  // building's, and is not read.
  const tract =
    flags && flags.status !== "pending" && !siteFlagsStale(flags, addr.label ?? address?.label)
      ? (flags.tractGeoid ?? "").trim()
      : "";
  if (/^\d{11}$/.test(tract)) {
    const at = countyAt(tract.slice(0, 5), "tract");
    if (at && (!state || at.state === state)) return at;
  }
  // The District is its own county.
  if (state === "DC") return countyAt("11001", "address");
  const named = (addr.county ?? "").trim();
  const fips = state && named ? BY_STATE_NAME.get(state)?.get(countyKey(named)) : undefined;
  return fips ? countyAt(fips, "address") : null;
}

/** "Collin County, TX" — the District as itself. */
export function countyLine(c: Pick<DealCounty, "name" | "state">): string {
  if (!c.name) return c.state;
  return c.state === "DC" ? c.name : `${c.name}, ${c.state}`;
}

/**
 * The CBSA each briefed market's figures are the metro area's of — the
 * code its Realtor.com row is keyed on (scripts/fetch-realtor.mjs, whose
 * list `lib/market-county.test.ts` holds this to). Washington's four
 * markets share one metro area, New York's two another.
 */
export const BRIEFED_CBSA: Readonly<Record<string, string>> = {
  dc: "47900",
  pg_county: "47900",
  montgomery_county: "47900",
  nova: "47900",
  baltimore: "12580",
  richmond: "40060",
  norfolk_hampton_roads: "47260",
  philadelphia: "37980",
  newark_jc: "35620",
  nyc: "35620",
  boston: "14460",
  chicago: "16980",
  los_angeles: "31080",
  san_francisco: "41860",
  seattle: "42660",
  miami: "33100",
  atlanta: "12060",
  dallas: "19100",
};

/** The metro area a market's figures are the metro area's of. */
export function cbsaOfMarket(id: string): string | null {
  return BRIEFED_CBSA[id] ?? DATA_METROS.find((m) => m.id === id)?.cbsa ?? null;
}

const NAME_BY_ID = new Map<string, string>([
  ...(metrosSeed.metros ?? []).map((m) => [m.id, m.name as string] as const),
  ...DATA_METROS.map((m) => [m.id, m.name] as const),
]);

/**
 * The market whose figures a county's metro area reads, where the keywords
 * chose none: the one market of a metro area the site reads, or — in the
 * two metro areas the site splits — the one whose figures are the whole
 * metro area's (Washington's; New York's, or Newark / Jersey City's in New
 * Jersey, whose figures are New York's with Newark's house prices). A
 * suburb's own market (Prince George's, Montgomery, Northern Virginia) is
 * never reached this way: its figures are its county's, and a county its
 * keywords do not name is not it.
 */
function marketForCounty(c: DealCounty): CoveredMetro | null {
  if (!c.cbsa) return null;
  let id: string | null;
  if (c.cbsa === "47900") id = "dc";
  else if (c.cbsa === "35620") id = c.state === "NJ" ? "newark_jc" : "nyc";
  else {
    const briefed = Object.entries(BRIEFED_CBSA).filter(([, cbsa]) => cbsa === c.cbsa);
    id = briefed.length === 1 ? briefed[0][0] : (DATA_METROS.find((m) => m.cbsa === c.cbsa)?.id ?? null);
  }
  const name = id ? NAME_BY_ID.get(id) : null;
  return id && name ? { id, name } : null;
}

/** How a deal reached its figures, where its county alone placed it. */
export interface CountyPlaced {
  /** "Collin County, TX" */
  county: string;
  /** the delineation's title for its metro area: "Dallas-Fort Worth-Arlington, TX" */
  area: string;
}

/** The market the live figures are read for, and — where only the county
 *  placed it there — how. */
export interface LiveMarket extends CoveredMetro {
  placedBy?: CountyPlaced;
}

/** Every question about where a deal is, answered once. */
export interface DealPlacement {
  /** the briefed market: its brief, research panel, benchmarks, tracker and comps */
  briefed: CoveredMetro | null;
  /** a metro area whose published figures are read and nothing else — a
   *  market read without a brief, or a metro area reached by county alone */
  read: CoveredMetro | null;
  /** how `read` was reached, where the county alone placed it */
  placedBy: CountyPlaced | null;
  /** the market the published figures are read for: the briefed market, the
   *  one read, or the state's own series */
  live: LiveMarket | null;
  /** the deal's county, where known */
  county: DealCounty | null;
}

/**
 * Where a deal is, from its address and its county (`countyOf`). With no
 * county known this is exactly the address matchers' answer (briefed
 * market, then a metro area read without a brief, then the state). With one:
 *
 *   - a county in no metro area places the deal in none — the state's
 *     figures, whatever the address's words matched;
 *   - the words are read with the county's name beside the address's own
 *     fields, and kept where the market they match lies in the county's
 *     metro area;
 *   - otherwise the county's metro area's market is read, figures only,
 *     said as placed by the county.
 */
export function placeDeal(address: AddressLike | null | undefined, county: DealCounty | null): DealPlacement {
  const addr = readableAddress(address ?? {});
  const state = stateForAddress(addr);
  if (county && !county.cbsa) return { briefed: null, read: null, placedBy: null, live: state, county };
  const words = county?.name && !addr.county?.trim() ? { ...addr, county: county.name } : addr;
  // The first market the words match that lies in the county's metro area —
  // with no county known, simply the first, which is the address matchers'
  // own answer (briefed, then read without a brief).
  const hit = marketsForAddress(words).find(({ market }) => !county?.cbsa || cbsaOfMarket(market.id) === county.cbsa);
  if (hit) {
    return {
      briefed: hit.briefed ? hit.market : null,
      read: hit.briefed ? null : hit.market,
      placedBy: null,
      live: hit.market,
      county,
    };
  }
  const byCounty = county ? marketForCounty(county) : null;
  if (byCounty && county?.name && county.area) {
    const placedBy = { county: countyLine(county), area: county.area };
    return { briefed: null, read: byCounty, placedBy, live: { ...byCounty, placedBy }, county };
  }
  return { briefed: null, read: null, placedBy: null, live: state, county };
}

/** Where the delineation came from, for a page that cites it. */
export const DELINEATION_SOURCE = { source: TABLE.source, url: TABLE.url, retrieved: TABLE.retrieved };
