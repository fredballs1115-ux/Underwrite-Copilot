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
//
// THE HOTNESS FILE, the second read (zori.yml probe_url, run 35793378647,
// 2026-09-22): RDC_Inventory_Hotness_Metrics_Metro_History.csv is text/csv,
// 8,636 KB, 32,701 lines — EVERY month back to 201708, newest first, the
// 300 largest metros a month — header month_date_yyyymm, cbsa_code,
// cbsa_title, hh_rank, hotness_rank, hotness_rank_mm, hotness_rank_yy,
// hotness_score, supply_score, demand_score, median_days_on_market, …,
// median_dom_vs_us, page_view_count_per_property_mm, …_yy, …_vs_us,
// median_listing_price, …, quality_flag; Washington's 202608 row ranked
// 154 with 0.649 views per property against the U.S. and 17 fewer days on
// market, Dallas's 183 with 0.910 and 2 fewer. What is stored: the RANK
// (of 300), the rank the SAME MONTH A YEAR EARLIER read out of the history
// (so the move is our own subtraction of two printed figures, never a sign
// inferred from a column called _yy — the dry run prints whether the file's
// own column agrees), and the two components in plain units — listing
// views per property as a ratio to the U.S., days on market as days
// against the U.S. The composite score is not stored: it is the mean of
// two percentile ranks and says nothing the rank and its parts do not.

import { createClient } from "@supabase/supabase-js";

const URL = "https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/RDC_Inventory_Core_Metrics_Metro.csv";
const HOTNESS_URL = "https://econdata.s3-us-west-2.amazonaws.com/Reports/Hotness/RDC_Inventory_Hotness_Metrics_Metro_History.csv";
/** The file ranks this many metros; a covered metro outside them has no row, and says so. */
const HOTNESS_METROS = 300;
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
  { col: "active_listing_count", yy: "active_listing_count_yy", metric: "rdc_active_listings", unit: "count", say: (v) => `${Math.round(v).toLocaleString("en-US")} listings` },
  { col: "median_days_on_market", yy: "median_days_on_market_yy", metric: "rdc_days_on_market", unit: "count", say: (v) => `${Math.round(v)} days` },
];

/** The units the benchmarks table accepts — migration 0023's check, which
 *  Postgres enforces on the real run and a dry run never reaches (the first
 *  real run failed on "listings" and "days" after a clean dry run). A unit
 *  outside the list stops the pull here, dry or not; lib/benchmark-units.test.ts
 *  holds this copy to the migration's. */
const BENCHMARK_UNITS = new Set(["usd", "pct", "ratio", "months", "count", "usd_month"]);
/** The hotness rows' units: a rank and a day count are counts, views against the U.S. is a ratio. */
const HOTNESS_UNITS = ["count", "count", "ratio", "count"];
for (const unit of [...COLUMNS.map((c) => c.unit), "pct", ...HOTNESS_UNITS]) {
  if (!BENCHMARK_UNITS.has(unit)) {
    console.error(`unit "${unit}" is not in the benchmarks table's check (${[...BENCHMARK_UNITS].join(", ")})`);
    process.exit(1);
  }
}

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

