#!/usr/bin/env node
// Monthly Zillow Observed Rent Index (ZORI) → the `benchmarks` table, one
// row per covered metro for the asking rent and one for its change from a
// year ago. Zillow publishes the metro file as a public CSV, refreshed
// monthly, free to use with attribution (Zillow Research) — which is why
// every row here carries the source and the page carries the credit.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fetch-zori.mjs
//   DRY_RUN=1 node scripts/fetch-zori.mjs   — fetch, match and print; write nothing
//
// WHY A DRY RUN FIRST. The sandbox this is written in cannot reach Zillow,
// so the file's URL, its column shape and the exact RegionName each metro
// goes by are claims until the runner prints them. The dry run prints the
// header, the newest month, and every match — or every miss — by name.
//
// THE FILE. Metro_zori_uc_sfrcondomfr_sm_month.csv: all homes (single-family,
// condo, multifamily), smoothed, not seasonally adjusted, by metro. Columns
// are RegionID, SizeRank, RegionName, RegionType, StateName, then one column
// per month, oldest first, dated the month's LAST day. Rents are dollars a
// month. The first data row is the United States.
//
// MATCHING BY NAME, LIKE THE FMR PULL. Zillow's metros are MSAs named by
// their principal city and state ("Washington, DC"). The four DMV suburbs
// share Washington's row — an MSA figure, filed under each and said so in
// the note — and Newark shares New York's. An unmatched metro is a loud log
// line, never a guessed number.

import { createClient } from "@supabase/supabase-js";

const ZORI_URL =
  "https://files.zillowstatic.com/research/public_csvs/zori/Metro_zori_uc_sfrcondomfr_sm_month.csv";
const SOURCE = "https://www.zillow.com/research/data/";

const dryRun = process.env.DRY_RUN === "1";
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !key)) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required (or DRY_RUN=1).");
  process.exit(1);
}
const supabase = dryRun ? null : createClient(url, key, { auth: { persistSession: false } });

// metro id → the covered metro's name as the benchmarks table files it
// (data/research/metros.json `name`, the same key the FMR pull writes under)
// and the Zillow RegionName whose row it takes.
const METROS = [
  { id: "dc", name: "Washington DC", region: "Washington, DC" },
  { id: "pg_county", name: "Prince George's County MD", region: "Washington, DC", shared: true },
  { id: "montgomery_county", name: "Montgomery County MD", region: "Washington, DC", shared: true },
  { id: "nova", name: "Northern Virginia", region: "Washington, DC", shared: true },
  { id: "baltimore", name: "Baltimore MD", region: "Baltimore, MD" },
  { id: "richmond", name: "Richmond VA", region: "Richmond, VA" },
  { id: "norfolk_hampton_roads", name: "Norfolk / Hampton Roads VA", region: "Virginia Beach, VA" },
  { id: "philadelphia", name: "Philadelphia PA", region: "Philadelphia, PA" },
  { id: "newark_jc", name: "Newark / Jersey City", region: "New York, NY", shared: true },
  { id: "nyc", name: "New York City", region: "New York, NY" },
  { id: "boston", name: "Boston", region: "Boston, MA" },
  { id: "chicago", name: "Chicago", region: "Chicago, IL" },
  { id: "los_angeles", name: "Los Angeles", region: "Los Angeles, CA" },
  { id: "san_francisco", name: "San Francisco", region: "San Francisco, CA" },
  { id: "seattle", name: "Seattle", region: "Seattle, WA" },
  { id: "miami", name: "Miami", region: "Miami, FL" },
  { id: "atlanta", name: "Atlanta", region: "Atlanta, GA" },
  { id: "dallas", name: "Dallas-Fort Worth", region: "Dallas, TX" },
];

/** A CSV line's cells, quotes honoured (a RegionName never has a comma inside quotes today, but a StateName might one day). */
function cells(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const res = await fetch(ZORI_URL, {
  headers: { "user-agent": "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com)" },
  signal: AbortSignal.timeout(60_000),
});
if (!res.ok) {
  console.error(`ZORI: HTTP ${res.status} from ${ZORI_URL}`);
  process.exit(1);
}
const text = await res.text();
const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
const header = cells(lines[0]);
const monthCols = header.map((h, i) => ({ h, i })).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.h));
if (monthCols.length < 13) {
  console.error(`ZORI: expected monthly columns, found ${monthCols.length}; header: ${header.slice(0, 8).join(", ")}`);
  process.exit(1);
}
const newest = monthCols[monthCols.length - 1];
const yearAgo = monthCols[monthCols.length - 13];
const nameIx = header.indexOf("RegionName");
const typeIx = header.indexOf("RegionType");
console.log(
  `ZORI: ${lines.length - 1} rows, ${monthCols.length} months ${monthCols[0].h} → ${newest.h}; ` +
    `${res.headers.get("content-type") ?? "no content type"}, ${Math.round(text.length / 1024)} KB` +
    (dryRun ? " · dry run, not written" : ""),
);

const rows = new Map();
for (const line of lines.slice(1)) {
  const c = cells(line);
  if (c[typeIx] !== "msa") continue;
  rows.set(c[nameIx], c);
}

const out = [];
let matched = 0;
const missed = [];
for (const m of METROS) {
  const c = rows.get(m.region);
  const rent = c ? Number(c[newest.i]) : NaN;
  const back = c ? Number(c[yearAgo.i]) : NaN;
  if (!c || !Number.isFinite(rent) || rent <= 0) {
    missed.push(`${m.id} (${m.region})`);
    continue;
  }
  matched++;
  const yoy = Number.isFinite(back) && back > 0 ? Math.round(((rent / back) - 1) * 1000) / 10 : null;
  const where = m.shared ? ` — the ${m.region} metro area's figure, shared with the MSA` : "";
  const note = `Zillow Observed Rent Index (ZORI), all homes, smoothed, ${m.region} metro area, month ending ${newest.h}${where}. Data: Zillow Research.`;
  out.push({
    sector: "multifamily", metro: m.name, metric: "zori_rent",
    low: Math.round(rent), high: Math.round(rent), unit: "usd_month",
    source: SOURCE, as_of: newest.h, status: "verified", note,
  });
  if (yoy !== null) {
    out.push({
      sector: "multifamily", metro: m.name, metric: "zori_rent_yoy",
      low: yoy, high: yoy, unit: "pct",
      source: SOURCE, as_of: newest.h, status: "verified",
      note: `ZORI change from ${yearAgo.h} to ${newest.h}, ${m.region} metro area. Data: Zillow Research.`,
    });
  }
  console.log(`${m.id}: $${Math.round(rent).toLocaleString("en-US")}/mo (${m.region}, ${newest.h})${yoy !== null ? ` · ${yoy > 0 ? "+" : ""}${yoy}% y/y` : ""}`);
}
for (const miss of missed) console.error(`${miss}: no ZORI row by that RegionName`);

if (supabase && out.length > 0) {
  const { error } = await supabase.from("benchmarks").upsert(out, { onConflict: "sector,metro,metric" });
  if (error) {
    console.error(`benchmarks upsert: ${error.message}`);
    process.exit(1);
  }
  console.log(`benchmarks: upserted ${out.length} rows`);
}
console.log(`ZORI ROLL-UP: ${matched} of ${METROS.length} metros matched${missed.length ? `; missed: ${missed.join(", ")}` : ""}`);
process.exit(matched === 0 ? 1 : 0);
