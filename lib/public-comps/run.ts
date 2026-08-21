import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StructuredAddress } from "@/lib/address";
import {
  compStats,
  finalizeComps,
  HONESTY_NOTE,
  providerFor,
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
  // Conditional write: only one racer's update matches the still-unclaimed row.
  const query = admin.from("deals").update({ public_comps: sentinel }).eq("id", dealId);
  const { data } = existing
    ? await query.eq("public_comps->>status", "pending").select("id")
    : await query.is("public_comps", null).select("id");
  return (data?.length ?? 0) > 0;
}

async function geocode(label: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(label)}&limit=1`,
      { headers: { "user-agent": "underwrite-copilot/1.0" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      features?: { geometry?: { coordinates?: [number, number] } }[];
    };
    const c = body.features?.[0]?.geometry?.coordinates;
    return c ? { lng: c[0], lat: c[1] } : null;
  } catch {
    return null;
  }
}

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

    const provider = providerFor({
      state: address.state ?? "",
      city: address.city ?? "",
      county: address.county ?? "",
    });
    if (!provider) {
      await store({ ...base, status: "no_provider" });
      return;
    }

    const subject = await geocode(address.label);
    if (!subject) {
      await store({
        ...base,
        status: "geocode_failed",
        providerId: provider.id,
        providerName: provider.name,
        datasetUrl: provider.datasetUrl,
        error: "Address did not geocode (Photon).",
      });
      return;
    }

    const assetClass = ((deal.asset_class as string) ?? "").toLowerCase();
    const nowIso = new Date().toISOString();
    const attempt = async (radiusKm: number, monthsBack: number) => {
      const url = provider.buildUrl({
        lat: subject.lat,
        lng: subject.lng,
        radiusKm,
        monthsBack,
        assetClass,
        nowIso,
      });
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "underwrite-copilot/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`${provider.id}: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
      }
      const parsed = provider.parse(await res.json());
      return finalizeComps(parsed, subject, radiusKm);
    };

    let radiusKm = RADIUS_KM;
    let monthsBack = MONTHS_BACK;
    let comps = await attempt(radiusKm, monthsBack);
    if (comps.length < MIN_COMPS_BEFORE_WIDENING) {
      radiusKm = WIDE_RADIUS_KM;
      monthsBack = WIDE_MONTHS_BACK;
      comps = await attempt(radiusKm, monthsBack);
    }

    await store({
      ...base,
      status: comps.length ? "ok" : "no_sales",
      providerId: provider.id,
      providerName: provider.name,
      datasetUrl: provider.datasetUrl,
      subject: { ...subject, label: address.label },
      params: {
        radiusKm,
        monthsBack,
        classFilter: assetClass.includes("multifamily") ? "multifamily/mixed" : "all sales",
      },
      comps: comps.slice(0, 40),
      stats: compStats(comps),
    });
  } catch (err) {
    await store({
      ...base,
      status: "provider_error",
      error: String(err).slice(0, 500),
    });
  }
}
