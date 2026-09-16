@AGENTS.md

# Underwrite Copilot — project orientation

CRE deal-screening web app. One uploaded offering memorandum (OM) flows through a
six-step analysis loop, all sharing one "deal":
**extract → challenge → scrutinize broker comps → reconcile (vs the user's own model) → market check → verdict.**
Plus accounts + saved deals. (Stripe billing is a later phase.)

## Architecture

- **Next.js 16 App Router + TypeScript**, Tailwind v4. Server Components by default.
- **Claude (Anthropic)** does the analysis. The key is server-side only:
  `lib/anthropic/client.ts` imports `server-only` so it can never leak into the
  browser bundle.
- **Long analyses run in a background worker** (`worker/`), not in a web request,
  because a 150–200pp OM plus several Claude calls takes a minute+. With
  `ANALYSIS_WORKER=1` the web app only enqueues a job in `analysis_jobs`; the
  worker claims it, runs the pipeline with per-step checkpoints (resumes after
  deploys), and updates progress. Unset, analyses run in-process via `after()`
  as a fallback. See `worker/README.md`.
- **Supabase** = Postgres + Auth + Storage (the OM PDFs). Per-user isolation via RLS.
- **Render** hosts the web service and the worker (`render.yaml`).

## Where things live

- Prompts (the analytical heart): `lib/anthropic/prompts.ts`
- Output shapes / the shared contract: `lib/anthropic/types.ts`
- Model selection / cost levers: `lib/anthropic/models.ts`
- The deal's kind and the plan (pure, LLM-free): `lib/deal-strategy.ts` (strategy,
  plan summary, plausibility, the shared price / cap / budget / unit readers),
  `lib/plan-sensitivity.ts` (yield on cost, stressed), `lib/construction-debt.ts`,
  `lib/plan-facts.ts` (the plan's facts, one source for every surface), and
  `lib/deal-context.ts` (what the screen established, handed to every Claude
  step that reads the OM after the extraction). Read the deal's kind first —
  a plan deal has no going-in cap; its stabilized figures belong over total cost.
- The pipeline row's price / cap / yield-on-cost slots: `lib/pipeline-slots.ts`
  (the same rule as the meeting .xlsx — a plan deal shows yield on cost, never
  a cap). The sample deal's ONE derivation for the demo page, the demo workbook
  and the demo report: `lib/sample-derive.ts` (actuals included — never call
  `deriveUnderwriteInputs` on the sample directly).
- A broker comp's figures: `lib/comp-detail.ts` reads a stated per-unit /
  per-SF basis and cap out of the comp's one detail line (`compFigures`), the
  subject's own basis from the shared readers (`subjectBasis` — none for a
  conversion or a development), and puts the set on one track
  (`basisScale`). It reads only what the text states; nothing is inferred.
  Every surface that draws a comp against the subject goes through it.
- A reconciliation gap's figure: `lib/gap-detail.ts` reads the dollar,
  basis-point or percent magnitude a row's gap line states (`gapFigure`) and
  puts every row on its own unit's track, signed by the row's stated
  direction (`gapScale`) — never across units, never inferring a sign from
  the words. The deal page's Reconciliation table and the report's
  reconciliation page both draw from it.
- Render smoke tests: `lib/deal-view.render.test.ts` and
  `lib/views.render.test.ts` render the signed-in views on fixtures — and the
  shared screen's view (`app/share/[token]/share-view.tsx`; its `page.tsx`
  is only the loader, so keep the markup in the view; the token's
  resolution — the six refusals, then the deal — is `lib/share-resolve.ts`,
  shared with the token-scoped aerial route `app/api/share/[token]/aerial`,
  so never resolve a share anywhere else) — and lint
  the visible text with `lib/render-lint.ts` (a digit glued to a word, a word
  doubled; `a11yIssues`: an image with no alt, a nameless button or link, an
  unlabelled control, a duplicate id; `visibleText` decodes `&amp;` last,
  so a double-escaped entity — the literal `&nbsp;` a reader would see —
  stays in the text). With `VIEW_SHOTS_DIR` set they also
  write each view as a full document with the built stylesheet linked, so
  headless Chromium can open it at 390px — the visual half, run by hand.
  `lib/jsx-whitespace.test.ts` scans every page's source for the JSX shape
  the compiler glues (a leading space after `}` or `>`, a line break, an
  entity); the fix is an explicit `{" "}`. A number followed only by a
  margin-spaced `<span>` is one word to a screen reader — spell the space.
  The public pages get the same lint after every deploy:
  `scripts/lint-pages.mjs` over the HTML live-verify fetches.
  `lib/a11y-source.test.ts` scans every page's source for a form control
  with no accessible name (the pages the render tests cannot reach). The
  root layout renders the one skip link (`app/skip-link.tsx`); every page's
  main content is `<main id="main">`, and the lint fails an in-page link
  whose target id is missing. Never crawl a local `next start` while a
  build runs, and never leave one running across a rebuild: an ISR page it
  re-renders overwrites the fresh build's prerender with its stale code.
