// Site flags: the PURE core — types + parsers for the per-deal site checks
// (census tract → Opportunity Zone membership, FEMA NFHL flood zone). No I/O
// here (fetching lives in run.ts) so every parser is unit-testable against
// fixtures, mirroring lib/public-comps/core.ts. (Universal module.)

export interface FloodFlag {
  /** FEMA flood zone code (AE, VE, X, …) at the deal's coordinates */
  zone: string;
  /** ZONE_SUBTY where present ("0.2 PCT ANNUAL CHANCE FLOOD HAZARD" …) */
  subtype: string | null;
  /** A- and V-prefixed zones = Special Flood Hazard Area (mandatory flood
   *  insurance on federally-backed lending) */
  isHighRisk: boolean;
  /** FEMA's base flood elevation for the zone where it states one (#472):
   *  STATIC_BFE in its own unit and datum, as the runner printed them
   *  ("9, Feet, NAVD88" in Hoboken; -9999 is FEMA's "none" and is read as
   *  absent). A lookup stored before it was read has none. */
  bfe?: { value: number; unit: string; datum: string | null } | null;
  /** the depth FEMA maps an AO zone's flood at, where it states one */
  depth?: { value: number; unit: string } | null;
}

export interface SiteFlagsResult {
  status: "pending" | "ok" | "geocode_failed" | "lookup_failed";
  subject?: { lat: number; lng: number; label: string };
  /** 11-digit census tract GEOID, null when the geocoder had no tract */
  tractGeoid: string | null;
  /** the incorporated place the building sits in (#452): its municipality,
   *  which decides whether a city's rules reach it; null where it sits in
   *  none; absent on a lookup made before it was read (`SITE_FLAGS_V`) */
  place?: CensusPlace | null;
  /** the county the Census geocoder puts the point in */
  county?: CensusPlace | null;
  /** the rules the lookup was made under; absent on the first version */
  v?: number;
  /** the tract on a list of designated zones (its source: the CDFI Fund's
   *  list or the registry); null = the tract (`ozTract`) is on neither, which
   *  hold zones for the tract's own state (from `SITE_FLAGS_V` 3 — before, a
   *  registry holding any state's zones answered null); "unchecked" = no
   *  answer, the reason in `opportunityZoneUnchecked` */
  opportunityZone: { sourceDataset: string } | null | "unchecked";
  /** the tract number the Opportunity Zone check read (#473): its 2010
   *  number, the one the zones were designated on, where the Census geocoder
   *  answered its 2010 vintage; the current number otherwise. Absent on a
   *  lookup made before the 2010 number was read. */
  ozTract?: { geoid: string; vintage: "2010" | "current" };
  /** why the Opportunity Zone check did not answer: no census tract at the
   *  point, a tract lookup that failed, a list holding no zones for the
   *  tract's state (before #473 the registry alone, Maryland's unless a
   *  national layer was set), or a registry that could not be read. Absent
   *  on a lookup made before it was recorded. */
  opportunityZoneUnchecked?: OpportunityZoneUnchecked;
  /** null = query worked, point in no mapped flood polygon (treat as zone X-ish
   *  unknown); "unavailable" = NFHL not reachable/resolvable */
  flood: FloodFlag | null | "unavailable";
  retrievedAt: string;
  error?: string;
  /** honesty line rendered under the card, verbatim */
  note: string;
}

/** The rules a lookup is made under: 2 reads the incorporated place and the
 *  county beside the tract (#452); 3 looks up at the deal's own geocoded
 *  point — the one its aerial and flood map are drawn around, so the zone
 *  said and the ring drawn are one place — reads FEMA's base flood
 *  elevation (#472), says a tract is not in an Opportunity Zone only
 *  where the registry holds zones for the tract's own state, and checks
 *  the zone by the point's 2010 tract (#473). An answered lookup under
 *  older rules is made again on the deal's next view. */
export const SITE_FLAGS_V = 3;

/** How long a lookup whose flood zone FEMA did not answer stands before it
 *  is asked again (#472): a cold FEMA answer outlasted the old timeout, and
 *  one miss was kept for good. */
