# Atlanta GA — public-data source registry

Coverage per `COVERAGE.md`: **Core** = Fulton County (Atlanta, Sandy Springs, Roswell,
Alpharetta, East Point, College Park) + City of Atlanta, DeKalb County (Decatur,
Brookhaven, part of Atlanta). **Secondary** = Cobb, Gwinnett, Clayton. The other ~24
MSA counties are out of scope.

URLs recorded as they appeared in search results (2026-08-25); `search-confirmed`
means the URL surfaced verbatim in a search listing, not that the page was opened.

## Key facts

| Fact | Value |
|---|---|
| Assessment ratio | **40% of fair market value** statewide (O.C.G.A. 48-5-7) — confirmed |
| Reassessment cycle | Annual valuation by county Boards of Tax Assessors; annual assessment notices; HB 581 (2024) adds a floating homestead value cap — check per-county opt-outs in production |
| Transfer tax | GA transfer tax $1.00 for first $1,000 + $0.10 per additional $100 (≈0.10%), on deeds; **separate intangibles recording tax** $1.50/$500 ($3/$1,000) on long-term notes — long-term threshold now 62 months (HB 586, eff. 2025-07-01) |
| Deed index | **GSCCCA statewide index** — all 159 counties, one system; premium tiers exist but subscription pricing did not surface in search results (unverified) |
| Sales data | GA is a disclosure state; PT-61 transfer declarations feed GSCCCA premium search; assessor rolls carry sales |
| Foreclosure | **Nonjudicial**, first-Tuesday courthouse-steps sales; 4 consecutive weeks of legal-organ newspaper ads; aggregated at georgiapublicnotice.com |
| Evictions | Magistrate court dispossessory filings; ARC/GaTech/Atlanta Fed/Eviction Lab regional tracker covers Fulton, DeKalb, Cobb, Gwinnett, Clayton |
| Incentives | Federal OZ (27 in Atlanta) + GA state OZ job tax credits (separate program) + TADs (BeltLine TAD through 2030, Invest Atlanta administers) |
| FY2026 2BR FMR | Not pinned — FY2025 was $1,830 (rentdata.org); FY2026 metro figure did not surface (see rent_demand) |

## Fulton County (core — all categories)

### 1. parcel_assessment
- **Board of Assessors search (qPublic)** — `https://qpublic.schneidercorp.com/Application.aspx?App=FultonCountyGA&Layer=Parcels&PageType=Search` — values, characteristics, exemptions; Assessors office at 141 Pryor St SW (fultonassessor.org referenced in snippets — bare domain, not a listed URL).
- **Fulton GIS Open Data** — `https://gisdata.fultoncountyga.gov/` — Current Parcels (`https://gisdata.fultoncountyga.gov/maps/COSS::current-parcels/explore`), Tax Parcels datasets (most-recent tax year); CSV/KML/shapefile/GeoJSON + GeoServices/WMS/WFS.
- 40% assessment ratio, annual notices; appeal window from annual notice.

### 2. recorder_deeds
- **Clerk of Superior Court — Real Estate Recording Division** — `https://www.fultonclerk.org/370/Recording-Division` (+ Deeds & Records `https://www.fultonclerk.org/143/Deeds-and-Records`) — chain of title, ~385k documents/yr; eRecording via approved vendors/GSCCCA (2–3 business days); deed room computer lab $5 / 4 hours.
- **GSCCCA statewide index** (see state-level section) is the practical search interface.
- Transfer tax + intangibles tax as in Key facts.

### 5. tax_rates
- **2025 millage** — county general fund held at 8.87 mills (`https://www.fultoncountyga.gov/News/2025/08/06/Fulton-Holds-Millage-Rate-at-8-87-mills-for-2025`); Fulton schools 17.08 advertised; city of Atlanta adds its own. Combined ≈ county + school + city mills.

### 8. sheriff_foreclosure
- **First-Tuesday nonjudicial sales** — Fulton courthouse steps, 136 Pryor St, 10am–4pm; ads 4 consecutive weeks pre-sale (Fulton legal organ); clerk FAQ `https://www.fultonclerk.org/FAQ.aspx?QID=155`.
- **GeorgiaPublicNotice.com** — `https://www.georgiapublicnotice.com/` — statewide searchable legal-notice aggregation (foreclosure ads), free.
- **Tax sales** — Tax Commissioner fi. fa. process, first-Tuesday sales, 12-month redemption + 20% premium; Fulton outsources some delinquent collection to investors (WABE investigation noted).

