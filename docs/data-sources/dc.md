# Washington DC (metro_id: `dc`) — public data source registry

Unitary jurisdiction: the District of Columbia is city, county, and state-equivalent in one. No counties, one assessor (OTR), one recorder (ROD, under OTR), one zoning authority (DCOZ), one open-data portal (Open Data DC).

Researched 2026-08-25 via WebSearch only (direct fetches blocked in this environment). `verification: search-confirmed` = the exact URL appeared in a search-result listing; nothing below is a constructed URL.

## Key facts

| Fact | Value |
|---|---|
| Assessment ratio | 100% of estimated market value |
| Reassessment cycle | **Annual** (DC moved from a triennial-group cycle to annual assessments as of TY2002; notices mailed late February) |
| Property tax rates | Class 1 residential $0.85/$100; Class 2 commercial **tiered**: $1.65 (≤$5M) / $1.77 ($5–10M) / $1.89 (>$10M) per $100; punitive Class 3 (vacant) / Class 4 (blighted) rates — confirm on OTR page |
| Transfer + recordation tax | 1.45% + 1.45% = **2.9% combined** on commercial/mixed-use since Oct 1, 2023. The temporary **5% combined (2.5%+2.5%) on commercial ≥$2M** ran Oct 2019–Sep 2023 and has **expired** — beware stale OMs quoting 5%. Residential: 1.1% each side <$400k, 1.45% each at $400k+ (verify current year) |
| Recording fees | Deeds & most docs $31.50; deeds of trust/mortgages $156.50 (D.C. Code § 42-1210) |
| Tax sale | **OTR annual tax-lien sale** (no sheriff sale); separate annual "discount sale" of tax-delinquent Class 3/4 properties |
| Foreclosure | Both judicial (Superior Court) and non-judicial (Notice of Default → DISB mediation → Notice of Sale recorded at ROD) |
| Rent regulation | Rent Stabilization (pre-1976, 5+ units) via DHCD RAD / RentRegistry; cap May 2026–Apr 2027: CPI-W+2% = 4.1% (2.1% elderly/disabled). **TOPA** applies to multifamily sales; RENTAL Act of 2025 exempts buildings <15 years old |
| Access quirks | ROD search is free but behind a free-registration wall (publicsearch.us), no bulk index — use the open **ITSPE Property Sales** dataset for bulk sale data. Permit datasets are partitioned by year. Some permit records geocode to 0,0 |
| HUD FMR area | Washington-Arlington-Alexandria, DC-VA-MD HMFA (SAFMR/ZIP-level applies; Calvert County MD dropped in FY2026) |

## District of Columbia

### 1. Parcel / assessment (`parcel_assessment`)

- **OTR Integrated Tax System (ITS) Public Extract — Open Data DC**
  - url: https://opendata.dc.gov/datasets/integrated-tax-system-public-extract
  - verification: search-confirmed (URL verbatim in results; also on data.gov)
  - access_method: bulk_download · data_format: CSV, GeoJSON, Shapefile, KML, ArcGIS GeoService
  - update_frequency: weekly-ish (Common Ownership Lots regenerated weekly from latest extract) · cost: free
  - terms_notes: Open Data DC open license, no login. Subsets: **ITSPE Facts** (readable column names), **Vacant Property**, **Vacant and Blighted**, **Property Sales**
  - difficulty: **easy** — official open-data bulk file + ArcGIS API
  - notes: The tax assessment roll: ownership, mailing address, assessed value, billing for 200k+ lots/parcels/condos, keyed by **SSL (Square-Suffix-Lot)**. Assessment facts: 100% ratio, annual cycle, notices late February (per otr.cfo.dc.gov assessment-process page).

- **OTR Real Property Tax Database Search** (per-parcel lookup)
  - url: https://otr.cfo.dc.gov/page/real-property-tax-database-search
  - verification: search-confirmed · access_method: manual · data_format: HTML
  - update_frequency: continuous · cost: free · terms_notes: public, no login; deeper detail on MyTax.DC.gov
  - difficulty: **easy** — simple lookup; use ITSPE for anything programmatic
  - notes: OTR also runs a Real Property Assessment GIS "Mapplication" (assessment neighborhoods, valuation reports): https://otr.cfo.dc.gov/page/real-property-geographic-information-systems-gis-program

