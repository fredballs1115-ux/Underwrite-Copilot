#!/usr/bin/env node
// The verification steward (nightly cron). Keeps the data layer honest while
// nobody is looking, and leaves a visible trail either way:
//
//   1. LINK HEALTH — a rolling window (~25/night) of source URLs from the DB
//      research layer, HEAD/GET-checked; dead → data_issues, revived →
//      resolved. (The weekly link-audit workflow covers the JSON layer.)
//   2. FRESHNESS — every feed has a cadence: rates (weekdays), intel digest +
//      news stories (weekdays), benchmarks (180-day research rule), each
//      wired ingest market (monthly re-runs). Overdue → data_issues; back on
//      schedule → resolved. A cron that silently stopped becomes a visible
//      issue the next night.
//   3. CONSISTENCY — invariants that must hold: no single-family leakage into
//      the property DB (the normalizer's one job). Checks that need external
//      keys are SKIPPED WITH A NOTE, not quietly dropped.
//   4. RE-VERIFICATION — the N oldest 'sourced' claims get re-checked against
//      the live web via Claude + web search. Confirmed → as_of bumps to
//      today. A changed benchmark number is corrected IN THE OPEN: the row
//      updates AND data_changelog records old → new + evidence URL. Legal
//      rule text is NEVER auto-edited — a change flags a 'disputed' issue for
//      human review instead.
//   5. HEARTBEAT — a steward_runs row wraps the whole run; the site footer
//      renders its finished_at as "data last verified", and warns when the
//      newest run is older than 48h. Silence is impossible by construction.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... [ANTHROPIC_API_KEY=...] \
//     node scripts/steward.mjs
//
// Without ANTHROPIC_API_KEY, step 4 is skipped and the run notes say so.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const LINKS_PER_NIGHT = 25;
const RECHECK_CLAIMS = 5;
const INGEST_OVERDUE_DAYS = 45;

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const today = new Date();
const iso = today.toISOString();
const daysAgo = (n) => new Date(today.getTime() - n * 86_400_000);
let checksRun = 0;
let issuesFound = 0;
const notes = [];

// ── issue helpers: one OPEN issue per (kind, subject); resolve on recovery ──
async function openIssue(kind, subject, detail) {
  issuesFound += 1;
  const { data } = await supabase
    .from("data_issues")
    .select("id")
    .eq("kind", kind)
    .eq("subject", subject)
    .is("resolved_at", null)
    .limit(1);
  if (data?.length) return; // already open — don't spam duplicates
  const { error } = await supabase
    .from("data_issues")
    .insert([{ kind, subject, detail }]);
  if (error) console.error(`issue insert (${kind} ${subject}): ${error.message}`);
  else console.log(`ISSUE [${kind}] ${subject} — ${detail}`);
}
async function resolveIssue(kind, subject) {
  await supabase
    .from("data_issues")
    .update({ resolved_at: iso })
    .eq("kind", kind)
    .eq("subject", subject)
    .is("resolved_at", null);
}
async function logChange(subject, old_value, new_value, reason, source_url) {
  const { error } = await supabase
    .from("data_changelog")
    .insert([{ subject, old_value, new_value, reason, source_url }]);
  if (error) console.error(`changelog insert: ${error.message}`);
  else console.log(`CHANGELOG ${subject}: ${old_value} → ${new_value}`);
}

// ── heartbeat: open the run row first so even a crash mid-run left a trace ──
let runId = null;
{
  const { data, error } = await supabase
    .from("steward_runs")
    .insert([{ notes: "running" }])
    .select("id")
    .single();
  if (error) {
    console.error(
      `steward_runs insert failed (migration 0028 run?): ${error.message}`
    );
    process.exit(1);
  }
  runId = data.id;
}

