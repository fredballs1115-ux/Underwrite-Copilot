# Chicago, IL — public data source registry (metro_id: `chicago`)

CORE: Cook County + City of Chicago (all 13 categories). SECONDARY: DuPage, Lake (IL), Will, Kane (categories 1, 2, 3, 12).

> **Research caveat (2026-08-25):** the shared WebSearch budget for this session was exhausted after 6 searches. Everything from those searches is marked **search-confirmed** (all the core Cook County Assessor/open-data infrastructure). Everything else is marked **unverified** — entries carry URLs/facts from the task brief or model knowledge, each flagged in its verification note. Per repo rule: unverifiable = flagged, nothing estimated silently. A follow-up pass should confirm the unverified URLs.

## Key facts

| Fact | Value | Verification |
|---|---|---|
| Assessment ratio — Cook | **10%** residential/vacant/apartments, **25%** commercial/industrial (county Classification Ordinance; only IL county with classification) | search-confirmed (Civic Federation + cookcountyassessoril.gov snippets) |
| Assessment ratio — collar counties | 33.33% of fair market value (statewide statutory level outside Cook) | unverified (model knowledge) |
| Reassessment cycle — Cook | Triennial by triad: **City of Chicago 2024**, north/NW suburbs 2025, south/west suburbs 2026 (repeats) | search-confirmed (Board of Review reassessment calendar PDF in results) |
| Reassessment cycle — collar counties | Quadrennial general assessment, annual equalization | unverified |
| State equalization factor (Cook) | Applied to AV by IDOR; recent factors ~3.0 (a 2026-referencing result title cited a 3.0 multiplier) | partially confirmed; exact yearly factor unverified |
| Transfer taxes | IL **$0.50/$500** + Cook **$0.25/$500** + Chicago **$5.25/$500** combined city total ($3.75 buyer + $1.50 CTA seller). "Bring Chicago Home" tiered-rate referendum **failed March 2024** — flat rate stands | unverified (task brief + model knowledge; confirm) |
| Access quirks | Recorder merged into **County Clerk** (Dec 2020); IL is **judicial foreclosure** (Chancery court, no API); many eviction records **sealed**; open Parcel Sales dataset substitutes for a recorder bulk feed; zero-pad PINs to 14 digits | mixed — see entries |

---

## Cook County

### 1. parcel_assessment

- **Assessor — Parcel Universe (`nj4t-kc8j`)** ⭐
  - url: https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Universe/nj4t-kc8j
  - verification: **search-confirmed** (exact URL + Socrata Foundry page in results; last updated 2026-07-15 per snippet)
  - access_method: api · data_format: JSON/CSV (Socrata SODA) · update_frequency: annual refresh cycle · cost: free
  - terms_notes: open data, no login; zero-pad PINs to 14 digits; app token for volume
  - difficulty: **easy** — official Socrata API/bulk with clean terms
  - notes: complete historic parcel universe with geographic/governmental/spatial attributes, incl. property class (detects incentive classes) and tax code (joins to rates).

- **Assessor — Parcel Sales (`wvhk-k5uv`)** ⭐
  - url: https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Parcel-Sales/wvhk-k5uv
  - verification: **search-confirmed** (exact URL + `/resource/wvhk-k5uv.json` in snippet)
  - access_method: api · data_format: JSON/CSV · update_frequency: ongoing; since 2023-10-31 no filtering by deed type/price/recency · cost: free
  - terms_notes: includes buyer/seller names
  - difficulty: **easy**
  - notes: county-scale sales-comp backbone; practical substitute for a recorder bulk index.

