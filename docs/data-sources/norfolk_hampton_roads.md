# Hampton Roads, VA — public data source registry (`norfolk_hampton_roads`)

Researched 2026-08-25 via WebSearch only (egress-blocked container; no direct fetches).

> ## ⚠ RESEARCH GAP — read first
> The session-wide WebSearch budget (200 calls, shared across parallel agents) was exhausted after the Richmond metro was researched and **before a single Hampton Roads query executed**. Consequences:
> - Every **jurisdiction-specific** entry below is `verification=unverified` — URLs come from the task briefing or general knowledge, not from search results. Per the registry's standing rule, nothing here should be treated as confirmed.
> - **Statewide** entries (recordation taxes, SRA statute, GDC eviction search, DEQ, FEMA NFHL, DHCD/VEDP zones, HUD FMR portal) *were* search-confirmed during the Richmond research and apply to this metro with full confidence.
> - **Action:** re-run this metro's jurisdiction searches (~40–60 queries) when budget is available. The category checklist and leads below are structured to make that re-run fast.

**Coverage:** CORE — Norfolk, Virginia Beach, Chesapeake, Newport News, Hampton (all independent cities). SECONDARY — Portsmouth, Suffolk.

## Key facts

| Fact | Value | Status |
|---|---|---|
| Assessment ratio | 100% of fair market value statewide (Va. Code § 58.1-3201) | search-confirmed (Richmond phase) |
| Reassessment cycle | Believed annual in the large cities, many on a **July 1 fiscal-year** basis (Norfolk, Virginia Beach); per-city cycle/effective date | **unverified — confirm per city** |
| Assessor structure | Each independent city has its **own Real Estate Assessor** and its own Circuit Court clerk (no county overlay) | structural fact |
| Transfer taxes | State recordation $0.25/$100; optional local recordation = 1/3 of state; grantor tax $0.10/$100 (§ 58.1-802) split state/locality | search-confirmed (Richmond phase) |
| Regional add-on | A Hampton Roads **regional transportation-related grantor fee** (Va. Code ~§ 58.1-802.4) is believed to apply on top of the standard grantor tax | **unverified — rate must be confirmed before computing all-in transfer cost** |
| Deed records | Per-city Circuit Court **Secure Remote Access subscriptions** (Va. Code § 17.1-294); vendors and fees vary by clerk | framework search-confirmed; per-city terms unverified |
| Foreclosures | Non-judicial trustee sales (newspaper ads, no registry); tax-delinquent parcels via Circuit Court judicial sale | search-confirmed (statewide, Richmond phase) |
| Rent regulation | None (no rent control / just-cause / registration); evictions = unlawful detainer in GDC. Region historically has among the highest US eviction-filing rates | statewide confirmed; eviction-rate datum unverified |
| Metro quirks | Flood/sea-level-rise exposure is first-order (large SFHA share, recurrent tidal flooding); military demand (Naval Station Norfolk, NAS Oceana, Langley-Eustis) makes BAH a rent anchor; VB AICUZ overlays restrict density near Oceana | unverified this session |
| HUD FMR area | Virginia Beach-Norfolk-Newport News, VA-NC HMFA (name from briefing) | portal search-confirmed; area name unverified |

---

## Norfolk (CORE)

- **parcel_assessment — Norfolk AIR property search + City Assessor** — URL not recorded (briefing lead; do not construct)
  - verification: unverified — no search ran · access: manual · format: HTML expected · cost: free expected · difficulty: medium
  - notes: independent city assessor; believed annual July-1 reassessment (**unverified**); confirm bulk assessment extract availability.
- **gis_open_data — Norfolk Open Data (Socrata)** — https://data.norfolk.gov
  - verification: unverified — URL from task briefing, not a search result · access: api (SODA expected) · format: JSON/CSV · cost: free expected · difficulty: easy if live
  - notes: check for parcels/assessment, permits, code-enforcement datasets when verifying.
