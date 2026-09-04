# Newark / Jersey City, NJ (metro_id: `newark_jc`)

CORE: Essex County (Newark, East Orange, Irvington, Bloomfield, Montclair) and Hudson County (Jersey City, Hoboken, Bayonne, Union City, North Bergen). SECONDARY: Union County, Bergen County.

> **Research status / honesty note:** this session's shared web-search budget was exhausted after 10 searches for this metro. The **statewide NJ systems (which do most of the heavy lifting here) plus the Essex/Hudson registers and Newark/Jersey City zoning + open-data portals are search-confirmed**. Everything else (permits, sheriff sales, evictions, rent-control registries, incentive zones, NJDEP/FEMA endpoints, HUD HMFA details, broker reports, secondary counties) is marked **unverified — not searched**, with what is reliably known noted. Nothing below is a guessed URL: entries with no URL had none appear in a search result.

## Key facts

| Fact | Value | Status |
|---|---|---|
| Assessment ratio | No single ratio — each NJ municipality assesses at its own level; the state's annual **Director's Ratio / Table of Equalized Valuations** equalizes to market | general knowledge, not re-verified |
| Reassessment cycle | Municipal and irregular (no countywide schedule). JC last citywide reval ~2018; Newark ~2014 | unverified — confirm |
| Transfer tax | **State RTF only** (graduated, ~1% effective at higher prices) — no county/city add-on. **Mansion tax amended eff. 2025-07-10:** 1% >\$1–2M, 2% >\$2–2.5M, 2.5% >\$2.5–3M, 3% >\$3–3.5M, 3.5% >\$3.5M — applied to the **entire** price, now paid by the **seller**; parallel Controlling-Interest Transfer Tax changes; grace period (pre-7/10/25 contracts recorded by 11/15/25 pay old 1%) | search-confirmed (law-firm alerts) |
| Biggest access quirk | **Daniel's Law**: owner names redacted on statewide parcel/MOD-IV downloads; NJACTB's statewide MOD-IV/SR1A search **shut down** eff. 2023-01-01 — bulk data now comes from NJGIN/Treasury files | search-confirmed |
| Second-biggest quirk | Newark & JC are **PILOT/abatement-heavy** — tax expense on many assets is contract-based (N.J.S.A. 40A:20 LTTE), not rate-based | general knowledge |

---

## New Jersey — statewide systems (cover the whole metro)

### parcel_assessment
- **Property Tax List (MOD-IV) of NJ (fgdb download) — NJGIN**
  - url: https://njogis-newjersey.opendata.arcgis.com/documents/102a9bf3c6da4ca3b9b31f831a1e9f72 — **search-confirmed**
  - access_method: bulk_download · data_format: file geodatabase · update_frequency: annual tax-list cycle · cost: free
  - terms_notes: OWNER_NAME redacted per Daniel's Law · difficulty: **easy** (official statewide bulk file)
  - notes: statewide assessment table for every parcel.
- **Parcels and MOD-IV Composite of NJ (download) — NJGIN**
  - url: https://njogis-newjersey.opendata.arcgis.com/documents/406cf6860390467d9f328ed19daa359d — **search-confirmed** (geometry-only sibling: https://njogis-newjersey.opendata.arcgis.com/documents/d543ddcc1e6844319ffa826fee52fccf)
  - access_method: bulk_download · data_format: fgdb (parcels pre-joined to MOD-IV) · update_frequency: periodic refresh · cost: free
  - terms_notes: Daniel's Law redaction · difficulty: **easy**
  - notes: **the single best parcel+assessment source for the metro** — Essex, Hudson, Union, Bergen in one file.
- **Parcels Composite hosted FeatureServer (services2.arcgis.com/XVOqAjTOJ5P6ngMu → `Parcels_Composite_NJ_WM`)**
  - url: *(not literally shown in results)* — **unverified**: snippet confirmed the service name + host, but only an older test-service URL appeared literally (`…/Hosted_Parcels_Test_WebMer_20201016/FeatureServer`). Repo's previously-recorded endpoint is consistent with the snippet.
  - access_method: gis_service · data_format: ArcGIS FeatureServer JSON · cost: free · difficulty: **easy** once endpoint pinned
  - notes: also literally confirmed: https://maps.nj.gov/arcgis/rest/services/Basemap/Parcels_NJ_WM/MapServer/layers . Check NJGIN retired-services page (njgin.nj.gov/njgin/edata/retiredservices/) — services get retired.
