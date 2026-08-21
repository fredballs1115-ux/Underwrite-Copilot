#!/usr/bin/env node
// Daily FRED pull → rates table. The deal screen's debt assumptions read the
// newest row per series instead of hardcoded numbers.
//
//   FRED_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/fetch-rates.mjs
//
// Series list mirrors data/research/capital_markets.json#fred_series.
// FRED's API needs a (free) key: https://fred.stlouisfed.org/docs/api/api_key.html

import { createClient } from "@supabase/supabase-js";

const SERIES = [
  { id: "DGS10", label: "10-Year Treasury Constant Maturity" },
  { id: "SOFR", label: "Secured Overnight Financing Rate" },
  { id: "MORTGAGE30US", label: "Freddie Mac PMMS 30-Year Fixed" },
  { id: "DRCRELEXFACBS", label: "CRE Loan Delinquency Rate, All Commercial Banks" },
];

const fredKey = process.env.FRED_API_KEY;
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!fredKey || !url || !key) {
  console.error("FRED_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

let failures = 0;
for (const s of SERIES) {
  try {
    const api = new URL("https://api.stlouisfed.org/fred/series/observations");
    api.searchParams.set("series_id", s.id);
    api.searchParams.set("api_key", fredKey);
    api.searchParams.set("file_type", "json");
    api.searchParams.set("sort_order", "desc");
    api.searchParams.set("limit", "8"); // last few obs — some series post "." placeholders
    const res = await fetch(api);
    if (!res.ok) throw new Error(`FRED ${s.id}: HTTP ${res.status}`);
    const body = await res.json();
    const obs = (body.observations ?? []).find((o) => o.value && o.value !== ".");
    if (!obs) throw new Error(`FRED ${s.id}: no numeric observation`);
    const { error } = await supabase.from("rates").upsert(
      [{ series_id: s.id, obs_date: obs.date, value: Number(obs.value), label: s.label }],
      { onConflict: "series_id,obs_date" }
    );
    if (error) throw new Error(`rates upsert ${s.id}: ${error.message}`);
    console.log(`${s.id}: ${obs.value} (${obs.date})`);
  } catch (err) {
    failures += 1;
    console.error(String(err));
  }
}
process.exit(failures === SERIES.length ? 1 : 0); // partial success is success
