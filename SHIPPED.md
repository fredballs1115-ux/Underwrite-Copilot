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

## Sunday night–Monday (Aug 23–24 ET) — the screen absorbs a famous post-mortem, computes leverage, and every market gets its rent number

Nine more PRs merged, each probe-verified live (#107–#115; probes through
#103 all exact sha matches). Three threads:

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

| Change | Where to look |
|---|---|
| Marquee + rotator facts denser (FMR + rules together) | homepage (#107) |
| Down-cycle discipline overlay in challenger + market check + verdict | any screened deal (#108, #111) |
| `fetch-doc` workflow: public-PDF text via Actions, OCR fallback | .github/workflows (#109, #110) |
| Leverage check on every deal + the demo | deal page · /demo (#112, #113) |
| Login page offers /market + /demo without an account; sidebar "What's new" | /login · app sidebar (#114) |
| FY2026 FMRs for (nearly) all covered markets | homepage marquee · /market (#115) |

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