- **NJ Division of Taxation — Statistical Information (MOD-IV flat files back to 2015)**
  - url: https://www.nj.gov/treasury/taxation/lpt/statdata.shtml — **search-confirmed**
  - access_method: bulk_download · data_format: flat/fixed-width files · update_frequency: annual · cost: free
  - difficulty: **medium** (needs the state record-layout doc) · notes: only source of assessment **history**.
- **NJACTB Record Search** (county tax boards association)
  - url: https://njactb.org/record-search/ — **search-confirmed**
  - access_method: manual · cost: free · difficulty: **hard**
  - terms_notes: **per Daniel's Law (eff. 1/1/2023) NJACTB no longer serves MOD-IV/SR1A data** — points to the 21 county boards. Per-county "TaxRecords-NJ"-style tools survive for some counties (Morris example appeared: https://mcweb1.co.morris.nj.us/MCTaxBoard/SearchSR1A.aspx); Essex/Hudson equivalents unconfirmed.

### recorder_deeds (state-level facts)
- **NJ Realty Transfer Fee + mansion tax schedule**
  - url: https://capemaycountynj.gov/1727/New-Jersey-Realty-Transfer-Fees — **search-confirmed** (county page carrying the statewide schedule; the nj.gov RTF page itself didn't appear literally)
  - Rates: see Key facts table. difficulty: **easy** (statutory schedule).

### tax_rates
- **NJ property-tax transparency / annual rate tables**
  - url: https://www.nj.gov/transparency/property/ — **search-confirmed** (Division of Taxation general-tax-rate table URLs not individually confirmed)
  - access_method: bulk_download · data_format: HTML/Excel · update_frequency: annual · cost: free · difficulty: **easy**
  - notes: NJ publishes per-municipality **General Tax Rate** and **Effective Tax Rate** annually plus the Table of Equalized Valuations — that's the whole metro's tax-rate story (school/county/municipal are folded into one rate).

### gis_open_data
- **NJGIN Open Data** — url: https://njogis-newjersey.opendata.arcgis.com/ — **search-confirmed** · gis_service · free · **easy**. Layers that matter: parcels+MOD-IV composite, municipal boundaries, flood layers.
- **NJOIT Open Data Center** — url: https://data.nj.gov/ — **search-confirmed** · api (Socrata-style) · free · **easy**.

### permits_co — **unverified (not searched)**
- **NJ DCA construction-permit (UCC) activity data** — statewide UCC reporting exists; dataset URL/format unconfirmed. difficulty: medium. COs are municipal.

### evictions_rent_reg — **unverified (not searched)**
- **NJ Special Civil Part (landlord-tenant) case records** — per-county vicinage (Essex, Hudson); online access rules and any eCourts public search unconfirmed. Court-record reuse restrictions expected. difficulty: hard.
- **NJ DCA landlord registration / Bureau of Housing Inspection** — 3+ unit multiple dwellings register with DCA (5-yr inspection cycle); 1–2 units register municipally. Public searchability unconfirmed. difficulty: hard.

### incentive_zones — **unverified (not searched)**
- **OZ / UEZ / LTTE(PILOT)** — OZ boundaries (federal + NJGIN layer), UEZ program (Newark, JC, East Orange, Irvington, Bayonne, Union City have UEZ history), and municipal N.J.S.A. 40A:20 long-term-tax-exemption agreement lists all exist; URLs unconfirmed. difficulty: medium (boundaries) / hard (agreement terms).

### environmental — **unverified (not searched)**
- **NJDEP** — Known Contaminated Sites List (KCSL), DEP DataMiner reports, NJ-GeoWeb GIS. State db name: *NJDEP Known Contaminated Sites List*. difficulty: medium. Highly material in this industrial metro.
- **FEMA NFHL** — standard national layer; heavy SFHA exposure on the Hudson waterfront (JC/Hoboken/Bayonne) and Newark's Passaic riverfront. difficulty: easy.

---

## Essex County (CORE)

### recorder_deeds
- **Essex County Register of Deeds and Mortgages**
  - url: https://essexregister.com/ — **search-confirmed**
  - access_method: manual · update_frequency: continuous · cost: certified copies $8 first page + $2/page
  - terms_notes: snippet says document **images are on in-office terminals only, not the web** (verify currency) · difficulty: **hard**
  - notes: all 22 Essex municipalities; records since 1637. Transfer tax = state RTF only.
- **PRESS — Public Records Electronic Search System**
  - url: https://press.essexregister.com/ — **search-confirmed**
  - access_method: scrape (HTML search UI) · cost: free index search · difficulty: **medium**
  - terms_notes: terms not reviewed — check before automating; no bulk index export found.

### parcel_assessment — **unverified (not searched)**
- **Essex County Board of Taxation** search tool unconfirmed; use statewide MOD-IV/SR1A files instead. difficulty: medium.

