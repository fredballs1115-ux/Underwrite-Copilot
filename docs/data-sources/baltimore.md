# Baltimore, MD — public data source registry

Metro id: `baltimore`. CORE: Baltimore City (independent city), Baltimore County. SECONDARY: Anne Arundel, Howard, Harford, Carroll counties.
Research method: WebSearch-only (egress-blocked container). `verification: search-confirmed` = the exact URL appeared in a search result listing; `unverified` entries say exactly what's missing. The session's search budget was exhausted near the end — the specific gaps are flagged inline (mostly: secondary-county transfer-tax rates and zoning code-text URLs).

## Key facts

| Fact | Value |
|---|---|
| Assessment ratio | 100% of market value (statewide, SDAT) |
| Reassessment cycle | Triennial, statewide — one-third of properties per year; **increases phased in over 3 years, decreases immediate**. "Last reassessment year" varies by assessment group, not county |
| Assessing authority | State (SDAT), not counties — one statewide bulk dataset covers the whole metro |
| State transfer tax | 0.5% of consideration (all jurisdictions) |
| Baltimore City transaction taxes | 1.5% city transfer + $5.00/$500 recordation (=1.0%) + **yield tax on deals >$1M: +15% of recordation and +40% of transfer collected** → highest combined burden in MD (~3%+ all-in with state) |
| Baltimore County transaction taxes | 1.5% county transfer + $2.50/$500 recordation (=0.5%) + 0.5% state |
| Secondary county rates | NOT search-verified (budget exhausted) — see mdcounties.org "Section 7 — Recordation and Transfer Taxes" PDF (appeared in results) |
| Deeds | All MD counties record at circuit courts; images free via **MDLandRec.net** (registration required, no bulk index) |
| Court records | Maryland Judiciary Case Search: **CAPTCHA since 2022, anti-automation terms — manual only.** FTPR (eviction) cases without possession judgment are shielded within 60 days |
| MD oddity | **Ground rents** (esp. City rowhouses) — SDAT Ground Rent Registry, per-parcel lookup |
| High-value for app rules | Baltimore City rental **license-before-rent** + violations data (Open Baltimore) feed the app's license/violation rent rules |

---

## Maryland statewide (applies to every jurisdiction below)

### parcel_assessment
- **SDAT Real Property Data Search** — https://sdat.dat.maryland.gov/RealProperty/Pages/default.aspx
  - verification: search-confirmed · access: manual · format: HTML · update: continuous · cost: free
  - terms: per-parcel UI, no API; also the door to the per-parcel "View GroundRent Registration" link
  - difficulty: medium — manual per-parcel; use the Socrata bulk dataset for volume
- **Maryland Real Property Assessments — Hidden Property Owner Names (Socrata `ed4q-f8tm`)** — https://opendata.maryland.gov/Business-and-Economy/Maryland-Real-Property-Assessments_Hidden-Property/ed4q-f8tm
  - verification: search-confirmed (dataset id + documentation PDF both appeared) · access: api (SODA) · format: CSV/JSON · update: periodic (varies by field per docs) · cost: free
  - terms: public; owner names hidden in the public version. Fields Reference companion: https://opendata.maryland.gov/Business-and-Economy/Maryland-Real-Property-Assessments-Fields-Referenc/w8th-47fz
  - difficulty: easy — the single best bulk source for the whole metro; includes transfer/sale fields (doubles as the state sales file). Baltimore City-only cut: https://opendata.maryland.gov/Business-and-Economy/Baltimore-City-Real-Property-Assessments-Hidden-Pr/yen5-pgfx/data
- **SDAT Ground Rent Registry** — https://dat.maryland.gov/realproperty/Pages/Ground-Rent.aspx
  - verification: search-confirmed · access: manual · format: HTML · update: continuous · cost: free
  - terms: registration mandatory for residential ground leases; unregistered = uncollectible
  - difficulty: medium — per-parcel only, no confirmed bulk. Shows rent amount, due dates, leaseholder. Underwriting line item unique to MD.

