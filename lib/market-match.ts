// Address → covered-market matcher (the 15-market scope). Pure + tested;
// the deal page uses it to say "this deal sits in a covered market — here's
// the brief" and to stay honest when a deal falls outside the list.
// (Universal module: server components and tests import it.)

import metrosSeed from "@/data/research/metros.json";
import { abbrevState } from "@/lib/address";

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
