// Boston bulk ingest — the yearly Property Assessment roll from Analyze
// Boston (CKAN). Assessment/ownership context for the property DB; the roll
// carries no sale fields and no coordinates, so comps for Boston stay a
// Tier-2 item (MassGIS L3 parcels — see docs/data-sources/ROADMAP.md).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ingest/boston.ts
//   Optional: MAX_ROWS=5000 (smoke), BOSTON_RESOURCE_ID=... (pin a year)
//
// Self-resolving: package_show on the long-stable dataset slug lists the
// per-year resources; the newest datastore-enabled one wins. Field names
// shift across years (PID/parcel_id, AV_TOTAL/TOTAL_VALUE…) — resolved per
// run with LOUD failure, never null-ingestion.

import { createClient } from "@supabase/supabase-js";
import { normalizeBostonLU, absenteeFlag, numOrNull } from "../../lib/ingest/normalize";
import { ckanPages, ckanSearch } from "../../lib/ingest/ckan";
import { resolveFields } from "../../lib/ingest/socrata";

const MARKET = "boston";
const PORTAL = "https://data.boston.gov";
const SLUG = process.env.BOSTON_DATASET_SLUG ?? "property-assessment";
const DATASET = "Boston Property Assessment (Analyze Boston, CKAN)";
const MAX_ROWS = Number(process.env.MAX_ROWS ?? 400000);

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function resolveResource(): Promise<{ id: string; name: string }> {
  if (process.env.BOSTON_RESOURCE_ID) {
    return { id: process.env.BOSTON_RESOURCE_ID, name: "(pinned via env)" };
  }
  const res = await fetch(`${PORTAL}/api/3/action/package_show?id=${encodeURIComponent(SLUG)}`, {
    headers: { accept: "application/json", "user-agent": "underwrite-copilot-ingest/1.0" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(
      `package_show ${SLUG}: HTTP ${res.status} — confirm the dataset slug on ${PORTAL} (registry: docs/data-sources/boston.md) and set BOSTON_DATASET_SLUG.`
    );
  }
  const body = (await res.json()) as {
    success?: boolean;
    result?: { resources?: { id: string; name?: string; datastore_active?: boolean }[] };
  };
  const resources = (body.result?.resources ?? []).filter((r) => r.datastore_active);
  if (!resources.length) {
    throw new Error(`package ${SLUG} has no datastore-enabled resources — inspect it on ${PORTAL}.`);
  }
  // Per-year resources are named like "Property Assessment FY2026" — the
  // highest FY (falling back to list order) is the current roll.
  const fy = (n?: string) => Number((n ?? "").match(/(?:FY|20)(\d{2})/i)?.[1] ?? 0);
  resources.sort((a, b) => fy(b.name) - fy(a.name));
  return { id: resources[0].id, name: resources[0].name ?? resources[0].id };
}

const resource = await resolveResource();
console.log(`resource: ${resource.name} (${resource.id})`);

// Field resolution from a 1-row sample (names drift across roll years).
const sample = (await ckanSearch(PORTAL, resource.id, { limit: "1" })).records?.[0];
if (!sample) throw new Error("resource returned no rows");
const F = resolveFields(sample as Record<string, unknown>, {
  pid: ["PID", "pid", "parcel_id", "MAP_PAR_ID"],
  lu: ["LU", "lu", "LUC", "land_use"],
  st_num: ["ST_NUM", "st_num"],
  st_name: ["ST_NAME", "st_name"],
  city: ["CITY", "city", "MAIL_CITY"],
  zip: ["ZIP_CODE", "ZIPCODE", "zip_code", "zipcode"],
  total_value: ["TOTAL_VALUE", "AV_TOTAL", "total_value", "av_total"],
  year_built: ["YR_BUILT", "yr_built", "YR_BLT"],
  gross_area: ["GROSS_AREA", "gross_area", "LIVING_AREA", "living_area"],
  owner: ["OWNER", "owner", "OWNER1"],
  mail_addr: ["MAIL_ADDRESS", "MAIL_ADDRESSEE", "mail_address", "MAIL_STREET_ADDRESS"],
});
// Unit-bearing suffix is optional across years — probe without failing.
const unitKey = Object.keys(sample).find((k) => /^(UNIT_NUM|unit_num)$/i.test(k)) ?? null;

let seen = 0;
let keptCount = 0;
let dropped = 0;
let batch: Record<string, unknown>[] = [];

async function flush() {
  if (!batch.length) return;
  const { error } = await supabase
    .from("properties")
    .upsert(batch, { onConflict: "market,parcel_id" });
  if (error) throw new Error(`properties upsert: ${error.message}`);
  batch = [];
}

for await (const page of ckanPages(PORTAL, resource.id, { pageSize: 5000, maxRows: MAX_ROWS })) {
  for (const r of page) {
    seen += 1;
    const norm = normalizeBostonLU(String(r[F.lu] ?? ""));
    if (!norm.assetClass) {
      dropped += 1;
      continue;
    }
    const parcelId = String(r[F.pid] ?? "").trim();
    if (!parcelId) continue;
    const address =
      [r[F.st_num], r[F.st_name], unitKey && r[unitKey] ? `#${r[unitKey]}` : null]
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
        .map((v) => String(v).trim())
        .join(" ") || null;
    const situs = [address, r[F.city], r[F.zip]].filter(Boolean).join(", ");
    batch.push({
      market: MARKET,
      parcel_id: parcelId,
      address: situs || null,
      lat: null, // roll carries no coordinates; MassGIS L3 join is the follow-up
      lng: null,
      land_use_raw: String(r[F.lu] ?? ""),
      asset_class: norm.assetClass,
      units: null,
      building_sf: numOrNull(r[F.gross_area]),
      year_built: numOrNull(r[F.year_built]),
      assessed_value: numOrNull(r[F.total_value]),
      owner_name: (String(r[F.owner] ?? "").trim() || null) as string | null,
      owner_mailing: (String(r[F.mail_addr] ?? "").trim() || null) as string | null,
      owner_absentee: absenteeFlag(address, String(r[F.mail_addr] ?? "") || null),
      source_dataset: `${DATASET} — ${resource.name}`,
      source_url: `${PORTAL}/dataset/${SLUG}`,
      ingested_at: new Date().toISOString(),
    });
    keptCount += 1;
    if (batch.length >= 2000) await flush();
  }
  console.log(`…${seen} rows · kept ${keptCount} · dropped ${dropped}`);
}
await flush();
console.log(
  `boston ingest complete: ${keptCount} properties (${dropped} dropped at the SFR/condo gate) from ${resource.name}.`
);
