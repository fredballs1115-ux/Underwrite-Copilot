# SITE_POLISH_NOTES — what changed and what backs it

Branch `site-polish`, 2026-08-21. Verification = typecheck + 301-test battery +
production build (a live browser run needs the deployed site — this build
container has no Supabase/network access; the checks that CAN run here all pass).

## What changed

1. **Research continuation** — `data/research/metros.json` (8 Mid-Atlantic
   metros: FMR benchmarks where confirmable, market notes, rules-in-force ids,
   comps-provider status, named gaps) and `data/research/county_data_sources.json`
   (14 jurisdictions' property-records systems with URL patterns and
   machine-access status). New sourced facts: Baltimore MSA FY2026 2BR FMR
   $1,943 (range $1,749–2,137); Philadelphia MSA $1,810; Richmond institutional
   multifamily median $129.5k/unit YTD Q1-2026 ($180.7k excl. one skewed trade);
   Baltimore Q1 2026 volume +53.1% YoY ($367M, best since 2022). Richmond and
   Norfolk FY2026 FMRs did not confirm — recorded as gaps, not guessed.
2. **Building photos** — Street View Static API behind a server proxy
   (`/api/deals/[id]/photo`): metadata endpoint first (imagery must exist),
   verdict cached on `deals.photo` (migration **0027** — additive), key never
   leaves the server, required "© Google" attribution on-image, and no key or
   no imagery renders the existing clean address-only layout. No stock photos,
   no AI images, no scraped listing photos — enforced by there being no code
   path to any of those.
3. **Home page** — kept the brand and hero; added a **live proof strip** under
   the hero: newest 30-yr PMMS from the `rates` table, benchmark count, and
   regulatory-rule count — queried server-side at render (service client),
   falling back to the checked-in research seeds when the DB is unreachable.
   Page is ISR (daily) so the rate can't freeze at deploy time.
4. **Market page** — added the **Metro explorer** (8 metro pills × research
   payload: market notes with status chip, FY2026 FMR with source link, the
   regulatory rules in force with statute links and status badges, comps
   availability, example properties). Audit of the existing page found no
   dead links or console-error patterns in code review; the one stale-risk
   item (hardcoded coverage copy) was already replaced by registry-derived
   text in the previous PR.

## What backs each home-page claim

| Claim | Source of truth |
|---|---|
| 30-yr fixed % + date | `rates` table newest MORTGAGE30US row (FRED cron); seed fallback = the verified Aug 20 PMMS 6.65% |
| "N sourced benchmarks across 14 sectors" | `count(benchmarks)` or `seedBenchmarks().length`; 14 = the sector files in `/data/research/` |
| "N rent-control & TOPA rules on file" | `count(regulatory_rules)` or `seedRules().length` |

No testimonials, user counts, or logos were added — none exist.

## Coverage rates (honest)

- **Photos: 0% today** — `GOOGLE_MAPS_API_KEY` is not set yet. The moment it
  lands in Render, every deal with an address that Street View covers gets an
  image on next view; coverage is then bounded by Google's imagery, not by us.
- **Comps: 4 jurisdictions live** (Philadelphia · DC · Maryland statewide ·
  New Jersey statewide), **4 staged in discovery** (Fairfax, Arlington,
  Pittsburgh/Allegheny, New Castle DE), rest of the region manual-lookup —
  fully mapped in `county_data_sources.json`.
- **Per-deal comp mechanism**: delivered as the `deals.public_comps` cache +
  "Recorded sales nearby" panel (functionally the spec's `comps` table; kept
  as jsonb to stay additive and consistent with the deal-results pattern).
  Example-property comps for research JSONs: not run (no deal rows) — gap.

## Top remaining gaps, by impact

1. `/api/comps/health` JSON from production → wires the 4 discovery
   jurisdictions + confirms DC/MD/NJ field names (user's paste unlocks it).
2. `GOOGLE_MAPS_API_KEY` in Render → photos go from 0% to Street-View-bounded.
3. Richmond + Norfolk FY2026 FMRs and price series (research pass).
4. FY2026 SAFMRs by target ZIP (PG/NoVA/DC) — Section 8 ceiling math.
5. Richmond/Norfolk/VB Socrata portals as the next comp providers.
6. NJ municipal rent-control screen (regulation now lags the NJ comps feed).
7. Demo/sample deal has no address → new panels invisible on the public
   sample screen (deliberate; wire a Philadelphia address if wanted).
