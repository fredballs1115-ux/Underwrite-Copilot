# San Francisco, CA — public data source registry (`san_francisco`)

> **RESEARCH STATUS — NOT SEARCHED.** The research session's shared WebSearch budget
> (200 calls, shared across parallel metro sessions) was exhausted before **any** San
> Francisco query could run (0 searches executed for this metro). Per the registry's honesty
> rule, **every entry below is `verification: unverified`** — no URLs are recorded anywhere
> (recording a URL requires it to have literally appeared in a search result). Each entry
> records what the source is believed to be (task brief + general domain knowledge) and the
> suggested query for a follow-up run. **This whole file needs a verification pass.**

## Key facts (all unverified except statutory Prop 13 framework)

| Fact | Value | Verification |
|---|---|---|
| Assessment basis | **Prop 13** (same as statewide): assessed = acquisition base-year value +max 2%/yr; reassessment only on transfer/new construction; no market reassessment cycle | Statutory; not search-verified |
| Documentary transfer tax | SF levies its **own graduated transfer tax** in lieu of the $1.10/$1,000 base — tiered by price, rising to **6% on transfers ≥ $25M** (Prop I 2020 raised the ≥$10M and ≥$25M tiers) | Per task brief ("up to 6%"); tier boundaries NOT verified |
| Recorder | SF Assessor-Recorder (combined office); document images believed paywalled/fee-based | Not searched |
| Open data | **data.sfgov.org** (DataSF, Socrata/SODA API) is unusually strong: assessor secured roll, DBI permits, DBI complaints, **eviction notices**, zoning, Maher environmental overlay all believed published as datasets | Domains per task brief; not search-verified |
| Rent regulation | SF Rent Ordinance (pre-6/13/1979 buildings) + **Housing Inventory / rent registry since 2022** (Rent Board); AB 1482 backdrop | Per task brief; not searched |
| TIF | No classic TIF (CA killed redevelopment 2012); SF uses IFDs/EIFDs (e.g., waterfront districts) + OCII successor-agency areas (Mission Bay, Transbay, Hunters Point) | General knowledge; not verified |

---

## San Francisco (city-county) — CORE

### 1. parcel_assessment
- **DataSF — Assessor Historical Secured Property Tax Rolls** (believed dataset name) — url: none recorded
  - verification: **unverified — NOT SEARCHED**. Suggested query: "data.sfgov.org assessor secured property tax roll dataset".
  - access_method: api / bulk_download (Socrata SODA) · data_format: CSV/JSON · update_frequency: annual roll · cost: free · difficulty: easy *(provisional)*.
  - notes: Prop 13 caveats as in Key facts — roll values lag market except recent sales.
- **SF Assessor-Recorder property search** — url: none recorded — **unverified — NOT SEARCHED**. Suggested query: "SF assessor property search sfassessor".

### 2. recorder_deeds
- **SF Assessor-Recorder — recorded document search** — url: none recorded
  - verification: **unverified — NOT SEARCHED**. Suggested queries: "San Francisco recorder document search fees", "SF recorder online index".
  - Believed: online index; copies fee-based (no free images); graduated transfer tax up to 6% ≥ $25M (tiers unverified).
  - difficulty: hard *(provisional — fee-based images)*.

### 3. zoning
- **SF Planning Code** (published via American Legal, believed) + **SF Planning zoning GIS** + **Property Information Map** — urls: none recorded
  - verification: **unverified — NOT SEARCHED**. Suggested queries: "San Francisco property information map sfplanning", "DataSF zoning districts dataset", "SF planning code american legal".
  - notes: Property Information Map = parcel-level zoning/height/overlays/planning-case lookup (believed). Zoning district polygons believed on DataSF. difficulty: easy for GIS layer *(provisional)*.

### 5. tax_rates
- **SF Controller / Treasurer-Tax Collector annual property tax rate** — url: none recorded — **unverified — NOT SEARCHED**. Single city-county rate (believed ~1.17%; NOT verified). Suggested query: "San Francisco property tax rate 2025-2026 controller".

### 6. permits_co
- **DataSF — DBI Building Permits dataset** — url: none recorded
  - verification: **unverified — NOT SEARCHED**. Suggested query: "data.sfgov.org building permits DBI dataset". Believed Socrata dataset with full permit history; api/bulk; free; difficulty easy *(provisional)*.

### 7. violations_liens
- **DataSF — DBI Complaints / Notices of Violation datasets** — url: none recorded
  - verification: **unverified — NOT SEARCHED**. Suggested queries: "data.sfgov.org DBI complaints dataset", "DBI notices of violation dataset". Believed Socrata; difficulty easy *(provisional)*.

### 8. sheriff_foreclosure
- **Nonjudicial trustee sales** (recorded NOD/NTS + published notices) — no county-run docket; recorder index is the trail. **NOT SEARCHED.**
- **SF Treasurer tax-defaulted property sales** — url: none recorded — **unverified — NOT SEARCHED**. Suggested query: "San Francisco treasurer tax sale auction schedule". (SF tax sales are infrequent/small — believed, unverified.)

