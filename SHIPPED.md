# SHIPPED — what's live, how to see it, what only you can do

## ⚠ READ FIRST — what gates what

The deploy pipeline itself is **proven working** (live-verify runs green
since you pointed the web service at `main`). What gates the new features is
**data plumbing only you can touch**:

- **Unrun migrations.** This file used to assert "0028 not yet run" and
  `WILL_TODO.md` later recorded 0017–0029 as done — two documents, one
  contradiction, neither checked against the database. Don't trust either.
  **Paste `supabase/CHECK_MIGRATIONS.sql` into the Supabase SQL editor
  and run it**: it reads the live schema and marks every migration ✅ run or
  ❌ NOT RUN with the exact tables it's missing. That output is the answer.
  - Known trap: **0028 needs PostGIS enabled first** (Database → Extensions →
    postgis). Without it, line 21 errors and the entire file rolls back — so
    0028 leaves nothing behind and looks unrun even if you ran it.
  - Verified independently: 0030–0033 do **not** depend on 0028, and all
    33 migrations apply cleanly in order to a stock Postgres 16.
- **No GitHub Actions secrets** → the ingest/steward/link-audit workflows
  no-op with instructions instead of running.
- **Supabase plan decision** (money — your call, task 1 below).

Everything ships dark-safe: nothing breaks while those are pending, pages
say exactly what's missing and why.

**The single current to-do list is `WILL_TODO.md`.** This file is a record of
what shipped; that one is the forward list.

## Sunday Sep 7 — the review round: pictures, submarkets, and the conversion that screened as stabilized

**Your calls:** "the maps and live pictures are terrible for most buildings";
"the website doesn't need a full section for submarkets"; "for one of my
deals, an office conversion to multi, Year 1 NOI is calculated to be more
than the purchase price, 21 million to 20 — it has to take into account
construction and downtime and what the deal is"; "split the pipeline up by
asset class"; "too much emphasis on the buy box". Then the correction that
reshaped the rest of the run: "that NOI makes sense — it's a conservative
estimate, and that's what it should flag." A hundred and twenty-two PRs, #176–#297, each
gated on tsc / eslint / the full suite / a production build, the live sha
confirmed equal to the main tip after each batch.

- **#176 Imagery.** Root cause was the point, not the pictures: Photon put a
  street address on the street centreline or the city and the code stamped it
  "street precision" because the *input* had a street; Street View was then
  aimed at the spot the camera stood on. Now the US Census geocoder goes
  first, precision is read off the result (street / block / area), the camera
  is aimed at the building by bearing, the USGS cap moves to z19, cached
  points are versioned and re-geocoded, and `/api/imagery/health` leads with a
  `geocoder` probe. 48 tests on the services' real response shapes.
- **#177 Submarkets → Market data.** One "Your submarkets" panel next to the
  user's comp memory; `/submarkets` redirects; nav entries gone.
- **#178 Strategy first.** `lib/deal-strategy.ts` (pure): a strategy per deal,
  three kinds of NOI, and plausibility findings checked in code — an NOI at or
  above a quarter of the price, a stated cap more than 150 bps from NOI ÷
  price, a per-unit basis no market trades at. Named in the deal header, fed
  to the challenger and the verdict; the Excel inputs refuse to anchor on a
  stabilized pro forma and book the construction budget; the model tab and the
  debt sizer guard the same ratio. Pipeline rows carry an asset-class hue and
  the mandate score reads "Fit 82 · Pursue"; the homepage's repeated "for your
  buy box" refrains are gone.
- **#179 The plan in the model.** Optional inputs (budget, works years, income
  and costs during the works, lease-up ramp) make the generated model climb to
  its stabilized figures and report yield on total cost; the conversion
  fixture goes dark two years, spends $160M, and earns its $21M in year four at
  an 11.7% yield on cost with a negative going-in cap — the truth of it.

- **#182 The plan is the plan.** Your correction: "the one deal, once the
  multi was built and fully occupied, the NOI would be 21 million — that NOI
  makes sense; it's a conservative estimate and that's what it should flag
  in the challenger and assumptions checker." So on a conversion,
  development, lease-up or value-add the stabilized figure is never a
  finding: the header shows a teal "The plan" strip (stabilized NOI, price,
  budget, total cost, yield on cost, timeline) and the challenger and
  verdict are briefed with those figures and told to test whether the pro
  forma is as conservative as the deck says. A misread is only called on a
  deal read as stabilized; a stabilized figure on such a deal now reads as
  "strategy unsettled", a Year-1 label on a plan deal as a label mix-up.
