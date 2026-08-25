# Philadelphia metro (Philadelphia PA + Wilmington DE) — public data source registry

metro_id: `philadelphia` · Researched 2026-08-25 (WebSearch-only environment).
**Coverage caveat:** the session's shared web-search budget was exhausted after the Philadelphia-County core was verified. Everything for New Castle County DE, the PA collar counties, the NJ side, broker reports, and HUD/rent indexes is marked **unverified** with honest notes — a follow-up verification pass is needed before ingesting those sources. Nothing below is guessed-at-URL; unverified entries either carry no URL or flag the URL's origin.

## Key facts

| Fact | Value | Status |
|---|---|---|
| Philadelphia transfer tax | **4.578% total = PA 1% + city 3.578%** (city rose from 3.278% effective **2025-07-01**) | search-confirmed (phila.gov, Saul Ewing) |
| Philadelphia assessment | 100% of market value; frequent citywide revals; 2025-26 CLR factor 1.00 (1.06 for docs 7/1/2026–12/31/2026) | search-confirmed (pa.gov CLR PDF) |
| Philadelphia RE tax rate | 1.3998% (0.6159% city + 0.7839% school), 2025-26 | search-confirmed |
| PA collar counties | Base-year assessment; convert via STEB CLR ([clr_factor_current.pdf](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/taxtypes/rtt/documents/clr_factor_current.pdf)). Bucks CLR ≈ 17.86 (search-confirmed snippet); Montgomery/Chester 1990s base years and Delaware Co. 2021 reassessment — unverified | mixed |
| PA collar transfer tax | 1% state + ~1% local (typical 2% total) | unverified per municipality |
| DE transfer tax | ~4% total (commonly 2.5% state + 1.5% local) | **unverified — confirm** |
| NJ side | Statewide MOD-IV (assessments) + SR1A (sales) + NJGIN (parcels) cover all three collar counties | unverified this session |
| PA STEB statewide sales | Validated sales go into **TEDTrac** monthly; **no public bulk download confirmed** — contact STEB (717.787.5950) | search-confirmed (manuals), bulk access unresolved |
| Philadelphia quirks | Sheriff sales 100% online via Bid4Assets; mandatory 30-day Eviction Diversion before any eviction filing; rental license + lead cert required to collect rent; 10-yr abatement phases down for post-2022 residential permits | search-confirmed |

---

## Philadelphia County, PA (CORE — city-county consolidated)

### 1. parcel_assessment