- **Assessor — Historic Assessed Values (`uzyt-m557`)**
  - url: https://datacatalog.cookcountyil.gov/Property-Taxation/Assessor-Historic-Assessed-Values/uzyt-m557/data
  - verification: **search-confirmed**
  - access_method: api · data_format: JSON/CSV · update_frequency: annual · cost: free
  - terms_notes: assessed values, NOT market — divide by 10%/25% level and apply equalizer
  - difficulty: **easy**
  - notes: 1999–present at three stages (mailed / Assessor-certified / BOR-certified). Companions search-confirmed: Parcel Addresses (`3723-97qp`), Board of Review Appeal Decision History (`7pny-nedm`).

- **CCAO open code + data (GitHub `ccao-data`)**
  - url: https://github.com/ccao-data (legacy: https://gitlab.com/ccao-data-science---modeling)
  - verification: **search-confirmed** (org + model-res-avm + model-condo-avm repos in results)
  - access_method: bulk_download · data_format: code + parquet/CSV artifacts · update_frequency: per model cycle · cost: free
  - terms_notes: open source; residential/condo AVMs only
  - difficulty: **easy**
  - notes: use for valuation sanity checks and the `assessr` sales-ratio tooling.

- **Cook County Assessor's Office site**
  - url: https://www.cookcountyassessoril.gov/
  - verification: **search-confirmed** (multiple pages in results: classifications, valuation-reports, assessment calendar, commercial valuation methodology)
  - access_method: manual · data_format: HTML/PDF · update_frequency: per cycle · cost: free
  - difficulty: **easy** — single-parcel UI; bulk lives on the data portal
  - notes: assessment & appeal calendar lists per-township windows; class code definitions PDF (`classcode.pdf` on prodassets.cookcountyassessoril.gov) appeared in results.

### 2. recorder_deeds

- **Cook County Clerk — Recordings Division** (former Recorder of Deeds, merged Dec 2020)
  - url: https://www.cookcountyclerkil.gov/
  - verification: **unverified** — search budget exhausted before this query; confirm recordings-search app URL (likely crs.cookcountyclerkil.gov) and fee schedule
  - access_method: manual · data_format: HTML index, TIFF/PDF images · update_frequency: daily · cost: index search free; per-document image fees
  - terms_notes: no confirmed free bulk index; flat predictable recording fees in IL
  - difficulty: **medium** — free index, paywalled images, no bulk feed
  - notes: transfer taxes as in Key facts (unverified); declarations via IDOR MyDec (PTAX-203).

- **CookViewer / county GIS parcel viewer**
  - url: https://gis.cookcountyil.gov/
  - verification: **unverified** for the viewer app, but the GIS host is corroborated: REST endpoint `https://gis.cookcountyil.gov/hosting/rest/services/Hosted/Parcel_2022/MapServer` **appeared in search results**
  - access_method: gis_service · data_format: ArcGIS REST JSON · cost: free · difficulty: **easy**

### 3. zoning (City of Chicago + unincorporated Cook)

- **Chicago Zoning Ordinance (MCC Title 17, American Legal)**
  - url: https://codelibrary.amlegal.com/codes/chicago/latest/chicago_il — verification: **unverified** (model knowledge; budget exhausted)
  - access_method: manual · data_format: HTML · update_frequency: as amended · cost: free
  - terms_notes: third-party host, scraping-unfriendly terms
  - difficulty: **medium**
  - notes: B/C/D/M districts; Planned Developments (PDs) common for large CRE.

- **Chicago Data Portal — zoning district GIS layer + zoning map app**
  - url: https://data.cityofchicago.org/ — verification: **unverified** (portal domain from model knowledge; dataset ID not confirmed)
  - access_method: gis_service · data_format: shapefile/GeoJSON/Socrata · update_frequency: as enacted · cost: free
  - difficulty: **easy** once dataset confirmed
  - notes: ZBA (variances/special uses) publishes agendas/decisions as PDFs on chicago.gov — bulk-hostile.

- **Cook County Building & Zoning (unincorporated only)**
  - url: https://www.cookcountyil.gov/agency/building-and-zoning — verification: **unverified**
  - access_method: manual · difficulty: **medium** — ~130 suburbs each publish their own codes.

