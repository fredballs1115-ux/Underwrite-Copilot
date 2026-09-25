// Address → covered-market matcher (the 15-market scope). Pure + tested;
// the deal page uses it to say "this deal sits in a covered market — here's
// the brief" and to stay honest when a deal falls outside the list.
// (Universal module: server components and tests import it.)

import metrosSeed from "@/data/research/metros.json";
import dataMetrosSeed from "@/data/data-metros.json";
import { US_STATE_ABBREV, abbrevState, placeOf } from "@/lib/address";
import type { GeoTarget } from "@/lib/criteria";

export interface CoveredMetro {
  id: string;
  name: string;
}

/**
 * A metro area the site READS but does not brief (data/data-metros.json):
 * its published figures reach every surface a briefed market's do — the
 * market check, the deal page, the report, the workbook — and nothing else
 * does: no research brief, no comps pull, no tracker. Matched after the
 * briefed markets and before the state fallback.
 */
export interface DataMetro extends CoveredMetro {
  /** The states it spans, two-letter; an address matches inside one of them. */
  states: readonly string[];
  /** Substrings of the deal's city, county or submarket that place it here. */
  keywords: readonly string[];
  /** Its Census region — northeast / midwest / south / west. */
  region: string;
  /** The CBSA code Realtor.com's file keys on. */
  cbsa: string;
  /** The RegionName in Zillow Research's metro files. */
  zillow: string;
  /** The prefix of the area's name in the Housing Vacancy Survey's tables. */
  census: string;
}

/** The list, its shape held: a malformed entry is refused rather than
 *  skipped, because a skipped metro silently reads as its state. */
function readDataMetros(raw: unknown): DataMetro[] {
  const list = (raw as { metros?: unknown })?.metros;
  if (!Array.isArray(list)) throw new Error("data-metros: metros must be an array");
  const ids = new Set<string>();
  const research = new Set((metrosSeed.metros ?? []).map((m) => m.id));
  return list.map((m, i) => {
    const o = (m ?? {}) as Record<string, unknown>;
    const where = `data-metros: metro ${i} (${String(o.id ?? "?")})`;
    for (const k of ["id", "name", "region", "cbsa", "zillow", "census"] as const) {
      if (typeof o[k] !== "string" || !(o[k] as string).trim()) throw new Error(`${where}: needs ${k}`);
    }
    if (!Array.isArray(o.states) || o.states.length === 0 || !o.states.every((s) => typeof s === "string" && /^[A-Z]{2}$/.test(s))) {
      throw new Error(`${where}: states must be two-letter codes`);
    }
    if (!Array.isArray(o.keywords) || o.keywords.length === 0 || !o.keywords.every((k) => typeof k === "string" && k === k.toLowerCase() && k.trim())) {
      throw new Error(`${where}: keywords must be lowercase, and there must be some`);
    }
    if (!["northeast", "midwest", "south", "west"].includes(o.region as string)) throw new Error(`${where}: bad region`);
    if (!/^\d{5}$/.test(o.cbsa as string)) throw new Error(`${where}: cbsa must be five digits`);
    const id = o.id as string;
    if (ids.has(id)) throw new Error(`${where}: duplicate id`);
    if (research.has(id)) throw new Error(`${where}: ${id} is a briefed market`);
    ids.add(id);
    return {
      id,
      name: o.name as string,
      states: o.states as string[],
      keywords: o.keywords as string[],
      region: o.region as string,
      cbsa: o.cbsa as string,
      zillow: o.zillow as string,
      census: o.census as string,
    };
  });
}

/** The metro areas read without a brief, in the file's order. */
export const DATA_METROS: readonly DataMetro[] = readDataMetros(dataMetrosSeed);

// Keyword → metro id, guarded by state. Keywords are matched against the
// deal's city, county, and submarket strings (lowercased, substring). Order
// matters only within a state; first hit wins.
const MATCHERS: { state: string; keywords: string[]; id: string }[] = [
  { state: "DC", keywords: ["washington", "district of columbia"], id: "dc" },
  { state: "MD", keywords: ["prince george"], id: "pg_county" },
  { state: "MD", keywords: ["montgomery", "silver spring", "rockville", "bethesda", "takoma park"], id: "montgomery_county" },
  { state: "MD", keywords: ["baltimore"], id: "baltimore" },
  { state: "VA", keywords: ["arlington", "alexandria", "fairfax", "falls church", "loudoun", "prince william", "manassas"], id: "nova" },
  { state: "VA", keywords: ["richmond", "henrico", "chesterfield"], id: "richmond" },
  { state: "VA", keywords: ["norfolk", "virginia beach", "chesapeake", "hampton", "newport news", "portsmouth", "suffolk"], id: "norfolk_hampton_roads" },
  { state: "PA", keywords: ["philadelphia"], id: "philadelphia" },
  { state: "DE", keywords: ["wilmington", "new castle"], id: "philadelphia" },
  { state: "NJ", keywords: ["newark", "jersey city", "hudson", "essex"], id: "newark_jc" },
  { state: "NY", keywords: ["new york", "brooklyn", "bronx", "queens", "manhattan", "staten island"], id: "nyc" },
  { state: "MA", keywords: ["boston", "suffolk"], id: "boston" },
  { state: "IL", keywords: ["chicago", "cook"], id: "chicago" },
  { state: "CA", keywords: ["los angeles"], id: "los_angeles" },
  { state: "CA", keywords: ["san francisco"], id: "san_francisco" },
  { state: "WA", keywords: ["seattle", "king"], id: "seattle" },
  { state: "FL", keywords: ["miami", "dade"], id: "miami" },
  { state: "GA", keywords: ["atlanta", "fulton", "dekalb"], id: "atlanta" },
  { state: "TX", keywords: ["dallas", "fort worth", "tarrant", "plano", "arlington"], id: "dallas" },
];