export const FLOOD_RETRY_MS = 6 * 60 * 60 * 1000;

/** Whether answered flags should be looked up again: made under older rules
 *  (#452, #472), or answered without the flood zone long enough ago to ask
 *  FEMA again. A lookup that never geocoded is left alone: it has no point. */
export function siteFlagsOutdated(
  flags: (Pick<SiteFlagsResult, "status" | "v"> & Partial<Pick<SiteFlagsResult, "flood" | "retrievedAt">>) | null | undefined,
  now = Date.now(),
): boolean {
  if (!flags || flags.status !== "ok") return false;
  if ((flags.v ?? 1) < SITE_FLAGS_V) return true;
  return flags.flood === "unavailable" && now - Date.parse(flags.retrievedAt ?? "") > FLOOD_RETRY_MS;
}

// ── The Opportunity Zone check ──────────────────────────────────────────────
//
// The CDFI Fund's list of every designated tract (lib/qoz, vendored from the
// Fund's workbook, #473) answers for every state; the registry
// (incentive_zones, which scripts/ingest/opportunity_zones.ts loads with
// Maryland's tracts unless a national layer is set) is asked for a tract the
// list does not name. A tract off both is "not in a zone" only where the
// list holds the tract's own state — every state and territory — and the
// check did not run where there is no tract. The zones were designated on
// 2010 tract numbers, so the check reads the point's 2010 number — the Census
// geocoder answers it under its Census2010_Current vintage, a call of its
// own — and where that call fails, the current number, which a tract split
// or renumbered since 2010 can miss the list by: a miss read that way says
// so.

export type OpportunityZoneUnchecked = "no_tract" | "tract_failed" | "state_not_loaded" | "lookup_failed";

/** The first rules (`SITE_FLAGS_V`) under which "not on the list" was read
 *  against the tract's own state's zones. */
export const OZ_STATE_RULE_V = 3;

/** The state a census tract lies in: an 11-digit tract GEOID opens on its
 *  state's two-digit FIPS code. Null for anything that is not one. */
export function tractStateFips(tractGeoid: string | null | undefined): string | null {
  const g = String(tractGeoid ?? "");
  return /^\d{11}$/.test(g) ? g.slice(0, 2) : null;
}

/**
 * The Opportunity Zone answer from the registry's two reads: the tract's own
 * row (`hit`), and — where there is none — how many zones the registry holds
 * in the tract's state (`zonesInState`, null where that read failed). Only a
 * registry that holds the state's zones can say the tract is not on its list.
 */
export function opportunityZoneFrom(input: {
  hit: { sourceDataset: string } | null;
  zonesInState: number | null;
}): Pick<SiteFlagsResult, "opportunityZone" | "opportunityZoneUnchecked"> {
  if (input.hit) return { opportunityZone: input.hit };
  if (input.zonesInState === null) return { opportunityZone: "unchecked", opportunityZoneUnchecked: "lookup_failed" };
  if (input.zonesInState <= 0) return { opportunityZone: "unchecked", opportunityZoneUnchecked: "state_not_loaded" };
  return { opportunityZone: null };
}

const OZ_UNCHECKED_WHY: Record<OpportunityZoneUnchecked, string> = {
  no_tract: "no census tract for this point",
  tract_failed: "the census tract lookup failed",
  state_not_loaded: "no zones on file for this state",
  lookup_failed: "the zone list could not be read",
};

/** What the site-flags card says about the Opportunity Zone, from a stored
 *  lookup: the chip, and for a tract off the list the one caveat it owes. */
export interface OpportunityZoneRead {
  kind: "listed" | "not_listed" | "unchecked";
  label: string;
  /** said under the chips where the tract's current number is off the list */
  caveat: string | null;
}

/** The next round (data/research/tax_law.json, sourced): the program's new
 *  zones take effect January 1, 2027 and the 2018 zones run to December 31,
 *  2028, so an answer from the 2018 list is not the whole answer for a deal
 *  closing from 2027 — said beside every answer the list gives. */
