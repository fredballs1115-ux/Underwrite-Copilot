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
import { metroFrame, metroView } from "@/lib/metro-imagery";
import { fetchMetroOverhead } from "@/lib/metro-overhead";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const view = metroView(id);
  // Unknown market -> 404, never a guessed location.
  if (!view) return new NextResponse(null, { status: 404 });

  // Only the frames the site's own pages ask for are drawn (METRO_FRAMES,
  // up to 1600px: a 1.2km frame across 1600px is ~0.75 m/px, still inside
  // NAIP's native 0.6–1.0 m/px, so even the largest is not upscaled). Any
  // other size is snapped to the nearest of them rather than refused, so a
  // public route cannot be made to draw a new frame per request; a missing
  // size is the gallery tile's.
  const q = new URL(req.url).searchParams;
  const [width, height] = metroFrame(q.get("w"), q.get("h"));

  // The fetch, its success test and the finish live in lib/metro-overhead
  // (#436), shared with the link preview's card.
  const got = await fetchMetroOverhead(id, width, height);
  if (!got) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(got.bytes), {
    headers: {
      "content-type": got.type,
      // A downtown does not move and the id maps to a fixed point, so this
      // response is genuinely immutable. Long public caching is also what
      // keeps a public page from hammering a free federal service.
      "cache-control": "public, max-age=31536000, immutable",
      "x-imagery-source": "USGS The National Map (public domain)",
    },
  });
}
