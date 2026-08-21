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
        // Surface exactly what the wiring step needs and nothing bulkier:
        // ArcGIS roots list layers/services; layer + CKAN + hub responses
        // carry field schemas; hub v3 items carry the backing server URL.
        const b = body as {
          layers?: { id: number; name: string }[];
          services?: { name: string; type: string }[];
          fields?: { name: string }[];
          result?: { fields?: { id: string }[] };
          data?: { attributes?: { url?: string; fields?: { name: string }[] } };
        };
        const layers = b?.layers?.map((l) => `${l.id}: ${l.name}`);
        const services = b?.services?.map((s) => `${s.name} (${s.type})`);
        const fields =
          b?.fields?.map((f) => f.name) ??
          b?.result?.fields?.map((f) => f.id) ??
          b?.data?.attributes?.fields?.map((f) => f.name);
        const backingUrl = b?.data?.attributes?.url;
        const distilled = layers || services || fields || backingUrl;
        return {
          provider: p.id,
          name: p.name,
          configured: p.configured,
          needsFieldVerification: p.needsFieldVerification,
          httpStatus: res.status,
          ok: res.ok,
          layers,
          services: services?.slice(0, 40),
          fields: fields?.slice(0, 80),
          backingUrl,
          sample: distilled ? undefined : body,
        };
      } catch (err) {
        return {
          provider: p.id,
          name: p.name,
          configured: p.configured,
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
