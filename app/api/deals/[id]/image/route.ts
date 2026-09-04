// GET /api/deals/[id]/image — THE picture of this building.
//
// Not "a Street View image" or "an aerial image" — whichever real photograph
// of this property we can actually get, best first: Google Street View where
// there's a key and Google has driven the street, the USGS aerial otherwise.
// One URL, so a caller that just wants "the picture of this deal" — a list
// thumbnail, a card, a header — never has to know which source won or handle
// a 404 that only means "not that source".
//
// 404 still means what it always meant: no address, nothing geocodes, or
// every source failed. Callers render their address-only state. Never a
// stock photo, never AI imagery, never a different building.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import { IMAGE_CREDIT, fetchBestBuildingImage } from "@/lib/imagery";

const SIZE = { min: 48, max: 1280, defaultW: 800, defaultH: 450 };

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

  const q = new URL(req.url).searchParams;
  const width = clamp(q.get("w"), SIZE.min, SIZE.max, SIZE.defaultW);
  const height = clamp(q.get("h"), SIZE.min, SIZE.max, SIZE.defaultH);

  const best = await fetchBestBuildingImage(
    supabase,
    id,
    (deal.address as StructuredAddress | null) ?? null,
    (deal.photo as DealVisualCache | null) ?? null,
    { width, height },
  );
  if (!best) return new NextResponse(null, { status: 404 });

  return new NextResponse(best.response.body, {
    headers: {
      "content-type": best.response.headers.get("content-type") ?? "image/jpeg",
      // A day: short enough that adding the Street View key upgrades existing
      // deals' pictures on the next view rather than after a week of aerials.
      "cache-control": "private, max-age=86400",
      // Lets the caller render the right credit without a second request.
      "x-image-source": best.source,
      "x-image-credit": IMAGE_CREDIT[best.source],
    },
  });
}
