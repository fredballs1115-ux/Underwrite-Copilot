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
}

export interface SiteFlagsResult {
  status: "pending" | "ok" | "geocode_failed" | "lookup_failed";
  subject?: { lat: number; lng: number; label: string };
  /** 11-digit census tract GEOID, null when the geocoder had no tract */
  tractGeoid: string | null;
  /** null = tract known, not in a zone; "unchecked" = registry empty/unavailable */
  opportunityZone: { sourceDataset: string } | null | "unchecked";
  /** null = query worked, point in no mapped flood polygon (treat as zone X-ish
   *  unknown); "unavailable" = NFHL not reachable/resolvable */
  flood: FloodFlag | null | "unavailable";
  retrievedAt: string;
  error?: string;
  /** honesty line rendered under the card, verbatim */
  note: string;
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
    flags.push({ zone, subtype, isHighRisk: isHighRiskZone(zone) });
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
