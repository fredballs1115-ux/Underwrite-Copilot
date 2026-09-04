// GET /api/deals/[id]/location — { lat, lng, precision } for the deal, or 404.
//
// The interactive map is a client component, so it needs coordinates; without
// this it would have to geocode in the browser on every mount. Resolving here
// means one geocode per deal, cached for everyone who opens it, and the
// subject pin agrees with the aerial photo by construction.

import { NextResponse } from "next/server";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { StructuredAddress } from "@/lib/address";
import { resolveDealLocation, type DealVisualCache } from "@/lib/deal-location";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: deal } = await supabase
    .from("deals")
    .select("id, address, photo")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const loc = await resolveDealLocation(
    supabase,
    id,
    (deal.address as StructuredAddress | null) ?? null,
    (deal.photo as DealVisualCache | null) ?? null,
  );
  if (!loc) return NextResponse.json({ error: "no location" }, { status: 404 });

  return NextResponse.json(loc, {
    headers: { "cache-control": "private, max-age=86400" },
  });
}
