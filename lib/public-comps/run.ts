import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { abbrevState, type StructuredAddress } from "@/lib/address";
import {
  compStats,
  finalizeComps,
  HONESTY_NOTE,
  providerFor,
  type RecordComp,
  type RecordCompsResult,
} from "./core";

// The background half of public-record comps: geocode the subject (Photon —
// the same free OSM service the address autocomplete uses), pick the
// jurisdiction's provider, query it, widen once if thin, store the result on
// the deal. Runs via after() with the admin client (no request context), and
// every failure mode lands as a stored status the panel renders honestly —
// never a silent absence.

const RADIUS_KM = 1.6; // 1 mile
const WIDE_RADIUS_KM = 4.8; // 3 miles
const MONTHS_BACK = 24;
const WIDE_MONTHS_BACK = 36;
const MIN_COMPS_BEFORE_WIDENING = 5;
const PENDING_STALE_MS = 10 * 60 * 1000;

/** Claim the deal for a comp pull by writing a {status:"pending"} sentinel
 *  into public_comps. The conditional update is the lock: with `force` off,
 *  only a deal whose column is NULL (or whose pending sentinel went stale —
 *  a deploy killed the after() worker) gets claimed, so the address-save
 *  trigger and the page-render backfill can race freely. Returns true when
 *  this caller won and should schedule runRecordComps. */
export async function claimRecordComps(dealId: string, force = false): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const sentinel = {
    status: "pending",
    comps: [],
    retrievedAt: new Date().toISOString(),
    note: HONESTY_NOTE,
  };
  if (force) {
    await admin.from("deals").update({ public_comps: sentinel }).eq("id", dealId);
    return true;
  }
  const { data: deal } = await admin
    .from("deals")
    .select("id, public_comps")
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) return false;
  const existing = deal.public_comps as RecordCompsResult | null;
  if (existing) {
    const stalePending =
      existing.status === "pending" &&
      Date.now() - Date.parse(existing.retrievedAt ?? "") > PENDING_STALE_MS;
    if (!stalePending) return false;
  }
  // Conditional write: only one racer's update matches the still-unclaimed
  // row. For the stale-pending case, match the OLD sentinel's retrievedAt —
  // matching on status alone would also match the winner's freshly-written
  // sentinel, letting every racer "win".
  const query = admin.from("deals").update({ public_comps: sentinel }).eq("id", dealId);
  const { data } = existing
    ? await query
        .eq("public_comps->>status", "pending")
        .eq("public_comps->>retrievedAt", existing.retrievedAt ?? "")
        .select("id")
    : await query.is("public_comps", null).select("id");
  return (data?.length ?? 0) > 0;
}

