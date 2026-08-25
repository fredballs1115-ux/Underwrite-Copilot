# Data-source roadmap — ranked by (value to an underwrite × ease of integration)

Derived from the 646-entry registry (`sources.json`, 2026-08-25). "Feeds
comps" = lands in `properties`/`recorded_sales` and serves the existing
comps engine (`nearby_sales` RPC → deal panel + /comps tool). "Feeds
benchmarks" = lands as `Benchmark` rows next to the FMR/median rows the
deal panel and market page already render. Rule: official APIs, bulk
downloads, and GIS services only — nothing whose terms prohibit automation
gets built (those live in Tier 3 as manual/future items).

## Tier 1 — build now (this PR)

| # | Source | Metros | Why now | Feeds |
|---|---|---|---|---|
| 1 | King County Assessor bulk extracts (`RPSALE_EXTR` + `PARCEL_EXTR`) | seattle | The best free sales file in the West: weekly bulk CSV, price+date+parcel keys, no terms friction | comps (directly), property DB |
| 2 | Boston Property Assessment yearly roll (Analyze Boston CKAN) | boston | Named repo gap; CKAN datastore API, self-describing resources | property DB (assessment context); comps once MassGIS L3 sale fields join |
| 3 | HUD Fair Market Rents API (huduser, token) | ALL 18 | One API closes the repo's #3 gap (10 metros' FY2026 FMRs unverified); annual updates automated | benchmarks (directly) |
| 4 | Opportunity Zone tract registry (MD Socrata `hu7s-ph9b` confirmed + HUD/state layers config-first) + Census-geocoder tract resolution | ALL | Tract-level OZ flag is a pure win for the regulatory panel; official public-domain data | regulatory checks |
| 5 | FEMA NFHL point query (flood zone at the deal's coordinates) | ALL | Highest-value hazard flag per underwrite; official GIS service, no bulk needed | regulatory checks |
| 6 | Fairfax County Tax Administration sales tables (ArcGIS, dataset now search-confirmed) | nova | Upgrades the existing `va_fairfax` discovery provider with the confirmed dataset | comps |
| 7 | Miami-Dade open-data parcels/sales + Richmond GeoHub/Socrata (discovery providers, health-checked) | miami, richmond | Confirmed portals; exact layers resolve in production via `/api/comps/health` — the repo's established pattern | comps |
| 8 | Public-record parcel card on the deal page (assessed value, year built, SF, owner/absentee, last recorded sale) | wired metros | The ingested data becomes visible where underwriting happens; provenance shown | underwrite inputs (context), rules engine (year built) |

Already wired before this PR (kept, documented in the registry):
Philadelphia OPA (Carto), NYC PLUTO+Rolling Sales, Cook County parcel
universe+sales, MD SDAT / DC ITS / NJ MOD-IV live providers.

## Tier 2 — next (documented, endpoint or field names still to resolve)

Ranked; all are official/open access, medium difficulty:

1. **MassGIS L3 standardized parcels** (statewide bulk incl. `LS_PRICE`/`LS_DATE`) — one feed covers every Boston-metro municipality; turns Boston from assessment-only into comps.
2. **LA County assessor roll** (Socrata, ~2.4M parcels, annual) — plan-size driver; parcels+assessed only (CA sale prices via recorder are paywalled).
3. **SF DataSF secured roll + DBI permits + eviction notices** — portal confirmed but every dataset name is `unverified` (the research agent's search budget died mid-SF); one production health-check session resolves them.
4. **DCAD / TAD certified rolls** (TX) — bulk downloads confirmed; **non-disclosure state: no sale prices anywhere in public records** — parcels/assessment only, comps stay MLS/broker-derived.
5. **DC ITS Public Extract bulk** + **MD SDAT bulk** ingests (live query providers exist; bulk ingest gives the DB-first path + absentee flags).
6. **NJ SR1A sales files** (county tax boards) — deed-grade sales for Newark/JC beyond the MOD-IV last-sale fields.
7. **Philadelphia `rtt_summary`** (Carto) — deed-level transfer history behind the OPA last-sale field.
8. **Chicago TIF districts + Cook Class 6b/7/8/9 incentive classes** (open datasets) — incentive-zone depth for the one metro where abatement class drives the tax bill.
9. **Baltimore Open Baltimore violations/vacants/permits** — pairs with the city's license-before-rent and violation-rent-freeze rules already in the engine.
10. **Zillow ZORI CSVs** — free metro rent index for all 18; check redistribution terms before storing (display with attribution).
11. **PA STEB / TEDTrac statewide sales** — bulk extract not confirmed public; contact STEB before assuming redistribution rights.

## Tier 3 — manual / future (terms or structure block automation)

- **Virginia Circuit Court land records** (Richmond city, Henrico,
  Chesterfield, Fairfax CPAN, Loudoun, Norfolk…): per-user, clerk-approved
  Secure Remote Access subscriptions; credential sharing prohibited
  (Va. Code § 17.1-294); no bulk index. Deed depth in VA = GIS
  last-sale fields only. **This is the single biggest VA access gap.**
- **Maryland Judiciary Case Search** (foreclosure/eviction dockets):
  CAPTCHA added specifically to block scraping; terms prohibit
  interference. Use the published foreclosure-notice open dataset instead;
  eviction dockets stay manual.
- **PhilaDox** (Philadelphia deed images): index and images paywalled.
  The open `rtt_summary` dataset substitutes for transfers.
- **Prince William County VA**: portal 403-blocks automation (re-confirmed
  as a repo lead; treat as scrape-prohibited). County FOIA/data request is
  the path; tax-delinquency list remains the verified off-market flow.
- **GSCCCA** (GA statewide deed index): subscription; county-level qPublic
  assessment data substitutes for parcels.
- **Brokerage research PDFs** (CBRE/JLL/Colliers/M&M/Newmark/C&W/Kidder):
  copyrighted — cite figures with attribution in research JSONs (existing
  practice), never redistribute or bulk-scrape.
- **The Warren Group** (MA sales): commercial license only.
- **Texas sale prices**: not a terms problem — they simply don't exist in
  public records (non-disclosure). Structural.

## Access disparities that set build order (the "counties differ wildly" list)

- **NoVA**: Fairfax/Arlington/Loudoun publish parcels+assessments+zoning on
  ArcGIS hubs (easy) while Prince William blocks automation entirely —
  build Fairfax first, PW stays manual.
- **Massachusetts**: assessing is per-municipality but MassGIS L3
  standardizes all of it statewide — build the state layer, not 100 town
  scrapers. Deeds: masslandrecords.com free images (easy) — the inverse of
  Virginia.
- **Virginia**: GIS assessment layers are easy everywhere, but deed/mortgage
  detail sits behind per-clerk subscriptions — comps must come from
  assessment-roll sale fields, not deed indexes.
- **Maryland**: one Socrata feed (SDAT) covers every county — cheapest
  multi-county win in the registry; but the court side (foreclosure/
  eviction) is CAPTCHA-walled.
- **NYC**: ACRIS open datasets cover 4 boroughs; Staten Island (Richmond
  County Clerk) is outside ACRIS — flag on any SI deal.
- **Texas**: appraisal rolls are excellent bulk downloads; sales prices
  don't exist publicly. Comps pipeline there needs a different strategy
  (broker/MLS-derived, deed-of-trust amounts as weak proxies).
- **California**: Prop 13 makes assessed values acquisition-vintage — an
  assessed value is NOT a market-value signal (unlike 100%-FMV states);
  recorder images cost money in every county researched.
- **Georgia**: 40% assessment ratio — normalize before comparing
  assessed values across states.

## Verification debt (carried honestly)

264 of 646 entries are `unverified` (egress-blocked build environment; only
search-snippet confirmation was possible). The production steward
(`scripts/steward.mjs`, nightly, open egress) should link-check
`sources.json` URLs the same way it already checks research links, and
`/api/comps/health` resolves provider endpoints/fields. San Francisco and
Hampton Roads carry the most debt; Seattle/Baltimore/NoVA/Richmond the least.