### 9. evictions_rent_reg
- **DataSF — Eviction Notices dataset** (notices filed with the SF Rent Board — a genuinely public eviction dataset, rare nationally) — url: none recorded
  - verification: **unverified — NOT SEARCHED**. Suggested query: "data.sfgov.org eviction notices dataset". Believed Socrata, updated regularly; difficulty easy *(provisional)*. High value: per-address eviction-notice history.
- **SF Rent Board — Housing Inventory / rent registry (since 2022)** — url: none recorded — **unverified — NOT SEARCHED**. Suggested query: "SF rent board housing inventory portal registration". Public-lookup extent unknown.
- **SF Superior Court UD records** — CCP §1161.2 masking applies (as in LA). **NOT SEARCHED.**

### 10. incentive_zones
- **Opportunity Zones (SF designated tracts)** + **IFD/EIFD districts** (waterfront: believed Mission Rock, Pier 70) + OCII former-redevelopment areas — urls: none recorded — **unverified — NOT SEARCHED**. Suggested queries: "San Francisco opportunity zones map", "San Francisco IFD infrastructure financing district list OCII".

### 11. environmental
- **DTSC EnviroStor + SWRCB GeoTracker** (state dbs, per task brief) — urls: none recorded — **NOT SEARCHED**.
- **Maher Area layer** (SF Health Code Art. 22A soil-disturbance overlay — bayfill/industrial legacy; triggers site mitigation on development) — believed published as a DataSF/SFDPH GIS layer — **NOT SEARCHED**. Suggested query: "Maher area map dataset San Francisco".
- **FEMA NFHL** — SF joined NFIP only in 2010; NFHL coverage of SF is limited/coastal (believed, unverified). Suggested query: "FEMA flood map San Francisco NFHL".

### 12. gis_open_data
- **DataSF (data.sfgov.org, Socrata)** — url: none recorded (domain per task brief)
  - verification: **unverified — NOT SEARCHED** for a literal URL. Believed layers that matter: parcels, secured roll, zoning districts, height districts, DBI permits/complaints, eviction notices, Maher area, historic districts. SODA API + bulk CSV; free; difficulty easy *(provisional)*.

---

## San Mateo County — SECONDARY (1, 2, 3, 12) — all **unverified — NOT SEARCHED**

- **1. parcel_assessment** — San Mateo County Assessor (combined Assessor-County Clerk-Recorder office, "SMCACRE" believed). Suggested query: "San Mateo County assessor property search bulk data". Prop 13 caveats apply.
- **2. recorder_deeds** — same combined office; index search + fee-based copies believed. Transfer tax: $1.10/$1,000 county base; San Mateo city add-ons exist in some cities (e.g., San Mateo city ~0.5% — believed, unverified). Suggested query: "San Mateo county recorder official records search fees".
- **3. zoning** — county Planning for unincorporated + 20 city codes (Municode/own sites). Suggested query: "San Mateo County zoning map GIS unincorporated".
- **12. gis_open_data** — county GIS / open-data hub (parcel layer believed downloadable). Suggested query: "San Mateo County GIS open data parcels download".

## Marin County — SECONDARY (1, 2, 3, 12) — all **unverified — NOT SEARCHED**

- **1. parcel_assessment** — Marin County Assessor-Recorder-County Clerk (combined). Suggested query: "Marin County assessor property search data download". Prop 13 caveats apply.
- **2. recorder_deeds** — same combined office; fee-based copies believed; $1.10/$1,000 base transfer tax. Suggested query: "Marin County recorder official records search fees".
- **3. zoning** — county Development Code (unincorporated) + city codes. Suggested query: "Marin County zoning map GIS".
- **12. gis_open_data** — **MarinMap** regional GIS consortium (believed) + county open data. Suggested query: "MarinMap GIS parcels download".

---

## 4. broker_comps (metro-level) — **unverified — NOT SEARCHED**

- CBRE / JLL / Colliers / Marcus & Millichap / Newmark / Cushman & Wakefield free SF Bay Area quarterly reports (SF office reports are heavily covered given the office-market story; multifamily via M&M/Colliers/Kidder Mathews — Kidder is a notable regional shop). No URLs recorded.
- No CA statewide sales file (see LA registry). Suggested queries: "CBRE San Francisco figures office report", "Kidder Mathews San Francisco multifamily report".

## 13. rent_demand (metro-level) — **unverified — NOT SEARCHED**

- **HUD FMR area:** *San Francisco, CA HMFA* (believed to comprise San Francisco + San Mateo + Marin counties — matches this metro_id's jurisdiction set; NOT verified). Suggested query: "HUD FMR San Francisco HMFA 2026 area definition".
- **Census/ACS** B25 rent/vacancy series; **BLS** San Francisco-Oakland-Hayward MSA CES/LAUS + SF CPI series (drives rent-ordinance annual allowable increase).
- **Zillow ZORI** and **Apartment List** cover SF metro and city (believed; free CSVs). Suggested query: "Zillow ZORI csv download".
