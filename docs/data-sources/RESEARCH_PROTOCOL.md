# Registry research protocol

How every file in `/docs/data-sources/` is produced, so future sessions add
metros the same way. Grew out of the 2026-08-25 registry build.

## Verification reality

Build containers cannot fetch portals directly (egress proxy) — **WebSearch
is the only evidence channel**. Therefore:

- Record URLs ONLY as they literally appear in search result listings or
  snippets. Never construct, guess, or "clean up" a URL.
- `verification: "search-confirmed"` = the exact URL appeared in a search
  result. `"unverified"` = anything less, with `verification_note` saying
  what was searched and what came back.
- Never fabricate. A missing entry marked honestly beats a plausible guess
  (standing repo rule). Production is where live verification happens: the
  nightly steward link-checks registry URLs, and `/api/comps/health`
  resolves endpoint/field guesses against the real services.

## Categories

Per jurisdiction unless marked metro-level:

1. `parcel_assessment` — assessor site / bulk / API / GIS. Notes MUST carry
   assessment ratio, reassessment cycle, last countywide reassessment year.
2. `recorder_deeds` — deed/mortgage search. Note free vs paywalled images,
   bulk index availability, transfer tax rates, recording fees.
3. `zoning` — code text, zoning GIS layer, overlays, variance/rezoning cases.
4. `broker_comps` (metro-level) — free CBRE/JLL/Colliers/M&M/Newmark/C&W +
   local-shop reports; state-level sales files (PA STEB, NJ SR1A, NY sales…).
5. `tax_rates` — millage/rate tables and where they publish annually.
6. `permits_co` — permit / certificate-of-occupancy data.
7. `violations_liens` — code-violation search, municipal lien procedure.
8. `sheriff_foreclosure` — sale schedules, foreclosure case search.
9. `evictions_rent_reg` — eviction record access + registration regimes
   (rule TEXT lives in `data/research/regulatory_rules.json`, not here).
10. `incentive_zones` — OZ, TIF/TAD/TIRZ, abatements; where boundaries live.
11. `environmental` — FEMA NFHL, EPA cleanup lists, the state database.
12. `gis_open_data` — the portal itself + which layers matter.
13. `rent_demand` (metro-level) — HUD FMR area, ACS/BLS relevance, free
    rent indexes.

## Entry fields

jurisdiction · source_name · url · verification (+note) · access_method
(`api` | `bulk_download` | `gis_service` | `scrape` | `manual`) ·
data_format · update_frequency · cost · terms_notes (FLAG scraping/
redistribution prohibitions, login/CAPTCHA walls) · difficulty
(easy = official API/bulk/GIS, clean terms; medium = joins/registration/
quirky formats; hard = scrape-only, paywalled, CAPTCHA, manual) + one-line
reason · notes.

## Outputs

- `docs/data-sources/<metro_id>.md` — human registry: H1, "Key facts" table
  (assessment ratio/cycle, transfer taxes, access quirks), one H2 per
  jurisdiction with category subsections; metro-level categories as own H2s.
- `docs/data-sources/json/<metro_id>.sources.json` — JSON array of entry
  objects with keys: metro, jurisdiction, category, source_name, url,
  verification, verification_note, access_method, data_format,
  update_frequency, cost, terms_notes, difficulty, difficulty_reason, notes.
- `docs/data-sources/sources.json` — the compiled union (build step
  concatenates the per-metro files; do not hand-edit the union).

Coverage tiers per metro are defined in `COVERAGE.md` — CORE jurisdictions
get all categories; SECONDARY get at minimum 1, 2, 3, 12.