### 9. evictions_rent_reg
- **Magistrate court dispossessory filings** — served/executed by Marshal (`https://www.fultoncountyga.gov/inside-fulton-county/fulton-county-departments/marshal/evictions`); regional tracker under metro-level.
- No rent control or rental registration in GA (state preemption) — rule text in `data/research/regulatory_rules.json`.

## City of Atlanta (core)

### 3. zoning
- **Zoning Reform / ATL Zoning 2.0** — `https://www.atlantaga.gov/government/departments/city-planning/projects-initiatives/zoning-reform` + `https://atlzoning.com/` — full rewrite; complete draft released Dec 2025, comment through Apr 8 2026; will replace Part 16 with a Unified Development Code. Current code: Municode Part 16 (`https://library.municode.com/ga/atlanta/codes/code_of_ordinances?nodeId=PTIIICOORANDECO_PT16ZO`).
- **DCP Maps & GIS** — `https://www.atlantaga.gov/government/departments/city-planning/maps-and-gis`; GIS portal `https://gis.atlantaga.gov/?page=OPEN-DATA-HUB` (zoning, property info, planning viewer, NPU maps).

### 6. permits_co
- **All Building Permits 2019-2024 (Accela extract)** — `https://dpcd-coaplangis.opendata.arcgis.com/datasets/655f985f43cc40b4bf2ab7bc73d2169b` (mirrored on ARC hub) — all statuses with zoning/land-use at application + lat/lon.
- **New Building Permit Tracker** — `https://gis.atlantaga.gov/buildingpermittracker/?page=Search-All-Permits` — live permit search.

### 7. violations_liens
- **Accela Citizen Access — enforcement search** — `https://aca-prod.accela.com/ATLANTA_GA/Cap/CapHome.aspx?module=Enforcement&TabName=Enforcement` — code-enforcement cases by address/parcel (improved portal since Mar 2023); complaint intake via ATL311.

### 10. incentive_zones
- **TADs (tax allocation districts)** — Invest Atlanta `https://www.investatlanta.com/about-us/tax-allocation-districts` + TAD financing pages; **BeltLine TAD** `https://beltline.org/learn/progress-planning/research-reports/funding/tax-allocation-district/` (created 2005, increment pledged through 2030); city TAD plan page `https://www.atlantaga.gov/government/departments/city-planning/plans-studies/citywide-plans/tax-allocation-district-tad`.
- **Federal OZs** — 27 in Atlanta; GA DCA `https://dca.georgia.gov/financing-tools/incentives/federal-opportunity-zones`; Invest Atlanta OZ tax-credit pages (state OZ job-credit program is separate from federal OZ).

## DeKalb County (core — all categories)

- **Property Appraisal** — `https://propertyappraisal.dekalbcountyga.gov/` + qPublic (`https://qpublic.schneidercorp.com/Application.aspx?App=DekalbCountyGA&Layer=Parcels&PageType=Search`).
- **GIS Hub** — `https://dcgis-dekalbgis.hub.arcgis.com/` — parcels, ownership, integrated with appraisal/tax/permitting/code enforcement; mapping team mappingteam@dekalbcountyga.gov.
- **Tax rates** — `https://dekalbtax.org/form-doc/millage-rates-2025/` — county/school/state/city/special-district millage with totals.
- Deeds: DeKalb Clerk of Superior Court records; search via GSCCCA statewide index (no county-specific portal surfaced — GSCCCA is the canonical path).
- Foreclosure/evictions: same first-Tuesday and magistrate-court patterns as Fulton; DeKalb marshal backlog (600+ setouts) noted in tracker coverage.

## State-level systems (research once)

### 2. recorder_deeds — GSCCCA
- **Georgia Superior Court Clerks' Cooperative Authority** — real estate index `https://search.gsccca.org/RealEstate/`; deed index `https://search.gsccca.org/RealEstate/deedindex.asp`; learn pages `https://www.gsccca.org/learn/search-systems/real-estate-index` and premium search `https://www.gsccca.org/learn/premium-search/` (PT-61 transfer-declaration search); service descriptions `https://account.gsccca.org/ServiceDescriptions.asp`.
- 24/7 statewide deed/lien/plat dockets and documents, all 159 counties. **Subscription pricing: not found in search results** — the pricing page content did not surface; marked unverified (searched "GSCCCA real estate deed index search subscription cost").

