#!/usr/bin/env node
// HUD Fair Market Rents → benchmarks table, straight from huduser's API.
// The research files carry each covered metro's figures as read from HUD's
// own yearly file; this pull is the primary source kept current, fetched
// with a (free) HUD API token, so a new fiscal year lands without an edit.
//
//   HUD_API_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/fetch-fmr.mjs
//
// Token: https://www.huduser.gov/hudapi/public/register (free account).
// Areas are matched by NAME against the API's own listMetroAreas output —
// no hardcoded entity ids that could silently go stale; an unmatched metro
// is a loud log line, never a guessed number.
//
// The rows are the app's own shape: lib/fmr's `fmrRows`, the builder the
// app's seeds and scripts/seed-research.mjs use, under each metro's own
// label (`fmrMetroLabel` — the Washington area's for `dc`). So a row written
// here replaces the checked-in file's row of the same key, and a fiscal year
// newer than the file's supersedes it on every page (`newestFmrOnly`).

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
// The one FMR row builder (plain Node strips its types).
import { FMR_BEDS, fiscalYearOn, fmrMetroLabel, fmrRows, fyStart } from "../lib/fmr.ts";

const require = createRequire(import.meta.url);
const { metros: METROS } = require("../data/research/metros.json");

const token = process.env.HUD_API_TOKEN;
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!token || !url || !key) {
  console.error("HUD_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

// metro id → regex the HUD area name must match (anchored on the area names
// metros.json's `fmr` blocks record). DMV entries share the Washington HUD
// area; Dallas and Fort Worth price separately.
const AREA_MATCHERS = [
  { id: "dc", re: /washington-arlington-alexandria/i },
  { id: "pg_county", re: /washington-arlington-alexandria/i },
  { id: "montgomery_county", re: /washington-arlington-alexandria/i },
  { id: "nova", re: /washington-arlington-alexandria/i },
  { id: "baltimore", re: /baltimore-columbia-towson/i },
  { id: "richmond", re: /^richmond, va/i },
  { id: "norfolk_hampton_roads", re: /virginia beach-norfolk/i },
  { id: "philadelphia", re: /philadelphia-camden-wilmington/i },
  { id: "newark_jc", re: /^newark, nj/i },
  { id: "nyc", re: /new york, ny hud metro|new york-newark-jersey city/i },
  { id: "boston", re: /boston-cambridge/i },
  { id: "chicago", re: /chicago-joliet-naperville/i },
  { id: "los_angeles", re: /los angeles-long beach/i },
  { id: "san_francisco", re: /san francisco/i },
  { id: "seattle", re: /seattle-bellevue/i },
  { id: "miami", re: /miami-miami beach-kendall/i },
  { id: "atlanta", re: /atlanta-sandy springs/i },
  { id: "dallas", re: /^dallas, tx/i },
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

// The fiscal year in force today: HUD's FY N starts Oct 1 of N−1.
const today = new Date().toISOString().slice(0, 10);
const fy = fiscalYearOn(today);

// The API's field names for each bedroom count, in lib/fmr's order.
const BED_FIELDS = {
  "0br": ["Efficiency", "efficiency", "studio"],
  "1br": ["One-Bedroom", "one_bedroom", "1br"],
  "2br": ["Two-Bedroom", "two_bedroom", "2br"],
  "3br": ["Three-Bedroom", "three_bedroom", "3br"],
  "4br": ["Four-Bedroom", "four_bedroom", "4br"],
};

let ok = 0;
let failures = 0;
for (const m of AREA_MATCHERS) {
  const entry = METROS.find((e) => e.id === m.id);
  const label = entry ? fmrMetroLabel(entry) : m.id;
  try {
    if (!entry) throw new Error(`no metros.json entry for ${m.id}`);
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
    if (!row) throw new Error(`no basicdata for ${area[nameKey]}, fiscal year ${fy} (SAFMR array without metro row?)`);
    const rents = {};
    for (const bed of FMR_BEDS) {
      const k = BED_FIELDS[bed].find((c) => c in row);
      const v = k ? Number(row[k]) : NaN;
      rents[bed] = Number.isFinite(v) && v > 0 ? v : null;
    }
    const rows = fmrRows(
      {
        fy,
        // The API states no effective day; the fiscal year's first day
        // stands for it (a mid-year revision takes effect later).
        effective: fyStart(fy),
        area: String(area[nameKey]),
        rents,
        status: "verified", // primary source, fetched directly
        sources: ["https://www.huduser.gov/portal/dataset/fmr-api.html"],
        asOf: today,
        note: `HUD FMR API, entity ${area[codeKey]}`,
      },
      label,
    );
    if (!rows.length) throw new Error(`no bedroom rents parsed — fields: ${Object.keys(row).join(", ")}`);
    const { error } = await supabase
      .from("benchmarks")
      .upsert(rows, { onConflict: "sector,metro,metric" });
    if (error) throw new Error(`benchmarks upsert: ${error.message}`);
    ok += 1;
    console.log(`${label}: ${rows[0].note.split(".")[0]} — 2BR $${rents["2br"] ?? "?"} (${area[nameKey]})`);
  } catch (err) {
    failures += 1;
    console.error(`${label}: ${String(err).slice(0, 300)}`);
  }
}
console.log(`fmr fetch: ${ok} metros updated, ${failures} failed.`);
process.exit(ok > 0 ? 0 : 1); // partial success is success (same policy as fetch-rates)
