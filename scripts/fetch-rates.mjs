#!/usr/bin/env node
// Weekday FRED pull → the `rates` table. Every figure on the site that
// changes with the market — the Treasury curve, SOFR, the credit spreads,
// the mortgage survey, inflation, the supply pipeline — comes through here,
// so the pages read today's number rather than one somebody typed.
//
//   FRED_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/fetch-rates.mjs
//
//   DRY_RUN=1 FRED_API_KEY=... node scripts/fetch-rates.mjs
//     — fetch and print, write nothing. Also asks FRED for each series' own
//     title, frequency and units, which is how a candidate id is verified
//     BEFORE it is trusted: the sandbox cannot reach FRED, so the only proof
//     that "WPUSI012011" is the construction-materials index is this run's
//     log saying so. A series goes into data/fred-series.json only after a
//     dry run has printed it.
//
// The series list is data/fred-series.json — the same file lib/live-rates.ts
// reads, so the cron and the page cannot disagree about what a series is.
// FRED's API needs a (free) key: https://fred.stlouisfed.org/docs/api/api_key.html

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** @type {{ historyRows: number; series: Array<{ id: string; fred?: string; units?: string; source?: string; label: string }>; metroSeries?: Array<{ id: string; fred?: string; units?: string; source?: string; label: string }> }} */
const { series: STRIP, metroSeries = [], regionSeries = [], stateSeries = [], historyRows } = require("../data/fred-series.json");
// The strip's series and every covered metro's own, one list: a series two
// suburbs share is fetched once, since the table is keyed by id.
const seenId = new Set();
// The strip's series, each metro's, and the Census regions' — one pull.
// The states' series come last: the fallback grain for a deal outside the
// covered metros, and the longest list, so a pull that runs long has
// written every metro first.
const SERIES = [...STRIP, ...metroSeries, ...regionSeries, ...stateSeries].filter((s) => !seenId.has(s.id) && seenId.add(s.id));
// Nearly all of it is FRED's. The rest is the BLS's own — see the BLS block
// below for why a series would be.
const FROM_FRED = SERIES.filter((s) => (s.source ?? "fred") === "fred");
const FROM_BLS = SERIES.filter((s) => s.source === "bls");

// The last few dozen observations, not the last one: the strip draws each
// series' recent path, and one run backfills it. Idempotent — the upsert is
// on (series_id, obs_date), so re-pulling the same days changes nothing. The
// count is the table's own, so the page reads back exactly what is written.
const OBSERVATIONS = historyRows;
// FRED allows 120 requests a minute. A dry run makes two requests a series
// and a probe two a candidate, so the pace has to hold the whole run under
// two a second — at 150 ms the first probe of eighty ids collected 429s
// from the sixtieth onward, which read as "series does not exist" for
// twenty ids that exist perfectly well. The sector payrolls (five a metro,
// fourteen metros) took the table past two hundred series, so the pace is
// 520 ms — 115 a minute, under the limit on its own, with the retry as the
// margin rather than the plan. And the limit is per KEY, not per run: a
// probe dispatched while the weekday pull was running cost that pull the
// 7-year and the 10-year real yield (run 35919413352, "failed: DGS7,
// DFII10"), and three probes dispatched together lost each other a series
// apiece to 429s — run them one after another, never beside the pull.
const PACE_MS = 520;

