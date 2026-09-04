# Dallas–Fort Worth TX — public-data source registry

Coverage per `COVERAGE.md`: **Core** = Dallas County (DCAD; Dallas, Irving, Garland,
Mesquite) + City of Dallas, Tarrant County (TAD; Fort Worth, Arlington). **Secondary**
= Collin (Plano, McKinney, Frisco), Denton (Denton, Lewisville). Rockwall, Ellis,
Johnson, Kaufman, Hunt, Parker, Wise out of scope.

URLs recorded as they appeared in search results (2026-08-25); `search-confirmed`
means the URL surfaced verbatim in a search listing, not that the page was opened.

## Key facts

| Fact | Value |
|---|---|
| **Non-disclosure** | **TEXAS IS A NON-DISCLOSURE STATE — sale prices are NOT public record in any of the four counties.** Deeds record without consideration; clerks/public records show no price. Substitutes: deed-of-trust (mortgage) amounts ARE recorded, MLS-derived comps via brokers, CAD noticed values. This is a structural comps constraint per county. |
| Assessment ratio | 100% of market value as of Jan 1 (Tax Code §1.04/§23.01), appraised annually by each county CAD; Comptroller PTAD ratio-tests CADs annually |
| Reassessment cycle | Annual reappraisal (biennial reappraisal plans, e.g. 2025–2026) |
| Transfer tax | **NONE — Texas has no real estate transfer tax.** Recording fees only, statutory (Loc. Gov. Code ch. 118): ~$25 first page + $4/page (Tarrant confirmed) |
| Deed index | County-clerk `publicsearch.us` portals: Dallas 1964+ (pre-1964 on Kofile), Tarrant with free registered watermarked downloads; copies $1/page + $5 certification |
| Foreclosure | Nonjudicial; **first-Tuesday** sales; notices posted with County Clerk 21 days prior (Dallas posts notice PDFs on clerk site) |
| Evictions | JP (justice of the peace) courts; **North Texas Eviction Project** covers Dallas/Collin/Denton/Tarrant filings |
| Rent regulation | None (TX preemption); no rental registration regimes to mine |
| FY2026 2BR FMR | Dallas HMFA **$1,931** (aggregator-quoted). **Fort Worth-Arlington HMFA metro 2BR: NOT FOUND** — only SAFMR city averages surfaced (see rent_demand) |

## Dallas County + DCAD (core — all categories)

### 1. parcel_assessment
- **DCAD Data Products** — `https://www.dallascad.org/dataproducts.aspx` — downloadable ZIP archives: current ownership, certified appraisal files, appraisal roll files, BPP detail, ARB data, notice data; field-layout docs included in each archive; 2026 real + BPP rolls certified 2026-07-24. GIS parcel geometry guide `https://wwur.dallascad.org/PARCEL_GEOM.pdf`; GIS help `https://maps.dcad.org/prd/dpm/help.htm`.
- **No sale prices**: DCAD files carry values/ownership/characteristics only (non-disclosure).

### 2. recorder_deeds
- **Official Public Record Search** — `https://dallas.tx.publicsearch.us/` — deeds, deeds of trust, liens; grantor/grantee, doc type, number; 1964→present; pre-1964 (1846–1963) on Kofile `https://kofilequicklinks.com/dallas/`; Recording Division `https://www.dallascounty.org/government/county-clerk/recording/`.
- **No transfer tax**; statutory recording fees (~$25 first page). Deed-of-trust amounts in the index are the loan-size proxy where sale price is hidden.

### 5. tax_rates
- **Dallas County tax rates + Truth in Taxation** — `https://www.dallascounty.org/departments/tax/tax-rates.php`, `https://www.dallascounty.org/departments/tax/truth-taxation.php`, past rates page — SB2-mandated per-entity rate publication; county 2025 rate $0.216/$100; per-property jurisdiction lookup on the TnT site.

### 6/7. permits_co & violations_liens (City of Dallas)
- **Dallas OpenData (Socrata)** — Building Permits `https://www.dallasopendata.com/Services/Building-Permits/e7gq-4sah` — **historical, frozen Aug 2020; active tracking migrated to Accela Citizen Access** (flag!). Certificates of Occupancy `https://www.dallasopendata.com/Services/Building-Inspection-Certificates-Of-Occupancy/9qet-qt9e`. Code Violations (archive) `https://www.dallasopendata.com/Archive/Code-Violations/x9pz-kdq9` + code-compliance tag browse `https://www.dallasopendata.com/browse?tags=code+compliance` (311-based service-request datasets by fiscal year).

