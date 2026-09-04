# Seattle WA — public-data source registry

Coverage per `COVERAGE.md`: **Core** = King County (Seattle, Bellevue, Renton, Kent,
Federal Way, Redmond, Kirkland) + City of Seattle systems. **Secondary** = Snohomish
County (Everett, Lynnwood). Pierce County (Tacoma) is out of scope (separate HMFA).

All URLs recorded as they appeared in search results (2026-08-25); container cannot
fetch portals directly, so `search-confirmed` means the URL surfaced verbatim in a
search listing, not that the page was opened.

## Key facts

| Fact | Value |
|---|---|
| Assessment ratio | 100% of true and fair (market) value, RCW 84.40.030 — statewide |
| Reassessment cycle | Annual revaluation (both counties); King Co. 6-year physical-inspection cycle, Snohomish 1/6 of parcels physically inspected per year |
| Transfer tax | WA REET, graduated statewide: 1.10% ≤ $525k / 1.28% to $1.525M / 2.75% to $3.025M / 3.00% above (marginal brackets, seller pays) + local REET 0.50% in King and Snohomish |
| Recording fees | $303.50 first page + $1/page (post-2024 HB 1277 surcharge), King Co. |
| Deed images online | King: index 1976+ (Landmark), images Aug 1991+. Snohomish: most docs since Jul 1976; account required for online search from 2026-03-02 |
| Sales data | King County publishes a dedicated Real Property Sales extract (RPSALE_EXTR) — bulk, weekly — the best free comps feed in the western markets |
| Foreclosure | Nonjudicial deed-of-trust state (RCW 61.24); county tax foreclosure auction annually in September (online) |
| Rent regulation | Statewide cap: 2025 HB 1217 (lesser of 7%+CPI or 10%; 9.683% for 2026); Seattle RRIO rental registration; no separate Seattle rent cap |
| FY2026 2BR FMR | **Still unverified** — aggregators quote $2,501, which exactly matches the previously-flagged "average market rent" conflation; no HUD-attributed page displayed the figure in search results. See rent_demand. |

## King County (core — all categories)

### 1. parcel_assessment
- **Assessments Data Download** — `https://info.kingcounty.gov/assessor/datadownload/default.aspx` — authoritative bulk extracts incl. `RPSALE_EXTR` (real property sales, one record per property per sale, keyed excise-tax-number + major + minor), `PARCEL_EXTR`, `RPACCT_EXTR` (tax accounts), `RESBLDG_EXTR`. GIS-side copies updated weekly via GIS Data Catalog (`https://www5.kingcounty.gov/sdc/Metadata.aspx?Layer=rpsale_extr`), which the Assessor labels non-authoritative.
- **eReal Property search** — listed at `https://data.kingcounty.gov/Property-Assessments/eReal-Property-Search/4zym-vfd2` — per-parcel lookup by address / parcel / complex name.
- **Localscape tax-transparency dashboard** — `https://localscape.property/` ("King County WA - Analytics") — sales patterns, values, permits, census by area.
- Assessment: 100% FMV as of Jan 1 (RCW 84.40.030), annual revaluation with 6-year physical inspection cycle; commercial revalue area reports published per assessment roll (e.g. apartments specialty area 100 PDF seen for 2024/2025 rolls).

### 2. recorder_deeds
- **Recorder's Office online records search (Landmark)** — `https://kingcounty.gov/en/dept/executive-services/certificates-permits-licenses/records-licensing/recorders-office/records-search` — index of all recorded documents 1976→present, images for most documents Aug 1, 1991→present; search by name, parcel, section-township-range. Pre-1991 on microfilm at King County Archives.
- **REET rates** — `https://dor.wa.gov/taxes-rates/other-taxes/real-estate-excise-tax` (WA DOR) and MRSC explainer `https://mrsc.org/explore-topics/finance/sales-excise-taxes/real-estate-excise-tax`. Graduated state brackets above + 0.50% King County local. REET affidavits generate the excise numbers that key the sales extract.
- Recording fee $303.50 first page (+$1/page, $50 non-standard) per Recorder payment page `https://kingcounty.gov/en/dept/executive-services/certificates-permits-licenses/records-licensing/recorders-office/payment-information`; statutory base RCW 36.18.010.

### 3. zoning
- King County jurisdiction zoning is city-by-city; Seattle handled below. County GIS hub carries county zoning layers (see gis_open_data). Parcel Viewer (`https://gismaps.kingcounty.gov/parcelviewer2/`) links each parcel to Districts & Development Conditions report.

### 5. tax_rates
- **Levy rate reports** — `https://kingcounty.gov/en/dept/assessor/buildings-and-property/property-value-and-information/reports/levy-rate-reports` — annual codes & levies PDFs (e.g. `taxrate26.pdf` collective rates by city/school district; `LatestRateBook.pdf` full district rate book). Seattle levy rate 9.19418 (2025) → 9.90845 (2026).

