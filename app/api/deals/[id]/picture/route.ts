// GET /api/deals/[id]/picture?size=hero|thumb — the building's OWN
// photograph, and only that: the cover of its memorandum, lifted out of the
// file on the first ask (lib/deal-picture), or the picture the reader put
// on the deal. Single-source on purpose, so the Photo tab's credit is always
// exactly what is on screen.
//
// 404 means the deal has no picture of its own — no memorandum, none in it,
// the sample deal — and the tab hides itself. For "whichever real picture
// we can get", use /image, which tries this first.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { DealVisualCache } from "@/lib/deal-location";
import { PICTURE_CREDIT, ensureDealPicture, readPictureBytes } from "@/lib/deal-picture";

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
    .select("id, photo, om_storage_path, is_sample")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const picture = await ensureDealPicture(supabase, id, {
    omPath: (deal.om_storage_path as string | null) ?? null,
    isSample: !!(deal as { is_sample?: boolean }).is_sample,
    cache: (deal.photo as DealVisualCache | null) ?? null,
  });
  if (!picture) return new NextResponse(null, { status: 404 });

  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "hero";
  // The stored path carries the stamp of the upload that made it, so it is
  // the picture's identity: a replaced picture is a new path under the SAME
  // URL, and a browser told to revalidate rather than to trust a day's cache
  // sees it at once — while an unchanged one costs a 304 and no bytes.
  const etag = `W/"${picture[size]}"`;
  const headers = {
    etag,
    "cache-control": "private, no-cache",
    "x-image-source": "photo",
    "x-image-credit": PICTURE_CREDIT[picture.source],
  };
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  let bytes: Buffer;
  try {
    bytes = await readPictureBytes(id, picture, size);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": "image/jpeg", ...headers },
  });
}
