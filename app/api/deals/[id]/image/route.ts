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
//
// `?fallback=cover` (#443) is the pipeline's rule, pictures, not maps, for
// the surfaces that draw whatever this URL answers — the ⌘K list, the comps
// from the reader's own pipeline, the deal page's sticky bar and the
// pipeline map's hover card: the overheads are never tried, and where no
// photograph of the building answers, the deal's cover is drawn instead
// (lib/deal-cover-art `coverSvg`: its kind of building under its own sky,
// the one the pipeline's card wears, laid out for the frame asked for). An
// illustration, plainly not a photograph.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import { PICTURE_CREDIT, SEARCH_WAIT_MS, ensureDealPicture, pictureSizeFor } from "@/lib/deal-picture";
import { GOOGLE_NO_STORE, IMAGE_CREDIT, fetchBestBuildingImage, isGoogleImage } from "@/lib/imagery";
import { coverFor } from "@/lib/deal-cover";
import { COVER_EDITION, coverSvg } from "@/lib/deal-cover-art";
import { shownAssetClass } from "@/lib/pipeline-slots";
import { dealPhotoPathOf } from "@/lib/storage-paths";
import { DEAL_IMAGE_FRAMES, nearestFrame } from "@/lib/image-frames";

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
    .select("id, address, photo, om_storage_path, is_sample, asset_class, extracted_class:extraction->>assetClass")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  // The size is one its own callers ask for (`DEAL_IMAGE_FRAMES`,
  // lib/image-frames; research pass 22): any other is the listed frame
  // nearest it, where the route had drawn any size from 48 to 1280.
  const { w: width, h: height } = nearestFrame(DEAL_IMAGE_FRAMES, q.get("w"), q.get("h"));
  const coverFallback = q.get("fallback") === "cover";

  // The deal's own photograph first — found in its memorandum on the first
  // ask and stored, so the plan below can serve it.
  const cache = (deal.photo as DealVisualCache | null) ?? null;
  const found = await ensureDealPicture(supabase, id, {
    omPath: (deal.om_storage_path as string | null) ?? null,
    isSample: !!(deal as { is_sample?: boolean }).is_sample,
    cache,
    // A thumbnail's slot holds its plate meanwhile; this may wait its turn.
    waitMs: SEARCH_WAIT_MS,
  });
  // deals.photo is the deal owner's to write, and the validator below puts
  // its stored path and its geocode stamp in a header, where a line break
  // had made the route answer 500 (research pass 22). A picture whose path
  // is not this deal's photograph is none of its own (lib/storage would
  // refuse to read it), and a stamp that is not a timestamp is no stamp.
  const picture = found && dealPhotoPathOf(id, found[pictureSizeFor({ width, height })]) ? found : null;
  const withPicture: DealVisualCache | null = picture
    ? { ...(cache ?? {}), picture }
    : cache
      ? { ...cache, picture: undefined }
      : null;
  const geoAt = typeof cache?.geoAt === "string" && /^[0-9A-Za-z:.+-]{1,40}$/.test(cache.geoAt) ? cache.geoAt : "";

  // What the browser revalidates against, under a URL that never changes. A
  // stored photograph's identity is its path (the stamp of the upload that
  // made it), so a replaced picture — or a picture found where there was
  // only an overhead — is seen on the next view and an unchanged one costs a
  // 304 and no bytes. A map source is dated instead: re-fetched at most once
  // a day, short enough that adding the Street View key upgrades existing
  // deals' pictures the next day rather than after a week of aerials.
  const etag = picture
    ? `W/"${picture[pictureSizeFor({ width, height })]}"`
    : `W/"map:${geoAt}:${new Date().toISOString().slice(0, 10)}:${width}x${height}${coverFallback ? `:cover${COVER_EDITION}` : ""}"`;
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
    { overhead: !coverFallback },
  );
  if (!best && coverFallback) {
    const row = deal as { asset_class?: string | null; extracted_class?: string | null };
    const cover = coverFor({
      seed: id,
      assetClass: shownAssetClass(row.asset_class ?? null, { assetClass: row.extracted_class ?? null }),
    });
    return new NextResponse(coverSvg(cover, width, height), {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        // An SVG opened on its own is a document: this one carries no script
        // and no style, and is told so.
        "content-security-policy": "default-src 'none'",
        "x-content-type-options": "nosniff",
        ...revalidate,
        "x-image-source": "cover",
        "x-image-credit": "No photograph of the building yet",
      },
    });
  }
  if (!best) return new NextResponse(null, { status: 404 });

  const credit =
    best.source === "photo" && picture ? PICTURE_CREDIT[picture.source] : IMAGE_CREDIT[best.source];
  return new NextResponse(best.response.body, {
    headers: {
      "content-type": best.response.headers.get("content-type") ?? "image/jpeg",
      // A Google image is never kept, by the browser or anyone (lib/imagery
      // GOOGLE_NO_STORE): no etag to revalidate against.
      ...(isGoogleImage(best.source) ? { "cache-control": GOOGLE_NO_STORE } : revalidate),
      // Lets the caller render the right credit without a second request.
      "x-image-source": best.source,
      "x-image-credit": credit,
    },
  });
}
