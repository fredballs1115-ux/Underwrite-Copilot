// GET /api/comps/health — probes every public-records comp provider against
// its live endpoint and reports what the upstream service said, verbatim.
// This is the self-diagnosis half of the config-first provider design: the
// build environment can't reach these portals, so a wrong layer index or
// column name is discovered HERE (Socrata names the bad column; ArcGIS's
// service root lists its layers) and fixed as a one-line config edit.
// Signed-in users only; nothing here is secret, but there's no reason to
// offer free probes to the world.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PROVIDERS } from "@/lib/public-comps/core";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const results = await Promise.all(
    PROVIDERS.map(async (p) => {
      try {
        const res = await fetch(p.healthUrl, {
          headers: { accept: "application/json", "user-agent": "underwrite-copilot/1.0" },
          signal: AbortSignal.timeout(12000),
          cache: "no-store",
        });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = JSON.parse(text);
        } catch {
          body = text.slice(0, 500);
        }
        // ArcGIS roots: surface the layer list so a wrong index is
        // self-correcting from this response alone.
        const layers = (body as { layers?: { id: number; name: string }[] })?.layers?.map(
          (l) => `${l.id}: ${l.name}`
        );
        return {
          provider: p.id,
          name: p.name,
          needsFieldVerification: p.needsFieldVerification,
          httpStatus: res.status,
          ok: res.ok,
          layers: layers ?? undefined,
          sample: layers ? undefined : body,
        };
      } catch (err) {
        return {
          provider: p.id,
          name: p.name,
          needsFieldVerification: p.needsFieldVerification,
          httpStatus: null,
          ok: false,
          error: String(err).slice(0, 300),
        };
      }
    })
  );

  return NextResponse.json({
    note: "ok:false or an error body here means that provider's config needs its endpoint/field names adjusted (lib/public-comps/core.ts). Philadelphia is reference-verified; DC and Maryland ship config-first.",
    results,
  });
}
