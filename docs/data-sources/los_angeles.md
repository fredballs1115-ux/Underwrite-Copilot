# Los Angeles County, CA — public data source registry (`los_angeles`)

> **RESEARCH STATUS — PARTIAL.** The research session's shared WebSearch budget (200 calls,
> shared across parallel metro sessions) was exhausted after only **6 successful queries** for
> this metro, all aimed at LA County core sources. Entries below marked
> `verification: search-confirmed` carry URLs that literally appeared in WebSearch result
> listings. Every other entry is `unverified` and was **never searched** — the entry records
> what the source is believed to be (from the task brief / general domain knowledge), with the
> suggested query for a follow-up run. Per repo rule: nothing is estimated; unverifiable = flagged.

## Key facts

| Fact | Value | Verification |
|---|---|---|
| Assessment basis | **Prop 13**: assessed value = acquisition (base-year) value, capped at +2%/yr inflation. Reassessment ONLY on change of ownership or new construction — **no market reassessment cycle**, no "last countywide reassessment year". | Statutory (CA Const. art. XIII A); not separately search-verified |
| Consequence for underwriting | Assessed value ≠ market value (long-held parcels sit far below market). Use assessment data for tax-liability modeling and sale-triggered step-ups, not valuation. A sale triggers reassessment to price — model post-acquisition taxes at ~1.1–1.3% of purchase price. | Analytical note |
| Documentary transfer tax (base) | $1.10 / $1,000 (state-authorized county rate) | Per task brief; not search-verified |
| City of LA transfer add-on | City base rate (believed $4.50/$1,000 — **not search-verified**) **plus Measure ULA**: 4.0% on sales ≥ $5.4M, 5.5% ≥ $10.9M (thresholds effective 7/1/2026; prior year $5.3M/$10.6M; CPI-adjusted annually; applies to the ENTIRE price) | ULA rates/thresholds **search-confirmed** ([finance.lacity.gov ULA FAQ](https://finance.lacity.gov/faq/measure-ula)) |
| Other municipal transfer taxes | Santa Monica (Measure GS tier believed 5.6% ≥ $8M), Culver City tiered — **not searched** | unverified |
| Recorder images | No free document images. LexisNexis online index search (back to 1977); copies via VitalChek or mail: plain $5 first page + $3/page, certified $6 + $3/page | Search-confirmed via snippets (laalmanac.com, deeds.com) |
| Rent regulation layers | City of LA RSO (pre-10/1978 buildings) + county RSO (unincorporated) + own regimes in Santa Monica, West Hollywood, Pasadena, Inglewood, Glendale/Long Beach just-cause + statewide AB 1482 | Regimes per task brief; record-access side not searched |
| TIF | CA dissolved redevelopment agencies in 2012 — **no classic TIF districts**; successor tool = EIFDs (Enhanced Infrastructure Financing Districts) | Per task brief; not search-verified |

---

## LA County (countywide)

### 1. parcel_assessment
- **LA County Assessor Public Portal** — `https://portal.assessor.lacounty.gov/`
  - verification: **search-confirmed** (URL in result listing). ~2.7M properties; Basic/Legal/Map search by AIN or address.
  - access_method: scrape (interactive portal) · data_format: HTML · update_frequency: continuous · cost: free
  - terms_notes: interactive lookup; no bulk from the portal itself — bulk lives on the open-data portal (below). Check ToS before scraping.
  - difficulty: **easy** (for the bulk route below) — the portal itself is medium/scrape.
- **Assessor Parcel Data — Rolls 2021–Present (annual assessment roll)** — `https://data.lacounty.gov/datasets/lacounty::assessor-parcel-data-rolls-2021-present/about`
  - verification: **search-confirmed**. Cumulative annual roll data 2021→present; CSV-only download due to size.
  - access_method: bulk_download · data_format: CSV · update_frequency: annual roll · cost: free
  - terms_notes: open data portal; standard open-data terms (verify license on page).
  - difficulty: **easy** — official bulk CSV of the full roll.
  - notes: historical companion: **Assessor Parcels Data 2006–2021** `https://geohub.lacity.org/datasets/bffc21600e5f408ea6791d1bce7738ae` (search-confirmed).
- **Parcels (current boundaries, ~2.4M)** — `https://data.lacounty.gov/documents/4d67b154ae614d219c58535659128e71`
  - verification: **search-confirmed**. Current parcel boundaries + attributes, maintained by Assessor; updated monthly (2nd of month); download as zipped file-geodatabase or shapefile only (size).
  - access_method: gis_service / bulk_download · data_format: FGDB/shapefile · update_frequency: monthly · cost: free · difficulty: **easy**.

### 2. recorder_deeds
- **LA County Registrar-Recorder/County Clerk (RR/CC)** — url: *not search-confirmed* (only `recorder@rrcc.lacounty.gov` email appeared in snippets; do not guess the site URL)
  - verification: **unverified** — facts below came from search-confirmed aggregator snippets: [laalmanac.com](https://www.laalmanac.com/_main/records_real_estate.php), [deeds.com](https://www.deeds.com/recorder/california/los-angeles/).
  - Facts: online index search via **LexisNexis** (name/doc number/legal description, back to 1977); older records at Norwalk office only. Copies via **VitalChek** (its own fee on top of county fees) or mail/in person: plain $5 first page +$3/page; certified $6 +$3/page; $18.50 expedite. **No free document images** — consistent with task brief.
  - access_method: manual (index scrape possible via LexisNexis, terms unknown) · data_format: HTML index; paper/PDF copies · cost: per-copy fees · difficulty: **hard** — paywalled images, third-party search vendor.
  - notes: transfer tax at recording: $1.10/$1,000 county base + city add-ons (see Key facts). Bulk index availability NOT searched (suggested query: "LA county registrar recorder bulk index data license").

### 3. zoning (unincorporated county)
- **LA County Dept. of Regional Planning — Title 22 code + GIS-NET map** — url: none recorded
  - verification: **unverified — NOT SEARCHED** (budget exhausted). Suggested query: "LA County Regional Planning GIS-NET zoning map Title 22".
  - access_method: gis_service (believed) · difficulty: unknown.

### 5. tax_rates
- **LA County Auditor-Controller — tax rate area (TRA) rate tables** — url: none recorded
  - verification: **unverified — NOT SEARCHED**. Suggested query: "LA County Auditor-Controller tax rate area rates annual". Base 1% Prop 13 levy + voter-approved debt varies by TRA.

### 6. permits_co (unincorporated county)
- **LA County Public Works Building & Safety / EPIC-LA permitting** — url: none recorded
  - verification: **unverified — NOT SEARCHED**. Suggested query: "EPIC-LA permit search LA County public works".

### 7. violations_liens
- **LA County code enforcement (unincorporated)** — url: none recorded — **unverified — NOT SEARCHED**. Suggested query: "LA County code enforcement case search unincorporated".

### 8. sheriff_foreclosure
- **CA nonjudicial trustee sales** — url: none recorded
  - verification: **unverified — NOT SEARCHED**. CA foreclosures are overwhelmingly nonjudicial: notices of default/trustee's sale are RECORDED (recorder index) and published in adjudicated newspapers + trustee/auction sites — there is no county-run consolidated foreclosure docket. Suggested queries: "notice of trustee sale Los Angeles county where published", "LA county recorder notice of default search".
- **LA County tax-defaulted land auctions (Treasurer & Tax Collector)** — url: none recorded — **unverified — NOT SEARCHED**. Believed run via online auction vendor. Suggested query: "LA County treasurer tax collector tax defaulted auction schedule Bid4Assets".

### 9. evictions_rent_reg (county side)
- **LA Superior Court — unlawful detainer record access** — url: none recorded
  - verification: **unverified — NOT SEARCHED**. CA CCP §1161.2 masks UD case records unless plaintiff prevails within 60 days — expect limited/paid online access. Suggested query: "LA Superior Court unlawful detainer case access online fees".
- **LA County RSO / rent registry (unincorporated)** — url: none recorded — **unverified — NOT SEARCHED**. Suggested query: "rent.lacounty.gov rent registry unincorporated RSO".

### 10. incentive_zones
- **Opportunity Zones (federal designations in LA County)** — url: none recorded — **unverified — NOT SEARCHED**. Suggested query: "opportunity zone map Los Angeles county HUD CDFI".
- **EIFDs (post-2012 TIF substitute)** — url: none recorded — **unverified — NOT SEARCHED**. CA dissolved redevelopment 2012; look for LA County/city EIFD formations. Suggested query: "Los Angeles EIFD enhanced infrastructure financing district list".

### 11. environmental
- **DTSC EnviroStor** (state cleanup sites) / **SWRCB GeoTracker** (LUST/cleanup) / **FEMA NFHL** — urls: none recorded
  - verification: **unverified — NOT SEARCHED**. State db names per task brief (CalEPA/DTSC EnviroStor; State Water Board GeoTracker). Suggested queries: "EnviroStor data download", "GeoTracker download GAMA", "FEMA NFHL Los Angeles county GIS".

### 12. gis_open_data
- **County of Los Angeles Open Data** — `https://data.lacounty.gov/` (assessor search page `https://data.lacounty.gov/search?categories=assessor` search-confirmed)
  - verification: **search-confirmed** (dataset + search URLs in result listings). Key layers: parcels (monthly), assessor annual rolls, publicly-owned parcels.
  - access_method: api / bulk_download / gis_service (ArcGIS Hub) · cost: free · difficulty: **easy**.
- **LA County eGIS Hub** — `https://egis-lacounty.hub.arcgis.com/datasets/bffc21600e5f408ea6791d1bce7738ae` (historical assessor parcels dataset URL search-confirmed; hub root not separately confirmed)
  - verification: **search-confirmed** (that dataset URL) · access_method: gis_service · difficulty: easy.

---

## City of Los Angeles

### 3. zoning
- **LA City Planning — Zoning Search / ZIMAS** — `https://planning.lacity.gov/zoning/zoning-search`
  - verification: **search-confirmed**. ZIMAS = parcel-level zoning, overlays, planning-case + building-permit history, code-violation flags; search by address/AIN/case number/community plan area.
  - access_method: scrape (interactive map app) · data_format: HTML · update_frequency: continuous · cost: free
  - terms_notes: interactive; for bulk zoning polygons use GeoHub layers instead.
  - difficulty: **medium** — app is manual; bulk layer route is easy via GeoHub.
  - notes: explainer (search-confirmed): `https://planning.lacity.gov/blog/how-does-zimas-work`. Planning case search + "rebuildla" portal per task brief — **NOT SEARCHED** (suggested query: "planning.lacity.gov case search PDIS").

### 6. permits_co
- **Building and Safety — Building Permits Issued 2020–Present** — `https://data.lacity.org/City-Infrastructure-Service-Requests/Building-and-Safety-Building-Permits-Issued-from-2/pi9x-tg5x`
  - verification: **search-confirmed**. Socrata dataset; OData/SODA API available.
  - access_method: api / bulk_download · data_format: CSV/JSON (Socrata) · update_frequency: believed ~daily (not verified) · cost: free · difficulty: **easy**.
- **LADBS-Permits (legacy dataset)** — `https://data.lacity.org/City-Infrastructure-Service-Requests/LADBS-Permits/hbkd-qubn` — verification: **search-confirmed** · access: api/bulk (Socrata) · difficulty: easy.
- **Building and Safety Inspections** — `https://data.lacity.org/City-Infrastructure-Service-Requests/Building-and-Safety-Inspections/9w5z-rg2h` — verification: **search-confirmed**; ~11.5M rows, last updated 6/15/2026 per snippet · api/bulk · easy.
- **LADBS site** — `https://dbs.lacity.gov/` — verification: **search-confirmed**. Permit/CofO document lookup on LADBS e-services **NOT SEARCHED**.

### 7. violations_liens
- **LADBS code enforcement / complaint search** — url: none recorded
  - verification: **unverified — NOT SEARCHED** (budget hit on this exact query). ZIMAS displays code-violation flags per parcel (search-confirmed snippet). Suggested query: "data.lacity.org building and safety code enforcement complaints dataset".

### 9. evictions_rent_reg
- **LAHD RSO Property Search** — `https://housing.lacity.gov/rental-property-owners/rso-property-search`
  - verification: **search-confirmed** (URL appeared in ZIMAS search results). Checks whether a parcel is under the city Rent Stabilization Ordinance.
  - access_method: scrape (lookup tool) · data_format: HTML · cost: free · difficulty: **medium** (per-parcel lookup; no confirmed bulk).
- **LAHD rent registry** (unit registration data) / **REAP list** (Rent Escrow Account Program buildings) / **city eviction-notice filings (ULA-funded reporting)** — urls: none recorded
  - verification: **unverified — NOT SEARCHED** (budget hit on this exact query). Suggested queries: "LAHD rent registry data download", "REAP property list LAHD", "Los Angeles eviction notices data LAHD monthly report".
- **AB 1482** (statewide cap ~5%+CPI, max 10%, + just cause, for buildings ≥15 yrs old not otherwise covered): statutory backdrop; no registry.

### 5/8/10/11 (city-specific notes)
- Property tax billing is countywide (see LA County). Foreclosure/tax-sale: county level. OZ/EIFD: see county entries. Environmental: state/federal dbs above.

---

## Municipal rent/permit regimes (all **unverified — NOT SEARCHED**; noted per task brief)

Each has its own rent-regulation apparatus that changes an underwrite; record-access side needs a follow-up run.

- **Santa Monica** — own **Rent Control Board** (charter-based, own registry + annual general adjustments); also its own transfer-tax tiers (Measure GS, believed 5.6% ≥ $8M — unverified). Suggested queries: "Santa Monica rent control board property lookup", "Santa Monica transfer tax measure GS rate".
- **West Hollywood** — own **Rent Stabilization** program + registry. Suggested query: "West Hollywood rent stabilization registry lookup".
- **Long Beach** — no classic rent cap; tenant protections/just-cause + relocation ordinance; open-data permit datasets believed on city portal. Suggested query: "Long Beach open data building permits".
- **Glendale** — just-cause/"rental rights" program (relocation triggers on large increases). Suggested query: "Glendale rental rights program ordinance".
- **Pasadena** — **Measure H** rent control + rental registry (2022 charter amendment). Suggested query: "Pasadena rent stabilization department registry data".
- **Inglewood** — local rent regulation/just-cause ordinance. Suggested query: "Inglewood rent control ordinance registry".

---

## 4. broker_comps (metro-level) — **unverified — NOT SEARCHED**

- CBRE / JLL / Colliers / Marcus & Millichap / Newmark / Cushman & Wakefield all publish free quarterly LA market reports (registration walls vary) — none searched; no URLs recorded.
- **No CA statewide sales-data file** exists (no PA-STEB/NY-style disclosure export); practical comp sources are the county roll (sale-triggered base-year values), recorded deeds (paywalled images), and broker reports.
- Suggested queries: "CBRE Los Angeles multifamily figures report", "Colliers Greater Los Angeles market report", "NKF LA market report PDF".

## 13. rent_demand (metro-level) — **unverified — NOT SEARCHED**

- **HUD FMR area:** *Los Angeles-Long Beach-Glendale, CA HMFA* (per task brief). LA is believed to be on HUD's mandatory **SAFMR** list (ZIP-level FMRs) — not verified. Suggested query: "HUD FMR Los Angeles-Long Beach-Glendale HMFA 2026 SAFMR".
- **Census/ACS:** B25 series (rents, tenure, vacancy) at tract level; **BLS:** CES/LAUS for Los Angeles-Long Beach-Anaheim MSA; CPI series for LA (used by ULA/AB 1482 adjustments).
- **Zillow ZORI** and **Apartment List** both publish LA metro + city rent indexes (free CSV downloads) — coverage believed strong; URLs not recorded (not searched).
