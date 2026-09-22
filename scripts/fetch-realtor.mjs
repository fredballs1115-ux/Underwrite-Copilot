#!/usr/bin/env node
// Monthly Realtor.com inventory pull → the `benchmarks` table: for each
// covered metro the median list price, the active listings and the median
// days on market, each with its change from a year ago. Realtor.com
// publishes the metro file monthly — ONE month per file, the year-ago
// change already in it as a fraction — free to use with attribution, which
// is why every row here carries the source and the page carries the credit.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fetch-realtor.mjs
//   DRY_RUN=1 node scripts/fetch-realtor.mjs   — fetch, match and print; write nothing
//
// WHAT THE RUNNER PRINTED (zori.yml probe_url, run 35782501160, 2026-09-22):
// RDC_Inventory_Core_Metrics_Metro.csv is text/csv, 291 KB, 936 metros, the
// month 202608 on every row; the header begins month_date_yyyymm, cbsa_code,
// cbsa_title, HouseholdRank, median_listing_price, median_listing_price_mm,
// median_listing_price_yy, active_listing_count, …_mm, …_yy,
// median_days_on_market, …_mm, …_yy, new_listing_count, …; and every covered
// metro's row came back under the CBSA code below with the title beside it
// (47900 "Washington-Arlington-Alexandria, DC-VA-MD-WV", 19100 "Dallas-Fort
// Worth-Arlington, TX"). Columns are read BY NAME from the header, never by
// position, and a metro is matched by code with its title printed, so a
// wrong code is visible in the dry run rather than silently another city.
//
// MATCHING BY CODE, NAMED. The four DMV suburbs share Washington's row — an
// MSA figure, filed under each and said so in the note — and Newark shares
// New York's. An unmatched metro is a loud log line, never a guessed number.

import { createClient } from "@supabase/supabase-js";

const URL = "https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Metro.csv";
const SOURCE = "https://www.realtor.com/research/data/";

const dryRun = process.env.DRY_RUN === "1";
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!url || !key)) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required (or DRY_RUN=1).");
  process.exit(1);
}
const supabase = dryRun ? null : createClient(url, key, { auth: { persistSession: false } });

// metro id → the covered metro's name as the benchmarks table files it
// (data/research/metros.json `name`) and the CBSA code whose row it takes.
const METROS = [
  { id: "dc", name: "Washington DC", cbsa: "47900" },
  { id: "pg_county", name: "Prince George's County MD", cbsa: "47900", shared: true },
  { id: "montgomery_county", name: "Montgomery County MD", cbsa: "47900", shared: true },
  { id: "nova", name: "Northern Virginia", cbsa: "47900", shared: true },
  { id: "baltimore", name: "Baltimore MD", cbsa: "12580" },
  { id: "richmond", name: "Richmond VA", cbsa: "40060" },
  { id: "norfolk_hampton_roads", name: "Norfolk / Hampton Roads VA", cbsa: "47260" },
  { id: "philadelphia", name: "Philadelphia PA", cbsa: "37980" },
  { id: "newark_jc", name: "Newark / Jersey City", cbsa: "35620", shared: true },
  { id: "nyc", name: "New York City", cbsa: "35620" },
  { id: "boston", name: "Boston", cbsa: "14460" },
  { id: "chicago", name: "Chicago", cbsa: "16980" },
  { id: "los_angeles", name: "Los Angeles", cbsa: "31080" },
  { id: "san_francisco", name: "San Francisco", cbsa: "41860" },
  { id: "seattle", name: "Seattle", cbsa: "42660" },
  { id: "miami", name: "Miami", cbsa: "33100" },
  { id: "atlanta", name: "Atlanta", cbsa: "12060" },
  { id: "dallas", name: "Dallas-Fort Worth", cbsa: "19100" },
];

/** The columns the table takes, by the header's own names. */
const COLUMNS = [
  { col: "median_listing_price", yy: "median_listing_price_yy", metric: "rdc_median_list_price", unit: "usd", say: (v) => `$${Math.round(v).toLocaleString("en-US")}` },
  { col: "active_listing_count", yy: "active_listing_count_yy", metric: "rdc_active_listings", unit: "listings", say: (v) => `${Math.round(v).toLocaleString("en-US")} listings` },
  { col: "median_days_on_market", yy: "median_days_on_market_yy", metric: "rdc_days_on_market", unit: "days", say: (v) => `${Math.round(v)} days` },
];