### recorder_deeds
- **MDLandRec.net** (MSA/Judiciary land records, all counties) — https://mdlandrec.net
  - verification: **unverified** — service confirmed by multiple snippets (MSA guide: msa.maryland.gov/msa/refserv/pdf/md-landrecords.pdf) but the bare URL never appeared as a literal result link
  - access: manual · format: scanned images · update: continuous · cost: free w/ registration (~1hr email turnaround)
  - terms: no bulk index download; per-document image retrieval; covers deeds, mortgages, liens, releases, plats for every MD county
  - difficulty: medium — registration-gated, image-based, liber/folio-oriented search

### sheriff_foreclosure / evictions (record access)
- **Maryland Judiciary Case Search** — https://casesearch.mdcourts.gov/casesearch/
  - verification: search-confirmed · access: manual · format: HTML · update: continuous · cost: free
  - terms: **CAPTCHA added Mar 2022 explicitly to block scraping; interference prohibited (criminal/civil penalties). Treat as manual-only.**
  - difficulty: hard — CAPTCHA + terms; covers circuit-court foreclosure dockets AND District Court failure-to-pay-rent (FTPR) cases
  - notes: FTPR cases without a judgment of possession are **shielded within 60 days** — visible eviction history systematically undercounts
- **Maryland Foreclosure Notice Data by County** — https://opendata.maryland.gov/Housing/Maryland-Foreclosure-Notice-Data-by-County/w3bc-8mnv
  - verification: search-confirmed · access: api (Socrata) · format: CSV/JSON · update: periodic · cost: free
  - terms: county-level aggregates only; the underlying Foreclosure Registration System (dllr.state.md.us/ForeclosureSystems/) is explicitly confidential
  - difficulty: easy — trend signal, not parcel-level leads. Parcel-level pipeline = Case Search (manual) or Maryland Daily Record trustee-sale ads

