# Northern Virginia (metro_id: `nova`) — public-data source registry

Researched 2026-08-25 via WebSearch only (egress-blocked container). **Coverage caveat:** the session's shared web-search budget was exhausted after ~18 searches. Fairfax County, Arlington County, Loudoun County (partial), and all metro/state-level categories are search-confirmed. **Prince William County, City of Alexandria, and most secondary-city entries could NOT be researched and are marked `unverified` — nothing there is fabricated; re-run research for those.** Repo-known leads for Prince William are carried forward and flagged as such.

## Key facts

| Fact | Value | Status |
|---|---|---|
| Assessment ratio | 100% of fair market value (VA standard) — confirmed for Fairfax Co. and Arlington | search-confirmed (Fairfax, Arlington); assume same elsewhere, verify |
| Reassessment cycle | ANNUAL, as of Jan 1 — confirmed for Fairfax Co. and Arlington; Loudoun/PWC/Alexandria assumed annual, unverified | partial |
| Grantor's tax (state+local) | $0.50 per $500 of net consideration ($1/$1,000), split 50/50 state/locality; paid by grantor | search-confirmed |
| Regional congestion relief fee | $0.10 per $100, deeds in NVTA member jurisdictions (Va. Code §58.1-802.4), paid by grantor | search-confirmed |
| WMATA capital fee (regional transportation improvement fee) | $0.10 per $100, same NVTA jurisdictions (Va. Code §58.1-802.3) | search-confirmed |
| State recordation tax (grantee side, §58.1-801) + local third | Rates live in Va. Code Title 58.1 Ch. 8; base rate not captured in a search snippet — verify at the chapter link below | unverified rate |
| Land records model | Per-jurisdiction Circuit Court clerk "secure remote access" subscriptions: Fairfax CPAN $150/qtr or $600/yr; Arlington ROAM $50/mo; Loudoun free index + $0.50/page images (+$2 or 4% fee), professional subscription available | search-confirmed |
| Independent cities | Alexandria, Fairfax City, Falls Church, Manassas, Manassas Park are county-equivalents: own assessor + own Circuit Court land records (Fairfax City & Falls Church land records are recorded in Fairfax County Circuit Court and Arlington Circuit Court respectively — VERIFY, not search-confirmed) | flagged |
| Notable quirk | Prince William County portal reportedly 403-blocks automation (repo lead); plan a FOIA/manual path | unverified |

---

## Virginia (statewide) — applies to every NoVA jurisdiction

### 2. recorder_deeds — transfer-tax statute
- **Code of Virginia, Title 58.1 Ch. 8 (State Recordation Tax)** — https://law.lis.virginia.gov/vacodefull/title58.1/chapter8/
  - verification: search-confirmed (URL in results). Also confirmed: §58.1-802.4 congestion relief fee https://law.lis.virginia.gov/vacode/title58.1/chapter8/section58.1-802.4/ and §58.1-802.3 https://law.lis.virginia.gov/vacode/title58.1/chapter8/section58.1-802.3/
  - access_method: manual · data_format: HTML · update_frequency: per legislative session · cost: free
  - terms_notes: public statute text, no restrictions
  - difficulty: easy — static statute text
  - notes: Grantor tax $0.50/$500 net consideration split state/locality; +$0.10/$100 congestion relief fee and +$0.10/$100 WMATA fee in NVTA jurisdictions (all NoVA core). Base §58.1-801 recordation rate not captured in a snippet — read the chapter.

### 9. evictions_rent_reg — GDC case records (eviction / unlawful detainer)
- **Virginia General District Court Online Case Information System** — https://eapps.courts.state.va.us/gdcourts/changeCourt.do
  - verification: search-confirmed
  - access_method: scrape · data_format: HTML · update_frequency: daily (court docketing) · cost: free
  - terms_notes: per-court, per-name/case/hearing-date search; no bulk export found in results; automation tolerance unknown — treat as fragile scrape and check vacourts.gov terms
  - difficulty: hard — search-form-only, one court at a time, no confirmed bulk/API
  - notes: All unlawful detainer (eviction) cases are GDC regardless of amount. Statewide OCIS also exists: https://eapps.courts.va.us — confirmed URL form was https://eapps.courts.state.va.us/ocis/details;oneCase=true (case-detail deep link). Virginia has no local rent control/registration in NoVA (state preemption) — record-access is the whole story here.

