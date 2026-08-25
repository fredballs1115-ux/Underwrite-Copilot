# New York City (metro_id: `nyc`) — public data source registry

CORE metro. City-unified systems: the five boroughs (New York/Manhattan, Kings/Brooklyn, Queens, Bronx, Richmond/Staten Island counties) function as ONE jurisdiction for nearly everything — one assessor (DOF), one open-data portal, one zoning code (DCP), one buildings department (DOB). **The one hard borough split: ACRIS records land documents for only 4 boroughs; Staten Island (Richmond County) deeds/mortgages live at the Richmond County Clerk.**

> **Research caveat:** this registry was built under a hard WebSearch-only constraint and the session's search budget ran out partway through (14 of the planned ~45 searches completed). Everything marked **search-confirmed** has a URL that literally appeared in a search result. Everything marked **unverified** was NOT searched — the entry names the system honestly, records no URL, and says how to verify. Do not treat unverified entries' facts as final.

## Key facts

| Fact | Value |
|---|---|
| Assessment ratio | Class 1 (1–3 family): **6%** of market value; Classes 2/3/4 (multifamily/utility/commercial): **45%** (search-confirmed via DOF page) |
| Reassessment cycle | **Annual** citywide (tentative roll ~Jan 15, final ~May 25) — no "last reassessment year" concept |
| AV caps | Class 1: +6%/yr, +20%/5yr. Class 2 <11 units: +8%/yr, +30%/5yr. Class 2 (11+ units) & Class 4: uncapped but 5-year transitional phase-in; bill uses lower of actual vs transitional AV (search-confirmed snippets) |
| Class shares | State law caps annual shifts in each tax class's share of the levy; one citywide rate per class per fiscal year (no municipal/school millage patchwork) |
| Transfer taxes | NYC RPTT (seller): residential 1.0% <$500k / 1.425% ≥$500k; **commercial & 4+ family 1.425% <$500k / 2.625% ≥$500k**. NYS transfer tax 0.4%, → 0.65% (residential ≥$3M; commercial ≥$2M). NYS mansion tax (buyer): residential ≥$1M, tiered 1.0–3.9% of entire price, cliff structure (search-confirmed snippets) |
| Recorder quirk | ACRIS = Manhattan/Bronx/Brooklyn/Queens only, free images, records since 1966, full index on Open Data. Staten Island = Richmond County Clerk (online back to 1945, no bulk index). RPTT returns for all 5 boroughs still file through ACRIS |
| Umbrella access | Nearly everything is on the Socrata portal `data.cityofnewyork.us` with a uniform SODA API; DCP GIS also via Bytes of the Big Apple versioned downloads |
| Rent regulation | ~Half of rental stock rent-stabilized (HSTPA 2019). Official DHCR building lists are PDFs w/o unit counts; unit-level counts exist only in the **unofficial** taxbills.nyc/nycdb scrape ecosystem — flag terms/accuracy |

---

## New York City (five boroughs, city-unified)

### 1. parcel_assessment

