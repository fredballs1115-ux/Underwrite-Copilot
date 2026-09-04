# WILL_TODO — what's next, and whose move it is

Companion to `INTEGRATION_NOTES.md` (what was built + ops steps) and
`RESEARCH_STATE.md` (session resume state). This file is the forward list.

**Last updated 2026-08-28**, after PR #165 (build phases 1–4) merged to main.

---

## 🔴 Blocking everything: run the outstanding migrations

Several pages are merged and deployed but inert until their tables exist.
**Run `supabase/CHECK_MIGRATIONS.sql` first** — it reports which of these you
actually still owe. Then run those, from `supabase/migrations/`, in exactly
this order:

| File | Creates | Unblocks |
|------|---------|----------|
| `0028_property_database.sql` † | `properties`, `recorded_sales`, `journal_entries`, … | Property DB, journal, Data Health, steward — **and it now gates the file below** |
| `0030_public_data_layer.sql` † | `incentive_zones`, `deals.site_flags`, `nearest_property()` | Opportunity-zone flags + the deal page's closest-parcel card |
| `0030_deal_versions.sql` | `deal_versions`, `deal_version_bridges` | Deal → **Bridge** |
| `0031_valuations.sql` | `valuations` | Deal → **Valuations** |
| `0032_rent_roll_engine.sql` | `rent_roll_imports`, `rent_roll_mappings`, `market_leasing_profiles` | Deal → **Rent roll** |
| `0033_submarkets.sql` | `submarkets`, `submarket_periods`, `pipeline_properties`, `deal_submarkets` | **Submarkets** + the deal-page supply card |

All are additive, idempotent and RLS-scoped — no destructive step, safe to
re-run. Run each file **whole** (the SQL editor only runs highlighted text if
anything is selected — click once at the end so nothing is highlighted).

† **Two ordering traps, both verified against a real Postgres:**

1. **0028 needs PostGIS enabled first** (Database → Extensions → postgis).
   Its first statement creates that extension; without it nothing in the file
   gets created, which is exactly why 0028 can look unrun even after you ran it.
2. **There are two files numbered `0030`.** `0030_public_data_layer.sql` came
   from a different branch and declares an RPC returning
   `setof public.properties`, so it fails with
   `type "public.properties" does not exist` unless 0028 ran first — and it
   fails *halfway*, keeping `incentive_zones` and `deals.site_flags` while
   losing the RPC. A table-only check would call that done, so the checker
   below tests the function too. Run order: **0028 → 0030_public_data_layer →
   0030_deal_versions → 0031 → 0032 → 0033.**

Until they run, the behaviour is deliberate, not broken: every new read is
best-effort, so the pages render with empty states rather than erroring. Saving
anything on them will fail. That is the tell that this step is still pending.

`0033` also depends on `public.can_access_deal(...)` from `0017`.

**Don't take any of that on faith — check it.** Paste
`supabase/CHECK_MIGRATIONS.sql` into the SQL editor and run it: it reads the
live schema and marks every migration ✅ run or ❌ NOT RUN, naming the exact
tables, columns or functions any missing one still owes. It writes nothing.
Run it before this section and again after, and the question "which
migrations do I still need?" stops being a guess.

---

## Your moves (need your logins / a human's judgment)

1. **Run `supabase/CHECK_MIGRATIONS.sql`, then run whatever it flags** — see
   above. Nothing else in phases 1–4 works until this happens.
