# Montgomery County, MD (`montgomery_county`) — public-data source registry

Covers Montgomery County and its municipalities relevant to this metro: Takoma Park, Rockville, Gaithersburg, Silver Spring (unincorporated), Bethesda (unincorporated).

> **Research note:** All URLs below were taken verbatim from WebSearch result listings/snippets (direct fetches are blocked). **The session's shared web-search budget was exhausted before most Montgomery-specific queries could run**, so this file leans on (a) statewide sources confirmed during Prince George's research and (b) MoCo URLs that happened to appear in those results. Every gap is flagged `unverified` with no guessed URL. Priority follow-ups: dataMontgomery portal, DPS permits, DHCA rent stabilization + licensing, Takoma Park rent stabilization, Montgomery Planning GIS, county tax rate schedule.

## Key facts

| Fact | Value | Basis |
|---|---|---|
| Assessment ratio | 100% of fair market value (statewide rule) | SDAT snippets |
| Reassessment cycle | Triennial, STATE-run (SDAT); ~1/3 reassessed yearly; increases phased in over 3 years; no single countywide reassessment year | SDAT snippets |
| State transfer tax | 0.5% | gfrlaw.com snippets |
| County transfer tax | 1.00% of price | MC311 page + edwarddumi.com snippets |
| Recordation tax (Bill 17-23, eff. 10/1/2023) | Base $2.08/$500 + school increment $2.37/$500; premium tiers: $5.75/$500 ($600k–$750k), $6.33/$500 ($750k–$1M), $6.90/$500 (>$1M) — among the region's most complex; verify computation against MC311/county code | county press release + Nelson Mullins alert |
| Recording portal | mdlandrec.net — statewide, free with free registration | MSA snippets |
| Rent regulation | County rent stabilization enacted 2024 (confirmed only indirectly via a Marcus & Millichap snippet: "rent stabilization policies enacted during 2024" in MoCo/PG); details (DHCA program, caps, registration) unverified this session. Takoma Park has its own longstanding regime — unverified this session | see §9 |
| Property taxes | FY2024 cycle included a county property-tax increase (Nelson Mullins alert title); current rate schedule unverified | see §5 |

## Montgomery County (county-level)

### 1. parcel_assessment

- **SDAT Real Property Data Search** (state-run assessor — same statewide system as all MD counties)
  - url: https://sdat.dat.maryland.gov/RealProperty/Pages/default.aspx
  - verification: search-confirmed
  - access_method: manual (per-parcel HTML search, free, no account)
  - data_format: HTML
  - update_frequency: continuous (triennial reassessment, annual phase-in)
  - cost: free
  - terms_notes: "information purpose only… not to be used for legal reports or documents"
  - difficulty: medium — per-parcel only
  - notes: assessment ratio 100%; triennial cycle; select "Montgomery County" as jurisdiction.

- **Maryland Statewide Real Property Assessments (Socrata `ed4q-f8tm`)**
  - url: https://opendata.maryland.gov/Business-and-Economy/Maryland-Real-Property-Assessments_Hidden-Property/ed4q-f8tm (CSV endpoint appeared verbatim: https://opendata.maryland.gov/api/views/ed4q-f8tm/rows.csv?accessType=DOWNLOAD&api_foundry=true)
  - verification: search-confirmed
  - access_method: api (Socrata SODA) / bulk_download
  - data_format: CSV/JSON
  - update_frequency: last updated July 5, 2026 per snippet; mixed SDAT/MDP cadences
  - cost: free
  - terms_notes: owner names hidden in the open version; filter `county = Montgomery`
  - difficulty: easy

- **SDAT public data files / CAMA (SpecPrint)** — https://dat.maryland.gov/Pages/Services.aspx ; https://www.specprint.com/state.html — search-confirmed; bulk_download; paid; CAMA produced each January; difficulty medium.

- **MD iMAP Parcel Boundaries** — https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer — search-confirmed; gis_service; free; difficulty easy.

- **County "Estimated Real Property Tax" / bill lookup**
  - url: (none recorded)
  - verification: unverified — verification_note: no search run (budget exhausted); the county Finance property-tax lookup exists but its URL was not captured in any result.

### 2. recorder_deeds