/** A CSV line's cells, quotes honoured — a cbsa_title always carries a comma inside its quotes. */
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

const res = await fetch(URL, {
  headers: { "user-agent": "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com)" },
  signal: AbortSignal.timeout(60_000),
});
if (!res.ok) {
  console.error(`REALTOR: HTTP ${res.status} from ${URL}`);
  process.exit(1);
}
const text = await res.text();
const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
const header = cells(lines[0]);
const ix = (name) => header.indexOf(name);
const needed = ["month_date_yyyymm", "cbsa_code", "cbsa_title", ...COLUMNS.flatMap((c) => [c.col, c.yy])];
const missing = needed.filter((n) => ix(n) < 0);
if (missing.length) {
  console.error(`REALTOR: header lacks ${missing.join(", ")}; header: ${header.slice(0, 16).join(", ")}`);
  process.exit(1);
}
const rows = new Map();
for (const line of lines.slice(1)) {
  const c = cells(line);
  rows.set(c[ix("cbsa_code")], c);
}
const months = new Set(Array.from(rows.values()).map((c) => c[ix("month_date_yyyymm")]));
const month = Array.from(months).sort().at(-1) ?? "";
if (!/^\d{6}$/.test(month)) {
  console.error(`REALTOR: no month in the file; saw ${Array.from(months).join(", ") || "nothing"}`);
  process.exit(1);
}
// Dated the first of its month: the figure is a month's, as the CPI's are.
const asOf = `${month.slice(0, 4)}-${month.slice(4, 6)}-01`;
const monthName = new Date(`${asOf}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
console.log(
  `REALTOR: ${rows.size} metros, month ${month}${months.size > 1 ? ` (${months.size} months in the file, newest taken)` : ""}; ` +
    `${res.headers.get("content-type") ?? "no content type"}, ${Math.round(text.length / 1024)} KB` +
    (dryRun ? " · dry run, not written" : ""),
);

const out = [];
let matched = 0;
const missed = [];
for (const m of METROS) {
  const c = rows.get(m.cbsa);
  if (!c || c[ix("month_date_yyyymm")] !== month) {
    missed.push(`${m.id} (cbsa ${m.cbsa})`);
    continue;
  }
  const title = c[ix("cbsa_title")];
  const where = m.shared ? ` — the ${title} metro area's figure, shared with the MSA` : "";
  const said = [];
  let any = false;
  for (const col of COLUMNS) {
    const value = Number(c[ix(col.col)]);
    if (!Number.isFinite(value) || value < 0) continue;
    any = true;
    const yyRaw = Number(c[ix(col.yy)]);
    const yoy = Number.isFinite(yyRaw) ? Math.round(yyRaw * 1000) / 10 : null;
    out.push({
      sector: "multifamily", metro: m.name, metric: col.metric,
      low: Math.round(value), high: Math.round(value), unit: col.unit,
      source: SOURCE, as_of: asOf, status: "verified",
      note: `Realtor.com inventory, ${title} metro area, ${monthName}${where}. Data: Realtor.com.`,
    });
    if (yoy !== null) {
      out.push({
        sector: "multifamily", metro: m.name, metric: `${col.metric}_yoy`,
        low: yoy, high: yoy, unit: "pct",
        source: SOURCE, as_of: asOf, status: "verified",
        note: `Realtor.com ${col.col} change from a year ago, ${title} metro area, ${monthName}. Data: Realtor.com.`,
      });
    }
    said.push(`${col.say(value)}${yoy !== null ? ` (${yoy > 0 ? "+" : ""}${yoy}% y/y)` : ""}`);
  }
  if (!any) {
    missed.push(`${m.id} (cbsa ${m.cbsa}: no figure)`);
    continue;
  }
  matched++;
  console.log(`${m.id}: ${said.join(" · ")} — ${title}, ${month}`);
}
for (const miss of missed) console.error(`${miss}: no Realtor.com row`);

if (supabase && out.length > 0) {
  const { error } = await supabase.from("benchmarks").upsert(out, { onConflict: "sector,metro,metric" });
  if (error) {
    console.error(`benchmarks upsert: ${error.message}`);
    process.exit(1);
  }
  console.log(`benchmarks: upserted ${out.length} rows`);
}
console.log(`REALTOR ROLL-UP: ${matched} of ${METROS.length} metros matched${missed.length ? `; missed: ${missed.join(", ")}` : ""}`);
process.exit(matched === 0 ? 1 : 0);
