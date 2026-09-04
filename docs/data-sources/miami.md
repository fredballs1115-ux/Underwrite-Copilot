# Miami FL — public-data source registry

Coverage per `COVERAGE.md`: **Core** = Miami-Dade County (Miami, Miami Beach, Hialeah,
Coral Gables, North Miami, Homestead) — matches the Miami-Miami Beach-Kendall HMFA.
**Secondary** = Broward County (Fort Lauderdale, Hollywood). Palm Beach out of scope.

URLs recorded as they appeared in search results (2026-08-25); `search-confirmed`
means the URL surfaced verbatim in a search listing, not that the page was opened.

## Key facts

| Fact | Value |
|---|---|
| Assessment ratio | Just (market) value standard; **Save Our Homes** caps homestead assessed-value growth at min(3%, CPI); non-homestead cap 10% (since 2009 roll) |
| Reassessment cycle | Annual (TRIM notices mailed mid-August; 25-day VAB petition window) |
| Transfer tax | FL documentary stamp $0.60/$100 in Miami-Dade + **$0.45/$100 county surtax** (surtax exempt for single-family transfers ⇒ commercial/multifamily pays $1.05/$100). Note stamp on deeds; separate note stamps/intangible tax on mortgages |
| Recorder | Clerk of Courts official records — standard online search **free**; premium search $1.00/search unit |
| Sales data | Property Appraiser rolls carry sales/transfer history; bulk extracts free (weekly) — FL is a disclosure state |
| Foreclosure | Judicial; online auctions via RealAuction (clerk-run), Mon–Wed 9am; tax deeds monthly online; tax certificate sale June 1 (LienHub) |
| Rent regulation | None — FL preempts local rent control; no rental registration regime to mine |
| FY2026 2BR FMR | $2,436 metro (aggregator-quoted, +5% vs FY2025; SAFMR area — ZIP ex.: 33233 = $2,440). HUD-attributed page did not display the number in snippets — treat as pending primary confirmation |

## Miami-Dade County (core — all categories)

### 1. parcel_assessment
- **Property Appraiser property search** — `https://www.miamidadepa.gov/pa/real-estate/property-search.page` (also legacy `https://www.miamidade.gov/PA/`) — search by address/owner/subdivision/folio; market, assessed, taxable values, sales history, exemptions, TRIM.
- **Bulk data file download** — `https://bbs.miamidadepa.gov/` ("Miami Dade Property Appraiser File Library"; legacy `https://bbs.miamidade.gov/`) — standardized extract files from the PA system, typically rebuilt weekly; custom files via PADataRequest@miamidadepa.gov.
- **GIS parcels** — `https://gis-mdc.opendata.arcgis.com/datasets/MDC::parcel/about` (ownership-boundary polygons); Property Boundary view with PA attributes updated weekly (per hub description).
- FL facts: just value standard, SOH 3%/CPI homestead cap, 10% non-homestead cap, annual TRIM mid-August.

### 2. recorder_deeds
- **Clerk of Courts official records search** — `https://onlineservices.miamidadeclerk.gov/officialrecords/StandardSearch.aspx` (standard search, free) — deeds, mortgages, liens; overview `https://www.miamidadeclerk.gov/clerk/official-records.page`. Advanced/premium searches $1.00 per search unit; staff searches $2/name/year.
- Doc stamps: $0.60/$100 deed + $0.45/$100 Miami-Dade surtax (single-family exempt from surtax) — DOR pages `https://floridarevenue.com/taxes/taxesfees/Pages/doc_stamp.aspx`, guide PDF `https://floridarevenue.com/Forms_library/current/gt800014.pdf`.

### 3. zoning
- County (unincorporated) zoning layers live on the county open data hub (`https://gis-mdc.opendata.arcgis.com/` — search "zoning"); zoning records searchable free per the county public-records service page (`https://www.miamidade.gov/global/service.page?Mduid_service=ser149695713973833`). Municipal codes are per-city (Miami 21 below; Miami Beach/Hialeah via their portals).

### 5. tax_rates
- **Millage tables** — `https://www.miamidadepa.gov/pa/millage_tables.asp` — annual millage by taxing district; 30+ municipalities; combined rates ~1.6%–2.5%+ of taxable value; bills due Nov 1 with early-payment discounts.