### sheriff_foreclosure — **unverified (not searched)**
- **Essex County Sheriff foreclosure sales list** — exists (weekly judicial-sale cycles); URL/vendor unconfirmed. Lis pendens via PRESS; dockets in Superior Court (NJ is judicial-foreclosure). difficulty: medium.

### gis_open_data — **unverified (not searched)**
- County-level portal unconfirmed; NJGIN + Newark city portals are the working substitutes.

---

## Hudson County (CORE)

### recorder_deeds
- **Hudson County Register Office** — url: https://hudsoncountyregister.org/ — **search-confirmed** (property-search page: https://hudsoncountyregister.org/property-search-2/) · manual · free search, per-page copy fees · difficulty: **medium**.
- **Acclaim online records search**
  - url: https://acclaim.hcnj.us/AcclaimWeb/ — **search-confirmed**
  - access_method: scrape (Harris/Acclaim vendor UI) · cost: free to search · difficulty: **medium**
  - terms_notes: vendor system — check terms/CAPTCHA before automating; free-vs-fee status of online images unconfirmed.
  - notes: deeds, mortgages, lis pendens, filed maps for JC, Hoboken, Bayonne, Union City, North Bergen.

### parcel_assessment — **unverified (not searched)**
- **Hudson County Board of Taxation** tool unconfirmed; statewide files cover it. JC assessments info page: https://www.jerseycitynj.gov/online_services/assessments — **search-confirmed** (content unreviewed).

### sheriff_foreclosure / gis_open_data — **unverified (not searched)**
- Hudson Sheriff sale listings and any county GIS portal unconfirmed.

---

## Newark (CORE — Essex)

### zoning
- **Zoning & Land Use Regulations (Title 41) — eCode360** — url: https://ecode360.com/NE4043 — **search-confirmed** (Title XLI: https://ecode360.com/37745895 ; districts ch.: https://ecode360.com/36712427) · manual · free · **easy**. eCode360 terms restrict scraping.
- **Zoning District Information Lookup (ArcGIS app)** — url: https://www.arcgis.com/apps/InformationLookup/index.html?appid=bec797abc90e4ab8a513e1230bb284e2 — **search-confirmed** · gis_service · free · **easy**.
- **NewGIN Open Data** (Office of Planning & Zoning ArcGIS hub) — url: https://data-newgin.opendata.arcgis.com/ — **search-confirmed** · gis_service · zoning/land-use/redevelopment layers.

### gis_open_data
- **Newark Open Data (CKAN)** — url: https://data.ci.newark.nj.us/ — **search-confirmed** (parcels dataset: https://data.ci.newark.nj.us/dataset/parcels)
  - access_method: api (CKAN) · data_format: CSV/XLSX/shapefile · cost: free · difficulty: **medium** (freshness varies — parcels/MOD4 resource dated 2017; use NJGIN for current parcels)
  - notes: datasets cited in snippets: Abandoned Properties, Code Enforcement data, Property Tax Assessment Database, Business Licenses.

### violations_liens
- **Newark code-enforcement datasets** on the CKAN portal — portal **search-confirmed**, individual dataset URLs not captured · bulk_download · free · **medium**. Municipal lien search otherwise = manual tax-collector certificate (statutory fee) — unverified.

### permits_co — **unverified (not searched)**; evictions_rent_reg — **unverified**: Newark rent-control ordinance + Office of Rent Control exist (code text via eCode360), registry searchability unconfirmed; incentive_zones — **unverified**: extensive LTTE/PILOTs + UEZ; check Newark Open Data and newark.legistar.com (appeared in results) for agreement ordinances.

---

## Jersey City (CORE — Hudson)

### zoning
- **Land Development Ordinance — Municode Ch. 345** — url: https://library.municode.com/nj/jersey_city/codes/code_of_ordinances?nodeId=CH345ZO — **search-confirmed** · manual · free · **medium**
  - CAUTION: Municode codification of the 2022–23 LDO amendments was pending per snippet; interim LDO PDF (search-confirmed): https://cdnsm5-hosted.civiclive.com/UserFiles/Servers/Server_6189660/File/2024%20Edits/LDO%20Amendments%202022%20and%202023%20-%20Interim%20User%20Doc.pdf
  - notes: much of the waterfront is governed by **redevelopment plans** (on the open-data portal), not base districts.
- **Official Zoning Map + Interactive Zoning Map 2.0** — url: https://data.jerseycitynj.gov/explore/assets/zoning-map-2019/ (PDF map, latest version dated 11/19/2025 per snippet) — **search-confirmed**; interactive: https://experience.arcgis.com/experience/63717e4171904651a65fe9827fcb5571 ; dataset map: https://data.jerseycitynj.gov/explore/dataset/zoning-map-20181/map/ · gis_service · free · **easy**.