- **mdlandrec.net (Maryland Land Records — statewide Circuit Court images)**
  - url: mdlandrec.net (guide: https://guide.msa.maryland.gov/pages/viewer.aspx?page=mdlandrec ; intro PDF: https://msa.maryland.gov/msa/refserv/pdf/md-landrecords.pdf)
  - verification: search-confirmed
  - access_method: manual (search UI after free registration)
  - data_format: scanned images (deeds, mortgages, liens, plats)
  - update_frequency: as recorded by Montgomery Circuit Court Clerk
  - cost: free; free registration (email) required
  - terms_notes: login wall; no bulk index feed noted
  - difficulty: medium

- **Montgomery County Circuit Court — Land Records page**
  - url: https://www.montgomerycountymd.gov/circuit-court/how-do-i/land-records
  - verification: search-confirmed
  - access_method: manual
  - data_format: HTML (procedures, fees)
  - update_frequency: n/a
  - cost: free
  - terms_notes: recording-fee dollar amounts not captured — pull from this page
  - difficulty: easy

- **Transfer/recordation rate references**
  - MC311 county transfer-tax rate page: https://www3.montgomerycountymd.gov/311/SolutionView.aspx?SolutionId=1-2IHFYY — search-confirmed
  - Bill 17-23 press release: https://www2.montgomerycountymd.gov/mcgportalapps/Press_Detail.aspx?Item_ID=43331&Dept=1 — search-confirmed
  - Council staff packet: https://www.montgomerycountymd.gov/council/Resources/Files/agenda/col/2023/20230509/20230509_2A.pdf — search-confirmed
  - Law-firm summaries: https://www.nelsonmullins.com/insights/alerts/additional_nelson_mullins_alerts/all/increased-recordation-tax-rates-and-property-taxes-in-montgomery-county-maryland ; https://natlawreview.com/article/increased-recordation-tax-rates-montgomery-county-maryland — search-confirmed
  - notes: county transfer 1.00% + state 0.5%; recordation base $2.08/$500 + school $2.37/$500 + tiered premium ($5.75 / $6.33 / $6.90 per $500 above $600k/$750k/$1M) effective 10/1/2023. Premium proceeds split county capital / school capital / rent assistance.

### 3. zoning

- **Montgomery County Zoning Ordinance (Chapter 59) text + zoning map**
  - url: (none recorded)
  - verification: unverified — verification_note: no MoCo zoning query was run (budget exhausted). Known ecosystem to confirm: codemontgomery/zoningmontgomery ordinance site, Montgomery Planning interactive zoning map. Do NOT rely on this until searched.
  - access_method: manual / gis_service (expected)
  - difficulty: unknown pending verification

- **Montgomery Planning (M-NCPPC)** — planning agency; board site confirmed only via a hosted PDF
  - url: https://montgomeryplanningboard.org/ (appeared as host of the Bill 17-23 staff report: https://montgomeryplanningboard.org/wp-content/uploads/2023/04/Bill-17-23-Staff-Report_Final.pdf)
  - verification: search-confirmed (domain seen in results); the Planning Dept's GIS/data subsites are unverified
  - access_method: manual
  - data_format: HTML/PDF
  - cost: free
  - difficulty: easy for documents; GIS layer access unverified
  - notes: Rockville and Gaithersburg are independent zoning jurisdictions (own zoning ordinances/maps, outside M-NCPPC plan review) — this split is well known but was NOT search-confirmed this session; verify before encoding.

### 5. tax_rates

- **County tax rate schedule (real property levy by district/municipality)**
  - url: (none recorded)
  - verification: unverified — verification_note: no search run (budget exhausted). Finance publishes annual rate schedules; capture FY2026 PDF/page when searchable.
  - notes: Related search-confirmed fact: Nelson Mullins alert (URL in §2) pairs the recordation-tax increase with "Property Taxes" increases in Montgomery County (FY2024 cycle).
  - difficulty: unknown pending verification

### 6. permits_co

- **DPS (Dept. of Permitting Services) permit search / eServices**
  - url: (none recorded)
  - verification: unverified — verification_note: no search run (budget exhausted).
- **dataMontgomery (Socrata open-data portal) — issued-permits datasets**
  - url: (none recorded)
  - verification: unverified — verification_note: no search run (budget exhausted); dataMontgomery is the county's Socrata portal and historically carries DPS issued-permit datasets (CSV/JSON, API) — capture exact dataset IDs when searchable.
  - access_method: api (expected Socrata) | difficulty: expected easy once confirmed

### 7. violations_liens

- **DHCA housing code enforcement / dataMontgomery code-violation datasets**
  - url: (none recorded)
  - verification: unverified — verification_note: no search run (budget exhausted). DHCA (Housing and Community Affairs) handles housing code enforcement county-wide; dataMontgomery historically carries violation datasets.
- **Municipal lien / lien certificate procedure** — unverified; no search run.

### 8. sheriff_foreclosure

- **Maryland Judiciary Case Search** (foreclosure cases, Montgomery Circuit Court)
  - url: https://casesearch.courts.state.md.us/casesearch/inquiry-search
  - verification: search-confirmed
  - access_method: manual / scrape
  - data_format: HTML summaries
  - update_frequency: live
  - cost: free
  - terms_notes: summaries only; bulk automation impractical
  - difficulty: hard for bulk
- **County tax lien sale**
  - url: (none recorded)
  - verification: unverified — verification_note: no search run (budget exhausted). Maryland counties hold annual tax sales (statewide framework confirmed via PG research); capture MoCo Finance tax-sale page when searchable.

### 9. evictions_rent_reg

- **Eviction records — District Court Failure to Pay Rent (statewide framework)**
  - url: https://casesearch.courts.state.md.us/casesearch/inquiry-search ; explainers: https://www.peoples-law.org/failure-pay-rent ; https://www.peoples-law.org/rent-court-eviction
  - verification: search-confirmed
  - access_method: manual
  - data_format: HTML
  - cost: free
  - terms_notes: **FTPR shielding**: cases without judgment of possession shielded within 60 days; judgment cases may also be shielded — public eviction history structurally incomplete statewide
  - difficulty: hard

- **Montgomery County rent stabilization (DHCA) + rental facility licensing/registration**
  - url: (none recorded)
  - verification: unverified — verification_note: only indirect confirmation captured: Marcus & Millichap snippet — "rent stabilization policies enacted during 2024" across Montgomery and Prince George's, "driven by higher financing costs and rent stabilization policies… future supply additions expected to remain limited." Program specifics (Bill 15-23 caps, DHCA rent registration/survey, rental facility license) require follow-up searches.
  - notes: underwriting-critical once confirmed — cap mechanics and covered stock differ from PG's PRSA.

- **Takoma Park rent stabilization (city's own regime)**
  - url: (none recorded)
  - verification: unverified — verification_note: no search run (budget exhausted). Takoma Park has run its own rent stabilization + landlord licensing for decades, distinct from and predating the county program; annual allowance tied to CPI. Must be encoded separately for any Takoma Park asset — get the city's Housing division pages when searchable.
  - difficulty: unknown pending verification

### 10. incentive_zones

- **Maryland Opportunity Zones (statewide)**
  - url: https://opendata.maryland.gov/dataset/Opportunity-Zones/hu7s-ph9b ; GIS: https://data.imap.maryland.gov/datasets/maryland-incentive-zones-opportunity-zones-1 ; DHCD: https://dhcd.maryland.gov/business-development/maryland-opportunity-zones
  - verification: search-confirmed
  - access_method: api / gis_service / bulk_download
  - data_format: CSV/JSON; shapefile/GeoJSON
  - update_frequency: 2018 designations static; **OZ 2.0 redesignation in flight — up to 113 new MD tracts due to Treasury by 9/29/2026** (per DHCD snippet)
  - cost: free
  - difficulty: easy
- **County-level abatements/PILOTs (e.g., payments in lieu of taxes for affordable housing)** — url: (none recorded); unverified — no search run.

### 11. environmental

- **MDE Land Restoration Program (LRP-MAP)** — state environmental db (VCP / Brownfields / State Remediation)
  - url: https://mde.maryland.gov/programs/land/marylandbrownfieldvcp/pages/mapping.aspx ; data index: https://mdewin64.mde.state.md.us/LRP/Data/index.htm ; REST: https://mdewin64.mde.state.md.us/arcgis/rest/services/MDE_LRP/LandRestorationProgram/MapServer ; alt REST: https://mde.geodata.md.gov/mdedata/rest/services/LMA_Land_Restoration_Program/Land_Restoration_Program_Sites/MapServer/0
  - verification: search-confirmed
  - access_method: gis_service (+ KML)
  - data_format: Esri REST/JSON, KML
  - cost: free
  - terms_notes: MDE disclaimer — guidance only, not for final environmental determinations
  - difficulty: easy
- **FEMA floodplain via MD iMAP** — https://data.imap.maryland.gov/datasets/c3d901cca2d8411f9b368b2d16e76f9e_1 (Effective FEMA Floodplain) — search-confirmed; gis_service/bulk; free; difficulty easy. EPA cleanup lists not separately searched — unverified.

### 12. gis_open_data

- **MD iMAP (statewide)** — https://imap.maryland.gov/ ; catalog: https://data.imap.maryland.gov/ — search-confirmed; 1000+ services; layers that matter: parcel boundaries, effective/preliminary FEMA floodplain, incentive zones (OZ). Free; difficulty easy.
- **dataMontgomery (county Socrata portal)** — url: (none recorded); unverified — verification_note: no search run (budget exhausted); the county's open-data portal is the expected home for permits, violations, and licensing datasets — top follow-up.
- **Montgomery Planning GIS / open data (M-NCPPC)** — url: (none recorded); unverified — no search run; expected source for county zoning layer and master-plan boundaries (note Rockville/Gaithersburg maintain their own GIS).

## Metro-level: 4. broker_comps (Washington DC metro / Suburban Maryland)

Same metro coverage as `pg_county` (one metro, shared reports):

- **CBRE** — Washington DC Multifamily Figures: https://www.cbre.com/insights/figures/washington-dc-multifamily-figures-q2-2025 ; DC 2026 Outlook: https://www.cbre.com/insights/reports/washington-d-c-2026-u-s-real-estate-market-outlook ; Greater Washington REVIVE Index (tracks Suburban Maryland sub-composites): https://www.cbre.com/lp/revive/september-2025-greater-washington-revive-index-reflects-regional-headwinds — search-confirmed; quarterly/annual; free (possible registration); difficulty medium.
- **Cushman & Wakefield** — DC MarketBeats: https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/washington-dc-marketbeats — search-confirmed; quarterly; free; difficulty medium.
- **Marcus & Millichap** — DC Multifamily Investment Forecast: https://www.marcusmillichap.com/research/market-report/washington-dc/washington-dc-2025-investment-forecast-multifamily-market-report — search-confirmed; notes MoCo/PG development slowdown tied to 2024 rent stabilization; free w/ registration; difficulty medium.
- **Newmark** — Mid-Atlantic Multifamily: https://www.nmrk.com/insights/market-report/mid-atlantic-multifamily-market ; Washington Metro reports: https://www.nmrk.com/insights/market-report/washington-dc-office-market-reports-3 — search-confirmed; quarterly; free; difficulty medium.
- **Colliers** — DC Office quarterly: https://www.colliers.com/en/research/washington-dc/washington-dc-office-market-report-2026-q2 — search-confirmed; free; difficulty medium.
- **JLL** — DC Office Market Dynamics: https://www.jll.com/en-us/insights/market-dynamics/washington-dc-office — search-confirmed; quarterly; free; difficulty medium.
- **Harbor Stone Advisors (local)** — D.C. & Suburban Maryland Multifamily: https://harborstoneadvisors.com/d-c-suburban-maryland-2026-q1-multifamily-market-report/ — search-confirmed; free; difficulty easy.
- **State sales data** — sale fields on the SDAT roll: Socrata `ed4q-f8tm` + per-parcel sale history in SDAT Real Property search; paid full files via SpecPrint. (Claim that MD has no separate statewide sales file is an inference — unverified.)

## Metro-level: 13. rent_demand

- **HUD FMR/SAFMR** — url: (none recorded); unverified — verification_note: FMR-area query blocked by search-budget exhaustion. Montgomery County is conventionally in the "Washington-Arlington-Alexandria, DC-VA-MD HUD Metro FMR Area"; confirm exact name + SAFMR status at huduser.gov.
- **BLS CPI-U, Washington-Arlington-Alexandria** — drives both counties' rent-cap formulas (PG PRSA confirmed; MoCo unverified); series URL not captured — unverified; bi-monthly.
- **Census/ACS** — renter share, incomes, vacancy at county/tract level via data.census.gov — unverified (generic knowledge, no session search).
- **Zillow ZORI / Apartment List** — url: (none recorded); unverified — query blocked by budget exhaustion; both conventionally cover the DC metro with free downloads; confirm sub-county granularity (Silver Spring, Bethesda, Rockville, Gaithersburg).
