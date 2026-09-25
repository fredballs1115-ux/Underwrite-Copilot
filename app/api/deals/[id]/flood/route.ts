// GET /api/deals/[id]/flood — FEMA's flood zones for the deal's aerial frame.
//
// Backs the deal page's Flood tab: a transparent PNG of the National Flood
// Hazard Layer's zones, in FEMA's own symbology, for EXACTLY the frame the
// aerial route draws at the same `w`, `h` and `z` — the same resolved
// location, the same Web-Mercator bbox (lib/basemaps) — so the tab lays one
// over the other. A US federal work, public domain, no key. 404 on any
// failure, so the tab goes rather than showing a plain aerial as a flood map.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import { resolveDealLocation, type DealVisualCache } from "@/lib/deal-location";
import { FLOOD_MIN_ZOOM, FLOOD_ZOOM } from "@/lib/basemaps";
import { MAX_SOURCE_ZOOM } from "@/lib/imagery-plan";
import { fetchFloodOverlay } from "@/lib/flood-map";

const SIZE = { min: 48, max: 1280, defaultW: 1280, defaultH: 576 };

function clamp(raw: string | null, lo: number, hi: number, fallback: number): number {
  const n = Number(raw);
  if (raw === null || !Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

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
  if (!address?.street?.trim()) return new NextResponse(null, { status: 404 });

  const q = new URL(req.url).searchParams;
  const size = {
    width: clamp(q.get("w"), SIZE.min, SIZE.max, SIZE.defaultW),
    height: clamp(q.get("h"), SIZE.min, SIZE.max, SIZE.defaultH),
    // Held to the aerial's own cap (#429): the aerial route draws no finer
    // than the photograph's grain, and an overlay asked for a finer frame
    // would lie over the wrong ground.
    zoom: clamp(q.get("z"), FLOOD_MIN_ZOOM, MAX_SOURCE_ZOOM.aerial, FLOOD_ZOOM),
  };

  const loc = await resolveDealLocation(supabase, id, address, (deal.photo as DealVisualCache | null) ?? null);
  if (!loc) return new NextResponse(null, { status: 404 });
  const overlay = await fetchFloodOverlay(loc, size);
  if (!overlay) return new NextResponse(null, { status: 404 });

  return new NextResponse(overlay.body, {
    headers: {
      "content-type": overlay.headers.get("content-type") ?? "image/png",
      // A day: FEMA revises a map by a letter of map revision, not by the hour.
      "cache-control": "private, max-age=86400",
      "x-image-credit": "Flood hazard: FEMA National Flood Hazard Layer",
    },
  });
}