### 5. tax_rates

- **Cook County Clerk — annual tax extension / agency rate reports**
  - url: https://www.cookcountyclerkil.gov/ — verification: **unverified** (page path unconfirmed)
  - access_method: bulk_download · data_format: PDF + Excel/CSV · update_frequency: annual · cost: free
  - difficulty: **medium** — join tax code areas to PINs (tax code field is in Parcel Universe)
  - notes: Treasurer (cookcountytreasurer.com) for per-PIN bills.

### 6. permits_co

- **Chicago Data Portal — Building Permits (`ydr8-5enu`)**
  - url: https://data.cityofchicago.org/ — verification: **unverified** — dataset ID from task brief, consistent with model knowledge, not confirmed in a result listing
  - access_method: api · data_format: JSON/CSV (Socrata) · update_frequency: daily · cost: free
  - difficulty: **easy** once confirmed
  - notes: permits back to ~2006; no open CO dataset — CO lookup via Dept. of Buildings. Suburban Cook permits are per-municipality.

### 7. violations_liens

- **Chicago Data Portal — Building Violations**
  - url: https://data.cityofchicago.org/ — verification: **unverified** (dataset ID unconfirmed)
  - access_method: api · data_format: JSON/CSV · update_frequency: daily · cost: free
  - difficulty: **easy** once confirmed
  - notes: also (unverified): city Building Code Scofflaw / Problem Landlord List; recorded municipal liens require a Clerk recordings search by PIN.

### 8. sheriff_foreclosure

- **Clerk of the Circuit Court of Cook County — Chancery (foreclosure) case search** + Sheriff / Judicial Sales
  - url: https://www.cookcountyclerkofcourt.org/ — verification: **unverified**
  - access_method: scrape/manual · data_format: HTML search, PDF notices · update_frequency: daily filings · cost: search free, copies fee-based
  - terms_notes: search-only, possible CAPTCHA, no bulk; many Cook sales run through The Judicial Sales Corporation (tjsc.com) rather than the Sheriff
  - difficulty: **hard** — judicial foreclosure, no API
  - notes: tax route separate: Treasurer **Annual Tax Sale** + former **Scavenger Sale** (restructured by 2021–23 IL reforms — verify current status); delinquent-PIN lists published pre-sale.

### 9. evictions_rent_reg

- **Cook County Circuit Court eviction case records** + Chicago RLTO
  - url: https://www.cookcountyclerkofcourt.org/ — verification: **unverified**
  - access_method: manual · data_format: HTML search · cost: free search
  - terms_notes: many eviction records **sealed** (COVID-era + 2022 IL sealing law); no bulk feed; LCBH/Eviction Lab publish aggregates
  - difficulty: **hard**
  - notes (regulatory, unverified): **no rent control statewide** (Rent Control Preemption Act 1997); **Chicago RLTO** (MCC 5-12) + Fair Notice Ordinance (2020); **Cook County RTLO** (2021) covers suburban Cook (some opt-outs); no general Chicago landlord registration (some suburbs require licenses).

### 10. incentive_zones

- **Cook County incentive classes (6b industrial, 7a/7b commercial, 8, 9 affordable multifamily)** + **Chicago TIF portal/data** + OZ/EZ
  - url: https://www.cookcountyassessoril.gov/ (domain search-confirmed; incentive pages unverified) · TIF: chicago.gov TIF portal + TIF boundary layer on data.cityofchicago.org (unverified)
  - access_method: manual/gis_service · data_format: HTML/PDF + GIS layer · update_frequency: per application; annual TIF reports · cost: free
  - difficulty: **medium** — spread across Assessor, TIF portal, GIS
  - notes: incentive classes cut the assessment level (major underwriting input; **Class 9 = affordable multifamily**); incentive-class PINs detectable in bulk via Parcel Universe class codes. OZ tracts via CDFI Fund/IL DCEO; IL Enterprise Zones via DCEO (unverified).

