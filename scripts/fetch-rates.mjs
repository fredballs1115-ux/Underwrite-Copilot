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
/** @type {{ historyRows: number; series: Array<{ id: string; fred?: string; units?: string; label: string }> }} */
const { series: SERIES, historyRows } = require("../data/fred-series.json");

// The last few dozen observations, not the last one: the strip draws each
// series' recent path, and one run backfills it. Idempotent — the upsert is
// on (series_id, obs_date), so re-pulling the same days changes nothing. The
// count is the table's own, so the page reads back exactly what is written.
const OBSERVATIONS = historyRows;
// FRED allows 120 requests a minute; a short pause keeps a dry run (two
// requests a series) well inside it.
const PACE_MS = 150;

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

async function fred(path, params) {
  const api = new URL(`https://api.stlouisfed.org/fred/${path}`);
  for (const [k, v] of Object.entries(params)) api.searchParams.set(k, v);
  api.searchParams.set("api_key", fredKey);
  api.searchParams.set("file_type", "json");
  const res = await fetch(api, { signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}${body.error_message ? ` — ${body.error_message}` : ""}`);
  }
  return body;
}

const failed = [];
const wrote = [];
for (const s of SERIES) {
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

// One line to read the run by, in the shape live-verify's roll-up uses.
console.log(
  `RATES ROLL-UP: ${wrote.length} of ${SERIES.length} series answered` +
    (failed.length ? `; failed: ${failed.join(", ")}` : ""),
);

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

process.exit(wrote.length === 0 ? 1 : 0); // partial success is success