const dryRun = process.env.DRY_RUN === "1";
const fredKey = process.env.FRED_API_KEY;
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!fredKey || (!dryRun && (!url || !key))) {
  console.error(
    dryRun
      ? "FRED_API_KEY is required."
      : "FRED_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

let supabase = null;
if (!dryRun) {
  const { createClient } = await import("@supabase/supabase-js");
  supabase = createClient(url, key, { auth: { persistSession: false } });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fred(path, params, retried = false) {
  const api = new URL(`https://api.stlouisfed.org/fred/${path}`);
  for (const [k, v] of Object.entries(params)) api.searchParams.set(k, v);
  api.searchParams.set("api_key", fredKey);
  api.searchParams.set("file_type", "json");
  const res = await fetch(api, { signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 429 && !retried) {
    // The limit is per minute; wait most of one out and ask once more,
    // so a burst reads as a pause rather than as a missing series.
    await sleep(20_000);
    return fred(path, params, true);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}${body.error_message ? ` — ${body.error_message}` : ""}`);
  }
  return body;
}

const failed = [];
const wrote = [];
for (const s of FROM_FRED) {
  const fredId = s.fred ?? s.id;
  try {
    if (dryRun) {
      // The series' own description, from FRED — the check that the id is
      // the series the JSON says it is.
      const meta = await fred("series", { series_id: fredId });
      const m = meta.seriess?.[0];
      if (m) {
        console.log(
          `  ${fredId}: "${m.title}" · ${m.frequency} · ${m.units} · ` +
            `${m.seasonal_adjustment_short ?? ""} · last updated ${m.last_updated}`,
        );
      }
      await sleep(PACE_MS);
    }
    const params = {
      series_id: fredId,
      sort_order: "desc",
      limit: String(OBSERVATIONS),
    };
    if (s.units) params.units = s.units;
    const body = await fred("series/observations", params);
    const obs = (body.observations ?? [])
      .filter((o) => o.value && o.value !== "." && Number.isFinite(Number(o.value)))
      .map((o) => ({ series_id: s.id, obs_date: o.date, value: Number(o.value), label: s.label }));
    if (obs.length === 0) throw new Error("no numeric observation");
    const newest = obs[0];
    if (supabase) {
      const { error } = await supabase
        .from("rates")
        .upsert(obs, { onConflict: "series_id,obs_date" });
      if (error) throw new Error(`rates upsert: ${error.message}`);
    }
    wrote.push(s.id);
    console.log(
      `${s.id}: ${newest.value} (${newest.obs_date}) · ${obs.length} obs` +
        `${s.units ? ` · units=${s.units}` : ""}${dryRun ? " · dry run, not written" : ""}`,
    );
  } catch (err) {
    failed.push(s.id);
    console.error(`${s.id}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }
  await sleep(PACE_MS);
}

// ── The BLS's own API, for the series FRED does not carry ──────────────────
//
// The BLS redrew its CPI metro areas in 2018 and FRED never picked up the
// re-coded ones: its search for Washington-Arlington-Alexandria returns only
// the DISCONTINUED Washington-Baltimore series, and the S-coded ids answer
// "does not exist" (rates runs 35751861027 and 35752361935). The BLS
// publishes them itself, so those rent indices come from api.bls.gov — ONE
// POST for all of them, well inside the unregistered allowance of 25 queries
// a day and 25 series a query. A key (free, https://data.bls.gov/registrationEngine/)
// lifts the allowance and adds the catalog, which is how a dry run prints
// each series' own title; without one the dry run prints the data and says
// the title was not asked for. The row stored is the LEVEL under the BLS id;
// the page derives the change from a year earlier, as it does for Boston's
// payrolls.
const blsKey = process.env.BLS_API_KEY;
async function bls(ids) {
  const year = new Date().getUTCFullYear();
  const body = { seriesid: ids, startyear: String(year - 4), endyear: String(year) };
  if (blsKey) {
    body.registrationkey = blsKey;
    body.catalog = true;
  }
  const res = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== "REQUEST_SUCCEEDED") {
    const said = Array.isArray(json.message) && json.message.length ? ` — ${json.message.join("; ")}` : "";
    throw new Error(`BLS HTTP ${res.status} ${json.status ?? ""}${said}`);
  }
  return json;
}
/** A BLS series' monthly rows, newest first, dated the first of the month; M13 (the annual average) dropped. */
function blsObservations(series) {
  return (series?.data ?? [])
    .filter((d) => /^M(0[1-9]|1[0-2])$/.test(String(d.period)) && Number.isFinite(Number(d.value)))
    .map((d) => ({ obs_date: `${d.year}-${String(d.period).slice(1)}-01`, value: Number(d.value) }))
    .sort((a, b) => (a.obs_date < b.obs_date ? 1 : a.obs_date > b.obs_date ? -1 : 0));
}

if (FROM_BLS.length > 0) {
  try {
    const json = await bls(FROM_BLS.map((s) => s.id));
    for (const m of json.message ?? []) console.log(`  BLS: ${m}`);
    const byId = new Map((json.Results?.series ?? []).map((s) => [s.seriesID, s]));
    for (const s of FROM_BLS) {
      const got = byId.get(s.id);
      const obs = blsObservations(got)
        .slice(0, OBSERVATIONS)
        .map((o) => ({ series_id: s.id, obs_date: o.obs_date, value: o.value, label: s.label }));
      if (obs.length === 0) {
        failed.push(s.id);
        console.error(`${s.id}: FAILED — the BLS returned no monthly observation`);
        continue;
      }
      if (dryRun) {
        console.log(
          got?.catalog
            ? `  ${s.id}: "${got.catalog.series_title}" · ${got.catalog.survey_name ?? ""} · ${got.catalog.seasonality ?? ""}`
            : `  ${s.id}: (title not asked for — the BLS catalog needs BLS_API_KEY)`,
        );
      }
      if (supabase) {
        const { error } = await supabase.from("rates").upsert(obs, { onConflict: "series_id,obs_date" });
        if (error) throw new Error(`rates upsert: ${error.message}`);
      }
      wrote.push(s.id);
      console.log(
        `${s.id}: ${obs[0].value} (${obs[0].obs_date}) · ${obs.length} obs · from the BLS` +
          `${dryRun ? " · dry run, not written" : ""}`,
      );
    }
  } catch (err) {
    for (const s of FROM_BLS) if (!wrote.includes(s.id) && !failed.includes(s.id)) failed.push(s.id);
    console.error(`BLS: FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// One line to read the run by, in the shape live-verify's roll-up uses.
console.log(
  `RATES ROLL-UP: ${wrote.length} of ${SERIES.length} series answered` +
    (failed.length ? `; failed: ${failed.join(", ")}` : ""),
);

// PROBE_BLS — candidate BLS ids, fetched from the BLS and printed with the
// newest observation (and the title, with a key), written nowhere. The
// same rule as PROBE_IDS: an id drafted from memory is a claim until the
// runner prints what it is.
const probeBls = (process.env.PROBE_BLS ?? "").split(/\s+/).filter(Boolean);
if (probeBls.length > 0) {
  if (!dryRun) {
    console.error("PROBE_BLS is a dry-run facility: set DRY_RUN=1.");
    process.exit(1);
  }
  console.log(`\nPROBE BLS: ${probeBls.length} candidate ids, written nowhere`);
  try {
    const json = await bls(probeBls);
    for (const m of json.message ?? []) console.log(`  BLS: ${m}`);
    for (const id of probeBls) {
      const got = (json.Results?.series ?? []).find((s) => s.seriesID === id);
      const obs = blsObservations(got);
      console.log(
        `  ${id}: ${got?.catalog ? `"${got.catalog.series_title}" · ` : ""}` +
          (obs.length ? `newest ${obs[0].value} (${obs[0].obs_date}) · ${obs.length} obs` : "NOT FOUND — no monthly data"),
      );
    }
  } catch (err) {
    console.log(`  BLS probe failed — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// PROBE_IDS — candidate ids that are NOT in the table yet, printed with
// FRED's own title, cadence, units and newest observation so a list drafted
// from memory can be checked against what the series actually is before
// any of it is trusted. A dry-run facility only: nothing here is written.
const probe = (process.env.PROBE_IDS ?? "").split(/\s+/).filter(Boolean);
if (probe.length > 0) {
  if (!dryRun) {
    console.error("PROBE_IDS is a dry-run facility: set DRY_RUN=1.");
    process.exit(1);
  }
  console.log(`\nPROBE: ${probe.length} candidate ids, written nowhere`);
  for (const id of probe) {
    try {
      const meta = await fred("series", { series_id: id });
      const m = meta.seriess?.[0];
      await sleep(PACE_MS);
      const body = await fred("series/observations", {
        series_id: id,
        sort_order: "desc",
        limit: "3",
      });
      const o = (body.observations ?? []).find((x) => x.value && x.value !== ".");
      console.log(
        `  ${id}: "${m?.title ?? "?"}" · ${m?.frequency ?? "?"} · ${m?.units ?? "?"} · ` +
          `${m?.seasonal_adjustment_short ?? ""} · newest ${o ? `${o.value} (${o.date})` : "none"}` +
          ` · last updated ${m?.last_updated ?? "?"}`,
      );
    } catch (err) {
      console.log(`  ${id}: NOT FOUND — ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(PACE_MS);
  }
}

// PROBE_SEARCH — FRED's own full-text search, one query per line, for the
// case a remembered id is simply wrong and the right one has to be found:
// prints the top matches with their ids, titles and newest observation.
// A dry-run facility, like PROBE_IDS.
const searches = (process.env.PROBE_SEARCH ?? "").split("|").map((s) => s.trim()).filter(Boolean);
if (searches.length > 0) {
  if (!dryRun) {
    console.error("PROBE_SEARCH is a dry-run facility: set DRY_RUN=1.");
    process.exit(1);
  }
  for (const q of searches) {
    console.log(`\nSEARCH: ${q}`);
    try {
      const body = await fred("series/search", {
        search_text: q,
        limit: "10",
        order_by: "popularity",
        sort_order: "desc",
      });
      for (const s of body.seriess ?? []) {
        console.log(
          `  ${s.id}: "${s.title}" · ${s.frequency_short ?? s.frequency} · ${s.units_short ?? s.units}` +
            ` · ${s.seasonal_adjustment_short ?? ""} · through ${s.observation_end} · last updated ${s.last_updated}`,
        );
      }
    } catch (err) {
      console.log(`  search failed — ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(PACE_MS);
  }
}

process.exit(wrote.length === 0 ? 1 : 0); // partial success is success