### 3. zoning (City of Dallas)
- **Public Zoning Web map** — `https://developmentweb.dallascityhall.com/publiczoningweb/`; zoning resources `https://dallascityhall.com/departments/pnv/Pages/Zoning-Resources.aspx`; Dallas GIS services open data `https://gisservices-dallasgis.opendata.arcgis.com/maps/647e8235fe18438d93012b58d910497c` (Dallas Zoning). Map Hub covers zoning + overlays (historic, SUPs, deed restrictions), ForwardDallas placetypes.

### 8. sheriff_foreclosure
- **County Clerk foreclosure notices** — `https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php` — notices posted 21 days before first-Tuesday sales (George Allen Courts Building, 600 Commerce St, 10am start); notice PDFs published on the clerk site (monthly folders seen in results); copies $1/page.
- **Tax foreclosure resales** — Public Works property division `https://www.dallascounty.org/departments/pubworks/property-division.php` (struck-off/resale properties).

### 9. evictions_rent_reg
- **North Texas Eviction Project (CPAL)** — `https://northtexasevictions.org/` (+ `https://childpovertyactionlab.org/inside-the-lab/north-texas-eviction-project`) — filings for Dallas (2017+), Collin/Denton (2019+), Tarrant (2020+); geography rollups, ~40k Dallas JP filings/yr; filings only (no outcomes), no party names.
- **JP court eviction pages** — e.g. `https://www.dallascounty.org/government/jpcourts/1-2/evictions.php` (per-precinct).
- No rent control/registration (TX preemption) — rule text in `data/research/regulatory_rules.json`.

### 10. incentive_zones
- **TIF/TIRZ districts** — Dallas Office of Economic Development `https://www.dallasecodev.org/358/Tax-Increment-Financing-Districts` — 18 active TIF districts, per-district pages (Downtown Connection, Design District, City Center, Skillman Corridor, Dallas TOD, Cypress Waters, …); county TIF annual report PDF on dallascounty.org.
- **Opportunity Zones** — `https://www.dallasecodev.org/546/Opportunity-Zones` — 15 OZ 1.0 tracts through 2028; OZ 2.0 nominations 2026 (175 eligible tracts), effective 2027; **Chapter 380/381 agreements** — city incentive policy PDF (`https://www.dallasecodev.org/DocumentCenter/View/4082/Incentive-Policy-Document`); Dallas County publishes its Chapter 381 agreement database per Loc. Gov. Code 381.005(c) (county econ-dev page `https://www.dallascounty.org/departments/plandev/economic.php`).

## Tarrant County + TAD + Fort Worth/Arlington (core — all categories)

### 1. parcel_assessment
- **TAD data downloads** — `https://www.tad.org/resources/data-downloads.php` — certified appraisal-roll reports (entity summaries, totals, state-use code, exemptions), historic data, mineral rolls (PDF/TXT + record layouts); **TAD Open Data Portal** `https://gis-tad.opendata.arcgis.com/` — parcels, cities, economic units, PIDs, MUDs, subdivisions.
- Same TX facts: 100% market value, annual reappraisal, no public sale prices.

### 2. recorder_deeds
- **Official Record Search** — `https://tarrant.tx.publicsearch.us/` — deeds, deeds of trust, liens, plats; **free watermarked downloads with account registration**; copies $1/page + $5 certification; real-estate records hub `https://www.tarrantcountytx.gov/en/county-clerk/real-estate-records.html`. Recording $25 first page + $4/page.

### 3. zoning (Fort Worth)
- **Fort Worth GIS (mapit)** — `https://mapit.fortworthtexas.gov/` — zipped shapefiles free incl. zoning; Land Use Plan viewer (arcgis webappviewer id 653d…); city GIS dept page `https://www.fortworthtexas.gov/departments/it-solutions/gis`.

### 5. tax_rates
- **Tarrant Truth in Taxation** — `https://www.tarranttaxinfo.com/` (+ county TnT summary `https://www.tarrantcountytx.gov/en/tax/property-tax/truth-in-taxation-summary.html`, TAD `https://www.tad.org/truth-in-taxation`) — current + 4 prior years for all taxing units; updated Aug–Sep as rates adopt.

### 6. permits_co (Fort Worth)
- **CFW Development Permits Table** — `https://data.fortworthtexas.gov/datasets/cfw-development-permits-table/about` — all permits through the Development Services permit center; portal `https://data.fortworthtexas.gov/` (Socrata/ArcGIS; CSV, Excel, JSON); Accela front end `https://aca-prod.accela.com/CFW/Default.aspx`; CO data on the portal per launch coverage.

### 7. violations_liens (Fort Worth)
- **CFW Code Violations Table/Points** — `https://data.fortworthtexas.gov/datasets/cfw-code-violations-table` (+ `cfw-code-violations-points`, Code Violations App) — violation cases (not complaints) from Code Compliance; CSV/GeoJSON/REST.