- The documents: the memo and report PDFs are read back as text in their
  tests (`lib/memo/pdf-text-of.ts`, test tooling) — assert on what the page
  says, not on its page count. `lib/key-terms.ts` orders a "Key terms" block
  (memo and shared screen): the deal-defining rows first, then the flagged
  ones. Standard Helvetica is WinAnsi-only (`lib/memo/pdf-text.ts`): no "✓",
  no arrows. The memo's cover aerial is fetched at render time, bounded, and
  its bytes validated before embedding (`lib/memo/cover-aerial.ts`):
  react-pdf hangs the whole render on a PNG whose zlib check fails rather
  than throwing, so never hand it unverified image bytes; test images come
  from `lib/memo/test-png.ts`, built with the real deflate and CRC. A
  picture the PDF draws from plain Views (the memo's base-position bars, its
  call dots) is asserted by counting filled shapes — `pdfFillCountOf`
  beside `pdfTextOf` — against a render without it; the memo reserves its
  footer band (`paddingBottom`), so a memo that cannot fit one page flows to
  a second rather than over its footer.
- What a screen costs: `lib/anthropic/usage.ts` is the per-run ledger —
  `structured()` records every call's four token meters into whichever
  ledger is open on the async context, `runAnalysis` writes the summary to
  `analysis_jobs.usage` (migration 0035) and one log line, Ask logs its
  own; the list prices live in `lib/anthropic/models.ts` (`PRICES`, by id
  prefix) beside the model levers, whose comment says the one thing to
  know: the prompt cache is per model, so the OM-reading steps move
  together or not at all. The operator's picture is the pure
  `app/(app)/data-health/cost-card.tsx`, rendered on fixtures in
  `lib/cost-card.render.test.ts`.