// ── 1: rolling link health ──────────────────────────────────────────────────
const checkUrl = async (u) => {
  const probe = async (method) => {
    const res = await fetch(u, {
      method,
      redirect: "follow",
      headers: { "user-agent": "underwrite-copilot-steward/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    return res.status;
  };
  try {
    let status = await probe("HEAD");
    if (status === 405 || status === 403 || status === 400) status = await probe("GET");
    return { ok: status >= 200 && status < 400, status };
  } catch {
    return { ok: false, status: null };
  }
};

try {
  const sources = new Set();
  for (const table of ["benchmarks", "regulatory_rules"]) {
    const { data } = await supabase.from(table).select("source");
    for (const row of data ?? []) {
      const s = String(row.source ?? "");
      if (s.startsWith("http")) sources.add(s);
    }
  }
  const all = [...sources].sort();
  if (all.length === 0) {
    notes.push("link health: no DB source URLs (tables unseeded) — skipped");
  } else {
    // Deterministic rolling window: the whole set gets covered every
    // ceil(n/25) nights without tracking per-link state.
    const dayIdx = Math.floor(today.getTime() / 86_400_000);
    const start = (dayIdx * LINKS_PER_NIGHT) % all.length;
    const window = Array.from(
      { length: Math.min(LINKS_PER_NIGHT, all.length) },
      (_, i) => all[(start + i) % all.length]
    );
    let dead = 0;
    for (const u of window) {
      checksRun += 1;
      const r = await checkUrl(u);
      if (r.ok) {
        await resolveIssue("dead_link", u);
      } else {
        dead += 1;
        await openIssue("dead_link", u, `HTTP ${r.status ?? "network error"} on ${iso.slice(0, 10)}`);
      }
    }
    notes.push(`link health: ${window.length} checked, ${dead} dead`);
  }
} catch (err) {
  notes.push(`link health errored: ${String(err).slice(0, 120)}`);
}

// ── 2: freshness sweep, per cadence ─────────────────────────────────────────
async function freshness(table, dateCol, staleDays, subject, hint) {
  checksRun += 1;
  try {
    const { data, error } = await supabase
      .from(table)
      .select(dateCol)
      .order(dateCol, { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const newest = data?.[0]?.[dateCol] ? new Date(data[0][dateCol]) : null;
    if (!newest) {
      await openIssue("stale", subject, `no rows at all — ${hint}`);
    } else if (newest < daysAgo(staleDays)) {
      await openIssue(
        "stale",
        subject,
        `newest ${dateCol} is ${String(data[0][dateCol]).slice(0, 10)} (> ${staleDays}d) — ${hint}`
      );
    } else {
      await resolveIssue("stale", subject);
    }
  } catch (err) {
    await openIssue("stale", subject, `table unreadable (${String(err).slice(0, 80)}) — ${hint}`);
  }
}

await freshness("rates", "obs_date", 5, "rates", "is the weekday FRED cron running?");
await freshness("market_intel_digests", "digest_date", 4, "market_intel_digests", "is the weekday intel cron running?");
await freshness("market_intel_items", "created_at", 4, "news_stories", "is the weekday intel cron running?");

// Benchmarks: the 180-day research rule — count, don't just check the newest.
try {
  checksRun += 1;
  const { count } = await supabase
    .from("benchmarks")
    .select("id", { count: "exact", head: true })
    .lt("as_of", daysAgo(180).toISOString().slice(0, 10));
  if ((count ?? 0) > 0) {
    await openIssue("stale", "benchmarks", `${count} rows older than 180 days — refresh pass due`);
  } else {
    await resolveIssue("stale", "benchmarks");
  }
} catch {
  notes.push("benchmarks freshness: table unreadable — skipped");
}

// Each WIRED ingest market (a pipeline file in scripts/ingest/) must have
// rows, and recent ones — "wired but never run" is a visible issue.
const ingestDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "ingest");
let markets = [];
try {
  markets = readdirSync(ingestDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.replace(/\.ts$/, ""));
} catch {
  notes.push("no scripts/ingest directory — ingest freshness skipped");
}
for (const market of markets) {
  checksRun += 1;
  try {
    const { data, error } = await supabase
      .from("properties")
      .select("ingested_at")
      .eq("market", market)
      .order("ingested_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const newest = data?.[0]?.ingested_at ? new Date(data[0].ingested_at) : null;
    if (!newest) {
      await openIssue("stale", `ingest:${market}`, "pipeline wired but zero rows — run the ingest workflow");
    } else if (newest < daysAgo(INGEST_OVERDUE_DAYS)) {
      await openIssue("stale", `ingest:${market}`, `newest ingest ${newest.toISOString().slice(0, 10)} — monthly re-run overdue`);
    } else {
      await resolveIssue("stale", `ingest:${market}`);
    }
  } catch (err) {
    await openIssue("stale", `ingest:${market}`, `properties unreadable (${String(err).slice(0, 80)}) — migration 0028 run?`);
  }
}

// ── 3: consistency invariants ───────────────────────────────────────────────
// SFR leakage: the normalizer's contract is that single-family never enters.
try {
  checksRun += 1;
  const [{ count: p1 }, { count: p2 }, { count: s1 }] = await Promise.all([
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .ilike("land_use_raw", "%single family%"),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .in("asset_class", ["sfr", "single_family"]),
    supabase
      .from("recorded_sales")
      .select("id", { count: "exact", head: true })
      .in("asset_class", ["sfr", "single_family"]),
  ]);
  const leaked = (p1 ?? 0) + (p2 ?? 0) + (s1 ?? 0);
  if (leaked > 0) {
    await openIssue("consistency", "sfr_leakage", `${leaked} single-family rows found in the property DB — the normalizer gate failed`);
  } else {
    await resolveIssue("consistency", "sfr_leakage");
  }
} catch {
  notes.push("sfr leakage check: property tables unreadable — skipped");
}
notes.push(
  "skipped (needs external keys/context): photo metadata resolution, per-page n<5 display audit (enforced in UI code)"
);

// ── 4: re-verify the oldest 'sourced' claims against the live web ───────────
async function claudeWebSearch(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = (body.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

if (!anthropicKey) {
  notes.push("re-verification: skipped (no ANTHROPIC_API_KEY)");
} else {
  try {
    const [{ data: bm }, { data: rr }] = await Promise.all([
      supabase
        .from("benchmarks")
        .select("id, sector, metro, metric, low, high, unit, source, as_of, note")
        .eq("status", "sourced")
        .order("as_of", { ascending: true })
        .limit(3),
      supabase
        .from("regulatory_rules")
        .select("id, jurisdiction_state, jurisdiction_local, rule_type, effect, source, as_of")
        .eq("status", "sourced")
        .order("as_of", { ascending: true })
        .limit(RECHECK_CLAIMS - 3),
    ]);

    for (const b of bm ?? []) {
      checksRun += 1;
      const claim = `${b.sector}${b.metro ? ` / ${b.metro}` : ""} — ${b.metric}: ${b.low ?? "?"}–${b.high ?? "?"} ${b.unit} (source: ${b.source}; as of ${b.as_of}${b.note ? `; note: ${b.note}` : ""})`;
      try {
        const v = await claudeWebSearch(
          `Re-verify this real-estate benchmark against CURRENT primary sources (government, SEC/REIT filings, NCREIF/NAREIT/MBA, major brokerage research). Search the web.

Claim: ${claim}

Reply with ONLY a JSON object:
{"verdict":"confirmed"|"corrected"|"disputed"|"not_found","new_low":number|null,"new_high":number|null,"evidence_url":"https://..."|null,"note":"one sentence"}
- confirmed: a primary source still supports these numbers (evidence_url required)
- corrected: a primary source now states materially different numbers — give them in the SAME unit (${b.unit})
- disputed: primary sources conflict with each other
- not_found: you could not find a primary source either way`
        );
        const subj = `benchmark ${b.sector}/${b.metro || "national"}/${b.metric}`;
        const okUrl = typeof v.evidence_url === "string" && v.evidence_url.startsWith("http");
        if (v.verdict === "confirmed" && okUrl) {
          await supabase
            .from("benchmarks")
            .update({ as_of: iso.slice(0, 10) })
            .eq("id", b.id);
          await logChange(subj, `as_of ${b.as_of}`, `as_of ${iso.slice(0, 10)}`, `steward re-verified against live source: ${v.note ?? ""}`.trim(), v.evidence_url);
          await resolveIssue("disputed", subj);
        } else if (
          v.verdict === "corrected" &&
          okUrl &&
          (Number.isFinite(v.new_low) || Number.isFinite(v.new_high))
        ) {
          const nl = Number.isFinite(v.new_low) ? v.new_low : b.low;
          const nh = Number.isFinite(v.new_high) ? v.new_high : b.high;
          await supabase
            .from("benchmarks")
            .update({ low: nl, high: nh, as_of: iso.slice(0, 10) })
            .eq("id", b.id);
          await logChange(subj, `${b.low ?? "?"}–${b.high ?? "?"} ${b.unit}`, `${nl ?? "?"}–${nh ?? "?"} ${b.unit}`, `steward correction from live source: ${v.note ?? ""}`.trim(), v.evidence_url);
        } else {
          await openIssue("disputed", subj, `${v.verdict ?? "unparseable"}: ${v.note ?? "no note"}${okUrl ? ` (${v.evidence_url})` : ""}`);
          await logChange(subj, null, null, `steward flagged ${v.verdict ?? "unparseable"} — value left unchanged: ${v.note ?? ""}`.trim(), okUrl ? v.evidence_url : null);
        }
      } catch (err) {
        notes.push(`re-verify ${b.metric} errored: ${String(err).slice(0, 100)}`);
      }
    }

    for (const r of rr ?? []) {
      checksRun += 1;
      try {
        const v = await claudeWebSearch(
          `Re-verify this landlord/real-estate legal rule against CURRENT primary sources (the statute/code itself, the government agency page, official council records). Search the web.

Rule [${r.id}] (${r.jurisdiction_state}${r.jurisdiction_local ? "/" + r.jurisdiction_local : ""}, ${r.rule_type}): ${r.effect}
Source on file: ${r.source} (as of ${r.as_of})

Reply with ONLY a JSON object:
{"verdict":"confirmed"|"changed"|"disputed"|"not_found","evidence_url":"https://..."|null,"note":"one sentence"}`
        );
        const subj = `rule ${r.id}`;
        const okUrl = typeof v.evidence_url === "string" && v.evidence_url.startsWith("http");
        if (v.verdict === "confirmed" && okUrl) {
          await supabase
            .from("regulatory_rules")
            .update({ as_of: iso.slice(0, 10) })
            .eq("id", r.id);
          await logChange(subj, `as_of ${r.as_of}`, `as_of ${iso.slice(0, 10)}`, `steward re-verified against live source: ${v.note ?? ""}`.trim(), v.evidence_url);
          await resolveIssue("disputed", subj);
        } else {
          // Legal text is never auto-edited — flag for human review instead.
          await openIssue("disputed", subj, `${v.verdict ?? "unparseable"}: ${v.note ?? "no note"}${okUrl ? ` (${v.evidence_url})` : ""}`);
          await logChange(subj, null, null, `steward flagged ${v.verdict ?? "unparseable"} — rule text left unchanged pending human review: ${v.note ?? ""}`.trim(), okUrl ? v.evidence_url : null);
        }
      } catch (err) {
        notes.push(`re-verify ${r.id} errored: ${String(err).slice(0, 100)}`);
      }
    }
    notes.push(`re-verification: ${(bm?.length ?? 0) + (rr?.length ?? 0)} oldest sourced claims re-checked`);
  } catch (err) {
    notes.push(`re-verification errored: ${String(err).slice(0, 120)}`);
  }
}

// ── 5: close the heartbeat ──────────────────────────────────────────────────
await supabase
  .from("steward_runs")
  .update({
    finished_at: new Date().toISOString(),
    checks_run: checksRun,
    issues_found: issuesFound,
    notes: notes.join(" | ").slice(0, 2000),
  })
  .eq("id", runId);
console.log(`steward run complete: ${checksRun} checks, ${issuesFound} issue flags`);
for (const n of notes) console.log(`  note: ${n}`);