- **#183–#187 The follow-through.** The plan vocabulary in every prompt
  (challenger grills total cost, development spread and construction debt;
  the market check tests the figures behind the pro forma; the verdict reads
  basis / exit / debt on the plan's terms) and on the memo's subtitle; a
  stabilized or pro forma cap is never read as the going-in cap on any of the
  four surfaces that pick one; extracted-term cards carry an "in place" /
  "pro forma" chip; the compare table gains Deal type and Yield on cost rows
  and never puts the stabilized NOI in the Year-1 row; the News page streams
  its headlines behind a skeleton instead of waiting on the slowest feed.
- **#180 News, never empty.** "That section needs to be filled with the most
  important real estate news coming out and links to the sources." The page
  now opens with live headlines from eight publishers' own feeds plus Google
  News topic searches, parsed and ranked in pure code (19 tests on the feeds'
  real shapes), refreshed every half hour, every headline linked and every
  outlet named; `/api/news/health` reports what each feed returned. The
  scored buyer-specific feed follows once the sweep's secret is fixed.
- **#193 The workbook knows what the deal is.** The exported Excel model —
  the file people hand to others — read a conversion as a stabilized asset:
  no deal type anywhere, and a $160M year-1 capital line with no source. Now
  the Cover, Deal Summary and Assumptions tabs name the type (with the
  one-line reading of what it means for the figures on a plan deal), the
  capital line prints its OM page and derivation like every other anchored
  input, and the submarket supply warning tells a plan deal it delivers into
  the pipeline it is being warned about. Five workbook tests on the
  conversion fixture, including zero formula errors when the year-1 outflow
  makes IRR non-convergent.
- **#194 Yield on cost, stressed.** The analytic a plan deal is judged on,
  under the plan strip: a 5×5 grid of stabilized NOI 10–20% under the pro
  forma × budget 10–30% over the OM's, each cell the yield on total cost and
  its spread over the model's own exit cap in basis points, coloured by
  development-spread band; two exact sentences name the NOI floor and the
  overrun that erases the spread ($10.8M and +106% on the conversion). Pure
  module, ten tests; no stated budget or stabilized NOI means no grid.
- **#195 The plan page in the full report, and the budget from the OM's own
  words.** The multi-page report gains "The plan, stressed" ahead of the IRR
  grids on any plan deal — the plan's five figures and timeline, the same
  yield-on-cost grid in the report's heat-grid geometry, the two breakeven
  sentences, the spread legend and the reference cap's provenance; the
  render test proves the conversion gets exactly one page more than the
  same deal without it. And when the OM's budget appears only in the
  strategy's text ("approximately $160 million, hard and soft") rather than
  as a line item, the plan strip, the grid and the Excel capital line read
  it from there — an all-in figure still has the price taken out, a rate or
  a figure ten times the price never lands, and a metric row with a page
  still wins.
- **#196 Ask-the-deal knows what kind of deal it is.** A question about "the
  NOI" or "the cap rate" on the conversion used to be answered from the OM
  alone — correct, and still able to quote a 105% cap as if it were one. The
  action now hands the answerer what the screen established (deal type, the
  plan's stabilized NOI over total cost and its yield on cost) so the answer
  names which figure the OM's number is; the OM stays the only source of
  answers. The prompt is a pure, tested function. live-verify gains the Sep 8
  marker ("judged on yield on cost" on /whats-new).
- **#197 The first signal cannot call a yield on cost a cap.** The 30-second
  read that lands before extraction has no label to check, and its
  `goingInCap` is the first number a buyer sees. The prompt now says what
  that field is (today's income against the asking price) and is not (a
  stabilized, pro forma or at-completion cap, or a yield on cost — leave it
  empty and name the figure in the take), and the two places that consume
  it — the deal header's cap slot and the buy-box check that runs mid-screen
  — accept it only inside (0.5%, 25%]. Tests on the prompt for every asset
  class and on the buy-box source for both sides of the guard.
- **#198 The buy-box check, the mandate score and the market memory read
  the same going-in cap — and never the finished project's.** Three
  surfaces still fell back from "going-in cap" to any "cap rate" that was
  not the exit cap, so a conversion's "Stabilized cap rate 11.7%" cleared a
  6% floor, scored "Fit 100 · Pursue", and averaged into what the account
  "usually sees" in the market. One shared reader (`findGoingInCap`) now
  excludes stabilized / pro forma / forward / at-completion caps and yields
  on cost everywhere, and on a plan deal the buy-box check says why there
  is no going-in cap to judge — the plan is judged on yield on total cost —
  instead of "no parseable cap rate yet". Tests on all three.
- **#199 The leverage read and the compare table stop reading a dark
  building's cap.** A conversion's generated model books dark years first,
  so its year-1 cap is negative or a default; the compare table showed it as
  the going-in cap and spread it against the 30-yr fixed. Plan deals now
  read "n/a — plan" in that row and "judged on yield on cost" in the
  leverage row (the yield-on-cost row is their answer), and on the deal
  page a plan deal with no going-in cap gets a leverage note that says why
  — construction or bridge debt sized to cost, not permanent debt sized to
  today's income — instead of a silent gap. A value-add with a real
  in-place cap keeps its leverage check.
- **#200 Construction & take-out debt for plan deals.** The debt sizer only
  knew permanent debt, and on a conversion it sat blank — no in-place NOI to
  size on. The Financing & capital card now opens, on a plan deal, with the
  plan's own debt: a construction or bridge loan sized to total cost at the
  lender's loan-to-cost cap, with the interest reserve it funds inside the
  loan solved in closed form (L = ltc·C ÷ (1 − ltc·r·t·p)); the take-out the
  finished NOI can carry at stabilization under DSCR, debt yield and LTV on
  stabilized value, the binding one named; the cash-in refinance when the
  construction loan is bigger than the take-out, or the headroom when it is
  not; equity as a share of cost; and yield on total cost with the carry
  inside it, set against the OM's figure that leaves it out. Seeded from the
  OM's budget, stabilized NOI and timeline ("24 months of construction, 12
  months of lease-up" reads as three years), and from the permanent sizer's
  own lender terms so one set of assumptions drives both. Pure module
  (`lib/construction-debt.ts`), ten tests.
- **#201 The pipeline shows a plan deal's yield on cost where its cap would
  be.** A conversion's row read "—" in the Cap column, which is correct and
  useless; it now reads "11.7% YOC" in the brand colour with the reason on
  hover, and the compact row says "11.7% yield on cost". Sorting by cap is
  unchanged (a plan deal still has none). And the plan's timeline falls back
  to the metric rows the extraction is asked to capture — "Construction
  period: 30 months; Stabilized in: year 4" — when the strategy text states
  none, so the construction sizer's years-to-take-out seeds from the OM
  rather than a default. Tests on the row reader and the fallback order.
- **#202 The plan panels render under test.** The yield-on-cost grid and
  the construction & take-out panel are plain React on pure math, so the
  test runner now server-renders them on the conversion fixture and reads
  the markup: 25 signed spreads with the OM's case at 11.7% (+567 bps), the
  $10.8M floor and the 106% overrun in the sentences, the construction loan
  at $117.29M with take-out headroom and no cash-in line, the inputs seeded
  with the OM's exact dollars and three years from its timeline, and the
  two-year default (and the note that says so) when the OM states no
  timeline. A runtime error in either panel now fails CI, not a deal page.
- **#203 The construction panel speaks to the kind of plan.** A value-add or
  lease-up has income today and is usually bridge debt sized to total cost,
  refinanced once the plan stabilizes; a conversion or development borrows
  against cost alone because it has no income yet. The panel's opening
  sentence now says which, and a render test holds both branches (the
  value-add fixture seeds 1.5 years from "18 months").
- **#204 The why page says it knows what kind of deal it is.** The public
  page that explains the product had nothing on the biggest change of this
  run. A new section, between "It shows its work" and "It knows the ground",
  says the strategy is read first, every NOI is labelled, a plan's stabilized
  figure is judged on yield on total cost and stressed, the challenger tests
  the plan's conservatism, and the debt follows the plan. live-verify gains
  the marker.
- **#205 A development's price is its land cost.** A ground-up OM says "land
  cost" or "site acquisition" where a building's OM says "asking price"; with
  no price found, the plan strip, the yield-on-cost grid and the construction
  sizer stayed silent and the Excel model fell back to a $10M placeholder. One
  shared reader (`findPriceMetric`) now takes the asking price first and, on
  a development only, the land or site cost — never an appraised land value,
  never a per-acre figure, and never on an operating asset or a conversion.
  The Excel source column names it as the acquisition basis with the build in
  the capital plan. Tests on the reader, the plan summary and the inputs.
- **#206 The plan strip and the report say "Land cost" when that is what the
  price is.** The plan summary now carries the label of its price figure, set
  where the figure is read, and both surfaces print it — a development's
  strip reads Stabilized NOI · Land cost · Budget · Total cost · Yield on
  cost; a development with a stated asking price keeps "Price".
- **#207 Changelog tidy.** The public Sep 7 "strategy is read first" entry had
  been collecting the Sep 8 follow-through sentence by sentence; they now live
  in the Sep 8 "judged on yield on cost" entry, and the Sep 7 entry points to
  it. Same facts, right day.
- **#208 Every portfolio view knows the deal's kind.** Analytics counted a
  conversion's stabilized cap as a going-in cap; the meeting .xlsx read cap
  and price with its own regexes and had no deal-type column; the read-only
  share link showed a plan deal's $21M stabilized NOI beside its $20M price
  with nothing saying why. Every row is now read for its kind first: analytics
  plots a plan deal's yield on cost and never a cap (its $/unit is total cost
  over the planned units, never the shell's price); the export gains Deal
  type and Yield on cost columns, a plan deal's cap cell reads "n/a — plan",
  and the summary counts live plan deals; the shared screen names the kind
  and carries the plan's five facts from the same `planFacts()` the deal
  page's strip uses. Tests read the .xlsx back cell by cell and render the
  shared block against the plan strip.
- **#209 The comp memory and the retrade diff read the deal's kind.** "From
  your pipeline" on a deal page read each sibling's cap with only exit-cap
  exclusions, so a conversion screened earlier lent its 11.7% stabilized cap
  to the comp set, at $33k per planned unit on the shell's price. Siblings
  now go through the shared readers: a plan deal is labelled, shows its
  yield on cost where a cap would sit, and its basis is total cost over the
  planned units, "all-in"; a stabilized asset is unchanged. The
  since-last-screen diff's cap tracker excludes stabilized / pro forma caps
  and yields, and three plan trackers (stabilized NOI, capital budget, yield
  on cost) show a re-screened plan deal's retrade. New tests for both
  modules.
- **#210 The comp scrutiny, the market check and the reconciler are told
  what the screen established.** Those three Claude steps read the OM after
  the extraction with no word of what it found — the challenger and the
  verdict got the strategy brief, they did not. `lib/deal-context.ts` now
  holds the shared context (deal type, the stabilized NOI over total cost,
  the all-in basis per planned unit, the stated timeline), ask-the-deal
  re-exports it, and the three prompts append it after the document so the
  cached OM prefix is untouched. The comp scrutiny gains a plan paragraph:
  sale comps are held against total cost per unit or per SF, never the
  shell's or the land's price; lease comps against the rents behind the
  stabilized pro forma. The reconciler is told a model that carries
  construction against an OM that shows only the stabilized year is a
  difference in what is modelled, not a discrepancy. Tests on the context
  builder and the three prompts.
- **#211 The LOI draft follows the deal's kind.** The letter was one
  template for every deal. A plan deal's diligence clause now names the
  work — structural, environmental, zoning and construction-cost
  investigations for the intended conversion, development, renovation
  program or lease-up — and a conversion or a development carries an
  "Entitlements and Approvals" contingency (zoning approvals, entitlements,
  permits and consents, at Buyer's cost, Seller to cooperate), with the
  clauses renumbered around it. The panel says what the draft carries, and a
  development's land cost prefills the offer price where the OM states no
  asking price. `lib/loi.test.ts` unzips the .docx and reads the clauses
  back for a stabilized asset, a conversion, a development, a value-add and
  a lease-up.
- **#212 A stated total cost with no price is still a total cost.** An OM
  that states an all-in development or project cost and no price — a sponsor
  who already owns the land, a recapitalisation — left the plan with no
  total cost and no yield on cost, a silent grid and sizer, and a budget
  row labelled "less price" though nothing had been subtracted. The budget
  readers now flag such a figure as the total itself (`isTotal`); the plan
  summary carries it as total cost, so the yield on cost, the stressed grid
  (with nothing to add to the total), the construction sizer (price 0) and
  the report all work; the plan facts say the budget sits inside the stated
  total; the challenger's brief says the acquisition is not separable; the
  Excel note says the same. `lib/plan-total.test.ts` covers the path end
  to end on a land-owned development.
- **#213 The extraction asks for the plan's rows by name.** Every reader
  downstream — the budget and land-cost readers, the timeline reader, the
  unit count behind the all-in basis — matches metric labels, and the
  extraction had only been asked, on three of the four plan kinds, for "the
  total project cost, the construction budget, the construction period and
  the year the plan stabilizes" with no labels. It is now asked, on a
  value-add, lease-up, conversion or development, for "Total project cost",
  "Construction budget" / "Renovation budget", "Land cost" on a development
  (never an appraised land value), "Units (proposed)" / "SF (proposed)",
  "Construction period", "Lease-up period" and "Stabilized in" — each with
  its page, never the price restated as a cost line, never a 0 for an
  absent figure. The prompt test pins every label.
- **#214 The plan strip shows the all-in basis per planned unit.** The one
  number a conversion buyer holds comps against — total cost over the
  finished unit count — lived only inside the comp memory, analytics and
  the prompt context, each with its own copy of the unit-count reader. One
  exported reader (`unitCountFromMetrics`) now sits behind the plan
  summary's new `units` and `costPerUnit`, and the plan facts add "Basis
  per unit (all-in)" when the OM states the count — on the deal page's
  strip, on the shared screen, on the report's plan page and in the IC
  memo's plan line. Analytics and the deal context read the same fields.
  Tests in `lib/plan-total.test.ts` ($250k on 240 planned units; no count,
  no row).
- **#215 The Excel model's yardsticks carry the all-in basis.** The
  Operating Metrics tab divided the purchase price alone by units and by
  SF, so a conversion's workbook showed the shell's $67/SF where every other
  surface now shows all-in. Two live rows — "All-in Basis / Unit (price +
  capital plan)" and "All-in Basis / SF (price + capital plan)" — are
  formulas over the named PurchasePrice, CapImprovements, UnitsCount and
  RSF cells, so they move with the capital-plan input; on a stabilized
  asset with no capital plan they equal the price rows. The workbook test
  evaluates both in HyperFormula ($600/SF on the conversion; price plus
  capital plan over 250 units on the stabilized fixture).
- **#216 A building's history is not a plan.** The strategy inference — the
  fallback for a deal screened before the extraction stated its kind —
  matched the bare word "renovated", so a stabilized OM's "Year built /
  renovated" row or a "newly renovated" note read as value-add, which strips
  the going-in cap on the compare table, analytics, the export and the
  buy-box check. The pattern now takes "renovation", "renovate" and
  "renovating" (a plan) and not "renovated" (what was done), and identity
  rows (year built / renovated, renovation year, vintage) never count as
  evidence. A stated strategy still wins. `CLAUDE.md` gains a "Where things
  live" line for the strategy modules; four new inference tests.
- **#217 The readers read the row they are named for.** A review of the
  week's diff found four ways a shared reader could put a wrong number on a
  right label. The unit-count reader matched any row starting with "Unit",
  so a "Unit mix: 40% studio / 60% 1BR" row ahead of "Units: 312" made the
  building forty units — price per unit on analytics, the all-in basis on
  the strip, the share page and the memo all divided by forty. It now reads
  the first row that IS a count (`parseCount`: a whole number, alone or with
  what it counts — "312", "312 units (proposed)", "approx. 300 apartments" —
  never "40% studio", "650–1,200 SF" or "312 / 285,000 SF"), and skips mix,
  sizes, type, density and per-unit rows. The price reader had narrowed to
  asking / purchase / offering / guidance when the strategy work centralised
  it, so a sibling screened off a "Sale price" row dropped out of the comp
  memory and showed a dash in the meeting export; it now takes every name an
  OM gives the number being asked (sale, list, contract, whisper) and never
  what the building last traded for. The since-last-screen diff paired
  "Total project cost" before with "Construction budget" after — the same
  deal, the cost named two ways — and read the price inside the total as a
  $20M retrade; the two are now two trackers, the stabilized-NOI tracker
  never reads its per-unit expression, and the price-per-unit tracker never
  reads an NOI, a rent or a cost per unit. And a deal saved before
  extractions carried a metrics array no longer throws in the strategy
  inference (the LOI route returned a 500 on one). The sample screen's
  summary bar shows the deal's kind, read from its own extraction, with a
  live-verify marker. Twenty-one new tests across three files.
- **#218 One count and one price behind every surface.** #217 fixed the
  two shared readers; this closes the class. Six more places read the unit
  count with a regex of their own — the market memory and the comp memory
  (a "Unit mix" row ahead of "Units" lost the basis, and "312 units" never
  parsed), the plausibility check and the Excel inputs (a "Vacant units:
  12" row read as the count put $50M over twelve units — a false "no market
  trades there" finding, and a workbook whose per-unit yardsticks divided
  by twelve), and the deal page's and sample screen's Size slot. All six
  now go through `unitCountFromMetrics` / `unitCountRow`, whose include is
  every name an OM gives the count (Units, Total units, Number of units,
  Residential or Apartment units, Doors, Keys, Proposed units) and whose
  exclude is every partial count (vacant, occupied, affordable,
  market-rate, renovated, absorbed, leased). And six more places read the
  price with a bare `\bprice\b` — the buy-box price band and the mandate's
  price ceiling, the pipeline row, the deal page's summary, the debt
  sizer's seed and the sample screen — so a "Last sale price" ahead of the
  ask was the price on all of them. One include and one exclude now live in
  `METRIC_FIND.price`, `findPriceMetric` reads them, and the pipeline, the
  deal page and the debt sizer show a development's land cost as its price
  the way the export and the plan strip already did. Thirteen new tests
  across six files.
- **#219 The actuals check reads the deal's kind.** The Property actuals
  card held the OM's NOI against the uploaded T-12, and its picker preferred
  the stabilized / pro forma figure — the sponsor's story, which is the
  right figure to test on a stabilized asset and the wrong one on a plan
  deal: on the conversion it would have put the finished building's $21M
  against the office tower's T-12 and called it a 1,600% red flag, and the
  challenger note would have said the same. The picker now takes the deal's
  kind: on a value-add, lease-up, conversion or development the OM's
  in-place or Year-1 figure is compared, the stabilized pro forma never is
  (it is judged on yield on cost), and when the OM states only the finished
  project's NOI there is no comparison at all — the card says so, and the
  challenger is told the T-12 shows what the building earns today while
  nothing in the deck claims what it produces as bought, and asks for the
  in-place figure. The card names the figure it compared ("OM in-place
  NOI", "OM Year-1 NOI", "OM pro forma NOI") with the OM's own label as the
  tooltip; the sample screen runs the same picker; and the compare table's
  price falls back to the shared price reader instead of any label with
  "price" in it. Nine new tests: the kind-aware picker and the basis on the
  comparison, plus a render test of the card in all four states.
- **#220 The count and the price, read the way an OM writes them.** A
  second review of #217–#218 found the unit-count reader had gone from too
  loose to too tight: "Total apartment units", "Total number of units",
  "# of units", "Total rental units" and "Net rentable units" — the
  commonest labels in a multifamily OM — no longer matched; hotel keys and
  rooms, student beds, manufactured-housing pads and sites and storage
  units were dropped; and "Units under renovation" or "Units offline"
  still read as the count. The reader now whitelists the SHAPE of a count
  label — an optional total / number-of / # prefix, an optional physical
  qualifier (residential, apartment, rental, guest, storage, student,
  RV …), the noun (units, doors, keys, rooms, beds, pads, sites, suites,
  apartments, homes, lots, spaces) and nothing after it — so every partial
  count and every row about the units fails without a blacklist word for
  it, and a value like "248 (of 312)" is refused as a subset. The price
  reader takes "Pricing", "Asking" and "Acquisition cost", keeps "Price /
  Terms", and refuses reserve, bid, target, underwritten and range
  figures; and a bare land OM — a land or site price and no income figure
  — now infers a development, so the land price is its price where before
  it read as a stabilized asset with none. The per-unit
  reader shared by the buy-box basis ceiling, the mandate, the market and
  comp memories, analytics and the retrade diff gains the exclude the diff
  alone had — an "Avg rent per unit" of $2,400 no longer passes a
  $250k/unit ceiling as "$2k/unit, inside" — and the plain NOI tracker
  never reads an NOI per unit. The pipeline card infers the kind with the
  first signal, as the deal page does. Eighty-odd new label cases across
  the reader, buy-box, retrade and market-memory tests.
- **#221 The building's size, read the way an OM writes it.** The same
  class as the unit count, one row down. The buy-box Size check, the
  mandate's size score and the $/SF basis in the market and comp memories
  read the building's square footage with a pattern whose exclude named
  only price / per / psf — so a "Land SF" of 871,200, an "Average unit
  size" of 850 SF, a "Retail SF" component or a "Vacant SF" row, whichever
  came first, was the building: a size check passed or failed on the lot,
  and an office comp's $/SF divided by the site. The Excel inputs, the
  plausibility check and the deal page's Size slot each had a reader of
  their own, each with a different gap. One reader now, in `lib/criteria`
  beside the price and per-unit patterns: `isSizeLabel` whitelists the
  shape of a size label (total / net / gross / rentable / leasable /
  building prefixes; the noun — SF, sq ft, square feet, RSF, NRA, GLA, RBA,
  GBA, area, size, floor area, improvements — and nothing after it),
  `parseSf` reads "250,000 SF", "250k sq ft" and "1.2M SF" and refuses
  acreages, unit counts, rates and ranges, and `buildingSfFromMetrics` /
  `buildingSfRow` sit behind all seven surfaces. Land, site, lot, parcel,
  unit, component ("Retail SF", "Total SF (office)"), partial ("Vacant SF",
  "Leased SF") and phase rows never pass. Fifty-odd label and value cases
  in the buy-box and market-memory tests.
- **#222 The occupancy the model calls "in place" is today's.** The Excel
  model's Deal Summary tab labels a cell "In-Place Occupancy" and filled it
  with the first row whose label said occupancy, occupied or leased — so an
  OM that put "Stabilized occupancy: 95%" above "Current occupancy: 42%"
  wrote the sponsor's projection into the cell labelled in place, and one
  that stated only the stabilized figure wrote that. The retrade diff's
  Occupancy row read the same way. One reader now, beside the size and
  price readers in `lib/criteria`: an explicitly in-place row (current,
  physical, actual, as-of, T-12, existing) wins, else a plain occupancy
  row with no forward word; a stabilized, pro forma, projected, target,
  year-N, at-completion, pre-leased, break-even, market or average row
  never qualifies, so an OM that states only the finished project's
  occupancy states none and the cell reads "n/a". Tests on the reader,
  the Excel inputs and the retrade row. And the going-in cap on the deal
  page's summary bar, the pipeline card and the sample screen now comes
  from the shared `findGoingInCap` too — the sample's own reader had no
  stabilized / pro forma exclude, and the other two carried near-copies of
  the buy box's.
- **#223 The readers, read by a third reviewer.** A pass over #219–#221
  found eight more ways a label could land on the wrong number, three of
  them mine from #221. The price reader's bare "Asking" took "Asking Rent"
  ($2,150) as the ask — the buy-box price band failed a sound deal, the
  comp memory stored a $2k comp and the retrade diff traded on it; the
  slash spellings "Price / Key", "Price / Door" and "Price / RSF" passed
  as the whole price on any hotel or office deck that printed them above
  the ask; and "Loan pricing", "Debt pricing" or a "Pricing date" read as
  the price. The include now takes "Ask" / "Asking" alone or with price /
  guidance and "Pricing" as a word; the exclude names rents, rates,
  yields, spreads, loan / debt / insurance pricing and every per-something
  spelling. `parseSf` had gone strict enough to return nothing on
  "250,000 Sq. Ft.", "250,000 s.f.", "±250,000 SF", "250,000 SF+", "1.2
  million SF" and "250,000 SF on 12.5 acres" — and the Excel model then
  modelled the deal at its 100,000 SF fallback, which drives opex,
  reserves and rent per SF. It now reads the figure the square-footage
  noun follows, in every spelling, and refuses only a pair or a range.
  Size labels gain NRSF, GSF, USF, "Approx. SF", "Property size" and
  "Building Size / SF"; a bare "Size" row on a deck that also states
  acreage or a lot is the land, not the building. Count labels gain "No.
  Units", "# Units", "Guestrooms", "Keys / Rooms", "Units / Keys" and the
  approved / entitled / zoned units a land OM states; "312 units (Phase
  I)" is a phase, not the count. A deck whose only income row is "Cash
  flow" or "DSCR" beside a land cost is an operating asset, not a
  development. And two more surfaces join the shared price reader: the
  LOI prefill (its own reader took "Asking rent") and the pipeline card,
  which now falls back to the first signal's ask as the deal page does.
  Seventy-odd new cases.
- **#224 The extraction names the headline rows exactly.** Seven PRs of
  reader work made the screen robust to whatever an OM calls a figure;
  the cheaper half of the fix is to ask the extraction for the five
  headline rows by name in the first place. The extraction prompt now
  says: "Asking price" for the whole-asset ask (a per-unit or per-SF
  figure under "Price per unit" / "Price per SF", a prior trade under
  "Last sale price"), "Units" for the whole count (a subset under its own
  label), "Total SF" for the building's rentable area (land under "Land
  area", a unit's average under "Average unit size"), "Occupancy" for
  today's physical occupancy (a projection under "Stabilized occupancy")
  and "Going-in cap rate" for the cap on today's income (a projection
  under "Stabilized cap rate") — with the number alone in the value. Every
  new screen lands on the readers' first-choice labels; the readers keep
  covering the OMs already screened. The prompt test locks the labels and
  the look-alikes.
- **#225 The readers, read a fourth time.** A fourth adversarial review of
  the reader diff found twelve more ways an OM's wording could land a
  wrong figure on a surface, and each is closed with a test. Occupancy: an
  "Occupancy cost ratio" or "Occupancy growth" is never the occupancy; a
  row with no percentage ("Leased SF: 240,000", "Occupied units: 288")
  never shadows the "Occupancy: 92%" below it; a "T-12 average occupancy"
  reads as today's figure. Size: a value naming two square footages
  ("40,000 SF office and 210,000 SF warehouse") is neither of them; a bare
  "Size" or "Total area" beside a stated lot — an acreage under an "Acres"
  label, "12.5 acres" in a value, or a lot size in square feet — is the
  land's only when the two figures agree within 5%, so "Total area:
  285,000 SF" beside "Land area: 4.2 acres" is still the building. Price:
  a bare "Asking:" or "Ask —" and a "Total consideration" read; an "Exit
  price" and a "Sale price (2019)" never do. Strategy: a deck whose only
  price is a land cost but which states a WALT, a tenant count, a vacancy,
  reimbursements or a T-12 is an operating asset, never a land deal. Count:
  a parenthetical that opens with a figure ("312 units (2 buildings)") is
  the count with its breakdown; one naming a building or a phase
  ("(Building A)", "(Phase I of III)") is a subset and never the whole. The
  LOI prefills the first price row whose value is a figure, so "Asking
  price: call for pricing" above "Purchase price: $42,000,000" prefills
  the $42M; and the first signal's ask fills the deal page's and the
  pipeline card's price slot only when it is a figure, never an
  "Unpriced" or a "Call for offers" printed where a price goes. Both live
  in `lib/deal-strategy` (`findPricedMetric`, `signalAskPrice`) with the
  other readers, tested.
- **#226 The public pages, walked as a visitor.** A production build was
  started locally and every public page crawled, measured and screenshotted
  at phone (390px) and desktop (1440px) widths with headless Chromium: all
  51 internal links resolve, no page overflows horizontally, no console
  errors. What the walk found, fixed: the covered-markets page ran edge to
  edge for a signed-out visitor — the public chrome gave it no container
  (the signed-in shell does) — so it now sits in the same measure as the
  header; the homepage read "aboutabout half a minute", "9real scenarios"
  and "Seattlepipelines wired" — a compiler quirk drops the leading space
  of a JSX text node that spans lines and carries an HTML entity, so every
  such site across the app (eight, including the construction-debt note,
  the sample guide, the sector-facts form, the valuations note and the
  compare page) now spells its space explicitly; the "Built in the open"
  cards on the homepage clamp a note to four lines with a "Read the note"
  link, and /whats-new folds a note longer than 600 characters behind its
  opening sentences (native `<details>`, no script) — the plan-deal round's
  note had become a full page of text on a phone; a rule effect that
  already ended in a period no longer prints two; and the demo's model
  slideshow no longer reserves the tallest slide's height on a phone (a
  screen of blank space under the compact Returns slide) — inactive slides
  are display:none there and autoplay is off, so nothing reflows under the
  reader's thumb. The excerpt helper is tested.
