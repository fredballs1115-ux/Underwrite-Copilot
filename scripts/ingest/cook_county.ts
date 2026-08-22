// Cook County (Chicago) bulk ingest — Assessor Parcel Universe + Parcel
// Sales, joined by PIN so sales get coordinates (the sales feed has none).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ingest/cook_county.ts
//   Optional: MAX_ROWS=5000 (smoke run — caps the universe phase; sales cap
//             at half), SINCE=2024-01-01
//
// Datasets (reference-verified 2026-08-22):
//   Parcel Universe  datacatalog.cookcountyil.gov/resource/nj4t-kc8j
//                    (one row per parcel-YEAR; centroid lat/lng; CCAO class)
//   Parcel Sales     datacatalog.cookcountyil.gov/resource/wvhk-k5uv
//
// CCAO class gate: 211/212 (2-6 unit apartments) survive the residential
// drop; the rest of 2xx (single-family/condo stock) never enters; 3xx
// multifamily and 5xx commercial are kept. PINs zero-pad to 14 digits.

import { createClient } from "@supabase/supabase-js";
import { normalizeCookClass, numOrNull } from "../../lib/ingest/normalize";

const MARKET = "cook_county";
const UNIVERSE = "https://datacatalog.cookcountyil.gov/resource/nj4t-kc8j.json";
const SALES = "https://datacatalog.cookcountyil.gov/resource/wvhk-k5uv.json";
const UNIVERSE_DATASET = "Cook County Assessor — Parcel Universe";
const UNIVERSE_URL = "https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Universe/nj4t-kc8j";
const SALES_DATASET = "Cook County Assessor — Parcel Sales";
const SALES_URL = "https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Sales/wvhk-k5uv";
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
const pin14 = (v: unknown) => {
  const digits = (str(v) ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(14, "0") : null;
};

// ── Phase A: parcel universe (latest year), pin→coords map ─────────────────
const coordsByPin = new Map<string, { lat: number; lng: number }>();
let uniSeen = 0;
let uniKept = 0;
let uniDropped = 0;

{
  const probe = await soda(UNIVERSE, { $limit: "1" });
  if (probe.length === 0) throw new Error("parcel-universe probe returned no rows");
  const f = resolveFields(probe[0], {
    pin: ["pin", "pin14"],
    year: ["year", "tax_year"],
    cls: ["class", "property_class"],
    lat: ["lat", "latitude", "centroid_y"],
    lng: ["lon", "longitude", "lng", "centroid_x"],
  });
  // Address / township are nice-to-have — resolve softly.
  const keys = Object.keys(probe[0]);
  const addrField = ["property_address", "address", "mailing_address"].find((c) => keys.includes(c));
  const cityField = ["property_city", "city", "township_name"].find((c) => keys.includes(c));
  console.log(`universe fields resolved: ${JSON.stringify(f)} addr=${addrField} city=${cityField}`);

  const [agg] = await soda(UNIVERSE, { $select: `max(${f.year}) as max_year` });
  const maxYear = str(agg?.max_year);
  if (!maxYear) throw new Error("could not determine latest universe year");
  console.log(`latest universe year: ${maxYear}`);

  let offset = 0;
  for (;;) {
    const rows = await soda(UNIVERSE, {
      $select: [f.pin, f.cls, f.lat, f.lng, addrField, cityField].filter(Boolean).join(","),
      // Latest year only, and skip the single-family ocean server-side
      // (211/212 kept) — the normalizer still gates the rest.
      $where: `${f.year} = '${maxYear}' and (not starts_with(${f.cls}, '2') or ${f.cls} in ('211','212'))`,
      $order: f.pin,
      $limit: String(PAGE),
      $offset: String(offset),
    });
    if (rows.length === 0) break;
    offset += rows.length;
    uniSeen += rows.length;

    const props: Record<string, unknown>[] = [];
    for (const r of rows) {
      const norm = normalizeCookClass(str(r[f.cls]));
      if (!norm.assetClass) {
        uniDropped += 1;
        continue;
      }
      const pin = pin14(r[f.pin]);
      if (!pin) continue;
      const lat = numOrNull(r[f.lat]);
      const lng = numOrNull(r[f.lng]);
      if (lat !== null && lng !== null) coordsByPin.set(pin, { lat, lng });
      const addr = [addrField && str(r[addrField]), cityField && str(r[cityField])]
        .filter(Boolean)
        .join(", ");
      props.push({
        market: MARKET,
        parcel_id: pin,
        address: addr || null,
        lat,
        lng,
        land_use_raw: str(r[f.cls]),
        asset_class: norm.assetClass,
        units: null, // the universe does not carry unit counts — never invented
        building_sf: null,
        year_built: null,
        assessed_value: null,
        owner_name: null,
        owner_mailing: null,
        owner_absentee: null,
        source_dataset: UNIVERSE_DATASET,
        source_url: UNIVERSE_URL,
        ingested_at: new Date().toISOString(),
      });
    }
    if (props.length) {
      const { error } = await supabase.from("properties").upsert(props, { onConflict: "market,parcel_id" });
      if (error) throw new Error(`properties upsert: ${error.message}`);
      uniKept += props.length;
    }
    console.log(`universe → seen ${uniSeen} · kept ${uniKept} · dropped ${uniDropped}`);
    if (uniSeen >= MAX_ROWS) {
      console.log(`MAX_ROWS ${MAX_ROWS} reached on the universe — stopping phase A (idempotent re-runs continue).`);
      break;
    }
  }
}

// ── Phase B: parcel sales, coords via the pin map ──────────────────────────
let salesSeen = 0;
let salesKept = 0;
let salesNoCoords = 0;
let salesDropped = 0;

{
  const probe = await soda(SALES, { $limit: "1" });
  if (probe.length === 0) throw new Error("parcel-sales probe returned no rows");
  const f = resolveFields(probe[0], {
    pin: ["pin", "pin14"],
    price: ["sale_price", "sale_amount", "price"],
    date: ["sale_date", "recorded_date", "date"],
    cls: ["class", "property_class"],
  });
  const keys = Object.keys(probe[0]);
  const deedField = ["deed_type", "sale_deed_type", "deed_class"].find((c) => keys.includes(c));
  console.log(`sales fields resolved: ${JSON.stringify(f)} deed=${deedField}`);

  let offset = 0;
  for (;;) {
    const rows = await soda(SALES, {
      $where: `${f.date} >= '${SINCE}T00:00:00.000'`,
      $order: `${f.date} DESC`,
      $limit: String(PAGE),
      $offset: String(offset),
    });
    if (rows.length === 0) break;
    offset += rows.length;
    salesSeen += rows.length;

    const deeds: Record<string, unknown>[] = [];
    for (const r of rows) {
      const norm = normalizeCookClass(str(r[f.cls]));
      if (!norm.assetClass) {
        salesDropped += 1;
        continue;
      }
      const price = numOrNull(r[f.price]);
      const date = (str(r[f.date]) ?? "").slice(0, 10);
      const pin = pin14(r[f.pin]);
      if (!price || price <= 10000 || !pin || !date) continue;
      const c = coordsByPin.get(pin) ?? null;
      if (!c) salesNoCoords += 1;
      deeds.push({
        market: MARKET,
        parcel_id: pin,
        address: pin, // sales feed carries no address — PIN is the honest label
        sale_date: date,
        price,
        deed_type: deedField ? str(r[deedField]) : null,
        asset_class: norm.assetClass,
        units: null,
        building_sf: null,
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
  `cook_county ingest complete: ${uniKept} parcels (${uniDropped} dropped at the gate), ` +
    `${salesKept} sales since ${SINCE} (${salesNoCoords} without coords — outside the fetched universe window).`
);
