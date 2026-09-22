#!/usr/bin/env node
// Monthly Zillow pull → the `benchmarks` table: for each covered metro the
// asking rent (Zillow Observed Rent Index, all homes), the APARTMENT asking
// rent (the same index over multifamily listings alone), the typical home
// value (Zillow Home Value Index), and each one's change from a year ago.
// Zillow publishes the metro files as public CSVs, refreshed monthly, free
// to use with attribution (Zillow Research) — which is why every row here
// carries the source and the page carries the credit.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fetch-zori.mjs
//   DRY_RUN=1 node scripts/fetch-zori.mjs   — fetch, match and print; write nothing
//
// WHY A DRY RUN FIRST. The sandbox this is written in cannot reach Zillow,
// so each file's URL, its column shape and the exact RegionName each metro
// goes by are claims until the runner prints them. The dry run prints, per
// file, the header, the newest month, and every match — or every miss — by
// name. The all-homes file was verified this way on 2026-09-21 (zori run
// 35661419542); the other two are verified the same way before they are
// trusted, and a file that fails is a loud line, never a guessed number.
//
// THE FILES, all the same shape: RegionID, SizeRank, RegionName, RegionType,
// StateName, then one column per month, oldest first, dated the month's
// LAST day. The first data row is the United States.
//   - Metro_zori_uc_sfrcondomfr_sm_month.csv — ZORI, all homes
//     (single-family, condo, multifamily), smoothed, not seasonally adjusted.
//   - Metro_zori_uc_mfr_sm_month.csv — ZORI over multifamily listings alone,
//     smoothed: the apartment figure, which is what an apartment underwrite
//     should be reading. It runs under the all-homes figure wherever houses
//     are dear, and the page shows both so the gap is visible.
//   - Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv — ZHVI, the
//     typical (mid-tier) home value, smoothed and seasonally adjusted. With
//     the rent it gives the price-to-rent ratio, the arithmetic that keeps a
//     renter renting.
//
// MATCHING BY NAME, LIKE THE FMR PULL. Zillow's metros are MSAs named by
// their principal city and state ("Washington, DC"). The four DMV suburbs
// share Washington's row — an MSA figure, filed under each and said so in
// the note — and Newark shares New York's. An unmatched metro is a loud log
// line, never a guessed number.

import { createClient } from "@supabase/supabase-js";

const SOURCE = "https://www.zillow.com/research/data/";
const FILES = [
  {
    kind: "ZORI",
    url: "https://files.zillowstatic.com/research/public_csvs/zori/Metro_zori_uc_sfrcondomfr_sm_month.csv",
    what: "Zillow Observed Rent Index (ZORI), all homes, smoothed",
    metric: "zori_rent",
    yoyMetric: "zori_rent_yoy",
    unit: "usd_month",
    say: (v) => `$${Math.round(v).toLocaleString("en-US")}/mo`,
  },
  {
    kind: "ZORI MFR",
    url: "https://files.zillowstatic.com/research/public_csvs/zori/Metro_zori_uc_mfr_sm_month.csv",
    what: "Zillow Observed Rent Index (ZORI), multifamily listings only, smoothed",
    metric: "zori_mfr_rent",
    yoyMetric: "zori_mfr_rent_yoy",
    unit: "usd_month",
    say: (v) => `$${Math.round(v).toLocaleString("en-US")}/mo`,
  },
  {
    kind: "ZHVI",
    url: "https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
    what: "Zillow Home Value Index (ZHVI), all homes, mid-tier, smoothed and seasonally adjusted",
    metric: "zhvi",
    yoyMetric: "zhvi_yoy",
    unit: "usd",
    say: (v) => `$${Math.round(v).toLocaleString("en-US")}`,
  },
];

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

/**
 * One file: fetched, its shape checked, each covered metro matched by
 * RegionName, and the rows the table takes. Throws on a file that cannot be
 * read as the shape above, so the caller can say which file failed and go
 * on to the next.
 */
async function pull(file) {
  const res = await fetch(file.url, {
    headers: { "user-agent": "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com)" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${file.url}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = cells(lines[0]);
  const monthCols = header.map((h, i) => ({ h, i })).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.h));
  if (monthCols.length < 13) {
    throw new Error(`expected monthly columns, found ${monthCols.length}; header: ${header.slice(0, 8).join(", ")}`);
  }
  const newest = monthCols[monthCols.length - 1];
  const yearAgo = monthCols[monthCols.length - 13];
  const nameIx = header.indexOf("RegionName");
  const typeIx = header.indexOf("RegionType");
  if (nameIx < 0 || typeIx < 0) throw new Error(`no RegionName/RegionType column; header: ${header.slice(0, 8).join(", ")}`);
  console.log(
    `${file.kind}: ${lines.length - 1} rows, ${monthCols.length} months ${monthCols[0].h} → ${newest.h}; ` +
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
    const value = c ? Number(c[newest.i]) : NaN;
    const back = c ? Number(c[yearAgo.i]) : NaN;
    if (!c || !Number.isFinite(value) || value <= 0) {
      missed.push(`${m.id} (${m.region})`);
      continue;
    }
    matched++;
    const yoy = Number.isFinite(back) && back > 0 ? Math.round(((value / back) - 1) * 1000) / 10 : null;
    const where = m.shared ? ` — the ${m.region} metro area's figure, shared with the MSA` : "";
    const note = `${file.what}, ${m.region} metro area, month ending ${newest.h}${where}. Data: Zillow Research.`;
    out.push({
      sector: "multifamily", metro: m.name, metric: file.metric,
      low: Math.round(value), high: Math.round(value), unit: file.unit,
      source: SOURCE, as_of: newest.h, status: "verified", note,
    });
    if (yoy !== null) {
      out.push({
        sector: "multifamily", metro: m.name, metric: file.yoyMetric,
        low: yoy, high: yoy, unit: "pct",
        source: SOURCE, as_of: newest.h, status: "verified",
        note: `${file.kind} change from ${yearAgo.h} to ${newest.h}, ${m.region} metro area. Data: Zillow Research.`,
      });
    }
    console.log(`${m.id}: ${file.say(value)} (${m.region}, ${newest.h})${yoy !== null ? ` · ${yoy > 0 ? "+" : ""}${yoy}% y/y` : ""}`);
  }
  for (const miss of missed) console.error(`${miss}: no ${file.kind} row by that RegionName`);
  return { out, matched, missed };
}

const all = [];
let anyRent = 0;
for (const file of FILES) {
  try {
    const { out, matched, missed } = await pull(file);
    all.push(...out);
    if (file.metric === "zori_rent") anyRent = matched;
    console.log(
      `${file.kind} ROLL-UP: ${matched} of ${METROS.length} metros matched${missed.length ? `; missed: ${missed.join(", ")}` : ""}`,
    );
  } catch (err) {
    // One file down does not take the others with it: the page shows what
    // it has and the line says what it does not.
    console.error(`${file.kind}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    console.log(`${file.kind} ROLL-UP: 0 of ${METROS.length} metros matched; the file did not answer`);
  }
}

if (supabase && all.length > 0) {
  const { error } = await supabase.from("benchmarks").upsert(all, { onConflict: "sector,metro,metric" });
  if (error) {
    console.error(`benchmarks upsert: ${error.message}`);
    process.exit(1);
  }
  console.log(`benchmarks: upserted ${all.length} rows`);
}
process.exit(anyRent === 0 ? 1 : 0);
