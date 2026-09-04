# Richmond, VA — public data source registry (`richmond`)

Researched 2026-08-25 via WebSearch only (egress-blocked container; no direct fetches). URLs are recorded exactly as they appeared in search results. `verification=search-confirmed` means the literal URL appeared in a result listing/snippet.

**Coverage:** CORE — Richmond City, Henrico County, Chesterfield County. SECONDARY — Hanover County.

## Key facts

| Fact | Value |
|---|---|
| Assessment ratio | 100% of fair market value, statewide (Va. Code § 58.1-3201) |
| Reassessment cycle | ANNUAL in all four jurisdictions (Richmond City, Henrico, Chesterfield, Hanover). Chesterfield notices by Feb 1, values as of Jan 1; Hanover values as of Jan 1; Richmond 2026 notices mailed Sept 2025 |
| 2025–26 RE tax rates | Richmond City $1.20/$100 (2026); Henrico $0.83/$100 (2025, after 2¢ cut); Chesterfield $0.89/$100 (2026); Hanover — not captured |
| Transfer taxes | State recordation $0.25/$100 (Title 58.1 Ch. 8); locality may add 1/3 of state tax (≈$0.0833/$100); grantor tax $0.50/$500 = $0.10/$100 (§ 58.1-802), split state/locality. NoVa WMATA/regional add-ons do **not** apply in the Richmond region |
| Deed records | Independent city + counties each have their own Circuit Court clerk. Online deed images are **paywalled Secure Remote Access (SRA) subscriptions** everywhere (Va. Code § 17.1-294): Richmond $50/mo (6-mo min), Chesterfield $600/yr (Logan Systems; free name-only index), Henrico fee undisclosed (Logan Systems), Hanover via Tyler self-service |
| Foreclosures | Virginia is **non-judicial** (trustee sales advertised in newspapers; no central registry). Tax-delinquent parcels go through Circuit Court judicial sale (58.1 Ch. 39 Art. 4), auctioned by vendors (Motleys for Richmond City) |
| Rent regulation | None in Virginia (no rent control / just-cause / landlord registry). Evictions = unlawful detainer in General District Court; free statewide case search, no API |
| Standout easy wins | Richmond assessor's free monthly Excel bulk files (incl. transfers/sales); Henrico + Chesterfield + Hanover ArcGIS Hub parcel/zoning layers; Richmond Socrata portal; Richmond delinquent-tax open dataset |

---

## Richmond City

### parcel_assessment
- **City Assessor Public Data Sets** — https://www.rva.gov/index.php/assessor-real-estate/data-request
  - verification: search-confirmed · access: bulk_download · format: Excel · updates: monthly (~15th) · cost: free
  - terms: free, no registration mentioned; includes **Transfers and Market Sale Reports** (a de-facto sales file)
  - difficulty: **easy** — official free bulk download
  - notes: 3 files: address/legal, land+building characteristics + ownership, assessment history. 100% FMV, annual reassessment; 2026 rate $1.20/$100.
- **Property Search (interactive)** — https://www.rva.gov/assessor-real-estate/property-search
  - verification: search-confirmed · access: manual · format: HTML · cost: free · difficulty: **medium** (one-off lookups; incl. consideration amounts). Legacy parcel/tax search: https://apps.richmondgov.com/applications/parceltaxsearch/Default

### recorder_deeds
- **Circuit Court Clerk Secure Remote Access (SRA)** — https://www.rva.gov/office-circuit-court-clerk/sra
  - verification: search-confirmed · access: manual · format: HTML index + images · updates: continuous
  - cost: **$50/month per user, 6-month minimum prepaid**, clerk approval required
  - terms: subscribers only, per-user credential; no bulk index export · difficulty: **hard** — paywalled, application-gated
  - notes: deeds to 1782 (north of James) / 1874 (south). Free info page: https://www.rva.gov/office-circuit-court-clerk/deed-search. Free VADeed Alert fraud-watch service. Transfer taxes per Key facts.

### zoning
- **Chapter 30 Zoning (Municode)** — https://library.municode.com/va/richmond/codes/code_of_ordinances?nodeId=CH30ZO
  - verification: search-confirmed · access: scrape · format: HTML · cost: free · difficulty: **medium** (Municode navigation)