/** Exported for lib/site-flags/run.ts — same Photon geocode, one behavior. */
export async function geocode(label: string): Promise<{
  lat: number;
  lng: number;
  state: string;
  city: string;
  county: string;
} | null> {
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(label)}&limit=1`,
      { headers: { "user-agent": "underwrite-copilot/1.0" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: { state?: string; city?: string; county?: string };
      }[];
    };
    const f = body.features?.[0];
    const c = f?.geometry?.coordinates;
    // Finite check (same guard as the client geocoder in comps-map): a
    // malformed feature must fail as geocode_failed, not interpolate
    // null/NaN into provider query strings.
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
    return {
      lng: c[0],
      lat: c[1],
      state: abbrevState(f?.properties?.state ?? ""),
      city: f?.properties?.city ?? "",
      county: f?.properties?.county ?? "",
    };
  } catch {
    return null;
  }
}

/** DB-first comps: ingested deed records (migration 0028, nearby_sales RPC).
 *  Returns null when the table/RPC is absent or empty here — callers fall
 *  through to the live provider APIs. */
async function tryDbComps(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  subject: { lat: number; lng: number },
  assetClass: string,
  radiusKm: number,
  monthsBack: number
): Promise<Omit<RecordComp, "distanceKm">[] | null> {
  try {
    const { data, error } = await admin.rpc("nearby_sales", {
      in_lat: subject.lat,
      in_lng: subject.lng,
      in_radius_m: Math.round(radiusKm * 1000),
      in_asset_class: assetClass.includes("multifamily") ? "multifamily" : null,
      in_months: monthsBack,
      in_limit: 80,
    });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return (data as Record<string, unknown>[]).map((r) => ({
      address: String(r.address ?? r.parcel_id ?? "unknown"),
      lat: Number(r.lat),
      lng: Number(r.lng),
      saleDate: String(r.sale_date ?? "").slice(0, 10),
      price: Number(r.price),
      sqft: r.building_sf === null || r.building_sf === undefined ? null : Number(r.building_sf),
      propertyType: String(r.asset_class ?? "recorded sale"),
      sourceUrl: String(r.source_url ?? ""),
    }));
  } catch {
    return null;
  }
}

/** Shared compute: geocode-agnostic core used by the per-deal background
 *  pull AND the standalone Pull Comps tool. DB records first, live provider
 *  second, honest statuses always. */
export async function computeRecordComps(input: {
  label: string;
  state?: string;
  city?: string;
  county?: string;
  assetClass?: string;
}): Promise<RecordCompsResult> {
  const admin = createSupabaseAdminClient();
  const base = { comps: [], retrievedAt: new Date().toISOString(), note: HONESTY_NOTE };
  const assetClass = (input.assetClass ?? "").toLowerCase();

  const subject = await geocode(input.label);
  if (!subject) {
    return { ...base, status: "geocode_failed", error: "Address did not geocode (Photon)." };
  }

  // 1) Ingested deed records (works in ANY ingested market, national included)
  let radiusKm = RADIUS_KM;
  let monthsBack = MONTHS_BACK;
  let db = await tryDbComps(admin, subject, assetClass, radiusKm, monthsBack);
  if (db && db.length < MIN_COMPS_BEFORE_WIDENING) {
    const wide = await tryDbComps(admin, subject, assetClass, WIDE_RADIUS_KM, WIDE_MONTHS_BACK);
    if (wide && wide.length > db.length) {
      db = wide;
      radiusKm = WIDE_RADIUS_KM;
      monthsBack = WIDE_MONTHS_BACK;
    }
  }
  if (db && db.length > 0) {
    const comps = finalizeComps(db, subject, radiusKm);
    const stored = comps.slice(0, 40);
    return {
      ...base,
      status: stored.length ? "ok" : "no_sales",
      providerId: "ingested_db",
      providerName: "Ingested public deed records (property database)",
      datasetUrl: stored[0]?.sourceUrl ?? "",
      subject: { lat: subject.lat, lng: subject.lng, label: input.label },
      params: {
        radiusKm,
        monthsBack,
        classFilter: assetClass.includes("multifamily") ? "multifamily" : "all sales",
      },
      comps: stored,
      stats: compStats(stored),
    };
  }

  // 2) Live provider APIs (the pre-ingestion path). Route on the caller's
  // structured address when it has one (deals do); fall back to whatever
  // jurisdiction the geocoder inferred (the standalone tool types a bare
  // address line).
  const provider = providerFor({
    state: input.state || subject.state,
    city: input.city || subject.city,
    county: input.county || subject.county,
  });
  if (!provider) return { ...base, status: "no_provider" };
  const nowIso = new Date().toISOString();
  const attempt = async (rKm: number, mBack: number) => {
    const url2 = provider.buildUrl({
      lat: subject.lat,
      lng: subject.lng,
      radiusKm: rKm,
      monthsBack: mBack,
      assetClass,
      nowIso,
    });
    const res = await fetch(url2, {
      headers: { accept: "application/json", "user-agent": "underwrite-copilot/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`${provider.id}: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    }
    return finalizeComps(provider.parse(await res.json()), subject, rKm);
  };
  try {
    let rKm = RADIUS_KM;
    let mBack = MONTHS_BACK;
    let comps = await attempt(rKm, mBack);
    if (comps.length < MIN_COMPS_BEFORE_WIDENING) {
      try {
        const widened = await attempt(WIDE_RADIUS_KM, WIDE_MONTHS_BACK);
        rKm = WIDE_RADIUS_KM;
        mBack = WIDE_MONTHS_BACK;
        comps = widened;
      } catch {
        if (comps.length === 0) throw new Error(`${provider.id}: widened query failed`);
      }
    }
    const stored = comps.slice(0, 40);
    return {
      ...base,
      status: stored.length ? "ok" : "no_sales",
      providerId: provider.id,
      providerName: provider.name,
      datasetUrl: provider.datasetUrl,
      subject: { lat: subject.lat, lng: subject.lng, label: input.label },
      params: {
        radiusKm: rKm,
        monthsBack: mBack,
        classFilter: assetClass.includes("multifamily") ? "multifamily/mixed" : "all sales",
      },
      comps: stored,
      stats: compStats(stored),
    };
  } catch (err) {
    return { ...base, status: "provider_error", error: String(err).slice(0, 500) };
  }
}

/** Per-deal background pull: read the deal's address, delegate the actual
 *  compute to computeRecordComps (shared with the standalone Pull Comps
 *  tool), store the result on the deal. */
export async function runRecordComps(dealId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const store = async (result: RecordCompsResult) => {
    await admin.from("deals").update({ public_comps: result }).eq("id", dealId);
  };
  const base = {
    comps: [],
    retrievedAt: new Date().toISOString(),
    note: HONESTY_NOTE,
  };

  try {
    const { data: deal } = await admin
      .from("deals")
      .select("id, address, asset_class")
      .eq("id", dealId)
      .maybeSingle();
    const address = (deal?.address as StructuredAddress | null) ?? null;
    if (!deal) return;
    if (!address?.label) {
      // Claimed but the address vanished — record why instead of a stuck
      // pending sentinel.
      await store({ ...base, status: "no_provider", error: "Deal has no address." });
      return;
    }
    await store(
      await computeRecordComps({
        label: address.label,
        state: address.state,
        city: address.city,
        county: address.county,
        assetClass: (deal.asset_class as string) ?? "",
      })
    );
  } catch (err) {
    await store({
      ...base,
      status: "provider_error",
      error: String(err).slice(0, 500),
    });
  }
}