### 11. environmental

- **Illinois EPA — Site Remediation Program (SRP) database** (+ LUST incidents, landfill inventories) and **FEMA NFHL**
  - url: https://epa.illinois.gov/ — verification: **unverified**; NFHL via msc.fema.gov / hazards.fema.gov (unverified)
  - access_method: manual/gis_service · data_format: HTML search, some CSV; NFHL ArcGIS REST/shapefile · cost: free
  - difficulty: **medium** — search-UIs, no API; NFHL easy once endpoint confirmed
  - notes: state DB name to cite = **IEPA Site Remediation Program**; heavy LUST/SRP presence in Chicago industrial corridors.

### 12. gis_open_data

- **Cook County Open Data portal (Socrata)** ⭐
  - url: https://datacatalog.cookcountyil.gov/ — verification: **search-confirmed**
  - access_method: api · data_format: Socrata SODA · cost: free · difficulty: **easy**
  - notes: home of `nj4t-kc8j`, `wvhk-k5uv`, `uzyt-m557`, `3723-97qp`, `7pny-nedm`.

- **Cook Central (county ArcGIS open-data hub) + gis.cookcountyil.gov REST**
  - url: https://gis-cookcountyil.opendata.arcgis.com/ — verification: **unverified** hub URL (from task brief); REST host **search-confirmed** via `.../Hosted/Parcel_2022/MapServer/layers?f=pjson`
  - access_method: gis_service · data_format: ArcGIS REST/GeoJSON/shapefile · cost: free · difficulty: **easy**
  - notes: layers that matter — parcels (PIN polygons), municipalities, townships/triads, tax districts, floodplain.

- **Chicago Data Portal (Socrata)**
  - url: https://data.cityofchicago.org/ — verification: **unverified** (domain from model knowledge)
  - access_method: api · cost: free · difficulty: **easy**
  - notes: layers that matter — building permits, violations, zoning districts, TIF districts, business licenses, vacant buildings, 311.

---

## Metro-level

### 4. broker_comps

- **CBRE / JLL / Colliers / Cushman & Wakefield / Newmark / Marcus & Millichap — Chicago quarterly reports**
  - url: https://www.cbre.com/insights (representative; per-shop URLs unverified — budget exhausted)
  - access_method: manual · data_format: PDF/HTML, often email-gated · update_frequency: quarterly · cost: free (registration walls)
  - terms_notes: copyrighted — attribute figures, don't redistribute PDFs
  - difficulty: **medium**
  - notes: Chicago is a fully tracked top-tier market in all six national series. Local shops (unverified): **Kiser Group** and **Essex Realty Group** publish Chicago multifamily sales research. **No PA-STEB-style IL statewide sales file** — IDOR sales-ratio/PTAX-203 (MyDec) data plus Cook's open Parcel Sales dataset are the substitutes.

### 13. rent_demand

- **HUD FMR — "Chicago-Joliet-Naperville, IL HUD Metro FMR Area"** (+ ZIP-level SAFMRs — mandatory SAFMR metro per model knowledge)
  - url: https://www.huduser.gov/portal/datasets/fmr.html — verification: **unverified** (area name from task brief; consistent with model knowledge)
  - access_method: bulk_download/api · data_format: CSV/Excel + HUD FMR API · update_frequency: annual (FY) · cost: free · difficulty: **easy**
  - notes: Census/ACS — Chicago-Naperville-Elgin, IL-IN(-WI) MSA (B25058/B25031, PUMS); BLS — Chicago-Naperville-Elgin CES + a published metro CPI series for Chicago; free rent indexes — **Zillow ZORI** (zillow.com/research/data) and **Apartment List** both cover Chicago at metro/city/ZIP level (unverified this session).

---

## DuPage County (secondary)

