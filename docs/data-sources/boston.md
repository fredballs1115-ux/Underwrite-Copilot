# Boston, MA metro — public data source registry

> **Research caveat (2026-08-25):** this metro's research session hit the shared WebSearch cap after 8 successful searches. Entries marked `search-confirmed` had their exact URL appear in a WebSearch result listing or snippet. Everything else is marked `unverified` with a note saying so — those sources are known from the task brief or general knowledge but their URLs/details were NOT confirmed and must be re-verified before use. Nothing below is fabricated; unverified means unverified.

MA is **municipality-centric**: assessing is per city/town (no county assessor), deeds are per **registry district** (not always county lines), and two statewide feeds do enormous lifting — **MassGIS L3 parcels** (one feed = every municipality's parcels + assessor CAMA extract) and **masslandrecords.com** (free deed images for all 21 registry districts).

## Key facts

| Fact | Value | Verification |
|---|---|---|
| Assessment ratio | 100% of "full and fair cash value", revalued **annually**; DOR (Bureau of Local Assessment) **certifies every 5 years**, interim-year adjustments required in between | search-confirmed (mass.gov FY2025 assessment update; MMA/DLS webinar PDF) |
| Transfer tax | State deeds excise **$4.56 per $1,000** of consideration (rounded up to nearest $500), statewide **except Barnstable County ($6.48)** — no extra county/city transfer tax anywhere in the Boston metro | search-confirmed (askdoss.com, legalclarity.org, mass.gov DOR directives) |
| Registry districts in scope | Suffolk (Boston, Chelsea, Revere, Winthrop) · Middlesex South (Cambridge, Somerville) · Norfolk (Quincy, Brookline) · Essex South (Lynn, Salem) · Essex North (Lawrence) · Plymouth (Brockton) | Suffolk coverage search-confirmed; other district assignments unverified |
| Deed images | Free, no account, all 21 districts, 1629–present, via masslandrecords.com | search-confirmed (snippet) |
| Big win | MassGIS L3 standardized parcels: statewide semiannual compile (Jan 1 / Jul 1), shapefile/FGDB, per-town downloads too | search-confirmed |
| Foreclosure regime | MA is essentially non-judicial (power of sale) but requires a Land Court Servicemembers Act case; evidence lands as foreclosure deeds/affidavits at the registry. Warren Group aggregates (commercial $) | unverified (budget exhausted) |
| Evictions | masscourts.org public case search; MA passed an eviction-record **sealing** law (eff. 2025) that limits record access | unverified (budget exhausted) |

---

## Statewide (Massachusetts) — infrastructure sources

These cover every jurisdiction below; per-town sections reference them instead of repeating.

### parcel_assessment (statewide)
- **MassGIS Property Tax Parcels (L3 standardized parcels)** — parcels + standardized assessor extract (use, value, sale) for every municipality.
  - url: https://www.mass.gov/info-details/massgis-data-property-tax-parcels — **search-confirmed** (link in results; L3 assess metadata also surfaced: http://maps.massgis.state.ma.us/metadata/GISDATA_L3_TAXPAR_POLY_ASSESS.shp.xml)
  - access_method: bulk_download (also served as GIS services) · data_format: shapefile / FGDB · update_frequency: statewide compile 2×/yr (Jan 1, Jul 1); per-town vintages vary · cost: free
  - terms_notes: public MassGIS data, no scraping needed; statewide shapefile split east/west (>2GB limit)
  - difficulty: **easy** — official statewide bulk download, clean terms
  - notes: snippet confirmed twice-yearly statewide zip on S3 with all municipal vintages; the TAXPAR_POLY + ASSESS table join is the standardized model. Assessor CAMA fields (incl. last-sale fields) per prior knowledge — verify field list in metadata.
- **DOR Division of Local Services / Bureau of Local Assessment** — certification status, ratio-study context. url: https://www.mass.gov/info-details/fy2025-assessment-update — **search-confirmed**. difficulty: easy (reference pages).

### recorder_deeds (statewide)
- **masslandrecords.com (Secretary of the Commonwealth land records portal)** — deed/mortgage/lien/plan search + free images, all 21 registry districts, 1629–present, no account.
  - url: masslandrecords.com — **search-confirmed** (domain in snippet; per-district URLs not captured — do not guess subpaths)
  - access_method: scrape/manual (search UI; no public bulk index API known) · data_format: HTML index + TIFF/PDF images · update_frequency: continuous · cost: free viewing/printing (non-certified)
  - terms_notes: free images confirmed; bulk-index availability NOT confirmed — check per-district; snippet notes foreclosure documents included
  - difficulty: **medium** — free and complete, but per-district UIs and no confirmed bulk feed
- **Deeds excise:** $4.56/$1,000 statewide (metro); collected at recording. Recording fee schedule: not searched — unverified.

### sheriff_foreclosure (statewide mechanics)
- **Land Court (Servicemembers cases) + registry foreclosure deeds** — foreclosure signal = Land Court case filings + Orders of Notice / foreclosure deeds recorded at the registry (searchable on masslandrecords). verification: **unverified** (WebSearch budget exhausted; mechanism from task brief/prior knowledge). access: manual/scrape · difficulty: hard — fragmented across court + registry; **The Warren Group** sells the cleaned feed (commercial, $).

### evictions_rent_reg (statewide record access)
- **masscourts.org (MA Trial Court eCourts public case search)** — Housing Court summary process (eviction) cases. verification: **unverified** (domain from task brief; not searched). access: manual/scrape · terms_notes: session-based search UI, CAPTCHA-ish friction reported historically; **2025 eviction-record sealing law** limits what's visible — confirm scope before relying on it. difficulty: **hard**. MA has no rent control/registration statewide (Boston/Somerville programs below).

### environmental (statewide)
- **MassDEP Waste Site/Reportable Release Lookup (M.G.L. c.21E sites)** — state cleanup-site database. verification: **unverified** (budget exhausted; db name from task brief). access: search UI + likely data extract via EEA data portal · difficulty: medium.
- **FEMA NFHL** — flood layers covering all MA. verification: **unverified** here (national layer; standard NFHL viewer/WFS). difficulty: easy once confirmed.

### incentive_zones (statewide)
- **Opportunity Zone tracts (Treasury/CDFI list; MA layer)** — unverified. · **MA EACC DIF/TIF project records** (Economic Assistance Coordinating Council approves local TIF/DIF agreements) — unverified. · difficulty: medium (terms live in town-meeting/council votes).

---

## Boston (Suffolk County) — CORE

### 1. parcel_assessment
- **Property Assessment (yearly roll), Analyze Boston** — full parcel-level roll, FY2004–FY2026 vintages.
  - url: https://data.boston.gov/dataset/property-assessment — **search-confirmed** (FY2025/FY2026 resource pages also in results, e.g. FY2026 resource ee73430d-96c0-423e-ad21-c4cfb54c8961)
  - access_method: api (CKAN datastore) + bulk_download · data_format: CSV/TSV/JSON/XML · update_frequency: annual per FY · cost: free
  - terms_notes: open data portal; join keys PID/CM_ID/GIS_ID (trailing-underscore column names per data dictionary snippet)
  - difficulty: **easy** — clean CKAN dataset
  - notes: assessed at 100% FFCV annually; DOR 5-yr certification cycle (see Key facts).
- **Assessing Online (parcel lookup app)** — url: https://data.boston.gov/dataset/assessing-online — **search-confirmed**. access: manual · difficulty: easy · notes: per-parcel ownership/value/tax UI; use the roll dataset for bulk.
- MassGIS L3 (statewide, above) for geometry.

### 2. recorder_deeds
- **Suffolk Registry of Deeds** — records for Boston, Chelsea, Revere, Winthrop.
  - url: https://massrods.com/suffolk/ — **search-confirmed** (also deeds.com recorder page: https://www.deeds.com/recorder/massachusetts/suffolk/)
  - access_method: manual/scrape · data_format: HTML + image · update_frequency: continuous · cost: free non-certified copies (search-confirmed snippet)
  - terms_notes: recorded-land search from 1949+ online; registered (Land Court) land searched separately; also on masslandrecords.com
  - difficulty: **medium** — free but UI-driven; registered vs recorded land split
  - notes: deeds excise $4.56/$1,000; recording fees not confirmed.

### 3. zoning
- **Boston Zoning Code (BPDA)** — url: https://www.bostonplans.org/planning-zoning/zoning-code — **search-confirmed**. format: HTML/PDF articles · difficulty: medium (code is article-per-neighborhood, notoriously bespoke).
- **BPDA Zoning Viewer** — parcel-level zoning lookup. verification: **search-confirmed existence** (snippet: "Zoning Viewer… see how a site is currently zoned"); exact viewer URL not captured — reach via bostonplans.org. access: manual/gis_service(?) · difficulty: medium.
- **Article 80 development review records** — project-by-project review records at BPDA; Article 80 text: https://library.municode.com/ma/boston/codes/redevelopment_authority?nodeId=ART80DEREAP — **search-confirmed**; overview: http://www.bostonplans.org/projects/development-review/what-is-article-80 — **search-confirmed**. Project database itself: browse bostonplans.org (URL unverified). difficulty: medium — per-project pages, scrape/manual. 2024–25 Article 80 modernization changed thresholds (Boston.gov news item in results).
- **ZBA (Zoning Board of Appeal) variance records** — **unverified** (budget exhausted); appeals/decisions via City of Boston ZBA pages. difficulty: hard until confirmed.

### 5. tax_rates
- **City of Boston annual tax rates (residential/commercial split rates)** — **unverified** (not searched; boston.gov publishes annually; DOR DLS "Municipal Databank" has all-town rate history). access: manual/bulk (DLS databank) · difficulty: easy once URL confirmed. Note Boston's CIP classification (commercial rate ≈ 2.4× residential — verify current FY).

### 6. permits_co
- **Approved Building Permits, Analyze Boston** — url: https://data.boston.gov/dataset/approved-building-permits — **search-confirmed** (data resource 6ddcd912-…, data dictionary 65032067-… also in results).
  - access_method: api (CKAN) + bulk_download · data_format: CSV/JSON · update_frequency: daily · cost: free
  - terms_notes: 2009–present, ~610k records; denied/void permits excluded
  - difficulty: **easy**
- Certificates of occupancy: not a confirmed separate dataset — **unverified**; check ISD/Analyze Boston.

### 7. violations_liens
- **Boston code-enforcement / building & property violations datasets (ISD + PWD code enforcement)** — known to exist on Analyze Boston; **unverified** (budget exhausted mid-search). access: api/bulk (CKAN) expected · difficulty: easy once confirmed.
- **Municipal lien certificates (MLC)** — request from City of Boston Collector-Treasurer, statutory fee, per-parcel; standard MA practice. **unverified**. access: manual · difficulty: hard (paper/fee workflow).

### 8. sheriff_foreclosure
- See statewide mechanics. Suffolk-specific: foreclosure deeds/orders of notice searchable at Suffolk Registry (free). Land Court case search via masscourts.org — **unverified**. difficulty: hard.

### 9. evictions_rent_reg
- **Eastern Housing Court (Boston) records via masscourts.org** — **unverified**; 2025 sealing law caveat applies.
- **Boston rental registration (ISD Rental Registration & Inspection program)** — landlords must register rental units annually; **problem properties** list maintained by City. Both **unverified** (budget exhausted). Underwrite relevance: registration fee/inspection cadence; no rent control.

### 10. incentive_zones
- **OZ tracts in Boston** — unverified (statewide layer). **Chapter 121A/121B agreements (BPDA urban-renewal-era tax agreements)** — in-lieu-of-tax deals that materially change a parcel's tax bill; records at BPDA — **unverified**. difficulty: hard (agreement-by-agreement).

### 11. environmental
- MassDEP 21E lookup + FEMA NFHL (statewide, above) — both unverified. Boston groundwater conservation overlay districts (foundation-pile issue in Back Bay/South End) worth flagging — unverified.

### 12. gis_open_data
- **Analyze Boston (data.boston.gov, CKAN)** — the city open-data portal itself. url: https://data.boston.gov — **search-confirmed** (dataset pages in results). Layers that matter: property assessment, approved building permits, (unconfirmed: parcels, zoning districts, code violations, 311). difficulty: easy.
- **BostonMaps / City GIS (ArcGIS)** — **unverified**.

---

## Cambridge (Middlesex County — Middlesex South registry) — medium depth

### 1. parcel_assessment
- **Cambridge Assessing / property database** — annual 100% FFCV like all MA; **unverified** (budget exhausted). Cambridge Open Data portal (Socrata, data.cambridgema.gov) is known to carry assessment datasets — **unverified**. Fallback: **MassGIS L3** (search-confirmed) covers Cambridge.
### 2. recorder_deeds
- **Middlesex South Registry of Deeds** — url: https://massrods.com/middlesexsouth/ — **search-confirmed**. Also on masslandrecords.com (free images). difficulty: medium.
### 3. zoning
- **Cambridge Zoning Ordinance + zoning map (CDD)** — **unverified**. Cambridge GIS publishes a zoning layer — **unverified**. difficulty: medium (many overlay/PUD districts).
### 6. permits_co
- **Cambridge open data building permits** — named in task brief; **unverified**. Expected Socrata API. difficulty: easy once confirmed.
### 12. gis_open_data
- **Cambridge Open Data (data.cambridgema.gov) + Cambridge GIS** — **unverified** (portal known, URL not search-confirmed). Layers: parcels, zoning, permits.

## Somerville (Middlesex County — Middlesex South registry) — medium depth

- **1. parcel_assessment:** Somerville Assessing (vendor-hosted property cards, likely Patriot Properties — unverified); bulk via **MassGIS L3** (confirmed). 
- **2. recorder_deeds:** **Middlesex South** — https://massrods.com/middlesexsouth/ (search-confirmed); masslandrecords.com images free.
- **3. zoning:** Somerville Zoning Ordinance (2019 form-based overhaul; online zoning site) + SomerStat/city GIS zoning map — **unverified**. difficulty: medium.
- **9. evictions_rent_reg:** Somerville has a **rental registration/inspection program** and condo-conversion review — **unverified**; flag for OpEx/turnover underwriting.
- **12. gis_open_data:** Somerville open data / GIS — **unverified**; MassGIS L3 fallback confirmed.

## Quincy (Norfolk County) — medium depth

- **1. parcel_assessment:** Quincy Assessors online database — **unverified**; **MassGIS L3** fallback (confirmed).
- **2. recorder_deeds:** **Norfolk County Registry of Deeds** (Dedham) — covers Quincy & Brookline; on masslandrecords.com (per snippet "all 21 districts") — district site itself **unverified** (norfolkdeeds.org known, not search-confirmed). Free images via masslandrecords.
- **3. zoning:** Quincy Zoning Ordinance + map — **unverified**. Quincy Center urban-revitalization district (DIF-financed) is an underwriting-relevant overlay — unverified.
- **12. gis_open_data:** Quincy GIS/MassGIS — city portal **unverified**; MassGIS confirmed.

## Brookline (Norfolk County) — medium depth

- **1. parcel_assessment:** Brookline Assessors database — **unverified**; MassGIS L3 fallback (confirmed).
- **2. recorder_deeds:** **Norfolk registry** (see Quincy).
- **3. zoning:** Brookline Zoning By-Law (town, not city — Town Meeting amendments) + GIS zoning layer — **unverified**.
- **12. gis_open_data:** Brookline GIS open data — **unverified**; MassGIS confirmed.

---

## Secondary jurisdictions (cats 1, 2, 3, 12)

All six: **parcel_assessment** bulk = **MassGIS L3** (search-confirmed, covers every town); local assessor UIs unverified. **recorder_deeds** = masslandrecords.com free images (search-confirmed domain), district split as noted. Zoning + GIS per below, all **unverified** unless noted.

| Town | Registry district | Zoning / notes |
|---|---|---|
| **Chelsea** (Suffolk) | Suffolk — massrods.com/suffolk (confirmed covers Chelsea) | Chelsea zoning ordinance — unverified |
| **Revere** (Suffolk) | Suffolk (confirmed covers Revere) | Revere zoning — unverified; Suffolk Downs mega-development overlay worth noting — unverified |
| **Lynn** (Essex) | **Essex South** registry — unverified | Lynn zoning — unverified |
| **Salem** (Essex) | **Essex South** registry — unverified | Salem zoning — unverified |
| **Lawrence** (Essex) | **Essex North** registry — unverified | Lawrence 5-Year Revaluation Process page: https://www.cityoflawrence.com/761/5-Year-Revaluation-Process — **search-confirmed** (confirms DOR 5-yr cycle locally) |
| **Brockton** (Plymouth) | **Plymouth County** registry — unverified | Brockton zoning — unverified |

---

## Metro-level: 4. broker_comps

- **CBRE / JLL / Colliers / Cushman & Wakefield / Newmark / Marcus & Millichap Boston market reports** — all publish free quarterly Boston office/multifamily/industrial reports (registration walls common). **All unverified** (WebSearch budget exhausted before this category). difficulty: medium (PDF, registration).
- **Local shops:** Boston Realty Advisors, NAI Hunneman/… — unverified.
- **State-level sales data:** MA has **no free statewide sales file** (à la PA STEB); nearest equivalents: (a) sale price/date fields inside **MassGIS L3 assessor extract** (search-confirmed dataset; field presence per prior knowledge — verify), (b) **The Warren Group** (Banker & Tradesman) — the de-facto MA sales/foreclosure feed, **commercial license, $**. Registry indexes at masslandrecords are free but unstructured.

## Metro-level: 13. rent_demand

- **HUD FMR — "Boston-Cambridge-Quincy, MA-NH HMFA"** — area name per task brief; **unverified** (HUD FMR docsystem not searched). SAFMRs exist for the metro — unverified. difficulty: easy once confirmed (huduser.gov datasets).
- **Census/ACS**: B25 series rent/vacancy at tract level; **BLS**: Boston-Cambridge-Newton CES/CPI series — standard national sources, unverified here.
- **Zillow ZORI / Apartment List rent index** — both cover Boston metro (and Zillow city-level) — **unverified** (standard CSV downloads).
