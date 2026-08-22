# Integration Notes — Research Layer Build

What the two-phase research build added, how to turn it on, what's `verified`
vs `sourced`, and the gaps that would most change your underwriting.
(Resume state for future sessions lives in `RESEARCH_STATE.md`.)

## What was built

**Phase 1 — `/data/research/` (16 files).** All 14 sectors (multifamily,
SFR/BTR, office+medical, industrial incl. IOS, retail incl. NNN, hospitality+STR,
self-storage, data centers, senior, student, life science, manufactured housing,
land/infill, specialty) plus `capital_markets.json`, `tax_law.json`,
`regulatory_rules.json`, and `sector_rankings.json`. Every number carries
`source`, `as_of`, and a status label; nothing is estimated — unverifiable
values are `null` with `unverified_not_found`.

**Phase 2 — features.**
1. **Regulation & benchmarks panel** (deal page): auto-evaluates the rules
   against the deal's address; Exempt/Applies/Possibly chips; open questions
   named; every row shows source + as-of + status + stale badge (>180 days).
   Unknown jurisdiction → "no rules on file", never a silent pass.
2. **Sector facts form** (deal page): per-sector fields; for residential
   deals these are exactly the rules engine's open questions — answering
   "building permit year: 1922" flips the DC coverage chip in place.
3. **Rules engine** (`lib/research.ts`): pure tri-state evaluator, 13 tests.
   Missing data is never a pass.
4. **Live rates**: `scripts/fetch-rates.mjs` (FRED → `rates` table, daily
   cron) + rates strip on /market with FRED links.
5. **Daily intel**: `scripts/daily-intel.mjs` (weekday cron): Google News RSS
   per watch query → dedupe → Claude scores 0–10 for YOUR buy profile →
   digest + `/api/intel/latest` + market-page card; likely law changes insert
   `regulatory_alerts` → red banner on every screen until dismissed.
6. **Provenance everywhere**: research numbers in the panel, benchmarks, and
   rates strip are clickable to their sources with as-of dates and status.

## Ops steps to go live (in order)

1. Run migrations **0023, 0024, 0025, 0026** in the Supabase SQL editor (idempotent).
   (0026 adds `deals.public_comps` for auto-pulled public-record comps —
   without it, comp pulls fail silently on write; the panel will sit in
   "pulling…" state.)
2. (Optional) seed the DB layer: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed-research.mjs`
   — the app already falls back to the checked-in JSONs, so this only matters
   when you want DB rows to override shipped seeds without a deploy.
3. Get a free FRED key (fred.stlouisfed.org/docs/api/api_key.html); set
   `FRED_API_KEY` on the new `underwrite-copilot-rates` cron in Render.
4. Deploy the Blueprint — `render.yaml` adds two cron services
   (`underwrite-copilot-intel` weekdays 12:00 UTC, `…-rates` 12:30 UTC); fill
   their `sync: false` env vars in the dashboard.
5. Smoke test: run each cron once manually from the Render dashboard; confirm
   a digest row lands and the rates strip shows all four series; open a deal
   with a DC/PG/Philadelphia address and confirm the regulation panel fires.
   (These live steps couldn't run in the build container — no secrets, and
   the egress proxy blocks FRED/census/HUD from here.)
6. **Auto-comps check**: open (or create) a deal with a Philadelphia street
   address — the "Recorded sales nearby" panel should fill within a minute.
   Then hit `/api/comps/health` signed-in: Philadelphia should be `ok:true`;
   the DC and Maryland entries ship config-first (their portals were
   unreachable from the build environment), and this route returns the
   upstream layer list / field errors needed to correct
   `lib/public-comps/core.ts` in one line each.

## Verified vs sourced — the honest ledger

**Verified (adversarial 3-0 panels or 2+ independent primaries):**
- DC: post-1975-permit buildings exempt from rent stabilization (§ 42-3502.05(a)(2)).
- DC: natural-person ≤4-unit exemption — personal title only, no other DC
  rental interest; an LLC disqualifies (§ 42-3502.05(a)(3)).
- Philadelphia § 9-811: 30-day eviction-diversion participation before filing.
- Freddie PMMS 30Y = 6.65% (Aug 20, 2026).
- 100% bonus depreciation permanent (OBBBA) for post-Jan-19-2025 property.
- FY2026 SAFMR system live for the DC metro (PW County is a SAFMR jurisdiction).

**Sourced (one primary or exact-phrase snippet confirmation) — the bulk:**
all sector cap-rate bands, the Redfin May-2026 metro medians, FY2026 DC FMRs
($1,953/$2,015/$2,246/$2,835 by bedroom), PG PRSA cap + exemption text,
D.C. Law 26-80's TOPA exemptions, Takoma Park/MoCo/Baltimore/CT/NY rules,
OZ 2.0 timing, address-level listing examples (all marked "reconfirm live").

## Top 10 gaps, ranked by how much they'd change your underwriting

(Re-ranked 2026-08-22 after the two big-city sweeps — items the sweeps
closed are gone: NJ's two biggest cities are screened, the LA cap is
verified, SF/Twin Cities/TN/NC are encoded.)

1. **D.C. Law 26-80 enacted section text** — the 2–4 unit TOPA exemption's
   "business corporation" definition; still on practitioner-alert authority.
2. **PG County § 13-147 code text + effective dates** — both current
   confirmations are secondary.
3. **FY2026 big-metro FMR primary pulls (huduser)** — ten metros' 2BR FMRs
   failed the 2-source bar (Chicago/LA/SF/Seattle/Boston/Dallas/Miami/
   Atlanta/Denver/Phoenix + Twin Cities/Nashville/Charlotte); NYC $2,910
   made it as sourced. Also FY2026 SAFMRs by target ZIP.
4. **ACS B25024 2-4 unit stock counts per metro** — partially superseded:
   wired metros (Philly/NYC/Cook) now count REAL parcels from the property
   DB; ACS still decides where dated stock is in unwired metros.
5. **First ingest runs + remaining pipelines** — Philadelphia/NYC/Cook are
   wired but need their Actions runs (user task); Boston CKAN, King County
   sales file, Hennepin/Ramsey, POLARIS/Wake, TX CADs documented next.
6. **CY2026 FHA loan limits (DC metro) + the 4000.1 self-sufficiency test
   parameters** — gates the house-hack financing path on 3-4 units.
7. **NJ beyond Newark/Jersey City** — ~98 municipal ordinances unscreened;
   the statewide catch-all rule says so on every other NJ deal.
8. **Watch items with teeth**: Virginia enabling-bill study (2027 session),
   MA rent-control revival (SJC blocked the 2026 ballot, pressure ongoing),
   Minneapolis charter authorization (no ordinance yet), St. Paul rollback
   churn, rolling exemption windows (CA 15yr / WA 12yr / OR 15yr) advancing
   each Jan 1 — the steward re-verifies these nightly.
9. **MHC-specific tenant statutes (MD/VA/PA/NC)** — needed before the
   rank-4 diversifier is actionable; not yet in the rules engine.
10. **Cap-rate series for the 2-4 unit segment specifically** — becomes
    COMPUTABLE per-metro once ingested sales accumulate alongside rent
    data; gross-yield proxies are the stand-in.

## Environment caveat for future build sessions

This container's egress proxy blocks nearly all direct fetches (FRED, census,
HUD, state legislatures, even Wikipedia) for both the main loop and subagents;
only WebSearch works. The production crons run on Render with open egress —
that's where live pulls belong. Details in `RESEARCH_STATE.md`.
