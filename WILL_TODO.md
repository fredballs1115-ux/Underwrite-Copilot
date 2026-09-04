# WILL_TODO — what's next, and whose move it is

Companion to `INTEGRATION_NOTES.md` (what was built + ops steps) and
`RESEARCH_STATE.md` (session resume state). This file is the forward list.

**Last updated 2026-08-28**, after PR #165 (build phases 1–4) merged to main.

---

## 🔴 Blocking everything: run migrations 0030–0033

Phases 1–4 are merged and deployed, but their four pages are inert until the
tables exist. Open the Supabase SQL editor and run these four files from
`supabase/migrations/`, in order:

| File | Creates | Unblocks |
|------|---------|----------|
| `0030_deal_versions.sql` | `deal_versions`, `deal_version_bridges` | Deal → **Bridge** |
| `0031_valuations.sql` | `valuations` | Deal → **Valuations** |
| `0032_rent_roll_engine.sql` | `rent_roll_imports`, `rent_roll_mappings`, `market_leasing_profiles` | Deal → **Rent roll** |
| `0033_submarkets.sql` | `submarkets`, `submarket_periods`, `pipeline_properties`, `deal_submarkets` | **Submarkets** + the deal-page supply card |

All four are additive, idempotent and RLS-scoped — no destructive step, safe to
re-run. Run each file **whole** (the SQL editor only runs highlighted text if
anything is selected — click once at the end so nothing is highlighted).

Until they run, the behaviour is deliberate, not broken: every new read is
best-effort, so the pages render with empty states rather than erroring. Saving
anything on them will fail. That is the tell that this step is still pending.

`0033` also depends on `public.can_access_deal(...)` from `0017`.

**Don't take that on faith — check it.** Paste `supabase/CHECK_MIGRATIONS.sql`
into the SQL editor and run it: it reads the live schema and marks every
migration ✅ run or ❌ NOT RUN, naming the exact tables any missing one still
owes. It writes nothing. Run it before this section and again after, and the
question "which migrations do I still need?" stops being a guess.

**The one trap it will surface: `0028` needs PostGIS.** Its line 21 is
`create extension if not exists postgis`, and if the extension isn't enabled
that line errors and Postgres rolls the *whole file* back — 0028 leaves
nothing behind and looks unrun even if you ran it. Enable it first at
Database → Extensions → postgis, then re-run 0028. Nothing in 0030–0033
depends on 0028, so this doesn't block the four pages above.

---

## Your moves (need your logins / a human's judgment)

1. **Run migrations 0030–0033** — see above. Nothing else in phases 1–4 works
   until this happens.
2. **Render Blueprint sync** — creates the three cron services already defined
   in `render.yaml` (`underwrite-copilot-intel`, `underwrite-copilot-rates`,
   `underwrite-copilot-steward`); fill env vars: `ANTHROPIC_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FRED_API_KEY` (free key).
   Note: the rates command is `node scripts/fetch-rates.mjs` — not
   `daily-rates.mjs`.
   The sync also now prompts for **`STRIPE_TEAM_PRICE_ID` and
   `STRIPE_TEAM_SEAT_PRICE_ID`** on the web service. They were documented in
   `.env.example` but missing from the Blueprint, so a sync never asked for
   them — and the Stripe webhook refuses to process a subscription whose price
   ids it can't match, so Team checkouts would have alerted instead of
   activating. Set both, or leave Team billing off until you create the prices.
3. **Hit `/api/comps/health` signed in and paste the JSON back** — it returns
   each data portal's own layer lists / field schemas / backing URLs. That
   output is everything needed to finish wiring DC, Maryland and New Jersey
   field names and to configure the four discovery providers below.
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
5. **Optional but high-leverage: `RENDER_DEPLOY_HOOK`.** The
   `deploy-to-render` workflow exists but has been a no-op on every run — the
   secret was never set, so its "Trigger Render deploy" step exits in 0s and
   the job still reports success. Deploys have in fact been landing via
   Render's own `autoDeploy: true`, so this is redundancy rather than a
   breakage — but a green deploy job that deployed nothing is a misleading
   signal. Either set the secret (Render → underwrite-copilot-web → Settings →
   Deploy Hook → copy URL → GitHub → Settings → Secrets → Actions →
   `RENDER_DEPLOY_HOOK`) or delete the workflow.
6. **Optionally**: add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` +
   `FRED_API_KEY` to this repo's Claude environment (code.claude.com) and allow
   `*.supabase.co` in its network policy — then future sessions can run
   migrations and seeds themselves instead of handing you SQL. Trade-off: the
   service-role key bypasses RLS. **This is what would have let item 1 be done
   for you rather than by you.**

---

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
