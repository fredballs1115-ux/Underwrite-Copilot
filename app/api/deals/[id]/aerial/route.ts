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
import { resolveDealLocation, type DealVisualCache } from "@/lib/deal-location";
import { IMAGE_CREDIT, fetchAerialImage } from "@/lib/imagery";

const SIZE = { min: 48, max: 1280, defaultW: 800, defaultH: 450 };
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
  const { data: deal } = await supabase
    .from("deals")
    .select("id, address, photo")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const loc = await resolveDealLocation(
    supabase,
    id,
    (deal.address as StructuredAddress | null) ?? null,
    (deal.photo as DealVisualCache | null) ?? null,
  );
  if (!loc) return new NextResponse(null, { status: 404 });

  const q = new URL(req.url).searchParams;
  const img = await fetchAerialImage(loc, {
    width: clamp(q.get("w"), SIZE.min, SIZE.max, SIZE.defaultW),
    height: clamp(q.get("h"), SIZE.min, SIZE.max, SIZE.defaultH),
    // Zoom defaults to how precisely the deal is located (lib/deal-location),
    // so an area-level placement is never framed as if it were one rooftop.
    zoom: q.get("z") ? clamp(q.get("z"), ZOOM.min, ZOOM.max, 0) : undefined,
  });
  if (!img) return new NextResponse(null, { status: 404 });

  return new NextResponse(img.body, {
    headers: {
      "content-type": img.headers.get("content-type") ?? "image/jpeg",
      // Aerial mosaics refresh on a multi-year cycle.
      "cache-control": "private, max-age=604800",
      "x-image-credit": IMAGE_CREDIT.aerial,
    },
  });
}
