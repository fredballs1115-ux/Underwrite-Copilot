// King County WA bulk ingest — the assessor's dedicated Real Property Sales
// extract (the best free sales file in the West) + parcel extract, joined to
// GIS parcel centroids for coordinates.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ingest/king_county.ts
//   Optional: MAX_ROWS=5000 (smoke), SINCE=2023-01-01 (sales recency floor)
//
// Sources (registry: docs/data-sources/seattle.md — the download PAGE is
// search-confirmed; the individual zip URLs follow its long-stable naming and
// are env-overridable because they could not be fetched from the build env):
//   KC_SALES_ZIP_URL  default https://aqua.kingcounty.gov/extranet/assessor/Real%20Property%20Sales.zip
//   KC_PARCEL_ZIP_URL default https://aqua.kingcounty.gov/extranet/assessor/Parcel.zip
//   KC_LOOKUP_ZIP_URL default https://aqua.kingcounty.gov/extranet/assessor/Lookup.zip
//   KC_PARCEL_LAYER_URL — ArcGIS layer with parcel PIN + centroid (King County
//     GIS hub, layer resolves at run time; REQUIRED for coordinates — without
//     it sales still load, minus geog, and the script says so loudly)
// A wrong URL fails with the county's own 404/error — never silent.
//
// Pipeline: lookup (code→description) → parcels (PresentUse → asset class,
// SFR DROPS at the gate) → sales (join parcels, join centroids) → upsert.

import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { normalizeKingCountyUseDesc, numOrNull } from "../../lib/ingest/normalize";
import { csvObjects, type CsvStats } from "../../lib/ingest/csv";
import { arcgisPages } from "../../lib/ingest/arcgis";

const MARKET = "king_county";
const DATASET = "King County Assessor Real Property Sales + Parcel extracts";
const DATASET_URL = "https://info.kingcounty.gov/assessor/datadownload/default.aspx";
const SINCE = process.env.SINCE ?? "2022-01-01";
const MAX_ROWS = Number(process.env.MAX_ROWS ?? 400000);

const SALES_ZIP =
  process.env.KC_SALES_ZIP_URL ??
  "https://aqua.kingcounty.gov/extranet/assessor/Real%20Property%20Sales.zip";
const PARCEL_ZIP =
  process.env.KC_PARCEL_ZIP_URL ??
  "https://aqua.kingcounty.gov/extranet/assessor/Parcel.zip";
const LOOKUP_ZIP =
  process.env.KC_LOOKUP_ZIP_URL ??
  "https://aqua.kingcounty.gov/extranet/assessor/Lookup.zip";
const PARCEL_LAYER = process.env.KC_PARCEL_LAYER_URL ?? "";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Download a zip to /tmp and stream one member out via `unzip -p` (the
 *  extracts are too large to buffer; Actions runners ship unzip). */
async function downloadZip(zipUrl: string, name: string): Promise<string> {
  const path = `/tmp/kc_${name}.zip`;
  const res = await fetch(zipUrl, {
    headers: { "user-agent": "underwrite-copilot-ingest/1.0" },
    signal: AbortSignal.timeout(600000),
  });
  if (!res.ok || !res.body) {
    throw new Error(
      `download ${zipUrl}: HTTP ${res.status} — if the assessor moved the file, find the current link on ${DATASET_URL} and set the KC_*_ZIP_URL env override.`
    );
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

function unzipMember(zipPath: string, memberPattern: string) {
  // -p pipes the member; pattern picks e.g. EXTR_RPSale.csv regardless of case
  const child = spawn("unzip", ["-p", zipPath, memberPattern], { stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  child.stderr.on("data", (d) => (err += String(d)));
  child.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`unzip ${zipPath} ${memberPattern} exited ${code}: ${err.slice(0, 300)}`);
    }
  });
  return child.stdout;
}

const pin = (major: unknown, minor: unknown): string | null => {
  const a = String(major ?? "").replace(/\D/g, "");
  const b = String(minor ?? "").replace(/\D/g, "");
  if (!a || !b) return null;
  return a.padStart(6, "0") + b.padStart(4, "0");
};

