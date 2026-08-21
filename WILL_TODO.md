# WILL_TODO — what's next, and whose move it is

Companion to `INTEGRATION_NOTES.md` (what was built + ops steps) and
`RESEARCH_STATE.md` (session resume state). This file is the forward list.

## Your moves (need your logins / a human's judgment)

1. **One-paste migrations** — run the combined 0023–0026 SQL in the Supabase
   SQL editor (file was sent in chat; also just paste the four files from
   `supabase/migrations/`). Nothing else on this list matters until this runs.
2. **Render Blueprint sync** — creates the two cron services already defined
   in `render.yaml` (`underwrite-copilot-intel`, `underwrite-copilot-rates`);
   fill env vars: `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `FRED_API_KEY` (free key). Note: the
   rates command is `node scripts/fetch-rates.mjs` — not `daily-rates.mjs`.
3. **Hit `/api/comps/health` signed in and paste the JSON back** — it returns
   each data portal's own layer lists / field schemas / backing URLs. That
   output is everything needed to finish wiring DC, Maryland, New Jersey
   field names and to configure the four discovery providers below.
4. **The two human verifications** (high stakes, ~30 min):
   - PG County DPIE PRSA FAQ PDF — confirm the ≤5-unit natural-person
     exemption's conditions in the current revision; optionally email DPIE
     for a written answer. (Research finding so far: domicile attaches only
     to the condo exemption — confirm before you rely on it.)
   - D.C. Law 26-80 enacted text on code.dccouncil.gov — the 2–4 unit TOPA
     exemption's "business corporation" definition, and confirm the ≤4-unit
     rent-control exemption's RAD registration requirement (unregistered =
     stabilization applies).
   Paste findings back → `regulatory_rules` rows upgrade sourced → verified.
5. **Optionally**: add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` +
   `FRED_API_KEY` to this repo's Claude environment (code.claude.com) and
   allow `*.supabase.co` in its network policy — then future sessions can run
   migrations/seeds themselves. Trade-off: the service-role key bypasses RLS.

## Claude's moves (next session, mostly unblocked by your #3)

1. **Wire the discovery providers** from the health JSON: Fairfax County VA
   (sales table joins to parcels — needs a two-stage query), Arlington VA,
   Pittsburgh/Allegheny (WPRDC CKAN SQL), New Castle DE. Each becomes
   `configured: true` in `lib/public-comps/core.ts`.
2. **Correct DC/MD/NJ field names** if the health probe names them
   differently than the config guesses.
3. **Expand coverage further** (in rough value order): Richmond VA open data,
   Virginia Beach/Norfolk, Delaware statewide (Kent/Sussex), the Philly
   suburbs (Montgomery/Bucks/Delaware/Chester counties PA), NYC rolling
   sales (needs address-geocoding — no coordinates in the dataset), upstate
   NY county sites. Rural VA counties have no open feeds — the honest gap.
4. **Research gaps** from `INTEGRATION_NOTES.md` top-10: FY2026 SAFMRs by
   ZIP, ACS B25024 stock counts, NJ municipal rent-control screen (now that
   NJ comps are wired, the regulation side matters more), Providence/Albany/
   Scranton in-place rents.
5. **Demo upgrade** (optional): give the sample deal a Philadelphia address
   so recorded comps + the rules panel light up on the public sample screen.

## Deliberately not doing

- Scraping listing portals (Zillow/Redfin/LoopNet pages) — 403-walled and
  license-hostile; the public-record + snippet-confirmation architecture is
  the durable path.
- A full MD/VA assessment-roll import into Supabase (the "property database"
  idea): possible, but it's gigabytes against a 500 MB free tier. If wanted,
  it needs the Supabase Pro fork decision first — flag it and Claude will
  estimate row counts before loading anything.
