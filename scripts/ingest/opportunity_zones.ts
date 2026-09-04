// Opportunity Zone tract registry ingest → incentive_zones (migration 0030).
// Feeds the deal page's site-flags check (tract GEOID membership).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ingest/opportunity_zones.ts
//
// Sources, honestly labeled (registry: docs/data-sources/*.md):
//   1. Maryland OZ dataset — Socrata hu7s-ph9b, SEARCH-CONFIRMED id
//      (montgomery_county/pg_county registry files). Column names resolve at
//      run time with loud failure.
//   2. National HUD/CDFI designated-QOZ ArcGIS layer — the layer URL could
//      NOT be verified from the build environment. Set OZ_NATIONAL_LAYER_URL
//      to the FeatureServer layer (find it via the HUD Opportunity Zones map
//      — registry: miami.md incentive_zones). Without it, only the sources
//      above load, and the summary says so.
// Every row carries source_dataset/source_url/ingested_at. Re-runs upsert.

import { createClient } from "@supabase/supabase-js";
import { soda, resolveFields } from "../../lib/ingest/socrata";
import { arcgisPages } from "../../lib/ingest/arcgis";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const geoid11 = (v: unknown): string | null => {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
};

async function upsertZones(rows: { tract_geoid: string; state: string; name: string | null; source_dataset: string; source_url: string }[]) {
  let n = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000).map((r) => ({
      zone_type: "opportunity_zone",
      ...r,
      ingested_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("incentive_zones")
      .upsert(batch, { onConflict: "zone_type,tract_geoid,source_dataset" });
    if (error) throw new Error(`incentive_zones upsert: ${error.message}`);
    n += batch.length;
  }
  return n;
}

let total = 0;
let failures = 0;

// ── Maryland (Socrata hu7s-ph9b) ────────────────────────────────────────────
try {
  const base = "https://opendata.maryland.gov/resource/hu7s-ph9b.json";
  const sample = (await soda(base, { $limit: "1" }))[0];
  if (!sample) throw new Error("MD OZ dataset returned no rows");
  const F = resolveFields(sample, {
    geoid: ["geoid", "tract", "census_tract", "geoid10", "tract_geoid", "ct2010", "fips", "tractid"],
  });
  const rows: Parameters<typeof upsertZones>[0] = [];
  for (let offset = 0; ; offset += 5000) {
    const page = await soda(base, { $limit: "5000", $offset: String(offset) });
    if (page.length === 0) break;
    for (const r of page) {
      const g = geoid11(r[F.geoid]);
      if (g) rows.push({
        tract_geoid: g,
        state: "MD",
        name: null,
        source_dataset: "Maryland Opportunity Zones (Socrata hu7s-ph9b)",
        source_url: "https://opendata.maryland.gov/d/hu7s-ph9b",
      });
    }
    if (page.length < 5000) break;
  }
  if (!rows.length) throw new Error("no 11-digit GEOIDs parsed from MD OZ dataset");
  total += await upsertZones(rows);
  console.log(`MD: ${rows.length} OZ tracts`);
} catch (err) {
  failures += 1;
  console.error(`MD OZ source failed: ${String(err).slice(0, 300)}`);
}

// ── National (config-first ArcGIS layer) ────────────────────────────────────
const NATIONAL = process.env.OZ_NATIONAL_LAYER_URL ?? "";
if (!NATIONAL) {
  console.warn(
    "OZ_NATIONAL_LAYER_URL not set — national OZ coverage skipped. Locate HUD's designated-QOZ FeatureServer layer (see docs/data-sources/*.md incentive_zones entries) and set the env to load all states in one run."
  );
} else {
  try {
    const rows: Parameters<typeof upsertZones>[0] = [];
    for await (const page of arcgisPages(NATIONAL, { outFields: "*", pageSize: 2000 })) {
      for (const f of page) {
        const a = f.attributes;
        const keys = Object.keys(a);
        const gKey = keys.find((k) => /^(GEOID|GEOID10|CENSUSTRACT|TRACT)/i.test(k));
        const sKey = keys.find((k) => /^(STATE|STUSAB|STATE_ABBR|STATE_NAME)/i.test(k));
        const g = gKey ? geoid11(a[gKey]) : null;
        if (!g) continue;
        rows.push({
          tract_geoid: g,
          state: sKey ? String(a[sKey] ?? "").slice(0, 20) : "",
          name: null,
          source_dataset: "National designated QOZ tracts (ArcGIS layer via OZ_NATIONAL_LAYER_URL)",
          source_url: NATIONAL,
        });
      }
    }
    if (!rows.length) throw new Error("national layer yielded no GEOIDs — wrong layer?");
    total += await upsertZones(rows);
    console.log(`national: ${rows.length} OZ tracts`);
  } catch (err) {
    failures += 1;
    console.error(`national OZ layer failed: ${String(err).slice(0, 300)}`);
  }
}

console.log(`opportunity_zones ingest done: ${total} rows upserted, ${failures} source failures.`);
process.exit(total > 0 ? 0 : 1);
