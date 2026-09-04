# Coverage enumeration — the definitive metro → county → municipality list

Written BEFORE any source research (registry protocol). The site's coverage
is the 15-market scope enforced in `lib/market-match.ts` + migration
`0029_rules_scope.sql` and seeded in `data/research/metros.json`:
15 markets, 17 metro entries (the DMV core is one market with four
jurisdiction entries).

Two coverage tiers per metro, chosen deliberately:

- **Core** — counties where the app's address matcher actually maps deals
  today (the `MATCHERS` keywords) and/or the metro's HUD FMR-area definition
  centers. Registry research covers ALL 13 source categories here.
- **Secondary** — counties the metro genuinely spans (the task's "don't miss
  the secondary counties"). Registry covers at minimum assessor / recorder /
  GIS / zoning, with the rest where access is notable.

Counties beyond these (e.g. the outer 20+ counties of the 29-county Atlanta
MSA) are named as **out of scope** — the app would not match a deal there
anyway, and claiming coverage we don't have violates the project's honesty
rules.

**Matcher gaps found during enumeration** (the app can't currently map these
addresses to a metro; noted so the build phase can decide):

- Philadelphia PA suburbs (Montgomery/Bucks/Chester/Delaware counties, PA)
  don't match — PA keywords are only "philadelphia".
- NJ side of the Philadelphia metro (Camden/Gloucester/Burlington) doesn't
  match — NJ keywords map only to Newark/Jersey City.
- Fort Worth/Tarrant DOES match (keywords include "fort worth", "tarrant").

---

## DMV core (one market, four jurisdiction entries)

### 1. `dc` — Washington DC
- **Core**: District of Columbia (unitary city-state; no counties; assessor =
  OTR, recorder = ROD, zoning = DCOZ — all citywide).
- Municipalities: n/a.

### 2. `pg_county` — Prince George's County MD
- **Core**: Prince George's County.
- Municipalities that matter to the buy box: Mount Rainier, Hyattsville,
  Brentwood, Capitol Heights, College Park, Greenbelt, Bowie, Laurel,
  District Heights, Seat Pleasant. (MD assessment is state-run via SDAT;
  recording is county Circuit Court; many functions county-level.)

### 3. `montgomery_county` — Montgomery County MD
- **Core**: Montgomery County.
- Municipalities: Takoma Park (own rent-control regime), Rockville,
  Gaithersburg; major unincorporated CDPs: Silver Spring, Bethesda, Wheaton.

### 4. `nova` — Northern Virginia
Virginia's independent cities are county-equivalents (own assessor, own
Circuit Court land records) — each is its own jurisdiction row.
- **Core counties**: Fairfax County, Arlington County, Loudoun County,
  Prince William County.
- **Core independent cities**: Alexandria.
- **Secondary independent cities**: Fairfax City, Falls Church, Manassas,
  Manassas Park.
- Major towns/CDPs: Herndon, Vienna (Fairfax Co.); Leesburg, Ashburn,
  Sterling (Loudoun); Woodbridge, Dale City (PW).

## Mid-Atlantic

### 5. `baltimore` — Baltimore MD
- **Core**: Baltimore City (independent city — NOT in Baltimore County),
  Baltimore County.
- **Secondary**: Anne Arundel County (Annapolis, Glen Burnie), Howard County
  (Columbia), Harford County (Bel Air, Aberdeen), Carroll County
  (Westminster). Queen Anne's County: out of scope (rural shore).

### 6. `richmond` — Richmond VA
- **Core**: Richmond City (independent), Henrico County, Chesterfield County.
- **Secondary**: Hanover County (Ashland), and the independent cities of
  Petersburg / Hopewell / Colonial Heights (Tri-Cities, listed only).
- Goochland/Powhatan/New Kent etc.: out of scope.

### 7. `norfolk_hampton_roads` — Norfolk / Hampton Roads VA
All independent cities, each its own assessor + Circuit Court:
- **Core**: Norfolk, Virginia Beach, Chesapeake, Newport News, Hampton.
- **Secondary**: Portsmouth, Suffolk.
- Listed only (out of research scope): Williamsburg, Poquoson, James City
  County, York County, Isle of Wight County, Gloucester County.

### 8. `philadelphia` — Philadelphia PA (incl. Wilmington DE)
- **Core**: Philadelphia County (= City of Philadelphia, consolidated);
  New Castle County DE (Wilmington — folded into this market per scope).
- **Secondary (PA collar)**: Montgomery County (Norristown, Lansdale,
  Pottstown), Bucks County (Doylestown, Bensalem, Levittown), Delaware
  County (Chester, Upper Darby, Media), Chester County (West Chester,
  Coatesville, Phoenixville).
- **Secondary (NJ side)**: Camden County (Camden, Cherry Hill), Gloucester
  County (Woodbury), Burlington County (Mount Holly, Willingboro).
- Note: PA STEB statewide sales files + NJ MOD-IV cover the collar counties
  at the state level even where county portals are weak.

### 9. `newark_jc` — Newark / Jersey City NJ
- **Core**: Essex County (Newark, East Orange, Irvington, Orange,
  Bloomfield, Montclair), Hudson County (Jersey City, Hoboken, Bayonne,
  Union City, West New York, North Bergen, Kearny).