const field = (row: Record<string, string>, candidates: string[], file: string): string => {
  const keys = Object.keys(row);
  const hit = candidates.find((c) => keys.some((k) => k.toLowerCase() === c.toLowerCase()));
  if (!hit) {
    throw new Error(
      `${file}: none of ${candidates.join("/")} found — available: ${keys.join(", ")}`
    );
  }
  return keys.find((k) => k.toLowerCase() === hit.toLowerCase())!;
};

// ── 1. Lookup: PresentUse code → description (LU type 102) ─────────────────
console.log("downloading lookup…");
const lookupZip = await downloadZip(LOOKUP_ZIP, "lookup");
const lookupStats: CsvStats = { rows: 0, ragged: 0 };
const useDesc = new Map<string, string>();
{
  let cols: { type: string; item: string; desc: string } | null = null;
  for await (const row of csvObjects(unzipMember(lookupZip, "*ookup*"), lookupStats)) {
    if (!cols) {
      cols = {
        type: field(row, ["LUType", "LU Type", "LOOKUP TYPE"], "lookup"),
        item: field(row, ["LUItem", "LU Item", "LOOKUP ITEM"], "lookup"),
        desc: field(row, ["LUDescription", "LU Description", "DESCRIPTION"], "lookup"),
      };
    }
    if (String(row[cols.type]).trim() === "102") {
      useDesc.set(String(row[cols.item]).trim(), String(row[cols.desc]).trim());
    }
  }
}
if (useDesc.size === 0) {
  throw new Error(
    "lookup file yielded no PresentUse (type 102) rows — inspect the extract's LookUp member; refusing to ingest with unlabeled use codes."
  );
}
console.log(`lookup: ${useDesc.size} present-use codes`);

// ── 2. Parcels: keep non-SFR classes, remember situs + use ─────────────────
console.log("downloading parcel extract…");
const parcelZip = await downloadZip(PARCEL_ZIP, "parcel");
interface KeptParcel {
  address: string | null;
  useRaw: string;
  assetClass: string;
}
const kept = new Map<string, KeptParcel>();
let parcelsSeen = 0;
let parcelsDropped = 0;
{
  const stats: CsvStats = { rows: 0, ragged: 0 };
  let cols: Record<string, string> | null = null;
  for await (const row of csvObjects(unzipMember(parcelZip, "*Parcel*"), stats)) {
    if (!cols) {
      cols = {
        major: field(row, ["Major"], "parcel"),
        minor: field(row, ["Minor"], "parcel"),
        use: field(row, ["PresentUse", "Present Use"], "parcel"),
      };
    }
    parcelsSeen += 1;
    const id = pin(row[cols.major], row[cols.minor]);
    if (!id) continue;
    const code = String(row[cols.use] ?? "").trim();
    const desc = useDesc.get(code) ?? "";
    const norm = normalizeKingCountyUseDesc(desc || `code ${code}`);
    if (!norm.assetClass) {
      parcelsDropped += 1;
      continue;
    }
    kept.set(id, { address: null, useRaw: desc || code, assetClass: norm.assetClass });
  }
  console.log(
    `parcels: ${parcelsSeen} seen · ${kept.size} kept · ${parcelsDropped} dropped at the SFR gate · ${stats.ragged} ragged`
  );
}

// ── 3. Centroids + situs from the GIS layer (coordinates for comps) ────────
const coords = new Map<string, { lat: number; lng: number; address: string | null }>();
if (PARCEL_LAYER) {
  console.log(`paging GIS parcel layer for centroids: ${PARCEL_LAYER}`);
  for await (const page of arcgisPages(PARCEL_LAYER, {
    outFields: "*",
    returnCentroid: true,
    pageSize: 2000,
  })) {
    for (const f of page) {
      const a = f.attributes;
      const keys = Object.keys(a);
      const pinKey = keys.find((k) => k.toUpperCase() === "PIN");
      const addrKey = keys.find((k) => /^(ADDR_FULL|FULL_ADDR|SITUS)/i.test(k));
      if (!pinKey) continue;
      const id = String(a[pinKey] ?? "").replace(/\D/g, "");
      if (!kept.has(id)) continue;
      const lat = numOrNull(f.centroid?.y);
      const lng = numOrNull(f.centroid?.x);
      if (lat === null || lng === null) continue;
      coords.set(id, { lat, lng, address: addrKey ? String(a[addrKey] ?? "") || null : null });
    }
  }
  console.log(`centroids matched: ${coords.size}/${kept.size}`);
} else {
  console.warn(
    "KC_PARCEL_LAYER_URL not set — sales will load WITHOUT coordinates and the radius comps engine cannot see them. Find the parcel layer on the King County GIS hub (registry: seattle.md gis_open_data) and set the env."
  );
}

