# WILL_TODO — what's next, and whose move it is

Companion to `INTEGRATION_NOTES.md` (what was built + ops steps) and
`RESEARCH_STATE.md` (session resume state). This file is the forward list.

## 🟢 2026-09-21 — every market figure on the site is today's (#362)

The rates strip on `/tools` and `/market` carried four FRED figures. It now
carries **forty-six**, pulled every weekday and dated, from ONE series table
(`data/fred-series.json`) that the cron script and the page both read: the
whole Treasury curve drawn as a picture (today solid, a week earlier
dashed, the 10-yr-less-2-yr slope named), the money market beside it —
SOFR, its 30-day average, fed funds, prime — and, folded into groups whose
summary line already carries the figures, credit spreads, the mortgage
surveys, bank CRE lending and the three SLOOS standards series, inflation
and the cost of building (construction materials are running **10% above a
year ago**), jobs and output, and the multifamily supply pipeline. Every
tile draws its recent path; every figure links to its series. **Every id
was verified from the runner against FRED's own title before it was
trusted** (the workflow's new `dry_run` input) — which caught the first
list naming `DRTSCLCC`, remembered as the old CRE-standards series, when it
is the CREDIT-CARD one. The prepayment card now starts from the Treasury
tenor nearest its remaining term (the 2-year, 27 bps under the 10-year that
would flatter the penalty). Cap rates have no free daily source — CBRE,
Green Street and RCA are all licensed — so they stay dated, sourced
research, and the page says so. Then #363, the same
pattern per metro: each covered market's brief carries its own
unemployment, payrolls y/y, a year of permits and the FHFA house price
index y/y — fifty-eight more series, every id verified by a probe against
FRED's own title (Richmond is `RICH051`, not the `RICH951` memory offers;
Boston's obvious series is the discontinued NECTA one; Washington's and
Atlanta's house price series stopped at 2024 Q4 and are left out rather
than shown stale). A suburb keeps its own unemployment rate and borrows
the MSA's rest, named as the MSA's. Then #364: Zillow's
Observed Rent Index per metro — this month's asking rent, all home types,
with its change from a year ago and Zillow's credit — drawn against the
two-bedroom FMR HUD pays, on one scale, with the gap said (`zori.yml`,
monthly on the 20th, dry-run first). Then the pictures, #365:
the skyline contact sheet (`skyline-sheet.yml` pushes 640px copies of
every candidate to its own branch, so a photograph is chosen BY EYE and
still credited from what Commons returned) — first sheet: Washington's
overhead of the Mall became the Lincoln Memorial from Arlington, Richmond
went from 1,600 to 5,400 pixels, PG County got National Harbor's wheel,
Norfolk's street corner became its waterfront. Then #366: Los Angeles
opens on downtown against the snow on the San Gabriels and Dallas on its
green-lit tower at dusk — the Dallas picture needed the search itself to
change (a one-market run now checks thirty-six files, not nine), and
Montgomery County's second search found an aerial and an interstate, so
its overhead stays and its doors are marked exhausted. Then #367: each
market's rent index — the CPI's rent of primary residence, y/y, what
sitting tenants pay — beside the asking rent, twelve metros, eight from
FRED and three from the BLS's own API (FRED does not carry the areas the
BLS redrew in 2018; their codes were pinned from FRED's average-price
series and probed with the workflow's new `probe_bls`).
Proven live (run 35781910084): 159 markers present, seventeen skyline
routes serving JPEGs, the Dallas PNG candidate weighed at 3,110 KB
against the chosen file's 736 KB. Then #368: Zillow's APARTMENT asking
rent (the multifamily index, a third bar beside all-homes and the FMR,
$80 to $270 a month under all-homes everywhere) and the typical home
value, said as years of asking rent — three files, each dry-run from the
runner (18 of 18 in each).
Then #369: the for-sale market under the rent — Realtor.com's monthly
metro inventory (median list price, active listings, days on market,
each with its y/y), matched by CBSA code and checked by name from the
runner, with the loosening/tightening call made only from both flow
figures. The step before it was `zori.yml`'s new `probe_url`, which
found Realtor.com's file real (text/csv, 936 metros, one month a file)
and Apartment List's not (a gated download; its static host does not
resolve) — so the metro VACANCY index the site still lacks has no free
programmatic source yet, like cap rates (CBRE, Green Street and RCA are
all licensed).
Then #370, the signed-in site's own pictures: each deal opens on the
cover photograph out of its memorandum, lifted from the file on the
deal's first view (a `/DCTDecode` image stream IS the JPEG's bytes;
`pickCover` takes the largest photograph-shaped one, early in the file
preferred), sized twice by sharp — the deal page's hero and the pipeline
row's thumbnail — credited to the memorandum, replaceable by hand from
the deal page, never on the sample deal, and NEVER fetched from a
listing portal or an image search, whose terms forbid exactly that use;
the memorandum's cover is the licensed picture of the building.
Proven live (run 35787411268): 165 markers present, 0 not deployed —
the apartment rent, the home value in years of rent and the for-sale
line all on the market brief; the Realtor pull's first real run had
failed on the table's unit check after a clean dry run, and the fix
(#370) holds every writer's units to migration 0023's list in CI.
Then #371, the deal-type audit: a survey of every surface found the
deal header printing "Self_storage", a hotel's keys relabelled "units",
a development's land cost labelled "Price" beside a cap it should not
have, the Excel cover saying "auto", rent-control rules run against
offices and hotels, and the challenger grilling every class about
loss-to-lease. One table now (`lib/asset-words.ts`: each class's noun,
basis, income, count label, whether the rent rules reach it, whether it
operates at all) and every one of those surfaces reads it; seven more
classes can be filed (net lease, medical office, mixed-use, student,
senior, data center, parking) and the challenger has a trap list per
class.
**Whose move: the operator's** — the ground-level files for
`public/photos/`; optionally a free `BLS_API_KEY` Actions secret so the
dry run prints the BLS series' titles; `GOOGLE_MAPS_API_KEY` for the
Street View photograph of a deal whose memorandum carries none; and a
look at one real deal of each kind on the deployed site, because the
signed-in pages are the one surface live-verify cannot reach.
Then #372, the rest of it: the buy box offers every class and checks
"Basis / key" on a hotel, the workbook's per-unit rows read "Price /
Key", the comps captions carry the noun, each new class asks its own
facts, and a hotel development renders on the shared screen in the
tests ("Basis per key (all-in)", "Land cost").
Then #373: the model's area when the OM states none — a counted
building runs on units × the class's typical size, said as the
assumption it is ("248 units × 850 SF typical"), and only a deal with
no count at all falls to the flat placeholder.
Then #374: the region's rental vacancy on every metro's panel — the
Housing Vacancy Survey's four regional series, each printed from the
runner first (run 35790692228), borrowed by every metro from its
region and named as the region's on the tile; and a job cap on the
three pull workflows after a probe run stalled.
Then #375: the buy box's count band — "100 to 400 units" beside the
square-feet band, checked in the deal's own noun ("Keys" on a hotel,
"Pads" on a park) and folded into the fit score's size dimension, so a
counted building whose memorandum states no area is judged on its
count rather than parked on the blank; the count reader moved beside
the size reader in lib/criteria.
Then #376: Chicago's photograph — the fifth contact sheet kept
Philadelphia, Jersey City, New York and Boston and showed Chicago's
soft daytime strip to be the weakest; a Chicago-only sheet found the
sunrise frame from the lakefront (NorbertNagel, CC BY-SA 4.0), served
now and proven by live-verify's PHOTOGRAPHS line.
Then #377: Realtor.com's hotness rank on every market brief — the rank
of the 300 largest metros with the rank a year earlier read out of the
history file (the move is our own subtraction, a smaller rank is
hotter), and its two parts against the U.S. in plain units; and the
probe script describes a workbook, the step before the Census HVS feed.
Then #378: each metro area's own rental vacancy from the Housing
Vacancy Survey's workbooks, quarterly, with the survey's margin of
error on the tile — the probe printed both tables from the runner
(35794270430), the parser reads the year and the quarter off each
header block, matches an area by a name prefix and prints the row it
matched, and stores the margin as a companion series.
Then #380: the deal's own model reads the rates table. Its all-in rate
was a flat 6.00% on every deal on every day (the debt sizer's 6.50%, the
construction panel's 8.00%); it is now the Treasury tenor nearest the
hold plus a class spread — the index a fact with its date, the spread
named as the assumption it is — on every surface that derives the model
(the deal page, the workbook, the report, the assumption bridge), and
30-day SOFR plus a construction spread on the plan's debt. A stale table
seeds nothing and the old note stays.
Then #381: the market check reads the metro's published figures. For a
deal inside a covered market the screen's market step is handed the same
dated figures the market brief shows a visitor — this month's asking
rents, the rent sitting tenants pay, the metro's rental vacancy with its
margin, a year of permits, payrolls, house prices, the for-sale market —
told to check the OM's assumptions against the figure where one answers
and to cite it with its date, and the figures it read are stored with the
result and folded open on the deal page. Outside the covered markets the
check reasons from typical ranges alone, as before.
Then #382: since this screen. The figures the check read are stored as
values as well as sentences, and a deal page opened weeks later reads
the same metro's figures today and says what moved — "+0.4 pt to 3.8%",
"+1.1% to $2,335", "12 places hotter" — keeping a figure the publisher
has not updated since apart from one that did not move.
Then #383: the Feeds card on `/data-health` — each pull judged on its
own cadence with the stale series named, so a dead monthly pull behind
fresh daily rows is visible to the operator before a visitor meets it.
Then #384: the market check reads the debt market too — the 10-year,
the banks' own lending standards for this kind of loan (multifamily,
nonresidential, construction for a plan), CRE delinquency and bank CRE
lending against a year ago — national, dated, for every deal, so the
exit cap and the debt assumptions are checked against the capital side
and not only the metro's income side.
Then #385: the figures follow the check — the verdict's brief carries
them as their own dated section and is told to name a figure and its
date as a source, the report's market page prints them under the
checks, and the shared screen's market read says how many were read,
for which metro, on which day.
Then #386: the leverage check reads today's curve — the cap's spread over
the 10-year (a fact, dated, no verdict) and leverage at the index plus
the class spread the model was seeded with (the assumption named in the
seed's own note), on the deal page under the mortgage-survey read and as
a signed row on the compare table.
Then #387: the survey rides with the seeds — the 30-year mortgage survey
comes off the same cached rates read as the 10-year and the model's
index, shown with its date and flagged when stale, and the checked-in
snapshot serves only where the table has nothing, named as the
snapshot; the deal page, the compare table and the demo read it through
one read, and the demo's leverage check (which printed the August
snapshot on a public page) reads the week's survey and the cap over
today's 10-year.
Then #388: the model's assumptions against the published figures — rent
growth against the metro's asking rents and its sitting tenants' rents,
expense growth against consumer prices, vacancy against the survey's
metro figure inside its margin, the exit cap's spread over today's
10-year beside the going-in cap's (a compression named as one) — a
card under the debt sizer, each figure dated and sourced, no verdict.
Then #389: the full report prints the same read under its sensitivity
grids (under the plan's grid on a plan deal), so the document says what
the page says.
Then #390: the rents each kind of commercial lessor charges, nationally
— the BLS producer price indexes for lessors of office, retail and
industrial buildings, self-storage operators and the aggregate, five
series verified from the runner (probe 35917247236, dry run
35917848391) — so an office, a shop, a warehouse or a storage facility
has a rent-growth figure of its own kind: in the model's rent check
(said as the nation's, never the metro's), in the market check's brief
ahead of the debt-market lines, and on the rates strip.
Then #391: the workbook carries the same read as a Market Read tab
beside Assumptions (data, one row a published figure, absent with
nothing read), and the deal page, the report route and the workbook
route read it through one function pair — `todayReads` and
`modelVsMarketFor` — so the three cannot disagree.
Then #392: the market brief's "By asset type" panel draws each
commercial sector's national lessor rent index under its tracker
fundamentals — the nation's figure, said so, dated, the series linked.
Then #393: each metro's payrolls BY SECTOR — the BLS's supersector
employment for the MSA, five sectors against a year ago, seventy series
verified id by id from the runner (probes 35920921683, 35920930790 and
35921989451: the short ids carry three sectors for twelve metros, the
BLS-shaped `SMU…SA` ids the other two, Los Angeles all five in that
form, Boston's only not seasonally adjusted, and three of Boston's
refusing FRED's transform, so stored as levels and derived on read) —
drawn as ONE picture
under the metro tiles (signed bars beside all payrolls), read into the
market check as the ONE sector that fills the deal's kind of building
(professional and business services for an office, transportation and
warehousing for a warehouse, retail trade for a store, leisure and
hospitality for a hotel, education and health for a clinic; rental
housing reads all payrolls, a net lease or a data centre none), and
said under each commercial sector's fundamentals on the market brief.
Then, in the same PR (#393), the sector page ranks the covered markets by that sector's
payrolls under the vacancy leaderboard — the demand side beside the
supply side, "Where retail trade jobs are growing", fastest first,
signed bars, a suburb reading its MSA's figure and saying so, a market
with no fresh figure listed unranked with the reason; the apartment
page ranks by all payrolls. One cached read per metric across the
metros (`liveMetricRates`), never every metro's whole panel.
Then, also in #393, the whole board over the demand side — every metro area ×
every sector's payrolls against a year ago, under the vacancy board on
`/market`, shaded within each column fastest first (the one shade both
boards use, `heatShade`), a suburb reading its MSA's row, a stale cell
shown with its date and left unranked, a missing series a dash.
Then #394: the model's checks read the research tracker too
(`lib/tracker-read.ts`, the sector snapshots behind the market brief's
"By asset type" panel): a commercial deal's stabilized vacancy — which
had no row, since the Census survey counts rental housing only — is set
against the tracker's band for its sector in its metro, dated and
sourced as a quarterly print; an apartment deal's survey check carries
the tracker's read beside the survey, never in its place; and where the
tracker has a cap range, the exit cap is set against it as well as
against the 10-year — over its high end the conservative direction,
under its low end compression on top of the spread read. The deal page,
the report and the workbook read it through the same one function.
Then #395: the deal page's market section draws the demand side — the
metro area's payrolls by sector today, the same bars the market brief
draws under its tiles, with the sector that fills this building's kind
drawn full and the others faded (rental housing singles nothing out),
a stale sector kept and named, each figure linked; handed to the client
view as plain rows (`lib/metro-demand.ts`) so the series table stays
out of the browser bundle.
Then #396: the demo draws the same picture on the sample — the metro the
sample's own address falls in, read through the same cached reader,
beside the leverage card on the one page a visitor reads without signing
in; the bars moved to `app/demand-bars.tsx` so the deal page's client
card and the demo's server card draw one picture; the sentence under
the heading is the deal's own class's (a storage or land deal is never
called rental housing, a missing sector row is named); a failed read
leaves the card out, never the page down; a live-verify marker on /demo.
Then #397: the supply side beside it — the units each metro permitted in
buildings of two or more over twelve months against the twelve before,
the total less FRED's single-family series (the only split it publishes
for a metro; no metro or state has a 5-unit series, probed), as a
stacked-bar picture on `/market`, the split on the market brief's
permits line with its own figure key, and one line under the demand
card for rental housing on the deal page and the demo.
Then #398: the insurance line's published figure — the BLS index of
commercial multiple peril premiums against a year ago, verified from the
runner, in the strip's inflation fold, on the market brief for every
operating class (the nation's carriers, never this building's quote), in
the prompt clause, and in the model's expense-growth check beside CPI and
core, shown and never averaged in.
Then #399: a deal outside the covered metros reads its state's figures —
every state's unemployment, payrolls, permits with the single-family
split, house prices, annual rental vacancy and five sector payrolls (561
series, one pattern a state, verified by the branch's dry run), filed
under `state:PA` in the metro series' own shape so every reader works
unchanged, with every sentence saying the figure is the state's: the
market check's brief, the prompt clause, the deal page's aside, the
shared screen, the verdict and the vacancy check.
Then #400: the states' pull has a row of its own on the data-health
feeds card, judged on Pennsylvania under its `state:PA` market id, and
the rates workflow's stall guard is 45 minutes (a dry run of 785 series
took 23). A state's ASKING RENT is not to be had from Zillow's public
files — the state ZORI paths all 404 from the runner (zori runs
35935704689 and 35935874458) and the research page links metro files
only; the state HOME VALUE file is real
(`zhvi/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`, 52 rows,
RegionName the state's name) and could ride the Zillow pull for a
price-side line on a state deal, without a rent to set it against.
Then #401: a probe on its own no longer walks the whole table
(`PROBE_ONLY`, about a minute instead of twenty-five), and the report
and the workbook read the same market as the page (`marketForAddress`,
one function for every live read). Then #402: the metro areas the site
READS but does not brief — twenty-six of the next tier (Pittsburgh,
Phoenix, Denver, Nashville, Charlotte, Austin, Houston, Minneapolis,
San Diego, Las Vegas, Tampa, Orlando, Raleigh, Salt Lake City, San
Antonio, Sacramento, Columbus, Indianapolis, Kansas City, St. Louis,
Cincinnati, Jacksonville, Riverside, Detroit, Portland, Cleveland) in
`data/data-metros.json`, matched by address between the briefed markets
and the state fallback, their FRED series verified from the runner (the
four probes are named in CLAUDE.md), the survey's vacancy, Zillow's and
Realtor.com's rows, on the market check, the deal page, the report and
the workbook as the metro's, with the header saying there is no brief
behind them. Then #403: the payroll board on `/market` carries the
metro areas read without a brief as a block of their own, ranked in
the same columns, unlinked, the note saying what the block is. Then #404: each of
them has a market page (`/market?metro=<id>` — the place, one sentence
saying what the page is and is not, the asking rent and for-sale lines,
the tiles with the demand and supply pictures, and nothing the site has
not read), reached from a folded chip row on the explorer. Then #405: the survey's
rental vacancy for all forty metro areas is a board under the payroll
board — tightest first, each bar with the survey's margin as a whisker,
the national rate as a line, and the note saying that two metros whose
whiskers overlap are not ordered by it. Then #406: the pipeline
list's row and the compare table say "read, not briefed" for a deal in
one of them, rather than nothing. Then #408: Zillow's apartment
asking rent against a year ago for every metro area the site reads, a
board under the survey's, one query for all forty-four. Then #407: a
photograph for each of the twenty-six, chosen by eye through the band's
own crop (five six-market sheets and six one-market runs, every run id
in `lib/skyline.ts`), and #409: the market band itself shows them — one
`MarketBand`, taller, under a scrim anchored in pixels to its words
instead of veiling half the frame. Then #410: the Fed's commercial
property price index (`BOGZ1FL010000386Q`, quarterly, against a year
ago) on the rates strip and in the market check's national lines for a
building that trades on its income — the value side the debt market's
lines left out. Then #411: portfolio deals — the extraction lists each
property a memorandum offers, `lib/portfolio` reads their shares, the
income's concentration, the markets and the allocation against the ask,
the challenger gets the portfolio traps, the deal context and the market
check's header say what the portfolio spans, and the deal page draws a
card a property. Then #412: the report gives a portfolio its own page
(the same bars as plain Views and the same sentences, one list in
`lib/portfolio`), the shared screen draws the deal page's card, and the
workbook carries a Portfolio tab whose shares and allocation caps are
live formulas — fill the blank the memorandum left and the share
appears; a property's page is cited only inside the memorandum's page
count. Then #413: the market check reads each of a portfolio's markets
(the address's and up to three more, most properties first, the rest
counted as not read), one block a market saying how many of the
properties sit there, the national lines in the first block alone,
stored as `otherBriefs` and printed under their own headings on the deal
page, the verdict's brief, the report and the shared screen — and the
skyline probe reports a Commons rate limit as BUSY rather than DEAD.
Then #414: what is being sold — the extraction reads the interest (fee
simple, leasehold, a note, a share), `lib/interest` says what the price
buys, the plausibility check and the model gross a share's price up to
the whole and make no price finding on a note, and the deal page, the
shared screen, the memo, the report and the workbook say it first.
Then #415: the leased fee — the land under someone else's building, sold
with its ground lease — is its own interest (the ground rent is the
buyer's income, its cover is the building's income before it, an NOI
several times the rent is flagged as the building's), and every reader
that divides a price divides the building's (`buildingPriceOf`: a
share's grossed up, none for a note, a leased fee or an unstated share)
— the plan, the market memory, the internal comps, the analytics, the
research panel's per-unit read, the public-record comps' median call and
the debt sizer's seed — while the pipeline row, its CSV, the meeting
workbook and the deal header say what the price buys beside the figure.
Then #416: a note is underwritten as a note — the extraction files the
loan's terms as rows of their own (balance, rate, maturity, amortization,
payment status), `lib/note-yield` solves the yield to maturity at the
price with the engine's `irr` beside the current yield, the cents on the
dollar and the loan-to-value at the balance and at the price, a
non-performing or matured note is never shown a yield as earned, and the
panel draws it as tiles and a collateral bar while the memo, the report,
the workbook cover and the key terms say it.
Then #417: the seller's loan offered for assumption — the extraction labels
its terms, `lib/assumable-debt` runs the /tools card's two positions on
the deal's own model and the model's seeded rate, and the Financials tab
draws the coupon against today's rate, the coverage both ways and what
the loan is worth, with the challenger checking the overlap, the cheque,
consent, the balloon and the exit by name.
Then #418: the compare page pictures every building it compares — the
deal's own photograph, Street View or the USGS aerial, each pinned so its
credit is the picture on screen, falling back with the credit following —
and the pipeline thumbnail and the banner both catch a picture that failed
before the page hydrated.
Then #419: the assumable loan wherever the deal is summarized — the
pipeline row's tag and CSV column, the meeting workbook's note, the memo,
the shared screen, the workbook's cover and the report. Then #420: the
pipeline's building pictures on a phone, where they had been hidden. Then
#421: a leasehold valued on its term — when the ground lease ends, read
off the memorandum, drawn in the interest panel, and the model's exit
valued on the years left at its sale on the Financials tab. Then #422:
the term wherever a leasehold is summarized — the pipeline's tag, the
memo, the report's block and the workbook's cover, which names the exit
cap that runs the model on the term. Then #423: the compare table reads
each price for what it buys — a note's yield where a cap would sit, a
share's cap on the whole, returns the price did not buy withheld. Then
#424: a submarket opens on its metro's photograph — the metro its owner
typed, read only where the text says which market (the site's own name
for one, or a city with its state; a bare "Portland" is no market), its
band linking to the metro's page, and each card in Your submarkets
pictured under one credit line; a full state name is now tried longest
first, so "Charleston West Virginia" is not Virginia; and the marker
test renders /whats-new, which retired four diagnostics that had been
printing "not yet deployed" since their entries were trimmed. Then #425:
FEMA's flood map over the building — a Flood tab on the deal page's
picture, the aerial with FEMA's zones in FEMA's colours, a ring at the
building, FEMA's key and the zone at the building in one sentence, every
FEMA claim printed and every composite looked at from the runner's flood
sheet first.
**Your move, five minutes**: request a free Census API key
(api.census.gov/data/key_signup.html) and set it as `CENSUS_API_KEY` on
the Render web service and as an Actions secret. The ACS data API now
refuses a keyless request, and the next round reads each deal's census
tract (renters' median income, median gross rent, renter share and rental
vacancy, each with its margin) against the OM's rents.
**Open after it**:
a ground rent's own schedule (fixed bumps, a reset to a share of
land value) is not in the model's expense line; a non-performing note's foreclosure path (the months and cost of taking
the property, by the state's process) is still the challenger's words,
not a figure; a leased fee runs the ground rent
through a building's model (the caveat sends the reader to the ground
lease calculator); the document-generated model tab still prints that
model's own cap and returns (under the page's interest panel, which says
what the model is not — the compare table reads them for what the price
buys since #423); since-this-screen still compares the
address's market alone (a portfolio's other markets have no "what moved"
yet); the twenty-six
overhead frames are now only the fallback, but they are still
business-district coordinates written from knowledge — look at each once
on the deployed page if a photograph ever 404s; Salt Lake City's city
sits at the foot of its frame under the Wasatch, and a better file
(downtown above the words) is a one-market run away if one is ever
uploaded; and the vacancy leaderboard's rank picture stays paired with
the briefed markets for now.
**Mine, next** — a look at one real deal of each kind on the deployed
site (the signed-in pages are the one surface live-verify cannot
reach), and the operator items below.

