// NYC bulk ingest — PLUTO parcels + DOF Rolling Calendar Sales, joined by
// BBL so sales get coordinates (the sales feed publishes none).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ingest/nyc.ts
//   Optional: MAX_ROWS=5000 (smoke run — caps the PLUTO phase; the sales
//             phase caps at half of it), SINCE=2024-01-01 (sales floor)
//
// Datasets (reference-verified 2026-08-22):
//   PLUTO          data.cityofnewyork.us/resource/64uk-42ks  (bbl, lat/lng,
//                  unitstotal, bldgarea, yearbuilt, ownername, bldgclass)
//   Rolling Sales  data.cityofnewyork.us/resource/usep-8jbt  (12-month
//                  citywide deed sales; borough/block/lot, no coordinates)
//
// One-family (class A*) and individual condo units (R*) DROP at the gate —
// the property DB carries investable stock only. Sales whose BBL falls
// outside the fetched PLUTO window ingest without coordinates (they simply
// don't participate in radius comps until a fuller parcel run lands) — the
// log counts them honestly.

import { createClient } from "@supabase/supabase-js";
import {
  normalizeNycBuildingClass,
  normalizeNycCategory,
  numOrNull,
} from "../../lib/ingest/normalize";

const MARKET = "nyc";
const PLUTO = "https://data.cityofnewyork.us/resource/64uk-42ks.json";
const SALES = "https://data.cityofnewyork.us/resource/usep-8jbt.json";
const PLUTO_DATASET = "NYC PLUTO (Primary Land Use Tax Lot Output)";
const PLUTO_URL = "https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks";
const SALES_DATASET = "NYC DOF Citywide Rolling Calendar Sales";
const SALES_URL = "https://data.cityofnewyork.us/dataset/NYC-Citywide-Rolling-Calendar-Sales/usep-8jbt";
const PAGE = 5000;
const MAX_ROWS = Number(process.env.MAX_ROWS ?? 400000);
const SALES_MAX = Math.max(2000, Math.floor(MAX_ROWS / 2));
const SINCE = process.env.SINCE ?? "2024-01-01";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function soda(base: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base}?${qs}`, {
    headers: { accept: "application/json", "user-agent": "underwrite-copilot-ingest/1.0" },
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`SODA HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as Record<string, unknown>[];
}

/** Field-name resolver: Socrata slugs occasionally shift — detect from a
 *  sample row and fail LOUDLY (listing what exists) rather than ingesting
 *  nulls. */
function resolveFields(sample: Record<string, unknown>, wanted: Record<string, string[]>) {
  const keys = Object.keys(sample);
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const [name, candidates] of Object.entries(wanted)) {
    const hit = candidates.find((c) => keys.includes(c));
    if (hit) out[name] = hit;
    else missing.push(`${name} (tried ${candidates.join("/")})`);
  }
  if (missing.length) {
    throw new Error(`dataset fields not found: ${missing.join("; ")} — available: ${keys.join(", ")}`);
  }
  return out;
}

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

// ── Phase A: PLUTO parcels (kept classes only) + bbl→coords map ────────────
const coordsByBbl = new Map<string, { lat: number; lng: number }>();
let plutoSeen = 0;
let plutoKept = 0;
let plutoDropped = 0;

{
  const probe = await soda(PLUTO, { $limit: "1" });
  if (probe.length === 0) throw new Error("PLUTO probe returned no rows");
  const f = resolveFields(probe[0], {
    bbl: ["bbl"],
    address: ["address"],
    lat: ["latitude"],
    lng: ["longitude"],
    cls: ["bldgclass", "building_class"],
    units: ["unitstotal", "units_total"],
    sf: ["bldgarea", "bldg_area"],
    year: ["yearbuilt", "year_built"],
    owner: ["ownername", "owner_name"],
  });
  console.log(`PLUTO fields resolved: ${JSON.stringify(f)}`);

  let offset = 0;
  for (;;) {
    const rows = await soda(PLUTO, {
      $select: Object.values(f).join(","),
      // Server-side: skip the one-family ocean (A*) — the normalizer still
      // gates whatever slips through.
      $where: `${f.cls} is not null and not starts_with(${f.cls}, 'A')`,
      $order: f.bbl,
      $limit: String(PAGE),
      $offset: String(offset),
    });
    if (rows.length === 0) break;
    offset += rows.length;
    plutoSeen += rows.length;

    const props: Record<string, unknown>[] = [];
    for (const r of rows) {
      const norm = normalizeNycBuildingClass(str(r[f.cls]));
      if (!norm.assetClass) {
        plutoDropped += 1;
        continue;
      }
      const bbl = str(r[f.bbl]);
      if (!bbl) continue;
      const lat = numOrNull(r[f.lat]);
      const lng = numOrNull(r[f.lng]);
      if (lat !== null && lng !== null) coordsByBbl.set(bbl.split(".")[0], { lat, lng });
      props.push({
        market: MARKET,
        parcel_id: bbl.split(".")[0],
        address: str(r[f.address]),
        lat,
        lng,
        land_use_raw: str(r[f.cls]),
        asset_class: norm.assetClass,
        units: numOrNull(r[f.units]),
        building_sf: numOrNull(r[f.sf]),
        year_built: numOrNull(r[f.year]),
        assessed_value: null, // PLUTO carries assessed land/total in other fields — not fetched v1
        owner_name: str(r[f.owner]),
        owner_mailing: null,
        owner_absentee: null, // PLUTO has no mailing address — never guessed
        source_dataset: PLUTO_DATASET,
        source_url: PLUTO_URL,
        ingested_at: new Date().toISOString(),
      });
    }
    if (props.length) {
      const { error } = await supabase.from("properties").upsert(props, { onConflict: "market,parcel_id" });
      if (error) throw new Error(`properties upsert: ${error.message}`);
      plutoKept += props.length;
    }
    console.log(`PLUTO → seen ${plutoSeen} · kept ${plutoKept} · dropped ${plutoDropped}`);
    if (plutoSeen >= MAX_ROWS) {
      console.log(`MAX_ROWS ${MAX_ROWS} reached on PLUTO — stopping phase A (re-run to continue; upserts idempotent).`);
      break;
    }
  }
}

