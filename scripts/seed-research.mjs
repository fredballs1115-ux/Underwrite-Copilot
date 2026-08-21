#!/usr/bin/env node
// Seed the research layer (migration 0023) from /data/research/*.json.
// Optional ops step: the app already falls back to the checked-in JSONs, so
// seeding matters when you want DB-edited rows to override the shipped seeds
// (e.g. the daily intel job bumping a rule without a deploy).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-research.mjs
//
// Idempotent: upserts on the natural keys (rule id; sector+metro+metric).

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = async (f) =>
  JSON.parse(await readFile(path.join(root, "data/research", f), "utf8"));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const rulesDoc = await read("regulatory_rules.json");
const rules = rulesDoc.rules.map((r) => ({
  id: r.id,
  jurisdiction_state: r.jurisdiction_state,
  jurisdiction_local: r.jurisdiction_local ?? null,
  rule_type: r.rule_type,
  applies_if: r.applies_if ?? null,
  exempt_if: r.exempt_if ?? null,
  effect: r.effect,
  quote: r.quote ?? null,
  source: r.source ?? null,
  as_of: r.as_of,
  status: r.status,
  verification: r.verification ?? null,
}));
{
  const { error } = await supabase.from("regulatory_rules").upsert(rules, { onConflict: "id" });
  if (error) throw new Error(`regulatory_rules upsert: ${error.message}`);
  console.log(`regulatory_rules: upserted ${rules.length}`);
}

// Benchmarks here cover the CORE subset (metro medians, DC FMRs, PMMS).
// lib/research-data.ts#seedBenchmarks is the CANONICAL, larger set (adds
// sector cap-rate bands + metro FMRs) and the app always merges it in — DB
// rows override per key, so this script seeding fewer rows is safe.
const mf = await read("multifamily.json");
const cap = await read("capital_markets.json");
const benchmarks = [];
const metroLabel = {
  providence_ri: "Providence, RI", philadelphia_pa: "Philadelphia, PA",
  scranton_pa: "Scranton, PA", albany_ny: "Albany, NY", reading_pa: "Reading, PA",
  hartford_ct: "Hartford, CT", new_haven_ct: "New Haven, CT", bridgeport_ct: "Bridgeport, CT",
};
const md = mf.supply_demand?.on_market_depth_may_2026;
for (const [k, row] of Object.entries(md?.value ?? {})) {
  if (typeof row.median_sale_price === "number") {
    benchmarks.push({
      sector: "multifamily", metro: metroLabel[k] ?? k, metric: "median_sale_price_2_4_unit",
      low: row.median_sale_price, high: row.median_sale_price, unit: "usd",
      source: md.sources?.[0] ?? "", as_of: "2026-05-31", status: md.status ?? "sourced",
      note: row.yoy ? `YoY ${row.yoy}; single-month median, not a band` : "single-month median, not a band",
    });
  }
}
const fmr = mf.supply_demand?.rents_fy2026_hud_fmr_dc_area;
for (const [br, v] of Object.entries(fmr?.value ?? {})) {
  if (typeof v === "number") {
    benchmarks.push({
      sector: "multifamily", metro: "Washington DC area", metric: `hud_fmr_fy2026_${br}`,
      low: v, high: v, unit: "usd_month", source: fmr.sources?.[0] ?? "",
      as_of: "2025-10-01", status: fmr.status ?? "sourced", note: fmr.note ?? null,
    });
  }
}
const pmms = cap.snapshot?.mortgage_30y_pmms;
if (typeof pmms?.value === "number") {
  benchmarks.push({
    sector: "capital_markets", metro: "", metric: "pmms_30y_fixed",
    low: pmms.value, high: pmms.value, unit: "pct", source: pmms.sources?.[0] ?? "",
    as_of: pmms.as_of, status: pmms.status ?? "sourced", note: pmms.note ?? null,
  });
  const { error } = await supabase.from("rates").upsert(
    [{ series_id: "MORTGAGE30US", obs_date: pmms.as_of, value: pmms.value, label: "Freddie Mac PMMS 30-Year Fixed" }],
    { onConflict: "series_id,obs_date" }
  );
  if (error) throw new Error(`rates upsert: ${error.message}`);
  console.log("rates: seeded PMMS fallback row");
}
{
  const { error } = await supabase
    .from("benchmarks")
    .upsert(benchmarks, { onConflict: "sector,metro,metric" });
  if (error) throw new Error(`benchmarks upsert: ${error.message}`);
  console.log(`benchmarks: upserted ${benchmarks.length}`);
}
console.log("research seed complete");
