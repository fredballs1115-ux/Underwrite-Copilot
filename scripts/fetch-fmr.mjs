#!/usr/bin/env node
// HUD Fair Market Rents → benchmarks table, straight from huduser's API.
// Closes the repo's standing gap (INTEGRATION_NOTES top-10 #3): ten metros'
// FY2026 FMRs never passed the two-source bar from search snippets — this is
// the primary source, fetched with a (free) HUD API token.
//
//   HUD_API_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/fetch-fmr.mjs
//
// Token: https://www.huduser.gov/hudapi/public/register (free account).
// Areas are matched by NAME against the API's own listMetroAreas output —
// no hardcoded entity ids that could silently go stale; an unmatched metro
// is a loud log line, never a guessed number.

import { createClient } from "@supabase/supabase-js";

const token = process.env.HUD_API_TOKEN;
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!token || !url || !key) {
  console.error("HUD_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// metro id → regex the HUD area name must match (anchored on the HUD-style
// area names already recorded in metros.json notes). DMV entries share the
// Washington HMFA; Dallas and Fort Worth price separately.
const AREA_MATCHERS = [
  { id: "dc", name: "Washington DC", re: /washington-arlington-alexandria/i },
  { id: "pg_county", name: "Prince George's County MD", re: /washington-arlington-alexandria/i },
  { id: "montgomery_county", name: "Montgomery County MD", re: /washington-arlington-alexandria/i },
  { id: "nova", name: "Northern Virginia", re: /washington-arlington-alexandria/i },
  { id: "baltimore", name: "Baltimore MD", re: /baltimore-columbia-towson/i },
  { id: "richmond", name: "Richmond VA", re: /^richmond, va/i },
  { id: "norfolk_hampton_roads", name: "Norfolk / Hampton Roads VA", re: /virginia beach-norfolk/i },
  { id: "philadelphia", name: "Philadelphia PA", re: /philadelphia-camden-wilmington/i },
  { id: "newark_jc", name: "Newark / Jersey City", re: /^newark, nj/i },
  { id: "nyc", name: "New York City", re: /new york, ny hud metro|new york-newark-jersey city/i },
  { id: "boston", name: "Boston", re: /boston-cambridge/i },
  { id: "chicago", name: "Chicago", re: /chicago-joliet-naperville/i },
  { id: "los_angeles", name: "Los Angeles", re: /los angeles-long beach/i },
  { id: "san_francisco", name: "San Francisco", re: /san francisco/i },
  { id: "seattle", name: "Seattle", re: /seattle-bellevue/i },
  { id: "miami", name: "Miami", re: /miami-miami beach-kendall/i },
  { id: "atlanta", name: "Atlanta", re: /atlanta-sandy springs/i },
  { id: "dallas", name: "Dallas-Fort Worth", re: /^dallas, tx/i },
];

const HUD = "https://www.huduser.gov/hudapi/public";
const hud = async (path) => {
  const res = await fetch(`${HUD}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HUD ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const areas = await hud("/fmr/listMetroAreas");
if (!Array.isArray(areas) || !areas.length) {
  console.error("listMetroAreas returned nothing usable — inspect the API response shape.");
  process.exit(1);
}
const nameKey = ["area_name", "metro_name", "name"].find((k) => k in areas[0]);
const codeKey = ["cbsa_code", "code", "metro_code", "entityid"].find((k) => k in areas[0]);
if (!nameKey || !codeKey) {
  console.error(`unexpected area fields: ${Object.keys(areas[0]).join(", ")}`);
  process.exit(1);
}

// Current FMR fiscal year: HUD FY starts Oct 1 (FY2026 = 2025-10-01…).
const now = new Date();
const fy = now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();

let ok = 0;
let failures = 0;
for (const m of AREA_MATCHERS) {
  try {
    const hits = areas.filter((a) => m.re.test(String(a[nameKey] ?? "")));
    if (hits.length === 0) throw new Error(`no HUD area matched ${m.re}`);
    // Prefer the HMFA/exact-shortest name when several match (SAFMR splits).
    hits.sort((a, b) => String(a[nameKey]).length - String(b[nameKey]).length);
    const area = hits[0];
    const data = await hud(`/fmr/data/${encodeURIComponent(area[codeKey])}?year=${fy}`);
    const basic = data?.data?.basicdata;
    // SAFMR areas return an array of ZIP rows plus (usually) a metro row; a
    // plain object is the metro row itself.
    const row = Array.isArray(basic)
      ? basic.find((r) => !r.zip_code) ?? null
      : basic ?? null;
    if (!row) throw new Error(`no basicdata for ${area[nameKey]} FY${fy} (SAFMR array without metro row?)`);
    const beds = [
      ["0br", ["Efficiency", "efficiency", "studio"]],
      ["1br", ["One-Bedroom", "one_bedroom", "1br"]],
      ["2br", ["Two-Bedroom", "two_bedroom", "2br"]],
      ["3br", ["Three-Bedroom", "three_bedroom", "3br"]],
      ["4br", ["Four-Bedroom", "four_bedroom", "4br"]],
    ];
    const rows = [];
    for (const [suffix, candidates] of beds) {
      const k = candidates.find((c) => c in row);
      const v = k ? Number(row[k]) : NaN;
      if (!Number.isFinite(v) || v <= 0) continue;
      rows.push({
        sector: "multifamily",
        metro: m.name,
        metric: `hud_fmr_fy${fy}_${suffix}`,
        low: v,
        high: v,
        unit: "usd_month",
        source: "https://www.huduser.gov/portal/dataset/fmr-api.html",
        as_of: now.toISOString().slice(0, 10),
        status: "verified", // primary source, fetched directly
        note: `FY${fy} FMR, ${area[nameKey]} (HUD FMR API, entity ${area[codeKey]})`,
      });
    }
    if (!rows.length) throw new Error(`no bedroom rents parsed — fields: ${Object.keys(row).join(", ")}`);
    const { error } = await supabase
      .from("benchmarks")
      .upsert(rows, { onConflict: "sector,metro,metric" });
    if (error) throw new Error(`benchmarks upsert: ${error.message}`);
    ok += 1;
    console.log(`${m.name}: FY${fy} 2BR $${rows.find((r) => r.metric.endsWith("_2br"))?.low ?? "?"} (${area[nameKey]})`);
  } catch (err) {
    failures += 1;
    console.error(`${m.name}: ${String(err).slice(0, 300)}`);
  }
}
console.log(`fmr fetch: ${ok} metros updated, ${failures} failed.`);
process.exit(ok > 0 ? 0 : 1); // partial success is success (same policy as fetch-rates)