### 10. incentive_zones — Opportunity Zones
- **Virginia DHCD Opportunity Zones** — https://www.dhcd.virginia.gov/opportunity-zones-oz
  - verification: search-confirmed. Statewide PDF map: https://www.dhcd.virginia.gov/sites/default/files/Docx/oz/virginia-qualified-opportunity-zones-map.pdf
  - access_method: manual · data_format: PDF/HTML · update_frequency: static (2018 designations) · cost: free
  - difficulty: easy
- **VEDP GIS — Virginia's Designated Qualified Opportunity Zones (ArcGIS dataset)** — https://gis.vedp.org/datasets/89d63a87bbfe41c3b96b32bfadb0bfb2_31/about
  - verification: search-confirmed
  - access_method: gis_service · data_format: shapefile/GeoJSON via ArcGIS hub · update_frequency: static · cost: free
  - difficulty: easy — standard ArcGIS open-data download
  - notes: 212 QOZ tracts statewide; tracts in Fairfax (9 named tracts incl. Hybla Valley, Bailey's, Skyline), Arlington, Loudoun, Prince William. VEDP also hosts Enterprise Zones map at https://maps.vedp.org/zones/ (search-confirmed).

### 11. environmental — state database
- **Virginia DEQ Environmental Data Hub (GeoHub)** — https://geohub-vadeq.hub.arcgis.com/
  - verification: search-confirmed
  - access_method: gis_service · data_format: CSV/shapefile/GeoJSON (ArcGIS hub) · update_frequency: varies; Petroleum Release Sites layer updated daily · cost: free
  - difficulty: easy
- **VDEQ Environmental Data Mapper (EDM)** — https://apps.deq.virginia.gov/EDM/
  - verification: search-confirmed · access_method: manual (viewer) · difficulty: easy
- **Petroleum Release Sites dataset** — https://data.virginia.gov/dataset/petroleum-release-sites (also https://geohub-vadeq.hub.arcgis.com/datasets/57759688e4944bb987add68c4f0c5ada_104)
  - verification: search-confirmed · access_method: gis_service/bulk_download · update_frequency: daily · cost: free · difficulty: easy
  - notes: State db name = "Virginia Environmental Data Hub" / EDM (VDEQ). Covers petroleum releases, remediation/brownfield program layers.

### 11. environmental — FEMA flood
- **FEMA National Flood Hazard Layer (NFHL)** — https://www.fema.gov/flood-maps/national-flood-hazard-layer ; GIS web services: https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS
  - verification: search-confirmed
  - access_method: gis_service / bulk_download (state or county FIRM DB via MSC) · data_format: shapefile/GDB, WMS/REST · update_frequency: continuous (LOMR-driven) · cost: free
  - difficulty: easy — official WMS/REST + county/state downloads

---

## Metro-level

## 4. broker_comps (metro)
- **Newmark — Mid-Atlantic Multifamily Market Report** — https://www.nmrk.com/insights/market-report/mid-atlantic-multifamily-market
  - verification: search-confirmed · access_method: manual · data_format: PDF · update_frequency: quarterly · cost: free (may require email registration)
  - terms_notes: copyrighted research; use for context, do not redistribute
  - difficulty: medium — manual download, possible reg-wall
- **CBRE — Washington DC Multifamily Figures (quarterly)** — https://www.cbre.com/insights/figures/washington-dc-multifamily-figures-q2-2025
  - verification: search-confirmed (Q2 2025 edition URL) · access_method: manual · data_format: HTML/PDF · update_frequency: quarterly · cost: free · difficulty: medium — URL changes each quarter
- **CBRE — Washington D.C. 2026 U.S. Real Estate Market Outlook** — https://www.cbre.com/insights/reports/washington-d-c-2026-u-s-real-estate-market-outlook
  - verification: search-confirmed · annual · free download · difficulty: medium
- **Northmarq — Washington DC multifamily market overview** — https://www.northmarq.com/insights/insights/easing-construction-rebalances-regional-outlook-washington-dc-multifamily-market
  - verification: search-confirmed · manual · quarterly-ish · free · difficulty: medium
- JLL / Colliers / Cushman & Wakefield / Marcus & Millichap DC-metro reports: exist but exact URLs not captured before budget cut — **unverified**.
- **State sales-data file:** Virginia has no statewide sales file equivalent to PA STEB / MD SDAT — sales come per-county (e.g., Fairfax open-data sales table below). Not search-confirmed as a negative; treat as working assumption.

## 13. rent_demand (metro)
- **HUD FMR area** — "Washington-Arlington-Alexandria, DC-VA-MD HUD Metro FMR Area" (metro_code METRO47900M47900). Includes all nine `nova` jurisdictions. SAFMRs mandated for this metro (ZIP-level). FY2025 2BR FMR $2,314. FY2026 note: Calvert County MD removed from the area.
  - **HUD FMR API** — https://www.huduser.gov/portal/dataset/fmr-api.html — verification: search-confirmed · access_method: api · data_format: JSON · update_frequency: annual (FY) · cost: free (token registration) · difficulty: easy
  - Convenience view: https://www.rentdata.org/washington-arlington-alexandria-dc-va-md-hud-metro-fmr-area/2025 (search-confirmed; third-party)
- **Census/ACS**: use MSA 47900 and county FIPS (Fairfax 51059, Arlington 51013, Loudoun 51107, Prince William 51153, Alexandria 51510, Fairfax City 51600, Falls Church 51610, Manassas 51683, Manassas Park 51685) — standard API; not separately searched (unverified URLs, well-known service).
- **BLS**: Washington-Arlington-Alexandria MSA CES/LAUS series — standard; not separately searched.
- **Zillow ZORI / Apartment List**: cover Washington DC metro and county level; URLs not captured before budget cut — unverified.

---

## Fairfax County (CORE)

### 1. parcel_assessment
- **Fairfax County GIS Open Data — Tax Administration's Real Estate tables** — https://data-fairfaxcountygis.opendata.arcgis.com/
  - Sales: https://data-fairfaxcountygis.opendata.arcgis.com/datasets/Fairfaxcountygis::tax-administrations-real-estate-sales-data/about
  - Parcels: https://data-fairfaxcountygis.opendata.arcgis.com/datasets/Fairfaxcountygis::tax-administrations-real-estate-parcels-data/about
  - Assessed values: https://data-fairfaxcountygis.opendata.arcgis.com/datasets/63b4c91c3a16425fb5ef9118dbce39ba_2
  - Land data (REST): https://services1.arcgis.com/ioennV6PpG5Xodq0/ArcGIS/rest/services/OpenData_A6/FeatureServer/3
  - verification: search-confirmed (all four URLs in results)
  - access_method: gis_service + bulk_download (CSV/GeoJSON/shapefile from hub) · data_format: CSV/GeoJSON/shapefile/REST · update_frequency: not stated in snippets (DTA tables; likely nightly-to-periodic — verify) · cost: free
  - terms_notes: standard county open-data terms; clean
  - difficulty: easy — the anchor dataset for this metro; sales/values/land tables join to parcels on parcel ID
  - notes: **Assessments at 100% FMV, annual reassessment as of Jan 1** (county DTA, search-confirmed). ~357k parcels; 2025 residential +6.65% avg.
- **Real Estate Assessment Information Site** (per-parcel lookup) — https://hub.arcgis.com/datasets/3ccd806ad3464afe9a238ffc5d10594d — search-confirmed · manual · easy

### 2. recorder_deeds
- **Fairfax Circuit Court CPAN (Court Public Access Network)** — https://www.fairfaxcounty.gov/circuit/online-services/court-public-access-network
  - verification: search-confirmed
  - access_method: manual (subscriber web app) · data_format: HTML + document images · update_frequency: continuous · cost: **$150/quarter or $600/year; +$150 per additional user**
  - terms_notes: subscription + approval; records 1742–present; subscribers make non-certified copies. No bulk index export mentioned.
  - difficulty: hard — paywalled subscription, no API
  - notes: Copies info: https://www.fairfaxcounty.gov/circuit/land-records/copies (search-confirmed). Free eCaseSearch launched 2024 covers court case info, not land-record images.

### 3. zoning
- **Zoning GIS layer** — https://data-fairfaxcountygis.opendata.arcgis.com/datasets/Fairfaxcountygis::zoning-4/about
  - verification: search-confirmed · gis_service · shapefile/GeoJSON/CSV · updated with zoning actions · free · difficulty: easy
  - notes: covers county + Towns of Herndon & Vienna; fields: zoning code, category, jurisdiction, proffer flag, public-land flag. Overlay-district layer also published (tag FFX-Zoning: https://data-fairfaxcountygis.opendata.arcgis.com/search?tags=FFX-Zoning). Historical Zoning Viewer exists.
- **Zoning ordinance text (Municode)** — https://library.municode.com/va/fairfax_county/codes/code_of_ordinances — search-confirmed · manual · HTML · free · difficulty: easy · terms: Municode standard (no bulk scraping)
- Rezoning/variance case records: county interactive map of current zoning applications via https://www.fairfaxcounty.gov/planning-development/maps-and-geographic-applications (search-confirmed page; specific layer URL not captured)

### 5. tax_rates
- **DTA Real Estate Tax Rates page** — https://www.fairfaxcounty.gov/taxes/real-estate/tax-rates
  - verification: search-confirmed · manual · HTML · annual · free · difficulty: easy
  - notes: FY2026 (from 7/1/2025) rate $1.1225/$100; FY2025 $1.135/$100. Watch special districts (stormwater, commercial transportation) — itemized on this page.

### 6. permits_co
- **Building Records PLUS (open data)** — https://data-fairfaxcountygis.opendata.arcgis.com/datasets/Fairfaxcountygis::building-records-plus
  - verification: search-confirmed · gis_service · polygon layer w/ hyperlinks to PLUS records · **updated nightly** · free · difficulty: medium — links out to PLUS rather than embedding permit attributes
- **PLUS portal (Accela Citizen Access)** — https://plus.fairfaxcounty.gov/ — search-confirmed · scrape/manual · HTML · continuous · free · difficulty: hard for bulk (Accela search UI)

### 7. violations_liens
- **Dept. of Code Compliance (DCC)** — https://www.fairfaxcounty.gov/code/ ; FOIA request page https://www.fairfaxcounty.gov/code/dcc-vfoia-records-request
  - verification: search-confirmed · access_method: manual (VFOIA request) · PDF/paper · cost: FOIA copy fees · difficulty: hard
  - notes: ~9,000 complaints/yr; NO public open-data violations dataset found in searches. NOVs, investigation reports, photos obtainable via VFOIA.

### 8. sheriff_foreclosure / tax sales
- **TACS (Taxing Authority Consulting Services) — Fairfax judicial sale advertisements** — https://taxva.com/rs-tax-sales/fairfax-county-initial-advertisement-2/
  - verification: search-confirmed · manual · HTML/PDF lists · per-sale · free · difficulty: medium — third-party counsel site, per-auction pages
- **For Sale At Auction (court-appointed Special Commissioner auctions)** — https://www.forsaleatauction.biz/auctions/detail/bw129440 (example) — search-confirmed · manual · per-auction · free to view · difficulty: medium
  - notes: Judicial sales under Va. Code §58.1-3965. Non-judicial (trustee) foreclosures in VA are advertised in newspapers, not a county list — no county foreclosure dataset found.

### 9. evictions — via statewide GDC system (see Virginia section); Fairfax County GDC selected within same portal.

### 10. incentive_zones
- **Fairfax County Opportunity Zones page** — https://www.fairfaxcounty.gov/health-humanservices/opportunity-zones — search-confirmed · manual · HTML · static · free · easy
  - notes: 9 designated tracts (North Hill, Hybla Valley, Mount Vernon Woods, South County Center, Willston Center, Bailey's North/Glen Forest, Skyline Plaza, Herndon South, Lake Anne). No county TIF; VA uses no classic TIF in NoVA core (verify).

### 12. gis_open_data
- **Fairfax County GIS & Mapping Services Open Data Site** — https://data-fairfaxcountygis.opendata.arcgis.com/ (dept page https://www.fairfaxcounty.gov/maps/open-geospatial-data)
  - verification: search-confirmed · gis_service · all hub formats · varies · free · difficulty: easy
  - key layers: Tax Administration Real Estate (parcels/sales/values/land), Zoning + overlays, Building Records PLUS, plus ~170 layers in "Jade" viewer.

---

## Arlington County (CORE)

### 1. parcel_assessment
- **REA Property Polygons (parcels + real-estate attributes)** — https://gisdata-arlgis.opendata.arcgis.com/maps/ArlGIS::rea-property-polygons/about
  - verification: search-confirmed · gis_service · shapefile/GeoJSON/CSV · update cadence not in snippet · free · difficulty: easy
- **Arlington Open Data Directory** — https://data.arlingtonva.us/ — search-confirmed; hosts assessment/permit tables joinable by RealEstatePropertyCode
  - notes: **100% FMV, annual reassessment** (search-confirmed): 2025 overall values +2%, residential +3.7%.

### 2. recorder_deeds
- **Arlington Circuit Court Land Records / ROAM** — https://www.arlingtonva.us/Government/Departments/Courts/Circuit-Court/Land-Records ; index search https://landrec.arlingtonva.us/public/index.html ; purchase portal https://arlington.va.publicsearch.us/
  - verification: search-confirmed (all three URLs)
  - access_method: manual/scrape (free index) + subscription for images · data_format: HTML index, TIFF/PDF images · continuous · cost: **index free; images $50/month ROAM subscription; per-doc purchase $0.50/page + $2.00 transaction**
  - terms_notes: records 1869–present; free kiosk access in person
  - difficulty: medium — free online index is unusual for VA; images paywalled

### 3. zoning
- **Zoning Polygons layer** — https://gisdata-arlgis.opendata.arcgis.com/datasets/ArlGIS::zoning-polygons-1 — search-confirmed · gis_service · free · easy
- Static zoning map PDF: https://arlgis.arlingtonva.us/web_files/Maps/Standard_Maps/Zoning_Map.pdf (search-confirmed)
- Zoning ordinance text: Arlington County Code (county site/code repository) — exact URL not captured, **unverified**

### 5. tax_rates
- CY2025 rate **$1.033/$100**; CY2026 advertised $1.053/$100 (board news: https://www.arlingtonva.us/About-Arlington/Newsroom/Articles/2026/County-Board-Advertises-Tax-Rate-Increase-to-Protect-Core-Services — search-confirmed) · manual · HTML · annual · free · easy

### 6. permits_co
- **Permits Applications dataset** — https://data.arlingtonva.us/dataset/81 ; also on data.gov: https://catalog.data.gov/dataset/valuation-related-building-permits ("Valuation-Related Building Permits")
  - verification: search-confirmed · bulk_download/api (open-data portal) · CSV/JSON · update cadence not in snippet · free · difficulty: easy
  - notes: joins to REA data via RealEstatePropertyCode — clean permit↔parcel join.

### 7. violations_liens
- **Code Enforcement program page** — https://www.arlingtonva.us/Government/Programs/Building/Enforcement-Appeals/Code — search-confirmed · manual/FOIA · no public dataset found · difficulty: hard

### 8. sheriff_foreclosure — **unverified**: not researched before budget exhausted. Expect TACS/auction-counsel model like Fairfax.

### 10. incentive_zones — Arlington has designated OZ tracts (via VEDP layer above). County-specific page not captured — unverified.

### 12. gis_open_data
- **Arlington GIS Open Data** — https://gisdata-arlgis.opendata.arcgis.com/ (+ https://data.arlingtonva.us/) — search-confirmed · easy
  - key layers: REA Property Polygons, Zoning Polygons, permits tables (tabular portal).

---

## Loudoun County (CORE)

### 1. parcel_assessment
- **Loudoun County GeoHub — Loudoun Parcels** — https://geohub-loudoungis.opendata.arcgis.com/datasets/loudoun-parcels (hub: https://geohub-loudoungis.opendata.arcgis.com/)
  - verification: search-confirmed · gis_service · CSV/KML/zip/GeoJSON · **parcels updated daily** · free · difficulty: easy
- **Property lookup (assessment/sales/deed refs)** — https://www.loudoun.gov/parceldatabase (updated weekly) ; WebLogis map https://logis.loudoun.gov/
  - verification: search-confirmed · manual/scrape · HTML · weekly · free · difficulty: medium
  - notes: reassessment cycle: annual assumed (VA NoVA norm) — **not captured in snippet, verify**; tax rate not captured (budget cut) — Loudoun sets rate annually with budget.

### 2. recorder_deeds
- **Clerk of Circuit Court — land records remote access** — occasional users: https://www.loudoun.gov/Clerk/OnlineLandRecords ; subscription info: https://www.loudoun.gov/6256/Land-Records-Remote-Access
  - verification: search-confirmed
  - access_method: manual · HTML index + purchased images · continuous · cost: **index free; images $0.50/page + $2.00-or-4% convenience fee; professional subscription (unlimited) — price not in snippet, unverified**
  - difficulty: medium — free index; images per-page or subscription

### 3. zoning
- **Loudoun Zoning GIS layer** — https://geohub-loudoungis.opendata.arcgis.com/datasets/LoudounGIS::loudoun-zoning/about — search-confirmed · gis_service · free · easy
  - notes: layer IS the official zoning map, component of the ordinance. New Zoning Ordinance adopted/effective 2023-12-13 (replaced Revised 1993): https://www.loudoun.gov/zoningordinance (search-confirmed).

### 5. tax_rates — **unverified**: rate table URL not captured before budget exhausted (loudoun.gov budget/taxes pages).

### 6. permits_co — **unverified**: not researched (Loudoun uses LandMARC online permitting — repo/industry knowledge, unconfirmed).

### 7. violations_liens — **unverified**: not researched.

### 8. sheriff_foreclosure — **unverified**: not researched; expect TACS/judicial-sale model.

### 10. incentive_zones — OZ tracts exist in Loudoun (VEDP layer). County page unverified.

### 12. gis_open_data
- **Loudoun County GeoHub** — https://geohub-loudoungis.opendata.arcgis.com/ — search-confirmed · easy
  - key layers: Parcels (daily), Zoning (official), Address Points, Road Centerlines; downloads in CSV/KML/zip/GeoJSON/GeoTIFF/PNG.

---

## Prince William County (CORE) — NOT RESEARCHED (budget exhausted); repo leads only

All entries below are **unverified** except the OZ page.

- 1/12. parcel_assessment & gis_open_data: county site pwcva.gov; repo lead says the county property/GIS portal **403-blocks automated access** — plan county FOIA request or manual pulls; confirm whether an ArcGIS open-data hub exists. No URL recorded (none seen in results).
- 2. recorder_deeds: Prince William Circuit Court clerk secure remote access (subscription) — unverified, no URL.
- 3. zoning: county zoning GIS layer + DC Code/ordinance — unverified, no URL.
- 5–9: tax rates page, permits, code enforcement, tax sales (likely TACS), evictions via statewide GDC portal (that part confirmed at state level).
- 10. incentive_zones: **Federal Opportunity Zones page** — https://www.pwcva.gov/department/planning-office/federal-opportunity-zones — verification: search-confirmed · manual · HTML · static · free · easy.

## City of Alexandria (CORE) — NOT RESEARCHED (budget exhausted)

All categories **unverified**; no URLs recorded. Known structure to verify next pass: independent city; own Office of Real Estate Assessments (annual, 100% FMV expected); own Circuit Court land records with subscription remote access; zoning via city GIS/open data (city runs an ArcGIS hub); permits via APEX/Energov-type portal; OZ tracts exist citywide per DHCD map. Statewide entries (GDC evictions, VDEQ, NFHL, OZ layer, transfer taxes incl. NVTA fees) all apply.

---

## Secondary jurisdictions (categories 1, 2, 3, 12 minimum)

### Fairfax City
- 3. zoning: **Interactive zoning map** — https://www.fairfaxva.gov/Property-Business/Development/Interactive-Maps-Planning-Tools/Zoning-Map — search-confirmed · manual/gis_service · free · easy
- 1/2/12: **unverified** — independent city with own assessor (annual assumed); land records: verify which Circuit Court records Fairfax City deeds (commonly Fairfax County Circuit Court). Included in HUD FMR area (confirmed). Not researched further.

### Falls Church (City)
- 1/2/3/12: **unverified** — not researched (budget). Independent city, own assessor; land records recorded at Arlington Circuit Court per common practice — VERIFY. In HUD FMR area (confirmed).

### Manassas (City)
- 1/2/3/12: **unverified** — not researched (budget). Own assessor + own Circuit Court (shared clerk arrangements with Prince William possible — VERIFY). In HUD FMR area (confirmed).

### Manassas Park (City)
- 1/2/3/12: **unverified** — not researched (budget). Smallest VA independent city; assessment cycle may NOT be annual (small cities may reassess less frequently under Va. Code) — VERIFY. In HUD FMR area (confirmed).
