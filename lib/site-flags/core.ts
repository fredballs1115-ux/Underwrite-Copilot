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

/**
 * What the map says at the building, in one sentence, from the site-flags
 * lookup at the geocoded point: the zone, what FEMA's legend calls it, and
 * what it means for a loan. A point with no zone polygon is said to be off
 * FEMA's digital map — every digitally mapped area carries a zone, Zone X
 * included — never "no hazard".
 */
export function floodZoneLine(
  flood: SiteFlagsResult["flood"] | undefined,
  legend: readonly NfhlLegendEntry[] = [],
): string | null {
  if (flood === undefined || flood === "unavailable") return null;
  if (flood === null) {
    return "FEMA's digital flood map has no zone at the building's point — the area may not be mapped digitally; check the effective paper map with FEMA's Map Service Center.";
  }
  const zone = `Zone ${flood.zone}`;
  if (isMinimalHazard(flood)) {
    return `The building sits in ${zone}, an area of minimal flood hazard, which FEMA maps and leaves undrawn — the shading, where there is any, is the hazard nearby.`;
  }
  const entry = legendEntryFor(legend, flood);
  // FEMA's own name for what the building's zone is drawn as.
  const called = entry ? ` (${entry.label.toLowerCase()})` : "";
  if (flood.isHighRisk) {
    return `The building sits in ${zone}${called}, a Special Flood Hazard Area: a federally backed loan requires flood insurance, and the premium belongs in the expense line.`;
  }
  return `The building sits in ${zone}${called}, outside the Special Flood Hazard Area: flood insurance is not required by a federally backed lender, though the hazard is mapped.`;
}

/** The pairs that pick FEMA's three common entries out of the legend: the
 *  1% annual chance zone, the regulatory floodway and the 0.2% zone. Chosen
 *  by FEMA's own zone values, not by label, so a relabelled entry still
 *  lands. */
const COMMON_KEYS = ["AE,<NULL>", "AE,FLOODWAY", "X,0.2 PCT ANNUAL CHANCE FLOOD HAZARD"];

/**
 * The key the Flood tab draws under the map: the building's own zone first,
 * marked, then the common three FEMA draws most often, each once, in FEMA's
 * swatches. Four at most — the other entries (levees, future conditions, an
 * undetermined area) show up only as the building's own.
 */
export function floodKey(
  legend: readonly NfhlLegendEntry[],
  flood: SiteFlagsResult["flood"] | undefined,
): { label: string; image: string | null; here: boolean }[] {
  const own = flood && flood !== "unavailable" ? legendEntryFor(legend, flood) : null;
  const common = COMMON_KEYS.map((k) => legend.find((e) => e.values.some((v) => v.trim().toUpperCase() === k)) ?? null);
  const out: { label: string; image: string | null; here: boolean }[] = [];
  for (const e of [own, ...common]) {
    if (!e || out.some((o) => o.label === e.label)) continue;
    out.push({ label: e.label, image: e.image, here: e === own });
  }
  return out;
}
