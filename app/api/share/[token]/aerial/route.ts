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
//
// One frame, the page's own (`SHARE_AERIAL`), whatever size the query names,
// drawn once per deal per process and kept (lib/deal-aerial): anyone holding
// the link can ask, so the link must not be a way to make this process draw
// a picture per request (the security review of 2026-10-01). The link is
// resolved again on every ask before the kept copy is served.

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StructuredAddress } from "@/lib/address";
import type { DealVisualCache } from "@/lib/deal-location";
import { IMAGE_CREDIT } from "@/lib/imagery-plan";
import { SHARE_AERIAL_FRAMES, nearestFrame } from "@/lib/image-frames";
import { heldDealAerial } from "@/lib/deal-aerial";
import { resolveShare } from "@/lib/share-resolve";

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
  const frame = nearestFrame(SHARE_AERIAL_FRAMES, q.get("w"), q.get("h"));
  const cache = (deal.photo as DealVisualCache | null) ?? null;
  const aerial = await heldDealAerial(admin, dealId, address, cache, frame);
  if (!aerial) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(aerial.bytes), {
    headers: {
      "content-type": aerial.type,
      // A day, like the deal page's own aerial. Private: the response is
      // scoped to a link, not to the world.
      "cache-control": "private, max-age=86400",
      "x-image-source": "aerial",
      "x-image-credit": IMAGE_CREDIT.aerial,
    },
  });
}
