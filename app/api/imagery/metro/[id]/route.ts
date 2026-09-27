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
import { metroView } from "@/lib/metro-imagery";
import { fetchMetroOverhead } from "@/lib/metro-overhead";

// 1600 is the hero's backdrop (lib/photos HERO_AERIAL): a 1.2km frame across
// 1600px is ~0.75 m/px, still inside NAIP's native 0.6–1.0 m/px, so even
// the largest frame is not upscaled.
const SIZE = { min: 96, max: 1600, defaultW: 480, defaultH: 360 };

function clamp(raw: string | null, lo: number, hi: number, fallback: number): number {
  // A MISSING dimension is the default, not the floor. This is the same
  // defect the skyline route carried: `Number(null)` and `Number("")` are
  // both 0, which is finite, so the "not a number" branch never fired for
  // the one case it was written for — only for nonsense like `?w=abc`. A
  // request without `?w=` came back 96px wide instead of 480, and without
  // `?h=` 96 tall instead of 360. Nothing renders wrong today because
  // CityPhoto always passes both; it is anyone hitting the route directly
  // who got a thumbnail. The two imagery routes are the only two places in
  // the codebase with this shape — everywhere else guards the empty string
  // before converting.
  if (raw === null || raw.trim() === "") return fallback;
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
