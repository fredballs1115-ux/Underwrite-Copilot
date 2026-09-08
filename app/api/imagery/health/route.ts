// GET /api/imagery/health — does property imagery actually work in this
// deployment, and which source is answering?
//
// The point is the Street View key. Setting GOOGLE_MAPS_API_KEY is a console
// -> env-var -> redeploy sequence with several ways to half-succeed: the key
// exists but the Street View Static API isn't enabled, or an API restriction
// excludes it, or billing was never turned on. Every one of those fails the
// same way from the outside — deals keep showing aerials — so without this
// route "did my key take?" is guesswork.
//
// It probes the live endpoints with a known-good address and reports what
// each service actually said. Signed-in users only; the key itself is never
// echoed, only whether it is present and what Google made of it.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { BASEMAPS, usgsAerialUrl } from "@/lib/basemaps";
import { imagePlan } from "@/lib/imagery-plan";
import { googleConfigured } from "@/lib/imagery";
import { geocodeAddress } from "@/lib/geocode";
import { upstreamNote } from "@/lib/upstream-note";

/** A street Google has certainly photographed — so a miss is our config. */
const PROBE = {
  label: "1600 Pennsylvania Avenue NW, Washington, DC 20500",
  lat: 38.8977,
  lng: -77.0365,
};

interface Probe {
  ok: boolean;
  detail: string;
}

async function probeStreetView(key: string | undefined): Promise<Probe> {
  if (!key) {
    return {
      ok: false,
      detail:
        "GOOGLE_MAPS_API_KEY is not set. Deals fall back to the USGS aerial, which is working as designed — set the key to get street-level building photos.",
    };
  }
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(PROBE.label)}&key=${key}`,
      { signal: AbortSignal.timeout(12_000), cache: "no-store" },
    );
    const body = (await res.json()) as { status?: string; error_message?: string };
    const status = body.status ?? `HTTP ${res.status}`;
    if (status === "OK") {
      return { ok: true, detail: "OK — Street View imagery is being served." };
    }
    // Google's own error_message is the actionable part: it names the
    // unenabled API or the restriction that rejected the key. The raw text
    // goes to the log; the page gets it short and with anything
    // credential-shaped stripped (an upstream that echoed its request would
    // otherwise hand the key to every signed-in visitor).
    if (body.error_message) console.warn(`[imagery/health] street view: ${body.error_message}`);
    return {
      ok: false,
      detail: body.error_message
        ? `${status}: ${upstreamNote(body.error_message)}`
        : `${status}. REQUEST_DENIED usually means the Street View Static API is not enabled on the project, the key's API restrictions exclude it, or billing is off.`,
    };
  } catch (e) {
    return { ok: false, detail: `Could not reach Google: ${(e as Error).message}` };
  }
}

/** Google satellite via the Maps Static API — a SEPARATE API from Street
 *  View on the same key, so it has its own way of being un-enabled. */
async function probeSatellite(key: string | undefined): Promise<Probe> {
  if (!key) {
    return {
      ok: false,
      detail:
        "GOOGLE_MAPS_API_KEY is not set. Overhead shots fall back to USGS, which is ~0.6-1.0 m/px and cannot frame a single building sharply.",
    };
  }
  const url =
    `https://maps.googleapis.com/maps/api/staticmap?center=${PROBE.lat},${PROBE.lng}` +
    `&zoom=19&size=64x64&scale=2&maptype=satellite&format=jpg&key=${key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.startsWith("image/")) {
      return { ok: true, detail: `OK — Google satellite is being served (${type}).` };
    }
    // Static Maps returns a plain-text reason on 4xx, and it is the actionable
    // part: it names the unenabled API or the restriction that rejected it.
    const text = await res.text();
    console.warn(`[imagery/health] satellite HTTP ${res.status}: ${text.slice(0, 1000)}`);
    return {
      ok: false,
      detail: `HTTP ${res.status}: ${upstreamNote(text)} — usually the Maps Static API is not enabled on the project, or the key's API restrictions exclude it.`,
    };
  } catch (e) {
    return { ok: false, detail: `Could not reach Google: ${(e as Error).message}` };
  }
}

