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
import {
  PICTURE_CREDIT,
  SEARCH_WAIT_MS,
  backfillPicture,
  ensureDealPicture,
  lacksExtras,
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
  // The stored path carries the stamp of the upload that made it, so it is
  // the picture's identity: a replaced picture is a new path under the SAME
  // URL, and a browser told to revalidate rather than to trust a day's cache
  // sees it at once — while an unchanged one costs a 304 and no bytes.
  const etag = `W/"${picturePathFor(picture, size)}"`;
  const headers = {
    etag,
    "cache-control": "private, no-cache",
    "x-image-source": "photo",
    "x-image-credit": credit,
  };
  // A photograph stored before its blur-up (#463) or its point of interest
  // (lib/photo-focus) were kept gets them from its own frame after the
  // response — the cover or the gallery photograph this is — so the next
  // page that draws it has its colours before its pixels and holds it at its
  // subject. The thumbnail is a crop, not the frame, so it never serves.
  const stored = picture;
  const gallery = g === null ? null : Number(g);
  const frame = size !== "thumb";
  if (req.headers.get("if-none-match") === etag) {
    // The browser has the photograph. A point never looked for is looked for
    // once, from the hero read from storage in its turn (a missing preview
    // made with it); a preview alone waits for a response that holds the
    // bytes, as it always has, so a photograph whose preview cannot be made
    // is never read from storage on every view.
    if (frame && stored.focus === undefined) after(() => backfillPicture(supabase, id, stored, { gallery }));
    return new NextResponse(null, { status: 304, headers });
  }
  let bytes: Buffer;
  try {
    bytes = await readPictureBytes(id, picture, size);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (frame && lacksExtras(stored)) after(() => backfillPicture(supabase, id, stored, { bytes, gallery }));
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": "image/jpeg", ...headers },
  });
}