const NAME_BY_ID = new Map(
  (metrosSeed.metros ?? []).map((m) => [m.id, m.name as string])
);

/** States that contain at least one covered market. */
export const COVERED_STATES = new Set(MATCHERS.map((m) => m.state));

/** The covered metro a deal address falls in, or null. Null does NOT mean
 *  uncovered state — pair with coveredState() for the honest sentence. */
export function metroForAddress(addr: {
  city?: string | null;
  county?: string | null;
  state?: string | null;
  submarket?: string | null;
}): CoveredMetro | null {
  const state = abbrevState(addr.state ?? "").toUpperCase();
  if (!state) return null;
  const hay = [addr.city, addr.county, addr.submarket]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!hay) return null;
  for (const m of MATCHERS) {
    if (m.state !== state) continue;
    if (m.keywords.some((k) => hay.includes(k))) {
      const name = NAME_BY_ID.get(m.id);
      if (name) return { id: m.id, name };
    }
  }
  return null;
}

/** Is the deal's state one that contains covered markets at all? */
export function coveredState(state?: string | null): boolean {
  return COVERED_STATES.has(abbrevState(state ?? "").toUpperCase());
}

/** "Pennsylvania", "District of Columbia" — the address table's names, cased for a page. */
const STATE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_ABBREV).map(([name, code]) => [
    code,
    name
      .split(" ")
      .map((w) => (w === "of" ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" "),
  ]),
);

/** The prefix a state's market id wears, so every reader can tell the grain. */
export const STATE_MARKET_PREFIX = "state:";

/**
 * The state a deal address falls in, as a market of its own grain — the
 * fallback where no covered metro matches, because a deal in Pittsburgh,
 * Phoenix or Nashville is a deal all the same and its state publishes
 * unemployment, payrolls, permits, house prices and rental vacancy of its
 * own. The id is `state:PA`, so the series table can file a state's series
 * under it and every sentence can say the figure is the state's, never the
 * metro's. Null for an address whose state the table does not know.
 */
export function stateForAddress(addr: { state?: string | null }): CoveredMetro | null {
  const code = abbrevState((addr.state ?? "").trim()).trim().toUpperCase();
  const name = STATE_NAME_BY_CODE[code];
  return name ? { id: `${STATE_MARKET_PREFIX}${code}`, name } : null;
}

/** Whether a market id is a state's rather than a covered metro's. */
export function isStateMarket(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(STATE_MARKET_PREFIX);
}

/** The two-letter code inside a state market id, or null. */
export function stateOfMarket(id: string | null | undefined): string | null {
  return isStateMarket(id) ? (id as string).slice(STATE_MARKET_PREFIX.length) : null;
}

/**
 * The metro area read without a brief that a deal address falls in, or
 * null — the same rule as the briefed markets (keywords against the city,
 * county and submarket, guarded by state), consulted after them.
 */
export function dataMetroForAddress(addr: {
  city?: string | null;
  county?: string | null;
  state?: string | null;
  submarket?: string | null;
}): CoveredMetro | null {
  const state = abbrevState((addr.state ?? "").trim()).trim().toUpperCase();
  if (!state) return null;
  const hay = [addr.city, addr.county, addr.submarket]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!hay) return null;
  for (const m of DATA_METROS) {
    if (!m.states.includes(state)) continue;
    if (m.keywords.some((k) => hay.includes(k))) return { id: m.id, name: m.name };
  }
  return null;
}

/** Whether a market id is a metro area's read without a brief. */
export function isDataMetro(id: string | null | undefined): boolean {
  return typeof id === "string" && DATA_METROS.some((m) => m.id === id);
}

/**
 * The market the LIVE figures are read for: the briefed market where the
 * address sits in one, the metro area read without a brief where it sits
 * in one of those, the state's own series otherwise. One function, so the
 * pipeline's market check, the deal page, the report and the workbook read
 * the same market for one deal — `metroForAddress` alone stays the
 * research question ("is this a briefed market, with comps and a tracker"),
 * which a data metro and a state never answer.
 */
