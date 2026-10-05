// GET /api/deals/[id]/picture?size=hero|thumb|full — the building's OWN
// photograph, and only that: the cover of its memorandum, lifted out of the
// file on the first ask (lib/deal-picture), or the picture the reader put
// on the deal. Single-source on purpose, so the Photo tab's credit is always
// exactly what is on screen.
//
// `full` is the full-size copy a srcset asks for on a dense screen and in
// the full-screen viewer, kept where the source was larger than the hero;
// a picture with none answers with its hero.
//
// 404 means the deal has no picture of its own — no memorandum, none in it,
// the sample deal — and the tab hides itself. For "whichever real picture
// we can get", use /image, which tries this first.
//
// `?g=N` is the memorandum's Nth photograph beside the cover (#448, the
// deal's gallery), served from what is stored and never searched for here:
// the gallery is read behind the cover (lib/deal-picture).

import { NextResponse, after } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { DealVisualCache } from "@/lib/deal-location";
import { dealPhotoPathOf } from "@/lib/storage-paths";
import { pictureVersion } from "@/lib/deal-banner";
import {
  PICTURE_CREDIT,
  SEARCH_WAIT_MS,
  backfillPreview,
  ensureDealPicture,
  memorandumPhotoCredit,
  picturePathFor,
  readPictureBytes,
  type PictureSize,
} from "@/lib/deal-picture";
import type { DealPicture } from "@/lib/deal-location";

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

  const url = new URL(req.url);
  const cache = (deal.photo as DealVisualCache | null) ?? null;
  const g = url.searchParams.get("g");
  let picture: DealPicture | null;
  let credit: string;
  if (g !== null) {
    // A gallery photograph: stored or nothing, never a search.
    const n = Number(g);
    picture = Number.isInteger(n) && n >= 1 ? (cache?.gallery?.[n - 1] ?? null) : null;
    if ((deal as { is_sample?: boolean }).is_sample) picture = null;
    credit = memorandumPhotoCredit(picture?.page);
  } else {
    picture = await ensureDealPicture(supabase, id, {
      omPath: (deal.om_storage_path as string | null) ?? null,
      isSample: !!(deal as { is_sample?: boolean }).is_sample,
      cache,
      // The page shows the next picture meanwhile; this one may wait its turn.
      waitMs: SEARCH_WAIT_MS,
    });
    credit = picture ? PICTURE_CREDIT[picture.source] : "";
  }
  if (!picture) return new NextResponse(null, { status: 404 });

  const asked = url.searchParams.get("size");
  const size: PictureSize = asked === "thumb" ? "thumb" : asked === "full" ? "full" : "hero";
  // The stored path is the deal's own to write (deals.photo), as the page
  // in the credit above is (`memorandumPhotoCredit` prints only a page
  // number). One that is not this deal's photograph is never read
  // (lib/storage refuses it), and it never reaches a header either: a line
  // break in it had made the route answer 500 (research pass 22).
  const path = dealPhotoPathOf(id, picturePathFor(picture, size));
  if (!path) return new NextResponse(null, { status: 404 });
  // The stored path carries the stamp of the upload that made it, so it is
  // the picture's identity: a replaced picture is a new path under the SAME
  // URL, and a browser told to revalidate rather than to trust a day's cache
  // sees it at once — while an unchanged one costs a 304 and no bytes.
  //
  // A URL that names the picture's version (`v`, lib/deal-banner
  // `pictureVersion`, which the pipeline and the compare page carry) names
  // these exact bytes, which never change under it: it is kept for a year
  // and never asked again. Research pass 25 found every card on the
  // pipeline asking its picture again on every view, each answer a
  // revalidation behind a sign-in check and a read of the deal. A URL with
  // no version, or an older one, is revalidated as before, so a replaced
  // picture is never held under a URL that names the new one's.
  const etag = `W/"${path}"`;
  const version = pictureVersion(path);
  const pinned = version !== null && url.searchParams.get("v") === version;
  const headers = {
    etag,
    "cache-control": pinned ? "private, max-age=31536000, immutable" : "private, no-cache",
    "x-image-source": "photo",
    "x-image-credit": credit,
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
  // A cover stored before previews existed (#463) gets its blur-up from the
  // hero bytes this request already holds, after the response: the next
  // page that draws it has its colours before its pixels.
  if (g === null && size === "hero" && !picture.preview) {
    const cover = picture;
    after(() => backfillPreview(supabase, id, cover, bytes));
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": "image/jpeg", ...headers },
  });
}