### environmental
- **MDE Land Restoration Program (VCP/Brownfields/State Remediation) — LRP-MAP** — https://mde.maryland.gov/programs/land/marylandbrownfieldvcp/pages/mapping.aspx
  - verification: search-confirmed (GIS data page also confirmed: https://mdewin64.mde.state.md.us/lrp/Data/LRPSites.htm) · access: gis_service · format: ArcGIS layers/shapefile · update: periodic · cost: free
  - difficulty: easy · notes: state env db = **LRP**, not "MERLIN" — no evidence MERLIN is the current brownfields db name
- **FEMA National Flood Hazard Layer (NFHL)** — https://www.fema.gov/flood-maps/national-flood-hazard-layer
  - verification: search-confirmed (viewer: arcgis.com webappviewer `id=8b0adb51996444d4879338b5529aa9cd`) · access: gis_service · format: shapefile/KMZ/REST · update: as effective · cost: free
  - difficulty: easy · notes: harbor/Chesapeake waterfront exposure makes this material metro-wide

### gis_open_data
- **MD iMap — Maryland's GIS Data Catalog** — https://data.imap.maryland.gov/
  - verification: search-confirmed · access: gis_service · format: ArcGIS Hub · update: varies · cost: free
  - difficulty: easy · notes: statewide fallback for parcels/zoning-adjacent/flood layers when a county portal lacks one

---

## Baltimore City (CORE)

### 1. parcel_assessment
- **Open Baltimore — Real Property Information** — https://data.baltimorecity.gov/maps/baltimore::real-property-information-2
  - verification: search-confirmed · access: gis_service · format: CSV/GeoJSON/shapefile · update: weekly · cost: free
  - terms: Open Baltimore (City Code Subtitle 9 open-data program) · difficulty: easy
  - notes: join to SDAT `ed4q-f8tm` (or City cut `yen5-pgfx`) for assessment detail

### 2. recorder_deeds
- **City recordation/transfer taxes (Finance) + Circuit Court records via MDLandRec** — https://www.baltimorecity.gov/finance/our-work/public-info/recordation-tax
  - verification: search-confirmed (yield-tax ordinance also confirmed: https://codes.baltimorecity.gov/us/md/cities/baltimore/code/28/17.1-2) · access: manual · format: HTML + scanned images · cost: free (registration for images)
  - difficulty: medium
  - notes: **state 0.5% + city 1.5% transfer + $5.00/$500 recordation (1.0%) + yield tax >$1M (+15% of recordation, +40% of transfer; funds Affordable Housing Trust Fund)** — all figures search-confirmed

### 3. zoning
- **Baltimore City Code Article 32 — Zoning (TransForm Baltimore)** — https://codes.baltimorecity.gov/us/md/cities/baltimore/code/32
  - verification: search-confirmed (official PDF also confirmed on the city S3) · access: manual · format: HTML/PDF · update: as amended · cost: free · difficulty: easy
  - notes: current code = TransForm (Ord. 16-581, eff. 2017-06-05). Interactive lookup: CityView map + Planning quick guide (planning.baltimorecity.gov/zoning-code-quick-guide, confirmed); DHCD **CoDeMap** overlays housing data incl. vacants (named in results; URL not shown — unverified)

### 5. tax_rates
- **Baltimore City Tax Rates (BBMR)** — https://www.baltimorecity.gov/bbmr/city-tax-rates
  - verification: search-confirmed · access: manual · format: HTML · update: annual · cost: free · difficulty: easy
  - notes: **FY2026 real property rate $2.248/$100** (search-confirmed) — ~2x surrounding counties; mayoral rate-reduction strategy published, so watch for drift

### 6. permits_co
- **Open Baltimore — Housing & Building Permits 2019–Present** — https://data.baltimorecity.gov/datasets/189e6d1c65df4e13b38c0027cee574f6_3/explore
  - verification: search-confirmed (2015–2018 companion dataset also confirmed) · access: gis_service · format: CSV/GeoJSON/KML/shapefile · update: portal-managed · cost: free · difficulty: easy
  - notes: DHCD-issued permits, commercial + residential

### 7. violations_liens
- **Open Baltimore — Vacant Building Notices** — https://data.baltimorecity.gov/datasets/baltimore::vacant-building-notices
  - verification: search-confirmed · access: gis_service · format: CSV/GeoJSON/shapefile · update: **daily** · cost: free · difficulty: easy
  - notes: VBN = official vacancy designation (Building/Fire Code §116.4); on Open Baltimore since 2011
- **DHCD code-violation citations + rental license lookup** — https://baltimoremddhcd.portal.opengov.com/search
  - verification: search-confirmed (lookup URL); the violations DATASET is described in snippets as on Open Baltimore but its exact URL never appeared — find via data.baltimorecity.gov search · access: manual (portal) / bulk once dataset located · cost: free · difficulty: medium
  - notes: **HIGH VALUE — feeds the app's license-before-rent + violation rent-freeze rules.** Municipal lien certificate procedure: not searched before budget exhausted (TODO, expect manual)

### 8. sheriff_foreclosure
- **Baltimore City Tax Sale** — https://taxsale.baltimorecity.gov/
  - verification: search-confirmed · access: manual · format: HTML/PDF lists (March publication; Daily Record reposts) · update: annual (auction ~third week of May; Apr 30 payoff deadline) · cost: free · difficulty: medium
  - notes: tax-sale eligibility = delinquency red flag (taxes, water, citations). Mortgage foreclosures: circuit-court docket via Case Search; no official city sheriff-listing URL surfaced (aggregators only)

### 9. evictions_rent_reg
- **Rental registration & licensing (DHCD)** — https://www.baltimorecity.gov/dhcd/our-work/permit-inspections/property-registration
  - verification: search-confirmed (license lookup portal confirmed above) · access: manual · cost: free · difficulty: medium
  - notes: all non-owner-occupied rentals must be registered AND licensed (state-licensed inspection required); unlicensed = no standing to collect rent. Eviction records: District Court FTPR via Case Search only (CAPTCHA + 60-day shielding gap)

### 10. incentive_zones
- **CHAP Historic Tax Credit** — https://chap.baltimorecity.gov/tax-credit-faq · search-confirmed · manual · free · difficulty: medium
  - notes: 10-yr city property-tax credit on qualifying historic rehab; can't stack with other CITY credits, can stack with MD Historic Revitalization credits
- **BDC Enterprise Zone & Focus Areas** — https://www.baltimoredevelopment.com/doing-business/enterprise-zone-and-focus-area · search-confirmed · manual · free
  - notes: boundaries redrawn/expanded recently (2024–25 legal commentary); EZ commercial projects seeking CHAP must also apply via BDC
- **Opportunity Zones (BDC + MD DHCD)** — https://www.baltimoredevelopment.com/doing-business/opportunity-zones and https://dhcd.maryland.gov/pages/oz/opportunityzones.aspx · both search-confirmed · manual · free
  - notes: **42 OZ census tracts in the City**

### 11. environmental
- See statewide **FEMA NFHL** + **MDE LRP** — City harbor-front flood zones extensive; many legacy-industrial parcels in VCP/LRP lists. difficulty: easy

### 12. gis_open_data
- **Open Baltimore** — https://data.baltimorecity.gov/
  - verification: search-confirmed · access: gis_service (ArcGIS Hub, per-dataset APIs) · cost: free · difficulty: easy
  - layers that matter: Real Property Information (weekly), Building Permits, Vacant Building Notices (daily), code-violation citations, zoning; City GIS overview at baltimorecity.gov/planning/our-work/maps-data/GIS

---

## Baltimore County (CORE)

### 1. parcel_assessment
- **Open Data Parcels layer** — https://opendata.baltimorecountymd.gov/datasets/BC-GIS::parcels/about · search-confirmed · gis_service · GeoJSON/shapefile/CSV · free · difficulty: easy
  - notes: values from SDAT; join polygons to `ed4q-f8tm` by account

### 2. recorder_deeds
- **Deed Transfer and Recordation (Budget & Finance) + MDLandRec** — https://www.baltimorecountymd.gov/departments/budfin/taxpayer-services/deed-transfer-recordation · search-confirmed · manual · free · difficulty: medium
  - notes: **state 0.5% + county transfer 1.5% + recordation $2.50/$500 (0.5%)** — both county figures search-confirmed; no yield tax

### 3. zoning
- **BCZR on Municode** — https://library.municode.com/md/baltimore_county/codes/zoning_regulations · search-confirmed · manual · HTML · free · difficulty: easy
- **Zoning GIS layer** — https://opendata.baltimorecountymd.gov/datasets/BC-GIS::zoning/explore · search-confirmed · gis_service · free
  - notes: current layer includes **2024 CZMP** changes (county rezones via quadrennial Comprehensive Zoning Map Process — check pending CZMP issues on any deal). County has no incorporated municipalities; BCZR governs countywide

### 5. tax_rates
- **Tax Rates for Baltimore County** — https://www.baltimorecountymd.gov/departments/budfin/taxpayer-services/tax-rates · search-confirmed · manual · annual · free · difficulty: easy
  - notes: county rate **$1.10/$100 as of 2024-07-01** (snippet); FY2026 exact rate unconfirmed — verify on page

### 6. permits_co
- **Permit Search (ArcGIS app)** — https://www.arcgis.com/apps/webappviewer/index.html?id=fd4ea095d9eb4473a08df4fc6b0bdf57 · search-confirmed (linked from county PAI search guide) · gis_service · update: daily, records 2009+ · free · difficulty: medium (map front end; REST layer likely queryable, bulk undocumented)

### 7. violations_liens
- **Vacant Properties layer** — https://opendata.baltimorecountymd.gov/datasets/BC-GIS::vacant-properties/explore · search-confirmed · gis_service · free · difficulty: easy
- **Code Enforcement Dashboard** — Power BI (app.powerbigov.us, long tokenized URL — search-confirmed) · view-only, no export · difficulty: medium
  - notes: case-level violations open dataset unconfirmed; lien search procedure TODO

### 8. sheriff_foreclosure
- **Baltimore County Tax Sale** — https://www.baltimorecountymd.gov/departments/budfin/taxpayer-services/tax-sale · search-confirmed · manual · annual · free · difficulty: medium
  - notes: mortgage foreclosures via Case Search (manual) + statewide notice dataset `w3bc-8mnv` for volumes

### 9. evictions_rent_reg
- **Rental Housing Registration** — https://www.baltimorecountymd.gov/departments/pai/rental-registration · search-confirmed · manual · free · difficulty: medium
  - notes: registration required for residential rentals; evictions via Case Search only (CAPTCHA + shielding)

### 10. incentive_zones
- **Enterprise Zone tax credit** — https://www.baltimorecountymd.gov/departments/budfin/taxpayer-services/tax-credits/enterprise · search-confirmed · manual · free · difficulty: medium (boundaries in brochure PDF, not confirmed GIS)
  - notes: county EZs (real property + income credits); OZ tracts via MD DHCD page; no county TIF registry surfaced

### 11. environmental
- Statewide **FEMA NFHL** + **MDE LRP**; Essex/Dundalk/Middle River shoreline flood exposure material. difficulty: easy

### 12. gis_open_data
- **Baltimore County Open Data / GIS** — https://opendata.baltimorecountymd.gov (landing: baltimorecountymd.gov/open-data; bulk: …/information-technology/gis/data-download — all search-confirmed)
  - access: gis_service + free FTP bulk · difficulty: easy
  - layers that matter: Parcels, Zoning (2024 CZMP), Vacant Properties; "My Neighborhood" per-address viewer

---

## Anne Arundel County (SECONDARY)

- **parcel_assessment — OpenArundel Parcels** — https://opendata.aacounty.org/datasets/AnneArundelMD::parcels-12/about · search-confirmed · gis_service · CSV/KML/shapefile/GeoJSON · free · difficulty: easy · assessments via SDAT; viewer maps.aacounty.org (confirmed)
- **recorder_deeds — Circuit Court via MDLandRec** — https://mdlandrec.net · **unverified** (see statewide note) · manual · free w/ registration · difficulty: medium
  - **county transfer/recordation rates NOT verified** (budget exhausted; commonly cited 1% + $3.50/$500 — treat as unverified; check the mdcounties.org Section 7 PDF that appeared in results)
- **zoning — OPZ GIS page (zoning layer); code text unverified** — https://www.aacounty.org/planning-and-zoning/research-gis/geographic-information-systems · search-confirmed (page lists zoning among datasets) · gis_service · free · difficulty: medium (Article 18 code-text URL unconfirmed)
  - notes: Annapolis zones separately; its GIS downloads page confirmed (annapolis.gov/246/GIS-Data-Downloads). Chesapeake Bay Critical Area overlay matters for waterfront
- **gis_open_data — OpenArundel** — https://opendata.aacounty.org/ · search-confirmed · gis_service · free · difficulty: easy · layers: parcels, zoning, land use, critical areas, imagery

## Howard County (SECONDARY)

- **parcel_assessment — Property Boundaries (Cadastral)** — https://data.howardcountymd.gov/DataDownload/METADATA/Property.html · search-confirmed · bulk_download · shapefile · free · difficulty: easy
- **recorder_deeds — Circuit Court via MDLandRec** — https://mdlandrec.net · **unverified** (see statewide note) · difficulty: medium · **county rates NOT verified** (commonly cited 1.25–1.5% + $2.50/$500 — unverified)
- **zoning — Zoning layer + Interactive Map** — https://data.howardcountymd.gov/datadownload/metadata/zoning.html · search-confirmed (interactive map page also confirmed) · bulk_download · shapefile/MapInfo · free · difficulty: medium
  - notes: code-text URL unverified; **HoCo By Design plan + zoning rewrite in progress — confirm current regs before relying.** Columbia NT zoning + village covenants add a private layer
- **gis_open_data — Data Download & Viewer / Open Data Portal** — https://data.howardcountymd.gov/ (also opendata.howardcountymd.gov, both confirmed) · bulk_download · free · difficulty: easy · layers: cadastral, zoning, land use, easements, historic sites; My Neighborhood explorer

## Harford County (SECONDARY)

- **parcel_assessment — Cadastral via DataHub** — https://harford-county-gis-hub-harfordgis.hub.arcgis.com/ · search-confirmed (cadastral layer catalogued at geo.btaa.org; county dataset-page URL not in results) · gis_service · free · difficulty: easy · "Clip and Ship" GIS export offered
- **recorder_deeds — Circuit Court via MDLandRec** — https://mdlandrec.net · **unverified** (see statewide note) · difficulty: medium · **county rates NOT verified** (commonly cited 1% + $3.30/$500 — unverified)
- **zoning — Planning & Zoning Open GIS** — https://planning-harfordgis.opendata.arcgis.com/maps/3334c56de1314e6395506369c9e9f75b · search-confirmed · gis_service · free · difficulty: medium (code-text URL unconfirmed)
  - notes: Aberdeen, Bel Air, Havre de Grace zone separately
- **gis_open_data — DataHub + WebGIS** — https://harford-county-gis-hub-harfordgis.hub.arcgis.com/ (WebGIS: hcggis.harfordcountymd.gov/planning/harfordgis/; Maps-Apps: harfordcountymd.gov/752/Maps-Apps — all confirmed) · gis_service · free · difficulty: easy

## Carroll County (SECONDARY)

- **parcel_assessment — parcels via county open data** — https://www.data-carrollco-md.opendata.arcgis.com/ · search-confirmed (portal; dedicated parcels-page URL not in results — locate in portal) · gis_service · free · difficulty: easy
- **recorder_deeds — Circuit Court via MDLandRec** — https://mdlandrec.net · **unverified** (see statewide note) · difficulty: medium · **county rates NOT verified** (commonly cited: no county transfer tax, $5.00/$500 recordation — unverified)
- **zoning — Zoning Carroll County layer** — https://www.data-carrollco-md.opendata.arcgis.com/datasets/carrollco-md::zoning-carroll-county/about · search-confirmed · gis_service · free · difficulty: medium (code text, commonly ecode360 Ch. 158, unconfirmed)
  - notes: eight incorporated towns (Westminster etc.) zone separately
- **gis_open_data — Carroll County Open Data (ArcGIS Hub)** — https://www.data-carrollco-md.opendata.arcgis.com/ · search-confirmed · gis_service · CSV/KML/GeoJSON/GeoTIFF + GeoServices/WMS/WFS APIs · free · difficulty: easy

---

## Broker comps & market reports (metro-level, category 4)

- **CBRE Baltimore Figures (office + industrial, quarterly)** — https://www.cbre.com/insights/figures/baltimore-office-figures-q2-2026 (industrial companion confirmed too)
  - search-confirmed · manual · HTML/PDF · quarterly · free · terms: copyrighted research — cite, don't redistribute · difficulty: easy
  - notes: Q2 2026: office YTD absorption −37K sf; industrial +288K sf, vacancy ~8.7% (Q1) up ~100bps YoY
- **Cushman & Wakefield Baltimore MarketBeats** — https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/baltimore-marketbeats · search-confirmed · manual · quarterly · free · difficulty: easy
- **MacKenzie Commercial Real Estate Quarterly Market Report (local)** — https://www.mackenziecommercial.com/market-report/ · search-confirmed (open PDFs, e.g. Market-Report-2025-Q4-Ind-Flex.pdf) · manual · PDF · quarterly · free · difficulty: easy
  - notes: best local Baltimore-MSA coverage by asset class (4Q25 industrial: +71,182 sf absorption, $11.04 psf asking). **JLL / Colliers / Newmark / Marcus & Millichap Baltimore pages not verified — search budget exhausted; add later**
- **State sales file: SDAT `ed4q-f8tm`** (see statewide) — transfer date/price/deed reference per parcel; use to test OM broker comps against recorded sales. search-confirmed · api · free · difficulty: easy

## Rent & demand (metro-level, category 13)

- **HUD Fair Market Rents — Baltimore-Columbia-Towson, MD MSA** — https://www.huduser.gov/portal/datasets/fmr.html (SAFMR page confirmed: …/fmr/smallarea/index.html)
  - search-confirmed · bulk_download · CSV/Excel · annual · free · difficulty: easy
  - notes: FMR area = Baltimore City + Baltimore, Anne Arundel, Howard, Harford, Carroll, Queen Anne's counties — matches this registry's footprint. **SAFMRs calculated for the metro but NOT mandated for Baltimore City's PHA** (discretionary). Reference: FY2024 2BR $1,943
- **Zillow ZORI** — https://www.zillow.com/research/data/ · search-confirmed · bulk_download · CSV · monthly (16th) + weekly · free · difficulty: easy
  - notes: metro/county/ZIP coverage for Baltimore; 35th–65th percentile asking-rent index, stock-weighted. **Apartment List coverage unverified (budget exhausted).** Pair with ACS (B25064 median gross rent, vacancy) and BLS CES/LAUS for Baltimore-Columbia-Towson MSA for the market-check step
