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
import { streetViewConfigured } from "@/lib/imagery";

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
    // unenabled API or the restriction that rejected the key.
    return {
      ok: false,
      detail: body.error_message
        ? `${status}: ${body.error_message}`
        : `${status}. REQUEST_DENIED usually means the Street View Static API is not enabled on the project, the key's API restrictions exclude it, or billing is off.`,
    };
  } catch (e) {
    return { ok: false, detail: `Could not reach Google: ${(e as Error).message}` };
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
    return {
      ok: false,
      detail: `HTTP ${res.status}, content-type ${type || "(none)"} — ${(await res.text()).slice(0, 300)}`,
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
  const [streetView, aerial, tiles] = await Promise.all([
    probeStreetView(key),
    probeAerial(),
    probeTiles(),
  ]);

  return NextResponse.json(
    {
      probeAddress: PROBE.label,
      streetViewConfigured: streetViewConfigured(),
      // What a street-addressed deal will actually try, in order, right now.
      planForStreetAddressedDeal: imagePlan({
        hasStreetAddress: true,
        streetViewConfigured: streetViewConfigured(),
      }),
      sources: { streetView, aerial },
      basemapTiles: tiles,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