- **recorder_deeds — Norfolk Circuit Court Clerk SRA** — URL not recorded
  - verification: unverified (statewide SRA framework search-confirmed: https://www.vacourts.gov/online/sra/home, § 17.1-294) · access: manual · cost: subscription, amount unverified · difficulty: hard
  - notes: transfer taxes per Key facts incl. unverified regional fee.
- **zoning — Norfolk Zoning Ordinance (2018 rewrite) + GIS layer** — URL not recorded · unverified · difficulty: medium
- **tax_rates / permits_co / violations_liens / sheriff_foreclosure / incentive_zones** — not researched (see gap notice). Statewide OZ/EZ layers below do cover Norfolk; Norfolk runs local enterprise-zone incentives — verify with city economic development.
- **environmental — FEMA NFHL** — https://www.fema.gov/flood-maps/national-flood-hazard-layer (search-confirmed, statewide) + city resilience/flood layers (unverified). Flood exposure is first-order here.

## Virginia Beach (CORE)

- **parcel_assessment — VB Real Estate Assessor** — URL not recorded · unverified · notes: annual July-1 FY reassessment believed, unverified; 100% FMV statewide.
- **gis_open_data — data.vbgov.com + VBgov GIS** — https://data.vbgov.com
  - verification: unverified — URL from task briefing · access: api/gis_service expected · difficulty: easy if live · notes: look for parcels, zoning, permits, flood layers.
- **recorder_deeds — VB Circuit Court Clerk SRA** — unverified · cost: subscription, amount unknown · difficulty: hard.
- **zoning — City Zoning Ordinance (CZO) + GIS** — unverified · notes: **AICUZ (NAS Oceana) noise/accident-potential overlays and resort-area overlays are underwriting-material** — verify layers.
- **tax_rates / permits_co / violations_liens / sheriff_foreclosure / incentive_zones** — not researched.

## Chesapeake (CORE)

- **parcel_assessment — Chesapeake Real Estate Assessor** — unverified · cycle unverified (annual or biennial — confirm).
- **recorder_deeds — Chesapeake Circuit Court Clerk SRA** — unverified · difficulty: hard.
- **zoning — Zoning Ordinance + GIS portal** — unverified (GIS portal existence from briefing).
- **gis_open_data — Chesapeake GIS portal** — unverified.
- Other categories — not researched.

## Newport News (CORE)

- **parcel_assessment — Newport News Real Estate Assessor** — unverified.
- **recorder_deeds — Newport News Circuit Court Clerk SRA** — unverified · difficulty: hard.
- **zoning — Zoning Ordinance + GIS portal** — unverified.
- **gis_open_data — Newport News GIS portal** — unverified.
- Other categories — not researched.

## Hampton (CORE)

- **parcel_assessment — Hampton Real Estate Assessor** — unverified.
- **recorder_deeds — Hampton Circuit Court Clerk SRA** — unverified · difficulty: hard.
- **zoning — Zoning Ordinance + GIS portal** — unverified.
- **gis_open_data — Hampton GIS portal** — unverified.
- Other categories — not researched.

## Portsmouth (SECONDARY)

- **parcel_assessment — Portsmouth Real Estate Assessor** — unverified · notes: Portsmouth carries one of the region's highest RE tax rates — verify current rate.
- **recorder_deeds — Portsmouth Circuit Court Clerk SRA** — unverified · difficulty: hard.
- **zoning — Portsmouth Zoning Ordinance** — unverified.
- **gis_open_data — Portsmouth GIS portal** — unverified.

## Suffolk (SECONDARY)

- **parcel_assessment — Suffolk Real Estate Assessor** — unverified.
- **recorder_deeds — Suffolk Circuit Court Clerk SRA** — unverified · difficulty: hard.
- **zoning — Suffolk Unified Development Ordinance** — unverified.
- **gis_open_data — Suffolk GIS portal** — unverified.

---

## Statewide sources (search-confirmed in the Richmond phase; full coverage of this metro)

### evictions_rent_reg
- **VA General District Court Online Case Information System** — https://eapps.courts.state.va.us/gdcourts/changeCourt.do (hub: https://www.vacourts.gov/caseinfo/home)
  - verification: search-confirmed · access: scrape · format: HTML · cost: free, no account · difficulty: **hard** — per-court selection (Norfolk, VB, Chesapeake, Newport News, Hampton, Portsmouth, Suffolk GDCs each searched separately); name/case/hearing-date queries only; no API/bulk; automation fragile
  - notes: no rent control / just-cause / landlord registration in Virginia. Self-help: https://selfhelp.vacourts.gov/page/10/landlord-tenant. Hampton Roads courts historically post some of the nation's highest eviction filing rates (Eviction Lab flagged Norfolk/Newport News/Hampton — dataset unverified this session) — relevant to turnover/collections assumptions.

### environmental
- **VA DEQ Environmental Data Hub** — Petroleum Release Sites https://geohub-vadeq.hub.arcgis.com/datasets/57759688e4944bb987add68c4f0c5ada_104 (daily updates); mirror https://data.virginia.gov/dataset/petroleum-release-sites; Brownfields tool https://www.deq.virginia.gov/land-waste/remediation-programs/brownfields; VRP https://www.deq.virginia.gov/land-waste/remediation-programs/voluntary-remediation
  - verification: search-confirmed · access: gis_service · cost: free · difficulty: **easy**
- **FEMA NFHL** — https://www.fema.gov/flood-maps/national-flood-hazard-layer — gis_service + by-county bulk download via Map Service Center · free · **easy**

### incentive_zones (statewide layers)
- **DHCD Opportunity Zones** — https://www.dhcd.virginia.gov/opportunity-zones-oz ; statewide PDF map https://www.dhcd.virginia.gov/sites/default/files/Docx/oz/virginia-qualified-opportunity-zones-map.pdf ; **VEDP OZ layer** https://gis.vedp.org/datasets/89d63a87bbfe41c3b96b32bfadb0bfb2_31 ; **VEDP Enterprise Zones layer** https://gis.vedp.org/datasets/394e709c529a4ec3bcc644dbd03d91f2_3/explore
  - verification: search-confirmed · access: gis_service · cost: free · difficulty: **easy**
  - notes: local city EZ incentive packages (Norfolk, Portsmouth, Newport News run active programs) — terms unverified; check each city's economic development office.

### recorder framework
- **Secure Remote Access statute/program** — Va. Code § 17.1-294 https://law.lis.virginia.gov/vacode/title17.1/chapter2/section17.1-294/ ; Supreme Court SRA page https://www.vacourts.gov/online/sra/home ; recordation tax chapter https://law.lis.virginia.gov/vacodefull/title58.1/chapter8/ ; grantor tax https://law.lis.virginia.gov/vacode/title58.1/chapter8/section58.1-802/
  - verification: search-confirmed · notes: the **Hampton Roads regional grantor fee (~§ 58.1-802.4)** is NOT among the confirmed URLs — verify its current rate before quoting all-in transfer cost.

---

## Broker comps (METRO)

- **Expected sources (ALL unverified this session — no HR brokerage search ran):** Cushman & Wakefield | Thalhimer (site pattern confirmed via the Richmond-phase URL https://thalhimer.com/marketwatch/market-reports/richmond-va/ — Thalhimer covers Hampton Roads too), Colliers Norfolk/Hampton Roads research, plus notable local shops: **S.L. Nusbaum, Harvey Lindsay, Divaris**, and the **ODU E.V. Williams Center annual Hampton Roads Real Estate Market Review** (the classic comprehensive local source).
  - access: manual · format: PDF · updates: quarterly/annual · cost: free (registration walls vary) · difficulty: medium
  - terms: copyrighted research — cite, don't redistribute.
  - notes: **no Virginia statewide sales-data file exists** (unlike PA STEB / NJ SR1A) — transfers come from each city clerk's SRA.

## Rent & demand (METRO)

- **HUD FMR portal** — https://www.huduser.gov/portal/datasets/fmr.html (search-confirmed; FY2026 effective 2025-10-01) · bulk_download CSV/Excel · annual · free · **easy**
  - HMFA: "Virginia Beach-Norfolk-Newport News, VA-NC" per briefing — **area name unverified in a snippet**. Virginia Housing FMR page (search-confirmed): https://www.virginiahousing.com/en/partners/housing-choice-vouchers/federal-fair-market-rents
- **Zillow ZORI** — metro CSVs via https://www.zillow.com/research/data/ (referenced in Richmond-phase snippets); Virginia Beach-Norfolk MSA coverage expected but **unverified** · monthly · free
- **Apartment List** — coverage unverified.
- **Census/ACS + BLS** — standard MSA series apply; note the MSA spans into NC (Currituck/Gates counties).
- **Military BAH rates** (DoD) — a metro-specific rent anchor given the installations; source unverified this session.