export const OZ_NEXT_ROUND_NOTE =
  "This checks the 2018 round's zones. The next round's zones take effect January 1, 2027 and the 2018 zones run to December 31, 2028, so a deal closing from 2027 should be checked against the new round's maps too.";

export const OZ_CURRENT_NUMBER_CAVEAT =
  "Opportunity Zones were checked by the tract's current number. The zones were designated on 2010 tract numbers, so a tract split or renumbered since can sit in a zone and still miss the list.";

/** The labels name the list's year: the zones on it are the 2018
 *  designations (the CDFI Fund's workbook: "the final Qualified Opportunity
 *  Zone designations for all States", updated December 14, 2018), and a
 *  label that says which list stays true whatever is designated later. */
export function opportunityZoneRead(
  flags: Pick<SiteFlagsResult, "opportunityZone" | "opportunityZoneUnchecked" | "v" | "ozTract">,
): OpportunityZoneRead {
  const oz = flags.opportunityZone;
  if (oz && typeof oz === "object") return { kind: "listed", label: "Opportunity Zone tract (2018 designations)", caveat: null };
  // A "not on the list" stored before the state rule may have been read
  // against another state's zones: not an answer.
  if (oz === null && (flags.v ?? 1) >= OZ_STATE_RULE_V) {
    // Read by the 2010 number the zones were designated on, a miss is the
    // answer; read by the current number, it owes the caveat.
    if (flags.ozTract?.vintage === "2010") {
      return { kind: "not_listed", label: "Tract not on the 2018 Opportunity Zone list", caveat: null };
    }
    return { kind: "not_listed", label: "Tract's current number not on the 2018 Opportunity Zone list", caveat: OZ_CURRENT_NUMBER_CAVEAT };
  }
  const why = oz === "unchecked" && flags.opportunityZoneUnchecked ? OZ_UNCHECKED_WHY[flags.opportunityZoneUnchecked] : null;
  return { kind: "unchecked", label: `Opportunity Zone: not checked${why ? ` (${why})` : ""}`, caveat: null };
}

/**
 * Whether stored flags were looked up for a different address than the
 * deal's current one (#447): an edited address keeps the old point's tract
 * and flood zone until the lookup runs again, and a tract from the old
 * address would place the deal in the old address's metro area. Flags that
 * name no address (a lookup that never geocoded) cannot be judged and are
 * taken as they are.
 */
export function siteFlagsStale(
  flags: Pick<SiteFlagsResult, "subject"> | null | undefined,
  label: string | null | undefined,
): boolean {
  const was = flags?.subject?.label?.trim();
  const now = (label ?? "").trim();
  return !!was && was !== now;
}

export const SITE_FLAGS_NOTE =
  "Screening flags from federal datasets at the geocoded point — parcel boundaries can differ; verify zone membership and flood status before closing.";

/** A-/V-prefixed zones are FEMA Special Flood Hazard Areas. "AREA NOT
 *  INCLUDED" and open-water codes are not risk calls. */
export function isHighRiskZone(zone: string): boolean {
  const z = zone.trim().toUpperCase();
  if (!z || z === "X" || z === "B" || z === "C" || z === "D" || z === "AREA NOT INCLUDED") {
    return false;
  }
  return z.startsWith("A") || z.startsWith("V");
}

/** Census geocoder `geographies/coordinates` response → 11-digit tract GEOID.
 *  Defensive: any missing layer/shape yields null, never a throw. */
export function parseCensusTract(json: unknown): string | null {
  const geogs = (json as { result?: { geographies?: Record<string, unknown[]> } })?.result
    ?.geographies;
  if (!geogs || typeof geogs !== "object") return null;
  // Layer name is "Census Tracts" across vintages, but match loosely.
  const key = Object.keys(geogs).find((k) => /census tracts/i.test(k));
  const first = key ? (geogs[key] as { GEOID?: unknown }[])[0] : undefined;
  const geoid = String(first?.GEOID ?? "").replace(/\D/g, "");
  return geoid.length === 11 ? geoid : null;
}

/** A place the Census geocoder names: its name without the kind ("Pasadena",
 *  not "Pasadena city") and its GEOID. */
export interface CensusPlace {
  name: string;
  geoid: string;
}