/**
 * The geocoder is the root of every picture: a wrong point makes the aerial,
 * the Street View photo and the map pin all wrong together. Report which
 * service placed the probe address and how far it is from where that
 * address really is — a Census hit within ~50 m is the healthy answer.
 */
async function probeGeocoder(): Promise<Probe & { source?: string; precision?: string; metresOff?: number }> {
  try {
    const g = await geocodeAddress({
      label: PROBE.label,
      street: "1600 Pennsylvania Avenue NW",
      city: "Washington",
      state: "DC",
      zip: "20500",
      county: "",
      submarket: "",
    });
    if (!g) return { ok: false, detail: "Neither Census nor Photon could place a well-known address — both services may be unreachable." };
    // Haversine, metres — small distances, so the sphere is plenty.
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(g.lat - PROBE.lat);
    const dLng = toRad(g.lng - PROBE.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(PROBE.lat)) * Math.cos(toRad(g.lat)) * Math.sin(dLng / 2) ** 2;
    const metresOff = Math.round(2 * R * Math.asin(Math.sqrt(a)));
    const ok = g.precision === "street" && metresOff < 250;
    return {
      ok,
      source: g.source,
      precision: g.precision,
      metresOff,
      detail: ok
        ? `OK — ${g.source} placed it at ${g.precision} precision, ${metresOff} m from the reference point (matched: ${g.matched || "n/a"}).`
        : `${g.source} answered at ${g.precision} precision, ${metresOff} m off. Street-addressed deals will frame wider than a building until Census is reachable.`,
    };
  } catch (e) {
    return { ok: false, detail: `Could not reach the geocoders: ${(e as Error).message}` };
  }
}

async function probeAerial(): Promise<Probe> {
  const url = usgsAerialUrl({
    center: { lat: PROBE.lat, lng: PROBE.lng },
    zoom: 18,
    width: 64,
    height: 64,
  });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.startsWith("image/")) {
      return { ok: true, detail: `OK — USGS returned ${type}.` };
    }
    // The ArcGIS export endpoint answers 200 with a JSON error body, so the
    // content type is the real test and its body is the useful message.
    const text = await res.text();
    console.warn(`[imagery/health] aerial HTTP ${res.status}: ${text.slice(0, 1000)}`);
    return {
      ok: false,
      detail: `HTTP ${res.status}, content-type ${type || "(none)"} — ${upstreamNote(text)}`,
    };
  } catch (e) {
    return { ok: false, detail: `Could not reach USGS: ${(e as Error).message}` };
  }
}

async function probeTiles(): Promise<Record<string, Probe>> {
  const out: Record<string, Probe> = {};
  await Promise.all(
    Object.values(BASEMAPS).map(async (b) => {
      // One real tile over Washington DC at z14 — enough to prove the service
      // name and tile scheme are right, which is the thing that silently
      // renders a basemap as gray canvas.
      const url = b.url
        .replace("{z}", "14")
        .replace("{x}", "4685")
        .replace("{y}", "6267");
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(12_000),
          cache: "no-store",
        });
        const type = res.headers.get("content-type") ?? "";
        out[b.id] =
          res.ok && type.startsWith("image/")
            ? { ok: true, detail: `OK — ${type}` }
            : { ok: false, detail: `HTTP ${res.status}, content-type ${type || "(none)"}` };
      } catch (e) {
        out[b.id] = { ok: false, detail: (e as Error).message };
      }
    }),
  );
  return out;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  const [geocoder, streetView, satellite, aerial, tiles] = await Promise.all([
    probeGeocoder(),
    probeStreetView(key),
    probeSatellite(key),
    probeAerial(),
    probeTiles(),
  ]);

  return NextResponse.json(
    {
      probeAddress: PROBE.label,
      googleConfigured: googleConfigured(),
      // What a street-addressed deal will actually try, in order, right now.
      planForStreetAddressedDeal: imagePlan({
        hasStreetAddress: true,
        googleConfigured: googleConfigured(),
      }),
      // First, because every other picture is only as right as this point.
      geocoder,
      sources: { streetView, satellite, aerial },
      basemapTiles: tiles,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
