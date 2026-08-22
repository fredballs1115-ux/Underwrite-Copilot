# Ingestion sources — bulk public property data, market by market

Companion to `county_data_sources.json` (per-parcel lookups) — this file
tracks BULK datasets for the property database. Status: **wired** = pipeline
exists in `scripts/ingest/`; **documented** = dataset located, pipeline
queued; **portal** = open data exists, exact bulk endpoint unconfirmed from
this environment; **manual** = roll must be requested/purchased (never buy
without asking). Confidence labels honest: anything not directly confirmable
from here says so.

## Mid-Atlantic (attack order 1)

| Market | Dataset | Access | Status |
|---|---|---|---|
| Philadelphia | OPA `opa_properties_public` via Carto SQL (parcels + last sale; deeper deed history in `rtt_summary`) | paged SQL, no key | **wired** (`philadelphia.ts`) |
| DC | ITS Public Extract + property-sales datasets (Open Data DC, ArcGIS) | FeatureServer query; layer index resolves via `/api/comps/health` | documented |
| Maryland — statewide | SDAT Real Property (Socrata `ed4q-f8tm`, all 24 jurisdictions incl. Baltimore city/county, PG, MoCo) | SoQL paged; column names resolve via health check | documented |
| Fairfax County VA | Tax Administration parcels + sales (ArcGIS hub; sales is a coordinate-less table joined to parcels) | hub v3 probe returns backing URL | documented |
| Arlington VA | GIS open data property polygons | server-root probe lists services | portal |
| Prince William VA | No open bulk feed found; portal blocks automation | county FOIA/data request | manual |
| Loudoun VA | GeoHub parcels | portal | portal |
| Alexandria VA | City open data | portal | portal |
| Richmond VA | data.richmondgov.com (Socrata) — property + transfers historically | portal | portal |
| Norfolk / VB | data.norfolk.gov / data.vbgov.com (Socrata) | portal | portal |

## Tier-1 national (attack order 2)

| Market | Dataset | Notes |
|---|---|---|
| NYC | PLUTO `64uk-42ks` + DOF Rolling Sales `usep-8jbt` (no coords — BBL join to PLUTO, implemented); ACRIS deeper deed history documented | **wired** (`nyc.ts`); one-family (A*) + condo units (R*) drop at the gate |
| Chicago / Cook County | Parcel Universe `nj4t-kc8j` (latest year, centroid coords) + Parcel Sales `wvhk-k5uv`, PIN join | **wired** (`cook_county.ts`); CCAO 211/212 (2-6 unit) kept, rest of 2xx drops |
| Boston | Property Assessment (data.boston.gov, CKAN) | yearly roll CSV |
| Atlanta / Fulton | Fulton assessor GIS hub | portal |
| Miami-Dade | Open data hub parcels + sales | portal |
| Dallas (DCAD) / Houston (HCAD) | TX CADs publish full roll downloads (zip/CSV) | large files; annual certified + supplements |
| LA County | Assessor parcel roll (open data portal, yearly) | ~2.4M parcels — plan-size driver |
| San Francisco | data.sfgov.org assessor secured roll | Socrata |
| Seattle / King County | assessor extracts (real property sales file!) | dedicated sales file = easy comps win |
| Denver | opendata.denvergov.org parcels + sales | portal |
| Phoenix / Maricopa | assessor bulk data page | portal |

## Tier-2 growth (attack order 3)

Nashville/Davidson, Charlotte/Mecklenburg (POLARIS), Raleigh/Wake,
Tampa/Hillsborough, Orlando/Orange, Austin/Travis (TCAD roll),
Jacksonville/Duval, Columbus/Franklin, Minneapolis/Hennepin, Salt Lake —
all publish assessor/GIS portals; exact bulk endpoints resolve at wiring
time. None require purchase as far as documented here; any that do go to
the user's task list first.

## Standing rules

- Single-family drops at the normalizer — never enters the database.
- Never scrape a portal whose terms prohibit it; never purchase without
  asking. FOIA/manual-request markets get the procedure noted and skipped.
- Every row carries `source_dataset`, `source_url`, `ingested_at`.
- **Scale**: full national parcels = millions of rows (LA County alone
  ~2.4M). Free Supabase (500 MB) ≈ Mid-Atlantic sales + one metro's parcels.
  Pro ($25/mo, 8 GB) fits Mid-Atlantic parcels + national sales-only. The
  decision + dollar figure lives in SHIPPED.md → YOUR TASKS.
