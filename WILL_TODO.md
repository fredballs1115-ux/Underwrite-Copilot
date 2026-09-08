# WILL_TODO — what's next, and whose move it is

Companion to `INTEGRATION_NOTES.md` (what was built + ops steps) and
`RESEARCH_STATE.md` (session resume state). This file is the forward list.

**Last updated 2026-09-08**, after PRs #176–#237 merged to main (live build
sha `da1d184`, #237, confirmed equal to the main tip by live-verify at 08:32
UTC — every one of the sixty-two is live, and the public-page lint #231
added reads all twelve public pages clean on every run, skip link and
landmarks included).

---

## 🟢 What changed on 2026-09-07, and the three checks it asks of you

Sixty-two PRs (#176–#237) landed across one review session and the
correction round that followed; each is live once Render finishes the `main`
deploy (live-verify shows the sha).

- **Maps and building photos point at the building** (#176). Street addresses
  go to the US Census geocoder first, precision is read off the answer, the
  Street View camera is aimed at the building, the USGS aerial resolves one
  zoom sharper. Deals re-place themselves on their next view.
- **Submarkets are a panel on Market data** (#177), not a nav section.
  `/submarkets` redirects there; each submarket's own page is unchanged.
- **The deal's strategy is read first** (#178). Stabilized / value-add /
  lease-up / conversion / development, shown in the deal header; every NOI
  labelled in-place, Year 1 or stabilized pro forma; figures that cannot all be
  true (an NOI above the price, a cap that disagrees with NOI ÷ price) are named
  on the page and put to the challenger and the verdict. Pipeline rows carry an
  asset-class colour; the mandate score reads "Fit 82 · Pursue".
- **The model climbs to stabilization** (#179): capital budget, works years,
  downtime income and costs, lease-up ramp, yield on total cost.
- **News is never empty** (#180): the page opens with live headlines from the
  publishers' own feeds (eight outlets plus Google News topic searches),
  ranked and linked, refreshed every half hour, no key and no cron. The scored
  buyer-specific feed still follows once the weekday sweep runs. Two optional
  cost levers, `MODEL_EXTRACTION` and `MODEL_REASONING`, are read at boot.
- **The Excel workbook names the deal type** (#193) on its Cover, Deal
  Summary and Assumptions tabs, and the capital line carries the OM page its
  budget came from; the submarket supply warning tells a plan deal it
  delivers into the pipeline it is being warned about.
- **Yield on cost, stressed** (#194, #195): under the plan strip, a 5×5 grid
  of stabilized NOI under the pro forma × budget over the OM's, each cell the
  yield on total cost and its spread over the model's exit cap, plus the NOI
  floor and the overrun that erase the spread. The full report carries the
  same page ahead of its IRR grids. A budget that appears only in the OM's
  own words (no line item) is read from there. Ask-the-deal is told the
  deal type and the plan's figures (#196), so "what's the cap rate?" on a
  conversion is answered with which figure the OM's number is. The first
  signal's cap slot (#197) can no longer carry a yield on cost or a pro
  forma cap into the header or the mid-screen buy-box check, and the
  buy-box check, the mandate score and the market memory (#198) read one
  shared going-in cap that excludes the finished project's figure — a
  conversion no longer scores "Fit 100" on its stabilized cap. The compare
  table and the leverage check (#199) say "n/a — plan" and "judged on
  yield on cost" instead of reading a dark building's year-1 cap.
- **Construction & take-out debt** (#200): on a plan deal the Financing &
  capital card opens with a construction loan sized to total cost (interest
  reserve inside it), the take-out the finished NOI carries, the cash-in
  refinance or headroom between the two, equity as a share of cost, and
  yield on cost with the carry included. The pipeline's Cap column shows a
  plan deal's yield on cost, labelled, instead of a dash (#201).
- **Every portfolio view knows the deal's kind** (#208). Analytics no longer
  counts a conversion's stabilized cap as a going-in cap — a plan deal
  carries its yield on cost, the cap tile and chart say how many plan deals
  sit outside the cap series, and its $/unit is total cost over the planned
  units. The pipeline's meeting .xlsx gains Deal type and Yield on cost
  columns (a plan deal's cap cell reads "n/a — plan"; the summary counts live
  plan deals). The read-only share link names the kind and carries the plan's
  five facts above the key terms, from the same source as the deal page.
- **The comp memory and the retrade diff read the deal's kind too** (#209).
  "From your pipeline" labels a plan-deal sibling, shows its yield on cost
  where a cap would sit and an all-in basis (total cost over planned units);
  the since-last-screen diff tracks a plan deal's stabilized NOI, capital
  budget and yield on cost, and never reads a stabilized cap as the going-in
  cap.
- **The comp scrutiny, the market check and the reconciler are told what the
  screen established** (#210): deal type, stabilized NOI over total cost,
  the all-in basis per planned unit, the timeline — appended after the OM so
  the cached prefix is untouched. A conversion's sale comps are now held
  against total cost per finished unit, never the shell's price. Takes
  effect on the next screen of a deal (the stored comps and market checks
  are not re-run).
- **The LOI draft follows the deal's kind** (#211). A plan deal's diligence
  clause names the structural, environmental, zoning and construction-cost
  work; a conversion or a development carries an "Entitlements and
  Approvals" contingency; a development's land cost prefills the offer
  price.
- **A stated total cost with no price is still a total cost** (#212). An OM
  with an all-in development cost and no price (the sponsor owns the land)
  now gets its total cost and yield on cost, the stressed grid, the
  construction sizer and the report — and nothing calls the figure "less the
  price".
- **The extraction asks for the plan's rows by name** (#213): Total project
  cost, Construction / Renovation budget, Land cost on a development, Units
  (proposed), Construction period, Lease-up period, Stabilized in — the
  labels every reader matches. Takes effect on the next screen of a plan
  deal, which is one more reason to re-screen the conversion.
- **The plan strip shows the all-in basis per planned unit** (#214) — total
  cost over the finished unit count, on the deal page and the shared
  screen, from the same reader analytics and the prompt context use.
- **The Excel model's yardsticks carry the all-in basis** (#215): two live
  rows on the Operating Metrics tab, per unit and per SF, over price plus
  the capital plan — a regenerated conversion model reads $600/SF all-in
  beside the shell's $67/SF.
- **A building's history is not a plan** (#216): a "Year built / renovated"
  row or a "newly renovated" note no longer infers value-add for a deal
  screened before the extraction stated its kind, so older stabilized deals
  keep their going-in cap everywhere.
- **The readers read the row they are named for** (#217): a "Unit mix" row
  never counts as the unit count (analytics, the strip, the share page and
  the memo divide by the real count), a "Sale price" row is the price (comp
  memory and the meeting export keep the deal), the since-last-screen diff
  never pairs a total project cost with a construction budget as one
  retrade, and an older deal with no metrics array no longer breaks the LOI
  draft. The sample screen's summary bar names the deal's kind.
- **One count and one price behind every surface** (#218): the market and
  comp memories, the plausibility check, the Excel model, the pipeline row,
  the deal page's summary and the debt sizer all read the unit count and the
  price through the two shared readers — a "Vacant units" row is never the
  count, a "Last sale price" is never the ask, and a development's land cost
  is its price on the pipeline and the deal page too.
- **The actuals check reads the deal's kind** (#219): on a plan deal the
  uploaded T-12 is held against the OM's in-place or Year-1 NOI, never the
  stabilized pro forma (that is the finished project's figure, judged on
  yield on cost), and when the OM states only the finished project's NOI the
  card and the challenger say there is nothing to compare and ask for the
  in-place figure. On the conversion deal, the Property actuals card no
  longer reads $21M against the office tower's T-12 as a red flag.
- **The count and the price, read the way an OM writes them** (#220):
  "Total apartment units", "# of units", keys, rooms, beds, pads and
  storage units all count again; "Units under renovation" never does;
  "Pricing" is the price and a reserve or bid figure is not; a land deal
  keeps its land price; and a rent per unit never passes the basis ceiling.
- **The building's size, read the way an OM writes it** (#221): the
  buy-box Size check, the mandate's size score, the $/SF basis in the
  memories, the Excel model and the deal page's Size slot all read the
  building's square footage through one reader — a "Land SF", an average
  unit size, a "Retail SF" component or a "Vacant SF" row is never the
  building.
- **The occupancy the model calls "in place" is today's** (#222): the Excel
  model's "In-Place Occupancy" cell and the retrade diff's Occupancy row
  never carry a stabilized or pro forma figure; an OM that states only the
  finished project's occupancy leaves the cell "n/a".
- **The readers, read by a third reviewer** (#223): "Asking Rent", "Price /
  Key" and "Loan pricing" are never the price; "250,000 Sq. Ft." and "1.2
  million SF" read as the building size again (the Excel model no longer
  falls back to 100,000 SF on them); NRSF / GSF, "No. Units", "Guestrooms"
  and "Keys / Rooms" count; the LOI prefill and the pipeline card read the
  price the deal page does.
- **The extraction names the headline rows exactly** (#224): every new
  screen is asked for "Asking price", "Units", "Total SF", "Occupancy" and
  "Going-in cap rate" by name, with the per-unit, subset, land, stabilized
  and prior-trade figures under their own labels, so the readers' first
  choice is what the OM's rows are called.
- **The readers, read a fourth time** (#225): an occupancy cost or growth
  is never the occupancy and a row with no percentage never shadows it; a
  value naming two square footages is neither; a bare "Size" beside a
  stated lot is the land's only when the two figures agree; a bare
  "Asking:" and a "Total consideration" read, an "Exit price" and a "Sale
  price (2019)" never do; a land cost beside a WALT, a tenant count or a
  T-12 is an operating asset; "(2 buildings)" is a breakdown and
  "(Building A)" a subset; the LOI prefills the first price that is a
  figure; and the first signal's ask fills a price slot only when it is
  one, never an "Unpriced".
- **The public pages, walked as a visitor** (#226): every public page
  crawled, measured and screenshotted at phone and desktop widths from a
  local production build. Fixed: the covered-markets page ran edge to edge
  when signed out; three glued words on the homepage ("aboutabout",
  "9real", "Seattlepipelines") and five more sites across the app with the
  same compiler quirk; the homepage's shipped cards and /whats-new fold a
  long note instead of printing a page of it; a doubled period on a rule
  effect; and a screen of blank space in the demo's model slideshow on a
  phone.
- **The readers, read a fifth time — on the whole code** (#227): sixteen
  verified findings closed with tests. An opex, R&M, concession or
  renovation spend per unit never clears a basis dealbreaker and "Price /
  Unit" reads; a price per home / apartment / bay / any noun is never the
  ask, nor is a projected, residual, disposition, forward, pro forma or
  prior-year sale price; "Size:" is as bare as "Size"; a Year-2+ cap or a
  cap on cost is never the going-in cap; an occupancy whose value says
  stabilized is not today's; a deck with the plan's rows but no strategy
  and no income in place is a development; "NOI at stabilization" is the
  diff's plan row; the workbook, the buy box's price band and the mandate
  ceiling read through the shared readers; parseMoney reads ±, ~, approx.,
  circa, USD and negatives; "312 residential units" and a footnoted count
  read; and the LOI infers the kind with the first signal as the page does.
- **The readers, read a sixth time, and a guard for glued text** (#228):
  twelve verified findings closed with tests. "Avg SF / unit" or "Beds per
  unit" is never the price per unit (the per-unit reader reads the shape:
  price / basis / $ per unit, door, key, pad, bed or site); a Year-1 NOI is
  income today, so a new build listing its construction cost stays an
  operating asset; "Cap Rate (Yr. 3)", "Year 10" and "Cap rate (2028)" are
  projections and "Capitalization rate" reads; "Size (SF): 250,000" is a
  size again; the plausibility check, the compare page, the pipeline export
  and the analysis email read through the shared readers and the inferred
  kind; an ask dated this year reads while a past year is a prior trade;
  "94% (Target: 95%)" reads 94; an unpriced ask row yields to a
  development's land cost. And two new tests catch the compiler's
  glued-text quirk — at the source of every page, and on a full render of
  the deal page's every section.
- **The signed-in screens, rendered on fixtures and walked at phone width**
  (#229): the pipeline in every state, the model tab, the compare table,
  the assumption bridge, the BOV reconciler, the rent-roll dashboard, the
  analytics charts and the submarket trend now render in the suite and are
  read for glued words; with `VIEW_SHOTS_DIR` set the same renders become
  full documents a headless browser opens at 390px. Fixed from that walk:
  the pipeline header no longer runs past a phone's viewport at the deal
  limit; a phone shows each deal's price, cap and fit on their own line;
  the bridge's before / after columns read "$13.7M" and "8.00%" instead of
  raw inputs; the reconciler's gap sentence keeps "NOI" in capitals.
- **The derivation layer, read a seventh time** (#230): twelve verified
  findings closed with tests. The public sample report now runs the
  sample's rent roll and T-12 like the page beside it (one derivation for
  all three demo downloads); "$18,000 per unit" is a rate, never an $18k
  budget; a development's construction budget is no longer thrown out
  because its land is a tenth of the works; a total project cost beside no
  asking price reaches the workbook; a development's land price is never
  judged as an apartment price; the market memory, the analytics $/unit
  series and the pipeline row read a plan deal the way every other surface
  does; the workbook omits per-SF yardsticks over an assumed size; the
  model's yield on cost carries the dark years' cost; the note for a
  skipped NOI tells the truth for each case; and an OM's in-place occupancy
  sets the vacancy line.
- **The documents, read as the recipient reads them** (#231): the eighth
  review's twelve findings closed with tests, the PDFs now read back as
  text in the suite. The memo's key terms lead with the price, cap and unit
  count instead of four flagged pro-forma rows; the report omits the
  meaningless IRR page on a plan deal (it printed a -48% IRR and a -17.9x
  multiple as a conversion's base case) and never prints a negative
  multiple; the Excel Deal Summary's yield on cost is the OM's stabilized
  NOI over total cost, labelled, with the year-1 cap named for what it is;
  the verdict brief's ranges carry the plan basis; both PDF routes judge
  the buy box as the page does; the pass mark prints (it was a "✓" the PDF
  font cannot encode — every passing chip was empty); page citations print
  only inside the OM; override lines, range confidence, the plan strip's
  facts, the all-in "budget" noun and the shared screen's basis badges all
  match the page. Plus the accessibility lint on every rendered view,
  compact pipeline prices, and the public-page lint live-verify now runs
  on every deploy (its first run caught "29machine-evaluable rules" on the
  homepage; #232 taught it that a git sha in the build stamp — "543ebdb" —
  is digits and letters by nature, not a glued word).
- **Every form control has a name, checked at the source** (#233): a
  source-level scan of every page and component (`lib/a11y-source.test.ts`)
  found ten inputs, selects and text areas a screen reader would announce
  as nothing — the address combobox, the ask-the-deal question box, the
  rename and new-task fields, the section-note box, the rent-roll mapping
  selects and mapping name, the leasing-profile and submarket selects, the
  team-name field. Each is named now, and the scan runs in CI beside the
  render tests' accessibility lint.
- **One skip link, and a landmark on every page** (#234): "Skip to
  content" is the first tab stop on every page now — rendered once by the
  root layout instead of only inside the signed-in shell — and every
  public page's main content carries the `id="main"` it targets. The
  accessibility lint fails an in-page link whose target is missing, so
  the skip link can never point at nothing.
- **Every caption clears the contrast floor** (#235): the palette's core
  text pairs were computed against WCAG's 4.5:1 and pass; the faintest
  captions on the homepage's dark bands (35–45% white, 3.3–4.1:1) and four
  notes in 70–80% muted did not. They sit at 55–60% white and solid muted
  now (5.2–5.9:1); the hierarchy reads the same.
- **The screening pipeline's failure modes** (#236): the ninth review drove
  the real pipeline against a fake database and reproduced fourteen ways a
  run goes wrong before fixing them. A screen that fails midway now says
  which results it never reached — "From the previous screen" on the
  verdict, a progress count that excludes them, "Failed" over the stored
  verdict on the pipeline list, the memo and report refusing until the
  screen is re-run, the same note on a shared screen. The run heartbeats
  between steps (a slow step no longer lets "Start it again" run a second
  pipeline on the same deal), a run whose process died reads "Stalled" on
  the list instead of "Screening…" forever, every failure is one sentence
  you can act on with the provider's raw text kept for the server log, an
  unreadable PDF stops before a verdict, a deal deleted mid-run stops the
  run, a session that expires mid-screen says so, and a large OM's temporary
  copy on the analysis service is deleted when its run ends. The root cause
  of the stalls — in-process runs die with every deploy — is the standing
  item below: turn the worker on once migration 0016 has run.
- **Two screens at a time per web process** (#237): a batch upload used to
  start four pipelines at once, each holding its OM and a ~27MB request body
  per model call — enough to take a 512MB instance down mid-batch. Now two
  run and the rest wait their turn (their claim heartbeats through the
  wait, so a queued screen never reads as stalled); `ANALYSIS_CONCURRENCY`
  raises it on a bigger instance. A deck past the provider's ~600-page
  limit stops before any model call, with the page count in the message.

**Your checks (~10 min, after the deploy)** — the three JSON probes below are
also linked from `/data-health` under "Service probes":

1. **Open the conversion deal that showed Year-1 NOI above its price.** The
   header should now say *Deal type: Conversion* and show a teal "The plan"
   strip — stabilized NOI $21M, price, budget, total cost, yield on cost — not
   a red panel: on a conversion that figure is the plan, and the challenger is
   briefed to test whether it is as conservative as the OM says. Under the
   strip, "Yield on cost, stressed" should read 11.7% at the outlined base
   cell (+567 bps over a 6% reference cap) with the NOI floor at $10.8M. In
   Financing & capital, "Construction & take-out" should show a construction
   loan of about $117M at 60% of a ~$195M total cost (carry included, three
   years at 8%) and no cash-in refinance at a 6% exit cap. The
   Excel model's Cover says *Deal type: Conversion*, and its SOURCE column
   names the stabilized figure it kept out of year 1 and the OM page the
   $160M capital line came from.
   Then **re-screen it** (the stated strategy, the timeline and the three NOI
   labels arrive with the next screen, and the challenger gets the plan
   brief) and **regenerate its model** — the model tab should show Yield on
   cost (Yr N) and a dark year 1, not a 105% cap. Two more places to glance
   at (#208): **Share** it and open the link signed out — the subtitle ends
   "· Conversion" and a teal "The plan" block sits above the key terms; and
   **Export** the pipeline from `/deals` — the row shows *Conversion* under
   Deal type, "n/a — plan" under Cap rate and 11.7% under Yield on cost, and
   `/analytics` no longer plots it as a cap point. On any other multifamily
   deal's page, "From your pipeline" lists it as *Conversion* with 11.7% yoc
   and $294k/unit all-in (#209). On its Documents tab, the LOI panel says
   the draft carries an entitlements contingency, and the downloaded letter
   has clause 5, "Entitlements and Approvals", with Closing at 6 (#211).
2. **Hit `/api/imagery/health` signed in.** A new `geocoder` key leads the
   JSON: it should read `ok: true`, `source: "census"`, `precision: "street"`,
   a few tens of metres off. Paste it back if anything else shows.
3. **Cost (your call, one env var).** Screening runs every step on the
   flagship tier. The extraction and first signal are look-up work and carry
   the one uncached full read of the PDF; setting `MODEL_EXTRACTION` on the
   web service (and the worker, if `ANALYSIS_WORKER=1`) to the mid-tier model
   id and redeploying moves that read to a tier at roughly 40% of the price —
   `lib/anthropic/models.ts` names the levers in order. Judge a screen or two
   before deciding; the judgement steps stay on the flagship unless you also
   set `MODEL_REASONING`.
4. **Open `/news`, then hit `/api/news/health` signed in.** The page should
   open with a ranked list of today's headlines and a "Sources:" line naming
   the publishers that answered. The health JSON says what each feed returned
   from Render; publisher feeds were chosen from public feed directories, not
   fetched from here (the sandbox cannot reach them), so a feed that has moved
   shows up there as `HTTP 404` — paste the JSON back and it gets corrected.
   The scored feed under the headlines fills in once the GitHub Actions
   secret is spelled `ANTHROPIC_API_KEY` (it is `NTHROPIC_API_KEY` today) and
   the weekday sweep runs.

Everything in the red section below still stands — the migrations remain the
blocker for Bridge, Valuations, Rent roll and Submarkets.

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