- **#227 The readers, read a fifth time — on the whole code.** The four
  earlier reviews read diffs; this one read the reader layer as it stands
  and every call site, verified sixteen findings by execution, and each is
  closed with a test. The worst: a hard basis dealbreaker cleared on an
  "Opex per unit" row while the $252k/unit price sat beside it — the
  per-unit exclude now refuses opex, R&M, concessions, renovation spend,
  fees and deposits, and "Price / Unit" with the spaced slash reads at
  last. "Price per home / apartment / bay / berth / parking space" — any
  "per <noun>" — is never the ask ("per the PSA" and "per OM" still are);
  a projected, residual, disposition, forward or pro forma sale price and
  a prior year's sale ("2019 sale price", "Year 5 sale price") are never
  the ask, so a $58M Year-5 exit no longer fails a $50M mandate beside a
  $42M asking price. "Size:" and "Size (SF)" are as bare as "Size", so
  they defer to the acreage the same way. A Year-2+ cap rate or a cap on
  cost is never the going-in cap (a Year-1 cap still is). An occupancy
  whose VALUE says stabilized, pro forma or target states no occupancy
  today, while "88% physical / 84% economic" reads 88. A deck that names
  its plan's rows — a construction budget, a total project cost, proposed
  units beside a stabilized pro forma — but no strategy and no income in
  place is a development, so its land cost is its price and the plan
  strip fills; an operating asset with a historical construction cost
  beside its NOI keeps its kind. "NOI at stabilization" is the retrade
  diff's plan row, never today's. The workbook reads the cap through the
  shared `findGoingInCap`, so a residual cap never backs a price out.
  `parseMoney` reads "±$42M", "~$42M", "approx.", "circa", "USD" and a
  negative in either spelling. "312 residential units" and "150 guest
  rooms" count; a footnote marker ("Units*", "Units (1)", "312¹") never
  blanks a count. The buy-box source carries the deal's kind — the page's
  inferred kind first — so the deal page keeps a conversion's "no
  going-in cap" reading, and the buy box's price band and the mandate's
  price ceiling judge a development's land cost through one
  `findPriceRow` in `lib/criteria` (the strategy module's
  `findPriceMetric` now delegates to it). The comp memory reads the asset
  class before any per-unit row, so an office sibling never gets a $/unit
  basis. And the LOI infers the kind with the first signal, exactly as
  the page does, so the letter and the page never name two prices.
- **#228 The readers, read a sixth time — plus a guard for the compiler's
  glued text.** Twelve verified findings, each closed with a test. The
  worst three: any "X per unit" ratio row — "Avg SF / unit", "Parking
  spaces per unit", "Beds per unit" — was the price per unit, so a basis
  ceiling and a hard dealbreaker both cleared at $912/unit while the
  $252k/unit price sat beside it (the per-unit reader now reads the SHAPE:
  price / basis / $ per unit, door, key, pad, bed or site, and "Unit
  price"); a "Year 1 NOI" row counted as "not income today", so a
  2024-built asset listing its construction cost flipped to Development
  with an $80M "total cost" (one shared `LATER_YEAR` guard — Year 2+,
  "Yr. 3", "Year 10" — now sits behind the cap reader, the NOI classifier
  and the strategy inference); and the cap reader's year guard missed "Cap
  Rate (Yr. 3)", "Year 10" and "Cap rate (2028)", so a 7.5% Year-3 cap
  cleared a 5.5% floor (it reads "Capitalization rate" now, too). "Size
  (SF): 250,000" is a building size again (a regression from #227's
  bare-label change: the label's own noun now satisfies the test); the
  plausibility check reads the cap through the shared reader, so a
  residual or on-cost cap manufactures no "figures don't tie" finding; the
  compare page, the pipeline export and the analysis-ready email judge the
  buy box through `buyBoxCheckSource` with the inferred kind, as the deal
  page does, so a development's land cost is the price on every surface;
  an ask dated this year — "Revised asking price (March 2026)" — reads,
  while a past year in the label, or a sale word beside any year, is still
  a prior trade (`pastYearSource`, built once from today's year); "94%
  (Target: 95%)" reads 94 (the forward word must qualify the figure, not
  sit in a second one); on a development an ask row with no figure yields
  to the land cost; an inferred plan deal's reading line prints once in
  the brief; and the price band's unknown branch names the land cost.
  Plus two new render-level guards: `lib/jsx-whitespace.test.ts` scans
  every `.tsx` under `app/` and `lib/` for the shape the compiler glues (a
  text node opening with a space after `}` or `>`, spanning a line break,
  carrying an entity — verified against the bundled compiler), and
  `lib/deal-view.render.test.ts` renders every section of the deal page on
  the sample deal and reads the text for a digit run into a word, a word
  doubled, or "the the".
- **#229 The signed-in screens, rendered on fixtures and walked at phone
  width.** `lib/views.render.test.ts` renders the pipeline (ten cards in
  every state — plan deals, a development priced at its land, an office
  deal, a screening job, a failed one, a dead one, a teammate's, plus the
  empty and at-limit states), the model tab, the compare table, the
  assumption bridge, the BOV reconciler, the rent-roll dashboard on the
  fixture roll, the analytics charts and the submarket trend chart, and
  reads each for glued or doubled words (`lib/render-lint.ts` holds the
  shared lint). With `VIEW_SHOTS_DIR` set, every render is also written as
  a full document inside the app shell's own column with the built
  stylesheet linked, so headless Chromium can open it at 390px — the
  visual half, run by hand, of pages a crawl of the live site never
  reaches. That walk found four things: the pipeline's header ran 30px
  past a phone's viewport at the deal limit ("Compare" + "Upgrade for
  more" beside the title — it wraps now); a phone showed each deal's
  market and hid its price, cap and fit behind one truncated line (two
  lines now: where it is, then what it costs and how it fits); the
  assumption bridge's before / after columns printed the raw model inputs
  ("13700000", "0.08") instead of "$13.7M" and "8.00%"; and the
  reconciler's copied gap sentence read "51% year-1 noi" (acronyms keep
  their case). The compare table's "best" badge gets a space so "2.10x
  best" is two words when read aloud or copied.
- **#230 The derivation layer, read a seventh time — twelve findings, each
  with a test.** The readers' consumers: what turns the price, the NOI, the
  budget and the size into the figures a user sees. The public demo's PDF
  report derived the sample WITHOUT its rent roll and T-12 — the deck's
  story (5.71% cap, 11.8% IRR, a sensitivity page that cleared the hurdle)
  beside a demo page running the actuals (5.45%, 9.3%, and did not); one
  derivation now (`lib/sample-derive.ts`) behind the page, the workbook and
  the report, with a test that reads all three sources. `budgetFromText`
  read "$18,000 per unit" as an $18k budget marked "extracted" — a per-unit
  or per-SF rate in the sentence is a rate, never the spend. The "budget ≤
  10× price" guard threw away a development's whole construction budget
  whenever its land was under ~9% of the works (any urban high-rise): the
  ten-times bound applies only to a whole-asset price now
  (`priceRowIsLand`); a land price is bounded by an absolute ceiling. The
  workbook read the budget against its own $10M placeholder price, so an OM
  stating a $140M total project cost and no ask lost the whole budget — it
  reads against the stated price only, and no note quotes "98% of price"
  of a price nobody stated. The plausibility check held a development's
  land price, or a conversion's shell price, to an operating market's
  per-unit band and put "most likely misread" into the challenger's brief;
  on a plan deal it judges total cost over the planned units. The market
  memory got the plan-deal treatment the comp memory and the analytics
  already had (all-in basis, no cap, a land-priced development counts).
  The analytics "$/unit" series is multifamily's only — a hotel's per key
  and an office's per suite no longer rescale it. The workbook omits its
  per-SF ladder, with a stated reason, when RSF is the 100,000
  placeholder, as it already did per unit. The pipeline row applies the
  export's rule (a plan deal shows yield on cost, never its cap) through
  one tested `lib/pipeline-slots.ts`, and the CSV gains a Yield on cost
  column. The model's yield on cost counts the works years' carry in total
  cost (the IRR already spent it) and the model tab says so. The
  provenance note for a skipped NOI tells the truth for each case — $0 in
  place; a plan's finished figure; a figure above any going-in cap —
  instead of one sentence for all. And the OM's in-place occupancy seeds
  the vacancy line, marked extracted, instead of a class default printed
  beside it.
- **#231 The documents, read as the recipient reads them — the eighth
  review's twelve findings, each with a test.** The memo, the full report,
  the shared screen and the workbook, read the way the person on the other
  end reads them: the PDFs are rendered and their text read back in the
  suite now (`lib/memo/pdf-text-of.ts`), not counted by page. The memo's
  "Key terms" sorted flagged rows first and cut at four, so the public
  sample memo opened on four pro-forma figures and never stated the asking
  price, the going-in cap or the unit count — one reader
  (`lib/key-terms.ts`) leads the memo and the shared screen with the
  deal-defining rows. The report's sensitivity page printed a -48% IRR and
  a -17.9x "equity multiple" as a conversion's base case: the annual model
  books the budget in year 1, so on a plan deal the IRR page is omitted and
  the plan page says why; a multiple at or below zero is a dash anywhere.
  The Excel Deal Summary's "Stabilized Yield (on cost)" was year-1 NOI over
  uses that left the $160M budget out (5.91% where every other surface
  says 11.7%): a plan deal's block reads "Cap on Yr-1 Income (as
  modelled)" and "Yield on Cost (OM stabilized NOI / total cost)" over a
  stabilized-NOI input cell with its page and a live total-cost cell. The
  verdict prompt's ranges bullet gains the plan carve-out (total cost per
  unit, never the shell's price) its deal-killers bullet already had. The
  memo and report routes judge the buy box from the deal page's own check
  source (first signal, structured address, inferred kind), so a chip the
  page calls "in territory" is never "unknown" on the PDF. The buy-box
  pass mark was a "✓" standard Helvetica cannot encode — every passing
  chip printed empty; it is a WinAnsi "+" now, and a test runs each mark
  through the PDF text filter. The report printed citations the app
  refuses to show ("p. 412" on a 40-page OM): a page prints only inside
  the OM's count. The report's memo page dropped the override lines the
  standalone memo carries; the memo's range table dropped the model's
  confidence; the report's plan strip was a second implementation of
  `lib/plan-facts.ts` that disagreed on wording and format ($21M vs
  $21.0M); an all-in-only plan called its total cost "the budget"; the
  shared screen's key terms carried no in-place / pro-forma badge. All
  fixed. Also in this PR: the accessibility floor (`a11yIssues` in
  `lib/render-lint.ts`) on every rendered view — six unlabeled pipeline
  filters, the decision-note textarea, the file input and the
  document-type select gained names; the pipeline's price column reads
  "$68.0M" instead of "$68,000,…"; and `scripts/lint-pages.mjs`, run by
  live-verify over the public pages on every deploy, which found
  "29machine-evaluable rules" on the homepage — a number and its noun with
  only a margin between them, one word to a screen reader — and six
  siblings; each spells its space now.
- **#232 A git sha is not a glued word.** live-verify's new page lint went
  red on its own build stamp ("543ebdb" is digits then letters, the exact
  shape of a glued word); the lint lets a lowercase hex token of seven or
  more characters through, and `lib/render-lint.test.ts` pins every
  must-catch and must-allow case.