### 11. environmental
- **GA EPD Hazardous Site Inventory (HSI)** — `https://epd.georgia.gov/about-us/land-protection-branch/hazardous-waste/hazardous-site-inventory` — published each July; formats: alphabetical PDF, **HSI table XLS**, per-site PDF summaries, interactive map; annual intro PDFs (e.g. `https://epd.georgia.gov/document/pdf/2025-hsi-introduction/download`).
- **FEMA NFHL** — county downloads via MSC (`https://msc.fema.gov/portal/resources/productsandtools`).

## Cobb County (secondary — 1, 2, 3, 12)

- **Assessor (qPublic)** — `https://qpublic.schneidercorp.com/Application.aspx?AppID=1051&LayerID=23951&PageTypeID=2&PageID=9967`; values as of Jan 1 annually.
- **GIS Hub** — `https://geo-cobbcountyga.hub.arcgis.com/` — zoning/parcel layers viewable; **GIS data downloads are purchased** per the hub's Get Data page (`https://geo-cobbcountyga.hub.arcgis.com/pages/get-data`) — cost quirk.
- Deeds: Cobb Clerk of Superior Court via GSCCCA statewide index.

## Gwinnett County (secondary — 1, 2, 3, 12)

- **GIS Data Browser** — `https://www.gwinnettcounty.com/government/departments/information-technology-services/geographic-systems/gis-browser` — parcels (245k+), zoning districts, aerials; linked to ownership DB with deed history incl. most recent sale date and price.
- **Property Ownership Database** — `https://www.gwinnettcounty.com/government/departments/county-administrator/assessor/property-ownership-database` — ownership/value files updated quarterly.
- **qPublic search** — `https://qpublic.schneidercorp.com/Application.aspx?AppID=1282&LayerID=43872&PageTypeID=2&PageID=16058`.
- Deeds via GSCCCA.

## Clayton County (secondary — 1, 2, 3, 12)

- **Tax Assessor property search** — `https://www.claytoncountyga.gov/government/tax-assessor/property-search-information/`; public access portal `https://publicaccess.claytoncountyga.gov/` (real + personal property); Beacon search `https://beacon.schneidercorp.com/Application.aspx?AppID=1234&LayerID=39180&PageTypeID=2&PageID=14578`.
- Deeds via GSCCCA; zoning/GIS via county site (no dedicated hub surfaced — thinnest of the secondary counties).

## Metro-level

### 4. broker_comps
- **CBRE Atlanta 2026 Outlook** — `https://www.cbre.com/insights/reports/atlanta-2026-u-s-real-estate-market-outlook`.
- **Marcus & Millichap Atlanta multifamily** — 2Q 2026 report coverage (`https://yieldpro.com/2026/07/sherwood-glen-apartments-ga`); 2026 forecast: deliveries −43–50% YoY, vacancy →5.2%, avg rent +4.1% to ~$1,650.
- GA disclosure state: PT-61/GSCCCA + assessor sales are primary transaction evidence.

### 9. evictions (regional tracker)
- **Atlanta Region Eviction Tracker** — `https://metroatlhousing.org/atlanta-region-eviction-tracker/` (ARC × Georgia Tech × Atlanta Fed × Eviction Lab; property-level filings for Fulton, DeKalb, Cobb, Gwinnett, Clayton; Dallas-style geographic rollups by tract/city/hex); ARC hub doc `https://opendata.atlantaregional.com/documents/7b58db0eb59248469e9024739b6a335e`; Eviction Lab Atlanta `https://evictionlab.org/eviction-tracking/atlanta-ga/`.

### 12. gis_open_data
- **ARC Open Data & Mapping Hub** — `https://opendata.atlantaregional.com/` — regional layers (LandPro land use, census rollups, permits mirror), CSV/KML/shapefile/GeoJSON + APIs.

### 13. rent_demand
- **HUD FMR area**: Atlanta-Sandy Springs-Roswell, GA HMFA. **FY2026 2BR not pinned**: searched the HMFA by name + FY2026; only FY2025 ($1,830) and FY2024 ($1,844) surfaced via rentdata.org; HUD-attributed pages seen (datasets `https://www.huduser.gov/portal/datasets/fmr.html`, FY2026 documentation system) did not display the value — **unverified**, primary pull from the FY2026 FMR Schedule PDF queued.
- Zillow ZORI / Apartment List cover the metro (download URLs under the seattle registry's rent_demand entries).
