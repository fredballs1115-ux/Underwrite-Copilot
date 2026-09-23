// Address → covered-market matcher (the 15-market scope). Pure + tested;
// the deal page uses it to say "this deal sits in a covered market — here's
// the brief" and to stay honest when a deal falls outside the list.
// (Universal module: server components and tests import it.)

import metrosSeed from "@/data/research/metros.json";
import { US_STATE_ABBREV, abbrevState } from "@/lib/address";
import type { GeoTarget } from "@/lib/criteria";

export interface CoveredMetro {
  id: string;
  name: string;
}

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