- **1. parcel_assessment — Supervisor of Assessments + property lookup** · url: https://www.dupagecounty.gov/ · **unverified** (budget exhausted; model knowledge) · manual · HTML · annual/quadrennial · free · 33.33% ratio · difficulty: **medium** (lookup-first; bulk via GIS/FOIA)
- **2. recorder_deeds — DuPage County Recorder records search** · url: https://www.dupagecounty.gov/ · **unverified** · manual · HTML index + fee-based images · daily · index free, copies fee-based · transfer tax state+county $0.75/$500 combined; some home-rule municipal taxes (e.g., Naperville — verify) · difficulty: **medium**
- **3. zoning — county (unincorporated) + municipal codes** · url: https://www.dupagecounty.gov/ · **unverified** · manual · HTML/PDF + GIS layer · difficulty: **medium** (fragmented municipalities)
- **12. gis_open_data — DuPage ArcGIS open data hub** · url: https://gisdata-dupage.opendata.arcgis.com/ · **unverified** (confirm hub URL) · gis_service · REST/shapefile · free · difficulty: **easy** if confirmed · layers: parcels, unincorporated zoning, municipal boundaries, flood

## Lake County IL (secondary)

- **1. parcel_assessment — Chief County Assessment Office + tax lookup** · url: https://www.lakecountyil.gov/ · **unverified** · manual · HTML · annual/quadrennial · free · 33.33% ratio · difficulty: **medium**
- **2. recorder_deeds — Lake County Recorder of Deeds search** · url: https://www.lakecountyil.gov/ · **unverified** · manual · index free, copies fee-based · daily · some home-rule municipal transfer taxes · difficulty: **medium**
- **3. zoning — Planning, Building & Development (unincorporated) + municipal codes** · url: https://www.lakecountyil.gov/ · **unverified** · manual · difficulty: **medium**
- **12. gis_open_data — Lake County GIS / Maps Online** · url: https://maps.lakecountyil.gov/ · **unverified** (long-standing county GIS program; confirm) · gis_service · REST/shapefile · free · difficulty: **easy** if confirmed

## Will County (secondary)

- **1. parcel_assessment — Supervisor of Assessments + lookup** · url: https://www.willcountyillinois.com/ · **unverified** (confirm current domain) · manual · annual/quadrennial · free · 33.33% ratio · difficulty: **medium** · note: Joliet/I-80 = major industrial submarket
- **2. recorder_deeds — Will County Recorder (likely Fidlar Laredo/Tapestry vendor)** · url: https://www.willcountyillinois.com/ · **unverified** · manual · likely pay-per-search/subscription — confirm · difficulty: **hard** (vendor-gated access likely)
- **3. zoning — Land Use Dept (unincorporated) + municipal codes** · url: https://www.willcountyillinois.com/ · **unverified** · manual · difficulty: **medium**
- **12. gis_open_data — Will County GIS** · url: https://gis.willcountyillinois.com/ · **unverified** · gis_service · REST/shapefile · free · difficulty: **easy** if confirmed

## Kane County (secondary)

- **1. parcel_assessment — Supervisor of Assessments + lookup** · url: https://www.kanecountyil.gov/ · **unverified** (confirm domain) · manual · annual/quadrennial · free · 33.33% ratio · difficulty: **medium** · note: Aurora/Elgin anchor cities
- **2. recorder_deeds — Kane County Recorder (likely Fidlar vendor)** · url: https://www.kanecountyil.gov/ · **unverified** · manual · access model/fees unconfirmed · difficulty: **hard** (likely vendor-gated)
- **3. zoning — Development & Community Services (unincorporated) + municipal codes** · url: https://www.kanecountyil.gov/ · **unverified** · manual · difficulty: **medium**
- **12. gis_open_data — Kane County GIS / KaneGIS** · url: https://www.kanecountyil.gov/ · **unverified** · gis_service · REST/shapefile · free · difficulty: **easy** if confirmed
