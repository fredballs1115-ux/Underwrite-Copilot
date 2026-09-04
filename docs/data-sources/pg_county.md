# Prince George's County, MD (`pg_county`) — public-data source registry

Covers Prince George's County and its municipalities relevant to this metro: Mount Rainier, Hyattsville, Brentwood, Capitol Heights, College Park, Greenbelt, Bowie, Laurel.

> **Research note:** All URLs below were taken verbatim from WebSearch result listings/snippets (direct fetches are blocked in the research environment). `verification: unverified` entries are honestly flagged — several late-stage queries could not be run because the session web-search budget was exhausted; those entries have no URL rather than a guessed one.

## Key facts

| Fact | Value | Basis |
|---|---|---|
| Assessment ratio | 100% of fair market value (no fractional assessment) | SDAT homeowner's guide / multiple snippets |
| Reassessment cycle | Triennial, run by the STATE (SDAT), ~1/3 of each county reassessed per year; increases phased in equally over 3 years | SDAT docs snippets |
| Last countywide reassessment | Not applicable — Maryland reassesses one-third of accounts each year; there is no single countywide reassessment year | SDAT triennial-cycle docs |
| State transfer tax | 0.5% (first-time homebuyers exempt from the state portion) | gfrlaw.com / atgtitle.com snippets |
| County transfer tax | 1.4% (Prince George's) | myclosingcost.com / municode snippets |
| Recordation tax | $2.75 per $500 of consideration (≈0.55%), steady into FY2026 | myclosingcost.com snippet |
| Combined burden | One aggregator snippet claimed "≈2.9% combined"; 0.5+1.4+0.55 = 2.45% — **discrepancy flagged, verify against Municode Subtitle 10 Div. 7 before using** | — |
| County real property tax rate | $1.00/$100 assessed value (FY2025 base rate, per Constant Yield doc); municipal add-ons vary — see FY26 rate PDF | county Finance PDFs |
| Recording portal | mdlandrec.net — statewide, free with (free) registration; images included | MSA guide snippets |
| Big quirk | New Zoning Ordinance effective 4/1/2022 (complete rewrite); rental licensing is county (DPIE) EXCEPT ~18 municipalities that license their own — incl. Bowie, Brentwood, Capitol Heights, College Park, Greenbelt, Hyattsville, Mount Rainier, Town of Laurel | DPIE licensing page snippet |
| Rent regulation | Permanent Rent Stabilization and Protection Act (CB-055-2024), effective 10/17/2024: cap = lesser of 6% or CPI-U+3%; senior housing lesser of CPI-U or 4.5%; vacancy increases restricted; exemptions: post-2000 construction, landlords with <5 units, owner-occupied | county PRSA pages |

## Prince George's County (county-level)

### 1. parcel_assessment

- **SDAT Real Property Data Search** (state-run assessor)
  - url: https://sdat.dat.maryland.gov/RealProperty/Pages/default.aspx
  - verification: search-confirmed (URL in result listing)
  - access_method: manual (per-parcel HTML search; no CAPTCHA noted, no account needed)
  - data_format: HTML
  - update_frequency: continuous (assessments annually per triennial phase-in)
  - cost: free
  - terms_notes: site disclaimer — "for information purpose only and the data is not to be used for legal reports or documents"
  - difficulty: medium — per-parcel lookup only; bulk comes from the Open Data portal instead
  - notes: Shows owner, assessment, land use, zoning, sale history. Assessment ratio 100%, triennial cycle, 3-yr phase-in of increases.

- **Maryland Statewide Real Property Assessments (Socrata dataset `ed4q-f8tm`)** — bulk statewide SDAT+MDP roll
  - url: https://opendata.maryland.gov/Business-and-Economy/Maryland-Real-Property-Assessments_Hidden-Property/ed4q-f8tm
  - verification: search-confirmed (exact dataset URL in results; CSV endpoint `https://opendata.maryland.gov/api/views/ed4q-f8tm/rows.csv?accessType=DOWNLOAD&api_foundry=true` also appeared verbatim)
  - access_method: api (Socrata SODA) / bulk_download (CSV)
  - data_format: CSV/JSON
  - update_frequency: snippet says "last updated July 5, 2026"; fields update on differing SDAT/MDP cadences
  - cost: free
  - terms_notes: dataset title is "…_Hidden Property Owner Names" — **owner names are redacted in the open version**; join to SDAT search or paid file for ownership
  - difficulty: easy — official Socrata API, statewide, filter `county = Prince George's`
  - notes: Documentation PDF link also appeared in results (Real Property Records Documentation on the ed4q-f8tm page).

- **SDAT public data files / CAMA files (via SpecPrint)** — paid full extract incl. owner names
  - url: https://dat.maryland.gov/Pages/Services.aspx (also https://www.specprint.com/state.html)
  - verification: search-confirmed
  - access_method: bulk_download (purchased media/files)
  - data_format: fixed-layout master files; CAMA files produced each January
  - update_frequency: CAMA annually (January); real-property public release files periodically
  - cost: paid (SpecPrint is SDAT's distribution partner)
  - terms_notes: purchase terms via SpecPrint; not needed if the redacted Socrata file suffices
  - difficulty: medium — purchase + fixed-width layouts

- **PGAtlas (M-NCPPC)** — county parcel/zoning web GIS
  - url: www.PGAtlas.com (as printed in Planning Dept snippet)
  - verification: search-confirmed (domain appeared in snippet text; an MWCOG open-data reference page also listed it)
  - access_method: gis_service
  - data_format: web map; downloadable layers via the GIS open data portal (below)
  - update_frequency: maintained continuously by M-NCPPC Planning
  - cost: free
  - terms_notes: none noted
  - difficulty: easy — official GIS with imagery, property, zoning layers

- **MD iMAP Parcel Boundaries service** (statewide parcel polygons, MDP+SDAT)
  - url: https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer
  - verification: search-confirmed
  - access_method: gis_service (ArcGIS REST)
  - data_format: Esri REST/JSON, exportable
  - update_frequency: maintained by MD iMAP/MDP/SDAT (cadence not stated in snippets)
  - cost: free
  - terms_notes: none noted
  - difficulty: easy

### 2. recorder_deeds

- **mdlandrec.net (Maryland Land Records — Circuit Court images, statewide)**
  - url: mdlandrec.net (named in snippets; intro guide at https://msa.maryland.gov/msa/refserv/pdf/md-landrecords.pdf and https://guide.msa.maryland.gov/pages/viewer.aspx?page=mdlandrec)
  - verification: search-confirmed
  - access_method: manual (search UI after login; no bulk index download found)
  - data_format: scanned document images (deeds, mortgages, liens, plats, judgments)
  - update_frequency: as recorded by the PG Circuit Court Clerk
  - cost: free; **registration required but costs nothing** (valid email needed) — confirmed by MSA guide snippets
  - terms_notes: login wall (free account); joint project of Maryland Judiciary / Circuit Court Clerks / State Archives; no bulk index API noted
  - difficulty: medium — free but login-gated, per-document retrieval, no bulk index
  - notes: Transfer taxes at recording: state 0.5% + PG county transfer 1.4% + recordation $2.75/$500. County code authority: Municode, PG Code Subtitle 10, Div. 7 (https://library.municode.com/md/prince_george's_county/codes/code_of_ordinances?nodeId=PTIITI17PULOLAPRGECOMA_SUBTITLE_10FITA_DIV7TATACR_SD1TRRETA — search-confirmed). Recording fee dollar amounts NOT confirmed (search budget exhausted) — get from PG Circuit Court Clerk fee schedule.

### 3. zoning

- **Prince George's County Zoning Ordinance (enCodePlus)** — full text of the post-rewrite code
  - url: https://online.encodeplus.com/regs/princegeorgescounty-md/
  - verification: search-confirmed
  - access_method: manual / scrape (HTML doc viewer)
  - data_format: HTML (doc-viewer pages)
  - update_frequency: as amended
  - cost: free
  - terms_notes: enCodePlus platform; no bulk export noted
  - difficulty: medium — deep-linked doc viewer, awkward to scrape
  - notes: **New Zoning Ordinance + Subdivision Regs + Landscape Manual effective April 1, 2022** (complete rewrite of the old code; consolidated zones, TOD incentives). Legacy cases could file under the prior ordinance for a 2-year window.

- **ZoningPGC / zoning map + comparison tools (M-NCPPC)**
  - url: https://zoningpgc.pgplanning.com/ (swipe tool: https://zoningpgc.pgplanning.com/zoning-swipe-tool/)
  - verification: search-confirmed — **but flag**: the search-result title for the root URL read "Prince George's County Zoning Map - Vardenafil 20mg", a spam-looking title; verify page integrity before relying on it
  - access_method: gis_service / manual
  - data_format: web map (old-vs-new zone comparison)
  - update_frequency: maintained by Planning
  - cost: free
  - terms_notes: see title anomaly above
  - difficulty: easy (map) — code text lives in enCodePlus

- **Zoning Ordinance Portal (County Council)** + **Guide to Zoning Categories (Planning)**
  - url: https://pgccouncil.us/589/Zoning-Ordinance-Portal ; https://www.pgplanning.org/development/zoning-applications/guide-to-zoning-categories/
  - verification: search-confirmed
  - access_method: manual
  - data_format: HTML/PDF
  - update_frequency: as amended
  - cost: free
  - terms_notes: none
  - difficulty: easy
  - notes: Zoning GIS layer downloadable from gisdata.pgplanning.org (see §12). Variance/rezoning case records: development-activity cases are a PGAtlas/Planning layer per snippet; a dedicated case-search URL was not confirmed.

### 5. tax_rates

- **FY2026 County & Town Tax Rates (approved) PDF**
  - url: https://www.princegeorgescountymd.gov/sites/default/files/media-document/FY26%20County%20&%20Town%20Tax%20Rates%207-1-25.pdf
  - verification: search-confirmed
  - access_method: manual (annual PDF)
  - data_format: PDF table — $/$100 assessed value by taxing area (County, State, M-NCPPC, Metro, municipal)
  - update_frequency: annual (fiscal year)
  - cost: free
  - terms_notes: none
  - difficulty: medium — PDF parsing; URL pattern changes yearly
  - notes: FY2025 county real property base rate $1.00/$100 (per FY26 Constant Yield PDF, https://www.princegeorgescountymd.gov/sites/default/files/media-document/FY26%20Constant%20Yield.pdf — search-confirmed). Municipal differential detail: FY 2026 Municipal Tax Differential Report, https://www.princegeorgescountymd.gov/sites/default/files/media-document/FY%202026%20Municipal%20Tax%20Differential%20Report.pdf (search-confirmed). General page: https://www.princegeorgescountymd.gov/departments-offices/finance/taxes/property-taxes (search-confirmed).

### 6. permits_co

- **Data Prince George's (county open-data portal) — permit datasets**
  - url: https://data.princegeorgescountymd.gov/
  - verification: search-confirmed
  - access_method: api (Socrata) / bulk_download
  - data_format: CSV/JSON
  - update_frequency: ongoing; snippet: full listing of residential + commercial DPIE permits **since July 1, 2013**
  - cost: free, no account for most datasets
  - terms_notes: none noted
  - difficulty: easy

- **DPIE Momentum online permits + public permit case search**
  - url: https://dpiepermits.princegeorgescountymd.gov/ ; search: https://dpiestatus.princegeorgescountymd.gov/Site/Public/Citizens/CaseSearch.aspx
  - verification: search-confirmed
  - access_method: manual (per-case search UI)
  - data_format: HTML
  - update_frequency: live system of record
  - cost: free to search
  - terms_notes: ASP.NET case-search UI — brittle for automation
  - difficulty: medium
  - notes: Overview page: https://www.princegeorgescountymd.gov/departments-offices/permitting-inspections-and-enforcement/permits/online-permit-services (search-confirmed). CO records specifically: multifamily rental licensing requires a valid Certificate of Occupancy, but a dedicated public CO-lookup dataset was not separately confirmed.

- **LookSee property explorer** — permits, licenses, inspections, violations by address
  - url: looksee.princegeorgescountymd.gov (as printed in snippet text)
  - verification: search-confirmed (domain in snippet)
  - access_method: manual
  - data_format: HTML
  - update_frequency: pulls live from Momentum
  - cost: free
  - terms_notes: shows only trailing ~1 year of violations; older records require an MPIA request
  - difficulty: easy for spot checks; not a bulk source

### 7. violations_liens

- **LookSee (code violations by address)** — see §6; violation classes ZO (zoning), NC (noncompliance), IS (imminent safety); last 12 months only, older via MPIA (MPIA page: https://www.princegeorgescountymd.gov/departments-offices/permitting-inspections-and-enforcement/about-dpie/mpia-processing-dpie — search-confirmed).
- **DPIE Code Enforcement pages**
  - url: https://www.princegeorgescountymd.gov/departments-offices/permitting-inspections-and-enforcement/about-dpie/code-enforcement
  - verification: search-confirmed
  - access_method: manual
  - data_format: HTML
  - update_frequency: n/a (program pages)
  - cost: free
  - terms_notes: reporting via PGC311
  - difficulty: medium — no confirmed bulk violations dataset (check Data Prince George's catalog)
- **Municipal lien search / lien certificate procedure**
  - url: (none — not found)
  - verification: unverified — verification_note: no direct search run for "PG County lien certificate"; search budget exhausted. Expect a Finance-office lien certificate process; confirm before relying.
  - access_method: manual; difficulty: hard (assumed paper/fee process)

### 8. sheriff_foreclosure

- **Maryland Judiciary Case Search** — foreclosure (Circuit Court civil) case records statewide
  - url: https://casesearch.courts.state.md.us/casesearch/inquiry-search
  - verification: search-confirmed
  - access_method: manual / scrape
  - data_format: HTML (case summaries; full file at clerk's office)
  - update_frequency: live
  - cost: free
  - terms_notes: summary data only; disclaimer that official record is the case file; automation of Case Search is commonly rate-limited/CAPTCHA-guarded — treat as manual
  - difficulty: hard for bulk, easy for spot checks

- **Prince George's County annual tax sale (Office of Finance)**
  - url: https://www.princegeorgescountymd.gov/departments-offices/finance/services/tax-sale
  - verification: search-confirmed
  - access_method: manual
  - data_format: HTML + advertised list (newspaper/PDF)
  - update_frequency: annual — properties unpaid by the second Monday in May are sold; internet-based sealed-bid auction, high-bid-premium method; tax lien certificates
  - cost: free to view
  - terms_notes: bidder registration required to participate
  - difficulty: medium

- **Sheriff sale schedule (mortgage foreclosure auctions)**
  - url: (none — not found)
  - verification: unverified — verification_note: no PG-specific sheriff/trustee sale schedule URL surfaced before budget exhaustion; Maryland foreclosures are judicial via Circuit Court with private trustee auctions advertised in newspapers.
  - difficulty: hard

### 9. evictions_rent_reg

- **Eviction records — District Court "Failure to Pay Rent" cases**
  - url: https://casesearch.courts.state.md.us/casesearch/inquiry-search (records portal) ; explainer: https://www.peoples-law.org/failure-pay-rent and https://www.peoples-law.org/rent-court-eviction
  - verification: search-confirmed
  - access_method: manual
  - data_format: HTML case summaries
  - update_frequency: live
  - cost: free
  - terms_notes: **FTPR cases without a judgment of possession are shielded within 60 days of closing; even cases with judgments may be shielded** — public eviction-history data is structurally incomplete in MD; pandemic-era (3/5/2020–1/1/2022) cases shieldable on request
  - difficulty: hard — shielding + no bulk feed

- **Permanent Rent Stabilization and Protection Act (PRSA), CB-055-2024**
  - url: https://www.princegeorgescountymd.gov/departments-offices/housing-community-development/rent-stabilization-act-cb-055-2024 (legislation: https://princegeorgescountymd.legistar.com/LegislationDetail.aspx?ID=6711383&GUID=0EC1DFB8-7464-49ED-AE27-BF81B11D587A ; FAQ PDF: https://www.princegeorgescountymd.gov/sites/default/files/media-document/CB-55%20Rent%20Stabilization%20Act%20FAQs%20(PDF).pdf)
  - verification: search-confirmed
  - access_method: manual
  - data_format: HTML/PDF
  - update_frequency: statute; allowable-increase % updates with CPI-U
  - cost: free
  - terms_notes: underwriting-critical: annual cap = lesser of **6% or CPI-U (Washington-Arlington-Alexandria) + 3%**; senior facilities lesser of CPI-U or 4.5%; anti-vacancy-decontrol; new-fee prohibition. Exempt: buildings built after 2000, landlords renting <5 units, owner-occupied shares. Effective 10/17/2024.
  - difficulty: easy

- **DPIE rental housing licensing (single-family + multifamily)**
  - url: https://www.princegeorgescountymd.gov/departments-offices/permitting-inspections-and-enforcement/licensing/rental-housing-licenses (multifamily: .../multifamily-rental-licensing ; single-family: .../single-family-rental-licensing — all search-confirmed)
  - verification: search-confirmed
  - access_method: manual
  - data_format: HTML
  - update_frequency: licenses are 2-year term
  - cost: multifamily $75/unit per 2-year license (per county FAQ snippet); SF fee per DPIE fee schedule
  - terms_notes: inspection + valid CO required before issuance. **Jurisdiction carve-out (snippet-quoted): DPIE does NOT license rentals in Berwyn Heights, Bowie, Brentwood, Capitol Heights, Cheverly, College Park, District Heights, Edmonston, Forest Heights, Greenbelt, Hyattsville, Landover Hills, Mount Rainier, New Carrollton, Riverdale Park, Seat Pleasant, Town of Laurel, University Park** — i.e., most municipalities in this metro run their own rental licensing; check the city clerk/code office per asset
  - difficulty: medium — no public license-holder dataset confirmed (spot-check via LookSee)

### 10. incentive_zones

- **Maryland Opportunity Zones (Socrata `hu7s-ph9b` + iMAP layer)**
  - url: https://opendata.maryland.gov/dataset/Opportunity-Zones/hu7s-ph9b ; GIS: https://data.imap.maryland.gov/datasets/maryland-incentive-zones-opportunity-zones-1 ; DHCD program: https://dhcd.maryland.gov/business-development/maryland-opportunity-zones
  - verification: search-confirmed
  - access_method: api / gis_service / bulk_download
  - data_format: CSV/JSON; shapefile/GeoJSON via iMAP
  - update_frequency: static 2018 designations; **OZ 2.0 in flight — snippet: Maryland must submit up to 113 new tracts to Treasury by Sept 29, 2026 (130 eligible tracts in PG County); expect boundary changes**
  - cost: free
  - terms_notes: none
  - difficulty: easy

- **Prince George's County Enterprise Zone**
  - url: https://www.princegeorgescountymd.gov/departments-offices/enterprise-zone (EDC OZ page: https://www.pgcedc.com/opportunity-zones)
  - verification: search-confirmed
  - access_method: manual
  - data_format: HTML/maps
  - update_frequency: designation-driven
  - cost: free
  - terms_notes: property-tax credits inside zone boundaries — relevant to tax underwriting
  - difficulty: easy
  - notes: TIF districts / county abatement inventory not separately confirmed (budget exhausted).

### 11. environmental

- **MDE Land Restoration Program map + data (VCP / Brownfields / State Remediation)**
  - url: https://mde.maryland.gov/programs/land/marylandbrownfieldvcp/pages/mapping.aspx (data index: https://mdewin64.mde.state.md.us/LRP/Data/index.htm ; ArcGIS REST: https://mdewin64.mde.state.md.us/arcgis/rest/services/MDE_LRP/LandRestorationProgram/MapServer ; alt REST: https://mde.geodata.md.gov/mdedata/rest/services/LMA_Land_Restoration_Program/Land_Restoration_Program_Sites/MapServer/0)
  - verification: search-confirmed
  - access_method: gis_service (+ KML download per snippet)
  - data_format: Esri REST/JSON, KML
  - update_frequency: maintained by MDE
  - cost: free
  - terms_notes: MDE disclaimer — guidance only, "should not rely upon the data for making final decisions regarding the environmental status of a property"
  - difficulty: easy
  - notes: State environmental db name: **Maryland Land Restoration Program (LRP-MAP)**, Maryland Dept. of the Environment.

- **FEMA floodplain layers via MD iMAP**
  - url: https://data.imap.maryland.gov/datasets/c3d901cca2d8411f9b368b2d16e76f9e_1 (Effective FEMA Floodplain; preliminary layers also cataloged at https://data.imap.maryland.gov/datasets?q=Preliminary+FEMA+Floodplain)
  - verification: search-confirmed
  - access_method: gis_service / bulk_download
  - data_format: shapefile/GeoJSON/Esri REST
  - update_frequency: follows FEMA NFHL effective/preliminary updates
  - cost: free
  - terms_notes: none
  - difficulty: easy
  - notes: FEMA's own NFHL viewer not re-verified this session; the iMAP mirror covers the underwriting need. EPA cleanup lists (Superfund/ACRES) not separately searched — unverified.

### 12. gis_open_data

- **gisdata.pgplanning.org — M-NCPPC Planning GIS Open Data Portal** (the primary bulk GIS source)
  - url: https://gisdata.pgplanning.org/ (metadata catalog: https://gisdata.pgplanning.org/metadata/)
  - verification: search-confirmed
  - access_method: bulk_download / gis_service
  - data_format: Geodatabase, shapefile, DXF (per Planning snippet)
  - update_frequency: maintained continuously
  - cost: free
  - terms_notes: none noted
  - difficulty: easy
  - notes: Layers that matter: **property parcels** (basis for zoning/land-use/development-activity maps), **zoning**, land use, development cases. Companion viewer: PGAtlas (www.PGAtlas.com). Planning maps hub: https://pgplanning.org/data-tools/maps/ (search-confirmed).

- **Data Prince George's (Socrata)** — see §6; permits, property, public-safety datasets; CSV/JSON; free.
- **MD iMAP** — https://data.imap.maryland.gov/ and https://imap.maryland.gov/ (search-confirmed); 1000+ services incl. parcels, floodplain, incentive zones.

## Metro-level: 4. broker_comps (Washington DC metro / Suburban Maryland)

- **CBRE** — Washington DC Multifamily Figures (quarterly) + DC 2026 Market Outlook + Greater Washington REVIVE Index
  - url: https://www.cbre.com/insights/figures/washington-dc-multifamily-figures-q2-2025 ; https://www.cbre.com/insights/reports/washington-d-c-2026-u-s-real-estate-market-outlook ; https://www.cbre.com/lp/revive/september-2025-greater-washington-revive-index-reflects-regional-headwinds
  - verification: search-confirmed | access_method: manual | data_format: HTML/PDF | update_frequency: quarterly/annual | cost: free (registration wall possible) | difficulty: medium (gated downloads)
  - notes: REVIVE explicitly tracks Suburban Maryland sub-indices.
- **Cushman & Wakefield** — Washington DC MarketBeats: https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/washington-dc-marketbeats — search-confirmed; quarterly; free; manual; difficulty medium.
- **Marcus & Millichap** — Washington DC Multifamily Investment Forecast: https://www.marcusmillichap.com/research/market-report/washington-dc/washington-dc-2025-investment-forecast-multifamily-market-report — search-confirmed; snippet notes suburban-MD Class C vacancy > Class B and dev slowdown in MoCo/PG tied to 2024 rent stabilization; free w/ registration; difficulty medium.
- **Newmark** — Mid-Atlantic Multifamily: https://www.nmrk.com/insights/market-report/mid-atlantic-multifamily-market and Washington Metro reports https://www.nmrk.com/insights/market-report/washington-dc-office-market-reports-3 — search-confirmed; quarterly; free; difficulty medium.
- **Colliers** — Washington DC Office (quarterly, e.g. https://www.colliers.com/en/research/washington-dc/washington-dc-office-market-report-2026-q2) — search-confirmed; free; difficulty medium.
- **JLL** — Washington DC Office Market Dynamics: https://www.jll.com/en-us/insights/market-dynamics/washington-dc-office — search-confirmed; quarterly; free; difficulty medium.
- **Harbor Stone Advisors (local shop)** — D.C. & Suburban Maryland Multifamily quarterly: https://harborstoneadvisors.com/d-c-suburban-maryland-2026-q1-multifamily-market-report/ — search-confirmed; free; small/mid-cap multifamily focus incl. PG/MoCo; difficulty easy.
- **State sales data** — Maryland has no separate STEB-style sales file: sale price/date ride on the SDAT roll — use `ed4q-f8tm` (sales fields) + per-parcel sale history on SDAT Real Property search; paid full transfer files via SpecPrint (§1). verification: search-confirmed for the sources; the claim "no separate statewide sales file" is an inference — unverified.

## Metro-level: 13. rent_demand

- **HUD Fair Market Rents / SAFMR**
  - url: (none recorded)
  - verification: unverified — verification_note: the FMR-area query was blocked by search-budget exhaustion (200/200). PG County is conventionally in the "Washington-Arlington-Alexandria, DC-VA-MD HUD Metro FMR Area" — confirm the exact area name and SAFMR status at huduser.gov before use.
  - access_method: bulk_download | data_format: CSV/XLSX | update_frequency: annual | cost: free | difficulty: easy once confirmed
- **CPI-U Washington-Arlington-Alexandria (BLS)** — underwriting-critical because the PG PRSA cap and senior cap are keyed to this index (search-confirmed via CB-055 materials); BLS series URL not captured — unverified for URL. Bi-monthly release.
- **Census/ACS** — county/tract renter share, incomes, vacancy via ACS 5-year; standard data.census.gov access — unverified (no session search; generic knowledge).
- **Zillow ZORI / Apartment List rent indexes** — url: (none recorded); unverified — verification_note: query blocked by budget exhaustion; both publish free metro-level downloads that conventionally cover the Washington DC metro; confirm county/city granularity for Hyattsville/College Park submarkets.
