// Philadelphia bulk ingest — parcels + last recorded sale from the OPA
// public table via the Carto SQL API (reference-verified endpoint).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ingest/philadelphia.ts
//   Optional: MAX_ROWS=5000 (smoke run), SINCE=2023-01-01 (sales recency floor)
//
// What it loads (single-family DROPPED at the gate by the normalizer):
//   properties      — parcel_id, address, class, SF, year built, assessed
//                     value, owner + mailing (absentee heuristic)
//   recorded_sales  — the parcel's last sale (date+price), located by the
//                     parcel's own lat/lng; deeper RTT deed feed documented
//                     in ingestion_sources.md as the follow-up
// Refresh cadence: OPA updates continually; monthly re-runs upsert in place.

import { createClient } from "@supabase/supabase-js";
import {
  absenteeFlag,
  normalizePhillyCategory,
  numOrNull,
} from "../../lib/ingest/normalize";

const MARKET = "philadelphia";
const DATASET = "Philadelphia OPA properties (opa_properties_public)";
const DATASET_URL =
  "https://opendataphilly.org/datasets/philadelphia-properties-and-assessment-history/";
const PAGE = 2000;
const MAX_ROWS = Number(process.env.MAX_ROWS ?? 400000);
const SINCE = process.env.SINCE ?? "2022-01-01";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

interface OpaRow {
  cartodb_id: number;
  parcel_number: string;
  location: string | null;
  unit: string | null;
  lat: number | null;
  lng: number | null;
  category_code_description: string | null;
  total_livable_area: number | string | null;
  year_built: number | string | null;
  market_value: number | string | null;
  owner_1: string | null;
  mailing_street: string | null;
  mailing_city_state: string | null;
  sale_date: string | null;
  sale_price: number | string | null;
}

async function fetchPage(afterId: number): Promise<OpaRow[]> {
  const sql =
    "SELECT cartodb_id, parcel_number, location, unit, lat, lng, " +
    "category_code_description, total_livable_area, year_built, market_value, " +
    "owner_1, mailing_street, mailing_city_state, sale_date, sale_price " +
    "FROM opa_properties_public " +
    // Exclude the two biggest drop classes server-side to cut transfer ~3x;
    // the normalizer still drops anything that slips through.
    "WHERE category_code_description NOT ILIKE '%SINGLE FAMILY%' " +
    "AND category_code_description NOT ILIKE '%CONDO%' " +
    `AND cartodb_id > ${afterId} ` +
    `ORDER BY cartodb_id LIMIT ${PAGE}`;
  const res = await fetch(`https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(sql)}`, {
    headers: { accept: "application/json", "user-agent": "underwrite-copilot-ingest/1.0" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Carto HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { rows?: OpaRow[] }).rows ?? [];
}

let afterId = 0;
let seen = 0;
let kept = 0;
let sales = 0;
let dropped = 0;

for (;;) {
  const rows = await fetchPage(afterId);
  if (rows.length === 0) break;
  afterId = rows[rows.length - 1].cartodb_id;
  seen += rows.length;

  const props: Record<string, unknown>[] = [];
  const deeds: Record<string, unknown>[] = [];
  for (const r of rows) {
    const norm = normalizePhillyCategory(r.category_code_description);
    if (!norm.assetClass) {
      dropped += 1;
      continue;
    }
    if (!r.parcel_number) continue;
    const address = [r.location, r.unit && `#${r.unit}`].filter(Boolean).join(" ") || null;
    const mailing = [r.mailing_street, r.mailing_city_state].filter(Boolean).join(", ") || null;
    props.push({
      market: MARKET,
      parcel_id: r.parcel_number,
      address,
      lat: numOrNull(r.lat),
      lng: numOrNull(r.lng),
      land_use_raw: r.category_code_description,
      asset_class: norm.assetClass,
      units: null, // OPA carries bedrooms, not unit counts — never invented
      building_sf: numOrNull(r.total_livable_area),
      year_built: numOrNull(r.year_built),
      assessed_value: numOrNull(r.market_value),
      owner_name: r.owner_1,
      owner_mailing: mailing,
      owner_absentee: absenteeFlag(r.location, r.mailing_street),
      source_dataset: DATASET,
      source_url: DATASET_URL,
      ingested_at: new Date().toISOString(),
    });
    const price = numOrNull(r.sale_price);
    const date = (r.sale_date ?? "").slice(0, 10);
    if (price && price > 10000 && date >= SINCE) {
      deeds.push({
        market: MARKET,
        parcel_id: r.parcel_number,
        address: address ?? r.parcel_number,
        sale_date: date,
        price,
        deed_type: null,
        asset_class: norm.assetClass,
        building_sf: numOrNull(r.total_livable_area),
        lat: numOrNull(r.lat),
        lng: numOrNull(r.lng),
        source_dataset: DATASET,
        source_url: `https://property.phila.gov/?p=${encodeURIComponent(r.parcel_number)}`,
        ingested_at: new Date().toISOString(),
      });
    }
  }

  if (props.length) {
    const { error } = await supabase
      .from("properties")
      .upsert(props, { onConflict: "market,parcel_id" });
    if (error) throw new Error(`properties upsert: ${error.message}`);
    kept += props.length;
  }
  if (deeds.length) {
    const { error } = await supabase
      .from("recorded_sales")
      .upsert(deeds, { onConflict: "market,parcel_id,sale_date,price", ignoreDuplicates: true });
    if (error) throw new Error(`recorded_sales upsert: ${error.message}`);
    sales += deeds.length;
  }
  console.log(`page → seen ${seen} · kept ${kept} · sales ${sales} · dropped(sfr/condo) ${dropped}`);
  if (seen >= MAX_ROWS) {
    console.log(`MAX_ROWS ${MAX_ROWS} reached — stopping (re-run to continue; upserts are idempotent).`);
    break;
  }
}
console.log(
  `philadelphia ingest complete: ${kept} properties, ${sales} sales (since ${SINCE}), ${dropped} dropped at the SFR gate.`
);
