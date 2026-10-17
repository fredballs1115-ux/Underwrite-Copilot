// GET /api/deals/[id]/flood — the Flood view's picture (#425, #472).
//
// The deal's flood frame (lib/flood-map): the USGS aerial, calmed, with
// FEMA's National Flood Hazard Layer drawn over it in the site's palette,
// drawn once a deal and kept — cut here, from its centre, to the crop its
// pages ask for nearest the `w`×`h` asked (lib/image-frames `FLOOD_FRAMES`:
// the view's 16:9 at 1x and 2x, the filmstrip's, the viewer's whole frame,
// the report's band; research pass 39), never larger than the frame gives in
// that shape. Each crop is cut once a process and kept, a couple at a time.
// Any other size was a decode, a resize and an encode of its own. A US
// federal work over another, public domain both, no key.
//
// The first ask for a deal whose frame is not drawn yet draws it, and waits
// up to WAIT_MS for it; a draw that takes longer goes on behind the request,
// which answers 503 with a Retry-After so the page asks again and finds it.
// `?meta=1` answers what the frame shows instead of the picture — the
// classes each crop keys — for a page rendered before the frame existed, and
// says by its status which of the two a failed picture was: 404 where there
// is nothing to draw (no street address, no location, a placement no finer
// than a neighbourhood, whose centre is not the building), 503 where the
// frame is not drawn yet.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import { resolveDealLocation, type DealVisualCache } from "@/lib/deal-location";
import { ensureFloodFrame, floodCrop } from "@/lib/flood-map";
import { FLOOD_FRAMES, FLOOD_VIEW, nearestFrame } from "@/lib/image-frames";

const WAIT_MS = 50_000;

const nothing = () => new NextResponse(null, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: deal } = await supabase.from("deals").select("id, address, photo").eq("id", id).maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const address = (deal.address as StructuredAddress | null) ?? null;
  // A street address only: a neighbourhood placement's frame would invite
  // reading the zone at its centre as the building's.
  if (!address?.street?.trim()) return nothing();
  const cache = (deal.photo as DealVisualCache | null) ?? null;
  const loc = await resolveDealLocation(supabase, id, address, cache);
  if (!loc || loc.precision === "area") return nothing();

  const record = await ensureFloodFrame(supabase, id, loc, cache, { waitMs: WAIT_MS });
  if (!record) {
    return new NextResponse(null, { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } });
  }

  const q = new URL(req.url).searchParams;
  if (q.get("meta")) {
    return NextResponse.json({ classes: record.classes, at: record.at }, { headers: { "cache-control": "private, max-age=300" } });
  }
  // A size no page asks for is the listed crop nearest it; none at all is the
  // view's own, as it always was.
  const frame = nearestFrame(FLOOD_FRAMES, q.get("w"), q.get("h"), FLOOD_VIEW);
  try {
    const jpeg = await floodCrop(id, record, frame.w, frame.h);
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "content-type": "image/jpeg",
        // A day: FEMA revises a map by a letter of map revision, not by the
        // hour, and the page's URL names the point the frame is drawn around.
        "cache-control": "private, max-age=86400",
        "x-image-credit": "Flood hazard: FEMA National Flood Hazard Layer; imagery: USGS The National Map",
      },
    });
  } catch {
    return new NextResponse(null, { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } });
  }
}