## 🟢 2026-09-16 into 09-17 — `/tools` becomes the reason not to open Excel

Ten more PRs, #307–#316, nine on `/tools` or its shop window and one on
the photographs, all proven live by the round markers — and the table has
kept growing since (#317, #319, #320, #322, #324, #325, #326, #328, #329, #331, #334, #336, #337, #338, #339, #341, #342, #344, #345, #346, #347, #349, #350, #351, #352, #353, #354, #355, #356, #357).
**Forty-eight calculations** there now, and
they cover the arithmetic an acquisitions analyst does between opening a
memorandum and sending a letter:

| | What it answers |
|---|---|
| **Debt sizer** | LTV, DSCR and debt yield at once — and *which one binds* |
| **The loan over the hold** (#307) | What you still owe. $13M at 6.5% over thirty years, held ten, leaves **$11.02M** at the balloon — a third of the schedule run, 85% of the loan still there. Draws each year's debt service split into interest and principal |
| **The refinance test** (#307) | Whether the balloon can be taken out, on the same three lender tests. Cash out, covers it, or **the cash-in refinance nobody plans for**, with the NOI that would clear it |
| **Cash-flow strip** | IRR, multiple, payback — and how much of the return is the residual, discounted at the deal's own IRR |
| **What you believe** (#326) | The only one that runs *backwards*. It takes the price and the return and reports the growth rate the deal is quietly assuming — because a pro forma is a set of assumptions chosen to reach a conclusion, and a deal that pencils at 3% growth and one that pencils at 9% look identical on a summary page. The seeded $25M / $1.5M deal is a 6.00% cap; a **12% unlevered** return needs NOI to grow **7.16% a year**, which is 4.16 points past ordinary. Or leave growth alone and the exit cap has to come in to **5.01%** — 99bp *tighter* than the cap you are buying at, which is a bet on the market re-rating rather than on the building. The exit capitalises next year's NOI, not this year's; the rate is solved and then checked against the same IRR function the Excel export uses; and the card says out loud that the return is unlevered, because a levered target typed in here makes any deal look heroic |
| **Hold or sell** (#339) | The question every owner eventually asks, and the one a lifetime IRR cannot answer — it is an average over the whole hold, dominated by what already happened. This runs the decision the right way round: the return on holding for ONE more year, on the cheque you could take out today. The seeded $34M building with $18.5M of debt has **$14.82M** of equity in it; holding a year earns **14.1%**, and the decay crosses a 12.5% reinvestment rate in **year five** — so the answer is a year, not a verdict. The decay is drawn, 14.1% to **11.0%** over ten years with nothing going wrong, because the cash flow grows with rents while the equity underneath grows faster. The capital at stake is the net proceeds, never the building's value or what you put in. And the cost of selling is paid whenever you sell: charge it against the hold year and the same year reads **18.8%**, which on that hurdle turns "sell in five years" into "hold indefinitely" |
| **What you can pay** (#342) | The only one that solves for a PRICE, and the calculation people fudge hardest, because doing it properly is circular: a lower price means a smaller loan at the same loan-to-value, which changes both the cheque and the debt service, which changes the return. So it is solved by bisection and then REBUILT at the answer and run back through the same IRR the Excel export uses — the check the card prints beside the price. $1.65M of NOI, five years, a 6.00% exit and an equity wanting 15%: **$25.54M**, a **6.46%** going-in cap, and the rebuild returns 15.0%. Which lender test governs moves WITH the price — loan-to-value scales with it and the coverage tests do not — so the crossing is solved too (**$26.77M**), and a bid near it is a bid whose financing assumption is about to stop being true. The target is levered, and this is the one card where that is right. The cheque is not the price less the loan: closing costs and the loan fee are equity at risk, and leaving them out overstates the bid by most of a million |
| **Sources and uses** (#310) | The cheque. Price less loan says $7M; the real number is **$11.03M** once capital, closing, the loan fee and reserves are counted |
| **Capital stack** (#328) | What sits between the senior loan and the cheque — the mezzanine and preferred most deals actually get done with, and the one place a screening shortcut is wrong in the *flattering* direction. **Leverage is tested layer by layer, never on the blend**: the seeded $100M deal blends to **6.13%** against a **6.5%** yield on cost, which reads fine, and both layers above the senior cost more than the building earns — a big cheap senior drags the average under the line while the expensive layers take from the equity. Amortisation is a *transfer*, not a cost, so the rate decides whether a layer earns its place and the constant sizes the coverage. An accruing preferred flatters the current return by removing equity while paying nothing: this stack takes **$900,000 a year** out of cash flow and cash-on-cash still **rises, 6.59% → 7.89%** — with **$13.48M** owed at the sale, of which **$1.08M** is the compounding alone. Three coverage ratios, not one: **1.68× on the senior, 1.36×** once the mezzanine is counted, which is the ratio that decides who can take the property |
| **Getting out early** (#331) | The calculation that decides whether a deal can be *sold*, and the one whose answer reverses on a fact about the market rather than about the building. **Yield maintenance is cheap when rates have risen** — it makes the lender whole on interest it will not now receive, so where today's Treasury sits above your coupon there is no loss and the penalty falls to its 1% floor. On the seeded $20M at 3.75% against a 4.75% Treasury that is **$200,000 of pure floor**. Defeasance is not a penalty but a *purchase* — Treasuries replicating the remaining payments — so on the same loan that portfolio costs **$460,213 LESS** than the balance it retires: a **$385,213 gain** after $75,000 of hard costs. A penalty can never go below its floor; a portfolio can go below zero, and in a fallen-rate world the order reverses. The same move makes the loan **$1.24M below market** to a buyer who could assume it — both are worth having, only one can be had. And the open window costs nothing, so the real number is the price of closing sooner |
| **Lease buyout** (#329) | The asset-management question everyone answers with the wrong arithmetic, in *both* directions at once. The turnover — downtime, allowance, commission — is owed either way, so charging it against a buyout counts a cost you were always going to pay; and ending the lease does not hand you market rent tomorrow, it hands you the vacancy first. So the answer is the difference between two whole cash-flow *streams*, not a spread. The seeded 40,000 feet at $28 against a $42 market: the spread says **$2.93M**, the honest figure is **$1.50M**. Drop the in-place rent to $38 and the answer **flips sign** — the spread says pay $908,072 to end it, the streams say **minus $527,092**, meaning pay them to stay. Two consequences with tests: a lease with nothing left to run is worth nothing to end, however far under market, because the spread is still there on the last day; and the spread *cancels* between landlord and tenant, so with no frictions and one discount rate there is exactly **zero** on the table. What makes a buyout happen is vacant possession being worth something the rent does not contain, or a tenant who discounts the future far harder than you do |
| **LP / GP waterfall** (#308) | The property's IRR is not anybody's IRR: 14.1% for the building, 13.3% to the LP, 20.6% to the GP |
| **When it rolls** (#344) | Paste the rent roll and get the weighted average lease term *the three ways the memorandum does not quote it*. **Weight by rent, not by area** — they are different numbers and the longer one gets printed, because the long leases in a building are the cheap ones: the seeded flex building runs **7.0 years by area and 5.1 by rent**, on the strength of one 60,000-foot distribution tenant twelve years out at $8.50. **A break option is an expiry**: you cannot make the tenant stay and the lender will not assume it, so the term to bid on is **4.3** — the options give away 0.8 years of the quoted figure, and the schedule buckets the space in the year the tenant *can leave*, not the year the lease ends. **An average hides a cliff**: two rolls with the same 3.0-year WALT roll **20% and 60%** of the income in their worst year, which the mean cannot see and the year-by-year table can. And the cliff's cost is capital, not rent — the allowance and the commission land whole, in one year, in the NOI's blind spot: year 4 here owes **$1,530,000** of leasing capital against **$1,292,000** of rent rolling off, a cheque larger than the income at risk. The reader takes a total annual rent or a rent per foot, a calendar year or a date or years remaining, deciding each for the whole table at once |
| **Lease-up** (#345) | What the months between delivery and stabilization actually cost — the part of a plan deal every pro forma covers in a footnote. Three things nobody models: an empty building still pays its taxes, so the fixed share of the operating expense runs from the certificate of occupancy; a signed lease is not a paying lease, so the seeded 120,000-foot building is full at month 22 and **paid in full at month 28**; and the allowance and the commission fall due at SIGNING, ahead of the rent they buy. Which means **the worst month is month 22 — the month it fills** — not month one: **$6,200,437** of cash out, deep into a lease-up that is going *well*. Then the finding this card exists for. **Stress the absorption and the reserve looks BETTER**: six months slower takes the worst month *down* to **$5,674,789**, because a slower pace spends the leasing capital slower. A sponsor who stress-tests slippage against the lease-up reserve concludes it is survivable and has measured the wrong thing. The cost is time, and it shows only at a common date — at month 36 the plan is $3,465,450 out and the slipped case **$4,158,892**, which is **$693,442** worse and **1.9x** what a 5% rent miss costs on the same building |
| **Trailing window** (#337) | The trap on the cover page that is not an error but a *selection*. "T-3 annualized" and "T-12" are both true statements about the same building, and the seller quotes whichever is larger — nothing says a choice was made. Paste the monthly column: the seeded building's T-3 annualizes to **$1,720,000** against a T-12 of **$1,582,000**, and at the stated 5.5% cap that $138,000 is **$2,509,091 of value** riding on which window the cover quoted. Then the check a memorandum quoting T-3 almost never includes — the same three months a year earlier, where the season sits on both sides and cancels. The building is really up **3.6%**; the other five points were the summer. On an **expense** column it all runs backwards, because there the seller wants the *smallest* figure and gets it by picking a quarter that missed the tax bill: the seeded expenses read **$508,000** against a real **$803,000**, and the card names the month the lump is in and the windows that step over it |
| **Doors vs dollars** (#338) | "95% occupied" is a count of doors, and it is the higher of the two numbers that could be on the cover. The seeded 200-unit building at $1,850 is 95% leased and banks **87.3%** of market rent — three model units that are physically full and pay nothing, sitting tenants under market, concessions, bad debt. Underwrite the cover page and the going-in cap reads **4.96%** against an honest **4.30%**: 66bp, or **$7,950,698** of price at the cap this NOI really supports. The denominator is market rent and never the in-place rent roll — divide by the rents currently charged and loss to lease vanishes into the denominator, and the same building reads 90.5%. Loss to lease closes as leases roll; a concession reverses when the market does; bad debt does neither, so the card names which bucket the largest part of the gap is in. And other income stays out of the ratio, or a full building prints above 100% |
| **Below the line** (#341) | A broker's NOI and an owner's NOI are different numbers for the same building, and the difference is not about operations — it is about what counts as an operating expense. The reserve, the tenant allowance and the commission are all real, recurring, unavoidable cash, and all three sit below the line on a marketing package. On the seeded 200,000-foot building at $48M they are **$308,800 a year**, and the advertised **5.50%** cap is **4.86%** to the buyer: **64bp**, or **$5,614,545** of price — which is also exactly the $48M ask less the **$42.39M** at which the real NOI earns the advertised cap. Capital that recurs is an expense, whatever an accountant calls it; and leasing capital's annual cost is not its invoice, because a building on five-year leases re-tenants a fifth of itself a year. The largest line is also the least certain — **$144,000** if every rolling tenant renews against **$472,000** if none does — so it is drawn as a range with the assumption marked on it |
| **Insurance** (#347) | The expense line that reprices hardest and gets read least, and the same shape as the tax line: **the premium in a memorandum is the SELLER's expiring policy**, bound on limits the seller chose in a market that may no longer exist. Nothing in it is false — it describes someone else's placement. On the seeded 240-unit Florida apartment the memorandum carries **$420,000** ($1,750 a unit) and the quote comes back **$780,000** ($3,250), and insurance is a FIXED expense, so the whole **$360,000** comes out of NOI. Capitalised at the advertised **5.25%** cap that is **$6,857,143**, and the cap a buyer actually earns is **4.60%** — **65 basis points**. Then the figure nobody writes down. **A named-storm deductible is a percentage of the INSURED VALUE, not a dollar amount**: 5% of a $52M replacement cost is **$2,600,000 retained per event**, which is **0.9 years of NOI** before the policy pays anything, and no replacement reserve covers it. The premium is the number people argue about; this is the number that takes the building. And raising the deductible is a priceable trade rather than a judgement call — going to 10% saves $160,000 a year and retains $2.6M more per event, so it pays only if a named-storm loss arrives **less often than once every 16.3 years** |
| **Unit mix** (#309) | Paste the OM's table. Weighted average rent, GPR both ways, loss to lease — **weighted by unit count**, which is $1,858 where averaging the rows gives $1,961 |
| **The site** (#312) | Acres into square feet (43,560, which nobody remembers), FAR drawn *inside* the zoning limit so the unbuilt part of a site is a visible gap, units per acre, land per unit, and parking said both ways — the same car park is **1.50 spaces per unit and 1.64 per 1,000 feet** |
| **Land residual** (#313) | The only one that solves for a price rather than judging one. What is left of the finished building after the build and the required return: **$8.29M**, which a quarter point on the exit cap takes to **$5.57M** |
| **Net effective rent** | Both ways — straight-line and discounted — with free rent, TI and the commission against the *gross* |
| **Rentable vs usable** (#312) | The load factor, and what it does to a quote. **$38.00 per rentable foot is $43.70 per foot you can furnish** — and the two numbers people both call "the load factor" (15.0% and 13.0%) are the same building |
| **After tax** (#315) | Land is never depreciable; the gain at the sale has THREE rates, not one; and depreciation is a **timing** benefit — shelter and recapture at the same rate and it nets to zero. Cost segregation lifts year-one write-off 4.5× and leaves this deal **$130,909 worse off** in raw dollars |
| **Expense recovery** (#320) | The reconciliation statement that lands every spring and nobody checks. Gross up **both** years or neither: the seeded base year was struck at 72% occupancy, so gross-up adds **$287,500** to it against $12,553 to this year. Do it to only the current year — the commonest and costliest move in a reconciliation — and this tenant pays **$28,417** it does not owe. A base year is not an expense stop; a cumulative cap is not a non-cumulative one; and the cap reaches controllable expenses only |
| **Percentage rent** (#322) | The retail lease's own arithmetic. The natural breakpoint is base rent over the rate — **$2.00M** on the seeded lease — and anything else the lease states is artificial, named and sided. The seeded tenant's year lands at $1.92M, *under* the breakpoint, so nothing is owed. Billed monthly against a twelfth of it with no year-end true-up, the same lease collects **$22,300**, because two months of Christmas clear the line and the ten below it give nothing back. Plus the occupancy cost ratio, solved for the sales that reach your ceiling — and honest that a 5% ceiling on a 6% lease is unreachable |
| **1031 exchange** (#319) | What rolling it forward actually defers. The seeded trade sells at $26M, buys at $30M with *more* debt — passes the price test, and still owes **$305,000**, because $1.22M of proceeds stayed in the seller's pocket and borrowing more never cures that. Debt relief is boot even with every dollar of cash reinvested; cash added to the replacement offsets it. Deferred is not forgiven: $30M of property, a **$20.5M basis**. And the clock's 45 and 180 days run from the *same* day — a November closing loses **29 of them** to the return's due date |
| **Tax reassessment** (#324) | The error that hides in plain sight: the memorandum's tax line is the *seller's* bill, struck on the seller's assessed value. Where the jurisdiction reassesses on transfer, your purchase resets it to the price — so every figure downstream was computed on a bill that stops existing at closing. The seeded $25M building's bill goes $210,000 → **$375,000** and the **6.00% cap on the cover is 5.34%** to the buyer. Said as a price too, because that is what you negotiate with: **$22.8M**, solved rather than scaled, since paying less lowers the assessment that lowers the tax that raises the NOI. A phase-in is a deferral, not a discount |
| **Ground lease** (#325) | The one structure where the standard arithmetic is wrong by a *multiple*. A leasehold is a wasting asset — at expiry the building reverts — so capitalising its NOI values a perpetuity that expires: **$120M** the lazy way against **$97.5M** over the forty years the lease has, and **62.8% imaginary** with ten years left. Coverage, not DSCR, is the lender's test, because an unsubordinated ground rent outranks the mortgage. A reset to a share of land value is uncapped: **4× coverage becomes 2.22×**, and 1.11× if land doubles. The leased fee moves the *opposite* way as the clock runs |
| **Sale-leaseback** (#346) | The one structure where both sides price it wrong in the same direction. **The seller writes its own lease, so the rent is the price lever**: on a 180,000-foot building letting at $7.50, a $9 contract rent at a 6.00% credit cap is a **$27,000,000** price against a **$21,600,000** building — **$5,400,000** of it the lease rather than the real estate, which is cash borrowed and not value created. **And an above-market lease reverts.** The buyer is really buying the term's rent plus a market-rent building afterwards, which come to **$23,026,443** — so capitalising the contract NOI overpays by **$3,973,557**, 14.7% of the price, and it is WORSE on a short lease because the reversion arrives sooner. The credit prices one cap and the real estate prices the other, 250bp apart on the covenant alone. And for the seller it is borrowing: it raises **$26,595,000** where the building carries a **$12,816,579** loan, at **6.09 cents** a dollar against a **6.50%** coupon — cheaper, for four years. The rent escalates past the coupon in **year 5** and reaches 8.87 cents by the end, and then the building is gone. Compared to the coupon and never to the loan constant, because amortisation is a transfer and not a cost |
| **Closing statement** (#317) | The one that comes after yes, and the one people get *backwards*: taxes in arrears mean the seller credits the buyer, in advance the reverse, so the wrong reading misses by the **sum** of the two figures. Deposits are the tenants' money and go over whole. The closing day itself is worth **$657.53** on a $240,000 bill, so the contract decides it, not a default |
| **Opex translator** | One expense per unit, per foot, as a share of income |
| **Cap triangle · Rent converter · Build or buy** | The quick ones |

**Proven live, one line each.** Since #341 live-verify tallies its own
markers and prints a roll-up, so a round's evidence is a sentence rather
than a scroll: #342 landed at `921757e` (`MARKER ROLL-UP: 81 present, 0
not deployed`), #343 at `c61f570` (81), #344 at `8431fbc` (85), #345 at
`0e8e298` (89), #346 at `9c914cd` (93), #347 at `68c3e6c` (97). Each is
a TIMED dispatch five minutes after the merge, never the push-triggered
run that fires while Render is still building — that one is not evidence
and never was.

Three things they share: every field reads shorthand (`$20M`, `4.75%`,
`1.25x`); every field travels in the URL, so a sizing is a link; and the
math is a pure tested module before it reaches a page — **1,113 tests** on
the forty-two modules, plus **118** that render the page itself and check the
figures it prints. And since #314 the homepage renders its shelf of those
calculations from the SAME list the page builds its cards from, so it can
no longer advertise a version of `/tools` that does not exist.

It also **prints**. Every picture on this site is a background colour and
browsers drop those when printing, so the page used to come out of a
printer as nineteen cards of empty grey tracks — fixed in #321, measured
at just under two kilobytes of dropped colour before and none after. The
photograph, the site chrome, the jump index and every copy button all
leave the paper, and a card never splits across two sheets. (#323 moved
`print:hidden` into the copy button itself, because the per-element
version had been written once and then missed by both "Copy as table"
buttons.)

Two tables leave the page as numbers rather than as text you clean up:
the cash flow and, since #323, the loan schedule — tab-delimited with
headers, the figures raw, so a paste lands in a spreadsheet as numbers.

*Nothing on this list is yours to do.* It is here so you know what is
there.

**What I'd build next, when you want more:** a mezzanine / preferred
stack with its blended cost of capital (the sources-and-uses card only
knows one loan); a lease-abstract reader; a tenant-buyout value for a
below-market lease; a partial-year stub and the first reconciliation
after a mid-year close. (The reverse solve that used to head this list
shipped as #326.)
Then the pieces that are not calculators at all — a copy-as-table button
on the deal page's comps (the pipeline already exports CSV and .xlsx),
breadcrumbs, a keyboard layer. (The amortisation-schedule export and the
print stylesheet that used to head this list are both done, #323 and
#321.)

---

## 🟢 2026-09-16 — the photograph round, and the analyst's own math

Seven PRs, #300–#306. Two of them (#300, #301) are the thing you asked
for; #302 is the one that made it actually *look* like it.

**The market pictures are photographs of the place, not of roofs.**
Sixteen of the eighteen covered markets draw a real skyline photograph
instead of an overhead frame: Washington on the National Mall, Baltimore
on its skyline, Miami on Brickell, Philadelphia on the Schuylkill River,
and so on. Each names its photographer *and* its licence beside it — CC
BY requires the licence link, not just the name — and every filename,
author and licence was read back from Wikimedia Commons by the deploy
probe rather than written from memory.

Northern Virginia joined them on 2026-09-16 (#316), on Rosslyn seen from
Georgetown. It had been keeping an overhead on the rule that a suburban
submarket has no skyline — but Rosslyn is a real high-rise cluster, zoned
tall precisely because it stands across the Potomac from a height-limited
Washington, so the aerial was answering a question nobody asked. Prince
George's County and Montgomery County still keep theirs, and should: a
place shaped by its land is photographed from above.

**Two of those photographs were not actually reaching the page, and
nothing was looking.** Fixed on 2026-09-16 (#317), and worth recording
because both failures were invisible in exactly the same way. Every check
we had verified the *file* on Wikimedia Commons, or grepped the *credit*
out of the served HTML — and a photograph can fail while both of those
still pass, because the credit renders whether or not the picture loads
and the fallback to the overhead is deliberately silent. So:

- **Philadelphia** — the sample deal's own city, and /demo's opening
  band — was serving a 500, not a photograph. Its photographer is
  credited on Commons under a Chinese name, which an HTTP header cannot
  carry, so the route threw instead of answering. The page then fell back
  to the aerial exactly as designed, credit and all, and had been showing
  that overhead ever since the photograph was added. **The fallback
  working is why nobody saw it** — a picture quietly replaced by its
  backup looks like a healthy page from every angle except asking for the
  image.
- **NoVA's** four candidate filenames had been committed in the wrong
  shape, so the deploy probe skipped the market entirely and printed
  `DEAD undefined` — which looks like a dead photograph and was not one.
  The picture was fine all along; the check was not.

The fix that matters more than either: live-verify now asks **the site**
for every market's picture and prints LIVE or DEAD with the content type.
That is the visitor's question, and it found Philadelphia on its first
run. Read those `PHOTOGRAPHS:` lines, not the round markers, when you
want to know whether a market really has its skyline.

**They were rendering at an eighth of their strength until #302.** Worth
recording plainly, because the earlier note in this file said the
photographs were live and stopped there. They *were* live — and washed
out to the point of being scenery. The band pages drew each picture at
12% opacity under a scrim, which is how you get a blue-grey smear where
Brickell should be. #302 deleted the opacity entirely and rebuilt the
scrim as a bottom-to-top gradient: the picture is at full strength, and
the darkness is only where the words are. That direction was not taste
— **every file in the table is a panorama** (Seattle is 8443×3361,
Chicago 3127×795), so a left-to-right scrim buries a quarter of the
frame where a bottom-up one shows two thirds of it, and it measured
7.4:1 against white where the horizontal one measured 4.9:1. A test
(`lib/place-band.contrast.test.ts`) now reads the gradient stops back
out of the source and recomputes the contrast against a worst-case pure
white photograph, so weakening the scrim fails CI rather than quietly
shipping unreadable text.

*Nothing in the photographs is yours to do.* If you ever want a market's
picture changed, the whole loop is: Actions → live-verify → Run
workflow, tick **skyline_search**, put the metro id in
**skyline_markets**, read the candidates it prints, and say which one
you want.

**`/tools` — the deal math an analyst leaves the site to run.** Seven
calculators now, public (so each is also a way in from a search for
"debt yield calculator"), in the sidebar under Market data:

- **Debt sizer** — LTV, DSCR and debt yield at once, and it names *which
  one binds*.
- **Cap rate triangle** — any two of price, NOI, cap gives the third.
- **Rent converter** — one rent said four ways.
- **Build or buy** — yield on cost against the exit cap.
- **Cash-flow strip** (#304) — paste a column out of Excel and get IRR,
  equity multiple, payback, and *how much of the return is the residual*
  — discounted at the deal's own IRR, which is always a smaller share
  than the naive dollar ratio flatters you into thinking.
- **Net effective rent** (#306) — both ways, with free rent and TI/LC
  against the term; the commission comes off the **gross** rent, not the
  collected, which is the error that makes a concession look cheaper
  than it is.
- **Opex translator** (#306) — one operating expense read three ways.

Three things they share. Every field reads shorthand — type `$20M`,
`4.75%`, `1.25x` and it parses (#302; one reader, `lib/money.ts`, with
its own test file). Every field is in the URL, so **the work can leave
the page** (#305) — Copy link hands someone the exact scenario, Copy as
table pastes into an email or a memo. And the math is pure and tested
before any of it reaches a page: 21 tests on the cash-flow strip, 15 on
the lease math.

**One quieter fix worth naming** (#303): the comps readout used to print
"43% above the recorded median" off a *single* recorded sale — the most
confident-sounding and least supported sentence on the page. The figure
still shows (one sale is the only evidence there is, and hiding it helps
nobody); what is withheld now is the *call*. Below three sales it says
"the one recorded sale" or "midpoint of the two" and names the thinness.

**Also #303/#305:** live-verify now proves the round instead of proving
the deploy. Its gate read the hero headline and the build stamp, and
both of those survive almost any change — so a green run said nothing
about whether the photographs or the deal math had actually reached the
site. It now ends with a **ROUND MARKERS** block that fetches the real
pages and greps for the specific thing each PR shipped, printing
`present` or `NOT DEPLOYED` per item, as the last step so it is readable
from the log's tail.

**Still yours, unchanged and still the only things that gate anything:**
the six credentials to rotate (exposed in screenshots — Stripe live
secret, the Supabase service-role key, the Stripe webhook secret, both
Resend keys, the Anthropic key), the Actions secrets including the
misspelled `NTHROPIC_API_KEY`, the three Supabase auth settings, and the
four ground-level photographs for `public/photos/`. Detail on each is in
the numbered list below.

**Claude's move next session:** keep building out `/tools` — the list
from the research pass, in the order an analyst hits them: unit mix and
loss-to-lease, a sources-and-uses builder, an equity waterfall, an
amortisation and refi test, measures and density conversion. Then the
workflow items that are not calculators at all: copy-as-table on the
comps and pipeline tables (the same affordance #305 put on `/tools`), a
print stylesheet, breadcrumbs, a keyboard layer. Rosslyn is still worth
one targeted skyline search — the other two DMV submarkets are not.

---

## 🟢 6 PM ET, 2026-09-14 — where the site stands, and your list

**Everything merged today is live.** live-verify read the live build as
`4b926fa` (#297) at 21:44 UTC (`DEPLOY: LIVE`, `VERDICT: LIVE SITE IS
CURRENT`, 12 of 12 news sources answering, twelve public pages lint
clean), and a later main sha proven live proves its ancestors, so every
PR from #176 to #297 is on the site; #298 (merged at 21:44) and this
note follow by the same route and are proven in the closing message. If a tab still looks unchanged: the page carries a build
stamp and reloads itself within about ten minutes of a deploy; a hard
refresh (Ctrl/Cmd+Shift+R) does it now. The footer of the homepage names
the live build (`build …`, the sha the footer shows is the one live-verify
read) and the latest improvement.

**What you will see that you did not see this morning**

- **News** (`/news`, signed in): the page is full on the first visit
  after a deploy — the server warms all twelve sources at boot — and
  each headline wears the tags that put it where it is (rates, cap
  rates, distress and regulation in colour; the asset class, supply,
  debt and costs beside them), a covered market it names is a tag into
  that metro's brief, the top twelve show with the rest one click away,
  and under the list the sources are a row of chips (green answered,
  amber an earlier copy, dashed grey did not answer) with the search
  host behind them. `/api/news/health` (public) says what each source
  said, which process answered, the boot warm-up and any host held at
  bay.
- **Pipeline** (`/deals`): the list takes the wide shell, a deal's name
  wraps to two lines instead of "The Maddox at Bre…", numeric columns
  align including their dashes, one filter row, "Auto" never shown as
  an asset class, plan deals show yield on cost where the cap would be.
- **Homepage, `/why`, `/demo`, `/login`**: each opens on a real
  photograph — Midtown Manhattan behind the hero, downtown Washington
  behind the argument, Center City Philadelphia (the sample deal's own
  city) behind the sample screen, Baltimore's Inner Harbor behind the
  sign-in card, and on `/market` each brief on its own downtown —
  public-domain USGS frames under a scrim, credited in
  the corner — and the homepage keeps the four-tile trust strip under the pricing
  (private storage with expiring links, isolation in the database, never
  used to train, delete everything self-serve), each tile opening
  `/security`. The ground-level photographs you asked for need your
  files (item 5).
- **Cost per screen**: every screen's token usage lands on the job row
  and in one log line with a list-price estimate; `/data-health` draws
  the split by step. The text-first OM read cuts the input three to four
  times on a dense deck, and a deck the text layer cannot read falls
  back to the pages on its own.

**Your list, in the order it pays** (each is yours alone — a login, a
secret, or a judgment call):

1. **Run the outstanding migrations** (`supabase/CHECK_MIGRATIONS.sql`
   first; it names what is missing — 0028–0035, and 0016 for the
   worker). Until they run, the four LPC pages save nothing, the cost
   card has no column to read, and the scored feed has no table. See
   "🔴 Blocking everything" below for the two gotchas (PostGIS first;
   two files numbered 0030).
2. **Set the GitHub Actions secrets for the scheduled jobs** — and fix
   the misspelled one: the daily-intel sweep reads `ANTHROPIC_API_KEY`,
   and the repository secret is saved as `NTHROPIC_API_KEY`, so the
   scored feed under the headlines has never filled. Rename it (or add
   the right name), then run the workflow once by hand and open `/news`.
3. **Rotate the six credentials that were pasted into chat as
   screenshots** — Stripe secret key, Stripe webhook secret, the
   Supabase service-role key, the two Resend keys and the Anthropic key
   — create the new one, set it in Render (and GitHub Actions where the
   workflows use it), deploy, then revoke the old. Nothing was stored
   here; rotation is the only way to be sure.
4. **Supabase → Authentication** (five minutes): the three sign-in
   settings in "Your moves" item 7 below, so a reset link and a magic
   link land on `/auth/callback` and the confirmation copy matches.
5. **Drop four photographs into `public/photos/` and commit them** —
   the homepage is ready for them and shows nothing until they exist
   (no placeholders). This sandbox cannot fetch a picture from any
   image host (Unsplash, Wikimedia, the Library of Congress and Bing
   all answer 403 through the proxy), so the files are yours: buy or
   shoot them, and use these exact names —
   `hero.jpg` (2400×1350, wide, quiet mid-tones: a building you would
   buy or your team at work; it sits under the headline),
   `team.jpg` (1200×900, an acquisitions team around a table on deal
   day, the screen open between them),
   `site-walk.jpg` (1200×900, an analyst walking a property),
   `building.jpg` (1200×900, a mid-rise multifamily or an industrial
   box at street level). JPEG, under 400 KB each. The alternative is
   to allow one image host in the Claude environment's network policy
   and say which; then the next session can source public-domain
   frames itself.
6. **Re-screen the conversion deal** that once showed Year-1 NOI above
   its price and read the header: *Deal type: Conversion*, the teal plan
   strip, yield on cost where the cap would be. That is the check that
   the strategy layer reads your real decks the way it reads the
   fixtures.
7. **Optional levers, your call**: `ANALYSIS_WORKER=1` on Render moves
   screens to the worker (needs migration 0016); `MODEL_VERDICT` picks
   the verdict model (the measured cost per screen is on
   `/data-health`); `OM_READ=pdf` forces the page read if a deck ever
   reads wrong from its text layer; `NEWS_WARM=0` turns the boot
   warm-up off.
8. **Read the three probes after the deploy** — `/api/news/health`,
   `/api/imagery/health` (signed in) and `/data-health` — and the
   live-verify run on the Actions tab; the `NEWS` and `SEARCH DOOR`
   lines are the news layer's health from Render's own network.

**Claude's moves next session** (no login needed):

- Commercial Property Executive: #294 wired the two doors the runner
  proved answer (its bare domain on Bing, its name as a phrase on
  Google). Read the `NEWS WARM-UP` line on the next fresh process; if
  it still misses, replace the source.
- The homepage's photographs, once the files land (item 5): fit each
  slot at 1440 and 390, check the hero's scrim against the real
  picture, and shoot the page.
- The JLL-style cleanliness pass, section by section, on every public
  page and every signed-in view: one idea per section, more white
  space, fewer words per line, the sample deal card and the stage rail
  carrying the argument; measure each page (height, word count,
  pictures) before and after with the scratchpad shoot scripts.
- The scored feed's day groups and sector chips, once the sweep runs:
  render them on a fixture like the live section.
- The sixteenth review, of #290–#298 (the market tagger, the review
  fixes, the front page, the photo slots, the place bands), verified by
  execution with gitignored scratch tests; fold the findings in.
- REBusinessOnline is the source that misses on every fresh process
  now (a timeout, then a refused connection from Render): give it a
  second door the way #274 and #294 did, after reading the runner's
  probe of its feed.

---

**Last updated 2026-09-14, 6 PM ET**, after PRs #176–#298 merged to main (live build
sha `5e12854`, #274, read by live-verify at 17:20 UTC — every one of the
ninety-nine through #274 is live, the homepage serves at 203 KB where it
served at 488 KB, the public sample memo at 57 KB where it served at 11 KB
(the Brewerytown frame is in it), the public-page lint #231 added reads
all twelve public pages clean on every run, and the NEWS HEALTH lines read
from Render's own network say 12 of 12 sources answered and 30 headlines
ranked: the three publishers that answered Render with HTTP 403 (The Real
Deal, Multi-Housing News, Commercial Property Executive) and GlobeSt,
whose FeedBlitz URL parsed to zero items, now come in through #274's
fallbacks at a hundred items each — on a warm process; the first read on
a fresh one, minutes after a deploy, found 4 of 12 three deploys running,
and #278 fixed it: the first read on its own fresh process (`f2895c9`,
proven at 17:53 UTC) answered 12 of 12, every source fetched fresh in
under two seconds through the gate. #275–#278 are proven (`2c362a6` at
17:24 UTC, `f26a4e2` at 17:29, `bb3061c` at 17:37, `f2895c9` at 17:53,
`7c965aa` at 17:59, `f562a27` at 18:05, `ac33d36` at 18:12, `abb797c`
at 18:36 — #283's fresh process read 11 of 12, every search-backed
source `via Bing`, `NEWS HELD: news.google.com … after 3 failures`);
#284 (the thirteenth review's two remaining findings) is proven
(`1735df6`, the link-audit bot's commit on top of it, at 18:46 — 12 of
12 sources, Google answering again); #285 (one news state per process:
Next runs `instrumentation.ts` in its own module runtime, so the warm-up
filled one copy of the live layer's state and the routes read another —
that is why `warm` was null on every read; the state now lives on
`globalThis`) is proven (`b9c223b` at 19:00: `NEWS WARM-UP: 11 of 12
sources answered at boot, 17.3s`, every source `cached` on the first
read after the deploy); #286 (the fourteenth review's five findings,
the first a #284 regression that read `NOI / RSF` as the NOI, live for
twenty minutes) and #287 (the pipeline gets the wide shell and whole
deal names; the News caption counts its sources) are proven (`f3b6ede`
at 19:12: 12 of 12 sources, `NEWS WARM-UP: 12 of 12 sources answered
at boot, 11.4s`, `NEWS HELD: none`, twelve public pages lint clean);
#288 (the News page's sources as a row of chips) and #289 (each
headline's tags and the fold at twelve) are proven (`5173a8f` at
19:28: `DEPLOY: LIVE`, a fresh process 133 s old that warmed 11 of 12
sources at boot in 16.7 s — Commercial Property Executive the miss,
its one search door parsing to zero — `NEWS HELD: none`, twelve public
pages lint clean); #290 (a covered market named in a headline links to
its brief) is proven (`844c5b6` at 19:33: `DEPLOY: LIVE`, the homepage
footer naming it as the latest improvement, a fresh process that
warmed 11 of 12 sources at boot, `NEWS HELD: none`); #291 (the runner
probes four more doors for Commercial Property Executive), #292 (the
scored feed as a pure view, rendered on a fixture), #293 (the
fifteenth review's nine findings) and #294 (the News page as a front
page; the pipeline's rail off the numbers) are proven (`a836c30` at
20:04: `DEPLOY: LIVE`, a fresh process 137 s old that warmed 11 of 12
sources at boot in 14.8 s — Commercial Property Executive answering
through its Google door at last, REBusinessOnline the one timeout —
`NEWS HELD: none`, twelve public pages lint clean); #295 (a real
photograph behind the hero, four slots for the operator's) is proven
(`d74dbbf` at 20:15: `DEPLOY: LIVE`, the homepage's head preloading
the Midtown frame, the footer naming the improvement, a fresh process
185 s old that warmed 11 of 12 sources at boot — every search-backed
source through Bing, Commercial Property Executive with two items,
REBusinessOnline the one timeout — `NEWS HELD: none`, twelve public
pages lint clean); #296 (`/why` and `/demo` open on a real place too)
is proven (`a674fd6` at 20:19: `DEPLOY: LIVE`, the footer naming it, a
fresh process 144 s old that warmed 11 of 12 sources at boot in 14.6 s
— REBusinessOnline the miss, its host refusing the connection —
`NEWS HELD: none`, twelve public pages lint clean); #297 (the sign-in
page too) is proven (`4b926fa` at 21:44: `DEPLOY: LIVE`, 12 of 12
sources answering on a process 81 minutes old — REBusinessOnline back,
Google held at bay for the minute after three slow answers, every
search-backed source through Bing — twelve public pages lint clean);
#298 (each market brief on its own downtown) and #299 (this hand-off)
follow.

---

## 🟢 What changed on 2026-09-07, and the three checks it asks of you

A hundred and nineteen PRs (#176–#294) landed across one review session and the
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
- **Password reset works** (#238). The reset link used to land on the
  Account page signed out and bounce to sign-in — its one-time code was
  never exchanged for a session, so nobody who forgot a password could get
  back in. `app/auth/callback` exchanges it now, and the proxy routes any
  auth link's code there whichever page it lands on, so no Supabase setting
  had to change. A confirmation link signs the person in and opens the
  pipeline; a refused link says why and opens the reset form; sign-up with
  an existing email says "sign in instead" rather than "check your email";
  every auth failure names itself (weak password, invalid address, closed
  sign-up, a reset asked for too soon with its wait). Item 7 under "Your
  moves" has the three Supabase settings to check.
- **Your files are yours alone** (#239, the eleventh review: authorization).
  Storage paths were read off user-writable columns and handed to the
  service-role storage client, so a signed-in user who edited their own
  deal row could read, replace or delete another user's OM, documents,
  supplements or logo. Every storage read, write, signed URL and delete now
  checks the path against the deal (or account) it acts for, in one place.
  A teammate's refused Delete no longer sweeps the creator's files; the
  alert banner can be dismissed but not rewritten by users; a departed
  teammate's share links die with their seat. **Migration 0034 asserts the
  same shapes at the row and pins the alerts grant — run it** (below).
- **The homepage and the sample screen, cut to pictures** (#240). Your
  note that the homescreen was "too jumbled… words that can be a picture
  should always be a picture": the homepage went from 21 blocks, 6,474
  words and 15,557px tall to one idea per section — a one-sentence hero
  beside the sample deal card, two-word stats, the spread drawn, a
  six-icon stage rail, the verdict tabs, the live stress bench, the aerial
  gallery, four artifact tiles, an eight-icon feature grid, pricing, FAQ —
  1,295 words at 8,004px. The sample screen lost its paragraphs the same
  way.
- **The pipeline and the deal page, cut the same way** (#241). The stage
  ladder is a six-rung funnel with a count on each rung (each rung a
  one-tap filter) instead of four empty section headers; the verdict split
  is one bar; the free allowance is a meter; one filter select fewer; icon
  exports; initials for a teammate's deals; an empty ring for "not
  screened"; a 0–100 bar under the fit score; the setup card, the new-deal
  form and the empty state lost their paragraphs. The sample deal's reading
  guide is three icon steps and one line; the deal page's helper sentences
  each lost their second half.
- **The model view, comps, bridge and valuations, cut the same way** (#242).
  The model's inputs are a row of ticked chips instead of described rows;
  every helper note under a model panel is one line; the comps footnotes,
  the bridge's method line and the valuations legend are half their length.
  live-verify prints a `DEPLOY: LIVE` / `LAGGING` line so a deploy that has
  not landed reads as a sentence.
- **The Market data page, numbers first** (#243). The densest public page
  (1,714 words, thirteen long paragraphs) keeps every sourced figure and
  folds the notes around them — first sentence visible, the rest behind
  "more", the whole text still in the HTML for the lints and the greps.
  1,267 words and three long paragraphs now; the research depth you asked
  for is one click away rather than gone.
- **Twenty-two helper paragraphs on the tool pages, cut to a line each**
  (#244) — found by a census of the sources for JSX text runs of
  twenty-five words or more (`node scripts/prose-census.mjs`, kept in the
  repo): rent roll, valuations, bridge, submarkets, comps, news,
  data-health, analytics, the manual deal form, the LOI panel, the
  reconciliation panel, the plan-sensitivity caption, the What's-new intro.
- **Three phone-width cuts the screenshots caught** (#245): risk titles and
  deal names wrap to two lines on a phone instead of ending in an ellipsis;
  the verdict's three-call strip stacks instead of running off the edge.
- **A browser-runtime check of the public pages** (#246): no console, page
  or hydration errors at either width; the Market data page's forty-odd
  link prefetches on load are eight; an aerial tile that 404s hides its
  image instead of showing a broken-image glyph.
- **The shared screen, rendered on fixtures and said in pictures** (#247):
  the page a partner or lender opens from your share link is a loader and a
  pure view now, drawn on the sample deal, a conversion and its expired
  state in the render tests and walked at 1440 and 390. The verdict wears
  the deal page's mark, the call across the range is three dots, every range
  is a card with its Low / Base / High strip and base-position bar (the
  table scrolled sideways on a phone), the comp and market reads fold to a
  sentence, and a key term's label wraps instead of trailing off.
- **The shared screen opens on the building from above** (#248): the USGS
  aerial at the top of the read-only page, served by a route scoped to the
  same share token — a revoked or expired link gets a bare 404 for the
  picture before any source is asked; one resolver (`lib/share-resolve.ts`)
  behind the page and the route, eight tests on a fake admin client.
- **The IC memo opens on the building from above** (#249): the memo and the
  full report print the deal's USGS frame at the top right of the masthead,
  credited, without costing the one-page memo a line; the sample memo shows
  Brewerytown. Imagery gets four seconds, then the memo prints without it.
  Found on the way and fixed: react-pdf hangs its whole render on a PNG
  with a bad zlib check, so the cover's bytes are validated before they are
  embedded.
- **Pictures in the memo, and its footer band reserved** (#250): each range
  row draws where the base sits (a track and a dot, caution-coloured when it
  hugs the optimistic end) and each scenario's call has its dot — vector
  shapes, no height added; the footer's band is reserved, so a memo that
  cannot fit one page flows to a second instead of over its own footer.
- **Data bars in the meeting workbook** (#251): price, cap and yield on cost
  carry Excel's own data bars, live as the numbers change, over the deal
  rows only; a plan deal's cap cell stays empty of bar.
- **The compare table draws the spread** (#252): a bar under every return
  figure, scaled to the row's best, muted on a rejected deal; none on a
  plan deal's cap or when one deal is compared alone.
- **The report's market page draws the OM on its range** (#253): each
  market check places the OM's figure on the typical range as a track and a
  dot in the read's colour; a range that does not parse prints as before.
- **The compare page at phone width stacks a card per deal** (#254): name,
  verdict, reason, buy-box fit, then the rows with their figures, best marks
  and spread bars; the table keeps from `sm` up.
- **The compare page's leverage row draws its signed spread** (#255): a bar
  from a centre line, right in the pass colour and left in the kill colour,
  scaled to the row's widest spread; muted on a rejected deal, none on a
  plan deal.
- **The pipeline row draws its fit below `lg`** (#256): the same 0–100 bar
  the score column draws, on its own line in the call's colour, where the
  fit word used to be the part a phone cut off.
- **Data bars on the rent-roll workbook's Rollover tab** (#257): the space
  expiring each year and the capital to re-lease it carry Excel's own data
  bars over the year rows, live as the roll is edited; the Total row draws
  none.
- **Data bars across the Cash Flow tabs' NOI and levered cash flow** (#258):
  both workbooks draw the two rows across the operating years, live off
  the formulas; the reversion column and the sale vectors stay figures.
- **The rent-roll page draws each lease against market** (#259): a bar from
  a centre line per lease — pass to the right when it sits below market,
  kill to the left when above — and a card per lease below `sm` in place
  of the sideways-scrolling table.
- **One comp-detail reader; the comps table draws each sale comp against
  the subject** (#260): `lib/comp-detail.ts` reads a stated per-unit /
  per-SF basis and cap out of a comp's line and nothing otherwise; each
  sale comp's basis is a bar under its detail with the subject's as a tick.
- **The report's comp page draws the same bars** (#261): each sale comp's
  basis as a track, fill and subject tick under its detail line, from the
  same reader, with the fill count asserted.
- **The comps table at phone width stacks a card per comp** (#262): name
  and rating, note, the detail with its basis bar; the table keeps from
  `sm` up.
- **The reconciliation's gap draws as a bar from a centre line** (#263):
  `lib/gap-detail.ts` reads the dollar, basis-point or percent magnitude a
  gap line states and nothing otherwise; each row's bar is scaled to the
  widest of its own unit and signed by the row's stated direction — under
  the gap figure on the deal page and on the report's reconciliation page,
  fill count asserted.
- **The reconciliation table at phone width stacks a card per row** (#264):
  the metric and its direction, the two figures side by side, the gap with
  its bar; the table keeps from `sm` up.
- **The reconciler is asked for each gap's figure first** (#265): the
  prompt leads each gap with its dollar, basis-point or percent figure and a
  prompt test holds its examples up to the gap reader; the reader takes
  "$1.2 million", "$5MM", "$2bn", "2 pp" and "per cent" too.
- **The section counts draw as split bars** (#266): the Risk digest, the
  challenger's tally, each comp table's ratings and the Reconciliation
  header — one bar with a segment per kind, the count words kept beside it.
- **The comp scrutiny names each comp's detail line** (#267): the prompt
  and the schema ask for a comp's stated basis first — price per unit or
  SF and cap, then date and size — and a prompt test holds the example up
  to the comp reader.
- **The market check names the shape of its figures** (#268): `omSays`
  with its unit, `typicalRange` low to high in that unit, in the prompt
  and the schema; a prompt test reads each example pair as a position.
- **The News page's live headlines always paint** (#269): every feed
  races a wall-clock deadline and a per-process fresh copy replaces Next's
  fetch cache, so a publisher that never answers can no longer hold the
  streamed section on its skeleton; `/api/news/health` is public and
  live-verify prints each feed's outcome from Render's own network.
- **The pipeline's formatting, from the operator's screenshot** (#270):
  one filter row with the exports at its right edge, a picture slot of one
  size on every row so the names line up, "Auto" never shown as an asset
  class, and one asset-class label module (`lib/asset-class.ts`) behind
  every surface that prints one, so "self_storage" reads "Self-storage"
  on the row, the filter, the exports, the compare table, the shared
  screen and the market cards.
- **Every screen records what it cost** (#271): the four token meters of
  every model call land in a per-run ledger, on the job row (migration
  0035) and in one log line with a list-price estimate; `/data-health`
  shows the median of the last screens and the latest screen's split by
  step as a bar; `MODEL_VERDICT` joins the env levers, and `models.ts`
  names them in the right order (the cache is per model — move the
  OM-reading steps together).
- **The deck goes as text first** (#272): the OM's own text layer,
  page-tagged, stands in for its pages when dense (`lib/pdf-text.ts`,
  pdfjs in-process) — a third to a quarter of the tokens on every
  OM-reading step — a scan or a picture-heavy deck still goes as PDF;
  `OM_READ=pdf` forces the pages, `OM_READ=text` the layer.
- **How the OM is handled, beside the price** (#273): the category's
  one honest convention adopted — four trust tiles under the pricing
  (private storage with expiring links, isolation in the database, never
  used to train, delete it all self-serve), each opening `/security`; no
  badge we do not hold, no logos we do not have.
- **The publishers that refuse the fetcher are read another way** (#274):
  a browser-shaped user agent that still names us, per-source fallbacks
  (GlobeSt's own `/feed/`, then a site-scoped Google News read of each
  refusing outlet) inside the same deadline, one retry after a fast
  429/5xx, and a status that names the way in (`via`) or every door that
  closed; live-verify prints `via`.
- **A question's spend is said in the log** (#275): ask-the-deal opens
  its own ledger and logs "ask usage for deal …" with the four meters and
  the estimate, so a deal's cost picture includes the questions asked of
  it.
- **The Cost per screen card is rendered on fixtures** (#276): the card
  is its own pure view and `lib/cost-card.render.test.ts` draws it on
  three fixtures — the median, the six-segment bar and its spoken label,
  the meters line, an unpriced step, the empty states — through the same
  lint as every other view.
- **A text layer that reads to no figures is re-read as pages** (#277):
  the extraction step retries once on the PDF when the dense text layer
  yielded nothing, every later step reads the pages too, and a deck that
  is empty both ways still stops honestly.
- **The News layer survives a cold start** (#278): a gate per host (two
  requests in flight per host, so the eight Google News reads never burst
  from one address), a first door capped at half the budget so a host
  that hangs leaves time for the next, one request per source shared by
  concurrent callers, Bing News as RSS behind every Google News read, the
  cached copy keeping its `via`, and a warm-up at boot
  (`instrumentation.ts`) that reads the sources one at a time.
- **The text layer is held to the deck** (#279, the twelfth review's
  findings): a resumed attempt reads the pages the previous attempt fell
  back to (the checkpoint payload carries `omPages`); a line that recurs
  on half the pages is furniture and counts toward no page's density; a
  deck under four pages goes as its pages; the extraction re-reads the
  pages when the layer found figures but no NOI; the cost card counts the
  screens that priced; a class the model phrased itself keeps its case.
- **The warm-up reports, and the search doors are checked from the
  runner** (#280): `/api/news/health` carries `warm` (the boot warm-up's
  last run on this process) and live-verify prints it; a new non-gating
  step fetches Bing's and Google's RSS from the runner and prints each
  door's status, item count, outlet-element count and redirect count.
- **A plain retry keeps the pages fallback with its checkpoints** (#281):
  `claimJob`'s `keepCheckpoints` carries `omPages` alongside `completed`
  — never on a replace-OM, never off a done prior — so a retried attempt
  that skips the extraction reads the pages the failed attempt had to.
- **The runner probes the queries the next fix will use** (#282): the
  first search-door run verified Bing's shape (12 items, 12
  `News:Source`, 12 click redirects on the site-scoped feed); the three
  plain keyword topic queries #283 will use join the probes, and the
  health print gains the `NEWS HELD` line.
- **A host that hangs is held at bay** (#283): a door with another behind
  it waits in its host's queue at most half the budget that is left; a
  host that timed out or answered 429/5xx three times inside a minute is
  held for 45 s and its doors skipped at once (`/api/news/health` names
  it under `held`; live-verify prints `NEWS HELD`); the warm-up reports
  its progress while it runs; the Bing topic queries are `multifamily`,
  `CMBS delinquency distress` and `"rent control"` (the probes read 12, 2
  and 1 items for the first phrasings, so two changed); each door holds
  at most half of what is left, a stale copy keeps its `via`, and a fetch
  that outlives its abort gives its host slot back at the wall clock.
- **The thirteenth review's two remaining findings** (#284): a line whose
  exact words recur on half the pages, however many times a page (the
  caption tiled under three renderings), is furniture, so a picture deck
  is read as pictures from the start; and a slash in an NOI label is a
  rate only when a unit follows it, so `NOI (T-12 / TTM)` is the NOI and
  the deck is not re-read as pages.
- **One news state per process** (#285): Next compiles
  `instrumentation.ts` into its own module runtime, apart from the
  routes', so the boot warm-up filled one copy of the live layer's Maps
  and the News page read another, empty — the reason every read after a
  deploy fetched everything fresh and reported no warm-up. The state
  lives on `globalThis` now; the health JSON names the process (`pid`,
  `uptimeS`) and live-verify prints `NEWS PROCESS`.
- **The fourteenth review's five findings** (#286): `NOI / RSF`, `NOI /
  EGI` and `Price / NOI` are rates again (a #284 regression, live for
  twenty minutes, had read them as the NOI); a caller queued on a host
  when its hold trips gives the slot back unused; a first door that
  ignores its abort no longer eats the doors behind it; the breaker's
  comment matches its code; a line with a figure is never a tiled
  caption.
- **The pipeline gets a table's room** (#287): the list takes the wide
  shell (the only page that does) and a deal name wraps to two lines
  before an ellipsis, so "The Maddox at Brewerytown" is never "The
  Maddox at Bre…"; the News caption says "live from 11 of 12 sources"
  and the scored-feed note is one quiet line.
- **The News page's sources are a row of chips** (#288): the live
  section is a pure view the render tests draw on a fixture; under the
  headlines each source is a chip — a green dot answered just now, amber
  an earlier copy, dashed grey did not answer, the count or the error on
  hover — with a "via Bing News" pill for the search host behind the
  topic reads.
- **Each headline says why it ranks** (#289): tags off the same matches
  the score counts — rates, cap rates, distress and regulation in
  colour; the asset class, supply, debt and costs & tax in grey — and
  the list shows twelve, the rest one click away with their ranks kept.
- **A headline that names a covered market links to its brief** (#290):
  "Atlanta", "Manhattan", "Fort Worth", "Bay Area" become a tag beside
  the signal tags that opens the metro's page; a word that names two
  places ("Washington" alone, "Arlington") tags nothing.
- **Four more doors probed for Commercial Property Executive** (#291):
  the one source every fresh process today missed (feed 403, every Bing
  phrasing zero) — live-verify now reads its feed at the site root, the
  outlet's old domain, Google's phrase search and Bing on the bare
  domain from the runner, so the next fix wires the door that answers.
- **The scored feed is a pure view** (#292): the law strip, the sector
  chips (a nav landmark now), the day groups and the quiet line render
  on a fixture in the views test, so the day the sweep's secret is
  fixed the page that appears has already been read.
- **The fifteenth review's nine findings** (#293): the literal `&nbsp;`
  in Google and Bing snippets (decoded at two levels now), an entity
  outside Unicode that lost a source, "rate cuts" and "fed up", the
  outlet link's scheme, the screen-reader space after a headline, a
  tiled caption with a figure, the NOI period words after a slash
  (`2026E`, `(Loss)`, `Current`, `As-Is` …), and a late answer kept for
  the next reader.
- **The News page reads like a front page** (#294): the lead story with
  a kicker, a serif headline, its dek and the publisher's picture; six
  more in a three-column grid; the rest as a two-column list; the
  sources as one line. The pipeline's rail no longer runs through the
  count circles, and Commercial Property Executive has two more doors.

**The deploy that lagged landed.** live-verify read the live build as
`fab27ec` (#239) at 15:09 UTC, eighteen minutes after #240 merged, and as
`b36628a` (#241) at 15:19 — Render took about twenty-eight minutes over the
#240 build where every earlier deploy today took four. Nothing to do unless
it recurs; the `DEPLOY: LIVE` / `DEPLOY: LAGGING` line (#242) now says which
it is on every run.

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
3. **Cost per screen — measure first, then one env var (your call).** Since
   #271 every screen writes what it spent to its job row (migration 0035 —
   run it) and to the log, and `/data-health` shows the median cost of the
   last screens with the split by step drawn as a bar. Read that number
   before pulling anything. The shape of the bill on the flagship, for a
   deck the model reads as ~300k tokens: the one cache write of the OM is
   ~60% of it, the four cached reads ~20%, the outputs the rest — about $3.
   The lever: `MODEL_EXTRACTION` **and** `MODEL_REASONING` to the mid-tier
   id **together** on the web service (and the worker, if
   `ANALYSIS_WORKER=1`), then redeploy — the same screen lands near $1.25
   at that tier's list price. Never split them: the prompt cache is per
   model, so a cheaper extraction under a flagship judgement writes the
   deck to two caches and costs more. `MODEL_VERDICT` is the one step that
   can differ for free (it reads the results, not the deck).
   `lib/anthropic/models.ts` says the same in order. Judge a few screens
   against their saved verdicts before deciding. The lever that keeps the
   flagship is already on since #272: the deck goes as its own text layer
   when that layer is dense, a third to a quarter of the tokens on every
   OM-reading step — the ledger of the next screens shows it (a cache
   write near 100k tokens on a deck that wrote 300k before). If a screen
   reads worse than it did — a deck whose figures live in pictures —
   `OM_READ=pdf` on the web service (and the worker) restores the pages
   for every deck; paste that deck's name back and the density rule gets
   corrected instead.
4. **Open `/news` — it paints, and every source answers.** The first
   live-verify run after #274 (17:20 UTC) read the feeds from Render's own
   network: 12 of 12 sources answered and 30 headlines ranked. The three
   publishers that had answered Render with `HTTP 403` — The Real Deal,
   Multi-Housing News and Commercial Property Executive — and GlobeSt,
   whose FeedBlitz URL parsed to zero items, each served a hundred items,
   the count a site-scoped Google News read returns: the fallbacks #274
   added are the way in. That was a warm process. The next three runs
   (17:24, 17:30 and 17:37), each minutes after a deploy, read a fresh
   one: 4 of 12,
   because the first read fires eight requests at Google News at once
   from one address and Google answers a burst with `HTTP 503` and held
   connections — the topic searches and the site-scoped fallbacks died
   together. #278 gates the host to two requests at a time, caps a first
   door at half the budget, puts Bing News behind every Google read, and
   warms the sources one at a time at boot. The first NEWS HEALTH after
   its deploy (17:53 UTC) read 12 of 12 on the fresh process, every
   source fetched fresh in 41–1,793 ms, the four blocked publishers `via
   Google News · site:…`. The read after #279's deploy (17:59) caught the
   other weather: Google News hung on every request, the CRE topic came
   `via Bing News` (eleven items — the second door works, and a cached
   line keeps its `via`), but the four site-scoped fallbacks queued
   behind the hanging topic searches until their budget was gone (8,001
   ms with only `HTTP 403` in the error: Google never ran, Bing was never
   tried), and Bing's multifamily and debt queries parsed to zero items —
   5 of 12; the 18:12 read on #282's fresh process was the same. #283
   caps the queue wait at half the budget that is left when another door
   stands behind, holds a host that times out three times in a minute for
   45 s so its doors are skipped instantly (the health JSON's `held`
   names it; live-verify prints `NEWS HELD`), makes each door hold at
   most half of what is left so a third door is always reached, and sets
   the Bing queries to the phrasings the runner's probes found items for
   (`multifamily`, `CMBS delinquency distress`, `"rent control"`; the
   probes keep a second phrasing beside each in case those thin out).
   The first NEWS HEALTH after #283's deploy (18:36 UTC, a fresh
   process) read 11 of 12: every search-backed source `via Bing News ·
   …` (The Real Deal, GlobeSt and Multi-Housing News at 12 items each,
   the four topics at 12 / 11 / 12 / 4), `NEWS HELD: news.google.com …
   after 3 failures`, and Commercial Property Executive the one miss
   (Google hanging, Bing's site-scoped read of commercialsearch.com
   parsing to zero items — #285's runner probes try three phrasings).
   `warm` was still null, and #285 found why: the warm-up ran in a
   different copy of the module than the routes read (Next's own
   runtime for `instrumentation.ts`), so its copies never reached the
   page. After #285's deploy the first read should show `NEWS WARM-UP:
   N of 12 sources answered at boot` (or `running — …`) and `cached`
   lines, with `NEWS PROCESS: pid …, up …s` saying which process
   answered. On later runs a source says `cached` when the warm-up or an
   earlier visitor filled it, `via Bing News · …` when Google refused and
   the second door answered (a stale line keeps its `via` too); the
   runner checks both search doors' shape. A line that says `HTTP 403`
   or `503` with no `via` means every door closed and wants a look;
   `[news] warm-up: N of 12 sources answered` is in the service log at
   each boot.
   `/api/news/health` is public, so the same JSON is one click away under
   Service probes on `/data-health`. The
   scored feed under the headlines fills in once the GitHub Actions secret
   is spelled `ANTHROPIC_API_KEY` (it is `NTHROPIC_API_KEY` today) and the
   weekday sweep runs.

Everything in the red section below still stands — the migrations remain the
blocker for Bridge, Valuations, Rent roll and Submarkets.

---

## ✅ The migrations are run — here is what just came alive

**Done 2026-09-16.** You ran every outstanding migration and
`supabase/CHECK_MIGRATIONS.sql` reported them all ✅. That was the single
blocking item for four months of merged work, and it means the pages below
stopped being empty shells this morning. Nothing else in this file depends
on it any more.

**Walk these seven checks once — ten minutes, and it converts "the migration
ran" into "the feature works".** Each one writes a row, because a table can
exist and still refuse a write if a policy is wrong, and a write is the only
thing that proves the whole path.

| Check | Where | What proves it |
|---|---|---|
| 1. Save a deal version | any deal → **Bridge** | Save twice with a changed assumption; the bridge draws the IRR attribution. Writes `deal_versions`. |
| 2. Add an opinion of value | any deal → **Valuations** | Enter a broker's number and yours; the gap decomposes. Writes `valuations`. |
| 3. Import a rent roll | any deal → **Rent roll** | Upload a CSV; map the columns once; WALT and mark-to-market appear, and the mapping is remembered next time. Writes `rent_roll_imports` + `rent_roll_mappings`. |
| 4. Create a submarket | **Markets → Submarkets** | Name one, attach it to a deal; the deal page's supply card fills. Writes `submarkets` + `deal_submarkets`. |
| 5. Read a cost | **/data-health** | The "Cost per screen" card needs `analysis_jobs.usage` (0035). It fills the first time you run a screen AFTER the migration — older screens have no ledger and are correctly blank. |
| 6. Check a site flag | any deal with an address | The closest-parcel and opportunity-zone card needs 0028 + 0030_public_data_layer and PostGIS. If it stays quiet, the property table is empty rather than missing — that is seeding, not migrating. |
| 7. Dismiss an alert | any deal with a regulatory alert | Dismissing writes; rewriting the alert text must fail. That is 0034's column grant doing its job. |

If any of those still refuses to save, re-run `CHECK_MIGRATIONS.sql` and send
me the output — it names the exact table, column or function still owed.

<details>
<summary>The ordering traps, kept for a future environment</summary>

You will meet these again if you ever stand up a second Supabase project
(a staging environment, or a restore onto a fresh database). Both were
verified against a real Postgres:

1. **0028 needs PostGIS enabled first** (Database → Extensions → postgis).
   Its first statement creates that extension; without it nothing in the
   file gets created, which is why 0028 can look unrun even after a run.
2. **There are two files numbered `0030`.** `0030_public_data_layer.sql`
   declares an RPC returning `setof public.properties`, so it fails with
   `type "public.properties" does not exist` unless 0028 ran first — and it
   fails *halfway*, keeping `incentive_zones` and `deals.site_flags` while
   losing the RPC. A table-only check would call that done, which is why
   `CHECK_MIGRATIONS.sql` tests the function too.

Run order: **0028 → 0030_public_data_layer → 0030_deal_versions → 0031 →
0032 → 0033 → 0034 → 0035.** `0033` also needs
`public.can_access_deal(...)` from `0017`. Every file is additive,
idempotent and RLS-scoped — no destructive step, safe to re-run. Run each
file **whole**: the SQL editor runs only the highlighted text if anything
is selected, so click once at the end to clear the selection.

</details>

---

## Your moves — the full list, in the order that unblocks the most

You asked for more than the eight items, and you were right that there is
more. Here is everything standing between "the app is deployed" and "people
who are not you rely on it and pay for it." Each item says **why** it
matters, **where** to do it, and **how you know it worked** — that last part
matters most, because several of these fail silently.

The groups are sequenced. A later group is not urgent until the earlier one
is done, with one exception: **A1 and A2 are sharp edges that affect people
today**, so do those first whatever else you skip.

### A. This week — sharp edges that affect real visitors

**A1. Verify a sending domain in Resend, then point Supabase's mailer at
it.** *The single highest-value item on this page.* Right now a stranger who
signs up gets a confirmation email from Supabase's shared mailer, which is
rate-limited to your own team and lands in spam for everyone else. That means
**sign-up is effectively broken for anybody but you** and you would never see
an error. Resend → Domains → add your domain → publish the three DNS records
it gives you (SPF, DKIM, and a DMARC record). Then Supabase → Authentication
→ SMTP settings → point at Resend with the `RESEND_API_KEY` you already hold,
and set the from address to something on that domain (`hello@…`), never a
gmail.com address — Gmail and Outlook reject those outright from a server.
**How you know:** sign up with an address at a domain you do not control
(a friend's, or a throwaway) and the confirmation lands in the inbox, not
spam, within a minute. Until then, treat every "nobody is signing up" signal
as unreliable.

**A2. Rotate the six credentials that were pasted into chat as screenshots** —
the Stripe secret key, the Stripe webhook secret, the Supabase service-role
key, the two Resend keys and the Anthropic key. Create the new one first, set
it in Render (and in GitHub Actions where the workflows use it), deploy,
confirm the app still works, **then** revoke the old one. Nothing was stored
on my side, but a key that has been in an image is a key you must assume is
public. The service-role key is the frightening one: it bypasses every
row-level security policy, so it can read every user's deals.
**How you know:** the old keys are shown as revoked in each dashboard, and
the site still screens a deal end to end after the swap.

**A3. Set the GitHub Actions secrets, and fix the misspelled one.** The
daily-intel sweep reads `ANTHROPIC_API_KEY`; the repository secret is saved
as `NTHROPIC_API_KEY`. That single missing letter is why the scored feed
under the News headlines has never filled. Settings → Secrets and variables →
Actions. The five it needs: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, `FRED_API_KEY` (free) and `HUD_API_TOKEN` (free, from
huduser.gov/hudapi/public/register). Each workflow no-ops with a printed
instruction until its secrets exist, so nothing has been failing loudly.
Pick **either** the Actions workflows **or** the Render cron services in
`render.yaml` — they run identical scripts on identical schedules, so
running both doubles the cost and the writes.
**How you know:** run the intel workflow once by hand from the Actions tab,
then open `/news` — the scored feed below the headlines has rows.

**A4. Put a spend cap on the Anthropic account.** A screen costs what
`/data-health` now measures, but a runaway loop or an abusive upload costs
whatever you let it. Anthropic console → Billing → set a monthly limit and an
email alert at half of it. Do the same on Render and Supabase.
**How you know:** the limit shows in the console, and you get a test alert.

**A5. Walk the seven migration checks** in the green section above. They take
ten minutes and they convert "the migration ran" into "the feature works" —
a table can exist and still refuse writes if a policy is wrong.

### B. Before you charge anyone money

**B1. Decide about billing, explicitly.** Stripe keys exist in the
environment, which means the code paths are reachable. Either finish it or
close it — a half-wired checkout that errors is worse than a page that says
"invoicing by hand while we are small". If you finish it: create the
products and prices in Stripe, set `STRIPE_PRICE_ID`,
`STRIPE_TEAM_PRICE_ID` and `STRIPE_TEAM_SEAT_PRICE_ID`, point the webhook
endpoint at your real domain, and run `node scripts/stripe-test-flow.mjs`
against test keys. The webhook refuses a subscription whose price ids it
cannot match, so a missing id means a Team checkout alerts instead of
activating.
**How you know:** a test-mode card completes checkout, the account shows the
plan, and cancelling in the customer portal downgrades it.

**B2. Form the legal entity and put its real name on the site.** An LLC (or
your decision to trade as a sole proprietor), an EIN, and a business bank
account. Stripe will ask for all three. Your Terms and Privacy pages are
written and live, but they name a product, not a legal person — a customer's
counsel will notice.
**How you know:** `/terms` and `/privacy` name the entity, and Stripe's
account is out of restricted mode.

**B3. Buy a domain and move the site onto it.** `underwrite-copilot.onrender.com`
reads as a prototype, and no acquisitions professional forwards a link like
that to their investment committee. Render → Settings → Custom Domain, add
the DNS records, wait for the certificate. Then update, in this order:
`NEXT_PUBLIC_APP_URL` in Render, Supabase → Authentication → URL
Configuration (Site URL **and** Redirect URLs — `https://yourdomain.com/**`),
and the Stripe webhook endpoint.
**How you know:** a password-reset link mailed to yourself lands on the new
domain and signs you in. Getting this order wrong is the classic way to lock
yourself out of your own auth.

### C. Before you rely on it

**C1. Turn on error tracking.** Today a server error exists only in Render's
log, which nobody reads at 2am. Sentry's free tier takes about twenty
minutes to wire into a Next.js app and will tell you the first time a real
OM breaks the pipeline in a way the tests never saw.
**How you know:** you deliberately break something in a preview and the
alert reaches your inbox.

**C2. Turn on uptime monitoring.** Something that pings the homepage and
`/api/news/health` every few minutes and texts you when it stops answering.
Better Stack, UptimeRobot, or a Render cron that curls and alerts. Free tiers
are fine.
**How you know:** you pause the Render service for a minute and get paged.

**C3. Prove a backup restores.** Supabase's free tier keeps very little
history. Turn on point-in-time recovery on a paid tier, or schedule a
`pg_dump` into storage. Then — and this is the part everyone skips — restore
it once into a scratch project. An untested backup is a belief, not a backup.
**How you know:** a scratch project comes up with your rows in it.

**C4. Re-check isolation with two accounts.** Sign up a second account in a
private window, create a deal in each, and try to reach account A's deal from
account B by pasting the URL. It must refuse. Do the same with a share link
after revoking it. The code and the database both enforce this and it is
tested, but you should see it refuse with your own eyes once.
**How you know:** both attempts land on a refusal, not a deal.

### D. To make it worth opening

**D1. Screen five to ten real offering memoranda you actually received.**
This is the highest-information thing you can do all month. Every prompt in
this system was tuned against a handful of decks; your inbox has the real
distribution — bad scans, 200-page brochures, weird label wording, a
conversion with no going-in cap. Each failure is a fix I can make precise.
**How you know:** you have a list of what read wrong. Send me that list.

**D2. Seed the property and submarket tables.** Migrations created them;
they are empty, which is why the deal page's closest-parcel card and the
supply card stay quiet. The NYC and Cook County ingest pipelines are wired —
run the `ingest` workflow from the Actions tab. Create one submarket by hand
on **Markets → Submarkets** and attach it to a deal to see the supply card
fill.
**How you know:** a deal with a New York address shows a nearest parcel.

**D3. Re-screen the conversion deal** that once showed Year-1 NOI above its
price, and read the header: *Deal type: Conversion*, the teal plan strip,
yield on cost where the cap would be. That is the check that the strategy
layer reads your real decks the way it reads the fixtures.

**D4. Set `GOOGLE_MAPS_API_KEY` and every deal gets a photograph of its
building instead of its roof.** This is the second half of your "terrible
overhead photos" complaint. The market-level pictures are becoming real
skyline photography this session, but a *deal* shows its own site, and for
that the code already prefers Street View — an actual photograph of the
building front — and only falls back to the USGS overhead when there is no
key or no street-level address. The ordering is written and tested; it is
waiting on the key. console.cloud.google.com → a project → enable **Street
View Static API** and **Maps Static API** → create a key → restrict it to
your domain → set it in Render. It is pay-as-you-go with a monthly free
allowance that a screening product will not exhaust for a long time.
**How you know:** open a deal with a real street address; the header shows
the building from the street, and the pipeline row's thumbnail does too.

**D5. Add privacy-friendly analytics.** Plausible or Fathom, one script tag.
Without it you cannot tell whether people read `/why`, bounce off pricing, or
never find `/demo`. You do not need cookie consent for these.
**How you know:** you can answer "how many people opened the sample screen
last week" without guessing.

**D6. Put a working support address on the site and monitor it.** Even
`hello@yourdomain`. A product that screens somebody's live acquisition needs
a way to hear "this number is wrong."

**D7. Drop four photographs into `public/photos/` and commit them.** Still
open, and now the *only* photography gap — every market picture is being
replaced with real skyline photography this session, but the human-scale
shots still need files I cannot fetch. Exact names and sizes:
`hero.jpg` (2400×1350, wide, quiet mid-tones — a building you would buy, or
your team at work; the headline sits over it),
`team.jpg` (1200×900, an acquisitions team around a table on deal day),
`site-walk.jpg` (1200×900, an analyst walking a property),
`building.jpg` (1200×900, a mid-rise multifamily or an industrial box at
street level). JPEG, under 400 KB each. Until they exist the homepage shows
a market skyline instead and the "Who it's for" strip stays folded away —
never a placeholder.

### E. Standing decisions, no deadline

- **`ANALYSIS_WORKER=1`** on Render moves screens to the worker process.
  Migration 0016 now exists, so this is available. Worth doing once you have
  real concurrent users: a deploy mid-screen currently restarts the web
  process (checkpoints resume it, but the worker is cleaner).
- **`MODEL_VERDICT`** picks the verdict model; `/data-health` shows what each
  choice costs per screen.
- **`OM_READ=pdf`** forces the page read if a deck ever reads wrong from its
  text layer.
- **`NEWS_WARM=0`** turns the boot warm-up off.
- **The two human verifications** (~30 min, high stakes, unchanged): the PG
  County DPIE PRSA FAQ PDF — confirm the ≤5-unit natural-person exemption's
  conditions in the current revision; and D.C. Law 26-80's enacted text on
  code.dccouncil.gov — the 2–4 unit TOPA exemption's "business corporation"
  definition, and whether the ≤4-unit rent-control exemption requires RAD
  registration (unregistered would mean stabilization applies). Paste
  findings back and those `regulatory_rules` rows upgrade from sourced to
  verified.
- **Optionally, give this environment database access**: add `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` + `FRED_API_KEY` to the repo's Claude
  environment and allow `*.supabase.co` in its network policy. Then future
  sessions can run migrations and seeds directly instead of handing you SQL.
  The trade-off is real: that key bypasses row-level security.
- **Optionally, allow one image host** (`upload.wikimedia.org`) in the same
  network policy. Today I cannot see a single photograph I put on the site —
  the skyline work this session is verified by resolving each file from the
  GitHub runner instead. Allowing that one host would let me look at what I
  am shipping.

<details>
<summary>Settled earlier — kept so it is not re-litigated</summary>

- **`/api/comps/health`** was run 2026-09-04 and earned its keep: Philadelphia
  was broken (PostGIS geometry, not lat/lng columns) and is fixed; Maryland
  was broken on every column name and now reads them off the source,
  including structure area so MD comps carry a $/SF; New Jersey needed
  nothing; DC is not wired and now says so (its service is cadastral, with no
  sales table). Four discovery providers point at wrong URLs; Fairfax and
  Allegheny are ready to wire but need a parcel join.
  `lib/public-comps/core.ts` records all of it inline.
- **`RENDER_DEPLOY_HOOK`** was deleted 2026-09-04. The `deploy-to-render`
  workflow was a no-op on every run — the secret was never set, so its
  trigger exited in 0s and the job still went green. Deploys land through
  Render's own `autoDeploy: true`.

</details>

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

Not yet covered by imagery (the shared screen got its aerial in #248 through
a route scoped to the share token; the memo and the report got theirs in
#249, fetched at render time):

1. **Submarket pages** — a map of the submarket with its pipeline properties
   plotted; needs submarket geocoding, which does not exist yet.

## Claude's moves (next session)

1. **Verify phases 1–4 end to end.** The migrations LANDED on 2026-09-16 —
   all of 0030–0035 reported ✅ — so this is no longer blocked on schema, it
   is simply not done: create a submarket, import a pipeline CSV, upload a
   rent roll, download the workbook and confirm the exit cap moves the IRR
   in real Excel, save two deal versions and read the bridge. Every one of
   those is unit-tested and none has been exercised against the live
   database, which is a different kind of unknown from an untested one.
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
8. **The comp reader takes every shape a detail line comes in.** #267
   asks the comp scrutiny for "$252k/unit · 5.4% cap · …" and
   `lib/comp-detail.ts` reads that shape; a model asked for a figure also
   writes "$252,000 per unit", "$252K/door", "$410 PSF", "$410 per SF",
   "5.4% cap rate", "cap rate of 5.4%", "5.40% going-in cap" — check each
   against `compFigures` and widen the readers where one falls through,
   the way #265 did for the gap reader ("$1.2 million", "2 pp"), with a
   test per shape and never a word that merely starts with a unit. The
   same pass for the market check's `parseRange` / `rangeRead`: "5.25 to
   5.75%", "5.25%-5.75%" (a hyphen), "$2,150 – $2,450 per month". (The
   report's pages all say it in pictures now — #250 the memo, #253 the
   market page, #261 the comps, #263 the reconciliation; every table on
   the deal page stacks into cards on a phone after #262 and #264; #265,
   #267 and #268 made the reconciler, the comp scrutiny and the market
   check state their figures in the shapes the readers draw; #266 drew
   the section counts.)

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
