# Research & Build State

Resume file per project protocol: if a session dies on usage limits, the next session
starts HERE and does not repeat finished work.

**Last updated:** 2026-07-16 (session 3)

## Environment facts the next session must know

- Main-loop egress is tightly proxied: `law.lis.virginia.gov`, `fred.stlouisfed.org`,
  `api.census.gov`, `princegeorgescountymd.gov`, `huduser.gov` all 403/EGRESS_BLOCKED
  from the main loop. **Subagent egress is broader** — subagents fetched
  `code.dccouncil.gov`, `law.lis.virginia.gov`, `files.zillowstatic.com`, and Redfin's
  public S3 cleanly in the July 15–16 passes. Route primary-source fetches through
  subagents; use WebSearch exact-phrase snippet confirmation as the fallback
  (2+ independent queries = "sourced").
- Listing portals (Zillow/Redfin/Realtor/LoopNet/Trulia/homes.com pages) 403-block
  everywhere; Redfin's *data* S3 bucket and Zillow Research CSVs fetch fine.
- Prior research corpus (two deep passes, July 15–16: DMV-wide + East Coast ME–FL)
  is already distilled into the seed JSONs — do not re-run it.

## Phase 1 — data files

| File | Status |
|---|---|
| `data/research/regulatory_rules.json` | ✅ v1 committed (DC verified 3-0 ×2, Philly verified 3-0, MD/VA/CT/NY/Baltimore sourced, NJ = explicit gap). Pending splice: legal-fetcher agent results (PG §13-147 text, VA §55.1-1243 verbatim, DC RENTAL Act enacted text) |
| `data/research/multifamily.json` | ✅ v1 committed (Redfin May-2026 metro table, 3 address examples, DMV verdicts). Pending splice: FRED rates, census B25024 counts, FY2026 FMR |
| `capital_markets.json` | ⏳ next — needs data-fetcher agent results (FRED series) |
| `tax_law.json` | ⏳ not started (bonus depreciation status, 1031, OZ 2.0) |
| `sector_rankings.json` | ⏳ after sector files |
| 13 remaining sector files | ⏳ not started |

## Phase 2 — build

Nothing started. Confirmed: **no** existing `market_intel*` tables, `scripts/daily-intel.mjs`,
or `app/api/intel/latest/route.ts` in the repo — the intel system is a fresh build
(prompt's fallback spec). Migrations run through `0022`; next is `0023`.

Planned order: benchmarks engine → regulatory rules engine → sector-aware schema →
FRED rates service → daily intel → provenance UI → verification pass + INTEGRATION_NOTES.md.

## In flight right now

- Legal-fetcher subagent: VA §55.1-1243 + §55.1-1204/1226 verbatim, Title 15.2 rent-control
  authority scan, PG CB-55 FAQ PDF + §13-147, DC RENTAL Act enacted text.
- Data-fetcher subagent: FRED DGS10/SOFR/MORTGAGE30US/DRCRELEXFACBS latest rows,
  census B25024 for 13 geographies, FY2026 DC-metro FMR, Zillow ZHVI header check.
- Three interrupted deep-research verification runs (wf_21fd31bc-3d7 East Coast,
  wf_2619110c-b29 DMV, wf_3611d315-38f PWC round-2) can be resumed later to upgrade
  ~60 'sourced' claims to 'verified'; resume scripts + journals live under the session
  workflow dir. Not blocking the build.

## Key settled findings (do not re-research)

- **PG County domicile question: SETTLED (sourced, pending code-text double-source).**
  County FAQ attaches the domicile-in-county condition ONLY to the condominium
  exemption. The natural-person ≤5-units exemption has NO domicile condition —
  a VA-resident natural person qualifies. See `md-pg-prsa-small-landlord-exemption`.
- DC: post-1975-permit buildings EXEMPT from rent stabilization (verified 3-0);
  natural-person ≤4-unit exemption requires personal title + no other DC rental
  interest — an LLC disqualifies (verified 3-0).
- PG PRSA cap: lesser of 6.0% or CPI-U+3% (senior: lesser of 4.5% or CPI-U), resets July 1.
- Philadelphia § 9-811: 30-day eviction-diversion participation before filing (verified 3-0).
- NY ETPA cannot reach 2-4 unit product; no Capital Region adoption as of 2026-07-16.
- Redfin May 2026 2-4 unit medians: Scranton $225k / Albany $255k / Reading $279k /
  Philly $363.5k / Hartford $426k / New Haven $475k / Providence $610-630k / Bridgeport $700k.
