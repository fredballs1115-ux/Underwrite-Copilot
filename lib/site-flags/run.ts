import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { geocode } from "@/lib/public-comps/run";
import { resolveDealLocation, type DealVisualCache } from "@/lib/deal-location";
import type { StructuredAddress } from "@/lib/address";
import { NFHL_ROOT as NFHL_DEFAULT_ROOT } from "@/lib/basemaps";
import {
  parseCensusCounty,
  parseCensusPlace,
  parseCensusTract,
  parseNfhlFlood,
  resolveNfhlLayerId,
  SITE_FLAGS_NOTE,
  SITE_FLAGS_V,
  type CensusPlace,
  type SiteFlagsResult,
} from "./core";

// The background half of site flags, shaped exactly like public-comps/run.ts:
// claim with a pending sentinel, compute, store — every failure mode lands as
// an honest stored status. Data path: geocode (or reuse the comps subject) →
// census tract (Census geocoder, public domain) → Opportunity Zone membership
// (incentive_zones, migration 0030) + FEMA NFHL flood zone at the point.
//
// Endpoint honesty: the Census geocoder URL is the documented public API; the
// NFHL MapServer root is env-overridable (NFHL_SERVICE_ROOT) and the flood
// layer id is RESOLVED from the service's own layer list each run — a FEMA
// re-index becomes a stored "unavailable", never a silently wrong zone.

// One root for the lookup and the Flood tab's map (lib/basemaps).
const NFHL_ROOT = process.env.NFHL_SERVICE_ROOT ?? NFHL_DEFAULT_ROOT;
const PENDING_STALE_MS = 10 * 60 * 1000;

/** Asked twice, with a timeout sized to a cold answer: the runner measured
 *  FEMA's first request of a run at 20–30 s (#472), and one timeout here used
 *  to store the flood zone as unavailable for good. */
const fetchJson = async (url: string): Promise<unknown> => {
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "underwrite-copilot/1.0" },
        signal: AbortSignal.timeout(25_000),
      });
      if (res.ok) return await res.json();
      last = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      if (res.status < 500) break;
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
};

/** Same conditional-claim protocol as claimRecordComps — see that function
 *  for the race analysis. */
export async function claimSiteFlags(dealId: string, force = false): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const sentinel: SiteFlagsResult = {
    status: "pending",
    tractGeoid: null,
    opportunityZone: "unchecked",
    flood: "unavailable",
    retrievedAt: new Date().toISOString(),
    note: SITE_FLAGS_NOTE,
  };
  if (force) {
    await admin.from("deals").update({ site_flags: sentinel }).eq("id", dealId);
    return true;
  }
  const { data: deal } = await admin
    .from("deals")
    .select("id, site_flags")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return false;
  const existing = deal.site_flags as SiteFlagsResult | null;
  if (existing) {
    const stalePending =
      existing.status === "pending" &&
      Date.now() - Date.parse(existing.retrievedAt ?? "") > PENDING_STALE_MS;
    if (!stalePending) return false;
  }
  const query = admin.from("deals").update({ site_flags: sentinel }).eq("id", dealId);
  const { data } = existing
    ? await query
        .eq("site_flags->>status", "pending")
        .eq("site_flags->>retrievedAt", existing.retrievedAt ?? "")
        .select("id")
    : await query.is("site_flags", null).select("id");
  return (data?.length ?? 0) > 0;
}

/** The point's census tract, incorporated place and county — one call, the
 *  three layers of the same `geographies/coordinates` answer (#452). */
async function geographiesFor(
  lat: number,
  lng: number,
): Promise<{ tract: string | null; place: CensusPlace | null | undefined; county: CensusPlace | null }> {
  const u = new URL("https://geocoding.geo.census.gov/geocoder/geographies/coordinates");
  u.searchParams.set("x", String(lng));
  u.searchParams.set("y", String(lat));
  u.searchParams.set("benchmark", "Public_AR_Current");
  u.searchParams.set("vintage", "Current_Current");
  u.searchParams.set("format", "json");
  const json = await fetchJson(u.toString());
  return { tract: parseCensusTract(json), place: parseCensusPlace(json), county: parseCensusCounty(json) };
}

async function floodFor(lat: number, lng: number): Promise<SiteFlagsResult["flood"]> {
  try {
    const layerId = resolveNfhlLayerId(await fetchJson(`${NFHL_ROOT}?f=json`));
    if (layerId === null) return "unavailable";
    const params = new URLSearchParams({
      f: "json",
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      // The zone and what FEMA states about the flood's height there (#472;
      // the fields the runner printed for the layer).
      outFields: "FLD_ZONE,ZONE_SUBTY,STATIC_BFE,DEPTH,LEN_UNIT,V_DATUM",
      returnGeometry: "false",
    });
    return parseNfhlFlood(await fetchJson(`${NFHL_ROOT}/${layerId}/query?${params}`));
  } catch {
    return "unavailable";
  }
}