// ── The hotness file ────────────────────────────────────────────────────
//
// A file that fails is a loud line and the inventory rows still write.
let hotMatched = 0;
const hotMissed = [];
try {
  const hres = await fetch(HOTNESS_URL, {
    headers: { "user-agent": "UnderwriteCopilot/1.0 (+https://underwrite-copilot.onrender.com)" },
    signal: AbortSignal.timeout(90_000),
  });
  if (!hres.ok) throw new Error(`HTTP ${hres.status}`);
  const htext = await hres.text();
  const hlines = htext.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const hheader = cells(hlines[0]);
  const hix = (name) => hheader.indexOf(name);
  const hneeded = ["month_date_yyyymm", "cbsa_code", "cbsa_title", "hotness_rank", "hotness_rank_yy", "page_view_count_per_property_vs_us", "median_dom_vs_us"];
  const hmissing = hneeded.filter((n) => hix(n) < 0);
  if (hmissing.length) throw new Error(`header lacks ${hmissing.join(", ")}; header: ${hheader.slice(0, 12).join(", ")}`);
  // The newest month in the file, found rather than assumed, and the same
  // month a year earlier — yyyymm arithmetic, so 202601 − 100 is 202501.
  let hmonth = "";
  for (const line of hlines.slice(1)) {
    const mm = line.slice(0, 6);
    if (/^\d{6}$/.test(mm) && mm > hmonth) hmonth = mm;
  }
  if (!hmonth) throw new Error("no month in the file");
  const prior = String(Number(hmonth) - 100);
  const wanted = new Set(METROS.map((m) => m.cbsa));
  const byKey = new Map();
  for (const line of hlines.slice(1)) {
    const mm = line.slice(0, 6);
    if (mm !== hmonth && mm !== prior) continue;
    const c = cells(line);
    if (!wanted.has(c[hix("cbsa_code")])) continue;
    byKey.set(`${c[hix("cbsa_code")]}:${mm}`, c);
  }
  const hAsOf = `${hmonth.slice(0, 4)}-${hmonth.slice(4, 6)}-01`;
  const priorAsOf = `${prior.slice(0, 4)}-${prior.slice(4, 6)}-01`;
  const hMonthName = new Date(`${hAsOf}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  console.log(
    `HOTNESS: ${Math.round(htext.length / 1024)} KB, ${hlines.length - 1} rows, newest month ${hmonth}, the year before ${prior}` +
      (dryRun ? " · dry run, not written" : ""),
  );
  for (const m of METROS) {
    const c = byKey.get(`${m.cbsa}:${hmonth}`);
    if (!c) {
      hotMissed.push(`${m.id} (cbsa ${m.cbsa})`);
      continue;
    }
    const rank = Number(c[hix("hotness_rank")]);
    if (!Number.isInteger(rank) || rank < 1 || rank > HOTNESS_METROS) {
      hotMissed.push(`${m.id} (cbsa ${m.cbsa}: rank ${c[hix("hotness_rank")]})`);
      continue;
    }
    const title = c[hix("cbsa_title")];
    const where = m.shared ? ` — the ${title} metro area's figure, shared with the MSA` : "";
    const credit = ` Data: Realtor.com.`;
    const p = byKey.get(`${m.cbsa}:${prior}`);
    const priorRank = p ? Number(p[hix("hotness_rank")]) : NaN;
    const views = Number(c[hix("page_view_count_per_property_vs_us")]);
    const dom = Number(c[hix("median_dom_vs_us")]);
    out.push({
      sector: "multifamily", metro: m.name, metric: "rdc_hotness_rank",
      low: rank, high: rank, unit: "count",
      source: SOURCE, as_of: hAsOf, status: "verified",
      note: `Realtor.com hotness rank of the ${HOTNESS_METROS} largest metros, ${title} metro area, ${hMonthName}${where}.${credit}`,
    });
    const said = [`#${rank} of ${HOTNESS_METROS}`];
    if (Number.isInteger(priorRank) && priorRank >= 1) {
      out.push({
        sector: "multifamily", metro: m.name, metric: "rdc_hotness_rank_prior",
        low: priorRank, high: priorRank, unit: "count",
        source: SOURCE, as_of: priorAsOf, status: "verified",
        note: `Realtor.com hotness rank a year earlier, ${title} metro area, ${prior.slice(0, 4)}-${prior.slice(4, 6)}.${credit}`,
      });
      // The file's own year-ago column, checked against our subtraction and
      // printed — the stored figures are the two ranks, never its sign.
      const fileYy = Number(c[hix("hotness_rank_yy")]);
      const ours = rank - priorRank;
      said.push(`${priorRank} a year ago${Number.isFinite(fileYy) ? (fileYy === ours ? " (the file's _yy agrees)" : ` (the file's _yy says ${fileYy}, ours ${ours})`) : ""}`);
    }
    if (Number.isFinite(views) && views > 0) {
      const ratio = Math.round(views * 1000) / 1000;
      out.push({
        sector: "multifamily", metro: m.name, metric: "rdc_views_per_listing_vs_us",
        low: ratio, high: ratio, unit: "ratio",
        source: SOURCE, as_of: hAsOf, status: "verified",
        note: `Realtor.com listing views per property as a ratio to the U.S., ${title} metro area, ${hMonthName}.${credit}`,
      });
      said.push(`views ${ratio}× the U.S.`);
    }
    if (Number.isFinite(dom)) {
      const days = Math.round(dom);
      out.push({
        sector: "multifamily", metro: m.name, metric: "rdc_days_on_market_vs_us",
        low: days, high: days, unit: "count",
        source: SOURCE, as_of: hAsOf, status: "verified",
        note: `Realtor.com median days on market against the U.S., in days, ${title} metro area, ${hMonthName}.${credit}`,
      });
      said.push(`${days > 0 ? "+" : ""}${days} days vs the U.S.`);
    }
    hotMatched++;
    console.log(`${m.id}: hotness ${said.join(" · ")} — ${title}, ${hmonth}`);
  }
  for (const miss of hotMissed) console.error(`${miss}: no hotness row`);
} catch (err) {
  console.error(`HOTNESS: FAILED — ${err instanceof Error ? err.message : String(err)}; the inventory rows still write`);
}

if (supabase && out.length > 0) {
  const { error } = await supabase.from("benchmarks").upsert(out, { onConflict: "sector,metro,metric" });
  if (error) {
    console.error(`benchmarks upsert: ${error.message}`);
    process.exit(1);
  }
  console.log(`benchmarks: upserted ${out.length} rows`);
}
console.log(
  `REALTOR ROLL-UP: ${matched} of ${METROS.length} metros matched${missed.length ? `; missed: ${missed.join(", ")}` : ""}` +
    `; hotness ${hotMatched} of ${METROS.length}${hotMissed.length ? `; missed: ${hotMissed.join(", ")}` : ""}`,
);
process.exit(matched === 0 ? 1 : 0);