- **Zoning Districts GIS layer (Richmond GeoHub)** — https://richmond-geo-hub-cor.hub.arcgis.com/datasets/zoning-districts-1/about
  - verification: search-confirmed · access: gis_service · format: ArcGIS FeatureServer + GeoJSON/CSV/shp exports · cost: free · difficulty: **easy**
  - notes: **Zoning Parcel Mapper** app (shows special use permits / special zoning per parcel) via https://www.rva.gov/planning-development-review/interactive-mapping-tools

### tax_rates
- **Finance — Real Estate** — https://www.rva.gov/finance/real-estate
  - verification: search-confirmed · access: manual · format: HTML · updates: annual · cost: free · difficulty: **easy**
  - notes: 2026 rate $1.20/$100 (council held rate; VPM coverage). Single city rate — no separate school tax in VA.

### permits_co
- **Open Data Portal (Socrata) permit datasets** — https://data.richmondgov.com/
  - verification: search-confirmed (portal); specific permits dataset URL **not captured** before search budget exhausted
  - access: api (SODA) · format: JSON/CSV · cost: free · terms: no fee/registration/encumbrance per portal · difficulty: **easy**
  - notes: statewide fallback CSV: https://data.virginia.gov/dataset/building-permits-applications1/resource/d66e8fbe-ce6f-431b-873b-b017a8c42861 (search-confirmed; granularity unverified)

### violations_liens
- **Property Maintenance / Code Enforcement (PDR) + RVA311** — https://www.rva.gov/planning-development-review/property-maintenance-code-enforcement
  - verification: search-confirmed · access: manual · format: HTML · cost: free · difficulty: **hard** — no confirmed self-service violation lookup; per-property inquiry/FOIA
  - notes: uncorrected violations → city abatement with **tax lien**. Lien/distress screen: **Delinquent Real Estate Taxes (6+ months) dataset** https://data.richmondgov.com/Well-Managed-Government/Delinquent-Real-Estate-Taxes-Six-Months-or-More-/83t5-hbac (search-confirmed, Socrata API — easy)