### 8. sheriff_foreclosure
- **Property tax foreclosures (Treasury)** — `https://kingcounty.gov/en/dept/executive-services/buildings-property/treasury-operations/tax-foreclosures` with auction pages under `/tax-foreclosures/auctions` and `/tax-foreclosures/tax-title-properties`. Three-years-delinquent parcels; one auction/year in September, conducted online (RealAuction; snippet text cited king.wa.realforeclose.com — URL itself not seen in a result listing, treat as unverified); unsold parcels become tax title, resold via Bid4Assets.
- Nonjudicial trustee sales: notice of sale recorded with county ≥90 days pre-sale under RCW 61.24.040 (`https://app.leg.wa.gov/rcw/default.aspx?cite=61.24.040`); no county-run aggregation of trustee sale notices was found — notices live in the recorder index (search doc type).

### 9. evictions_rent_reg
- **Unlawful detainers — King County Superior Court** — `https://kingcounty.gov/en/court/superior-court/courts-jails-legal-system/ex-parte-probate-unlawful-detainer/unlawful-detainers`. Eviction (UD) cases are Superior Court civil cases.
- Statewide case access: WA Courts Odyssey Portal (free basic case info) + JIS-Link subscription for statewide dockets — named in search results but no direct URL surfaced; **unverified** (searched "Washington courts eviction unlawful detainer odyssey"; only county pages and third-party aggregators returned).
- Rule text (HB 1217 cap etc.) lives in `data/research/regulatory_rules.json`, not here.

### 10. incentive_zones
- **WA Commerce Opportunity Zones** — `https://www.commerce.wa.gov/opportunity-zones/` — 139 current OZs statewide; OZ 2.0 (99 tracts) designations effective Jan 1 2027; Commerce maintains the OZ GIS map.

### 11. environmental
- **Ecology Cleanup and Tank Search** — `https://apps.ecology.wa.gov/cleanupsearch/` — text search of all cleanup sites + USTs, filter by county/contaminant/status/VCP.
- **Site register lists & data** — `https://ecology.wa.gov/regulations-permits/guidance-technical-assistance/site-register-lists-and-data` — Contaminated Sites List, No Further Action list, biweekly Site Register.
- **FEMA NFHL** — MSC products & tools `https://msc.fema.gov/portal/resources/productsandtools`; NFHL viewer `https://hazards-fema.maps.arcgis.com/apps/webappviewer/index.html?id=8b0adb51996444d4879338b5529aa9cd`; county/state GIS downloads via "Search All Products".

### 12. gis_open_data
- **King County GIS Open Data** — `https://gis-kingcounty.opendata.arcgis.com/` — hundreds of layers; parcels (`.../datasets/king-county-parcels-parcel-area`), parcels-with-address+property-info; CSV/KML/Shapefile/GeoJSON. Legacy FTP portal `https://www5.kingcounty.gov/gisdataportal/Default.aspx`.
- **data.kingcounty.gov** Socrata portal — `https://data.kingcounty.gov/` (assessor apps are cataloged here too).

## City of Seattle (core)

### 3. zoning
- **SDCI zoning code page** — `https://www.seattle.gov/sdci/codes/codes-we-enforce-(a-z)/zoning`.
- **Current Land Use Zoning Detail layer** — `https://data-seattlecitygis.opendata.arcgis.com/datasets/SeattleCityGIS::current-land-use-zoning-detail/about`; REST service `https://gisdata.seattle.gov/server/rest/services/COS/COS_PlanningAndLandUse/MapServer/5` ("Zoning - Detailed"); generalized layer symbolized in 26 zoning groups. SDCI Property Information Map is the interactive front end (zoning map books retired Sept 2025).

### 6. permits_co
- **Issued Building Permits (Socrata)** — `https://data.seattle.gov/Built-Environment/Issued-Building-Permits/8tqq-u7ib` — all issued/in-progress permits, ~2.1k-row view seen updated Jul 2026; OData/API access; companion dataset 76t5-zqzr with Socrata API foundry docs (`https://dev.socrata.com/foundry/data.seattle.gov/76t5-zqzr`).
- **Seattle Services Portal (Accela)** — `https://cosaccela.seattle.gov/` — permit records 2005→present, complaints, licenses; new Permit & Site History Research Tool (live Jul 2025) reaches older systems and plan documents.

### 7. violations_liens
- **Code Complaints and Violations (Socrata)** — `https://data.seattle.gov/Community/Code-Complaints-and-Violations/8s4s-3hc9` — all SDCI code-compliance complaints/violations (tenant/housing, land use, no-permit work, vacant buildings); by-year rollup on data.gov.