### 6. permits_co
- **Miami-Dade permit portal** — `https://www.miamidade.gov/permits/` and Building online services `https://www.miamidade.gov/global/economy/building/online-services.page` — permit history, inspections, open permits by folio (Building Permit Selection Menu; iBuild for applications). Permits/plans/certificates/zoning records searchable free.

### 7. violations_liens
- **Building regulation / code case search (RER)** — `https://www.miamidade.gov/Apps/RER/RegulationSupportWebViewer/` — building-code enforcement cases in unincorporated Miami-Dade by address/owner.
- **Code Compliance Violation dataset** — `https://gis-mdc.opendata.arcgis.com/datasets/MDC::code-compliance-violation/about` (+ `Code Violations` layer) — bulk GIS of county violations.
- **Unsafe structures** — enforced by Consumer & Neighborhood Protection (`https://www.miamidade.gov/global/economy/neighborhood-compliance/building-code-enforcement.page`); clerk code-enforcement citation system `https://www.miamidadeclerk.gov/clerk/code-enforcement.page`.

### 8. sheriff_foreclosure
- **Mortgage foreclosure auctions (judicial)** — clerk page `https://www.miamidadeclerk.gov/clerk/mortgage-foreclosures.page`; online sales Mon/Tue/Wed 9:00am since Aug 2018 on the RealAuction platform (summary text quoted www.miamidade.realforeclose.com — URL not itself a result listing; confirm in production).
- **Tax deeds** — `https://www.miamidadeclerk.gov/clerk/property-tax-deeds.page`; monthly online tax-deed auctions (RealAuction realtaxdeed subdomain per results); certificate sale ~June 1 via **LienHub** `https://lienhub.com/county/miamidade/certsale/main`; Tax Collector page `https://mdctaxcollector.gov/services/tax-certificate-sales`.

### 9. evictions_rent_reg
- **Clerk records / case search** — `https://www.miamidadeclerk.gov/clerk/records.page` — evictions in the Civil, Family and Probate Online System (free standard, fee-based advanced); eviction filing court-location finder `https://www2.miamidadeclerk.gov/EvictionFilingCourtLocationFinder`.
- Rent regulation: none — Florida preempts local rent control; no rental registration regime (rule text in `data/research/regulatory_rules.json`).

### 10. incentive_zones
- **Community Redevelopment Areas (CRA) layer** — `https://gis-mdc.opendata.arcgis.com/datasets/community-redevelopment-area/about`; program pages `https://www.miamidade.gov/global/management/community-redevelopment-agencies.page` (5 county CRAs + 11 municipal, 15+ active).
- **Opportunity Zones** — HUD OZ map `https://opportunityzones.hud.gov/resources/map`; city CRA-district layer under City of Miami below. (FL DEO OZ page did not surface — unverified.)

### 11. environmental
- **DERM Contaminated Site layer** — `https://gis-mdc.opendata.arcgis.com/datasets/43750f842b1e451aa0347a2ca34a61d7_0` (open DERM contamination cases; layer doc `https://gisweb.miamidade.gov/GISSelfServices/Data/HTML/ContaminatedSite.htm`).
- **FDEP Cleanup Sites** — `https://geodata.dep.state.fl.us/datasets/dep-cleanup-sites` (+ Florida Superfund layer) — statewide sites in/awaiting cleanup.
- **FEMA NFHL** — see Seattle entry pattern; county GIS download via MSC. High materiality in Miami (coastal flood zones).

### 12. gis_open_data
- **Miami-Dade County Open Data Hub** — `https://gis-mdc.opendata.arcgis.com/` — parcels, property boundary, CRA, contaminated sites, code violations; most production data free to download. Companion portal `https://opendata.miamidade.gov/`.

## City of Miami (core)

### 3. zoning
- **Miami 21 (form-based code)** — code text `https://www.miami.gov/Planning-Zoning-Land-Use/View-City-of-Miami-Zoning-Code-Miami-21` and Municode (`https://library.municode.com/fl/miami/codes/miami_21_(zoning_code)`); **M21 zoning GIS layer** `https://datahub-miamigis.opendata.arcgis.com/datasets/m21-zoning/about` (transect zones); zoning atlas `https://www.miami21.org/zoningatlas.asp`.

