// GET /api/deals/[id]/aerial — a real aerial photograph of the deal's actual
// site, as a plain JPEG.
//
// This is the imagery floor of the app: unlike Street View it needs no API
// key and no billing account, so EVERY deal with an address gets a real
// picture of the real place from the moment it is saved. Source is the USGS
// National Map (public domain — see lib/basemaps.ts for why not Esri).
//
// Being an <img> rather than a Leaflet canvas is the point: the same URL
// works in the deal header, a list thumbnail, the shared report and an
// exported memo.
//
// No address, or nothing geocodes -> 404, and the caller renders its
// address-only state. Never a stock photo, never AI imagery, never a
// different building.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import { usgsAerialUrl } from "@/lib/basemaps";
import {
  aerialZoom,
  resolveDealLocation,
  type DealVisualCache,
} from "@/lib/deal-location";

/** Requests are clamped to sizes a page actually renders. */
const SIZE = { min: 64, max: 1280, defaultW: 800, defaultH: 450 };
/** z12 is a metro, z19 is a rooftop; outside that the frame is never useful. */
const ZOOM = { min: 12, max: 19 };

function clamp(raw: string | null, lo: number, hi: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  // RLS scopes this: a deal the caller can't read simply isn't returned.
  const { data: deal } = await supabase
    .from("deals")
    .select("id, address, photo")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const address = (deal.address as StructuredAddress | null) ?? null;
  const cache = (deal.photo as DealVisualCache | null) ?? null;
  const loc = await resolveDealLocation(supabase, id, address, cache);
  if (!loc) return new NextResponse(null, { status: 404 });

  const q = new URL(req.url).searchParams;
  const width = clamp(q.get("w"), SIZE.min, SIZE.max, SIZE.defaultW);
  const height = clamp(q.get("h"), SIZE.min, SIZE.max, SIZE.defaultH);
  // Default zoom follows how precisely we located the deal — an area-level
  // placement must not be framed as if it were one rooftop.
  const zoom = clamp(q.get("z"), ZOOM.min, ZOOM.max, aerialZoom(loc.precision));

  let img: Response;
  try {
    img = await fetch(
      usgsAerialUrl({ center: { lat: loc.lat, lng: loc.lng }, zoom, width, height }),
      { signal: AbortSignal.timeout(10_000) },
    );
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  // The export endpoint answers 200 with a JSON error body when it dislikes a
  // request — treat anything that isn't an image as no image.
  const type = img.headers.get("content-type") ?? "";
  if (!img.ok || !img.body || !type.startsWith("image/")) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(img.body, {
    headers: {
      "content-type": type,
      // Aerial mosaics refresh on a multi-year cycle; a week of private
      // caching keeps this to roughly one upstream fetch per deal.
      "cache-control": "private, max-age=604800",
      // The deal is confidential even though the imagery is public domain.
      "x-imagery-source": "USGS The National Map (public domain)",
    },
  });
}