### 9. evictions_rent_reg
- **RRIO (rental registration)** — program `https://www.seattle.gov/construction-and-inspections/codes/licensing-and-registration/rental-registration-and-inspection-ordinance`; registered-property lookup `https://services.seattle.gov/portal/Cap/CapHome.aspx?module=RRIO&TabName=Rental+Registration`; bulk dataset **Rental Property Registration** `https://data.seattle.gov/Built-Environment/Rental-Property-Registration/j2xh-c7vt` (+ map view t4kk-v3ip), records back to 2014, updated Jul 2026. All Seattle rentals must register; inspections every 5–10 years.

### 10. incentive_zones
- **MFTE** — `https://www.seattle.gov/housing/incentives/MFTE.htm` (Office of Housing) — 12-year residential tax exemption for 20–25% income/rent-restricted units; participating-building map via OH; unofficial finder mfte-seattle.com.
- **Opportunity Zones (city dataset)** — `https://data.seattle.gov/dataset/Opportunity-Zones/dyfi-nfvj`; Seattle tracts 86, 87, 90, 91, 92, 93, 94, 110.01, 111.01, 118.

### 12. gis_open_data
- **Seattle GeoData (ArcGIS hub)** — `https://data-seattlecitygis.opendata.arcgis.com/` (zoning, ECAs, urban villages, overlays) and **data.seattle.gov** Socrata portal for tabular city data.

## Snohomish County (secondary — categories 1, 2, 3, 12)

### 1. parcel_assessment
- **Assessor** — `https://www.snohomishcountywa.gov/assessor`; **SCOPI** interactive parcel/assessment map (`https://snohomishcountywa.gov/5414/Interactive-Map-SCOPI`); property-tax lookup at `https://www.snoco.org/proptax/` (address or parcel). Annual revaluation since 2004 (2005 tax year); ~1/6 of residential parcels (≈45k) physically inspected each year.

### 2. recorder_deeds
- **Auditor recorded documents search** — `https://snohomishcountywa.gov/5840/Search-Recorded-Documents`; Landmark front end `https://www.snoco.org/RecordedDocuments/`. Most documents since Jul 1976 online; **account required from Mar 2, 2026**. Local REET 0.50% on top of state graduated rates.

### 3. zoning
- **Zoning Map Viewer** — `https://gisapp.snoco.org/web/?app=b2be7e43ee0f4e448d73e9fd6b880834` (zoning, UGAs, lot status); PDS GIS maps index `https://snohomishcountywa.gov/1279/PDS-GIS-Maps-Information` (iGallery atlas).

### 12. gis_open_data
- **Snohomish County Open Data Portal** — `https://snohomish-county-open-data-portal-snoco-gis.hub.arcgis.com/` — assessor spatial+tabular data free to download; `Parcels`, `All Parcels (Past and Present)`, centroids; most datasets updated 3×/week; CSV/KML/shapefile/FGDB + REST/GeoJSON.

## Metro-level

### 4. broker_comps
- **Kidder Mathews Seattle Multifamily** — `https://kidder.com/market-reports/seattle-multifamily-market-report/` (quarterly, free; Q2 2026 avg cap 5.7%); PNW reports index `https://kidder.com/seattle-market-reports/` (email registration for alerts).
- **CBRE Puget Sound Multifamily Figures** — `https://www.cbre.com/insights/figures/puget-sound-multifamily-figures-report-q3-2025` (Q3 2025: 95.5% occupancy, $2,247/unit avg rent).
- Best free transaction evidence remains King County's own RPSALE_EXTR (category 1) — a structural advantage vs. non-disclosure markets.

### 13. rent_demand
- **HUD FMR area**: Seattle-Bellevue, WA HMFA (King + Snohomish; METRO42660MM7600); mandatory SAFMR area — ZIP-tier 2BR roughly $1,700–$3,000.
- **FY2026 2BR FMR: unverified.** Searched huduser-restricted and open queries; HUD-attributed hits were the FY2026 FMR Schedule PDF (`https://www.huduser.gov/portal/datasets/fmr/fmr2026/FY2026_FMR_Schedule.pdf`), the FMR documentation system (`https://www.huduser.gov/portal/datasets/fmr/fmrs/FY2026_code/2026summary.odn`), and the datasets page (`https://www.huduser.gov/portal/datasets/fmr.html`) — none displayed the Seattle number in the snippet. Aggregators (fairmarketrentmap.com, search-summary text) quote **$2,501**, which is exactly the value the repo already flagged as the "Seattle average market rent" conflation (and vs FY2025's $2,671 it would be a −6.4% metro drop) — NOT accepted without a HUD-attributed page. Primary pull from the FY2026 schedule PDF / KCHA-SHA payment standards (`https://www.kcha.org/housing/vouchers/standards`) still queued.
- **Rent indexes**: Zillow ZORI downloads `https://www.zillow.com/research/data/` (metro/county/city/ZIP, monthly, free CSV); Apartment List Seattle rent report `https://www.apartmentlist.com/rent-report/wa/seattle` (city median $2,083, downloads page available).