### sheriff_foreclosure
- **Tax-delinquent judicial sales (RVA Tax Sale / Motleys) + Delinquent Collections** — https://www.rva.gov/finance/delinquent-collections
  - verification: search-confirmed (also https://www.motleys.com/news/detail/rva-tax-sales-are-back) · access: manual · format: HTML auction listings · updates: periodic events · cost: free to view · difficulty: **medium**
  - notes: judicial-sale statute 58.1 Ch. 39 Art. 4; owner may redeem until day before sale. Mortgage foreclosures = non-judicial trustee sales via newspaper legal ads (no registry).

### evictions_rent_reg
- See **Statewide** section (GDC Online Case Information System — Richmond GDC selected in-app).

### incentive_zones
- **AHTEP (Affordable Housing Partial Tax Exemption)** — https://www.rva.gov/housing-and-community-development/partial-tax-exemption
  - verification: search-confirmed · access: manual · format: HTML/PDF · cost: free · difficulty: **medium**
  - notes: **the old across-the-board rehab abatement was repealed ~2020** and replaced by AHTEP (≥30% units at ≤80% AMI, annual rent verification, 24-month completion). Statutory basis for commercial rehab exemptions: § 58.1-3221 (law.lis.virginia.gov, search-confirmed).
- **Enterprise Zones dataset** — https://data.richmondgov.com/Economic-Growth/Enterprise-Zones/wive-3qc7
  - verification: search-confirmed · access: api (Socrata) · format: JSON/CSV geo · cost: free · difficulty: **easy**
  - notes: EDA EZ/CARE lookup map https://richmondeda.com/enterprise-zone-and-care-program-map/; state EZ layer https://gis.vedp.org/datasets/394e709c529a4ec3bcc644dbd03d91f2_3/explore; OZ: https://www.dhcd.virginia.gov/opportunity-zones-oz + PDF map https://www.dhcd.virginia.gov/sites/default/files/Docx/oz/virginia-qualified-opportunity-zones-map.pdf + VEDP OZ layer https://gis.vedp.org/datasets/89d63a87bbfe41c3b96b32bfadb0bfb2_31 (all search-confirmed)

### environmental
- See **Statewide** section (DEQ hub + FEMA NFHL).

### gis_open_data
- **Richmond GeoHub (ArcGIS Hub)** — https://richmond-geo-hub-cor.hub.arcgis.com/ (root inferred from confirmed search/category pages, e.g. .../search?tags=zoning) + **Socrata portal** https://data.richmondgov.com/ (search-confirmed)
  - access: gis_service + api · format: ArcGIS REST / GeoJSON / shp; Socrata JSON/CSV · cost: free · difficulty: **easy**
  - key layers: Zoning Districts, parcels, Enterprise Zones, delinquent-tax dataset; Socrata assessment data updated quarterly (per CSX Parcels snippet)

---

## Henrico County

### parcel_assessment
- **GIS Open Data (parcels) + Real Estate Property Search** — https://data-henrico.opendata.arcgis.com/ ; property search https://realestate.henrico.us/ords/cam/f?p=510101:5:::NO:5,7,8:P5_ROWNUM,P5_SEARCH_TYPE:1,1 ; landing https://henrico.gov/public-data/gis-open-data/
  - verification: search-confirmed · access: gis_service · format: CSV/KML/shp/GeoJSON · cost: free · difficulty: **easy**
  - notes: 100% FMV, **annual** reassessment (https://henrico.gov/finance/divisions/real-estate-assessment-division/). Web display authorized by § 58.1-3122.2.

### recorder_deeds
- **Circuit Court online land records (Logan Systems / OCRA)** — https://henrico.gov/services/view-circuit-court-online-records/
  - verification: search-confirmed (page); **fee amount not disclosed anywhere in results — unverified** · access: manual · cost: subscription (clerk 804-501-4202) · difficulty: **hard**
  - notes: application doc https://henrico.gov/assets/OCRA_APPLICATION-AND-USER-AGREEMENT.doc; per-user, clerk-approved; no bulk index.

### zoning
- **Chapter 24 Zoning (Municode) + GIS zoning layer** — https://library.municode.com/va/henrico_county/codes/code_of_ordinances?nodeId=CD_ORD_CH24ZO_ART3ZODI ; layer https://data-henrico.opendata.arcgis.com/datasets/zoning-3 ; county page https://henrico.gov/public-data/zoning-ordinance/
  - verification: search-confirmed · access: gis_service · format: GeoJSON/CSV/KML/shp + **GeoServices/WMS/WFS** APIs · cost: free · difficulty: **easy**

### tax_rates
- **Real Estate Assessment Division** — https://henrico.gov/finance/divisions/real-estate-assessment-division/
  - verification: search-confirmed · access: manual · updates: annual · cost: free · difficulty: **easy**
  - notes: 2025 rate **$0.83/$100** (2¢ cut; lowest of VA's 10 largest localities).

### permits_co
- **Build Henrico + monthly Building Permits public data** — https://henrico.gov/bldg/public-data/ (monthly pages e.g. https://henrico.gov/public-data/building-permits-october-2025/)
  - verification: search-confirmed · access: bulk_download · format: monthly files (job address/info, owner, contractor) · updates: monthly · cost: free · difficulty: **easy**
  - notes: all permits after 2021-08-30 in Build Henrico; Permit Center https://henrico.gov/permitcenter/

### violations_liens
- **Code Enforcement and Complaints** — https://henrico.gov/build/code-enforcement-and-complaints/
  - verification: search-confirmed · access: manual · cost: free · difficulty: **hard** — complaint-driven, no public bulk violation search confirmed

### sheriff_foreclosure
- **Tax-delinquent judicial sales (auctioneer-run)** — example listing https://www.forsaleatauction.biz/auctions/detail/bw69591 (2021 sale)
  - verification: search-confirmed (that listing only; current county sale page not surfaced) · access: manual · difficulty: **medium**

### incentive_zones
- **Henrico Opportunity Zones** — https://henrico.gov/revit/opportunity-zones/
  - verification: search-confirmed · access: manual · cost: free · difficulty: **easy** · notes: statewide VEDP/DHCD layers also cover Henrico

### gis_open_data
- **Henrico GIS Open Data (ArcGIS Hub)** — https://data-henrico.opendata.arcgis.com/
  - verification: search-confirmed · access: gis_service · format: CSV/KML/Zip/GeoJSON/GeoTIFF/PNG · cost: free · difficulty: **easy**
  - key layers: parcels, zoning (WMS/WFS), planning, transportation

---

## Chesterfield County

### parcel_assessment
- **Real Estate Assessment Data (READ) + Open GIS parcels** — https://www.chesterfield.gov/828/Real-Estate-Assessment-Data ; parcels layer https://geospace.chesterfield.gov/datasets/d38f30b3216d45d4b5d779edfeff0b51_3
  - verification: search-confirmed · access: gis_service + manual app · format: HTML / GeoJSON/CSV/shp · cost: free · difficulty: **easy**
  - notes: 100% FMV, **annual** — notices by Feb 1, values as of Jan 1 (https://www.chesterfield.gov/823/Real-Estate-Assessments). 2026 rate $0.89/$100.

### recorder_deeds
- **Circuit Court Clerk Land Records — SRA (Logan Systems) + free index** — https://www.chesterfield.gov/1278/Land-Records ; Logan public site https://www.ccclandrecords.org/ ; remote-access site https://cccinternalbooks.org/
  - verification: search-confirmed · access: manual · updates: continuous
  - cost: **$600/user/year ($300 per 6 months)**, $2 card fee; **free name-search index without registration**
  - terms: images paywalled; free tier index-only · difficulty: **hard**
  - notes: deeds online 1967–current, wills 1994–current; SRA contact 804-748-1241 / chesterfieldsra@chesterfield.gov

### zoning
- **Zoning Ordinance Ch. 19.2 (enCodePlus)** — https://online.encodeplus.com/regs/chesterfieldcounty-va/page/zoning-districts-and-land-uses ; ordinances page https://www.chesterfield.gov/998/Ordinances-Policies-and-Regulations
  - verification: search-confirmed · access: scrape · format: HTML · cost: free · difficulty: **medium** (enCodePlus is scrape-unfriendly)
  - notes: **new zoning ordinance effective 2026-01-01**; Case Information app shows active/archived zoning cases + land-use category, district, overlays per parcel; districts grouped Residential / Commercial-Mixed-Use / Employment / Overlay

### tax_rates
- **Real Estate Assessments page** — https://www.chesterfield.gov/823/Real-Estate-Assessments
  - verification: search-confirmed · updates: annual · cost: free · difficulty: **easy** · notes: 2026 $0.89/$100; RE tax article in Municode Ch. 9 Art. II

### permits_co
- **Enterprise Land Management (ELM) citizen access portal** — referenced from https://www.chesterfield.gov/4034/Enforcement
  - verification: **unverified** — ELM's direct URL never surfaced before the search budget was exhausted; existence confirmed only via Enforcement-page snippet
  - access: manual · cost: free · difficulty: **medium** · notes: no open bulk permit dataset confirmed

### violations_liens
- **Community Enhancement code compliance (via ELM)** — https://www.chesterfield.gov/4034/Enforcement
  - verification: search-confirmed · access: manual · cost: free · difficulty: **hard** — complaint-based; no public violation-history search confirmed (804-748-1500)

### sheriff_foreclosure
- **Tax-delinquent judicial sales** — *NOT RESEARCHED*
  - verification: **unverified** — the shared session search budget ran out before this query; statewide judicial-sale statute applies; expect treasurer-contracted auctions like Richmond/Henrico

### incentive_zones
- Statewide DHCD OZ / VEDP EZ layers (see Richmond City incentive_zones URLs — search-confirmed, statewide coverage).

### gis_open_data
- **Chesterfield Open GIS Data** — https://opengisdata.chesterfield.gov/ (also https://opengeospace.chesterfield.gov/search ; app gallery https://geospace.chesterfield.gov/pages/real-estate-application-gallery)
  - verification: search-confirmed · access: gis_service · format: CSV/KML/Zip/GeoJSON/GeoTIFF/PNG · cost: free · difficulty: **easy**
  - key layers: addresses, streets, parcels, subdivisions; real-estate app gallery

---

## Hanover County (SECONDARY)

### parcel_assessment
- **Hanover Parcels (GIS w/ assessment attributes)** — https://data-hanovercounty.hub.arcgis.com/datasets/hanovercounty::hanover-parcels ; assessor https://www.hanovercounty.gov/185/Assessor ; assessments https://www.hanovercounty.gov/262/Real-Estate-Assessments
  - verification: search-confirmed · access: gis_service · format: GeoJSON/CSV/shp · updates: **monthly** (GIS) · cost: free · difficulty: **easy**
  - notes: **annual** assessment at 100% FMV as of Jan 1; BOE appeal deadline Mar 15

### recorder_deeds
- **Circuit Court land records — Tyler self-service + SRA** — https://hanovercountyva-web.tylerhost.net/web/user/disclaimer (historical index https://hanovercountyva-web.tylerhost.net/web/historicalIndex/HISTORICAL_IN) ; county pages https://www.hanovercounty.gov/322/Deeds-Plats---Self-Service , https://www.hanovercounty.gov/316/Circuit-Court-Clerk
  - verification: search-confirmed · access: manual · cost: SRA subscription (fee not stated in snippets); register via Self Service; (804) 365-6864 · difficulty: **hard**

### zoning
- **Zoning Ordinance Chapter 26** — https://www.hanovercounty.gov/357/Ordinances (hosted via Municode; Subdivision = Ch. 25)
  - verification: search-confirmed · access: scrape · format: HTML · cost: free · difficulty: **medium** (GIS zoning layer not individually confirmed — check county hub)

### gis_open_data
- **Hanover County GIS Data hub** — https://data-hanovercounty.hub.arcgis.com/ ; Parcel Search & Mapping via https://www.hanovercounty.gov/557/My-Property
  - verification: search-confirmed · access: gis_service · updates: monthly · cost: free · difficulty: **easy**

---

## Statewide sources (apply to all four jurisdictions)

### evictions_rent_reg
- **VA General District Court Online Case Information System** — https://eapps.courts.state.va.us/gdcourts/changeCourt.do (hub: https://www.vacourts.gov/caseinfo/home)
  - verification: search-confirmed · access: scrape · format: HTML · cost: free, no account · difficulty: **hard** — per-court selection (Richmond City / Henrico / Chesterfield / Hanover GDC each searched separately), name/case/hearing-date queries only, no API/bulk; automated access fragile
  - notes: Virginia has **no rent control, just-cause, or landlord registration**; evictions are unlawful detainers in GDC. Self-help guide: https://selfhelp.vacourts.gov/page/10/landlord-tenant

### environmental
- **VA DEQ Environmental Data Hub** — Petroleum Release Sites layer https://geohub-vadeq.hub.arcgis.com/datasets/57759688e4944bb987add68c4f0c5ada_104 (updated **daily**); dataset mirror https://data.virginia.gov/dataset/petroleum-release-sites; Brownfields Development Resource Tool https://www.deq.virginia.gov/land-waste/remediation-programs/brownfields; VRP https://www.deq.virginia.gov/land-waste/remediation-programs/voluntary-remediation
  - verification: search-confirmed · access: gis_service · cost: free · difficulty: **easy**
- **FEMA NFHL** — https://www.fema.gov/flood-maps/national-flood-hazard-layer
  - verification: search-confirmed · access: gis_service (REST web services) + bulk_download (by county/state via Map Service Center) · format: GIS/shapefile · cost: free · difficulty: **easy**

---

## Broker comps (METRO)

- **Cushman & Wakefield | Thalhimer** — MarketBeats https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats/richmond-marketbeats ; local reports https://thalhimer.com/marketwatch/market-reports/richmond-va/
  - verification: search-confirmed · access: manual · format: PDF · updates: quarterly · cost: free (some email registration) · difficulty: **medium**
  - terms: copyrighted research — cite, don't redistribute. Thalhimer = dominant local shop, best granularity.
- **Colliers** — https://www.colliers.com/en/research/richmond/2025-q4-richmond-office-report · **Newmark** — https://www.nmrk.com/insights/market-report/richmond-real-estate-market-reports · **CBRE** — https://www.cbre.com/insights/figures/richmond-industrial-market-figures-q4-2022 (example)
  - verification: search-confirmed · access: manual · format: PDF/HTML · updates: quarterly · difficulty: **medium**
  - notes: JLL and Marcus & Millichap Richmond pages did not surface before budget exhausted. **No Virginia statewide sales-data file exists** (unlike PA STEB / NJ SR1A) — transfers come from clerk SRA subscriptions or the Richmond assessor's monthly Transfers & Market Sale Reports.

## Rent & demand (METRO)

- **HUD FMR** — https://www.huduser.gov/portal/datasets/fmr.html (FY2026 effective 2025-10-01); Virginia Housing FMR page https://www.virginiahousing.com/en/partners/housing-choice-vouchers/federal-fair-market-rents
  - verification: search-confirmed (portal); exact "Richmond, VA HMFA" area name not shown in any snippet — **naming unverified**
  - access: bulk_download · format: CSV/Excel · updates: annual · cost: free · difficulty: **easy**
- **Zillow ZORI** — free metro-level CSVs via https://www.zillow.com/research/data/ (referenced in result snippets) · monthly · free · **easy**
- **FRED** — Richmond MSA building permits series https://fred.stlouisfed.org/series/RICH051BPPRIVSA (search-confirmed) · API · monthly · free · **easy**
- **Apartment List** — Richmond coverage **unverified** (did not surface in results).
- Census/ACS (B25 rent/vacancy tables) + BLS CES/LAUS for the Richmond MSA apply as standard; Richmond Fed publishes local rent-conditions research (richmondfed.org).