export async function computeSiteFlags(input: {
  label: string;
  /** the deal's own geocoded point — the one its aerial and flood map are
   *  drawn around (#472), so the zone said is the zone under the ring */
  point?: { lat: number; lng: number } | null;
  /** reuse the comps pull's geocode when the deal already has one */
  subject?: { lat: number; lng: number } | null;
}): Promise<SiteFlagsResult> {
  const admin = createSupabaseAdminClient();
  const base = { retrievedAt: new Date().toISOString(), note: SITE_FLAGS_NOTE };

  let point = input.point ?? input.subject ?? null;
  if (!point) {
    const g = await geocode(input.label);
    if (g) point = { lat: g.lat, lng: g.lng };
  }
  if (!point) {
    return {
      ...base,
      status: "geocode_failed",
      tractGeoid: null,
      opportunityZone: "unchecked",
      flood: "unavailable",
      error: "Address did not geocode (Photon).",
    };
  }
  const subject = { ...point, label: input.label };

  let tractGeoid: string | null = null;
  // Undefined until the Census answers: an unread place is not "in none".
  let place: CensusPlace | null | undefined;
  let county: CensusPlace | null = null;
  let tractError: string | null = null;
  try {
    const g = await geographiesFor(point.lat, point.lng);
    tractGeoid = g.tract;
    place = g.place;
    county = g.county;
  } catch (err) {
    tractError = String(err).slice(0, 200);
  }

  let opportunityZone: SiteFlagsResult["opportunityZone"] = "unchecked";
  if (tractGeoid) {
    try {
      const { data, error } = await admin
        .from("incentive_zones")
        .select("source_dataset")
        .eq("zone_type", "opportunity_zone")
        .eq("tract_geoid", tractGeoid)
        .limit(1);
      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        opportunityZone = { sourceDataset: String(data[0].source_dataset) };
      } else {
        // In-zone vs registry-not-loaded must read differently: only a
        // non-empty registry can honestly say "not in a zone".
        const { count } = await admin
          .from("incentive_zones")
          .select("id", { count: "exact", head: true })
          .eq("zone_type", "opportunity_zone");
        opportunityZone = (count ?? 0) > 0 ? null : "unchecked";
      }
    } catch {
      opportunityZone = "unchecked";
    }
  }

  const flood = await floodFor(point.lat, point.lng);

  const allFailed = tractGeoid === null && flood === "unavailable";
  return {
    ...base,
    status: allFailed ? "lookup_failed" : "ok",
    subject,
    tractGeoid,
    ...(place !== undefined ? { place } : {}),
    ...(county ? { county } : {}),
    opportunityZone,
    flood,
    v: SITE_FLAGS_V,
    ...(tractError ? { error: `census tract: ${tractError}` } : {}),
  };
}

/** Per-deal background run: read the address (and any comps subject point),
 *  compute, store on deals.site_flags. */
export async function runSiteFlags(dealId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const store = async (result: SiteFlagsResult) => {
    await admin.from("deals").update({ site_flags: result }).eq("id", dealId);
  };
  try {
    const { data: deal } = await admin
      .from("deals")
      .select("id, address, public_comps, photo")
      .eq("id", dealId)
      .maybeSingle();
    if (!deal) return;
    const address = deal.address as StructuredAddress | null;
    if (!address?.label) {
      await store({
        status: "geocode_failed",
        tractGeoid: null,
        opportunityZone: "unchecked",
        flood: "unavailable",
        retrievedAt: new Date().toISOString(),
        note: SITE_FLAGS_NOTE,
        error: "Deal has no address.",
      });
      return;
    }
    const subject =
      (deal.public_comps as { subject?: { lat: number; lng: number } } | null)?.subject ?? null;
    // The deal's own point (#472): the location its pictures are drawn
    // around, resolved (and cached) the way the aerial route resolves it.
    let point: { lat: number; lng: number } | null = null;
    try {
      const loc = await resolveDealLocation(admin, dealId, address, (deal.photo as DealVisualCache | null) ?? null);
      if (loc) point = { lat: loc.lat, lng: loc.lng };
    } catch {
      // the comps pull's point, or a geocode of the line, instead
    }
    await store(await computeSiteFlags({ label: address.label, point, subject }));
  } catch (err) {
    await store({
      status: "lookup_failed",
      tractGeoid: null,
      opportunityZone: "unchecked",
      flood: "unavailable",
      retrievedAt: new Date().toISOString(),
      note: SITE_FLAGS_NOTE,
      error: String(err).slice(0, 400),
    });
  }
}