- **OTR Real Property Public Extract Records** (restricted bulk feed)
  - url: https://otr.cfo.dc.gov/page/real-property-public-extract-records
  - verification: search-confirmed · access_method: bulk_download · data_format: database extract
  - update_frequency: periodic · cost: free but **restricted to mortgage servicers paying 10+ tax bills**
  - terms_notes: eligibility-gated; the Open Data DC ITSPE mirror is the practical path
  - difficulty: **medium** — gated; irrelevant given the open mirror

### 2. Recorder of deeds (`recorder_deeds`)

- **DC Recorder of Deeds Official Records Search** (publicsearch.us)
  - url: https://washington.dc.publicsearch.us/
  - verification: search-confirmed
  - access_method: scrape · data_format: HTML index + document images
  - update_frequency: continuous · cost: free search/view after **free registration**; downloads $4.00/doc + $1.50 surcharge; certified copies $2.25/page + $2.25/doc
  - terms_notes: **login wall** (free); index + images Aug 1921–present; **no bulk index download found** — treat bulk extraction as unsupported
  - difficulty: **medium** — vendor portal, per-doc fees, no bulk
  - notes: ROD sits under OTR (https://otr.cfo.dc.gov/page/recorder-deeds; images page https://otr.cfo.dc.gov/service/recorder-deeds-document-images). Fees per D.C. Code § 42-1210 (https://code.dccouncil.gov/us/dc/council/code/sections/42-1210) and https://otr.cfo.dc.gov/service/recorder-deeds-fee-charges. Transfer/recordation rates: see Key facts — 2.9% combined commercial since Oct 2023 (5% combined on ≥$2M expired Sep 2023; sources: ryan.com, goulstonstorrs.com, seyfarth.com alerts + https://cfo.dc.gov/page/tax-rates-and-revenues-property-taxes). Non-judicial foreclosure notices are recorded here.

- **ITSPE Property Sales dataset** (bulk recorded-sales substitute)
  - url: https://opendata.dc.gov/datasets/integrated-tax-system-public-extract-property-sales
  - verification: search-confirmed · access_method: bulk_download · data_format: CSV/GeoJSON/GeoService
  - update_frequency: with ITS refresh · cost: free · terms_notes: open license
  - difficulty: **easy**
  - notes: Sale price/date per SSL — DC's equivalent of a state sales file; use for sale comps instead of scraping ROD.

### 3. Zoning (`zoning`)

- **ZR16 — Zoning Regulations of 2016, online text (DCOZ)**
  - url: https://dcoz.dc.gov/zrr/zr16 (access page: https://dcoz.dc.gov/service/view-zoning-regulations)
  - verification: search-confirmed · access_method: scrape · data_format: HTML viewer
  - update_frequency: as amended · cost: free · terms_notes: labeled "unofficial"; official text is DCMR Title 11
  - difficulty: **medium** — no bulk text download
  - notes: ZR16 effective 2016-09-06. Companion handbook at handbook.dcoz.dc.gov.

- **DC Zoning Map + Zoning Boundaries GIS layer**
  - url: https://opendata.dc.gov/datasets/DCGIS::zoning-boundaries-zoning-regulations-of-2016 (interactive: http://zmap.dcoz.dc.gov/)
  - verification: search-confirmed · access_method: gis_service · data_format: Shapefile/GeoJSON/FeatureServer
  - update_frequency: as map amendments approved · cost: free · terms_notes: open license
  - difficulty: **easy**

- **IZIS case search + Zoning Cases Dashboard (ZC + BZA variances/rezonings)**
  - url: https://app.dcoz.dc.gov/CaseReport/CaseSearch.aspx (dashboard: https://maps.dcoz.dc.gov/casesdashboard/; about: https://dcoz.dc.gov/service/interactive-zoning-information-system-izis; how-to: https://dcoz.dc.gov/howtosearch)
  - verification: search-confirmed · access_method: scrape · data_format: HTML/ASPX + PDF exhibits; dashboard is ArcGIS app
  - update_frequency: dashboard updated daily · cost: free · terms_notes: no account needed to view
  - difficulty: **medium** — complete records (exhibits, orders, transcripts) but no documented API

### 5. Tax rates (`tax_rates`)

- **OTR Real Property Tax Rates**
  - url: https://otr.cfo.dc.gov/page/real-property-tax-rates (statute: https://code.dccouncil.gov/us/dc/council/code/sections/47-812; OCFO: https://cfo.dc.gov/page/tax-rates-and-revenues-property-taxes)
  - verification: search-confirmed · access_method: manual · data_format: HTML table
  - update_frequency: annual · cost: free · terms_notes: single citywide table — no county/school millage stack
  - difficulty: **easy**
  - notes: Class 2 tiers $1.65/$1.77/$1.89 per $100 confirmed in snippets; Class 3/4 punitive rates not re-verified this session — check page.

### 6. Permits / C of O (`permits_co`)

- **Building Permits (annual datasets, DOB) — Open Data DC**
  - url: https://opendata.dc.gov/items/4aeaaa42c5e04b58b87f07e4511766c1 (Building Permits in 2025; per-year datasets 2017–2026, e.g. https://opendata.dc.gov/datasets/DCGIS::building-permits-in-2023/about)
  - verification: search-confirmed · access_method: bulk_download · data_format: CSV/GeoJSON/Shapefile/GeoService
  - update_frequency: rolling automated feed · cost: free
  - terms_notes: open license. **Caveat:** failed geocodes stored as 0,0 — filter
  - difficulty: **easy** — only quirk is year partitioning
  - notes: construction/alteration + supplemental (electrical, plumbing, raze) permits, commercial + residential.

- **Certificate of Occupancy dataset — Open Data DC**
  - url: https://opendata.dc.gov/datasets/DCGIS::certificate-of-occupancy/about
  - verification: search-confirmed · access_method: bulk_download · data_format: CSV/GeoJSON/GeoService
  - update_frequency: automated · cost: free · terms_notes: open license
  - difficulty: **easy**
  - notes: C of O required for everything except single-family — verify an OM's claimed use is legal. Per-property lookup in Scout.

### 7. Violations / liens (`violations_liens`)

- **Scout (DOB/DLCP consolidated property search)**
  - url: https://scout.dob.dc.gov/
  - verification: search-confirmed · access_method: manual · data_format: HTML app
  - update_frequency: continuous · cost: free · terms_notes: no login; search by address/business/person/permit/license
  - difficulty: **medium** — excellent single-property check, not a bulk source
  - notes: permits, C of Os, licenses, inspections, enforcement actions in one place.

- **DOB Notices of Infraction + Public Dashboard**
  - url: https://dob.dc.gov/noi (dashboard: https://dob.dc.gov/page/agency-performance-dob)
  - verification: search-confirmed · access_method: manual · data_format: HTML dashboards; DOB datasets tagged on Open Data DC
  - update_frequency: regular · cost: free · terms_notes: none noted
  - difficulty: **medium** — dashboard-first; extraction via Scout/Open Data
  - notes: NOI types NOIE/NOIR/NOIS; dashboard shows owner NOI balances (unpaid fines → lien risk). NOIs adjudicated at OAH (https://oah.dc.gov/page/notice-infraction). Tax/municipal liens: MyTax.DC.gov + recorded instruments at ROD.

### 8. Tax sale / foreclosure (`sheriff_foreclosure`)

- **OTR Annual Real Property Tax Sale** (tax-lien sale — DC has **no sheriff sale**)
  - url: https://otr.cfo.dc.gov/page/real-property-tax-lien-sale-and-resources (statute: https://code.dccouncil.gov/us/dc/council/code/sections/47-1301)
  - verification: search-confirmed · access_method: manual · data_format: PDF/HTML lists in SSL order; redemption report on https://mytax.dc.gov
  - update_frequency: annual · cost: lists free · terms_notes: liens sold, not fee title; lists advertised in Post/Times/Current; separate annual **discount sale** of tax-delinquent Class 3 vacant / Class 4 blighted properties
  - difficulty: **medium** — PDF lists, manual monitoring
  - notes: subject property on the list = tax-delinquent distress signal.

- **Mortgage foreclosure — DC Superior Court + ROD-recorded notices**
  - url: https://www.dccourts.gov/superior-court/superior-court-divisions/civil-division/housing-matters/mortgage-foreclosure-sales (case search: https://www.dccourts.gov/superior-court/superior-court-case-search)
  - verification: search-confirmed · access_method: manual · data_format: HTML dockets, some images
  - update_frequency: continuous · cost: free · terms_notes: anonymous search; no bulk/API
  - difficulty: **medium** — must check BOTH court dockets (judicial) AND ROD records (non-judicial power-of-sale: Notice of Default → DISB mediation → Notice of Sale recorded + mailed to Mayor 30+ days pre-sale)

### 9. Evictions / rent regulation (`evictions_rent_reg`)

- **DC Superior Court Landlord & Tenant Branch case search**
  - url: https://www.dccourts.gov/superior-court/superior-court-case-search (branch: https://www.dccourts.gov/superior-court/superior-court-divisions/civil-division/landlord-and-tenant)
  - verification: search-confirmed · access_method: manual · data_format: HTML dockets
  - update_frequency: continuous (minutes after entry) · cost: free
  - terms_notes: anonymous; **no address search** — building-level screening requires party-name (owner/LLC) searches; no bulk access; DC seals many eviction records
  - difficulty: **hard** — no bulk, no address key

- **DHCD Rental Accommodations Division (RAD) — RentRegistry rent-control database**
  - url: https://dhcd.dc.gov/page/rentregistry-rent-control-database (portal: https://rentregistry.dc.gov/welcome-housing-providers/; program: https://dhcd.dc.gov/rentcontrol)
  - verification: search-confirmed · access_method: manual · data_format: HTML portal
  - update_frequency: continuous filings · cost: free
  - terms_notes: ALL DC rentals must register (even exempt); RAD number identifies each property
  - difficulty: **medium** — portal lookup, no bulk export
  - notes: **Underwrite-critical.** Rent stabilization: pre-1976 buildings, 5+ units, absent exemption. Caps May 2026–Apr 2027: 4.1% standard (CPI-W+2%), 2.1% elderly/disabled. **TOPA** (D.C. Code § 42-3404.02: https://code.dccouncil.gov/us/dc/council/code/sections/42-3404.02) gives tenants purchase rights on multifamily sale; **RENTAL Act of 2025** (passed 2025-09-17; https://www.hklaw.com/en/insights/publications/2025/09/dc-council-passes-rental-act-including-significant-tenant-opportunity) exempts buildings built within the last 15 years (Notice of Transfer still required).

### 10. Incentive zones (`incentive_zones`)

- **DMPED Opportunity Zones (25 tracts) + map**
  - url: https://dmped.dc.gov/page/opportunity-zones-washington-dc (map PDF: https://dmped.dc.gov/publication/opportunity-zones-map)
  - verification: search-confirmed · access_method: manual · data_format: HTML/PDF; tract boundaries on Open Data DC
  - update_frequency: static (certified 2018-05-18) · cost: free · difficulty: **easy**

- **Housing in Downtown (HID) abatement + Economic Development Zones layer**
  - url: https://dmped.dc.gov/page/housing-downtown-tax-abatement-overview-%E2%80%93-january-2023 (ED Zones: https://opendata.dc.gov/datasets/DCGIS::economic-development-zones/about)
  - verification: search-confirmed · access_method: manual / gis_service · data_format: HTML; GeoJSON/FeatureServer for zones
  - update_frequency: program-driven · cost: free
  - terms_notes: HID is competitive/capped — 20-year abatement for downtown commercial→residential conversions; underwrite only awarded abatements
  - difficulty: **medium** — no single abatement registry; existing abatements show on the ITSPE/tax bill

### 11. Environmental (`environmental`)

- **DOEE Land Remediation & Development (VCP/brownfields) + UST records**
  - url: https://doee.dc.gov/service/land-remediation-and-development (UST records: https://doee.dc.gov/publication/public-records-related-underground-storage-tank-ust-systems)
  - verification: search-confirmed · access_method: manual · data_format: HTML + records requests
  - update_frequency: ongoing · cost: free
  - terms_notes: state-equivalent env agency = **DOEE**; no confirmed self-serve contamination database — site files via records request
  - difficulty: **hard** — records-request workflow
  - notes: DOEE runs the DC Brownfield Revitalization Act, Voluntary Cleanup Program, UST program. Pair with EPA national lists (not re-verified this session).

- **FEMA NFHL + DC Flood Risk Tool**
  - url: https://www.fema.gov/flood-maps/national-flood-hazard-layer (WMS/REST: https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS; DOEE tool: https://doee.dc.gov/service/flood-risk-maps and https://dcfloodrisk.org/)
  - verification: search-confirmed · access_method: gis_service · data_format: NFHL GIS download + WMS/REST; interactive map
  - update_frequency: continuous · cost: free · terms_notes: public domain
  - difficulty: **easy**
  - notes: dcfloodrisk.org adds storm surge + sea-level-rise layers over FEMA FIRMs — matters for Buzzard Point/Southwest/Georgetown waterfront deals.

### 12. GIS / open data (`gis_open_data`)

- **Open Data DC**
  - url: https://opendata.dc.gov/
  - verification: search-confirmed (ArcGIS Hub mirror datahub-dc-dcgis.hub.arcgis.com and REST base maps2.dcgis.dc.gov/DCGIS/rest/services also seen in results)
  - access_method: api · data_format: CSV/GeoJSON/Shapefile/KML + FeatureServer/MapServer REST
  - update_frequency: per-dataset, many automated · cost: free · terms_notes: open license
  - difficulty: **easy**
  - notes: **Layers that matter:** Common Ownership Lots (weekly parcel polygons conflated with ITSPE by SSL — https://opendata.dc.gov/datasets/common-ownership-lots/about), ITSPE + Facts/Vacant/Blighted/Property Sales, Zoning Boundaries (ZR16), Building Permits by year, Certificate of Occupancy, Economic Development Zones, floodplain layers, Vacant and Blighted Building Footprints.

## Metro-level: broker comps (`broker_comps`)

- **CBRE — Washington DC Figures (office, multifamily) + DC 2026 Outlook**
  - urls: https://www.cbre.com/insights/figures/washington-dc-multifamily-figures-q2-2025 · https://www.cbre.com/insights/figures/washington-dc-office-figures-q3-2025 · https://www.cbre.com/insights/reports/washington-d-c-2026-u-s-real-estate-market-outlook
  - verification: search-confirmed · access_method: manual · data_format: HTML/PDF · update_frequency: quarterly/annual · cost: free (some email-gated)
  - terms_notes: copyrighted research — cite, don't redistribute · difficulty: **easy**
  - notes: sample: DC multifamily occupancy 96.2% (Q2'25); office vacancy 22.4%, Trophy 10.2% (Q3'25).

- **Colliers / JLL / Newmark / Cushman & Wakefield — DC quarterly reports**
  - urls: https://www.colliers.com/en/research/washington-dc/washington-dc-office-market-report-2026-q2 · https://www.jll.com/en-us/insights/market-dynamics/washington-dc-office · https://www.nmrk.com/insights/market-report/district-of-columbia-office-market · https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/washington-dc-marketbeats
  - verification: search-confirmed · access_method: manual · data_format: HTML/PDF · update_frequency: quarterly · cost: free (registration walls on some)
  - terms_notes: copyrighted; no redistribution · difficulty: **easy**
  - notes: cross-checks: Colliers DC office vacancy 20.9% (Q1'26), Class A $60.02/SF (Q2'26); Newmark 20.6% vacancy, $57.34/SF (Q1'26) — ~2pt methodology spread vs CBRE is itself useful when challenging OM comps. **No separate state sales file** — DC's is the ITSPE Property Sales dataset (§2 above).

## Metro-level: rent & demand (`rent_demand`)

- **HUD FMR/SAFMR — Washington-Arlington-Alexandria, DC-VA-MD HUD Metro FMR Area**
  - url: https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html (FY2026 notice: https://www.federalregister.gov/documents/2025/08/22/2025-16060/fair-market-rents-for-the-housing-choice-voucher-program-moderate-rehabilitation-single-room)
  - verification: search-confirmed · access_method: bulk_download · data_format: CSV/XLSX + lookup
  - update_frequency: annual (FY2026 effective 2025-10-01) · cost: free · terms_notes: public domain · difficulty: **easy**
  - notes: SAFMRs (ZIP-level) apply in this HMFA; FY2026 removed Calvert County MD from the area. Census/ACS: DC = state FIPS 11 and county FIPS 11001 simultaneously. BLS Washington-area CPI-W drives the DC rent-control cap.

- **Zillow ZORI / Apartment List rent indexes**
  - url: (none recorded)
  - verification: **unverified** — session search budget exhausted before this query; both are known to cover the DC metro, but no URL was captured from a search result so none is recorded. Follow up: confirm zillow.com/research/data ZORI files and Apartment List rent estimates coverage.
  - access_method: bulk_download · data_format: CSV (typical) · update_frequency: monthly (typical) · cost: free · difficulty: **easy** once confirmed

## Known gaps (honest, per repo rule: unverifiable = flagged)

- Class 3/4 punitive tax rates and current-year residential transfer-tax split: stated from general knowledge/snippets, not re-verified — confirm on the OTR rate pages before use.
- EPA national environmental lists (Envirofacts, Cleanups in My Community) for DC: not searched this session.
- Open Data DC violation/NOI bulk dataset name: DOB datasets exist under the `dob` tag but the specific violations dataset was not individually confirmed.
- Zillow ZORI / Apartment List URLs: unverified (see above).