2. **The scheduled jobs — pick GitHub Actions, not Render crons.** All four
   (intel, rates, fmr, steward) now exist BOTH as Render cron services in
   `render.yaml` and as free workflows in `.github/workflows/`, running the
   identical scripts on the same schedules. Run one of each pair, never both.
   The Actions route costs nothing and needs five repo secrets (Settings →
   Secrets and variables → Actions): `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `FRED_API_KEY` (free) and
   `HUD_API_TOKEN` (free, huduser.gov/hudapi/public/register). Each workflow
   no-ops with a printed instruction until its secrets exist, so nothing fails
   while you set them up.
   If you'd rather run them on Render, a **Blueprint sync** creates the four
   cron services instead — same env vars. Note the rates command is
   `node scripts/fetch-rates.mjs`, not `daily-rates.mjs`.
   A Blueprint sync also now prompts for **`STRIPE_TEAM_PRICE_ID` and
   `STRIPE_TEAM_SEAT_PRICE_ID`** on the web service. They were documented in
   `.env.example` but missing from the Blueprint, so a sync never asked for
   them — and the Stripe webhook refuses to process a subscription whose price
   ids it can't match, so Team checkouts would have alerted instead of
   activating. Set both, or leave Team billing off until you create the prices.
3. ~~**Hit `/api/comps/health` signed in and paste the JSON back**~~ — **done
   2026-09-04**, and it earned its keep. What the live run settled:
   - **Philadelphia** was broken (`column "lat" does not exist`) — the table
     carries PostGIS geometry, not lat/lng columns. Fixed.
   - **Maryland** was broken on every column name at once. Socrata's error
     named the real ones, so all nine are now read off the source rather than
     guessed — including structure area, so MD comps can carry a $/SF.
   - **New Jersey** needed nothing. All six fields verified present.
   - **DC** is not wired and now says so: the service's own layer list has no
     layer 53 and no sales table at all (it is a cadastral service).
   - Four discovery providers point at wrong URLs; two more (Fairfax,
     Allegheny) are ready to wire but need a parcel join for geometry.
   `lib/public-comps/core.ts` records all of it inline.
   **Re-run the probe after this deploys** — it will confirm Philadelphia and
   Maryland, and Maryland's sample will reveal the transfer date's literal
   format, which is the one thing still unproven.
4. **The two human verifications** (high stakes, ~30 min):
   - PG County DPIE PRSA FAQ PDF — confirm the ≤5-unit natural-person
     exemption's conditions in the current revision; optionally email DPIE for
     a written answer. (Research finding so far: domicile attaches only to the
     condo exemption — confirm before you rely on it.)
   - D.C. Law 26-80 enacted text on code.dccouncil.gov — the 2–4 unit TOPA
     exemption's "business corporation" definition, and confirm the ≤4-unit
     rent-control exemption's RAD registration requirement (unregistered =
     stabilization applies).
   Paste findings back → `regulatory_rules` rows upgrade sourced → verified.
5. ~~**`RENDER_DEPLOY_HOOK`**~~ — **settled 2026-09-04: deleted.** The
   `deploy-to-render` workflow was a no-op on every run (the secret was never
   set, so its trigger step exited in 0s and the job still went green).
   Deploys have always landed through Render's own `autoDeploy: true`, so
   removing it loses nothing and removes a green job that deployed nothing.
6. **Optionally**: add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` +
   `FRED_API_KEY` to this repo's Claude environment (code.claude.com) and allow
   `*.supabase.co` in its network policy — then future sessions can run
   migrations and seeds themselves instead of handing you SQL. Trade-off: the
   service-role key bypasses RLS. **This is what would have let item 1 be done
   for you rather than by you.**

---

## Property imagery — where it stands after the aerial work

Every deal with an address now shows a **real aerial photograph of its actual
site**, with no API key and no billing account: USGS National Map imagery is
public domain (`lib/basemaps.ts` explains why USGS and not Esri). That covers
the deal header, the deal-list thumbnails and both maps.

`GOOGLE_MAPS_API_KEY` is still worth setting, but it is now an *upgrade*, not
the difference between imagery and none. With it, a street-addressed deal's
picture becomes an actual **photograph of the building front** — in the deal
header AND as the deal's thumbnail in the pipeline list — instead of the
overhead shot. Without it nothing breaks or looks broken.

### Setting the Street View key (your move, ~10 min)

1. **console.cloud.google.com** → create or pick a project.
2. **APIs & Services → Library** → enable **Street View Static API**. This is
   the step that is easiest to skip; the key works for other Google APIs
   without it and fails only here.
