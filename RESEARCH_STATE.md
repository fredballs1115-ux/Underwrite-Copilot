# Research & Build State

Resume file per project protocol: a future session starts HERE and does not
repeat finished work. Ops/go-live steps + the ranked gap list live in
`INTEGRATION_NOTES.md`.

**Last updated:** 2026-08-22 (session 4, national expansion) — property
database layer built: migration 0028 (properties + recorded_sales w/ PostGIS
`nearby_sales` RPC + journal_entries + data_issues/changelog/steward_runs),
`lib/ingest/normalize` (SFR dropped at the gate, tested), Philadelphia bulk
pipeline (`scripts/ingest/philadelphia.ts`, Carto SQL, idempotent) + ingest
GitHub workflow; comps engine refactored DB-first (`computeRecordComps`
shared by deals + the new /comps Pull Comps tool); /journal (daily entry
written by extended daily-intel.mjs, honest fetch_failed rows), /laws
(full rule reference + alerts), nightly steward (`scripts/steward.mjs`:
link health, freshness per cadence, SFR-leakage invariant, N=5 oldest
sourced claims re-verified via web search, corrections via open changelog)
+ /data-health + footer "data last verified". Homepage "ground layer"
section with live DB stats. Bulk source map: `data/research/
ingestion_sources.md`. Gated on user: migration 0028, Actions secrets,
first ingest run, steward cron, Supabase plan decision ($25/mo Pro when
market #2 lands).

Previous (2026-08-21, session 3, site-polish): BOTH PHASES COMPLETE;
metro layer added (metros.json: 8 Mid-Atlantic metros; county_data_sources.json:
14 jurisdictions mapped). New sourced facts: Baltimore FY2026 2BR FMR $1,943,
Philadelphia $1,810, Richmond institutional median $129.5k/unit (Q1 2026).
Gaps that did NOT confirm (never guessed): Richmond + Norfolk FY2026 FMRs.
Run migration 0027 (deals.photo) with the others.

## Done

- **Phase 1**: all 16 `/data/research/` files (14 sectors + capital_markets +
  tax_law + regulatory_rules + sector_rankings). Two-tier labels in the data.
- **Phase 2**: migrations 0023/0024/0025; `lib/research.ts` tri-state rules
  engine (13 tests) + `lib/sector-fields.ts` catalog (8 tests); deal-page
  Regulation & benchmarks panel + Sector facts form; market-page rates strip
  + intel digest card; `/api/intel/latest`; red-banner regulatory alerts with
  dismiss; `scripts/seed-research.mjs`, `scripts/fetch-rates.mjs`,
  `scripts/daily-intel.mjs`; render.yaml cron services. 286 tests green,
  production build clean. PR #40 (draft).

## Environment facts (unchanged since discovery, re-verified 2026-08-21)

- The container's egress proxy blocks nearly ALL direct fetches — FRED,
  api.census.gov, huduser.gov, law.lis.virginia.gov, princegeorgescountymd.gov,
  files.zillowstatic.com, even en.wikipedia.org — for the main loop AND
  subagents. **Only WebSearch works.** Method that held up: exact-phrase
  snippet confirmation across 2+ independent queries = `sourced`.
- Live data pulls belong in the Render crons (open egress in production).

## Key settled findings (do not re-research)

- PG County domicile question SETTLED: domicile attaches only to the condo
  exemption; the natural-person ≤5-unit exemption has no domicile condition;
  LLC ownership voids it. Lineage CB-007-2023 → CB-008-2024 → CB-055-2024
  (CB-007-2025 is an unrelated benefits bill); effective dates conflict —
  Legistar pull queued.
- DC: § 42-3502.05(a)(2) post-1975 exemption + (a)(3) natural-person ≤4-unit
  exemption both VERIFIED 3-0. D.C. Law 26-80 (eff. 2025-12-31) exempts
  single-family + most 2-4 unit accommodations from TOPA (corporation caveat,
  sourced).
- Va. § 55.1-1243 is REPEALED; no-rent-control rests on Dillon-Rule
  absence-of-grant; § 55.1-1226 = 2-month deposit cap (exact-phrase).
  Enabling bills keep failing; Housing Commission study June 2026 → watch.
- Philadelphia § 9-811 VERIFIED 3-0 (30-day pre-filing diversion).
- Redfin May-2026 2-4 unit medians: Scranton $225k / Albany $255k / Reading
  $279k / Philly $363.5k / Hartford $426k / New Haven $475k / Providence
  $610-630k / Bridgeport $700k. FY2026 DC FMRs: $1,953/$2,015/$2,246/$2,835
  (0-3BR, sourced); DCHA payment standard 187% of FMR.
- PMMS 6.65% (2026-08-20, verified). 100% bonus depreciation permanent
  (OBBBA, post-2025-01-19 property, verified). OZ 2.0: new designations
  July 1 2026 → effective Jan 1 2027 (sourced).

## If resuming for more research

Work the ranked gap list in `INTEGRATION_NOTES.md` (top: Law 26-80 section
text, PG Legistar dates, FY2026 SAFMRs by ZIP, B25024 stock counts, NJ
municipal screen). Three interrupted July verification workflows can still be
resumed to upgrade ~60 sourced claims (scripts + journals under the July 16
session's workflow dir) — optional, not blocking.