- **OPA Properties Public (Carto SQL API)** — *the app already ingests this*
  - url: `https://phl.carto.com/api/v2/sql?filename=opa_properties_public&format=geojson&skipfields=cartodb_id&q=SELECT+*+FROM+opa_properties_public`
  - verification: **search-confirmed** (full URL verbatim in OpenDataPhilly dataset-page snippet; dataset page: https://opendataphilly.org/datasets/philadelphia-properties-and-assessment-history/)
  - access_method: api · data_format: GeoJSON/CSV/shapefile via Carto SQL; bulk GDB (`https://opendata-downloads.s3.amazonaws.com/opa_properties_public.gdb.zip`) · update_frequency: nightly · cost: free
  - terms_notes: open data; Carto times out on huge queries — page with SQL WHERE
  - difficulty: **easy** — official SQL API + bulk download
  - notes: characteristics + ownership + current assessment for all parcels; assessment history in companion table. API explorer: `https://cityofphiladelphia.github.io/carto-api-explorer/#opa_properties_public`. Assessments at 100% of market value; recent citywide revals TY2023/TY2025; CLR ≈ 1.0.
- **Atlas (atlas.phila.gov)**
  - url: https://atlas.phila.gov/ · verification: **search-confirmed**
  - access_method: manual · data_format: HTML app · update_frequency: continuous · cost: free
  - terms_notes: lookup UI only; bulk lives in the Carto feeds
  - difficulty: **easy** — single-parcel verification companion
  - notes: per-parcel owner, value, sale price, deed info, permits, L&I violations, zoning base+overlays, **zoning appeals**, 311.

### 2. recorder_deeds

- **Real Estate Transfers (`rtt_summary`, Dept. of Records)**
  - url: https://opendataphilly.org/datasets/real-estate-transfers/ · verification: **search-confirmed**
  - access_method: api (Carto SQL, table `rtt_summary`) · data_format: CSV/GeoJSON · update_frequency: regularly updated · cost: free
  - terms_notes: open data; very large — query via API
  - difficulty: **easy**
  - notes: every recorded document since 1999-12-06 — deeds, mortgages, sheriff deeds — with dates, location, consideration, transfer tax paid. This is the free bulk deed index; viz/CSV export at https://data.phila.gov/visualizations/real-estate-transfers/
- **PhilaDox (document images, Dept. of Records)**
  - url: https://www.phila.gov/services/property-lots-housing/get-a-copy-of-a-deed-or-other-recorded-document/ (official how-to; portal URL itself not captured from a search listing)
  - verification: **search-confirmed** (pricing via Jenkins Law Library)
  - access_method: manual · data_format: HTML search + watermarked images · update_frequency: docs 1974–present · cost: **paywalled — $15/day, $60/week, $125/month, $750/year**
  - terms_notes: subscription wall for search + images; free in-person Reading Room
  - difficulty: **hard** — paywalled, no API/bulk
  - notes: **Transfer tax 4.578% total (1% PA + 3.578% city) since 2025-07-01** — the old 3.278% city rate is obsolete. Use `rtt_summary` for the index; PhilaDox only for document images.

### 3. zoning

- **Philadelphia Code Title 14 (American Legal Publishing)**
  - url: https://codelibrary.amlegal.com/codes/philadelphia/latest/philadelphia_pa/0-0-0-286773 (Title 14; Ch. 14-400 base districts at `…/0-0-0-289423`) · verification: **search-confirmed**
  - access_method: scrape · data_format: HTML · update_frequency: as amended · cost: free
  - terms_notes: amlegal disclaimer — informational, not definitive authority
  - difficulty: **medium** — HTML code text, no API
  - notes: PCPC **Zoning Quick Guide (Feb 2026)** PDF — compact per-district use/dimension summary: https://www.phila.gov/media/20260213170558/ZONING-QUICK-GUIDE_feb-2026.pdf
- **Zoning Base Districts + Zoning Overlays GIS layers**
  - url: https://opendataphilly.org/datasets/zoning-overlays/ (overlays; base-districts layer under the same Planning & Zoning category) · verification: **search-confirmed**
  - access_method: gis_service · data_format: shapefile/GeoJSON/ArcGIS · update_frequency: as remapped · cost: free · terms_notes: open data
  - difficulty: **easy**
  - notes: base-district polygons use post-2012 codes; join `Long_Code`/`New_Code` to the description table. Overlays are a separate required layer.
- **ZBA appeal cases**
  - url: https://atlas.phila.gov/ (per-parcel) · verification: **unverified** — Atlas shows "zoning appeals" per snippet, but no standalone ZBA dataset surfaced before budget exhaustion. Related search-confirmed dataset: L&I Appeals of Code Violations and Permit Refusals — https://opendataphilly.org/datasets/licenses-and-inspections-appeals-of-code-violations-and-permit-refusals/
  - access_method: api/manual · data_format: HTML/CSV · update_frequency: unknown · cost: free · terms_notes: open data (L&I dataset)
  - difficulty: **medium** — confirm whether the L&I appeals dataset includes ZBA calendar/decisions

### 5. tax_rates

- **Real Estate Tax (phila.gov Dept. of Revenue)**
  - url: https://www.phila.gov/services/payments-assistance-taxes/taxes/property-and-real-estate-taxes/real-estate-tax/ · verification: **search-confirmed**
  - access_method: manual · data_format: HTML · update_frequency: annual · cost: free · terms_notes: none
  - difficulty: **easy** — one consolidated citywide rate
  - notes: **1.3998%** = 0.6159% city + 0.7839% School District (2025-26). No municipal/school patchwork — city-county consolidated.

### 6. permits_co

- **L&I Building and Zoning Permits**
  - url: https://opendataphilly.org/datasets/licenses-and-inspections-building-and-zoning-permits/ · verification: **search-confirmed**
  - access_method: api (Carto SQL) · data_format: CSV/GeoJSON · update_frequency: daily (typical — confirm on page) · cost: free · terms_notes: open data
  - difficulty: **easy**
  - notes: COs live in the related L&I certificate/case-investigation datasets on OpenDataPhilly.

### 7. violations_liens

- **L&I Code Violations**
  - url: https://opendataphilly.org/datasets/licenses-and-inspections-code-violations/ · verification: **search-confirmed**
  - access_method: api (Carto SQL) · data_format: CSV/shapefile/GeoJSON · update_frequency: daily (typical) · cost: free · terms_notes: open data; very large
  - difficulty: **easy**
- **Real Estate Tax Delinquencies + Tax Balances**
  - url: https://opendataphilly.org/datasets/real-estate-tax-balances/ and https://data-phl.opendata.arcgis.com/datasets/phl::real-estate-tax-delinquencies/about · verification: **search-confirmed**
  - access_method: bulk_download / api · data_format: CSV/Excel/ArcGIS · update_frequency: routinely updated · cost: free · terms_notes: open data
  - difficulty: **easy**
  - notes: principal/interest/penalty/balance + payment-agreement status per property. Water/L&I municipal liens still need a title-level search — no consolidated open lien dataset confirmed.

### 8. sheriff_foreclosure

- **Philadelphia Sheriff's Office + Bid4Assets (all sales online — confirmed)**
  - url: https://phillysheriff.com/property-listing/ ; auctions: https://www.bid4assets.com/philadelphia , https://www.bid4assets.com/philaforeclosures , https://www.bid4assets.com/philataxsales · verification: **search-confirmed**
  - access_method: scrape · data_format: HTML listings · update_frequency: per monthly sale calendar · cost: free to view; buyer premium 10% (tax) / 1.5% (mortgage); deposits $1,500 / $10,000
  - terms_notes: Bid4Assets is commercial — check ToS before scraping
  - difficulty: **medium** — two sites, no API
  - notes: tax sales resumed July 2024 after a 3-year pause. Sheriff deeds later appear in `rtt_summary`.

### 9. evictions_rent_reg

- **Municipal Court landlord-tenant records**
  - url: https://www.courts.phila.gov/pdf/municipal/forms/landlord-tenant/landlord-tenant-filing-and-hearing-information.pdf (filing info; the online docket-search URL was not captured — **unverified**)
  - verification: search-confirmed (info PDF) / unverified (docket search)
  - access_method: manual · data_format: HTML dockets · update_frequency: live · cost: free to search · terms_notes: court records — scraping typically restricted, no bulk
  - difficulty: **hard**
- **Eviction Diversion Program (mandatory)**
  - url: https://phillytenant.org/eviction-diversion-program/ · verification: **search-confirmed**
  - access_method: manual · data_format: HTML · update_frequency: by ordinance · cost: free · terms_notes: none · difficulty: **easy** (a rule to encode)
  - notes: **Ordinance #220655 — all landlords must complete 30+ days of good-faith Eviction Diversion before filing** (since Jan 2022; imminent-harm exception). Lengthens eviction timelines in any Philly multifamily underwrite.
- **Rental License / eCLIPSE + Commercial Activity License**
  - url: https://www.phila.gov/services/permits-violations-licenses/get-a-license/business-licenses/rental-and-property/get-a-rental-license/ · verification: **search-confirmed**
  - access_method: manual (status also in L&I licenses open data) · data_format: HTML/CSV · update_frequency: live · cost: free to search · terms_notes: none · difficulty: **easy**
  - notes: rental license (annual) + CAL (free, prerequisite) + Lead-Safe/Lead-Free cert for pre-March-1978 buildings. **Unlicensed landlords can't legally collect rent or evict** — check license status when underwriting in-place income. No rent control in Philadelphia.

### 10. incentive_zones

- **10-year tax abatement**
  - url: https://passyunkpost.com/2022/02/09/the-2022-ten-year-tax-abatement-explained/ (best explainer surfaced; official OPA "active abatements" dataset **not found** — abatement/exemption fields are on `opa_properties_public`)
  - verification: search-confirmed (rules) / unverified (dedicated dataset)
  - access_method: api (OPA fields) · data_format: Carto · update_frequency: nightly with OPA · cost: free · terms_notes: none
  - difficulty: **medium** — parse OPA exemption fields to find abated parcels + expiry
  - notes: permits on/after 2022-01-01: residential abatement steps down 100%→10% over 10 yrs + **1% construction tax** on new-residential improvement value; pre-2022 permits keep flat 100%×10yr; commercial abatement unchanged (verify). Abatement-expiry tax cliff is a first-order Philly underwriting item.
- **Keystone Opportunity Zones + federal OZs**
  - url: https://dced.pa.gov/business-assistance/keystone-opportunity-zones/ ; city program: https://www.phila.gov/programs/keystone-opportunity-zones/ ; vacant KOZ properties: https://business.phila.gov/kozproperties/ ; federal OZ list: https://opportunityzones.com/location/pennsylvania/ · verification: **search-confirmed**
  - access_method: gis_service (DCED interactive map) · data_format: web map / HTML list · update_frequency: as designated/expired · cost: free · terms_notes: none
  - difficulty: **medium** — per-parcel KOZ expiration only via map/coordinator, no clean download
  - notes: KOZ (state, near-total business-tax exemption, staggered parcel expirations) ≠ federal OZ (tract-based capital-gains deferral). Capture the KOZ expiration date.

### 11. environmental

- **FEMA NFHL (via FEMA MSC / PASDA)**
  - url: https://www.fema.gov/flood-maps/national-flood-hazard-layer ; PA statewide mirror: https://www.pasda.psu.edu/uci/DataSummary.aspx?dataset=2282 · verification: **search-confirmed**
  - access_method: gis_service · data_format: FIRM db, REST/WMS · update_frequency: monthly · cost: free · terms_notes: public domain
  - difficulty: **easy** — covers PA/NJ/DE counties alike; PA viewer pafloodrisk.psu.edu
- **PA DEP eFACTS / eMapPA** — url: (none captured) · verification: **unverified** — search budget exhausted before this query. eFACTS = PA DEP facility/site db (storage tanks, Act 2 Land Recycling brownfields); eMapPA = GIS viewer. access_method: manual · cost: free · difficulty: medium · **verify before use**.

### 12. gis_open_data

- **OpenDataPhilly + City Open Data Portal (ArcGIS)**
  - url: https://opendataphilly.org/ and https://data-phl.opendata.arcgis.com/ · verification: **search-confirmed**
  - access_method: api (Carto SQL + ArcGIS services) · data_format: CSV/GeoJSON/shapefile/GDB · update_frequency: per dataset, many nightly · cost: free · terms_notes: open data
  - difficulty: **easy**
  - notes: layers that matter — `opa_properties_public` + assessment history, DOR parcels (geometry), `rtt_summary`, L&I permits/violations/licenses/appeals, zoning base+overlays, tax delinquencies/balances.

---

## New Castle County, DE — Wilmington (CORE) — **ALL UNVERIFIED (search budget exhausted)**

No New Castle County query ran before the session's search budget hit its cap. Entries below are scaffolding from the task briefing + general knowledge, every one flagged; a verification pass is required.

- **1. parcel_assessment — NCC parcel search** · url: (task briefing cites `www3.newcastlede.gov` — not search-confirmed) · unverified · manual/HTML · free · difficulty: medium · notes: **verify** — NCC completed its first countywide reassessment in ~50 years (old 1983 base) effective ~TY2025 after the DE school-funding litigation; confirm new ratio/cycle.
- **1/12. gis — NCC ArcGIS Hub** · url: (briefing cites `apps-nccde.hub.arcgis.com` — not search-confirmed) · unverified · gis_service · free · difficulty: easy-if-confirmed · notes: also check **FirstMap Delaware** (statewide GIS clearinghouse).
- **2. recorder_deeds — NCC Recorder of Deeds** · url: none captured · unverified · manual · difficulty: medium · notes: **DE transfer tax ~4% total, commonly 2.5% state + 1.5% local (first-time-buyer relief) — UNVERIFIED; confirm 30 Del. C. ch. 54 + Wilmington's local rate.**
- **3. zoning — NCC Unified Development Code (Ch. 40) + City of Wilmington zoning code** · unverified · manual · difficulty: medium · notes: unincorporated county under UDC; Wilmington/Newark zone separately — jurisdiction split matters.
- **5. tax_rates — county + school + Wilmington city stack** · unverified · annual · difficulty: medium · notes: post-reassessment revenue-neutral rate resets make prior-year effective rates unreliable.
- **6. permits_co — NCC Dept. of Land Use / Wilmington L&I** · unverified · difficulty: medium.
- **7. violations_liens — NCC code enforcement / Wilmington** · unverified · difficulty: hard · notes: DE monition tax-lien process via Superior Court.
- **8. sheriff_foreclosure — NCC Sheriff sales (monthly)** · unverified · difficulty: medium.
- **9. evictions_rent_reg — DE Justice of the Peace Court LT dockets** · unverified · difficulty: hard · notes: no rent control in DE; tenant right-to-representation program enacted; Landlord-Tenant Code = 25 Del. C.
- **10. incentive_zones — federal OZs (Wilmington tracts) + DE Downtown Development Districts (DSHA)** · unverified · difficulty: medium.
- **11. environmental — DNREC (Site Investigation & Restoration; brownfields, tanks)** · unverified · difficulty: medium · notes: state environmental agency = DNREC; FEMA NFHL covers DE flood.

---

## PA collar counties (SECONDARY — cats 1, 2, 3, 12) — **ALL UNVERIFIED except noted**

Common to all four: zoning is **municipal** (dozens of borough/township codes each, ecode360/Municode typical — difficulty hard); transfer tax 1% state + ~1% local (unverified per municipality); PASDA (search-confirmed URL above) is the statewide GIS fallback for parcels/flood; convert base-year assessments to market with the statewide CLR list ([clr_factor_current.pdf](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/taxtypes/rtt/documents/clr_factor_current.pdf) — search-confirmed).

### Montgomery County
- **1. Board of Assessment portal** · unverified, no URL captured · manual · difficulty: medium · notes: base-year county, last reassessment 1996 (knowledge, unverified) — CLR conversion required.
- **2. Recorder of Deeds** · unverified · manual · difficulty: medium.
- **3. Municipal zoning (62 municipalities) + county planning** · unverified · difficulty: hard.
- **12. County GIS/open data** · unverified · gis_service · difficulty: medium.

### Bucks County
- **1. Board of Assessment** · unverified portal · manual · difficulty: medium · notes: **CLR ≈ 17.86 — search-confirmed** ("Bucks County CLR 17.86", https://lawyermarc.com/real-estate/assessed-value-clr-how-pennsylvania-determines-fair-market-value/); implies a ~1972 base year (unverified). Assessed ÷ CLR = market.
- **2. Recorder of Deeds** · unverified · difficulty: medium.
- **3. Municipal zoning (54 municipalities)** · unverified · difficulty: hard.
- **12. County GIS** · unverified · difficulty: medium.

### Delaware County
- **1. Assessment / property records** · unverified portal · difficulty: medium · notes: **court-ordered countywide reassessment effective TY2021** (briefing + knowledge, unverified) — CLR near but drifting below 100; check current CLR.
- **2. Recorder of Deeds** · unverified · difficulty: medium.
- **3. Municipal zoning (49 municipalities)** · unverified · difficulty: hard.
- **12. County GIS** · unverified · difficulty: medium.

### Chester County
- **1. Assessment Office / "ChescoViews" GIS viewer** · unverified · difficulty: medium · notes: base-year county (~1996-98 base, knowledge, unverified) — CLR conversion required.
- **2. Recorder of Deeds** · unverified · difficulty: medium.
- **3. Municipal zoning (73 municipalities)** · unverified · difficulty: hard.
- **12. County GIS/open data** · unverified · difficulty: medium.

---

## NJ collar counties — Camden, Gloucester, Burlington (SECONDARY) — **UNVERIFIED this session**

Covered by New Jersey's statewide pipeline (same pattern as any NJ metro in this registry):
- **1. NJ MOD-IV** (annual statewide property-tax-list data, NJ Treasury/Div. of Taxation) — bulk, free, difficulty easy once confirmed. Assessment ratios vary by district: apply the annual **Director's Ratio (Ch. 123)** table per municipality.
- **2. NJ SR1A** statewide sales file (every deed transfer with consideration) + each county clerk's own deed portal — SR1A is the bulk path; NJ realty transfer fee is a graduated state schedule plus the ≥$1M "mansion tax" (rules changed 2025 — **confirm current schedule**, unverified).
- **3. zoning** — municipal (ecode360 typical); City of Camden has redevelopment-plan overlays superseding base zoning; large parts of Burlington/Gloucester sit under **Pinelands Commission** jurisdiction (major entitlement constraint).
- **12. NJGIN Open Data** — statewide parcels (MOD-IV joined), flood, boundaries; county hubs exist. difficulty: easy once confirmed.

All: no URLs captured this session — verification pass required.

---

## Metro-level: 4. broker_comps

- **PA STEB / Tax Equalization Division (TEDTrac) — the critical state source, honestly flagged**
  - url: https://dced.pa.gov/local-government/boards-committees/tax-equalization-division/ · verification: **search-confirmed** (page + Sales Validation & Submission Operations Manual PDF on dced.pa.gov)
  - access_method: manual · data_format: TEDTrac internal db; public outputs are the annual CLR PDFs · update_frequency: counties submit validated sales **monthly**; CLRs annual (effective July 1) · cost: CLR PDFs free; bulk file unknown
  - terms_notes: **no public bulk download of the statewide validated-sales file surfaced in any search result** — access likely by request (STEB 717.787.5950); do not assume redistribution rights
  - difficulty: **hard** — db exists, public endpoint unconfirmed
  - notes: for Philadelphia proper, `rtt_summary` fully substitutes; for collar counties the paths are county recorders or a STEB request. NJ analogue = SR1A; DE has no equivalent statewide file confirmed.
- **National brokerages (CBRE, JLL, Colliers, Newmark, C&W, Marcus & Millichap)** · url: none captured · **unverified** (budget exhausted) · manual · PDF/HTML · quarterly · free behind registration walls · terms: copyrighted, don't redistribute · difficulty: medium · notes: Philadelphia reports universally include suburban PA + South Jersey; Wilmington folded into region or local shops. Locals to check: Binswanger, Rittenhouse Realty Advisors (multifamily), MPN Realty.

## Metro-level: 13. rent_demand

- **HUD FMR/SAFMR** · url: none captured · **unverified** · bulk_download (huduser.gov) · CSV/Excel · annual · free · difficulty: easy · notes: metro spans three states — HUD splits the CBSA (Philadelphia-Camden-Wilmington PA-NJ-DE-MD core vs. a suburban-PA HMFA covering Bucks/Chester/Montgomery in some years); **confirm which FMR area each county falls in**; ZIP-level SAFMRs available.
- **Zillow ZORI / Apartment List / ACS / BLS** · url: none captured · **unverified** · bulk_download · CSV · monthly (ZORI/AptList/BLS), annual (ACS) · free with attribution · difficulty: easy · notes: ZORI covers Philly metro/city/ZIPs; Apartment List covers metro + Philadelphia + Camden; BLS CES/LAUS for the Philadelphia-Camden-Wilmington MSA.

---

*Machine-readable version: `scratchpad/sources/philadelphia.json` (56 entries).*
