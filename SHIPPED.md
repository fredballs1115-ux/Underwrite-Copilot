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
estimate, and that's what it should flag." Forty-two PRs, #176–#217, each
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