3. **Billing** must be enabled on the project. Google's free allowance for
   Street View is a Pro-SKU tier (roughly 5,000 calls/month at the time of
   writing — confirm on Google's pricing page, it changes). Our metadata
   verdict is cached per deal for 30 days, so a deal costs about one call,
   not one per page view.
4. **Credentials → Create credentials → API key.** Restrict it under **API
   restrictions** to the Street View Static API. Do NOT add an HTTP-referrer
   restriction: this key is used server-side and sends no referrer, so a
   referrer rule rejects every call.
5. Paste it into Render as `GOOGLE_MAPS_API_KEY` on the **web** service and
   redeploy.
6. Confirm with **`/api/imagery/health`** while signed in. It probes Google
   and USGS live with a known address and reports what each said — including
   Google's own `error_message`, which names the unenabled API or the
   restriction that rejected the key. Several ways of half-succeeding all
   look identical from the outside (deals just keep showing aerials), so
   check this rather than guessing.

Not yet covered by imagery, in rough value order:

1. **The shared report** (`/share/[token]`) — needs a token-scoped aerial
   route, since `/api/deals/[id]/aerial` requires a signed-in session.
2. **The exported PDF memo** — same static URL would work, same auth problem.
3. **Submarket pages** — a map of the submarket with its pipeline properties
   plotted; needs submarket geocoding, which does not exist yet.

## Claude's moves (next session)

1. **Verify phases 1–4 end to end once the migrations land** — create a
   submarket, import a pipeline CSV, upload a rent roll, download the workbook
   and confirm the exit cap moves the IRR in real Excel, save two deal versions
   and read the bridge. All of it is unit-tested, none of it has been exercised
   against the live database.
2. **Wire the discovery providers** from the health JSON: Fairfax County VA
   (sales table joins to parcels — needs a two-stage query), Arlington VA,
   Pittsburgh/Allegheny (WPRDC CKAN SQL), New Castle DE. Each becomes
   `configured: true` in `lib/public-comps/core.ts`.
3. **Correct DC/MD/NJ field names** if the health probe names them differently
   than the config guesses.
4. **Expand coverage further** (rough value order): Richmond VA open data,
   Virginia Beach/Norfolk, Delaware statewide (Kent/Sussex), the Philly suburbs
   (Montgomery/Bucks/Delaware/Chester counties PA), NYC rolling sales (needs
   address geocoding — no coordinates in the dataset), upstate NY county sites.
   Rural VA counties have no open feeds — the honest gap.
5. **Research gaps** from `INTEGRATION_NOTES.md` top-10: FY2026 SAFMRs by ZIP,
   ACS B25024 stock counts, NJ municipal rent-control screen (now that NJ comps
   are wired), Providence/Albany/Scranton in-place rents.
6. **Seed a demo submarket** so the sample screen can show the supply card with
   real numbers, the way the rules panel already does for Philadelphia.
   Currently the four new tools are described on `/` and `/demo` but only
   demonstrable on a signed-in deal.
7. **Phase 5 candidate — portfolio / batch screening.** Same screen run N
   times with a roll-up and per-asset contribution to blended IRR; mostly a
   loop around existing code plus a CSV importer. Named as the next build in
   the LPC plan.

---

## Deliberately not doing

- Scraping listing portals (Zillow/Redfin/LoopNet) — 403-walled and
  license-hostile; the public-record + snippet-confirmation architecture is the
  durable path.
- A full MD/VA assessment-roll import into Supabase (the "property database"
  idea): possible, but gigabytes against a 500 MB free tier. If wanted, it
  needs the Supabase Pro fork decision first — flag it and Claude will estimate
  row counts before loading anything.
- **A shared/cross-tenant market dataset** (phase 4). Licensed market data
  belongs to whoever licenses it; every submarket row is scoped to the user who
  imported it, and there is deliberately no policy that would allow pooling.
- **SheetJS for the rent roll** — its community build writes values, not
  formulas, and its npm distribution is deprecated. `exceljs` (already a
  dependency) reads and writes both.