- How the OM reaches the model: `lib/anthropic/om-source.ts` — the deck's
  own text layer, page-tagged (`lib/pdf-text.ts`, pdfjs in-process), when
  it is dense enough to stand in for the pages (`isDenseLayer`: four
  pages at least, half of them dense with text of their own — a line that
  recurs on half the pages once or twice a page is furniture and counts on
  none, so is a line whose exact words recur on half the pages however
  many times a page (the caption tiled under every rendering — a line
  carrying a figure only where it is a page's whole text, so an
  inventory's identical rows stay the deck), a table's rows never are); the PDF inline or
  as a Files-API
  reference otherwise. Only the screen and Ask pass `textFirst`; a buyer's
  model, a BOV and a rent roll keep their pages. `OM_READ=pdf|text`
  overrides per call. The layer's page count is what the facts are
  validated against. The pipeline holds the layer to the deck
  (`textLayerMissed`): a read with no figures, or figures but no NOI, is
  re-read as pages, and the checkpoint payload's `omPages` makes a resumed
  attempt read the pages from the start.
- An asset class's words: `lib/asset-class.ts` (`ASSET_CLASS_LABEL`,
  `assetClassLabel`, the forms' option list) — every surface that prints
  one goes through it, so a stored `self_storage` never reaches a page
  raw; the pipeline row's slots and its "Auto" rule are `lib/pipeline-slots.ts`.
- A market's photograph: `lib/skyline.ts` (pure — one verified Wikimedia
  Commons file per metro with its photographer and licence, plus
  `commonsUrl` / `creditLine`), served by `app/api/imagery/skyline/[id]`
  (proxied, validated by content-type, cached immutable, 404 on any
  failure). `app/city-photo.tsx` (`CityPhoto`) is the one component every
  market surface draws through: skyline first, the USGS overhead as the
  floor, and **the credit follows whichever picture actually rendered** —
  that is why the fallback is in the component and not the route, because
  naming the wrong photographer is a licence breach. An overhead stays only
  where the subject is one building (deal header, pipeline thumbnail, memo
  cover, shared screen); there `lib/imagery.ts` already prefers a Street
  View photograph when `GOOGLE_MAPS_API_KEY` is set. A market with no
  verified file keeps its overhead, so the table grows one photograph at a
  time. **Never write a filename, author or licence into that table from
  memory**: the sandbox cannot reach Commons (403 through its egress
  proxy), so `scripts/probe-skylines.mjs` runs from the GitHub runner via
  live-verify and only what that run prints goes in the table. It verifies
  by default (every deploy re-resolves all sixteen files and prints LIVE or
  DEAD with the byte count at 1600px); tick `skyline_search` on the
  dispatch to hunt for new candidates, and `skyline_markets` narrows either
  mode to a few metros. It reads `cand.file` out of
  `data/skyline-candidates.json`, whose entries are `{ file, note }` objects
  — `lib/skyline.test.ts` holds that shape, holds every served market to
  having a candidate, and holds each market's candidates to containing the
  file the table actually serves, because a malformed entry silently
  disables the only check that can ever catch a dead file. **The probe is a
  runner-to-Commons test; the live-verify PHOTOGRAPHS step is the
  visitor's** — it fetches `/api/imagery/skyline/<id>` from the site and
  reports the content type, which is the claim that matters, since the route
  404s on every failure. The **AERIALS** lines beneath it do the same for
  the markets deliberately kept on an overhead: they were probed by nothing
  at all, because the skyline loop only walks the skyline table — and a
  market whose only picture is the aerial has no fallback left if that
  route breaks, which makes it the one most worth watching rather than
  least. Prefer those steps' lines over a round marker:
  a marker greps the served HTML, and the credit line is in the HTML whether
  or not the picture resolves (the fallback to the overhead is client-side,
  in `CityPhoto`, by design). Its doors, best first: a city's **Wikipedia article
  images** (argued over by people who care which photograph represents the
  place), hand-filed **Commons categories**, then full-text search — which
  on its own surfaces maps and diagrams long before photographs. Four
  traps it has already fallen into, all fixed: `mime` is its own `iiprop`
  value (leave it out and every file fails the type test as `undefined`),
  Commons treats `_` and a space as the same character so the two APIs
  return the same file under two spellings, an un-paced sweep collects
  429s that read as an empty shelf, and a candidate committed as a bare
  string instead of an object prints `DEAD undefined` — which reads exactly
  like a dead photograph and is nothing of the sort, since the file was
  never asked for. **A photographer's name is not necessarily Latin-1**:
  the route's `x-imagery-source` header carries the credit, a header value
  is a ByteString, and `new Headers()` THROWS above U+00FF rather than
  dropping the character — Philadelphia's photographer is credited as
  颐园居, so that route 500'd for /demo's own metro. **The fallback then
  worked, which is exactly why nobody noticed**: `CityPhoto` falls back on
  the `<img>`'s `onError`, and a browser fires `error` for any failed load,
  a 500 as much as a 404 (checked in a real Chromium against both), so the
  market quietly served the overhead with the credit correctly moved to
  USGS. A graceful silent degradation is invisible to every HTML-based
  check — which is the case for asking the site for the image itself.
  `headerSafe` in `lib/skyline.ts` percent-encodes what a header cannot
  carry, and `lib/skyline.test.ts` puts every market's credit through a
  real `Headers`.
  PG County and Montgomery County
  are deliberately absent: a suburban submarket has no skyline, and the
  overhead is the more honest picture of a place shaped by its land. **NoVA
  is the exception** (added 2026-09-16, from the runner's own search):
  Rosslyn is a real high-rise cluster, zoned tall because it stands across
  the Potomac from a height-limited Washington, so there is a skyline to
  photograph and an aerial was answering a question nobody asked.
- Deal math without a deal: `lib/tools/deal-math.ts` (pure — the cap rate
  triangle, the mortgage constant, `sizeLoan` against whichever of LTV /
  DSCR / debt yield were set with the **binding one named**, break-even
  occupancy, yield on cost and its spread over the exit cap, and one rent
  said four ways), rendered by `app/tools/`. Two conventions, both
  deliberate: **a rate is a percent here** (`6.5` means 6.5%) because that
  is what a person types, while `lib/underwrite/engine.ts` keeps decimals
  to match how Excel stores a percent cell — the two never meet inside one
  function; and a blank is null, so an unset lender test is dropped rather
  than sized at nothing. Every field there reads through `readFigure`
  (`lib/money.ts`), which takes the shorthand an analyst types — `$20M`,
  `500k`, `1.2mm`, `6.5%`, `1.25x`, and a negative, because `sizeLoan`
  has a deliberate answer for a negative NOI. It shares ONE suffix table
  with `parseUsd` but keeps its own rules: no floor (the same page holds
  a $36 rent and a $20M price) and no sign rule, and it is strict about
  the whole string where `parseUsd` is loose (a field's contents are the
  figure; a pasted line is not). `/tools` and `/market` are the two
  public pages that also serve signed-in visitors; both draw their chrome
  from `app/public-shell.tsx`, never their own copy.
- A pasted column of cash flows: `lib/tools/cashflow-math.ts` (pure —
  `readStrip` takes what a spreadsheet's clipboard actually puts on it,
  deciding the separator by what the text contains, because a comma is
  BOTH a separator and a thousands mark; `analyzeStrip` answers with the
  rate, the multiple, the profit, the payback interpolated inside the
  year, an NPV, and the SPLIT — how much of the return is the sale). The
  split is discounted at the deal's own IRR, which is the standard
  partition and always the smaller, honest number against a raw-dollar
  ratio; it needs the sale stated, because nothing in a bare column says
  where the building was sold, and it says so rather than guessing.
  **`irr` comes from `lib/underwrite/engine`** — the one behind the Excel
  export, whose formulas CI recalculates against it — so the page and the
  workbook can never disagree. (`lib/model/compute` holds a second,
  coarser copy for the model tab; a third would be worse than either.)
  Every field on the page is on `useShared` (in the same client file): the
  value goes into the query string so a sizing travels as a LINK, written
  with `history.replaceState` (not the router — no navigation, and Back
  still leaves the page) and debounced, carrying only what differs from
  the seed. It reads through **`useSyncExternalStore`, whose server
  snapshot is the seed** — reading `window.location` during render is the
  hydration bug this avoids, and the render test asserts the server's
  HTML carries the seeded figures. A table's Copy button writes it
  tab-delimited with headers and the numbers RAW, never the formatted
  ones, so a paste lands in a spreadsheet as numbers.
- A lease, and an expense: `lib/tools/lease-math.ts` (pure). `readLease`
  gives BOTH net effective rents and names them — straight-line, the one
  most memoranda quote, and discounted, which charges the landlord for
  waiting and is therefore always lower on a deal with free rent up
  front. Two rules the arithmetic turns on: escalations step **annually
  on the lease's own anniversary**, so free rent taken at the front is
  priced at the rate it WOULD have been paid at (treating it as "the term
  starts a year later" understates the concession, and is the common
  mistake); and the commission is written against the **gross** rent over
  the term, the face deal, which is why a concession-heavy lease still
  pays a full fee. `readOpex` says one expense per unit, per SF and as a
  share of EGI, and names a sub-20% ratio as a net lease rather than a
  cheap building.
- How the deal is capitalised: `lib/tools/sources-uses.ts` (pure). Three
  rules. **Equity is the plug, never an input** — typing both an equity and
  a debt figure states a capital structure rather than deriving one, and a
  tool that allows it will happily show a stack that does not add up; the
  uses side decides the cheque. **Closing costs quote against the PRICE**,
  not against total uses, because quoting them against a total that
  includes themselves is circular. And **the loan fee is a USE funded at
  closing**, not a reduction of the loan — netting it out of proceeds
  understates both the loan and the equity, which is how it goes missing
  from a screening model. A loan larger than total uses reports a NEGATIVE
  equity line rather than clamping to zero: it means the loan is oversized
  for the basis, and hiding that is the one thing this must not do.
- An OM's unit mix table: `lib/tools/unit-mix.ts` (pure). Two rules.
  **Weight by unit count, never by row** — 200 studios at $1,200 beside 4
  penthouses at $6,000 do not average $3,600, and averaging the rows is the
  easiest error to make because the rows are what you can see. And **loss to
  lease is summed only over the rows that state BOTH rents**, so the two
  sides of the subtraction always cover the same units; a half-filled market
  column is the normal case (an OM quotes market rents for the renovated
  types only) and `note` says how many units the figure covers. Two reader
  rules that cost a debugging round each: the separator is chosen by
  PRECEDENCE (tab > pipe > runs of spaces > comma), because a comma does
  double duty and accepting both at once reads "1,395" as two cells and
  turns a $1,395 rent into $1; and a row of three numbers is
  (count, rent, market) or (count, SF, rent) decided **once for the whole
  table** by the median ratio of the last two — a market rent sits near its
  in-place rent by definition, a square footage does not, and a column is a
  property of the table rather than of a row.
- The measures on a page of an OM: `lib/tools/measure-math.ts` (pure).
  `readLand` treats acres and square feet as ONE measurement entered from
  whichever side the document stated (`SF_PER_ACRE`, 43,560), and where both
  are given and disagree by more than 1% it names the gap and answers from
  the **acreage**, which is what a deed carries and what zoning is written
  against. FAR headroom is signed and never clamped: a building over its
  limit is a legal non-conforming condition, not a zero. `readSpace` keeps
  apart the two figures people both call "the load factor" — **rentable over
  usable less one** (a landlord's 15%) and **common area over rentable** (the
  same building's 13.0%) — because quoting the smaller one understates the
  rent per usable foot every time; that rent is the point of the module,
  since a $40 quote at an 18% load is dearer space than a $42 quote at 10%.
  A usable area larger than the rentable one is refused rather than computed.
- What `/tools` answers: `lib/tools/catalog.ts` (`TOOL_INDEX`, `TOOL_COUNT`
  — pure data, no `"use client"`, so a server-rendered page can import it).
  The page's jump index renders from it, each card takes its `id` from it,
  **and the homepage's shelf renders from it too** — the homepage went on
  saying "size a loan, or run the cap rate math" while the page grew from
  four calculators to fifteen, and one list imported by both makes that
  drift impossible rather than merely unlikely. The count in the page's own
  meta description is prose and cannot render from the constant, so
  `catalog.test.ts` holds the spelled-out number to `TOOL_COUNT` instead;
  that claim went stale twice in one evening before the guard existed.
- Depreciation and the sale's tax bill: `lib/tools/after-tax.ts` (pure,
  screening arithmetic, federal only — the card says so). Three rules, in
  the order they cost money. **Land is never depreciable**, so the basis is
  price less the land share and never the price. **The gain at the sale has
  THREE rates, not one** — section 1245 property from a cost-segregation
  carve-out recaptures at the ORDINARY rate, the building's depreciation
  comes back as unrecaptured 1250 gain at 25%, and only appreciation over
  the original price is capital gain; they are filled in that order, and
  running the whole gain at the capital-gains rate understates the bill on
  any long hold. And **depreciation is a TIMING benefit** — `netOfRecapture`
  is the shelter less what the sale took back, and a test pins it to exactly
  zero when the sheltering and recapture rates are equal, which is the claim
  the module exists to make checkable. It follows that **cost segregation is
  not a free lunch**: on the seeded deal it lifts year-one depreciation 4.5×
  and leaves the owner $130,909 WORSE off in raw dollars, winning only on
  the time value the module deliberately does not count.
- Rolling the gain forward instead: `lib/tools/exchange-1031.ts` (pure —
  the sibling of the card above, and the reason its fine print now points
  at one instead of disclaiming one). Three rules, two of which reverse an
  answer rather than shade it. **Debt relief is boot** — coming down on the
  mortgage is taxable even when every dollar of cash is reinvested. **Cash
  boot is NOT cured by borrowing more**: net debt relief is offset by cash
  ADDED to the replacement, but the offset runs one way only, so an
  exchange can clear the price test comfortably and still recognise gain —
  which is exactly what the seeded deal does, on first load. And
  **deferred is not forgiven**: the replacement's basis is its price LESS
  the rolled-in gain, so the new building's depreciation runs on the old
  basis and the gain is standing there at the next sale. The three tests
  are reported with the binding one named (`sizeLoan`'s convention), boot
  is taxed recapture-first at the higher rate, and `exchangeClock` draws
  the 45 and the 180 from the SAME day — capped by the return's due date,
  which costs a Q4 closing real weeks unless an extension is filed.
- Who owes whom at closing: `lib/tools/proration.ts` (pure). The one
  calculation here that comes AFTER yes, and the one people get BACKWARDS
  rather than merely wrong, because two of its rules reverse a payment's
  direction on a fact about the jurisdiction rather than about the deal.
  **Taxes paid in ARREARS mean the seller credits the buyer** (the bill is
  unpaid; the buyer will pay the whole year and needs the seller's days
  handed over); paid in ADVANCE it is the other way round. Read the wrong
  way the money moves the wrong direction, so the miss is the SUM of the two
  figures and not the difference — which is why every line is reported as a
  signed credit to a named side and the card draws it from a centre line.
  **Security deposits are the TENANTS' money**, credited to the buyer whole
  and never prorated: the buyer inherits the obligation to return them, so
  no part belongs to the seller for the days they owned. And **the day of
  closing is charged to one side by the contract**, not by a default, so it
  is an input — a day of a $20M building's taxes is real money. Each line
  rounds to the cent on its own, as a settlement statement's lines do, so
  the difference of two rounded figures is not the rounded difference; a
  test asserts within a cent rather than forcing an equality that would be
  asserting a rounding bug.
- What the dirt is worth: `lib/tools/land-residual.ts` (pure). The one
  calculation on `/tools` that solves for a price instead of judging one —
  the finished building's value less the cost of building it and the return
  required for doing so. Three rules. The carry is charged on the land
  too, which is the thing being solved for, so it is **solved rather than
  approximated**: `T = (L + H + S)(1 + c)`, hence `L = T/(1+c) − H − S`;
  quoting the carry against hard and soft alone understates a cost and
  therefore overstates the land. **Profit on cost and yield on cost are two
  different tests** — each reduces to a total-cost budget, and where both
  are set the LOWER land value binds. And the land is **derived from the
  rounded pieces** (the debt schedule's rule) because the five figures draw
  as segments of one bar and the land is the leftover, so it should absorb
  the rounding rather than leave a gap. A negative residual is reported as
  a negative: the site does not work at any price, free included. The two
  shocks it prints — 25bp on the exit cap, 5% on the build — are re-SOLVED
  rather than scaled, because a residual amplifies everything upstream of
  it (5% on the cost is ~33% on the land).
- Who gets the return: `lib/tools/waterfall-math.ts` (pure). `runWaterfall`
  distributes a deal's cash period by period through a pref and its promote
  tiers with an **IRR lookback** — each hurdle measured on the LP's ACTUAL
  cash, contributions and everything paid to it including this period's
  distribution, never an accrual account kept alongside. That is the market
  convention and the only checkable version: the LP's realised IRR at a
  hurdle boundary equals the hurdle, which the tests assert. Two rules that
  are easy to get backwards. **The pref tier splits PRO RATA**, not 100% to
  the LP — a GP with 10% of the equity is entitled to 10% of the money
  coming back, and what makes the tier a pref is that the LP must REACH
  that IRR before anyone's share changes; paying it entirely to the LP
  leaves no promote to measure at all. And **the promote is what the GP
  took ABOVE its pro-rata share** — the only honest definition, for the
  same reason. Return OF capital is not a separate step: an 8% IRR is not
  reached until every dollar in has come back plus 8% on it.
- The loan over its life, and the refinance at the end:
  `lib/tools/debt-math.ts` (pure). `readDebt` runs the schedule **monthly**
  and reports it a year at a time — annual approximation gets a 30-year
  loan's first year wrong by enough to matter over a five-year hold. Two
  rules: the payment after an interest-only front end amortises over the
  **full** period again (the market convention, and why IO makes the
  balloon *bigger* rather than merely the early payments smaller), and each
  year's five figures are derived from the **rounded balances** — rounded
  independently, interest + principal misses debt service by a dollar often
  enough to be visible, and a schedule whose rows do not add up reads as
  broken whatever the arithmetic behind it. `testRefi` sizes the take-out
  through `sizeLoan`, so a refinance is judged by exactly the same three
  tests as the original loan, and adds the comparison the sizer cannot
  make: a loan that is healthy on its own terms is still a cash-in
  refinance if it lands under the balance it has to retire. `noiToClear`
  inverts the **binding** test only — a target to work toward, not a
  promise, since pushing NOI past it hands the job to whichever test binds
  next.
- The homepage's photographs: `lib/photos.ts` (pure — the four slots with
  their file names, briefs, sizes and alt text; `presentPhotos` over an
  `exists` callback; `stripPhotos`; `HERO_AERIAL`) and `lib/photos-fs.ts`
  (the disk: `public/photos/<file>`, checked at render time). A slot
  renders only when its file exists — the "Who it's for" strip folds
  away otherwise, never a placeholder. Until the operator's `hero.jpg`
  lands, the hero's backdrop is a USGS aerial of Midtown Manhattan from
  the metro imagery route. `app/place-band.tsx` is the one piece behind
  every public page's opening: `PlaceBackdrop` (the picture, its scrim,
  the credit — `AerialBackdrop` in `app/aerial-img.tsx` drops the credit
  with the picture on a 404) and `PlaceBand` (a dark section at the
  page's content width); `/why` opens on `dc`, `/demo` on
  `philadelphia`, `/login` on `baltimore`, and a metro brief on `/market`
  on its own metro (a rounded band inside the page's column). A new public page opens the same way — pick the
  covered market that means something to it. The sandbox cannot fetch a
  photograph from any image host; the ground-level files are the
  operator's move. **The scrim is the design, and it is measured.** The
  picture draws at full strength and `PhotoScrim` does all the work:
  `"band"` runs bottom to top (opaque under the words the band sets at
  its bottom, clearing until the photograph is ~80% of the frame across
  the top — the right crop for files that are all panoramas), `"center"`
  a plateau down the middle from `lg` with both margins clear, for the
  sign-in card. Words go inside `on-photo band-words` (globals.css: a
  dark halo, a 36rem measure). `lib/place-band.contrast.test.ts` reads
  the gradient stops back out of the component and recomputes white
  against a PURE WHITE frame — the worst photograph a market could have
  — so a lightened scrim fails rather than quietly shipping; the first
  version rendered the image at `opacity-30` under a gradient still 55%
  opaque, i.e. an eighth of the picture, and nothing caught it. A tier
  like `text-white/75` reads at 10:1 on a flat teal band and far less on
  the same band with a photograph behind it, so every tier a band uses is
  measured too.
- The News page's live layer: `lib/news/feeds.ts` (pure: the sources with
  their fallbacks, parsing, ranking) and `lib/news/live.ts` (the network:
  a fresh copy per process, a wall-clock deadline per source, the
  publisher's own feed then its fallbacks inside one budget — a door with
  others behind it holds at most half of what is left, whether it spends
  that in its host's queue or on the request — one retry after a fast
  429/5xx, a last-good copy, a gate of two requests in flight per host,
  one request per source shared by concurrent callers, and a host held
  at bay: three timeouts / dropped connections / 429s / 5xx inside a
  minute and it is not asked for 45 s, its doors skipped at once — a
  caller already queued on the host gives its slot back unused — so the
  next door gets the whole budget (a 403, a 404 or an empty page never
  counts — the publisher said no, the host is up — nor a timeout on a
  request given under 300 ms; a 429 or a 5xx always does); the status
  names the way in as `via`, on a cached or a stale line too). Every Google News
  read has a Bing News read behind it (`News:Source` is the outlet; the
  click redirect is unwrapped by `directUrl`; a body arrives as escaped
  HTML and `toSnippet` decodes it at the feed's level and then the
  body's, or the page shows a literal `&nbsp;`; a Bing query is plain
  keywords or one quoted phrase — Google's `OR` syntax parses to zero
  items there). `instrumentation.ts` warms the sources one at a time at
  boot (`warmLiveHeadlines`; `NEWS_WARM=0` off) because a fresh process's
  first parallel read bursts one host and gets 503s back; the health
  route reports that run as `warm` (`lastWarmUp`: its progress while it
  runs, then its result), the held hosts as `held` (`heldHosts`) and the
  process (`pid`, `uptimeS`). The layer's state lives on `globalThis`
  (`liveState`, a registered symbol), never in module-level variables:
  Next compiles `instrumentation.ts` into its own module runtime
  (`.next/server/chunks/[turbopack]_runtime.js`), apart from the routes'
  (`…/chunks/ssr/`), each with its own module cache, so a module-level
  Map is two Maps in one process — any state a route must share with
  `instrumentation.ts` goes on `globalThis` the same way.
  `/api/news/health` is public and live-verify prints every source's
  outcome from Render's own network, the warm-up line, the held hosts,
  and the search doors' shape fetched from the runner (each topic query
  and a second phrasing beside it) — read those lines before touching a
  feed URL; the sandbox cannot reach the publishers or the search hosts.
  The page's live section is the pure view
  `app/(app)/news/live-headlines.tsx` (`LiveHeadlinesView`), a front
  page: the top story as the lead with a kicker (what it touches, from
  `headlineSignals` — the words the score's own matches carry, so a tag
  never says what the score did not count — and the covered market it
  names, from `lib/news/markets.ts`, the proper nouns each metro goes by
  in prose, never the address matcher's state-guarded keywords), a serif
  headline, its dek and the publisher's own picture (`itemImage` in
  `feeds.ts`: `media:content`, `media:thumbnail`, an image enclosure,
  Bing's `News:Image`, the body's first `<img>` — https only, which is
  why the CSP's `img-src` carries `https:`); six more in a three-column
  grid; the rest as a two-column list; the sources as one line —
  answered / earlier copy / did not answer — with the search hosts
  behind them. The page fetches and hands the result in, and
  `lib/views.render.test.ts` draws it on a fixture. Keep it free of I/O
  so the test stays a render. The scored
  feed below it is the same shape: `app/(app)/news/scored-feed.tsx`
  (`ScoredFeedView`: the law strip, the sector chips, the day groups
  highest relevance first, the one quiet line) takes the two tables'
  rows from the page and renders on a fixture in the same test.
- The pipeline's failure modes: `lib/anthropic/failure.ts` turns any failure
  into one sentence the analyst can act on (the raw text goes to the server
  log, never the page), and its `structured()` wraps every structured-output
  call so a cut-off, a refusal or unreadable JSON is named. `lib/screen-run.ts`
  reads the job row: a failed run's step says which stored results still
  belong to the previous screen (`staleAfterFailure`), and the pipeline list's
  Running / Stalled / Failed (`listJobStatus`); the deal page, the list, the
  memo and report routes and the shared screen all read it there — never
  decide "is this result current" anywhere else. In-process runs heartbeat
  the job row; a Files-API copy of an OM is released when its run ends
  (`releaseOmSource`); one web process runs at most `ANALYSIS_CONCURRENCY`
  (default two) screens at once (`lib/anthropic/run-gate.ts` — the claim is
  taken and heartbeats before the wait), and a deck past ~600 pages stops
  before any model call. `lib/anthropic/pipeline.test.ts` drives the real
  pipeline against a recording fake database — reproduce a failure there
  before fixing it.
- The front door: `lib/auth-flow.ts` is the pure layer — an auth failure's
  sentence by the service's stable `code` (`authErrorCopy`), the sign-in
  page's link banner, and where an email link's one-time code goes.
  `@supabase/ssr`'s server client runs PKCE with `detectSessionInUrl` off,
  so a reset or confirmation link's `code` must be exchanged in
  `app/auth/callback/route.ts` (a Route Handler can write cookies; a Server
  Component cannot). `proxy.ts` (`lib/supabase/proxy-session.ts`) hands any
  link that lands elsewhere to that route (`authLinkHandoff`) before the
  sign-in bounce runs, so the redirect targets in Supabase never have to
  change; `PROTECTED_PREFIXES` there is the one list of signed-in areas.
  The code verifier lives in the requesting browser's cookies — a link opened
  elsewhere fails, and the page says so. Tests drive the route and the proxy
  with a fake auth client (`lib/auth-callback.test.ts`,
  `lib/supabase/proxy-session.test.ts`).
- The private bucket: `lib/storage-paths.ts` is the one definition of where
  objects live (`<userId>/<dealId>.pdf`, `…/<dealId>.model-tmp`,
  `documents/<dealId>/…`, `supplements/<dealId>/…`,
  `<teamId|userId>/branding-logo-…`) and every primitive in `lib/storage.ts`
  takes the scope it acts for — `{ kind: "deal", dealId }` or
  `{ kind: "branding", userId, teamId }` — and refuses a path outside it
  before any read, write, signed URL or delete. Paths come off user-writable
  columns and the storage client is the service role (no RLS), so this gate
  is the boundary; never call the client directly, and mint paths with the
  helpers there. Migration 0034 asserts the same shapes at the row.
  `lib/rls-policies.test.ts` lints the migrations: no write policy may be a
  bare `true` without a column grant behind it.
- DB schema: `supabase/migrations/`

## Conventions

- **The public pages say it in pictures.** The operator's rule (2026-09-08):
  "words that can be a picture should always be a picture." The homepage is
  one idea per section — an eyebrow, a headline of a few words, and the
  thing itself (the sample deal card, the six-icon stage rail, the verdict
  tabs, the live stress bench, the aerial gallery, the artifact tiles, an
  icon grid). No paragraph runs past a line there or on `/demo`; the
  long-form argument belongs on `/why`. The signed-in surfaces follow the
  same rule (#241): the pipeline's stage ladder is a funnel with counts, its
  verdict split a bar, a teammate an initials badge, "not screened" an empty
  ring; a helper sentence under a card says only what the card cannot. A
  research note on `/market` folds (`Fold` in `app/market/page.tsx`): the
  first sentence shows, the rest is one click away, and the whole text stays
  in the HTML for the lints, live-verify and screen readers.
  Before adding a section or a sentence, measure the page (`scratchpad`'s
  shoot script pattern: full-page height, word count, pictures, headings;
  the fixture views via `VIEW_SHOTS_DIR` for signed-in pages;
  `node scripts/prose-census.mjs` lists every JSX text run of 25+ words in
  the sources, login or no login) and ask what picture replaces the words.
  live-verify gates on the hero headline and the build-sha stamp only, so a
  redesign never has to preserve copy to stay green.
- Anything that touches a secret (Anthropic key, Supabase service-role key) is server-only.
- Claude PDF facts to design around: the 1M-context models (Opus 4.8, Sonnet 4.6)
  read PDFs up to ~600 pages / 32MB in one request; enable Citations for
  page-level "verify against source"; cache the OM across the pipeline steps to
  keep cost down. These models use adaptive thinking (no `budget_tokens`).
- The broker-comp scrutiny step reads comps OUT of the OM itself — no external
  comps data source (deliberate: avoids data-licensing constraints). The
  SEPARATE public-records pull (`lib/public-comps/`, `/comps`) has its own
  rule: **a figure is only as strong as the count behind it.**
  `compEvidence` grades a set — `individual` under `MEDIAN_FLOOR` (3),
  `thin` under `CONFIDENT_FLOOR` (5), `usable` above — and
  `medianLabel` / `salesPhrase` / `evidenceNote` say so on the page. One
  sale is never called a median (it is "the one recorded sale"), the
  vs-median CALL is withheld below the floor entirely, and a 3–4 sale
  median prints with its count attached. The figure itself is never
  hidden: a single recorded sale is the only evidence there is, and an
  analyst who can see it decides for themselves. `medianPerSqft` has
  honoured the floor since it shipped; the whole-price median did not.
- This is **Next.js 16** — see AGENTS.md; check `node_modules/next/dist/docs/`
  before using unfamiliar Next APIs.

## Outstanding work

`WILL_TODO.md` is the forward list — read it first in a new session. It names
whose move each item is. **As of 2026-09-16 every migration through 0035 is
run and verified** (`supabase/CHECK_MIGRATIONS.sql` reported them all ✅), so
the four LPC pages, the cost ledger and the site-flag card are live rather
than inert — the long-standing "blocked on migrations" caveat is retired.
What remains is seeding and the operator's own accounts, not schema.

## Build roadmap

Phase 0 ✅ scaffold. Phase 1 auth + saved deals. Phase 2 OM upload + extraction +
worker engine. Phase 3 challenger. Phase 4 broker-comp scrutiny. Phase 5 reconciler.
Phase 6 market check. Phase 7 verdict. Later: Stripe billing, polish.

## The four LPC-derived builds (all shipped)

Layered on top of the screening loop. Each is standalone; each has its own pure
math layer with tests, and its own page under the deal.

| # | Feature | Where it lives |
|---|---------|----------------|
| 1 | **Assumption Bridge** — attribute an IRR move to the inputs that caused it, via Shapley values over the changed assumptions | `lib/bridge/`, `app/(app)/deals/[id]/bridge/`, migration 0030 |
| 2 | **BOV Reconciler** — decompose the gap between two opinions of value; run each implied price through the user's own model | `lib/valuation/`, `lib/anthropic/bov-extract.ts`, `app/(app)/deals/[id]/valuations/`, migration 0031 |
| 3 | **Rent Roll Engine + live-formula Excel export** — CSV/XLSX ingestion with saved fuzzy mappings, WALT / rollover / mark-to-market, and a four-tab workbook whose formulas are live | `lib/rentroll/`, `lib/export/`, `app/(app)/deals/[id]/rent-roll/`, migration 0032 |
| 4 | **Submarket Supply & Pipeline** — exclusion rules, basis-aware rent trends, pipeline reconciliation, months of supply, and assumption checks on the deal page | `lib/market/`, `app/(app)/submarkets/`, migration 0033 |

Rules these share with the rest of the codebase:

- **The math layer is pure and LLM-free.** Every one of these has a tested
  `lib/` module with no I/O; the LLM only ever reads documents.
- **A blank is null, never zero.** An assumption a document doesn't state is
  absent, and absent is a different claim from zero. This is asserted in tests
  across phases 2, 3 and 4.
- **Never write a computed value into a cell that should hold a formula.** The
  Excel exports are live models. `lib/export/cashflow.ts` mirrors the workbook's
  formulas so the two are checked against each other in CI (HyperFormula, plus
  a real LibreOffice headless recalculation — which is why
  `.github/workflows/test.yml` installs `libreoffice-calc`).
- **A picture in a workbook is Excel's own conditional formatting** (the
  meeting export's data bars, `lib/pipeline-workbook.ts`), never a rendered
  image: it stays live as the numbers change, and the workbook test reads
  the rules back from `conditionalFormattings`.
