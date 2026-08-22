# Research & Build State

Resume file per project protocol: a future session starts HERE and does not
repeat finished work. Ops/go-live steps + the ranked gap list live in
`INTEGRATION_NOTES.md`.

**2026-08-22 (session 4g, FOCUS scoping per direction)** — presentation
scoped to the Mid-Atlantic home region (10 metros incl. Newark/Jersey City)
+ the 12 biggest US markets (NYC, Boston, Chicago, LA, SF, Seattle, Miami,
Atlanta, Dallas, Houston, Denver, Phoenix) = 22 metro entries, three market
sections. The 68-rule / 51-jurisdiction engine is RETAINED as depth (any
address still evaluates; unscreened-focus jurisdictions say so) but the
marketing now leads with the focused list, not every-state scale. Removed
metro entries live in git history if re-expanded.

**2026-08-22 (session 4f, 50-state close-out)** — 14 rules (68 total,
ALL 50 STATES + DC): IA/KS/ID/SD/ND/MT/NM preemptions (sourced, cites
queued); NE/AR/MS no-rent-control-at-any-level; **WV joins RI in the
no-preemption latent-authority class**; WY encoded with its tracker
CONFLICT named; AK preemption unconfirmed; **HI flagged check-not-clear**
(Maui county-level measures — county screen queued). AR's missing implied
warranty of habitability noted for the future tenant-law axis. Homepage
scale stats now honestly read every-state coverage, derived.

**2026-08-22 (session 4e, fourth sweep — the South + New England close-out)**
— 8 rules (54 total, spanning 36 states + DC) + 7 metros (43): KY/SC/AL/LA/OK
preemptions (SC statute language quoted verbatim; AL cite §11-80-8.1; all
sourced with cite pulls queued); VT no-rent-control (Burlington charter
politics = watch), NH no-rent-control + landlord-favorable HB 60 (2025:
lease expiry = good cause, single-source labeled), DE no rent control at any
level (MHC rent-justification regime noted for the sector's later
activation). The ME→FL corridor is now covered state-by-state end to end.
Homepage derived counts updated automatically (37 jurisdictions).

**2026-08-22 (session 4d, third sweep — Midwest/Mountain/NE corridor)** —
9 rules (46 total) + 12 metros (36): OH HB 430 preemption (eff. 2022-09-22,
4 sources); **Portland ME rent control** (70% of Boston CPI, 2.2% for 2026,
sitting tenants AND between tenancies, owner-occupied 2-4 unit EXEMPT —
verified vs city ordinance PDF + FAQ; the one rent-controlled city in the
ME→FL corridor north of NJ); MI MCL 123.411 + WI §66.1015 (legislature
primary) + IN §32-31-1-20 + MO §441.043 (revisor.mo.gov primary)
preemptions; NV/UT preemptions sourced (statute cites queued); **RI = no
rent control AND no preemption — latent municipal authority**, watch
Providence. NE-corridor metros (Providence, Hartford/New Haven, Albany,
Scranton/Reading) finally in metros.json, tied to the existing CT fair-rent
+ NY ETPA rules and the Redfin medians already in the benchmark tables.
Homepage/why scale counts are DERIVED so they updated automatically.

**2026-08-22 (session 4c, second sweep)** — 5 more rules (37 total) + 3
metros (24): SF Rent Ordinance (pre-June-13-1979 caps + just-cause; post-1979
exempt from caps but just-cause-covered since the 2024 ordinance — verified
vs sf.gov ×2); St. Paul rent stabilization (3% cap, ROLLING 20-yr
new-construction exemption, May-2025 rollback churn = watch — verified vs
stpaul.gov) + Minneapolis authorized-not-enacted (sourced); TN §66-35-102 and
NC §42-14.1 preemptions (verified vs statute text, ncleg.gov primary). LA RSO
cap UPGRADED single-source→verified: 3% through 2026-06-30, utility adders
end 2026-02-02, then 90%-of-CPI formula floor 1% / ceiling 4% from
2026-07-01 (LAHD calculator page + AAGLA + 2 analyses). NYC+Cook ingest
pipelines wired (PLUTO/RollingSales BBL join; universe/sales PIN join, CCAO
211/212 kept); review pass fixed 7 findings incl. portfolio-floor and
coord-backfill bugs. Market page shows live property-DB stock counts for
wired metros.

**2026-08-22 (session 4b, big-city sweep)** — 16 rules added (32 total) via
snippet-confirmation, primary statute text wherever it surfaced: NYC rent
stabilization (6+ units pre-1974 — 2-4 unit product OUTSIDE it, verified) +
Good Cause Eviction (≤10-unit statewide small-landlord + owner-occupied ≤10
+ 245%-of-FMR exemptions, verified vs DHCR fact sheet); CA AB 1482 (5%+CPI
max 10%; owner-occupied duplex + 15-yr rolling C-of-O exemptions) + LA RSO
(2+ units on/before Oct 1 1978; 2025 4% cap single-source — confirm); WA HB
1217 (lesser of 7%+CPI or 10%; 2026 = 9.683%; 12-yr new-construction +
owner-occupied-SFR≤2 exemptions); OR SB 608/611 (lesser of 10% or 7%+CPI-U
West; 2026 = 9.5% sourced; 15-yr exemption); IL Preemption Act 1997 +
Chicago RLTO owner-occupied ≤6 exemption; MA 1994 ban (2026 revival BLOCKED
from ballot by SJC — watch); TX §214.902 / GA §44-7-19 / AZ §33-1329 / CO
§38-12-301 preemptions (all verified vs statute text); FL §166.043 (sourced,
statute pull queued); Newark owner-occupied-1-4 exemption vs Jersey City ALL
1-4-unit exemption (both verified — JC is the standout for this buy box).
13 metros added to metros.json with regulation-forward market_notes.
FMR FY2026: NYC 2BR $2,910 (sourced, 2 republishers); Chicago/LA/SF/Seattle/
Boston/Dallas/Miami/Atlanta/Denver/Phoenix/Houston DID NOT CONFIRM from
independent sources (aggregator figures conflicted) — recorded as gaps,
never estimated. Evaluator bug found+fixed while testing: the generic _lte
comparator swallowed owner_occupied_with_units_lte before its dedicated
handler (was forever-unknown); 13 new tests pin the big-city outcomes.
Rolling exemption windows (CA 15yr/WA 12yr/OR 15yr) encoded as 2026-snapshot
dates — steward re-verification advances them.

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