/**
 * The incorporated place a point sits in (#452), from the same
 * `geographies/coordinates` response the tract comes from — the building's
 * municipality, which decides whether a city's rent rules reach it. The
 * runner printed the response (zori.yml probe run 36658903671): an
 * "Incorporated Places" layer with BASENAME "Pasadena", NAME "Pasadena
 * city", GEOID "0656000" for Pasadena City Hall; "Los Angeles city" for a
 * point in Van Nuys, whose postal city is not its municipality; "New York
 * city" in Brooklyn; and NO such layer for Towson, which is unincorporated
 * (its county is Baltimore County). So: the place where the layer names one,
 * null where the response answered and names none (the point is in no
 * incorporated place), undefined where the response is not a geographies
 * answer at all and says nothing either way.
 */
export function parseCensusPlace(json: unknown): CensusPlace | null | undefined {
  const geogs = (json as { result?: { geographies?: Record<string, unknown> } })?.result?.geographies;
  if (!geogs || typeof geogs !== "object") return undefined;
  // A response that names no county answered nothing we can read a "none" from.
  if (!Object.keys(geogs).some((k) => /^counties$/i.test(k))) return undefined;
  const key = Object.keys(geogs).find((k) => /^incorporated places$/i.test(k));
  const first = key && Array.isArray(geogs[key]) ? (geogs[key] as { BASENAME?: unknown; GEOID?: unknown }[])[0] : undefined;
  const name = String(first?.BASENAME ?? "").trim();
  const geoid = String(first?.GEOID ?? "").replace(/\D/g, "");
  return name && geoid ? { name, geoid } : null;
}

/** The county a point sits in, from the same response: its full name
 *  ("Los Angeles County", "Baltimore city") and its five-digit GEOID. */
export function parseCensusCounty(json: unknown): CensusPlace | null {
  const geogs = (json as { result?: { geographies?: Record<string, unknown> } })?.result?.geographies;
  if (!geogs || typeof geogs !== "object") return null;
  const key = Object.keys(geogs).find((k) => /^counties$/i.test(k));
  const first = key && Array.isArray(geogs[key]) ? (geogs[key] as { NAME?: unknown; GEOID?: unknown }[])[0] : undefined;
  const name = String(first?.NAME ?? "").trim();
  const geoid = String(first?.GEOID ?? "").replace(/\D/g, "");
  return name && geoid.length === 5 ? { name, geoid } : null;
}

/** NFHL flood-hazard-zones query response → the FloodFlag for the point.
 *  Multiple polygons can overlap at boundaries; the highest-risk one wins. */
export function parseNfhlFlood(json: unknown): FloodFlag | null {
  const feats = (json as { features?: { attributes?: Record<string, unknown> }[] })?.features;
  if (!Array.isArray(feats) || feats.length === 0) return null;
  const flags: FloodFlag[] = [];
  for (const f of feats) {
    const a = f.attributes ?? {};
    const zoneKey = Object.keys(a).find((k) => k.toUpperCase() === "FLD_ZONE");
    const subKey = Object.keys(a).find((k) => k.toUpperCase() === "ZONE_SUBTY");
    const zone = zoneKey ? String(a[zoneKey] ?? "").trim() : "";
    if (!zone) continue;
    const subtype = subKey ? String(a[subKey] ?? "").trim() || null : null;
    const field = (name: string) => a[Object.keys(a).find((k) => k.toUpperCase() === name) ?? ""];
    // FEMA writes -9999 where a zone states no figure.
    const figure = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > -9000 ? v : null);
    const unit = String(field("LEN_UNIT") ?? "").trim();
    const bfe = figure(field("STATIC_BFE"));
    const depth = figure(field("DEPTH"));
    const datum = String(field("V_DATUM") ?? "").trim() || null;
    flags.push({
      zone,
      subtype,
      isHighRisk: isHighRiskZone(zone),
      ...(bfe !== null && unit ? { bfe: { value: bfe, unit, datum } } : {}),
      ...(depth !== null && depth > 0 && unit ? { depth: { value: depth, unit } } : {}),
    });
  }
  if (!flags.length) return null;
  return flags.find((f) => f.isHighRisk) ?? flags[0];
}

