// GET /api/deals/[id]/aerial — the deal's AERIAL photograph, and only that.
//
// Backs the "Aerial" tab, and any caller that specifically wants the
// overhead view. Needs no API key and no billing account: USGS National Map
// orthoimagery is a US federal work in the public domain, which is what makes
// "every deal with an address has a real picture" true rather than
// conditional on someone buying a Google key.
//
// For "whichever real picture we can get", use /image instead.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import {
  IMAGE_CREDIT,
  fetchBestAerialImage,
  fetchOneImage,
  type ImageSource,
} from "@/lib/imagery";

const SIZE = { min: 48, max: 1280, defaultW: 800, defaultH: 450 };
/** z12 is a metro, z20 frames one building; outside that it is never useful. */
const ZOOM = { min: 12, max: 20 };

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
  const { data: deal } = await supabase
    .from("deals")
    .select("id, address, photo")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  // `src` pins the answer to ONE source with no fallback. The deal page uses
  // it so each tab can credit exactly what it is showing: crediting Google
  // for a USGS frame is sloppy, and crediting USGS for a Google frame drops
  // an attribution Google requires. Without it, best-available wins.
  const pinned = ({ satellite: "satellite", usgs: "aerial" } as const)[
    q.get("src") ?? ""
  ] as ImageSource | undefined;

  const size = {
    width: clamp(q.get("w"), SIZE.min, SIZE.max, SIZE.defaultW),
    height: clamp(q.get("h"), SIZE.min, SIZE.max, SIZE.defaultH),
    // Zoom defaults per source AND per the pixel width requested
    // (lib/imagery-plan frameZoom), so the frame covers the same ground
    // whether it is a 96px thumbnail or a 1280px hero.
    zoom: q.get("z") ? clamp(q.get("z"), ZOOM.min, ZOOM.max, 0) : undefined,
  };

  const address = (deal.address as StructuredAddress | null) ?? null;
  const cache = (deal.photo as DealVisualCache | null) ?? null;
  const best = pinned
    ? await fetchOneImage(pinned, supabase, id, address, cache, size)
    : await fetchBestAerialImage(supabase, id, address, cache, size);
  if (!best) return new NextResponse(null, { status: 404 });

  return new NextResponse(best.response.body, {
    headers: {
      "content-type": best.response.headers.get("content-type") ?? "image/jpeg",
      // A day, not a week: adding the Google key must upgrade an existing
      // deal's shot on the next view, not after a week of cached USGS.
      "cache-control": "private, max-age=86400",
      "x-image-source": best.source,
      "x-image-credit": IMAGE_CREDIT[best.source],
    },
  });
}
