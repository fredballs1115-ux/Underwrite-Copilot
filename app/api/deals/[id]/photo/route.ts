// GET /api/deals/[id]/photo — the deal's STREET-LEVEL photograph, and only
// that. A picture of the building's front, from Google Street View.
//
// This route is deliberately single-source: it backs the "Street" tab, whose
// whole meaning is "the actual street-level photo". Callers that want
// whichever real picture is available should use /image instead, which falls
// back to the aerial.
//
// Sourcing rules (unchanged since the site-polish spec, now enforced in
// lib/imagery.ts): Street View Static API only, only after the metadata
// endpoint confirms real imagery exists, only for a street-level address, and
// the key never leaves the server. No key or no imagery -> 404, and the page
// shows its clean address-only layout. Never a stock photo, never AI imagery,
// never a scraped listing photo.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import { IMAGE_CREDIT, fetchStreetViewImage } from "@/lib/imagery";

const SIZE = { width: 800, height: 450 };

export async function GET(
  _req: Request,
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

  const img = await fetchStreetViewImage(
    supabase,
    id,
    (deal.address as StructuredAddress | null) ?? null,
    (deal.photo as DealVisualCache | null) ?? null,
    SIZE,
  );
  if (!img) return new NextResponse(null, { status: 404 });

  return new NextResponse(img.body, {
    headers: {
      "content-type": img.headers.get("content-type") ?? "image/jpeg",
      // Street imagery changes rarely; a day of caching keeps quota near zero.
      "cache-control": "private, max-age=86400",
      "x-image-credit": IMAGE_CREDIT.streetview,
    },
  });
}