export function marketForAddress(addr: {
  city?: string | null;
  county?: string | null;
  state?: string | null;
  submarket?: string | null;
}): CoveredMetro | null {
  return metroForAddress(addr) ?? dataMetroForAddress(addr) ?? stateForAddress(addr);
}

/** A market's name the way names compare: no case, no apostrophes, every
 *  other mark a space — "Prince George's County MD" is
 *  "prince georges county md", "Dallas-Fort Worth" "dallas fort worth". */
const nameKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Every market with a page and a photograph, by its name's key. */
const MARKET_BY_NAME = new Map<string, CoveredMetro>(
  [
    ...(metrosSeed.metros ?? []).map((m) => ({ id: m.id, name: m.name as string })),
    ...DATA_METROS.map((m) => ({ id: m.id, name: m.name })),
  ].map((m) => [nameKey(m.name), m]),
);

// What a person appends to a metro's name — "DC Metro", "Richmond, VA MSA",
// "the Boston market" — says nothing about which metro it is.
const TRAILING_QUALIFIER = /\s*\b(?:metro(?:politan)?(?:\s+area)?|msa|cbsa|market|region|area)\s*$/i;

/**
 * The market a place NAME falls in — the metro a person typed on a
 * submarket ("Richmond, VA", "Northern Virginia", "Pittsburgh PA") rather
 * than a deal's structured address. Two ways and only two, because the
 * answer puts a city's photograph on the page, and a photograph of the
 * wrong city is the site being wrong:
 *
 *   - the site's own name for a market, whole: "Boston", "Dallas-Fort
 *     Worth", "Minneapolis-St. Paul", "Richmond VA";
 *   - a city with its state ("Arlington, VA", "Brooklyn NY", "Tampa,
 *     Florida"), read by `placeOf` and matched by the address matchers,
 *     the briefed markets first. The state guard is what keeps Arlington
 *     VA from Arlington TX and Portland OR from Portland ME.
 *
 * A bare city with no state is not read — "Portland", "Columbus" and
 * "Richmond" are each more than one place — a state alone is no metro,
 * and nothing falls back to the state's market: this answers which
 * metro's photograph and page, and a state has neither.
 */
export function metroForName(text: string | null | undefined): CoveredMetro | null {
  const raw = (text ?? "").replace(/\s+/g, " ").trim().replace(/^the\s+/i, "").replace(TRAILING_QUALIFIER, "").trim();
  if (!raw) return null;
  const whole = MARKET_BY_NAME.get(nameKey(raw));
  if (whole) return whole;
  const place = placeOf(raw);
  if (!place) return null;
  // The District is its city: "DC" names Washington.
  const city = place.city ?? (place.state === "DC" ? "Washington" : null);
  if (!city) return null;
  const addr = { city, state: place.state };
  return metroForAddress(addr) ?? dataMetroForAddress(addr);
}

export interface MarketNavEntry {
  id: string;
  name: string;
  region: string;
  /** alias text for palette search: "brooklyn" or "fort worth" must land */
  search: string;
}

/** One suggested buy-box territory per covered market. The SAME keyword set
 *  that maps deals to markets becomes the chip's match needles, so "in this
 *  market" means the same thing to the mandate check and the market matcher.
 *  Built SERVER-side and passed as a prop (bundle rule, as below). */
export function coveredMarketGeoTargets(): GeoTarget[] {
  const aliasesById = new Map<string, string[]>();
  const stateById = new Map<string, string>();
  for (const m of MATCHERS) {
    aliasesById.set(m.id, [...(aliasesById.get(m.id) ?? []), ...m.keywords]);
    if (!stateById.has(m.id)) stateById.set(m.id, m.state);
  }
  return (metrosSeed.metros ?? []).map((m) => ({
    label: m.name as string,
    state: stateById.get(m.id),
    aliases: [...new Set(aliasesById.get(m.id) ?? [])],
  }));
}

/** Slim covered-market list for client navigation (⌘K). Built SERVER-side
 *  and passed as a prop — the full metros.json (notes, sources, gaps) must
 *  never ride into a client bundle. */
export function coveredMarketNav(): MarketNavEntry[] {
  const aliasesById = new Map<string, string[]>();
  for (const m of MATCHERS) {
    const list = aliasesById.get(m.id) ?? [];
    list.push(...m.keywords);
    aliasesById.set(m.id, list);
  }
  return (metrosSeed.metros ?? []).map((m) => ({
    id: m.id,
    name: m.name as string,
    region: ((m as { region?: string }).region ?? "covered market") as string,
    search: [m.name, ...(aliasesById.get(m.id) ?? [])].join(" "),
  }));
}