- **Secondary**: Union County (Elizabeth), Bergen County (Hackensack) —
  adjacent, statewide NJ systems (MOD-IV, NJGIN, SR1A) cover them anyway.

## Major US markets

### 10. `nyc` — New York City
- **Core**: the five boroughs = five counties — New York (Manhattan),
  Kings (Brooklyn), Queens, Bronx, Richmond (Staten Island).
- City-unified systems (DOF assessment, ACRIS deeds) cover four boroughs;
  **Richmond County deeds are NOT in ACRIS** (Richmond County Clerk) — a
  real access split inside one city.
- Out of scope: Long Island, Westchester, and the NJ/CT rings (the app's NY
  matcher is city-borough keywords only).

### 11. `boston` — Boston MA
Massachusetts is municipality-centric: assessing is per-city/town; deeds are
per registry DISTRICT (counties partly abolished).
- **Core**: Suffolk County (Boston, Chelsea, Revere, Winthrop), Middlesex
  County (Cambridge, Somerville, Malden, Medford, Lowell — Middlesex South
  registry), Norfolk County (Quincy, Brookline).
- **Secondary**: Essex County (Lynn, Salem, Lawrence — Essex South
  registry), Plymouth County (Brockton).
- Out of scope: Worcester, NH-side towns of the HMFA.

### 12. `chicago` — Chicago IL
- **Core**: Cook County (Chicago + inner suburbs: Evanston, Cicero, Oak
  Park, Berwyn, Skokie).
- **Secondary (collar)**: DuPage County (Wheaton, Naperville-part), Lake
  County IL (Waukegan), Will County (Joliet), Kane County (Aurora, Elgin).
- Out of scope: McHenry, Kendall, IN/WI sides.

### 13. `los_angeles` — Los Angeles CA
- **Core**: Los Angeles County only (matches the LA-Long Beach-Glendale
  HMFA in metros.json). Municipalities with their own regimes that hit an
  underwrite: LA City (RSO), Long Beach, Glendale, Pasadena, Santa Monica
  (own rent control), West Hollywood (own rent control), Inglewood,
  Torrance, Burbank.
- Adjacent, out of scope: Orange County (separate HMFA), Ventura, Riverside,
  San Bernardino.

### 14. `san_francisco` — San Francisco CA
- **Core**: San Francisco (consolidated city-county).
- **Secondary** (SF HMFA spans them): San Mateo County (Daly City, San
  Mateo, Redwood City), Marin County (San Rafael, Novato).
- Adjacent, out of scope: Alameda/Contra Costa (Oakland HMFA), Santa Clara
  (San Jose HMFA).

### 15. `seattle` — Seattle WA
- **Core**: King County (Seattle, Bellevue, Renton, Kent, Federal Way,
  Redmond, Kirkland).
- **Secondary**: Snohomish County (Everett, Lynnwood) — in the
  Seattle-Bellevue HMFA.
- Adjacent, out of scope: Pierce County (Tacoma — separate HMFA).

### 16. `miami` — Miami FL
- **Core**: Miami-Dade County (Miami, Miami Beach, Hialeah, Coral Gables,
  North Miami, Homestead) — matches the Miami-Miami Beach-Kendall HMFA.
- **Secondary**: Broward County (Fort Lauderdale, Hollywood) — separate
  HMFA but contiguous market; assessor/recorder/GIS documented.
- Out of scope: Palm Beach County.

### 17. `atlanta` — Atlanta GA
- **Core**: Fulton County (Atlanta, Sandy Springs, Roswell, Alpharetta,
  East Point, College Park), DeKalb County (Decatur, Brookhaven, part of
  Atlanta city).
- **Secondary**: Cobb County (Marietta, Smyrna), Gwinnett County
  (Lawrenceville, Duluth, Norcross), Clayton County (Jonesboro, Forest
  Park — airport submarket).
- Out of scope: the other ~24 MSA counties.

### 18. `dallas` — Dallas–Fort Worth TX
Texas: appraisal = county CAD; recording = County Clerk; NON-DISCLOSURE
state (sale prices not in public records — a structural comps constraint to
document per county).
- **Core**: Dallas County (Dallas, Irving, Garland, Mesquite), Tarrant
  County (Fort Worth, Arlington — the app matches these).
- **Secondary**: Collin County (Plano, McKinney, Frisco), Denton County
  (Denton, Lewisville).
- Out of scope: Rockwall, Ellis, Johnson, Kaufman, Hunt, Parker, Wise.

---

## State-level systems that cover multiple metros (research once)

| System | Covers | Categories |
|---|---|---|
| MD SDAT (assessment + sale records, Socrata bulk) | PG, Montgomery, Baltimore City/County + secondaries | parcels, sales |
| VA no-statewide-parcel; but VGIN parcel layer | all VA metros | GIS parcels |
| PA STEB / common-level-ratio + sales files | Philadelphia + collar | sales, ratios |
| NJ MOD-IV + NJGIN + SR1A sales | Newark/JC + NJ Philly collar | parcels, sales |
| NY ORPS / open-data statewide sales | NYC (supplement to DOF) | sales |
| MA registries of deeds (masslandrecords.com) | all Boston-area districts | deeds |
| TX comptroller PTAD + CAD rolls | DFW counties | parcels (no prices) |
| HUD FMR/SAFMR, Census/ACS, BLS, FEMA NFHL, EPA FRS/Envirofacts | every metro | rent/demand, environmental |