### 8. sheriff_foreclosure
- **Tarrant County Clerk foreclosures** — `https://www.tarrantcountytx.gov/en/county-clerk/real-estate-records/foreclosures.html` — first-Tuesday notice postings, same 21-day statutory posting.

### 9. evictions
- **Tarrant JP eviction cases** — `https://www.tarrantcountytx.gov/en/justice-of-the-peace-courts/justice-4/civil-cases/eviction-cases.html` (per-precinct); NTEP covers Tarrant filings from 2020.

## Collin County (secondary — 1, 2, 3, 12)

- **Collin CAD open data** — `https://collincad.org/open-data-portal/` — appraisal data exports (Excel code-description workbooks) + **Texas Open Data Portal mirrors**: `https://data.texas.gov/dataset/Collin-CAD-Appraisal-Data-2026/5tkr-3759` (also 2024/2025/preliminary + appraisal notices); GIS shapefile archives `https://collincad.org/category/gis-downloads/`.
- Deeds: Collin County Clerk (publicsearch-style portal not surfaced — unverified); zoning is municipal (Plano/McKinney/Frisco), not enumerated at secondary tier.

## Denton County (secondary — 1, 2, 3, 12)

- **Denton CAD** — data extracts `https://www.dentoncad.com/data-extracts/`; GIS `https://gis.dentoncad.com/` (+ `https://www.dentoncad.com/gis/`).
- **Denton County GIS hub parcels** — `https://data-dentoncounty.hub.arcgis.com/datasets/DentonCounty::parcels/about`; county GIS dept `https://www.dentoncounty.gov/1147/Geographic-Information-Systems-GIS`.
- Deeds: Denton County Clerk (portal not surfaced — unverified).

## Metro/state-level

### 11. environmental
- **TCEQ Central Registry** — `https://www.tceq.texas.gov/permitting/central_registry` — regulated entities search; **LPST cleanups** `https://www.tceq.texas.gov/remediation/pst_rp` (leaking petroleum storage tanks; statuses/priority); LPST dataset on data.texas.gov (catalog.data.gov entry seen); waste-management & PST datasets `https://www.tceq.texas.gov/agency/data/enf_clean_data.html`. State superfund/VCP lists via same TCEQ data pages.
- **FEMA NFHL** — county downloads via MSC (`https://msc.fema.gov/portal/resources/productsandtools`).

### 12. gis_open_data
- **NCTCOG Open Data Hub** — `https://data-nctcoggis.hub.arcgis.com/` (+ `https://data-nctcoggis.opendata.arcgis.com/`) — regional layers, orthos/LiDAR via Spatial Data Cooperative Program; CSV/KML/shapefile/GeoJSON + GeoServices/WMS/WFS.

### 4. broker_comps
- **Marcus & Millichap DFW multifamily** — `https://www.marcusmillichap.com/research/market-report/dallas-fort-worth/dallas-fort-worth-multifamily-market-report` (+ 2026 investment forecast URL); **CBRE DFW 2026 outlook** `https://www.cbre.com/insights/reports/dallas-fort-worth-2026-u-s-real-estate-market-outlook`; **Newmark 1Q26 DFW multifamily PDF** `https://nmrk.imgix.net/uploads/fields/pdf-market-reports/1Q26-DFW-Multifamily-Market-Report.pdf` (direct PDF, no wall).
- Broker reports carry outsized weight here: with sale prices non-public, MLS/broker-derived comps + deed-of-trust amounts are the only price evidence.

### 13. rent_demand
- **Dallas, TX HMFA FY2026**: 2BR **$1,931** (0BR $1,582 / 1BR $1,648 / 3BR $2,431 / 4BR $3,091) — aggregator-quoted (gerarent.com `https://gerarent.com/us-rents/dallas-tx-hud-metro-fmr-area`, rentlimits.com `https://rentlimits.com/areas/4808599999`); HUD-attributed pages seen (FY2026 schedule PDF, Federal Register FY2026 notices) did not display the value in snippets — pending primary confirmation.
- **Fort Worth-Arlington, TX HMFA FY2026 2BR: NOT FOUND.** Two dedicated searches (HMFA by name; "Fort Worth-Arlington" quoted + FY2026) returned only FY2025 ($1,705, rentdata.org `https://www.rentdata.org/fort-worth-arlington-tx-hud-metro-fmr-area/2025`) and FY2026 SAFMR **city averages** (~$1,929 Fort Worth / ~$1,923 Arlington, per flatfeelandlord.com aggregation of HUD SAFMRs) — a city-average of ZIP SAFMRs is NOT the metro FMR; recorded as **unverified**, primary pull from the FY2026 FMR Schedule PDF queued. DFW is a mandatory SAFMR area (ZIP 2BR ~$1,100–$1,900+), so ZIP-level SAFMR is the operative screening number anyway.
