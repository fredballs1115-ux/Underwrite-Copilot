// GET /api/share/[token]/aerial — the USGS aerial of the deal behind a share
// link, and only that.
//
// The shared screen is signed-out, so it cannot use /api/deals/[id]/aerial
// (a session-scoped route). This one is scoped by the share token instead,
// through the same resolution the page runs (lib/share-resolve): a link the
// page would refuse — malformed, missing, revoked, expired, its deal gone,
// its sender without access — gets the same answer here, a bare 404, so the
// picture never outlives the page.
//
// Pinned to USGS on purpose: The National Map is a US federal work in the
// public domain, so the public page owes no attribution beyond the credit
// line it prints, and needs no key.

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import { IMAGE_CREDIT, fetchOneImage } from "@/lib/imagery";
import { resolveShare } from "@/lib/share-resolve";

const SIZE = { min: 48, max: 1280, defaultW: 960, defaultH: 400 };

function clamp(raw: string | null, lo: number, hi: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const resolved = await resolveShare(admin, token);
  // One answer for every refusal: whoever holds a dead link learns nothing
  // about why it is dead, or whether the deal still exists.
  if (!resolved.ok) return new NextResponse(null, { status: 404 });

  const { dealId, deal } = resolved.share;
  const address = (deal.address as StructuredAddress | null) ?? null;
  if (!address?.label) return new NextResponse(null, { status: 404 });

  const q = new URL(req.url).searchParams;
  const size = {
    width: clamp(q.get("w"), SIZE.min, SIZE.max, SIZE.defaultW),
    height: clamp(q.get("h"), SIZE.min, SIZE.max, SIZE.defaultH),
  };
  const cache = (deal.photo as DealVisualCache | null) ?? null;
  const best = await fetchOneImage("aerial", admin, dealId, address, cache, size);
  if (!best) return new NextResponse(null, { status: 404 });

  return new NextResponse(best.response.body, {
    headers: {
      "content-type": best.response.headers.get("content-type") ?? "image/jpeg",
      // A day, like the deal page's own aerial. Private: the response is
      // scoped to a link, not to the world.
      "cache-control": "private, max-age=86400",
      "x-image-source": best.source,
      "x-image-credit": IMAGE_CREDIT[best.source],
    },
  });
}