/** Find the NFHL "Flood Hazard Zones" layer id from the MapServer's own
 *  layer listing — self-resolving so a FEMA re-index is a run-time log line,
 *  not a silently wrong layer. */
export function resolveNfhlLayerId(serviceJson: unknown): number | null {
  const layers = (serviceJson as { layers?: { id?: number; name?: string }[] })?.layers;
  if (!Array.isArray(layers)) return null;
  const hit = layers.find((l) => /flood hazard zones/i.test(l.name ?? ""));
  return typeof hit?.id === "number" ? hit.id : null;
}

// ── FEMA's flood map on the deal page (#425) ────────────────────────────────
//
// The Flood tab draws the NFHL's zones layer over the aerial, in FEMA's own
// symbology, so the legend beside it must be FEMA's own too: its labels and
// swatches, read from the service's legend. The runner printed that legend
// (flood-sheet run, 2026-09-25) — eight entries on layer 28, each a 20px PNG
// with the FLD_ZONE,ZONE_SUBTY pairs it draws — and one thing it does NOT
// carry: Zone X, "area of minimal flood hazard", has no entry, so FEMA leaves
// it undrawn and a frame of minimal hazard is a clear aerial. Every sentence
// here keeps that apart from a point FEMA has no digital map for at all.

/** One entry of FEMA's legend for the zones layer. */
export interface NfhlLegendEntry {
  /** FEMA's own label, trimmed ("1% Annual Chance Flood Hazard") */
  label: string;
  /** the swatch FEMA draws it in, as a data URI; null when none came */
  image: string | null;
  /** the FLD_ZONE,ZONE_SUBTY pairs drawn in this entry, as FEMA lists them */
  values: string[];
}

/** The zones layer's entries out of the service's `legend?f=json`. Empty,
 *  never a throw, on any other shape. */
export function parseNfhlLegend(json: unknown, layerId: number): NfhlLegendEntry[] {
  const layers = (json as { layers?: unknown })?.layers;
  if (!Array.isArray(layers)) return [];
  const layer = layers.find((l) => (l as { layerId?: unknown })?.layerId === layerId) as
    | { legend?: unknown }
    | undefined;
  if (!layer || !Array.isArray(layer.legend)) return [];
  const out: NfhlLegendEntry[] = [];
  for (const raw of layer.legend) {
    const e = (raw ?? {}) as { label?: unknown; imageData?: unknown; contentType?: unknown; values?: unknown };
    const label = typeof e.label === "string" ? e.label.trim() : "";
    if (!label) continue;
    const type = typeof e.contentType === "string" && /^image\//.test(e.contentType) ? e.contentType : "image/png";
    const image =
      typeof e.imageData === "string" && /^[A-Za-z0-9+/=]+$/.test(e.imageData) && e.imageData.length > 0
        ? `data:${type};base64,${e.imageData}`
        : null;
    const values = Array.isArray(e.values) ? e.values.filter((v): v is string => typeof v === "string") : [];
    out.push({ label, image, values });
  }
  return out;
}

/** How a zone and its subtype appear in the legend's `values`: FEMA writes
 *  a missing subtype as "<Null>" in most pairs and as nothing in a few. */
function legendKeys(flood: FloodFlag): string[] {
  const zone = flood.zone.trim().toUpperCase();
  const sub = (flood.subtype ?? "").trim().toUpperCase();
  return sub ? [`${zone},${sub}`] : [`${zone},<NULL>`, `${zone},`];
}

/** The legend entry the building's own zone is drawn in, or null — Zone X of
 *  minimal hazard has none, since FEMA does not draw it. */
export function legendEntryFor(legend: readonly NfhlLegendEntry[], flood: FloodFlag): NfhlLegendEntry | null {
  const keys = legendKeys(flood);
  return legend.find((e) => e.values.some((v) => keys.includes(v.trim().toUpperCase()))) ?? null;
}