- **#233 Every form control has a name, checked at the source.** The render
  tests' accessibility lint only reaches the views they can render on a
  fixture; a Server Component that needs a database row cannot be. A
  source-level scan (`lib/a11y-source.test.ts`, brace-aware so an arrow
  handler's `=>` does not end the tag early) walks every page and component
  for an `<input>`, `<select>` or `<textarea>` with no aria-label, no
  labelled id and no wrapping label. It found ten: the address combobox,
  the ask-the-deal question box, the rename field, the section-note box,
  the new-task field, the rent-roll mapping selects and the mapping name,
  the leasing-profile select, the submarket select and the team-name
  field. Each has a name now, and the scan runs in CI.
- **#234 One skip link, and a landmark on every page.** A keyboard or
  screen-reader user's first tab stop on any page is now "Skip to content"
  (`app/skip-link.tsx`, rendered once by the root layout — the signed-in
  shell had its own; the public pages had none), and every page's main
  content carries the `id="main"` it points at: the homepage, /demo, /why,
  /whats-new, /market (its content wrapper is a `<main>` now), /login,
  /privacy, /security, /terms and the shared screen. The accessibility lint
  gained the rule that makes it stick: an in-page link whose target id
  is missing fails the render tests and the public-page lint, so a skip
  link can never point at nothing again.
- **#235 Every caption clears the contrast floor.** The palette's core
  pairs were computed against WCAG's 4.5:1 for text: ink, muted, brand and
  the three verdict colours all clear it on every background, and white on
  every button colour does too. What did not: the faintest captions on the
  homepage's dark bands (35–45% white on the deep teal, 3.3–4.1:1 — the
  "Now screening" label, the stress bench's captions and definitions, the
  pulse board's footnotes, the ⌘K hint) and four solid-background notes set
  in 70–80% muted (3.0–3.6:1). The faint tiers now sit at 55–60% white
  (5.2–5.9:1) and the notes in solid muted (5.5:1); the hierarchy reads
  the same, the text is legible to more people.
- **#236 The screening pipeline's failure modes, read by a ninth reviewer.**
  Fourteen findings, each reproduced by driving the real pipeline against a
  recording fake of the database before the fix. A screen that failed at the
  comps step left this run's extraction beside the previous screen's comps,
  market and verdict, counted "Screened · 5/5", and exported as a memo; the
  job row's failing step now says which results the run never reached
  (`lib/screen-run.ts`), and every surface reads it — "From the previous
  screen" on the verdict, a progress count that excludes them, "Failed" over
  the stored verdict on the pipeline list, the memo and the report refusing
  until the screen is re-run, the same note on a shared screen. In-process
  runs never heartbeated, so one slow step (the SDK retries a 529 twice
  inside a call) went stale at ten minutes and "Start it again" ran a second
  pipeline on the same deal — twelve model calls and interleaved results for
  one screen; the run heartbeats every minute now. A run whose process died
  in a deploy showed "Screening…" on the list forever; it reads "Stalled".
  The provider's and the operator's own words ("authentication_error:
  invalid x-api-key", "add it to .env.local") sat under a "Technical
  details" toggle; every failure is now one sentence the analyst can act on
  (`lib/anthropic/failure.ts`) with the raw text in the server log, and a
  cut-off answer, a refusal or unreadable JSON is named as such at all
  thirteen structured-output calls. A scan or a password-protected PDF stops
  before a Caution verdict on a document never read; a deal deleted mid-run
  stops the pipeline at the next step boundary instead of paying for every
  remaining step; a large OM's Files-API copy is deleted when its run,
  question or reconcile ends (nothing ever deleted them — twenty-five asks
  left twenty-five copies); the previous first signal survives a failed read;
  the poller says "you were signed out" instead of freezing the rail; a
  worker retry after a failed run keeps the steps that finished; a
  checkpoint written from an unread payload keeps the job's kind; the
  retrade diff never runs over a failed generation; "dismiss without a
  reason" has its banner. 32 new tests.
- **#237 One web process runs two screens at a time, not four.** The
  review's one unreproduced finding: in-process analyses start the moment
  their request returns, a batch upload starts four, and each holds its OM
  plus a ~27MB base64 request body per model call — 50–80MB apiece on a
  512MB starter instance, which is how a batch could take the web service
  (and every viewer on it) down. `lib/anthropic/run-gate.ts` is a small
  gate: `ANALYSIS_CONCURRENCY` runs (default two) hold an OM at once and the
  rest wait their turn, their claim heartbeating through the wait so a
  queued screen never reads as stalled and never invites a second pipeline.
  Alongside it, a deck past the provider's ~600-page limit stops before any
  model call with the page count in the message (the byte counter only ever
  under-counts, so the gate can never fire falsely). Both driven through the
  real pipeline in the tests: four concurrent screens peak at two, a failing
  run frees its slot, a 700-page OM never reaches the first read.
- **#238 The first ten minutes, read by a tenth reviewer: a password reset
  that works, sign-up errors that name themselves.** The review walked a new
  visitor from sign-up to first export and found the front door's worst
  fault: password reset was a dead end. The reset email's link came back
  with a one-time code that nothing ever exchanged for a session (the server
  client keeps `detectSessionInUrl` off, and a Server Component cannot write
  cookies), so the link landed on the Account page signed out and bounced to
  sign-in — nobody who forgot a password could get back in. Now
  `app/auth/callback/route.ts` exchanges the code, and `proxy.ts` hands any
  auth link that lands elsewhere (the Account page, the sign-in page, the
  site root) to it before a sign-in bounce can strip the code — so the reset
  link works without a change to the Supabase redirect allowlist, and a
  confirmation link signs the person in and lands in the pipeline instead
  of on a "sign in below" banner. A refused link (expired, already used,
  opened in a different browser than the one that asked) says so on the
  sign-in page, opened on the reset form; an expired confirmation no longer
  reads "Email confirmed". Sign-up with an email that already has an
  account said "Account created — check your email" (the enumeration-
  protected placeholder user has no identities); it now says sign in
  instead. Every auth failure reads by the service's stable code
  (`lib/auth-flow.ts`): a weak password, an invalid address, a closed
  sign-up, an unauthorized recipient, a reset asked for too soon with its
  wait in seconds — none of them "something went wrong signing you in" any
  more, and the sign-up tab's error never lingers on the sign-in tab.
  Around it: a signed-in visit to `/login?next=/deals?error=auth` keeps its
  query; every signed-in area (submarkets, comps, news, data health)
  bounces with its destination; the rent-roll workbook's failure and its
  Pro upsell have their sentences; the billing portal reads "not set up"
  instead of a raw error when Stripe's key is missing; seven error codes no
  route emitted are gone. The comp search and the model generator fail in
  the screen's sentences too. 34 new tests drive the callback, the proxy
  and the copy.
- **#239 Your files are yours alone: the eleventh review, on authorization
  and data isolation.** The reviewer read every route handler, server
  action, RLS policy, share token, storage path and the Stripe webhook, and
  found the RLS layer sound — every deal-child table carries per-verb
  policies over `can_access_deal`, every handler reads through the
  user-scoped client. The breach was one layer down: **storage object paths
  are read off ordinary user-writable columns and handed to the
  service-role storage client, which has no RLS.** A signed-in user who
  edited their own deal row's `om_storage_path` (one PostgREST call with the
  browser's anon key) could mint a signed URL for another user's OM, have
  Ask-the-deal summarise it into their own thread, overwrite it through
  Replace OM, or delete it; the same held for `deal_documents.storage_path`,
  a supplement's path, a branding logo's path and a worker job's parked
  model path. Confirmed by driving the real actions with a fake database.
  Now `lib/storage-paths.ts` is the one definition of the bucket's layout
  (a deal's objects all carry the deal's id; a logo sits in its account's or
  team's folder), and every storage primitive takes the scope it acts for
  and refuses a path outside it before any read, write, signed URL or
  delete — nothing per call site. Migration 0034 asserts the same shapes at
  the row. Alongside: `deleteDeal` treated a teammate's RLS-refused delete
  (zero rows, no error) as success and swept the creator's OM, documents and
  supplements out of storage while the row survived — it now sweeps only
  once a row was actually deleted, says who may delete, and the menu no
  longer offers Delete to a teammate; `regulatory_alerts` had an
  update-anything policy behind the banner every user sees — users may now
  write exactly the two dismissal columns (0034), and the banner links only
  a real web URL; a removed or departed teammate's share links on the
  team's other deals are revoked, and the shared page re-checks the
  sender's access on every render; the health probes no longer echo
  upstream bodies verbatim. A migration lint fails any future write policy
  with a bare `true`. 41 new tests, three of them the reviewer's probes
  turned into regressions.
- **#240 Words that can be a picture are a picture: the homepage and the
  sample screen, cut to one idea per section.** Your note — "homescreen is
  too jumbled… too many words and graphics and not enough just pictures…
  words that can be a picture should always be a picture" — measured
  first, then acted on. The homepage was 15,557px tall at desktop width,
  6,474 words, 45 headings and 42 paragraphs over 25 words, across 21
  blocks (a research ticker, a proof strip, the pulse board, the problem
  essay, the spread board, the retrade replay, six paragraph cards for the
  stages, a nine-card toolkit with four deep tools and eight workflow
  bullets, the rent-control playground, a markets marquee, the ground
  layer's four cards, seven artifact tiles, three pillars, a shipped-this-
  week block…). It is now 8,004px, 1,295 words, 15 headings and two long
  paragraphs (both FAQ answers, collapsed): the hero is one sentence and
  the sample deal card; the stats carry two-word labels; the problem is
  the spread drawn, not argued; the six stages are an icon rail with one
  word each, followed by the running trace; the verdict is the deal page's
  own tabs; the engine is the live stress bench; coverage is the aerial
  gallery; the artifacts are four tiles with the thing itself in each;
  everything else is an icon grid of eight labels; pricing, FAQ and one
  closing line. The long-form argument lives on `/why`, where it belongs.
  The sample screen's introduction, deliverables note, deep-tools cards,
  research cards and closing CTA each lost their paragraph; the marquee
  left it; the page now reads 4,557px and 1,029 words at desktop width,
  and the screen itself is most of that. Both pages were screenshotted at
  1440 and 390 before the commit. live-verify now gates on the hero headline and the build-sha
  stamp, not on copy that a redesign is meant to change, and the page lint
  read the new homepage clean before it shipped.
- **#241 The pipeline and the deal page get the same cut.** The pipeline's
  four empty stage headers ("Tracking 0", "Active pursuit 0", "LOI
  submitted 0", "Under contract / DD 0") are one picture: a six-rung stage
  funnel with a count on each rung, every rung a one-tap filter, hollow
  where empty. The Go / Caution / No-go counts are one split bar with the
  chips beneath; the free-plan allowance is a meter; the verdict select is
  gone (the chips are the verdict filter); the two export buttons are an
  icon and one word each; a teammate's deal wears their initials; a deal
  not yet screened shows an empty ring where its verdict pill will sit; the
  fit score carries a 0–100 bar; the getting-started card is three short
  steps under a three-segment progress bar; the new-deal form and the
  empty state each lost their paragraph (the empty state: 66 words to 34);
  the What's-new card lists titles only. On the deal page, the sample's
  "How to read this screen" is three icon steps and one line instead of
  four paragraphs, the verdict's flip line says only what the strip cannot,
  and the sensitivity, ask, decision-log, model and debt-sizer helper
  sentences each lost their second half (the sample's overview: 647 words
  to 466). Render tests on the fixtures, screenshotted at 1440 and 390 for
  every state.
- **#242 The model view, the comps footnotes, the bridge and the valuations
  legend, cut the same way.** "Add more to the model" is a row of chips,
  ticked where the document is in (what each one adds is the tooltip); the
  model's intro, stress, sensitivity and capital-plan lines each say one
  thing; the comps map's footnote and the public-web comps note are a line
  each; the bridge's method line and the valuations table's legend are half
  their length. The sample model view: 661 words to 568; the Financials
  tab: 956 to 863; the comps tab: 355 to 289. live-verify now prints one
  `DEPLOY: LIVE` / `DEPLOY: LAGGING` line comparing the live build to the
  main tip, so a deploy that has not landed is a sentence rather than two
  shas to compare by eye.
- **#243 The Market data page: the numbers first, the research notes one
  click away.** The public page that measured densest — 1,714 words and
  thirteen paragraphs over twenty-five words at desktop width — keeps every
  sourced figure (the vacancy board, the FMR ladders, the rules in force,
  the cap-rate tiers, the leaderboards) and folds the prose around them: a
  tracker's note, an FMR's provenance note, a sector's supply and debt
  paragraphs, the small-investor reasoning and the named gaps each show
  their first sentence with the rest behind "more" (`Fold`, a `<details>`;
  the text stays in the HTML, so the page lint, live-verify's greps and a
  screen reader still read all of it). The two hero lines, the metro
  explorer's helper, the heat grid's footnote, the compare card's two notes,
  the rates footnote and the intel empty state each say one thing. Now
  1,267 words and three long paragraphs — the two headline notes and one
  the fold's first sentence still runs long on — at 4,581px; the page lint
  reads it clean and every live-verify marker is still on the page.
- **#244 Twenty-two helper paragraphs across the tool pages, cut to a line
  each.** A census of the signed-in sources for JSX text runs of twenty-five
  words or more (`scripts/prose-census.mjs`, kept) found the last essays:
  the rent-roll page's four (intro, upload note, rollover profiles, the
  client-data note), the valuations, bridge and submarket intros with their
  import and scenario notes, the comps page's empty state, the news and
  data-health intros and the data-health empty state, the analytics empty
  state, the manual deal form's footnote, the LOI panel's note, the
  reconciliation panel's note, the "upload your own underwriting" note, the
  plan-sensitivity grid's caption, the research panel's and the debt
  sizer's plan-deal notes, and the What's-new intro. Each says one thing
  now; none of the phrases a test or live-verify looks for was among them.
- **#245 Three phone-width cuts the screenshots caught.** At 390px the risk
  digest's titles ended in an ellipsis ("Exit cap compression to 5…" said
  nothing) — they wrap to two lines now; the verdict's three-call strip ran
  off the right edge with the sponsor's call the one lost — it stacks on a
  phone; a deal's name in the pipeline was cut to a word and a half — it
  wraps to two lines on a phone and truncates only where the columns give it
  one. Fixture screenshots at 390 for each.
- **#246 A browser-runtime check of the public pages, and its two fixes.**
  Headless Chromium walked every public page at 1440 and 390 collecting
  console errors, page errors, failed requests and hydration warnings, and
  clicking through the sample screen's tabs and the stress bench's sliders:
  none. Two things it measured were worth fixing. The Market data page's
  seventy-odd same-page filter links (metro chips, sector chips, the heat
  grid, the leaderboards, the rank chips) each prefetched their route on
  load — about forty requests before the reader touched anything; they
  prefetch on hover now, and the page loads with eight. And a gallery tile
  whose aerial answered 404 would have painted the browser's broken-image
  glyph over the market's name; the image now removes itself (`AerialImg`,
  the rule `DealThumb` already applied) and the label carries on.
- **#247 The shared screen is rendered on fixtures, and says it in pictures.**
  The read-only page a partner or lender opens (`/share/[token]`) read the
  database inline, so it was the one signed-out surface the render tests and
  the phone walk could not reach. It is a loader and a pure view now
  (`share-view.tsx`); the view renders on the sample deal, on a conversion
  with a stale verdict, and in its expired state in
  `lib/views.render.test.ts` — accessibility, glued words and content
  asserted, the fixtures screenshotted at 1440 and 390. What the walk
  changed: the verdict wears the deal page's mark (the disc and the word in
  the call's colour); the conservative / base / sponsor calls are three dots
  beneath it; each range is the deal page's card — the Low / Base / High
  strip and the bar showing where the base sits — instead of a table that
  scrolled sideways on a phone and left a lender with the Low column; the
  three deal-killers carry their lever's numbered badge; the comp and market
  reads fold to their first sentence with the rest one tap away; a key
  term's label wraps instead of trailing off as "PRO FORMA …", and its value
  no longer runs into the next column on a phone. The source test that
  guarded the page's key-term ordering and basis badges now reads the view.
- **#248 The shared screen opens on the building from above.** It was the
  one surface still without imagery: the deal page's aerial route needs a
  signed-in session. The token's resolution — malformed, missing, revoked,
  expired, the deal gone or unscreened, the sender without access — moved
  out of the page into one function (`lib/share-resolve.ts`) that the page
  and a new token-scoped route (`/api/share/[token]/aerial`) both run, so
  the picture lives exactly as long as the link: a dead link is a bare 404
  there before any imagery source is asked. Pinned to USGS (public domain,
  no key, the credit line printed under the frame); a deal with no address,
  or a frame nothing can produce, removes the whole figure rather than
  leaving a glyph or a credit under an empty frame. Eight tests drive the
  resolver and the route against a fake admin client; the render test
  asserts the figure on the sample and its absence on the address-less
  conversion.
- **#249 The IC memo opens on the building from above.** The memo and the
  full report fetch the deal's USGS frame at render time
  (`lib/memo/cover-aerial.ts`, through the same resolver as the deal page's
  Aerial tab) and print it at the top right of the masthead, credited,
  spanning the brand line, the rule and the title — the height the masthead
  already spends, so a memo that fit one page still does (the first cut sat
  it beside the title and pushed the sample onto a second page; the test
  caught it). The public sample memo carries the frame of Brewerytown itself
  at fixed coordinates, no geocode. Bounded: imagery gets four seconds and
  then the memo prints without it; a deal with no address prints as before.
  And a guard the exercise found: react-pdf does not throw on a PNG whose
  zlib stream fails its data check — it hangs the whole render, and the
  download with it (a hand-typed test fixture did exactly that). The cover
  fetcher now validates the bytes before embedding — a PNG must carry its
  signature, inflate cleanly and end in IEND, a JPEG must open and close
  with its markers — and the test fixture is a PNG built with the real
  deflate and a real CRC (`lib/memo/test-png.ts`). Ten tests on the fetcher
  and the guard; the memo render test asserts the image object on page one
  and the page count.
- **#250 Pictures in the memo, and its footer band reserved.** The memo's
  ranges table gains an "In range" column — the deal page's positional read,
  drawn as a track, the span up to the base and a dot (caution-coloured when
  the base hugs the optimistic end) — and each scenario's call in the flip
  strip carries its dot, all plain react-pdf Views: nothing to decode, no
  height beyond the row's text (Low, High and Conf. gave up a little width).
  The footer band the sample memo ran to within a few points of is reserved
  now (`paddingBottom` covers the footer's rule and line), with the room
  found in the masthead, section and card margins, so the sample still fits
  one page and a memo that cannot fit flows to a second page instead of over
  its own footer. `pdfFillCountOf` (test tooling beside `pdfTextOf`) counts
  the filled shapes in a PDF's content streams; the memo render test asserts
  three fills per range against a render whose ranges do not parse, and that
  a base below its low end sits at the start of the track.
- **#251 Data bars in the meeting workbook.** The pipeline export's price,
  cap and yield-on-cost columns carry Excel data bars — conditional
  formatting Excel draws itself and keeps live as the numbers change, a
  picture with no chart library and nothing computed into a cell. The rule
  covers the deal rows only (a stage band, a dash and "n/a — plan" are text
  and draw no bar, so a plan deal's cap column stays honestly empty); an
  empty pipeline writes no rule. The workbook test reads the three rules
  back — their ranges end at the last deal row, their scale runs min to max.
- **#252 The compare table draws the spread.** Under each IRR, equity
  multiple, cash-on-cash, going-in cap and yield-on-cost figure sits the
  same 0–100 bar the pipeline's fit column draws, scaled to the row's
  largest figure, so a meeting reads which column leads at a glance. A
  rejected deal's bar is drawn (the proportions must be honest) but muted,
  and the "best" pill still never lands on it; a plan deal's cap cell draws
  no bar, as it shows no cap; one deal alone has no spread and draws none.
  The compare fixture asserts eleven bars, the muted one, two "best" pills
  and none for a single column; shot at 1440 and 390.
- **#253 The report's market page draws the OM on its range.** The Market
  plausibility table gains an "On range" column: the OM's figure placed on
  the typical range the way the memo places a base between its low and high
  — a track, the span to the figure, a dot in the read's colour (kill for
  aggressive, pass for conservative) — with a figure past either end sitting
  at that end while the Read chip says which way. `rangeRead` parses
  "5.25–5.75%", "$1,200–$1,400" and "50 to 60%", and gives nothing for a
  range that is not one, so the row prints as before. Plain Views, no height
  added; the report render test asserts three fills a check against the same
  report with ranges that do not parse, and the parser's cases.
- **#254 The compare page at phone width stacks a card per deal.** Below the
  `sm` breakpoint the side-by-side table scrolled inside its card, so a phone
  read one deal's column and a sliver of the next. It now renders one card
  per deal — the name and verdict pill, the screen's reason, the buy-box fit,
  then every table row as a two-column list with the same figures, "best"
  pills and spread bars — and the table takes over from `sm` up. The spread
  and the best marks are computed once for both layouts, so the two can
  never disagree. The compare fixture asserts twenty-two bars (eleven per
  layout), four "best" pills, a card per deal and the table hidden below
  `sm`; shot at 390.
- **#255 The compare page's leverage row draws its signed spread.** Every
  other return row drew its spread in #252 and #254; "Leverage vs 30-yr"
  still said "+190 bps" / "−60 bps" in words and a colour. The figure is
  signed, so its picture is a bar from a centre line — right in the pass
  colour, left in the kill colour, a thin spread in the caution one — scaled
  to the widest spread in the row either way, muted on a rejected deal, and
  absent on a plan deal (judged on yield on cost) or when one deal is
  compared alone. The row stats both layouts share take the absolute value
  on a signed row, so the cards and the table draw the same bar. The compare
  fixture asserts four signed bars (two per layout), the Maddox's −60 bps at
  16% of the half-track to the left against the Tysons' +190 at the full
  half to the right, and none for a single column; shot at 1440 and 390.
- **#256 The pipeline row draws its fit below `lg`.** From `lg` up each row
  draws its mandate score as a 0–100 bar in the call's colour; below `md`
  the fit was a word at the end of the row's second meta line ("$68.0M ·
  5.6% cap · Fit 71 · Watch"), the part a one-line truncation cut first, so
  at 390 most rows ended in "…". The row now draws the same bar on its own
  line below `lg` — a "fit" micro-label, the bar, the words for a screen
  reader — and the fit word leaves the phone and tablet meta lines; a deal
  with a buy-box read but no score keeps its word, having no figure to
  draw. One `FitBar` serves the column and the line. A plan deal's "7.2%
  yield on cost" bit, which only ever shows below `md`, wears the cap
  column's "yoc" micro-label there so the line fits too. The pipeline
  fixture asserts twelve bars (six scored live deals, twice each) and the
  words once per deal; shot at 390.
- **#257 Data bars on the rent-roll workbook's Rollover tab.** #251 gave
  the meeting workbook Excel's own data bars; the rent-roll export's
  Rollover tab still carried the space expiring each year and the capital
  to re-lease it as figures alone. Both columns now carry the same
  conditional-formatting data bar over the year rows — drawn by Excel off
  the SUMIFS results, so it stays live as the rent roll is edited, with
  nothing computed into a cell — and the range ends at the last year row,
  so the Total row draws no bar. The workbook test reads the two rules
  back (C4:C14 and M4:M14 on the ten-year fixture, min to max) and checks
  the Total sits on row 15, outside them.
- **#258 Data bars across the Cash Flow tabs' NOI and levered cash flow.**
  #251 and #257 put Excel's own data bars down a column; the two Cash Flow
  tabs — the model workbook's and the rent-roll export's — still carried
  NOI and levered cash flow across the years as figures alone. Both rows
  now carry the same data bar across the operating years, so the growth
  (or a lease-up's dip) reads at a glance and stays live because Excel
  draws it off the formulas. The forward / reversion column is the sale's
  input, not a year owned, and the sale proceeds sit on the vector rows,
  so neither is in the range — the bar compares like with like. Each
  workbook test reads its two rules back: C..(C + hold − 1) on the rows
  the labels name in the model, C18:L18 and C28:L28 in the ten-year
  rent-roll fixture.
- **#259 The rent-roll page draws each lease against market.** The Mark to
  market table listed each lease's in-place rent, market rent and the gap
  as six figures a row, and at 390 it scrolled sideways inside its card.
  Each row now draws the gap as a bar from a centre line — right in the
  pass colour when the lease sits below market (room to roll up), left in
  the kill colour when it sits above (roll-down risk) — as a share of its
  market rent, scaled to the widest gap on the page so the leases compare
  with each other; a market rent of nothing draws none. Below `sm` the
  table gives way to a card per lease: tenant and gap, the bar, then the
  two rents, the annual gap and the size. The share is computed once for
  both layouts. The clean-roll fixture asserts a bar per priced lease in
  each layout, the card list, the coloured fill and the table hidden below
  `sm`; shot at 390.
- **#260 One comp-detail reader, and the comps table draws each sale comp
  against the subject.** A broker comp's figures arrive as one line of text
  ("$252k/unit · 5.6% cap · Q3'25"), so nothing could draw them.
  `lib/comp-detail.ts` reads a per-unit or per-SF basis and a cap out of
  that line when the text states one — "$252k/unit", "$252,000 per door",
  "$410/SF", "$410 psf", "5.6% cap", "cap rate 5.60%" — and nothing
  otherwise: a monthly rent, a bare price, a growth rate wearing a
  percentage all read as no figure, the same honesty as `rangeRead`. The
  subject's own basis comes from the shared price, unit-count and
  building-size readers (a conversion or a development, judged on all-in
  cost, gets none), and `basisScale` puts every comp and the subject on one
  track. The deal page's sale-comps table draws each comp's basis as a bar
  under its detail with the subject as a tick, a one-line legend beneath;
  lease comps draw none. The demo's comps tab gets the same. Eleven reader
  cases; the deal-view render test asserts three bars, three ticks and the
  legend on the sample.
- **#261 The report's comp page draws the same bars.** The full report's
  Comp scrutiny page printed each comp's detail line alone; it now draws
  each sale comp's stated basis under the line as a track, the comp's fill
  and a 1pt tick where the subject's own basis sits — the same
  `basisScale` the deal page's table uses, so the two never disagree on a
  comp — with a one-line legend under the set. Plain Views, the memo's
  way; a comp that states no basis draws none, lease comps draw none. The
  report render test asserts the fill-count delta: the sample's three
  sale comps draw nine more shapes than the same report with comps that
  state no basis.
- **#262 The comps table at phone width stacks a card per comp.** #260's
  basis bars sat in a table that kept `min-w-[34rem]`, so at 390 they were
  off-screen to the right of the name column. Below `sm` each comp table
  now renders a card per comp — name and rating pill, the note, the detail
  line with its bar and the subject's tick — and the table takes over from
  `sm` up; one `CompBasisBar` draws the bar in both, so the two can never
  disagree. The deal-view render test asserts six bars and six ticks on
  the sample (three per layout), a card list per table and the table
  hidden below `sm`; shot at 390.
- **#263 The reconciliation's gap draws as a bar from a centre line.** The
  last of the report's number-only reads (WILL_TODO item 8): each
  reconciliation row carried its gap as text — "$174k below the OM", "300
  bps higher", "In agreement" — coloured by its direction. A pure reader,
  `lib/gap-detail.ts`, reads the magnitude that text states (dollars with
  their k / M suffixes, basis points, a percentage; dollars first when a
  line carries two) and nothing otherwise, and `gapScale` puts each row on
  its own unit's track — a dollar gap against the widest dollar gap, a
  basis-point gap against the widest in basis points, never across — signed
  by the row's stated direction, so the words are never second-guessed. The
  deal page's Reconciliation table draws it under the gap figure (favorable
  right in the pass colour, unfavorable left in the kill colour, a centre
  tick, one legend line) and the report's reconciliation page draws the
  same bar as plain Views — track, fill, tick — with the fill count
  asserted: the sample's two stated gaps draw six shapes more than a report
  whose rows all agree. Seven reader tests, a deal-view render test on the
  reconciler tab, and the report test.
- **#264 The reconciliation table at phone width stacks a card per row.**
  The last table on the deal page that still scrolled sideways on a phone:
  at 390 the gap column — the direction badge, the figure and #263's bar —
  sat off-screen to the right of the metric. Below `sm` the Reconciliation
  now renders a card per row — the metric and its direction badge, the OM's
  figure and yours side by side, the gap with its bar — and the table takes
  over from `sm` up; one read per row feeds both layouts and one `GapBar`
  draws in both, so the two can never disagree. The sample screen's
  reconciler tab is the same component. The deal-view render test asserts
  four bars on the sample (two per layout), one card list and the table
  hidden below `sm`; shot at 390.
- **#265 The reconciler is asked for each gap's figure, and the reader
  takes every shape it might get back.** #263 draws a gap only when its
  text states a magnitude, and the reconciler prompt asked for "a
  plain-language description of the gap" — so a real screen's rows could
  read "heavier expense load" and draw nothing while the sample drew. The
  prompt now leads each gap with its figure — the dollar amount, basis
  points or percentage the two values differ by, then the reason in a few
  words; a row in agreement says so and states none — and a prompt test
  holds the instruction's own three examples up to `gapFigure`, so the
  prompt can never promise a shape the reader will not draw. The reader
  itself grew the shapes a model writes when asked for a figure: "$1.2
  million", "$450 thousand", "$5MM", "$2bn", "2 pp", "per cent" — a suffix
  counted only when the word ends there, so "$174 mortgage" stays $174.
  Eight reader tests and the prompt contract.
- **#266 The section counts draw as split bars.** The Risk digest said "4
  high · 6 med · 1 low", the challenger "2 high · 1 med", each comp table
  "1 stretched · 1 leans · 1 support", the Reconciliation "2 unfavorable ·
  1 neutral" — the same dotted count words the pipeline replaced with its
  verdict-split bar in #241. One `SplitBar` now draws each: a bar with a
  segment per kind in its colour, the same count words beside it in the
  same colours (they stay the accessible text; the bar is decoration with
  the counts as its tooltip). Four call sites, the four hand-rolled
  separator chains they replaced gone; the sample screen's tabs are the
  same components. The deal-view render test asserts the reconciliation's
  bar (two segments, two thirds kill), a bar per comp table and the
  challenger's tally; shot at 1440.
- **#267 The comp scrutiny names each comp's detail line.** #260 and #261
  draw a sale comp's basis only when its `detail` states one, and the
  comps prompt never said what `detail` should carry — the schema was a
  bare string — so the bars drew on the sample and depended on luck on a
  real screen. The prompt now asks for the stated basis first — a sale
  comp's price per unit (or per SF, or per key) and cap rate, then the
  date and size, "$252k/unit · 5.4% cap · Mar 2026 · 210 units"; a lease
  comp's rent and unit type or space — and nothing the OM does not state;
  the zod field carries the same description, so the model sees it twice.
  A prompt test holds the instruction's sale example up to `compFigures`
  ($252k a unit, a 5.4% cap) and checks the lease examples carry no basis
  to draw, so the prompt can never promise a shape the reader will not
  draw.
- **#268 The market check names the shape of its figures.** The deal
  page's market tab draws each OM figure on its typical range only when
  both parse as numbers in one unit (`parseRange`, `firstNum`), and the
  report's market page the same (`rangeRead`, #253) — and the market
  prompt asked only for "what the OM says, a typical range", no shape;
  the schema's two fields were bare strings. The prompt now writes
  `omSays` as the OM's figure with its unit ("5.45%", "$2,400/mo",
  "4.0%/yr") and `typicalRange` low to high in the same unit with an en
  dash ("5.25%–5.75%", "$2,150–$2,450/mo", "2.5%–3.5%"), words rather
  than an invented range where none applies; the zod fields carry the
  same descriptions. A prompt test holds the three example pairs up to
  `rangeRead` — each reads as a position on its range — and checks a
  range in words reads as none, so the prompt can never promise a shape
  the two pages will not draw. Its first run earned its keep: the report's
  reader refused "5.25%–5.75%" — a unit after the low figure broke its
  match, so the report drew that range only when the unit came once, at
  the end — and now takes it, with a hyphen or "to" for the dash.
- **#269 The News page's live headlines always paint.** The section
  streams in behind the page, and on the live site it never arrived: the
  skeleton sat there ("reading the publishers' feeds…") for as long as the
  browser waited. Each feed was fetched through Next's data cache with an
  abort signal the cache does not reliably honour, so one publisher that
  accepts the connection and never answers held the whole streamed section
  open. The live layer now keeps its own fresh copy per source (half an
  hour, per process), fetches with `cache: "no-store"` so the signal is
  the request's own, and races every source against a wall-clock deadline
  — whatever a publisher does, its slot resolves inside the timeout plus a
  hair, with its items, its last good copy, or nothing, named. A test
  drives the worst case (a feed that accepts and never replies, ignoring
  the abort) and sees the section resolve in under a second at a short
  timeout; two more cover the fresh copy and the last-good copy. The
  health route is public now — publisher names, outcomes, latency, the
  top links; nothing secret — and live-verify prints every feed's outcome
  from Render's own network after each deploy, so an empty section is
  diagnosed there, never guessed at from a sandbox that cannot reach the
  publishers. The empty state gets a Try again link.
- **#270 The pipeline's formatting, from the operator's screenshot.** Three
  things the eye caught on the live page. The filter row wrapped with one
  stranded "All fit" select on a second line beside the exports: a select
  is as wide as its longest option and a market name can run to a whole
  line, so the asset and market selects are capped and the CSV and Excel
  buttons travel together at the row's right edge. A row with a building
  picture started its name forty pixels to the right of a row without
  one: every row keeps a picture slot of one size now — a blank plate
  where there is no address, or where the picture 404s — so the names sit
  in one column. And a deal created with "Auto-detect" showed "● Auto" as
  if it were an asset class: the row shows what the extraction read the
  deck as, and nothing before anything has read it (`shownAssetClass` in
  `lib/pipeline-slots.ts`, tested). The shot of the fixture caught a
  fourth: a storage deal's row said "Self_storage", the stored key with
  its underscore, because every surface printed the key under a CSS
  capitalize. One module now holds the classes and their words
  (`lib/asset-class.ts`: `ASSET_CLASS_LABEL`, `assetClassLabel`, and the
  forms' option list drawn from it), and the pipeline row and its filter,
  the CSV and the meeting .xlsx, the compare table, the shared screen, the
  market cards and the submarket pages all print through it — "Self-
  storage", "SFR / BTR", "Manufactured housing"; a class the extraction
  phrased itself reads with its first letter up; "auto" and nothing read
  as nothing. The pipeline render test asserts the nine photo slots, the
  two blank plates, the exports' group, and that the key never shows;
  shot at 1440 and 390.
- **#271 Every screen records what it cost.** The operator's ask: a screen
  on the flagship runs about $3, and the margins are not there at $3. The
  first move is to measure rather than estimate. Every structured-output
  call already reports four token meters on its response (uncached input,
  cache writes, cache reads, output); `structured()` now records them —
  before its guards run, so a cut-off or a refusal still counts — into
  whichever ledger is open on the async context (`lib/anthropic/usage.ts`,
  an `AsyncLocalStorage`; a call outside a screen records nowhere).
  `runAnalysis` opens one, and when the run ends — on success and on
  failure alike — writes the ledger with its totals and a list-price
  estimate to the job row (`analysis_jobs.usage`, migration 0035,
  best-effort) and says it once in the log; the reconciler logs its own.
  The prices live in `models.ts` by id prefix, with the cache write at
  1.25× and the read at a tenth; a model the table does not know is still
  metered and its dollars left blank. `/data-health` gains a Cost per
  screen card: the median of the last screens as the number, the latest
  screen's split by step as a stacked bar, the four meters in one line.
  `models.ts` also gains the verdict's own override (`MODEL_VERDICT`) — the
  verdict reads the gathered results, never the deck, so it is the one
  step that can run on a different model without a second cache write —
  and its comment now says the thing the old one had wrong: the prompt
  cache is per model, so splitting the extraction onto a cheaper tier
  under a flagship judgement writes the deck twice and costs more; the
  OM-reading steps move together or not at all. Tests: the ledger
  (records only when open, two runs side by side, meters read defensively,
  the price table, the split by step, the median), `structured()` recording
  a finished answer and a cut-off, and the pipeline writing the ledger on
  a finished and on a failed screen, and nothing when no call was made.
- **#272 The deck goes as text first.** The lever that keeps the flagship.
  A deck the model reads as PDF pages costs tokens for every page's pixels;
  the same deck's own text layer — what a reader's select-all would copy —
  is a third to a quarter of that, on every OM-reading step at once, and
  most OMs are exported from a layout tool and carry a full one.
  `lib/pdf-text.ts` reads it with pdfjs (loaded lazily, in-process, no
  worker thread and no canvas): items on one baseline become one line,
  left to right, with a space only where the gap between two runs is
  wider than a fraction of the type size, so "$21.0" and "M" read back as
  "$21.0M" and a rent roll's row stays one line. The layer stands in for
  the pages when it is dense — half the pages carrying text and a few
  thousand characters in all, which admits a glossy deck's photo pages and
  refuses a scan — as one page-tagged document whose header says how to
  cite a page (`omSourceFor` with `textFirst`: the screen and Ask; a
  buyer's model, a BOV, a rent roll keep their pages). A page with no text
  says so, so the model never wonders whether a page went missing, and the
  layer's page count — exact, pdfjs walked the pages — is what the facts
  are validated against. `OM_READ=pdf` forces the pages for every deck,
  `OM_READ=text` the layer whenever there is any; the ledger (#271) shows
  the difference. `next.config.ts` keeps pdfjs external to the server
  bundle, as the worker's bundler already does for every package. Tests
  render real PDFs (react-pdf) and read them back: every page in order, a
  table row as one line, the split run rejoined, the empty page marked, an
  unreadable file as no pages; the line rebuild's gap rule; the density
  read; the document's header; and the transport choice under each
  `OM_READ`.
- **#273 How the OM is handled, beside the price.** The operator asked
  for the category's professional conventions, so they were read (the
  sites themselves are unreachable from the sandbox; what their pages
  carry is in the public record): the deal-management leader leads with
  its SOC 2 Type 2 attestation, its customers' logos and a transaction
  total, and every 2026 homepage guide puts the trust signals beside the
  pricing. We have no attestation, no named customers and no total, and
  the site says nothing it cannot back — so the one convention that
  applies honestly is the placement. Under the three plans, four tiles
  say how an uploaded OM is handled — private storage with links that
  expire, isolation in the database itself, never used to train a model,
  delete it all self-serve — each an icon and a few words, each opening
  `/security`, which states every one in full and says plainly that
  there is no badge. live-verify greps the strip's class on every run.
  Shot at 1440 and 390.
- **#274 The publishers that refuse the fetcher are read another way.**
  The NEWS HEALTH lines that #269 added read the feeds from Render's own
  network and said which doors were closed: The Real Deal, Multi-Housing
  News and Commercial Property Executive answer the server with HTTP 403,
  GlobeSt's FeedBlitz address parses to nothing, and one run saw Google
  News answer 503 on all four topic searches at once. Three changes. The
  fetcher asks as a browser-shaped reader that still says who it is
  ("Mozilla/5.0 (compatible; UnderwriteCopilot/1.0; +…/news)") — a bare
  product token is what a publisher's edge rules refuse outright. Each of
  the four gains fallbacks (`NewsFallback` on the source: GlobeSt's own
  `/feed/`, then for all four a Google News search scoped to the outlet's
  site, whose items name the outlet in `<source>` and so rank and show as
  the publisher's), tried in order inside the source's one budget — the
  publisher's own feed always gets its try, a fallback or a retry starts
  only with real time left, and the wall-clock deadline holds regardless.
  A candidate that answered 429 or 5xx is tried once more after half a
  second. The status names the way in (`via`) when a fallback answered and
  every door that closed when none did ("feed parsed to zero items ·
  Google News · site:globest.com: HTTP 404"); live-verify prints `via`.
  Tests: the user agent; a 403 read through the site-scoped search with
  the outlet kept; a landing page falling through the same way and the
  error naming each candidate; a fast 503 retried once and a 403 not; a
  hanging publisher leaving no time for its fallbacks inside a held
  deadline.
- **#275 A question's spend is said in the log.** Ask-the-deal is one
  read of the whole deck per question — up to twenty-five a deal — and
  until now it spent silently. `askDealQuestion` opens its own ledger
  around the call and, when the answer is back (or has failed), logs the
  same line a screen does, headed "ask usage for deal …", with the four
  meters and the list-price estimate; the server action hands it the
  deal's id. Since #272 the deck goes as its text layer here too, so the
  line is also where that saving shows on a question.
- **#276 The Cost per screen card is rendered on fixtures.** The card
  #271 added lived inside the operator's page, which reads a database no
  test can reach — the one signed-in picture with no render test. It is
  now its own pure view (`app/(app)/data-health/cost-card.tsx`: the page
  hands it the ledgers it read), and `lib/cost-card.render.test.ts` draws
  it on three fixtures and reads it back: the median as the number and
  the row without a ledger ignored; one bar with six segments in
  pipeline order, the cache write the widest, the widths summing to 100,
  the bar's spoken label naming every step's dollars; the meters line
  with its counts; a screen with an unpriced step leaving that step's
  dollars blank, naming the model, and the median counting only the
  screens that priced; the two empty states. The text and the markup go
  through the same lint as every other view. `CLAUDE.md` gains the
  orientation lines for what this round added — the usage ledger and the
  price table, the OM's text-first read, the asset-class words, the News
  layer's fallbacks — so the next session reads them before touching any
  of it.
- **#277 A text layer that reads to no figures is re-read as pages.** The
  safety net under #272. A layer can be dense and still not be the deck —
  OCR noise on a scan that was run through a recognizer, a layer of
  captions under the pictures that hold the figures — and then the
  extraction finds nothing. Before the screen gives up, the extraction
  step reads the pages themselves once (the PDF is right there), says so
  in the log, and every later step reads the pages too; a deck that is
  empty both ways still stops with the honest "scan or
  password-protected" sentence, nothing stored. The pipeline test drives
  both on the recording fake: the second read on the buffer source, the
  challenger and the market check on the buffer too, the stored
  extraction the second read's; and the double-empty stop.
- **#278 The News layer survives a cold start.** The first health read
  on a fresh process — minutes after a deploy, twice in a row (runs 410
  and 412) — found 4 of 12 sources: a first visitor's parallel read sends
  eight requests to Google News at once from one address, and Google
  answers a burst with 503s and held connections, so the four topic
  searches and the four site-scoped fallbacks all died together. Six
  layers now: a gate per host (two requests in flight per host from this
  process, the rest queued in order, a freed slot handed to the next in
  line); a door with others behind it holds at most half the source's
  budget, so a host that hangs leaves time for the next; one request per
  source shared by whoever arrives while it is in flight; a second search
  host — Bing News as RSS, its `News:Source` read as the outlet, its
  click-tracking redirect unwrapped to the article — behind every Google
  News read, topic and site-scoped alike; the fresh copy keeps its `via`,
  so a cached line still says the way in; and a warm-up at boot
  (`instrumentation.ts`, the Node runtime only, two seconds after the
  server is up, `NEWS_WARM=0` to turn off) that reads the sources one at a
  time so the first visitor after a deploy finds every source cached. The
  footer names the search hosts it leaned on. `live.test.ts` drives each
  with a fake fetch that honours the abort signal: the gate's peak of two,
  the half-budget cap answering through the second door in under the
  budget, the shared request fetched once, the cached `via`, the warm-up
  at one in flight with its log line; `feeds.test.ts` parses a Bing item
  and holds every Google read to a Bing door behind it.
- **#279 The twelfth review's findings: the text layer is held to the
  deck.** Four findings on #269–#277, each reproduced by execution before
  it was fixed. A worker attempt resumed after the extraction had fallen
  back to the pages rebuilt the OM text-first, so the challenger, the comp
  scrutiny and the market check read the layer the previous attempt had
  already found empty: the fallback now writes `omPages` into the
  checkpoint payload the moment it happens, and a resumed attempt builds
  the pages source from the start. The density read counted every
  character, so a picture deck whose only text was the disclaimer under
  each photo read as dense: a line that recurs on half the pages, once or
  twice a page, is the deck's furniture and counts on none (a rent roll's
  rows share one shape once the digits are out and are never furniture),
  and a deck under four pages goes as its pages — a cover letter over a
  scan is not a deck. The same fallback now fires when the layer read
  figures but no NOI of any kind, the shape of a narrative whose
  financial tables were pasted in as pictures. The cost card said "median
  of the last 3 screens that priced" with one priced; it now counts the
  screens that priced, and says so plainly when none did. And the
  pipeline row lower-cased a class the model phrased itself before the
  label raised its first letter — "NNN retail" showed as "Nnn retail"; a
  known class still comes back as its key whatever its case, a phrase of
  the model's own keeps its case. Tests: two pipeline runs on the
  recording fake (the no-NOI re-read, and attempt two reading the pages
  the payload remembers), two rendered decks (footer-only sparse, footer
  under text dense) and the synthetic rent roll, the cost card's three
  sentences, the row's acronyms.
- **#280 The warm-up reports, and the search doors are checked from the
  runner.** Two things #278 left to inference. Whether the boot warm-up
  ran before the probe could only be read off the `cached` lines;
  `/api/news/health` now carries `warm` — the last warm-up this process
  finished: sources answered, of how many, how long, when — and
  live-verify prints it as one `NEWS WARM-UP` line. And the Bing door was
  written blind: the sandbox that writes this code cannot reach either
  search host, so the parser's assumptions (`News:Source` names the
  outlet, the link is a click redirect the parser unwraps) had no
  witness. A new non-gating live-verify step fetches Bing's site-scoped
  and topic feeds and Google's site-scoped feed from the runner and
  prints each door's HTTP status, item count, `News:Source` count and
  click-redirect count, so the shape is verified from a network that can
  reach it, on every run.
- **#281 A plain retry keeps the pages fallback with its checkpoints.**
  Found while holding #279's fix up to the worker's other resume door.
  The claim a plain retry makes after a failed screen (`claimJob` with
  `keepCheckpoints`) rebuilt the payload from the fresh handoff plus the
  prior `completed` list — and dropped `omPages`, so a retry that skipped
  the extraction would have built the OM text-first and handed the
  challenger the layer the failed attempt had already found wanting. The
  mark now rides with the checkpoints on that path only: never on a
  replace-OM (whose checkpoints describe the old file), never off a done
  prior (which is diffed against, not resumed). `jobs.test.ts` holds all
  three.
- **#282 The runner probes the queries the next fix will use.** The first
  run of #280's search-door step said what the sandbox could not: Bing's
  site-scoped and topic feeds answer with items, a `News:Source` per item
  and a click redirect per item — the parser's assumptions hold — and
  Google answers the runner's address at once. The same run's health
  lines, on a process where Google News hung on every request, showed
  the shape of the next fix: the site-scoped fallbacks queued behind the
  hanging topic searches until their budget was gone, and Bing's
  multifamily and debt topic queries (Google's `OR` and quote syntax
  passed through) parsed to zero items. This slice adds the three plain
  keyword queries #283 will use to the runner's probes, so their item
  counts are known before the code depends on them, and the health print
  gains the `NEWS HELD` line #283's route will feed. `WILL_TODO` records
  the 17:59 and 18:03 reads.
- **#283 A host that hangs is held at bay.** The 18:12 read (on #282's
  fresh process) was the same weather as 17:59: Google News hung on every
  request, and the eight sources that read through it queued behind two
  hanging requests until their budget was gone — 5 of 12, Bing never
  tried for the site-scoped fallbacks. Three changes in `lib/news/live.ts`.
  A door with another behind it waits in its host's queue at most half
  the budget that is left, then moves on (the error says `queued past
  half the budget`). A host that timed out, dropped the connection or
  answered 429/5xx three times inside a minute is held for 45 seconds and
  its doors skipped at once, so the next door gets the whole budget — a
  403, a 404 or an empty page never counts (the host is up, the publisher
  said no), nor does a request given under 300 ms. And the warm-up
  reports its progress while it runs (`warm.done`, the count so far).
  `/api/news/health` names the held hosts (`held`); live-verify prints
  `NEWS HELD` and a running warm-up. The three Bing topic queries drop
  Google's `OR` syntax: the runner's probes read 12 items for `CMBS
  delinquency distress` but 2 for `multifamily apartments sale` and 1 for
  `rent control ordinance`, so the code uses `multifamily` and `"rent
  control"`, and the probes keep a second phrasing beside each. The
  thirteenth review's three findings on this file ride along: the
  half-budget cap was half the *whole* budget, so two doors that hang
  spent it all and a third (Bing, behind GlobeSt's two own URLs and
  Google) was never asked — each door now holds at most half of what is
  left (4000 → 2000 → 2000 ms); a stale copy carried no `via`, so a
  source that had answered through Bing was credited to Google once
  served stale; and a fetch that outlives its abort kept its host slot for
  the life of the process — `fetchFeed` now races the wall clock beside
  the signal, and a caller's deadline drops only its own request from the
  shared map. `live.test.ts` drives each with a fake fetch; the two news
  suites hold 49 tests.
- **#284 The thirteenth review's two remaining findings.** Both cost,
  not correctness: each sent a deck back to the pages for nothing. The
  furniture rule (#279) discounted a line only when it appeared once or
  twice a page, so the caption tiled under three renderings on every
  page of a picture deck counted as text and the deck read as dense —
  the model read a layer of captions, found no figures, and the pages
  were read after all. `summarize` now also treats a line whose exact
  words recur on half the pages, however many times a page, as furniture
  (`lineText`; a table's rows differ by their figures and never match).
  And `classifyNoi` refused any label with a slash as a per-unit rate,
  so `NOI (T-12 / TTM)` read as no NOI and `textLayerMissed` re-read the
  pages; a slash is a rate only when a unit follows it (`NOI / SF`,
  `NOI/key`, `NOI / month` still are). `pdf-text.test.ts` holds the
  tiled caption (bare, and under real text) and a table's header row
  against its rows; `deal-strategy.test.ts` the slash labels;
  `pipeline.test.ts` drives `textLayerMissed` directly.
- **#285 One news state per process.** #283's proof (18:36 UTC, a fresh
  process) read 11 of 12 with every search-backed source `via Bing` and
  `NEWS HELD: news.google.com … after 3 failures` — the breaker at work
  — but `warm` was still null, as it had been at 18:05 and 18:12 on
  processes minutes old. Reproduced on the built server in the sandbox:
  the service log printed `[news] warm-up: 0 of 12 sources answered`
  while the health route in the same process said `warm: null` and
  nothing cached. A loader hook showed why: Next compiles
  `instrumentation.ts` into its own module graph with its own runtime
  (`.next/server/chunks/[turbopack]_runtime.js`), apart from the routes'
  (`.next/server/chunks/ssr/[turbopack]_runtime.js`), and each runtime
  keeps its own module cache — so `lib/news/live.ts`'s module-level Maps
  were two sets in one process: the warm-up filled one, the News page and
  the health route read the other. Every deploy's first visitors were
  waiting on twelve fetches the warm-up had already made. The state now
  lives on `globalThis` under a registered symbol (`liveState`), which
  every copy of the module finds; `live.test.ts` loads the module twice
  (`vi.resetModules`) and asserts the second copy sees the first's
  warm-up and cached copies. The health JSON gains `process` (pid,
  uptime) so a null `warm` can be told from a process seconds old;
  live-verify prints `NEWS PROCESS` and probes three Bing phrasings for
  Commercial Property Executive, whose site-scoped read parsed to zero
  items on Render.
- **#286 The fourteenth review's five findings.** The first was a
  regression #284 shipped for twenty minutes: its slash rule listed the
  unit words that make a rate, so any denominator the list had never
  heard of — `NOI / RSF`, `NOI / NRA`, `NOI / GLA`, `NOI / EGI`, `NOI /
  Quarter`, `Price / NOI` — read as the NOI itself, and a $12.10-per-foot
  row would have anchored the workbook, the debt sizer and the T-12
  comparison. The rule is inverted: after a slash, only a period or a
  basis word keeps the label an NOI (`T-12 / TTM`, `/ cash flow (in
  place)`, `2025 / 2026 budget`); anything else is a denominator, as
  before #284. `deal-strategy.test.ts` holds fifteen denominators. In
  the news layer: a caller already in a host's queue when the hold
  trips now gives its slot back unused instead of spending half its
  budget on the held host (`live.test.ts`: two prior faults, then two
  sources that trip the hold with a third queued behind them — the
  third never asks the host); a door with others behind it gives up a
  grace past its own timeout rather than the source's whole window, so
  an abort-ignoring first door no longer eats the doors after it; and
  the module comment says what the code does — a timeout on a request
  given under 300 ms never counts, a 429 or a 5xx always does. In the
  text layer, a line carrying a figure (three digits or more, or a
  currency sign) is never a tiled caption, so a self-storage inventory
  whose size rows repeat across half the deck stays the deck
  (`pdf-text.test.ts`).
- **#287 The pipeline gets a table's room, and the News page says how
  many sources answered.** Your 18:47 note ("0 changes on the actual
  site … the pipeline as well") sent me back to the screenshots: at
  desktop width seven fixed columns and the stage select left the deal
  name about 150 px inside the reading-width shell, so most names cut
  to "The Maddox at Bre…" beside a half-empty asset column. The pipeline
  list now takes the wide shell (`max-w-7xl`, the only page that does —
  every other page keeps the reading width) and a name wraps to two
  lines before an ellipsis at every width, with the full name on hover.
  On the News page the section caption counts the sources that answered
  ("live from 11 of 12 sources") and the scored-feed empty state is one
  quiet line under the headlines instead of a dashed box that read as a
  broken page.
- **#288 The News page shows its sources as a row of chips.** The live
  section is now a pure view (`app/(app)/news/live-headlines.tsx`) the
  page hands one fetch to and the render tests draw on a fixture, and
  under the headlines the sources are a row of chips instead of a
  sentence: a green dot for a publisher that answered just now, an amber
  one for a copy from earlier, a dashed grey chip for one that did not
  answer, each chip a link to the publisher with the item count or the
  error on hover, and a "via Bing News" pill for the search host that
  stood behind the topic reads. A screen reader hears "(earlier copy)"
  and "(did not answer)" where a sighted reader sees the dot. The render
  test's two new cases (four of five sources answering; none answering)
  lint the visible text and the accessible names, and the fixture
  screenshots at 1440 and 390 read clean. Words that can be a picture.
- **#289 Each headline says why it ranks, and the list folds past
  twelve.** The ranker's signals carry a word each now (`headlineSignals`
  in `lib/news/feeds.ts`, off the same matches the score counts, so a tag
  never says what the score did not), and every headline on the News
  page wears them as tags: rates, cap rates, distress and regulation in
  the brand tint — the deal-moving ones — and the asset class it names,
  supply, debt and costs & tax in grey beside them; "deal" counts in the
  score but is never a tag, since every other headline is one. The top
  twelve show; the rest fold behind one row ("Show 18 more headlines",
  a native `<details>`, no script) and stay in the HTML for the lints
  and a screen reader, their ranks continuing at 13. `feeds.test.ts`
  holds the tags to the score and to the asset-class mapping (apartments
  → multifamily, warehouse → industrial); the render test asserts the
  tags on the fixture and the fold on fourteen headlines.
- **#290 A headline that names a covered market links to its brief.**
  `lib/news/markets.ts` reads the proper nouns each of the eighteen
  metro entries goes by in a headline (New York, Manhattan, Brooklyn →
  NYC; Bethesda, Silver Spring → Montgomery County; Fort Worth, DFW →
  Dallas–Fort Worth; Bay Area, Oakland → San Francisco …) on word
  boundaries, and a word that names two places — "Washington" alone,
  "Arlington", a bare "Richmond" — tags nothing rather than guessing;
  the address matcher's state-guarded keywords ("king", "cook",
  "hudson") were never the right table for prose. On the News page the
  market is a tag beside the signal tags, and it opens
  `/market?metro=…` — the news tied to the ground layer. Six tests hold
  the table; the render test asserts the links on the fixture.
- **#291 The runner probes four more doors for Commercial Property
  Executive.** Every fresh process today warmed 11 of 12 sources, and
  the miss was always CPE: its feed answers 403, every Bing phrasing
  parses to zero, and when Google is held at bay it is the one source
  with no way in. live-verify now fetches its feed at the site root, the
  outlet's old domain (`cpexecutive.com`), Google's phrase search and
  Bing on the bare domain from the runner and prints the counts, so the
  next session wires the door that answers instead of guessing. The
  News caption under the list also shrinks to what the tags cannot say
  ("the coloured tags are the deal-movers").
- **#292 The scored feed is a pure view, rendered before the sweep ever
  fills it.** The lower half of the News page — the law-and-rule strip,
  the sector chips, the stories by the day the sweep picked them up with
  their 0–10 relevance pills — had never been drawn in a test, because
  the sweep has never run (its secret is misspelled; your list). It is
  now `app/(app)/news/scored-feed.tsx`, a pure view the page hands the
  two tables' rows to, and `views.render.test.ts` draws it on a fixture
  (two days, a law alert, a sector filter, the empty line) and lints the
  text and the accessible names, so the day the secret is fixed the page
  that appears has already been read. The sector chips became a
  `<nav aria-label="Sectors">` landmark on the way.
- **#293 The fifteenth review's nine findings.** The one you could see:
  a Google or Bing snippet arrives as escaped HTML, was decoded once,
  and so showed the literal `&nbsp;` (and `&#39;`) on every such row —
  the snippet is now decoded at the feed's level and then at the body's,
  and the render lint decodes `&amp;` last so it can never mask one
  again. The rest, each with a test: a numeric entity outside Unicode
  threw inside the parser and lost the whole source until the item aged
  out (left as it came now); "rate cuts" never scored where "rate cut"
  did, and "fed up" tagged a tenant story as the Fed; an outlet's
  `<source url>` reached an `href` unchecked (http(s) only now); the
  title link and the publisher ran together for a screen reader (the
  explicit space); a tiled caption that carried a figure ("Occupancy
  shown is 95% … illustrative only" under three renderings) escaped both
  density rules, so twelve photo pages read as a dense deck — a line with
  a figure is a caption where it is a page's whole text, and an
  inventory's identical rows stay the deck; `NOI / 2026E`, `NOI / FY26E`,
  `NOI (2025A / 2026B)`, `NOI / (Loss)`, `NOI / Current`, `NOI / As-Is`,
  `NOI / At Completion` and `NOI / Untrended` were dropped as rates — the
  period words after a slash are the two classifiers' own now, with a
  year's estimate letter and the accounting "(Loss)"; and a last door
  that answered in its grace after the caller's deadline was thrown
  away, so the next visitor asked the publisher again — the copy is
  recorded by the request, not the caller.
- **#294 The News page reads like a front page, and the pipeline's rail
  stays off the numbers.** Your 19:45 note: "terrible… look at the way
  the Wall Street Journal puts news articles out… lines running through
  the numbers at the top." The News page is built the way a front page
  is now: a masthead line (the day, how much of the press answered), the
  top story as the lead — a kicker in small capitals (what it touches,
  the covered market it names), a serif headline, its dek, the
  publisher's own picture where the feed carries one — six more in a
  three-column grid under rules, the rest as a two-column list, and the
  sources as one closing line. The pictures are the publishers'
  (`media:content`, `media:thumbnail`, an image enclosure, Bing's
  `News:Image`, or the body's first image; https only), so the
  content-security policy's `img-src` gains `https:` — an image cannot
  run script; scripts, styles and fetches stay pinned as they were. On
  the pipeline, the stage rail's hairline ran through the count circles
  because their tint was translucent; an opaque disc sits under each
  count now. Commercial Property Executive, the one source every fresh
  process missed today, gets the two doors the runner proved answer (its
  bare domain on Bing, its name as a phrase on Google).
- **#295 A real photograph behind the hero, and four slots for yours.**
  Your 19:45 note: "start using real pictures of actual things in the
  homescreen… built for a human, not a robot." The one photograph the
  site can always produce for itself is a USGS aerial of a covered
  downtown — the same public-domain frames the coverage gallery has
  drawn since the markets showroom — so Midtown Manhattan from above now
  stands behind the hero's headline, under a scrim that keeps the type's
  contrast, with its credit in the corner (a frame the route cannot
  produce takes its credit with it). The ground-level photographs — a
  team on deal day, a site walk, the building itself, and a hero of your
  own — are files you drop into `public/photos/` (`lib/photos.ts` names
  the four, with a one-line brief and the size for each); a slot renders
  only when its file exists, and the "Who it's for" strip folds away
  entirely until one does, so there is never a placeholder or a hole.
  This sandbox cannot fetch a photograph from any image host, so the
  files are your move — the exact names are in WILL_TODO.
- **#296 Every public page opens on a real place.** The hero's backdrop
  becomes one shared piece (`app/place-band.tsx`: the picture, its scrim
  in the band's own colour, the credit that goes with it) and the other
  public pages take it: `/why` opens on downtown Washington, the market
  at the centre of the DMV core, and `/demo` on Center City,
  Philadelphia — the sample deal's own city, two miles from Brewerytown
  — with their opening words on the picture where a plain heading sat.
  The same public-domain USGS frames as the gallery, at the imagery
  route's largest size, nothing upscaled.
- **#297 The sign-in page opens on a real place.** The door too:
  Baltimore's Inner Harbor, a covered market a few miles from the DMV
  core, stands behind the sign-in card at a quarter strength under the
  same scrim, with its credit in the corner — the last public page
  that opened on a flat colour.

What only you can do next is at the top of `WILL_TODO.md`.

## Monday night (Aug 24–25 ET) — homescreen eye-catchers, then the big one: real data on the asset types that matter

**Your call: "more than 2BR info… research on all asset types… real data on assets that matter… way more info on each metro."** Answered across five probe-verified PRs (#134, #136–#138, each an exact live-sha match):

**Every covered market now carries an office / industrial / multifamily read.**
Each metro brief on /market has a "By asset type" panel: vacancy, asking
rent, and cap-rate bands, each with a status chip, a clickable source, an
as-of date, and a provenance note. All 18 metro entries across the 15
markets are covered — nothing queued, nothing guessed. The same figures
flow automatically into deal-page vs-market benchmarks (labeled "office
vacancy," "industrial asking rent $/SF," …) and the Compare tool's data
spine.

The integrity rules did real work in the sweeps:
- **Divergence is shown, never averaged** — LA office runs 17.8–25.8%
  depending on the tracker and whether you count direct, total, or
  available space; the panel says exactly that. Same for Hampton Roads
  (7.1 vs 12.7, bases named), NYC, Miami, Atlanta, DFW.
- **Two templated aggregator numbers caught and rejected** — one
  boilerplate "4.6% trending to 5.1%" line that appears verbatim on
  multiple metros' pages, and a prose summary that inverted SF
  multifamily's trend (claimed rising when Kidder's own table shows it
  falling). The table text is what shipped.
- **Gaps stay gaps** — Boston industrial has a decade-high-vacancy
  narrative but no tracker level that cleared the source bar, so the
  panel records exactly that instead of a made-up number. Six cap bands
  held null with the reasoning written down.

**Homescreen eye-catchers rounds 2–3 (#132, #133, verified live before the
sector work):** the market pulse board (18 breathing tiles, each a real
metro), the live IRR gauge wired to the stress bench, the verdict stamp
animation, the retrade replay loop (ask struck through, price drops,
verdict flips to Go — all from the sample fixture), the reading-progress
hairline, and the primary-sources strip derived from the research file's
actual URL hosts.

**Then the data went everywhere (#137, #138).** A new homepage
eye-catcher — the **spread board**: "The trackers disagree too. We carry
the spread," drawing the three widest real divergences as range bars
(LA office 17.8–25.8% is 8 points of honest daylight). The
compare-two-markets tool sets office/industrial/multifamily side by
side for any two metros. Deal pages sort your sector's benchmarks
first. /demo shows the sample submarket's asset-type line, /why tells
the story, and the pulse board credits its "68 sourced sector figures"
— a derived count, not a typed claim. Plus six research gap fills
(Boston industrial 12.8%, Chicago office rent $43.90, LA industrial
rent, NYC office rent, Seattle office widened to its honest metro band,
four multifamily cap fills each with the basis named), one more
implausible aggregator figure rejected on the record, and the
Philadelphia cap mystery solved: the templated page's "local" caps are
CBRE's national averages in disguise.

**And the screen itself now speaks each sector's language (#141).** The
assumption challenger keeps its shared floor (tax reset, opex ratio,
loss-to-lease, legacy insurance — the multifamily playbook that was
always the foundation) and adds named trap lists per asset type: office
OMs get grilled on WALT rollover inside the hold, TI/LC at today's
packages, face-vs-effective rent, and sublease shadow space; industrial
on clear height and dock fit, mark-to-market proven against current
asking, tenant concentration, and excess-land stories; retail on
co-tenancy clauses, occupancy-cost ratios, and recovery math. The
market check calibrates each sector past its prior cycle. Nine lock
tests pin the contract; multifamily prompts are byte-identical to
before.

**And the board itself now rotates asset classes (#144, your call).** You
said the pulse tiles shouldn't lead with a 2BR rent — "relation to
something with a real asset class like office industrial multi and rotate
it." Now every tile cycles through the sectors its metro's research
actually carries: office first, then industrial, multifamily, retail —
vacancy (or the tracker spread), asking rent, cap band per face. A metro
missing a sector skips that face rather than faking one; reduced-motion
visitors get a pinned first face; screen readers get every read as one
plain sentence. The rotation exposed the thinnest tiles, so #145 filled
them the same hour: NoVA office lands as the honest 20.8–21.3% Newmark/
CBRE spread (both Q2 2026, both tightening while the District sets record
highs), and PG + Montgomery County get Colliers' 19.2% with the base
declared — it's the Suburban-Maryland survey area, both counties
together, not a county split. DC-district retail still has no dated 2026
figure from a named house after three more search angles; that gap stays
written down, not papered over.

| Change | Where to look |
|---|---|
| Pulse tiles rotate office / industrial / MF / retail | homepage board (#144) |
| DMV office fills — NoVA spread, Suburban MD base | /market?metro=nova (#145) |
| PG industrial banded 6.0–10.1 · NNJ retail vintage declared | /market briefs (#146) |
| Richmond retail — 12th retail market · Atlanta cap texture | /market?metro=richmond (#147) |
| Hero rotator + markets band lead with sector reads | homepage · /why · /demo (#150) |
| /why claims all four asset types · /demo retail-ready | /why (#151) |
| Mobile fix — hero no longer clips, walkthrough tabs swipe | homepage on a phone (#152) |
| DC retail 6.3% historic high · Philly construct-held · MoCo $6.94/SF | /market briefs (#154) |
| Hampton Roads retail 4.4–4.6% — the retail program closes | /market?metro=norfolk_hampton_roads (#155) |
| Baltimore retail direction sourced, level held open honestly | /market?metro=baltimore (#156) |
| Sector leaderboards — 15 markets ranked per asset class | /market?sector=office · industrial · multifamily · retail (#157) |
| The sector lens — board names the tightest market per class | homepage board strip → the rankings (#158) |
| Rank chips — every brief's sector read says where it sits | /market?metro=nova industrial #1 of 17 (#159) |
| Cap hunt: 8th + 9th loan-store catches · Yardi Baltimore texture | /market?metro=baltimore · richmond (#160) |
| Sample screen carries Philly's pack positions | /demo asset-type line (#161) |
| Changelog becomes a tour — day groups, momentum line, live links | /whats-new (#162) |
| Deal-page benchmark units fixed ($17.7 vacancy no more) + rank chips | deal pages' vs-market panel (#163) |
| The whole board — 66-of-72 coverage grid, shaded per column | /market (#164) |
| Link crawl 41 pages / 53 links clean · scope contradiction fixed | homepage board header (#167) |
| Sector-aware challenger + market check | upload any office/industrial/retail OM (#141) |
| Retail — the fourth asset type, 10 of 15 markets | /market briefs (#141, #142) |
| Baltimore's 10.0-vs-20.9 denominator lesson | /market?metro=baltimore + spread board (#142) |
| Cap rates on the briefs, basis always named | /market, any metro (#139, #140) |
| Sector reads on the research ticker | homepage ticker (#140) |
| "By asset type" sector panel, all 15 markets | /market, any metro (#134, #136) |
| Spread board — the trackers disagree | homepage (#137) |
| Compare: sectors side by side | /market, compare card (#138) |
| Sector figures in deal benchmarks, your sector first | any deal's vs-market panel |
| Pulse board · IRR gauge · verdict stamp | homepage (#132) |
| Retrade replay · scroll hairline · sources strip | homepage (#133) |

## Monday evening (Aug 24 ET) — your three call-outs, answered: legal on the sample, a deeper model, cool stuff everywhere

Three more PRs, each probe-verified live (#128–#130), built directly
from your evening feedback:

**"Nowhere does it talk about the legal information" (#128).** The deal
page's Regulation & benchmarks panel now shows everywhere the sample
deal does — derived by one module through the REAL rules engine on the
sample's Philadelphia jurisdiction. The homepage walkthrough's Overview
panel carries the compact panel (covered-market chip, screened line,
rule card with outcome chip and the dormancy explainer), the hero card
has the baby legal note you asked for, and /demo carries the full panel
with source link and verified chip. Four tests lock it all to the
engine.

**"More on the model — go more in depth" (#129).** The workbook's ninth
tab, Operating Metrics: expense ratio, NOI margin, DSCR, debt yield,
breakeven occupancy, and cash-on-cash by operating year, plus per-unit
and per-SF yardsticks — every cell a live formula, five new
HyperFormula tests tying it to the engine. When nothing states a unit
count the per-unit block says "omitted rather than guessed."

**"Cool features everywhere" (#130).** Five in one pass, all real data:
reveal-on-click broker-question cards on /demo (the challenger's actual
drafted asks), the FMR bedroom ladder drawn as bars on market briefs, a
one-click copy-citation button, a compare-two-markets tool with both
ladders on ONE shared dollar scale plus the computed 2BR spread, and
the six-stage screen-run trace band now playing on /why.

| Change | Where to look |
|---|---|
| Legal read on the sample screen + hero baby note | homepage · /demo (#128) |
| Operating Metrics tab (ratio ladder, per-unit/SF) | sample .xlsx (#129) |
| Broker-question reveal cards | /demo (#130) |
| FMR ladders, copy-cite, compare-two-markets | /market (#130) |
| Screen-run trace on /why | /why (#130) |

## Sunday night–Monday (Aug 23–24 ET) — the post-mortem absorbed, leverage computed, every market priced, and the deliverables redesigned

Twenty more PRs merged, each probe-verified live (#107–#126; every probe
an exact sha match). Five threads:

**1. The Trammell Crow lessons-learned memo (from Zach Wade), fully read and encoded.**
All 101 pages OCR'd via the new `fetch-doc` Actions workflow (#109, #110 —
a public-PDF text extractor that runs where egress is open). Its
disciplines are now IN the analysis prompts, in our own words (#108, #111):
negative leverage named outright, stabilized occupancy >~95% presumptively
challenged, exit values tested against "there's always a buyer", demand
claims weighed against supply, weak-credit rents discounted. The memo text
itself stays out of the repo — principles only, never republication.

**2. Leverage became arithmetic, not opinion (#112, #113).**
Every deal page — and the public demo — now computes the spread between
the going-in cap and the freshest FRED 30-yr fixed and says it plainly:
negative leverage in red, thin (<75bps) in amber, positive in green,
sourced and dated. Compare view names each deal's covered market.

**3. Every covered market now carries its FY2026 fair-market rent (#115).**
17 of 18 metro entries have a sourced HUD FY2026 2BR FMR (was 4). Three
came from primary documents through the fetch arm: San Francisco $3,604
from the SF Housing Authority's own payment-standards sheet; Newark
$2,205 / Jersey City $2,763 from NJ Treasury's republication of HUD's
tables; LA's revised $2,903 from the April Federal Register. DC's $2,246
is now arithmetic-confirmed by DCHA Resolution 25-31 (payment standards
÷ 1.87 reverse exactly onto every bedroom). The homepage marquee, hero
rotator, market briefs and deal benchmarks all light up from one file.

**Integrity note you should actually read:** the two-source bar caught two
would-be fabrications this pass — aggregators quoted $2,850/$3,174 for SF
(the housing authority says $3,604), and Seattle's widely-quoted "$2,501
FMR" is actually its average market rent. Seattle therefore still shows
no FMR — a recorded gap, never an estimate. Smaller catches: "Richmond
County VA" (rural Northern Neck) is not Richmond; Fort Worth prices
separately from Dallas.

**4. The homepage now provably matches the product — and got two new
interactive pieces (#116–#119).** DC's $2,246 was arithmetic-confirmed
against DCHA's own board resolution (#116). A correlation audit of the
whole homepage found and fixed the two typed numbers that had drifted —
the ticker now derives one FMR item per covered market and the proof
strip computes its sector count (#117). Compare gained a color-coded
leverage row so all three deal surfaces share the same arithmetic
(#118). And per your ask for more effects like the bands (both kept):
a "Break it yourself" panel now runs the REAL deterministic return
engine in the visitor's browser — three sliders, five figures
recomputing on every tick, sample-labeled, no AI in the box (#119).

**5. The deliverables got their design pass (#120–#126) — your "way
better, cleaner" round.** The homepage gained a looping six-stage
screen-run trace (#120) and the market briefs full 0–3BR FMR rows with
provenance chips and notes (#121). The sample screen was rebuilt as a
faithful miniature of the REAL deal page — its five sections, its real
analysis names, every figure computed through the live engine (#122,
your "nothing like the actual site" call-out). Then the artifacts: the
one-page IC memo redesigned end to end — color-coded verdict banner,
chip-style buy box, zebra ranges with a highlighted base case,
deal-killer cards, scenario trio (#123); the Excel workbook's KPI tiles
outlined and its cash-flow ladder zebra-striped with every
layout-anchored test intact (#123); the full multi-page report brought
into the same design language — brand-ticked titles with live count
pills, ratings as tinted chips, summary cards, a basis column that now
reads in-place vs pro-forma (#125); and the full report published as a
third PUBLIC demo download beside the memo and the model, with the
homepage handing you all three — under the hero card and on the memo
tile (#126). Both PDFs now render to real bytes in CI on every change
(#123, #125), and live-verify probes both public artifact routes for
%PDF- bytes on every deploy (#124, #126).

| Change | Where to look |
|---|---|
| Marquee + rotator facts denser (FMR + rules together) | homepage (#107) |
| Down-cycle discipline overlay in challenger + market check + verdict | any screened deal (#108, #111) |
| `fetch-doc` workflow: public-PDF text via Actions, OCR fallback | .github/workflows (#109, #110) |
| Leverage check on every deal + the demo | deal page · /demo (#112, #113) |
| Login page offers /market + /demo without an account; sidebar "What's new" | /login · app sidebar (#114) |
| FY2026 FMRs for (nearly) all covered markets | homepage marquee · /market (#115) |
| DC FMR primary-confirmed (DCHA Res. 25-31, 187% arithmetic) | /market?metro=dc (#116) |
| Ticker derives every market's FMR; sector count computed | homepage (#117) |
| Compare: leverage spread per deal, color-coded | /deals → Compare (#118) |
| "Break it yourself" — live engine sliders | homepage #stress (#119) |
| The screen, running: looping six-stage trace band | homepage (#120) |
| Market briefs: 0–3BR FMR rows, status chip, provenance note | /market (#121) |
| Sample screen mirrors the real deal page (five sections, real names) | homepage (#122) |
| IC memo redesign + workbook polish, memo render test in CI | /api/demo/memo · exports (#123) |
| live-verify probes the sample memo PDF | Actions → live-verify (#124) |
| Full report in the memo's design language, report render test | full-report export (#125) |
| Full report as a third public demo download | /demo (#126) |
| Sample artifacts one click from the homepage | hero card · memo tile (#126) |

## Sunday (Aug 23 ET) — stale browsers now fix THEMSELVES, and the day's build run

You reported "still nothing is showing up on homescreen" mid-afternoon.
The evidence again cleared the pipeline: probe run #82 printed
`LIVE BUILD SHA: a8fe5ae · this run's main tip: a8fe5ae` — the origin was
serving a merge that was minutes old. The gap is browsers that saved a
copy **before Friday's fix**, when pages granted `stale-while-revalidate`
for a year, plus restored mobile tabs that re-show a frozen snapshot
without refetching. Those copies can outlive any server-side change.

**The permanent cure shipped (PR #104, probe #84 verified):** every page
now carries its build sha (`uc-build` meta) plus a tiny script that asks
`/api/build` (uncacheable) which build is actually running — on load, on
tab-restore, and when a tab returns to the foreground — and reloads once
per new build on mismatch. Scoped to the public pages; loop-guarded.
**Cross over once** (one hard refresh, or open a private window) and no
copy of the site can ever go quietly stale on you again.

The rest of the day's run — every PR merged and the batch probe-verified
(runs #76, #82, #84 under the strict verdict):

| Change | Where to look |
|---|---|
| Hero "Now screening" rotator — six covered markets, one at a time, real facts | homepage hero (#99) |
| Covered-markets band now also on /why and /demo (one shared component) | /why · /demo (#100) |
| Pipeline rows name their covered market; search matches it; CSV exports it | /deals (#101, #103) |
| **/market opens without an account** — the homepage band used to hit a login wall (real bug, found + fixed); signed-out visitors get their own header/copy | /market in a private window (#102, #104) |
| Dark price ticker: every figure links to its market, caption names the band | homepage (#104) |
| /whats-new public + linked from every public footer; sitemap gains /market + /whats-new | any public page footer (#98, #103) |
| Footer "latest improvement" links the log; 404 offers the covered markets | homepage footer · any bad URL (#105) |

## Friday night (Aug 22–23 ET) — why you "weren't seeing updates", fixed

You reported seeing none of the updates. The diagnosis, with evidence:
the SERVER was current all along (probes confirm), but the homepage
shipped with Next's default cache header — browsers were allowed to show
a STALE copy for up to a year while revalidating in the background, so
every visit showed the page from your PREVIOUS visit. Fixed, then made
improvements impossible to miss:

| Change | Where to click |
|---|---|
| **Staleness capped at ~10 minutes** — homepage, /why, /demo now revalidate every 5 min and caches may serve stale for at most 5 more (`expireTime`). **Hard-refresh once** to flush any copy cached before the fix | homepage |
| **What's-new, everywhere** — "New in Underwrite Copilot" card on the pipeline; full log at /whats-new; ⌘K "What's new"; homepage proof strip says "shipped {date}: {title}" and the footer stamps the latest improvement — all from one checked-in changelog | pipeline · /whats-new · ⌘K |
| **Probes now prove freshness** — live-verify fetches cache-busted and FAILS unless the page carries overnight-only content; deploy.yml's self-check no longer greps a superseded hero | GitHub → Actions |
| Optional belt-and-braces: `RENDER_DEPLOY_HOOK` secret (task 9 below) | GitHub → Settings → Secrets |

PRs #86–#91, all merged; #86–#89 probe-verified under the strict
verdict (run #54), #90–#91 in the probe cycle behind them.

## The overnight run (Aug 22) — what changed while you slept

Every row below is merged AND probe-verified on the live site
(live-verify run #42 against the final merge). Standing rules held all
night: the homepage matches the real site, and coverage stops at the 15
markets.

| Change | Where to click |
|---|---|
| **Deals find their metro's benchmarks** — a Brooklyn deal now shows the NYC FMR row, Wilmington shows the Philadelphia-market FMR (matching runs on the covered-market name, not just the city string); DMV suburbs deliberately do NOT inherit DC-proper FMR (unverified for the counties) | any deal → Regulation & benchmarks → "vs. market" |
| **Brooklyn finally counts as NYC** — boroughs (and their county names) now match New York City's rules; before, a Brooklyn deal silently saw NO rent-stabilization read | screen anything in Brooklyn/Queens/Bronx |
| **The rules' open questions became answerable** — "Year built" and "You'll live in one unit" joined Deal facts; year built also auto-fills from the OM/manual entry; MoCo's rolling under-23-years exemption now computes; each open question links "Answer in Deal facts ↑" | any deal → Deal facts panel + Regulation panel |
| **Buy box: one-tap territories** — every covered market is a quick-add chip whose match keywords are the SAME ones the market matcher uses (Dallas–Fort Worth chip hits Fort Worth and Plano deals); alias matching is state-gated so a Seattle chip can never hit "King St, Washington DC" (caught in the formal review pass) | Buy box → Geography |
| **Pull Comps ↔ deal ↔ market triangle closed** — comps results carry the covered-market chip; deal pages link the market brief; metro briefs link screen-a-deal | Pull comps → search any covered address |
| **Homepage playground demonstrates the new engine** — "Brooklyn 8-unit · built 1930" (two regimes split on one building) and "Silver Spring fourplex · built 2019" (rolling-age exemption) | homepage → the live rules widget |
| **Honest empty states** — "Screened: N rules on file, none triggered" is no longer misreported as "unscreened" (the sample deal hit exactly this); onboarding + empty pipeline point at the market briefs | sample deal → Regulation panel |
| **Error boundaries on the Next 16 convention** — a page error now keeps the shell and nav, says your data is fine, and offers a real retry (`unstable_retry` re-fetches; the old global boundary only re-rendered) | (hopefully never) |
| **/why keeps pace** — the ground section says the engine names the exact open question and takes your answer on the deal | /why |

PRs #74–#82, each gated on tsc + eslint + 349 tests + build, merged one
at a time, live-verified in batches. One defect found by the formal
review pass mid-run (the state-gating above) — fixed and pinned before
it could ever mislead a mandate check.

## What changed in the pass before (national expansion)

| Change | Where to click |
|---|---|
| **Property database** (migration 0028): `properties` + `recorded_sales` (PostGIS radius index), single-family dropped at ingestion by policy | run task 2, then ingest (task 4) |
| **Philadelphia bulk ingest pipeline** — OPA parcels + last sales via Carto SQL, idempotent upserts, `MAX_ROWS` smoke-testing | GitHub → Actions → "ingest" |
| **Comps engine, DB-first**: any address near ingested deed records gets comps from the property DB (works in ANY ingested market); live county APIs remain the fallback | every deal's "Recorded sales nearby" panel |
| **Pull Comps tool** — type any address, no deal required; same engine, honest statuses | app → **Pull comps** (nav + ⌘K) |
| **News** — the stories feed: every headline the weekday sweep gathers, scored 0–10 for YOUR buy box, each linking to its source; law/rule changes get the top strip; a compact "News for your markets" card sits under the pipeline (per feedback: links to the news itself, no written journal) | app → **News** + pipeline card (after crons run) |
| **Laws stay on the building** (per feedback: no standalone section) — every deal's address gets its rules evaluated automatically in the Regulation panel; big law changes land in News + the red banner | any deal → Regulation & benchmarks |
| **Verification steward** — nightly: link health, feed freshness, consistency (incl. SFR-leakage), re-verification of the oldest singly-sourced claims via web search; corrections land in an open changelog, never silently | app → Account → **Data health**; site footer "data last verified" |
| **Homepage: "The ground layer" section** — live DB stats for all four (comps DB count, rules count, top scored story, steward heartbeat), honest not-yet states before data lands | homepage, after the rules playground |
| Proof strip + footer now carry recorded-sales count, the top story, and the steward marker (only when real) | homepage |
| **Pull Comps types like the deal forms** (per feedback): search-as-you-type suggestions; picking an address hands the engine the county so it routes to the right records source | app → **Pull comps** |
| Homepage hero restored to "Stop underwriting like a coin flip." (per feedback); the rest of the revamp stays | homepage |
| Nav: Pull comps / News added (sidebar, mobile, ⌘K palette) | app shell |
| `data/research/ingestion_sources.md` — every bulk dataset per market (Mid-Atlantic → Tier-1 → Tier-2), access method, status, standing rules | repo |

Per the standing rule: each distinctive feature got top-level nav, a
homepage live-stat slot, and a sample-screen mention (the ground-layer
section links the demo's recorded-sales read).

## Migrations — production status

| Migration | Status |
|---|---|
| 0001–0026 | applied |
| 0027_photos.sql | apply if you haven't (photo metadata caching) |
| **0028_property_database.sql** | **NEW — required for everything above** (its `journal_entries` table ended up unused after the Journal became the News feed — harmless, ignore it) |
| **0029_rules_scope.sql** | **NEW — run it if you EVER seeded the rules table**: deletes the rules for jurisdictions outside the 15 covered markets from the database (the seeder only upserts, so a pre-cut database keeps showing them otherwise) |

## YOUR TASKS — things I could not possibly do

Ordered by impact. Every one needs your logins/money; none can be done from
this sealed environment.

**1. Supabase plan decision — $25/month or stay free.** Free tier = 500 MB
database. Philadelphia alone (~250–400k non-SFR parcels + sales) will use a
large share of it; a second metro will not fit. **Pro is $25/mo for 8 GB**
(fits all Mid-Atlantic parcels + national sales-only). My recommendation:
run the Philadelphia smoke test first (task 4), watch Database → Usage, and
upgrade when you add market #2. ~2 min to decide. *Skip it and:* ingestion
halts mid-market when the disk fills — the steward will flag it, nothing
corrupts, but comps coverage stops growing. **I will never purchase anything
without you saying so — this is the one dollar decision on the table.**

**2. Run migration 0028** — Supabase → SQL Editor → paste
`supabase/migrations/0028_property_database.sql` → Run (safe to re-run; run
0027 first if you never did). ~2 min. *Skip it and:* property DB, journal,
Data Health, steward all stay at their empty states.

**3. GitHub Actions secrets** — repo → Settings → Secrets and variables →
Actions → add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase →
Settings → API), optionally `ANTHROPIC_API_KEY`. ~3 min. *Skip it and:* the
ingest workflow, the steward fallback, and DB-mode link audit all no-op.

**4. First ingest runs** — repo → Actions → **ingest** → Run workflow →
market `philadelphia`, max_rows `5000` (smoke). If the log looks right and
Supabase usage is sane, run again with max_rows `400000`. Then repeat for
`nyc` and `cook_county` (both smoke-test the same way; their sales rows
gain coordinates as their parcel phases fill — later runs backfill). ~10
min of your attention total. *Skip it and:* the comps DB stays empty —
Pull Comps still works via live county APIs, but only in the wired
jurisdictions. **Watch Supabase → Database usage between markets: three
metros will likely need the $25/mo Pro plan (task 1).**

**5. Render cron for the steward + existing crons' env** — easiest path:
Render → your Blueprint → Sync (render.yaml now defines
`underwrite-copilot-steward`, nightly 06:00 UTC). If you created services
manually instead, add a Cron Job: command `node scripts/steward.mjs`,
schedule `0 6 * * *`, env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` +
`ANTHROPIC_API_KEY`. While there, confirm the intel + rates crons have
their env vars and Trigger Run each once. ~10 min. *Skip it and:* no
journal entries, no daily rates, no steward heartbeat — the footer will
simply never say "data last verified" (and Data health explains why).
(The steward also has a GitHub Actions fallback at 06:30 UTC once task 3
is done — belt and suspenders.)

**6. `/api/comps/health` → paste me the JSON** — open it signed-in on the
live site. ~1 min. *Skip it and:* Fairfax, Arlington, Pittsburgh, New
Castle stay off; DC/MD/NJ field names stay unconfirmed.

**7. `GOOGLE_MAPS_API_KEY`** — console.cloud.google.com → enable "Street
View Static API" → key → Render web env. ~10 min. *Skip it and:* no
building photos (clean cards, nothing broken).

**8. Two human legal verifications** — PG County DPIE domicile answer in
writing; D.C. Law 26-80's enacted TOPA "business corporation" text on
code.dccouncil.gov. ~30 min. *Skip them and:* two load-bearing rules stay
"sourced" not "verified" — fine for screening, not for closing.

**9. (Optional, belt-and-braces) `RENDER_DEPLOY_HOOK` secret** — the
deploy-to-render workflow currently no-ops in ~6 seconds because this secret
was never added; the site deploys only via Render's own auto-deploy (which
IS working — probes confirm). Render → underwrite-copilot-web → Settings →
Deploy Hook → copy URL → GitHub → Settings → Secrets → Actions →
`RENDER_DEPLOY_HOOK`. ~2 min. *Skip it and:* nothing breaks today, but if
Render's auto-deploy ever silently stops, there's no second trigger.

**If the site ever "looks unchanged":** hard-refresh once. Browsers were
allowed to show a stale homepage copy for up to a year while revalidating
(Next's default); that window is now capped at ~10 minutes, but a copy
cached before the fix needs one manual refresh to flush.

Nothing else requires you.