### 6. permits_co
- **Permit history search** — `https://www.miami.gov/Permits-Construction/Permitting-Resources/View-Permit-HistoryPermit-Search` — by permit number, process number, or address.

### 7/12. violations & open data
- **City of Miami Open Data GIS** — `https://datahub-miamigis.opendata.arcgis.com/` — code-enforcement zones/offices layers, CRA districts (`.../datasets/MiamiGIS::cra-districts/about`), OZ-relevant layers; data explorer `https://www.miami.gov/Open-APIs-Datasets`.

## City of Miami Beach (core)

- **Civic Access (Tyler EnerGov CSS)** — `https://www.miamibeachfl.gov/business/civicaccess/`; self-service portal `https://energovcss.miamibeachfl.gov/energovprod/selfservice` — building permits, plans, code-compliance citations, special-master cases, BTRs; building dept online resources `https://www.miamibeachfl.gov/city-hall/building/onlinepermits/`.

## City of Hialeah (core)

- **Building permit search** — `https://apps.hialeahfl.gov/building/` (portal page `https://www.hialeahfl.gov/205/Building-Permit-Search`) — permit status by address/permit number.

## Broward County (secondary — categories 1, 2, 3, 12)

### 1. parcel_assessment
- **BCPA (Property Appraiser)** — `https://bcpa.net/`; search client `https://web.bcpa.net/bcpaclient/index.html` — values, ownership, sales history, exemptions; interactive parcel web map `https://gisweb-adapters.bcpa.net/bcpawebmap_ex/bcpawebmap.aspx`. Same FL assessment facts (SOH, 10% non-homestead cap, TRIM).

### 2. recorder_deeds
- **Official records search (AcclaimWeb)** — `https://officialrecords.broward.org/AcclaimWeb` (landing `https://officialrecords.broward.org/`) — index Jan 1, 1978→present; images since Aug 1998; search by name/doc type/date. Recording division FAQs at broward.org. Broward doc stamps: state $0.70/$100 outside Miami-Dade (rate differs from Miami-Dade's $0.60+surtax — verify per-deal).

### 3. zoning / 12. gis_open_data
- **Broward County GeoHub** — `https://geohub-bcgis.opendata.arcgis.com/` — planning/zoning layers, GIS content download page; note: parcel + tax-roll data and aerials are **purchased** through BCPA per GeoHub resources page (a cost quirk vs Miami-Dade's free hub).

## Metro-level

### 4. broker_comps
- **Colliers South Florida Multifamily** — `https://www.colliers.com/en/research/miami/sfl-multifamily-report-26q1` (Q1 2026: cap rates ~5.0%, $946M quarterly volume).
- **MMG Miami market report** — `https://mmgrea.com/miami-q2-2026-market-report/`.
- **Marcus & Millichap Miami forecast** — 2026 investment forecast coverage via press (South Florida Agent summary `https://southfloridaagentmagazine.com/2026/01/28/miamis-multifamily-report-2026/`).
- FL is a disclosure state — PA sales rolls + doc-stamp-derived prices are the primary comps evidence.

### 13. rent_demand
- **HUD FMR area**: Miami-Miami Beach-Kendall, FL HMFA (Miami-Dade County). FY2026 quoted by aggregators: 0BR $1,828 / 1BR $1,995 / **2BR $2,436** / 3BR $3,127 / 4BR $3,613 (+5% YoY); SAFMR area (ZIP 33233 2BR $2,440 per fairmarketrentmap). HUD-attributed pages seen: FY2026 schedule PDF `https://www.huduser.gov/portal/datasets/fmr/fmr2026/FY2026_FMR_Schedule.pdf`, datasets page, city SAFMR page `https://www.miami.gov/Housing-Assistance/Housing-Assistance/Section-8/Small-Area-Fair-Market-Rent-SAFMR`, county FMR page `https://www.miamidade.gov/global/housing/fair-market-rents.page` — none displayed the number in snippets, so the $2,436 is aggregator-sourced pending primary confirmation.
- Broward is a separate HMFA (out of core); note when a deal sits north of the county line.