/** Zone X of minimal flood hazard, which FEMA maps and does not draw. */
export function isMinimalHazard(flood: FloodFlag): boolean {
  return flood.zone.trim().toUpperCase() === "X" && /minimal/i.test(flood.subtype ?? "");
}

/** A length FEMA states, in words: "9 feet", "-1 foot". */
function lengthWords(value: number, unit: string): string {
  const u = unit.trim().toLowerCase();
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (u === "feet" || u === "foot" || u === "ft") return `${n} ${Math.abs(value) === 1 ? "foot" : "feet"}`;
  return `${n} ${u}`;
}

/** What FEMA states about the flood's height there, where it states it. */
function elevationWords(flood: FloodFlag): string {
  if (flood.bfe) {
    return ` FEMA's base flood elevation there is ${lengthWords(flood.bfe.value, flood.bfe.unit)}${flood.bfe.datum ? ` (${flood.bfe.datum})` : ""}.`;
  }
  if (flood.depth) return ` FEMA maps the flood there at ${lengthWords(flood.depth.value, flood.depth.unit)} deep.`;
  return "";
}

/**
 * What the map says at the building, in one sentence, from the site-flags
 * lookup at the geocoded point: the zone, what FEMA's legend calls it, and
 * what it means for a loan. A point with no zone polygon is said to be off
 * FEMA's digital map — every digitally mapped area carries a zone, Zone X
 * included — never "no hazard". Open water and an area the map does not
 * include are said as what they are, never as a zone (#472): a building's
 * point in the river is a point off the building. Zone D is a hazard FEMA
 * has not studied, never a mapped one. Where FEMA states the base flood
 * elevation, or an AO zone's depth, it is said too.
 */
export function floodZoneLine(
  flood: SiteFlagsResult["flood"] | undefined,
  legend: readonly NfhlLegendEntry[] = [],
): string | null {
  if (flood === undefined || flood === "unavailable") return null;
  if (flood === null) {
    return "FEMA's digital flood map has no zone at the building's point — the area may not be mapped digitally; check the effective paper map with FEMA's Map Service Center.";
  }
  const z = flood.zone.trim().toUpperCase();
  if (z === "OPEN WATER") {
    return "FEMA's map puts the building's point in open water, so the point is likely off the building: read the zone on FEMA's map at the building itself.";
  }
  if (z === "AREA NOT INCLUDED") {
    return "FEMA's map marks the building's point as an area this flood map does not include: another community's map, or one not yet digital, covers it — check FEMA's Map Service Center.";
  }
  const zone = `Zone ${flood.zone}`;
  if (isMinimalHazard(flood)) {
    return `The building sits in ${zone}, an area of minimal flood hazard, which FEMA maps and leaves undrawn — the shading, where there is any, is the hazard nearby.`;
  }
  const entry = legendEntryFor(legend, flood);
  const insurance = "a federally backed loan requires flood insurance, and the premium belongs in the expense line.";
  if (flood.isHighRisk) {
    if (entry && /^regulatory floodway/i.test(entry.label)) {
      return `The building sits in ${zone} in the regulatory floodway, a Special Flood Hazard Area where new building and fill are restricted to keep the channel clear: ${insurance}${elevationWords(flood)}`;
    }
    const called = entry ? ` (${entry.label.toLowerCase()})` : "";
    const coastal = z.startsWith("V") ? ", a coastal high-hazard area where storm waves add to the flood," : ",";
    return `The building sits in ${zone}${called}${coastal} a Special Flood Hazard Area: ${insurance}${elevationWords(flood)}`;
  }
  const called = entry ? ` (${entry.label.toLowerCase()})` : "";
  if (z === "D") {
    return `The building sits in ${zone}${called}, where FEMA has not determined the flood hazard: the map neither shows one nor rules one out, and a federally backed lender does not require flood insurance.`;
  }
  if (!flood.subtype || !entry) {
    return `The building sits in ${zone}${called}, outside the Special Flood Hazard Area: flood insurance is not required by a federally backed lender.`;
  }
  return `The building sits in ${zone}${called}, outside the Special Flood Hazard Area: flood insurance is not required by a federally backed lender, though the hazard is mapped.`;
}

// ── The flood zone wherever the deal is summarized (#426) ───────────────────