- **DOF Property Valuation and Assessment Data — Tax Classes 1,2,3,4 (PTS)** — the full assessment roll
  - url: https://data.cityofnewyork.us/City-Government/Property-Valuation-and-Assessment-Data-Tax-Classes/8y4t-faws
  - verification: **search-confirmed** (snippet: 11.7M rows, 139 cols, updated 2026-06-15)
  - access_method: api · data_format: CSV/JSON (Socrata SODA/OData) · update_frequency: annual roll cycle · cost: free
  - terms_notes: NYC Open Data terms; app token recommended
  - difficulty: **easy** — official citywide Socrata dataset with API + bulk export
  - notes: market value, AV, transitional AV, exemptions per BBL. Ratios/caps per Key facts table. Companion datasets search-confirmed: classes 2/3/4 cut ([kevu-8hby](https://data.cityofnewyork.us/City-Government/Property-Valuation-and-Assessment-data-Tax-Classes/kevu-8hby)), older PTS extract ([rgy2-tti8](https://data.cityofnewyork.us/Housing-Development/Property-Valuation-and-Assessment-Data/rgy2-tti8))
- **DOF Property Assessment Change**
  - url: https://data.cityofnewyork.us/City-Government/DOF-Property-Assessment-Change/a5nd-6mit
  - verification: **search-confirmed** (48.4M rows, 15 cols) · access_method: api · data_format: CSV/JSON · update_frequency: ongoing · cost: free · terms_notes: open
  - difficulty: **medium** — change-log; must join to roll by BBL
  - notes: detects appeal reductions / exemption changes on subject & comps
- **PLUTO (64uk-42ks)**
  - url: https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-PLUTO-/64uk-42ks
  - verification: **search-confirmed** · access_method: api · data_format: CSV, ~70+ fields/lot · update_frequency: versioned releases (history to 2002) · cost: free · terms_notes: DCP informational-use disclaimer
  - difficulty: **easy** — canonical BBL join table (land use, zoning district, SF, units, year built, FAR, districts, E-designation flag, FIRM flags)
- **MapPLUTO** (PLUTO + parcel geometry)
  - url: https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-Map-MapPLUTO-/f888-ni5f · DCP release page: https://www.nyc.gov/content/planning/pages/resources/datasets/mappluto-pluto-change
  - verification: **search-confirmed** · access_method: bulk_download · data_format: shapefile/FGDB · update_frequency: with PLUTO versions, archives kept · cost: free · terms_notes: open w/ disclaimer
  - difficulty: **easy**
- **DOF "Determining your assessed value"** (ratio/caps reference)
  - url: https://www.nyc.gov/site/finance/property/property-determining-your-assessed-value.page
  - verification: **search-confirmed** · access_method: manual · data_format: HTML · cost: free · difficulty: **easy** — reference page for the tax-math constants

### 2. recorder_deeds

- **ACRIS document search portal** *(Manhattan/Bronx/Brooklyn/Queens ONLY)*
  - url: https://a836-acris.nyc.gov/DS/DocumentSearch/Index (root: https://a836-acris.nyc.gov/)
  - verification: **search-confirmed** · access_method: manual · data_format: HTML UI + free document images · update_frequency: continuous (since 1966) · cost: **free, no login**
  - terms_notes: no CAPTCHA reported; use Open Data index instead of scraping — hit portal only for images
  - difficulty: **easy** — search by BBL/address/party/doc-type/CRFN
  - notes: deeds, mortgages, liens, satisfactions, **lis pendens**, UCC. RPTT returns for ALL five boroughs file here even though Staten Island documents record elsewhere
- **ACRIS open-data index datasets** (Real Property Master / Legals / Personal Property family)
  - url: https://data.cityofnewyork.us/City-Government/ACRIS-Real-Property-Legals/8h5j-fqxa (also mirrored on data.ny.gov, same ID)
  - verification: **search-confirmed** — also confirmed: Real Property Master https://nycopendata.socrata.com/City-Government/ACRIS-Real-Property-Master/bnx9-e6tj · Personal Property Master https://nycopendata.socrata.com/City-Government/ACRIS-Personal-Property-Master/sv7x-dduq · historical cut Acris deeds 1950-2003 https://data.cityofnewyork.us/City-Government/Acris-deeds-1950-2003/dp96-3pxw. (Parties/Remarks tables exist in the family; URLs not captured.)
  - access_method: api · data_format: CSV/JSON, relational on `document_id` · update_frequency: regular refresh · cost: free · terms_notes: open; images NOT included
  - difficulty: **medium** — multi-table join (Master+Legals+Parties), large volumes
  - notes: machine-readable deed/mortgage index → sales history + debt stack for 4 boroughs. Public-created derivatives also confirmed (flag as non-endorsed): "ACRIS DEEDs" ([vayk-bjrk](https://data.cityofnewyork.us/City-Government/ACRIS-DEEDs/vayk-bjrk)), "Mortgage & Deeds" ([hzhn-3cmt](https://data.cityofnewyork.us/City-Government/Mortgage-Deeds/hzhn-3cmt))
- **DOF Rolling Sales + Annualized Sales** (all five boroughs — the city's own comp file)
  - url: https://www.nyc.gov/site/finance/property/property-rolling-sales-data.page · annualized: https://www.nyc.gov/site/finance/property/property-annualized-sales-update.page
  - Open-data versions (search-confirmed): Rolling Calendar Sales https://data.cityofnewyork.us/dataset/NYC-Citywide-Rolling-Calendar-Sales/usep-8jbt · Annualized Calendar Sales Update https://data.cityofnewyork.us/City-Government/NYC-Citywide-Annualized-Calendar-Sales-Update/w2pb-icbu
  - verification: **search-confirmed** · access_method: bulk_download + api · data_format: XLS/PDF per borough; CSV/JSON citywide · update_frequency: rolling monthly (trailing 12 mo); annualized back to 2003 · cost: free · terms_notes: open
  - difficulty: **easy** · notes: filter $0/nominal transfers; covers tax classes 1, 2, 4
- **DOF RPTT page** (transfer-tax rates)
  - url: https://www.nyc.gov/site/finance/property/property-real-property-transfer-tax-rptt.page
  - verification: **search-confirmed** · access_method: manual · data_format: HTML · cost: free · difficulty: **easy**
  - notes: rate table in Key facts; recording fees computed in ACRIS at e-recording

#### Borough split — Richmond County (Staten Island)

- **Richmond County Clerk — land document search**
  - url: https://www.richmondcountyclerk.com/
  - verification: **search-confirmed** (site URL; snippets describe Land Document Search by doc #, party, date, block/lot, book/page; digitized free online back to 1945; the direct search-portal URL did not appear)
  - access_method: manual · data_format: HTML + scanned images · update_frequency: continuous · cost: free to view; copies $0.25/pg, certified $4/pg
  - terms_notes: **no bulk index** — Staten Island is absent from the ACRIS open-data family
  - difficulty: **medium** — separate system, no API
  - notes: Staten Island *prices* still flow through DOF sales files and RPTT/ACRIS filings; only the recorded documents split

### 3. zoning

- **ZoLa — NYC's Zoning & Land Use Map**
  - url: https://zola.planning.nyc.gov/ (mirror: https://zola.planninglabs.nyc/ ; DCP page: https://www.nyc.gov/site/planning/data-maps/zola.page)
  - verification: **search-confirmed** · access_method: manual · data_format: interactive open-source web map · cost: free · terms_notes: open source (NYCPlanning/labs-zola)
  - difficulty: **easy** — per-lot zoning, overlays, special districts by BBL/BIN/address
- **NYC GIS Zoning Features (Bytes of the Big Apple)**
  - url: https://www.nyc.gov/site/planning/data-maps/open-data/dwn-gis-zoning.page
  - Also confirmed: Socrata geodatabase https://data.cityofnewyork.us/City-Government/Zoning-GIS-Data-Geodatabase/mm69-vrje · data.gov mirror https://catalog.data.gov/dataset/zoning-gis-data-geodatabase · georeferenced map sheets https://catalog.data.gov/dataset/georeferenced-nyc-zoning-maps
  - verification: **search-confirmed** · access_method: bulk_download · data_format: shapefile/FGDB (districts, commercial overlays, special purpose districts) · update_frequency: with map amendments, versions archived · cost: free · terms_notes: informational disclaimer; ±20 ft horizontal accuracy
  - difficulty: **easy** — spatial-join to MapPLUTO (or use PLUTO's own zoning fields)
- **Zoning Resolution web text + Text Amendment Index** (NYC's code is DCP-published, not Municode/ecode360)
  - url: https://www.nyc.gov/site/planning/zoning/amendment-index.page (amendments PDF as of 2026-02-24 also confirmed)
  - verification: **search-confirmed** · access_method: manual · data_format: HTML/PDF · update_frequency: continuously incorporated; index since 1993 · cost: free
  - difficulty: **medium** — authoritative but large; no API. Note recent "City of Yes" (COYHO) amendments changed residential capacity rules
- **BSA variance/special-permit case records** — verification: **unverified** — *not searched (budget exhausted)*. BSA runs an application-status/eFiling portal + decision bulletins on nyc.gov/site/bsa; a BSA applications dataset exists on Open Data. No URL recorded. access: manual · PDF decisions · free · difficulty: medium. Verify: search "nyc bsa application status portal"
- **DCP ZAP — ULURP + CEQR project records** — verification: **unverified** — *not searched*. ZAP Search (zap.planning.nyc.gov) tracks land-use applications & environmental review; open-data companion datasets exist. No URL recorded. access: manual/api · free · difficulty: medium. Rezoning-pipeline signal for market checks

### 5. tax_rates

- **DOF property tax rates by class** — verification: **unverified** — *not searched*. DOF publishes current + historical per-class rates on nyc.gov/site/finance. One citywide rate per class per fiscal year (Council-set, sometimes mid-year). Prior-knowledge magnitudes (VERIFY before encoding): Class 2 ≈ 12.5%, Class 4 ≈ 10.6–10.8% of AV. access: manual · HTML/PDF · annual · free · difficulty: easy

### 6. permits_co

- **DOB NOW / BIS portals + DOB open-data datasets** — verification: **unverified** — *not searched*. Known Socrata datasets (IDs from prior knowledge, NOT confirmed): DOB Job Application Filings (ic3t-wcy2), DOB Permit Issuance (ipu4-2q9a), DOB NOW Build Job Filings (w9ak-ipjd), DOB Certificate of Occupancy (bs8b-p36w). access: api · CSV/JSON · ~daily · free · terms: open
  - difficulty: **medium** — legacy BIS and DOB NOW must be unioned; keys BIN/BBL/job #
  - notes: CO vs OM-claimed unit count is a classic extraction cross-check; open jobs/permits validate renovation claims

### 7. violations_liens

- **HPD Housing Maintenance Code Violations + Multiple Dwelling Registrations** — verification: **unverified** — *not searched*. Known IDs (unconfirmed): wvxf-dwi5 (violations), tesw-yqqr (registrations); HPD Online for per-building lookup. access: api · CSV/JSON · ~daily · free · difficulty: easy once IDs verified
  - notes: class A/B/C counts = deferred-maintenance signal; registration = owner/agent of record (mandatory 3+ units)
- **DOB Violations + ECB/OATH violations** — verification: **unverified** — *not searched*. Known IDs (unconfirmed): 3h2n-5cm9, 6bgk-3dad. access: api · free · difficulty: easy. ECB penalties become liens if unpaid
- **DOF tax lien sale lists** — verification: **unverified** — *not searched*. Annual at-risk lists (property tax/water/ERP) on nyc.gov/finance + Open Data. NYC sells liens to a trust (no deed auction). access: bulk_download · CSV/XLS · annual cycle · free · difficulty: easy

### 8. sheriff_foreclosure

- **NYSCEF foreclosure case search + lis pendens** — verification: **unverified** — *not searched* (portal known as iapps.courts.state.ny.us/nyscef; unconfirmed). NY foreclosure is judicial, per-county Supreme Court (NY/Kings/Queens/Bronx/Richmond counties); auctions by court-appointed referee, no unified citywide sheriff-sale list. access: manual · HTML/e-filed PDFs · free · difficulty: **hard** — party/index search only, no API, scraping restricted
  - notes: practical automated screen = lis-pendens doc-type filter in the **ACRIS open-data index** (search-confirmed above) for the 4 boroughs

### 9. evictions_rent_reg

- **Marshal Evictions dataset (DOI) + OCA housing-court data** — verification: **unverified** — *not searched*. Known: "Evictions" dataset (6z8x-wfk4, unconfirmed) = executed marshal evictions by address; OCA releases limited filing extracts. Housing-court records themselves are statutorily restricted (sealing; tenant-screening prohibitions) — do not build tenant screening on this. access: api · CSV/JSON · ongoing · free · difficulty: medium (dataset easy; court records hard/restricted)
- **DHCR rent-stabilized building lists + taxbills.nyc / nycdb (unofficial)** — verification: **unverified** — *not searched*. Official HCR/DHCR annual lists = borough PDFs, buildings only, no unit counts. Unit-level counts come from the **unofficial** taxbills.nyc scrape of DOF tax bills, packaged in open-source nycdb.
  - terms_notes: **FLAG** — unofficial, estimate-quality, community licensing; DOF bill scraping may violate site terms. Screening flags only, never authoritative counts
  - difficulty: **hard** — official data is PDF; truth requires DHCR rent-roll requests or unofficial scrapes
  - notes: top-tier OM red flag = free-market rent claims on a DHCR-listed building (HSTPA 2019 blocks most deregulation); J-51/421-a receipt also forces stabilization during the benefit period

### 10. incentive_zones

- **DOF benefits data — 421-a, J-51, ICAP/ICIP** — verification: **unverified** — *not searched*. Exemption codes ride on the search-confirmed assessment roll (8y4t-faws); benefit-specific Open Data datasets exist (URLs unconfirmed). access: api · CSV/JSON · annual · free · difficulty: medium (code crosswalks + expiry schedules)
  - notes: abatement expiry = tax step-up cliff + stabilization implications; 421-a lapsed for new filings (successor 485-x, 2024 — verify)
- **Opportunity Zones + NYCIDA programs** — verification: **unverified** — *not searched*. OZ = static 2018 federal tract list (CDFI Fund/IRS) joinable to PLUTO census tract. No TIF districts in the classic sense; analogues = IDA PILOTs, Hudson Yards-style district financing. access: bulk_download · free · difficulty: easy (OZ) / medium (IDA)

### 11. environmental

- **NYSDEC Spill Incidents + remediation dbs; NYC OER E-designations/brownfield** — verification: **unverified** — *not searched* (only an incidental extapps.dec.ny.gov document link surfaced). Spills mirrored on data.ny.gov (Socrata); DEC site-remediation lookup; **E-designation is a PLUTO field**, so screening is free once PLUTO is loaded. access: api/manual · CSV/HTML · ongoing · free · difficulty: medium (address→BBL matching)
- **FEMA NFHL + NYC flood maps** — verification: **unverified** — *not searched*. NYC quirk: effective FIRMs are 1983-era; 2015 preliminary FIRMs never adopted; MapPLUTO carries firm07/pfirm15 flags; DCP publishes a Flood Hazard Mapper. Check BOTH layers (insurance = effective; risk = preliminary). access: gis_service/bulk · NFHL GDB/REST + PLUTO flags · free · difficulty: medium

### 12. gis_open_data

- **NYC Open Data portal (Socrata) — umbrella**
  - url: https://data.cityofnewyork.us
  - verification: **search-confirmed** (domain hosted every city dataset URL in results; portal root not a standalone result) · access: api · CSV/JSON/GeoJSON via SODA · per-dataset cadence · free · terms: open, app token recommended
  - difficulty: **easy** — one API surface for parcels/roll/ACRIS/sales/DOB/HPD/evictions/liens/zoning
  - notes: NYS sibling **data.ny.gov** (domain search-confirmed) mirrors ACRIS Legals and hosts DHCR/DEC/statewide datasets
- **DCP Bytes of the Big Apple (GIS hub)**
  - url: https://www.nyc.gov/site/planning/data-maps/open-data/dwn-gis-zoning.page (zoning page; hub root not captured)
  - verification: **search-confirmed** · access: bulk_download · shapefile/FGDB/CSV, versioned archives (MapPLUTO, zoning, boundaries, LION centerlines) · free · difficulty: **easy**
  - notes: Bytes for reproducible vintages; Socrata for API

---

## Metro-level: 4. broker_comps

- **CBRE / JLL / Colliers / Cushman & Wakefield / Newmark / Marcus & Millichap NYC reports** — verification: **unverified** — *not searched (budget exhausted)*. Free quarterly NYC office/multifamily/retail/industrial reports, typically email-gated PDFs on each firm's research page. Notable local shops: **Ariel Property Advisors** (NYC multifamily standard), B6, Avison Young. access: manual · PDF · quarterly · free w/ registration · terms: **copyrighted — cite, don't redistribute** · difficulty: medium
  - notes: NYC's public alternative is unusually strong — DOF sales files (recorded prices) + RGB Income & Expense study (opex benchmarks) reduce broker-report dependence
- **NYS ORPTS statewide real property sales (data.ny.gov)** — verification: **unverified** — *not searched*; data.ny.gov domain confirmed active, dataset URL not captured. RP-5217-derived statewide sales. access: api · CSV/JSON · ongoing · free · difficulty: medium
  - notes: mainly for NYC-adjacent counties (Westchester/Nassau); five-borough sales better served by DOF files

## Metro-level: 13. rent_demand

- **HUD FMR — "New York, NY HUD Metro FMR Area" (NYC HMFA)** — verification: **unverified** — *not searched*. NYC is a mandatory **Small Area FMR** metro → ZIP-level FMRs apply; huduser.gov tables + FMR API. access: bulk_download/api · XLS/CSV · annual (FY, Oct 1) · free · difficulty: easy
  - notes: SAFMR = sanity band on OM rents; voucher payment standards (Section 8/CityFHEPS) track FMR
- **Zillow ZORI · Apartment List · ACS/BLS · NYC Rent Guidelines Board** — verification: **unverified** — *not searched*. ZORI covers NYC metro/borough/neighborhood (CSV, zillow.com/research/data); Apartment List city/metro CSVs; ACS B25 tables via Census API (tract rents/vacancy/incomes); BLS CES/LAUS metro employment; **NYC RGB** annual Housing Supply Report, **Income & Expense Study** (per-unit opex from mandated RPIE filings — uniquely strong public expense comps), Price Index of Operating Costs; triennial NYC Housing & Vacancy Survey. access: bulk_download · CSV/PDF · monthly–triennial · free · terms: ZORI/Apartment List attribution + redistribution limits — check before caching · difficulty: easy
