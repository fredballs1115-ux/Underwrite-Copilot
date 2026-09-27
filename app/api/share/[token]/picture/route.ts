// GET /api/share/[token]/picture?size=hero|thumb — the deal's OWN photograph
// behind a share link (the cover of its memorandum, or the one the sender
// put on the deal), and only that (#434).
//
// The shared screen is signed-out, so it cannot use /api/deals/[id]/picture
// (a session-scoped route). This one is scoped by the share token, through
// the same resolution the page runs (lib/share-resolve): a link the page
// would refuse gets the same bare 404 here, so the picture never outlives
// the page.
//
// It serves only what is already stored. A share never reads the
// memorandum (SHARED_DEAL_COLUMNS leaves its storage path out on purpose),
// so a deal whose cover has not been lifted yet has no picture here, and
// the page falls back to the aerial. Single-source, so the screen's credit
// line is always exactly the picture on screen.
//
// Revalidated on every view against the stored path (the picture's
// identity) rather than cached for a day: a revoked link's picture stops
// with the link, and a replaced one shows at once.

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DealVisualCache } from "@/lib/deal-location";
import { PICTURE_CREDIT, readPictureBytes } from "@/lib/deal-picture";
import { resolveShare } from "@/lib/share-resolve";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const resolved = await resolveShare(admin, token);
  // One answer for every refusal, as the aerial route gives.
  if (!resolved.ok) return new NextResponse(null, { status: 404 });

  const { dealId, deal } = resolved.share;
  const picture = ((deal.photo as DealVisualCache | null) ?? null)?.picture ?? null;
  if (!picture) return new NextResponse(null, { status: 404 });

  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "hero";
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
    bytes = await readPictureBytes(dealId, picture, size);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: { ...headers, "content-type": "image/jpeg" },
  });
}