### gis_open_data
- **Jersey City Open Data (Opendatasoft)** — url: https://data.jerseycitynj.gov/ — **search-confirmed** (parcels asset: https://data.jerseycitynj.gov/explore/assets/jersey-city-parcels/ — shapefile last updated 2019-05-05)
  - access_method: api · data_format: CSV/JSON/shapefile + ODS API · cost: free · difficulty: **medium** (parcels stale — use NJGIN)
  - layers that matter: parcels, zoning map, past zoning ordinances, redevelopment plans.

### parcel_assessment
- **JC assessments page** — url: https://www.jerseycitynj.gov/online_services/assessments — **search-confirmed** · manual · notes: last citywide reval 2018 (unverified).

### permits_co — **unverified (not searched)**; evictions_rent_reg — **unverified**: JC rent-control/rent-leveling ordinance (Div. of Tenant/Landlord Relations) exists, registry access unconfirmed; incentive_zones — **unverified**: abatement/PILOT lists likely on the open-data portal — abatement-heavy market, underwrite taxes from the agreement.

---

## Other core municipalities (East Orange, Irvington, Bloomfield, Montclair, Hoboken, Bayonne, Union City, North Bergen)

**Unverified — not individually searched (budget exhausted).** What's structural and already covered: parcels/assessments/sales/deeds flow through the **statewide MOD-IV + SR1A files and the Essex/Hudson registers** above. What needs a per-municipality follow-up pass: zoning code + map (each publishes via ecode360/Municode/General Code — NJ has no statewide zoning), local permits/CO offices, rent control (Hoboken, Bayonne, Union City, East Orange, Irvington, Montclair all have rent-control ordinances — general knowledge, unverified), and local violation records.

---

## Union County (SECONDARY) — cats 1, 2, 3, 12

- **parcel_assessment**: covered by the search-confirmed statewide NJGIN parcels+MOD-IV composite (easy, free). County board of taxation portal — unverified.
- **recorder_deeds**: **Union County Clerk** (no separate Register) records deeds; online search unconfirmed — **not searched**.
- **zoning**: per-municipality (Elizabeth, Union Twp., Plainfield, …) — **not searched**.
- **gis_open_data**: county portal unconfirmed; NJGIN covers parcels.

## Bergen County (SECONDARY) — cats 1, 2, 3, 12

- **parcel_assessment**: covered by statewide NJGIN composite (easy, free). Bergen has historically run its own online assessment search — URL unconfirmed, **not searched**.
- **recorder_deeds**: **Bergen County Clerk** — online search unconfirmed, **not searched**.
- **zoning**: 70 municipalities, per-municipality codes — **not searched**.
- **gis_open_data**: county GIS portal unconfirmed; NJGIN covers parcels.

---

## Metro-level: broker_comps

- **NJ SR1A statewide sales files** (the state-level sales backbone)
  - url: https://www.nj.gov/treasury/taxation/lpt/statdata.shtml — **search-confirmed** (annual files back to 2020 + year-to-date file per snippets)
  - access_method: bulk_download · data_format: flat/CSV · update_frequency: annual + YTD · cost: free · difficulty: **medium** (filter non-usable-sale codes; join block/lot to MOD-IV)
  - notes: every recorded deed → SR1A with price, date, parties, deed type, arm's-length usability code. Uniform across all four counties.
- **CBRE / JLL / Colliers / Cushman & Wakefield / Newmark / Marcus & Millichap — Northern NJ quarterly reports** — **unverified (not searched)** · manual · PDF · quarterly · free (registration walls vary) · difficulty: medium. Northern NJ is a flagship port-adjacent industrial market; industrial reports are especially deep.

## Metro-level: rent_demand

- **HUD FMR areas** — **unverified (not searched)**: metro splits across **Newark, NJ HMFA** (Essex/Union +) and **Jersey City, NJ HMFA** (Hudson) inside the NY–Newark–Jersey City region; exact FY definitions/SAFMR status unconfirmed. bulk_download · CSV/Excel · annual · free · **easy** once area names pinned. Underwriting note: use the right HMFA per county — Hudson (JC HMFA) runs well above Newark HMFA.
- **Census/ACS + BLS** — county-level renter stats; BLS NY–Newark–Jersey City CPI and NJ metro-division employment series. Free APIs. (Standard national sources — not searched this session.)
- **Zillow ZORI / Apartment List** — both publish Newark and Jersey City series (coverage unverified this session). Free CSV downloads, monthly.