/** A subtype in words: FEMA writes "0.2 PCT ANNUAL CHANCE FLOOD HAZARD". */
function subtypeWords(subtype: string): string {
  return subtype
    .trim()
    .toLowerCase()
    .replace(/\s*\b(?:pct|percent)\b/g, "%");
}

/**
 * The pipeline row's tag: a Special Flood Hazard Area only — the zone where
 * a federally backed loan requires flood insurance, which is the fact a
 * list of deals needs beside the price. "Flood AE". Null otherwise.
 */
export function floodTag(flood: SiteFlagsResult["flood"] | undefined): string | null {
  if (!flood || flood === "unavailable" || !flood.isHighRisk) return null;
  return `Flood ${flood.zone}`;
}

/**
 * One line for a document's header (the memo, the shared screen): the
 * Special Flood Hazard Area and every other hazard FEMA draws, in FEMA's own
 * words. Nothing for minimal hazard — it is not a finding — nor for a point
 * with no digital map or a lookup that did not answer, which are absences.
 */
export function floodShortLine(flood: SiteFlagsResult["flood"] | undefined): string | null {
  if (!flood || flood === "unavailable" || isMinimalHazard(flood)) return null;
  if (flood.isHighRisk) {
    return `Flood zone ${flood.zone}: a Special Flood Hazard Area, where flood insurance is required on federally backed debt (FEMA)`;
  }
  return `Flood zone ${flood.zone}${flood.subtype ? ` — ${subtypeWords(flood.subtype)}` : ""} (FEMA)`;
}

/**
 * The zone as a cell — the pipeline's CSV and the compare table's row —
 * every case said, blank only where the lookup has not answered:
 * "AE (SFHA)", "X (minimal)", "X (0.2% annual chance flood hazard)", "no
 * FEMA digital map".
 */
export function floodCell(flood: SiteFlagsResult["flood"] | undefined): string {
  if (flood === undefined || flood === "unavailable") return "";
  if (flood === null) return "no FEMA digital map";
  if (flood.isHighRisk) return `${flood.zone} (SFHA)`;
  if (isMinimalHazard(flood)) return `${flood.zone} (minimal)`;
  return flood.subtype ? `${flood.zone} (${subtypeWords(flood.subtype)})` : flood.zone;
}

/**
 * The zone as the Claude steps read it (the deal context, #426): the same
 * facts as `floodZoneLine`, without the map's shading, which the model never
 * sees — and the one consequence it can act on, that a Special Flood Hazard
 * Area puts a flood premium in the expense line the seller's figures may not
 * carry. Null where the lookup has not answered.
 */
export function floodContextLine(flood: SiteFlagsResult["flood"] | undefined): string | null {
  if (flood === undefined || flood === "unavailable") return null;
  if (flood === null) {
    return "FEMA's digital flood map has no zone at the building's point, so whether it floods is not known from the map.";
  }
  if (isMinimalHazard(flood)) return `FEMA's flood map puts the building in Zone ${flood.zone}, an area of minimal flood hazard.`;
  if (flood.isHighRisk) {
    return `FEMA's flood map puts the building in Zone ${flood.zone}, a Special Flood Hazard Area: a federally backed loan requires flood insurance, so the expense line needs a flood premium the seller's figures may not carry.`;
  }
  return `FEMA's flood map puts the building in Zone ${flood.zone}${flood.subtype ? ` (${subtypeWords(flood.subtype)})` : ""}, outside the Special Flood Hazard Area: flood insurance is not required by a federally backed lender, though the hazard is mapped.`;
}

/**
 * The flood map as the full report prints it (#427): the aerial with FEMA's
 * zones as one JPEG, FEMA's key, and the sentence on the zone at the
 * building. Built on the server (lib/flood-map `floodMapFor`), every image's
 * bytes checked before react-pdf sees them.
 */
export interface FloodMapView {
  /** the composite as a data URI; null when either picture did not come */
  image: string | null;
  key: { label: string; image: string | null; here: boolean }[];
  /** `floodZoneLine`; null while the lookup has not answered */
  line: string | null;
}
