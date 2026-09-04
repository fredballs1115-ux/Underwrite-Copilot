// GET /api/imagery/metro/[id] — a real aerial photograph of a covered
// market's business district, for the public homepage.
//
// PUBLIC on purpose: the homepage is public, and nothing here is sensitive —
// the imagery is public domain and the coordinates are downtown addresses.
// The `id` is looked up in a fixed table rather than trusted, so there is no
// user-controlled URL and no way to point this at an arbitrary host.
//
// USGS, deliberately, even though the deal pages now prefer Google: at ~1.2km
// across a card, the required resolution is coarser than NAIP's native
// 0.6-1.0 m/px, so the frame is DOWNSAMPLED and sharp. The building-scale
// softness that made Google worth paying for simply does not arise here — so
// the homepage costs nothing to serve and needs no key.

import { NextResponse } from "next/server";
import { usgsAerialUrl } from "@/lib/basemaps";
import { frameZoom } from "@/lib/imagery-plan";
import { METRO_FRAME_METRES, metroView } from "@/lib/metro-imagery";

const SIZE = { min: 96, max: 1024, defaultW: 480, defaultH: 360 };

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
  const view = metroView(id);
  // Unknown market -> 404, never a guessed location.
  if (!view) return new NextResponse(null, { status: 404 });

  const q = new URL(req.url).searchParams;
  const width = clamp(q.get("w"), SIZE.min, SIZE.max, SIZE.defaultW);
  const height = clamp(q.get("h"), SIZE.min, SIZE.max, SIZE.defaultH);

  const url = usgsAerialUrl({
    center: { lat: view.lat, lng: view.lng },
    zoom: frameZoom({
      widthPx: width,
      lat: view.lat,
      precision: "area",
      source: "aerial",
      frameMetres: METRO_FRAME_METRES,
    }),
    width,
    height,
  });

  let img: Response;
  try {
    img = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const type = img.headers.get("content-type") ?? "";
  // The ArcGIS export endpoint answers 200 with a JSON error body when it
  // dislikes a request, so content-type is the real success test.
  if (!img.ok || !img.body || !type.startsWith("image/")) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(img.body, {
    headers: {
      "content-type": type,
      // A downtown does not move and the id maps to a fixed point, so this
      // response is genuinely immutable. Long public caching is also what
      // keeps a public page from hammering a free federal service.
      "cache-control": "public, max-age=31536000, immutable",
      "x-imagery-source": "USGS The National Map (public domain)",
    },
  });
}