// ── Phase B: rolling sales, coords via the bbl map ─────────────────────────
const BOROUGH_CODE: Record<string, string> = {
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5",
  MANHATTAN: "1", BRONX: "2", BROOKLYN: "3", QUEENS: "4", "STATEN ISLAND": "5",
};
let salesSeen = 0;
let salesKept = 0;
let salesNoCoords = 0;
let salesDropped = 0;

{
  const probe = await soda(SALES, { $limit: "1" });
  if (probe.length === 0) throw new Error("rolling-sales probe returned no rows");
  const f = resolveFields(probe[0], {
    borough: ["borough"],
    block: ["block"],
    lot: ["lot"],
    category: ["building_class_category"],
    address: ["address"],
    price: ["sale_price"],
    date: ["sale_date"],
    sf: ["gross_square_feet", "gross_sqft"],
    units: ["total_units"],
  });
  console.log(`rolling-sales fields resolved: ${JSON.stringify(f)}`);

  let offset = 0;
  for (;;) {
    const rows = await soda(SALES, {
      $order: `${f.date} DESC`,
      $limit: String(PAGE),
      $offset: String(offset),
    });
    if (rows.length === 0) break;
    offset += rows.length;
    salesSeen += rows.length;

    const deeds: Record<string, unknown>[] = [];
    for (const r of rows) {
      const norm = normalizeNycCategory(str(r[f.category]));
      if (!norm.assetClass) {
        salesDropped += 1;
        continue;
      }
      const price = numOrNull(r[f.price]);
      const date = (str(r[f.date]) ?? "").slice(0, 10);
      if (!price || price <= 10000 || date < SINCE) continue;
      const boro = BOROUGH_CODE[(str(r[f.borough]) ?? "").toUpperCase().trim()];
      const block = numOrNull(r[f.block]);
      const lot = numOrNull(r[f.lot]);
      if (!boro || block === null || lot === null) continue;
      const bbl = `${boro}${String(block).padStart(5, "0")}${String(lot).padStart(4, "0")}`;
      const c = coordsByBbl.get(bbl) ?? null;
      if (!c) salesNoCoords += 1;
      deeds.push({
        market: MARKET,
        parcel_id: bbl,
        address: str(r[f.address]) ?? bbl,
        sale_date: date,
        price,
        deed_type: null,
        asset_class: norm.assetClass,
        units: numOrNull(r[f.units]),
        building_sf: numOrNull(r[f.sf]),
        lat: c?.lat ?? null,
        lng: c?.lng ?? null,
        source_dataset: SALES_DATASET,
        source_url: SALES_URL,
        ingested_at: new Date().toISOString(),
      });
    }
    if (deeds.length) {
      const { error } = await supabase
        .from("recorded_sales")
        .upsert(deeds, { onConflict: "market,parcel_id,sale_date,price", ignoreDuplicates: true });
      if (error) throw new Error(`recorded_sales upsert: ${error.message}`);
      salesKept += deeds.length;
    }
    console.log(`sales → seen ${salesSeen} · kept ${salesKept} · no-coords ${salesNoCoords} · dropped ${salesDropped}`);
    if (salesSeen >= SALES_MAX) {
      console.log(`sales cap ${SALES_MAX} reached — stopping.`);
      break;
    }
  }
}

console.log(
  `nyc ingest complete: ${plutoKept} parcels (${plutoDropped} dropped at the gate), ` +
    `${salesKept} sales since ${SINCE} (${salesNoCoords} without coords — outside the fetched PLUTO window; ` +
    `re-run with a bigger MAX_ROWS to fill).`
);
