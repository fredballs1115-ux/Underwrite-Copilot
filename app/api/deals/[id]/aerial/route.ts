// GET /api/deals/[id]/aerial — the deal's AERIAL photograph, and only that.
//
// Backs the "Aerial" tab, and any caller that specifically wants the
// overhead view. Needs no API key and no billing account: USGS National Map
// orthoimagery is a US federal work in the public domain, which is what makes
// "every deal with an address has a real picture" true rather than
// conditional on someone buying a Google key.
//
// For "whichever real picture we can get", use /image instead.
//
// The size is one its own pages ask for (`DEAL_AERIAL_FRAMES`,
// lib/image-frames; research pass 22): any other width and height is the
// listed frame nearest it. Each size was a USGS export and a sharp pass of
// its own, and the route took any width and height from 48 to 1280.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import {
  GOOGLE_NO_STORE,
  IMAGE_CREDIT,
  fetchBestAerialImage,
  fetchOneImage,
  isGoogleImage,
  type ImageSource,
} from "@/lib/imagery";
import { DEAL_AERIAL_FRAMES, nearestFrame } from "@/lib/image-frames";

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
  // The Google satellite frame is no longer drawn here: no page asks for it
  // since the deal page and the compare columns were held off Google's
  // imagery (a544615), and each frame was a billed Google call. Refused
  // before anything is fetched (research pass 39).
  if (q.get("src") === "satellite") return new NextResponse(null, { status: 404 });
  // `src` pins the answer to ONE source with no fallback. The deal page uses
  // it so each tab can credit exactly what it is showing: crediting USGS for
  // another source's frame drops an attribution. Without it, best-available
  // wins.
  const pinned = ({ usgs: "aerial" } as const)[q.get("src") ?? ""] as ImageSource | undefined;

  const frame = nearestFrame(DEAL_AERIAL_FRAMES, q.get("w"), q.get("h"));
  const size = {
    width: frame.w,
    height: frame.h,
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
      // deal's shot on the next view, not after a week of cached USGS. A
      // Google frame is never kept at all (lib/imagery GOOGLE_NO_STORE).
      "cache-control": isGoogleImage(best.source) ? GOOGLE_NO_STORE : "private, max-age=86400",
      "x-image-source": best.source,
      "x-image-credit": IMAGE_CREDIT[best.source],
    },
  });
}
