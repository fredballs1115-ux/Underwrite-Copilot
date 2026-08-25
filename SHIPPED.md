# SHIPPED — what's live, how to see it, what only you can do

## ⚠ READ FIRST — what gates what

The deploy pipeline itself is **proven working** (live-verify runs green
since you pointed the web service at `main`). What gates the new features is
**data plumbing only you can touch**:

- **Migration 0028 not yet run** → property DB, journal, laws alerts feed,
  steward, Data Health all render honest empty states until it is.
- **No GitHub Actions secrets** → the ingest/steward/link-audit workflows
  no-op with instructions instead of running.
- **Supabase plan decision** (money — your call, task 1 below).

Everything ships dark-safe: nothing breaks while those are pending, pages
say exactly what's missing and why.

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

| Change | Where to look |
|---|---|
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
