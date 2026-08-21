// GET /api/deals/[id]/photo — streams the deal's Street View image with the
// API key kept server-side. Strict sourcing rules (site-polish spec):
//   1. Google Street View Static API ONLY, and only after the METADATA
//      endpoint confirms real imagery exists at the address (status OK).
//   2. No key configured, or no imagery -> 404. The page then shows its
//      clean address-only card. Never a stock photo, never AI imagery,
//      never a scraped listing photo.
// The metadata verdict is cached on deals.photo (0027) so Google is asked
// once per address, not per page view. RLS scopes access: the deal must be
// readable by the signed-in caller.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";

const SIZE = "800x450";

interface PhotoCache {
  status: "ok" | "none" | "unconfigured";
  checkedAt: string;
  /** pano location echo from metadata — keeps the image call deterministic */
  panoLat?: number;
  panoLng?: number;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: deal } = await supabase
    .from("deals")
    .select("id, address, photo")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  const address = (deal.address as StructuredAddress | null)?.label;
  if (!key || !address) return new NextResponse(null, { status: 404 });

  // Cached metadata verdict (fresh within 30 days) skips the round trip.
  let cache = (deal.photo as PhotoCache | null) ?? null;
  const fresh =
    cache && Date.now() - Date.parse(cache.checkedAt) < 30 * 86_400_000;
  if (!fresh) {
    try {
      const metaUrl =
        `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(address)}&key=${key}`;
      const meta = (await (await fetch(metaUrl)).json()) as {
        status?: string;
        location?: { lat?: number; lng?: number };
      };
      if (meta.status === "OK") {
        cache = {
          status: "ok",
          checkedAt: new Date().toISOString(),
          panoLat: meta.location?.lat,
          panoLng: meta.location?.lng,
        };
      } else if (meta.status === "ZERO_RESULTS" || meta.status === "NOT_FOUND") {
        // Definitive "no imagery here" — safe to cache.
        cache = { status: "none", checkedAt: new Date().toISOString() };
      } else {
        // OVER_QUERY_LIMIT / REQUEST_DENIED / UNKNOWN_ERROR are transient or
        // config states — 404 this request but never poison the 30-day cache.
        return new NextResponse(null, { status: 404 });
      }
    } catch {
      // Transient failure: report no image THIS request, don't cache a "none".
      return new NextResponse(null, { status: 404 });
    }
    // Best-effort cache write (pre-0027 schema just skips it).
    try {
      await supabase.from("deals").update({ photo: cache }).eq("id", id);
    } catch {
      /* pre-0027 — fine */
    }
  }
  if (cache?.status !== "ok") return new NextResponse(null, { status: 404 });

  const loc =
    cache.panoLat !== undefined && cache.panoLng !== undefined
      ? `${cache.panoLat},${cache.panoLng}`
      : address;
  const imgUrl =
    `https://maps.googleapis.com/maps/api/streetview?size=${SIZE}&location=${encodeURIComponent(loc)}&key=${key}`;
  const img = await fetch(imgUrl);
  if (!img.ok || !img.body) return new NextResponse(null, { status: 404 });
  return new NextResponse(img.body, {
    headers: {
      "content-type": img.headers.get("content-type") ?? "image/jpeg",
      // Immutable-ish: street imagery changes rarely; a day of caching keeps
      // quota use near zero.
      "cache-control": "private, max-age=86400",
    },
  });
}