// ── 4. Sales: stream, filter, join, upsert ─────────────────────────────────
console.log("downloading sales extract…");
const salesZip = await downloadZip(SALES_ZIP, "sales");
let salesSeen = 0;
let salesKept = 0;
let batch: Record<string, unknown>[] = [];
const props = new Map<string, Record<string, unknown>>();

async function flushSales() {
  if (!batch.length) return;
  const { error } = await supabase
    .from("recorded_sales")
    .upsert(batch, { onConflict: "market,parcel_id,sale_date,price", ignoreDuplicates: true });
  if (error) throw new Error(`recorded_sales upsert: ${error.message}`);
  batch = [];
}

{
  const stats: CsvStats = { rows: 0, ragged: 0 };
  let cols: Record<string, string> | null = null;
  for await (const row of csvObjects(unzipMember(salesZip, "*Sale*"), stats)) {
    if (!cols) {
      cols = {
        major: field(row, ["Major"], "sales"),
        minor: field(row, ["Minor"], "sales"),
        date: field(row, ["DocumentDate", "Document Date"], "sales"),
        price: field(row, ["SalePrice", "Sale Price"], "sales"),
      };
    }
    salesSeen += 1;
    if (salesSeen % 250000 === 0) console.log(`…${salesSeen} sale rows scanned`);
    const id = pin(row[cols.major], row[cols.minor]);
    if (!id) continue;
    const parcel = kept.get(id);
    if (!parcel) continue; // SFR/condo or unknown parcel — gate holds
    const price = numOrNull(row[cols.price]);
    // DocumentDate arrives as MM/DD/YYYY in the extract; normalize.
    const dRaw = String(row[cols.date] ?? "").trim();
    const m = dRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const date = m
      ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
      : dRaw.slice(0, 10);
    if (!price || price <= 10000 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < SINCE) continue;
    const c = coords.get(id);
    salesKept += 1;
    batch.push({
      market: MARKET,
      parcel_id: id,
      address: c?.address ?? id,
      sale_date: date,
      price,
      deed_type: null,
      asset_class: parcel.assetClass,
      building_sf: null,
      lat: c?.lat ?? null,
      lng: c?.lng ?? null,
      source_dataset: DATASET,
      source_url: DATASET_URL,
      ingested_at: new Date().toISOString(),
    });
    if (!props.has(id)) {
      props.set(id, {
        market: MARKET,
        parcel_id: id,
        address: c?.address ?? null,
        lat: c?.lat ?? null,
        lng: c?.lng ?? null,
        land_use_raw: parcel.useRaw,
        asset_class: parcel.assetClass,
        units: null,
        building_sf: null,
        year_built: null,
        assessed_value: null,
        owner_name: null,
        owner_mailing: null,
        owner_absentee: null,
        source_dataset: DATASET,
        source_url: DATASET_URL,
        ingested_at: new Date().toISOString(),
      });
    }
    if (batch.length >= 2000) await flushSales();
    if (salesKept >= MAX_ROWS) {
      console.log(`MAX_ROWS ${MAX_ROWS} reached — stopping (idempotent; re-run to continue).`);
      break;
    }
  }
  await flushSales();
  console.log(`sales: ${salesSeen} scanned · ${salesKept} kept (since ${SINCE}) · ${stats.ragged} ragged`);
}

// Properties last (sold parcels only — the full roll is a follow-up):
{
  const rows = [...props.values()];
  for (let i = 0; i < rows.length; i += 2000) {
    const { error } = await supabase
      .from("properties")
      .upsert(rows.slice(i, i + 2000), { onConflict: "market,parcel_id" });
    if (error) throw new Error(`properties upsert: ${error.message}`);
  }
  console.log(`properties: ${rows.length} sold parcels upserted`);
}

console.log(
  `king_county ingest complete. ${coords.size === 0 && PARCEL_LAYER === "" ? "NO COORDINATES (set KC_PARCEL_LAYER_URL) — " : ""}sales ${salesKept}, parcels ${props.size}.`
);
