// GET /api/deals/[id]/image — THE picture of this building.
//
// Not "a Street View image" or "an aerial image" — whichever real photograph
// of this property we can actually get, best first: the building's own
// photograph (the cover of its memorandum, or one the reader added), Google
// Street View where there's a key and Google has driven the street, the
// USGS aerial otherwise. One URL, so a caller that just wants "the picture
// of this deal" — a list thumbnail, a card, a header — never has to know
// which source won or handle a 404 that only means "not that source".
//
// 404 still means what it always meant: no address, nothing geocodes, or
// every source failed. Callers render their address-only state. Never a
// stock photo, never AI imagery, never a different building.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import { PICTURE_CREDIT, ensureDealPicture, pictureSizeFor } from "@/lib/deal-picture";
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
    .select("id, address, photo, om_storage_path, is_sample")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  const width = clamp(q.get("w"), SIZE.min, SIZE.max, SIZE.defaultW);
  const height = clamp(q.get("h"), SIZE.min, SIZE.max, SIZE.defaultH);

  // The deal's own photograph first — found in its memorandum on the first
  // ask and stored, so the plan below can serve it.
  const cache = (deal.photo as DealVisualCache | null) ?? null;
  const picture = await ensureDealPicture(supabase, id, {
    omPath: (deal.om_storage_path as string | null) ?? null,
    isSample: !!(deal as { is_sample?: boolean }).is_sample,
    cache,
  });
  const withPicture: DealVisualCache | null = picture ? { ...(cache ?? {}), picture } : cache;

  // What the browser revalidates against, under a URL that never changes. A
  // stored photograph's identity is its path (the stamp of the upload that
  // made it), so a replaced picture — or a picture found where there was
  // only an overhead — is seen on the next view and an unchanged one costs a
  // 304 and no bytes. A map source is dated instead: re-fetched at most once
  // a day, short enough that adding the Street View key upgrades existing
  // deals' pictures the next day rather than after a week of aerials.
  const etag = picture
    ? `W/"${picture[pictureSizeFor({ width, height })]}"`
    : `W/"map:${cache?.geoAt ?? ""}:${new Date().toISOString().slice(0, 10)}:${width}x${height}"`;
  const revalidate = { etag, "cache-control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: revalidate });
  }

  const best = await fetchBestBuildingImage(
    supabase,
    id,
    (deal.address as StructuredAddress | null) ?? null,
    withPicture,
    { width, height },
  );
  if (!best) return new NextResponse(null, { status: 404 });

  const credit =
    best.source === "photo" && picture ? PICTURE_CREDIT[picture.source] : IMAGE_CREDIT[best.source];
  return new NextResponse(best.response.body, {
    headers: {
      "content-type": best.response.headers.get("content-type") ?? "image/jpeg",
      ...revalidate,
      // Lets the caller render the right credit without a second request.
      "x-image-source": best.source,
      "x-image-credit": credit,
    },
  });
}
