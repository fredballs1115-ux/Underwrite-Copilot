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
- A portfolio — one OM, several properties (#411): the extraction lists
  each property in `ExtractionResult.properties` (name, address, count,
  area, NOI, occupancy, year built, the allocated price and the page, each
  as the OM states it for THAT property and "" where it states none; a
  one-entry list is dropped as a single property restated; up to 150 are
  listed, and a larger tape leaves the list empty rather than list part of
  it, since a share of an unknown whole is no share — the extraction's
  output cap is 16,000 tokens so a long list is never cut off), and
  `lib/portfolio.ts` (pure) reads them: each property's share of the whole
  in ONE unit for the set (the count when every property states one, else
  the area, never a mix), its share of the NOI only when EVERY property
  states one (four of five stated is no concentration — the fifth could be
  the largest), the markets from each property's own address through the
  market check's matcher (`placeOf`, in `lib/address.ts`, reads the OM's
  address line; a two-letter state counts only in capitals, so "Oak Ct"
  is not Connecticut, and a full state name is tried longest first, so
  "Charleston West Virginia" is not Virginia), and the allocation's
  total against the ask — the
  allocation is the seller's split, so a per-property cap on it is "a cap
  on the allocation". A property's page is kept only where it parses AND
  falls inside `totalPages` (lib/facts' absolute rule — the first cut
  printed the model's page raw, one more way to invent a citation). The
  readers: the deal context gets a `portfolioContextLine` (whatever the
  strategy), the challenger's notes get `portfolioNote` (the facts, then
  five PORTFOLIO TRAPS by name), the market check's header says whose
  figures they are when the properties span markets (`portfolioFor`), and
  what a person reads draws ONE set of sentences — `portfolioFacts` (the
  income carried by one property, a partial income set, the allocation
  against the ask, an address with no state) and `propertyFigures` (a
  property's shares, then only what the OM states) — in three places:
  `app/portfolio-card.tsx` (`PortfolioCard`, pure, at the app root because
  the deal page under the property visual AND the shared screen under its
  key terms both draw it: a bar a property for its share, a second for its
  NOI share, the markets as chips linking to their market pages), the full
  report's own "The portfolio" page before the extracted terms
  (`PortfolioBlock`, the same bars as plain Views — four fills a property,
  which the report test counts), and the workbook's Portfolio tab after the
  Deal Summary: the OM's figures in blue as inputs with a blank left blank,
  and every derived column a LIVE formula (the allocation per unit and the
  cap on it, each share only once `COUNT` says every property states the
  figure, the totals under the same rule, the allocations against the ask)
  with Excel's own data bars from zero — HyperFormula types the missing
  count into the test's workbook and the shares appear, equal to the
  reader's on the completed set. **The market check reads each of the
  portfolio's markets** (#413): `liveMarketFromDb` returns the address's
  market (`primary` — what the page's since-this-screen compares against,
  so it stays the address's) and up to `MAX_OTHER_MARKETS` (3) others
  (`otherPortfolioMarkets`, most properties first, the rest counted and
  named as not read — a ten-market portfolio read whole would bury the
  checks), each its own block handed to the model after the first. An
  other market's block (`role: "other"`) says how many of the properties
  sit there and that its figures are the metro's (or the state's) — not
  those properties' own, never the portfolio's — and carries NO national
  line: the debt market, the lessor rents, the insurance index and CRE
  prices ride in the first block read (the address's, else the first
  other's). They are stored as `MarketResult.otherBriefs`, each record
  with `portfolio: { here, of }`, and every surface that prints the
  check's evidence prints them under their own heading: the deal page's
  folds ("Read beside the Cleveland OH market's own figures — where 2 of
  the 5 properties sit"), the verdict's brief, the report's market page
  and the shared screen's market read. The report's heading for a state's
  figures used to say "the Pennsylvania market's … the metro's" and now
  says the state's. **And every block counts its national lines**
  (`LiveMarketBrief.national`, stored as the record's `national`: the
  last lines, after the metro's own — the lessor rents, the insurance
  index, the debt market, CRE prices): every surface said "each the
  metro's" over a block that ends with the 10-year, which was not true of
  it, so the model's header, the deal page's fold ("12 published figures
  … each dated: 8 the metro's rather than the submarket's and 4 the
  nation's"), the verdict's brief, the report and the shared screen now
  say the two apart. A record written before the count has none and
  reads as before.
- What is being sold (#414): the extraction reads the INTEREST conveyed
  (`ExtractionResult.interest`: `fee_simple`, `leasehold`, `note`,
  `partial_interest` or `unknown`, with the OM's own sentence, a share as
  stated, the ground lease and the loan as stated, and the page) and
  `lib/interest.ts` (pure, importing no `lib/deal-strategy`, which reads
  `interestOf` from it) says what the price buys. Four rules. **A note's
  price is a loan's**: the collateral's NOI over it is a cap rate nobody
  earns, so the plausibility check makes no price finding at all, the
  model's price note says it runs the collateral as if bought outright,
  and every surface says the property model is not the note's return; the
  balance comes only from a row the extraction labels "Unpaid principal
  balance" and the discount to it is said. **A share's price is for the
  share**: `parseSharePct` reads ONE percentage under 100 off the OM's own
  words (two different ones is no share), and the plausibility check and
  the model gross the price up to the whole the building's figures
  describe — the model's price source is "derived", its note saying the
  share earns its slice before the promote and fees — while a share with
  no stated percentage is compared to nothing. **A leasehold is a wasting
  asset**, said, with the ground lease as stated and a link to the ground
  lease calculator. **A blank is null.** An extraction saved before the
  interest was read is fee simple, and a plain fee simple says nothing.
  One price reader behind all of it (`askingPriceOf` in
  `lib/deal-strategy.ts`, the plausibility check's and the model's own),
  and the comps' subject tick takes the same rule (`subjectBasis`'s
  `interest`: no tick on a note, the whole's basis on a share, none on a
  share with no stated percentage — a 49% stake's price over the whole
  building's units read $83k a unit against $170k).
  Where it shows: the deal context (FIRST, whatever the strategy), the
  challenger's notes (first, with each interest's traps by name — the
  note's collateral, discount, foreclosure and documents; the share's
  control, waterfall, exit rights and capital calls; the leasehold's term,
  resets, subordination, coverage and reversion), `app/interest-panel.tsx`
  (`InterestPanel`, pure — the deal page under its header and the shared
  screen under its title: a note's balance as the track with the price
  filled, a share's implied whole with the share filled,
  `data-bar="interest"`), the memo under its title (`interestShortLine`),
  the report's sensitivity page (the model caveat above the grids) and the
  workbook's cover (`meta.interest`). **The leased fee is its own kind**
  (#415, `leased_fee`): the land under a building someone else owns, sold
  with its ground lease — read as fee simple with a ground lease, the same
  deal was told its income was an expense. The ground rent IS the
  buyer's income; the extraction files it under "Ground rent" and the
  building's operating income under "Income before ground rent", a label
  with no "NOI" in it so no NOI reader takes the building's income for
  the deal's (`groundRentOf`, `incomeBeforeGroundRentOf`; a rent per
  foot, a monthly figure, a coverage, a bump or a reset is not the year's
  rent). Cover is the one division of two stated rows, said on a
  leasehold and a leased fee alike and drawn in the panel (the building's
  income as the track, the rent filled); the plausibility check flags a
  leased fee whose NOI is over 1.5× the stated rent
  (`ground_rent_mismatch` — the building's income taken for the deal's)
  and holds no building basis band to the land's price; the comps draw
  no subject tick; the traps are the lessor's (the rent is the income,
  coverage, subordination, resets, the reversion, purchase options).
  **Every reader that divides a price divides the building's**:
  `buildingPriceOf` (lib/deal-strategy — the price on a fee simple or a
  leasehold, a share's grossed up, null for a note, a leased fee or a
  share of no stated percentage) and `statedBasisIsBuildings` (whether
  the OM's own per-unit line and cap may be read) feed the plan
  (`planSummary`: a share's whole price labelled "Whole price, the share
  grossed up", and `priceWithheld` saying why a note's or the land's
  price is not the project's rather than "not stated"; a leased fee's
  plan has no budget, cost or yield — the works are the leaseholder's),
  the market memory, the internal comps, the analytics, the research
  panel's per-unit read, the public-record comps' median call and the
  debt sizer's seed — a memory that pools the account's past screens
  never averages a note's price or a ground rent's cap into a market's.
  What the price buys is said beside the figure wherever the figure
  stands alone: the pipeline row and its CSV (`PipelineSlots.interest`,
  `interestTag` — "49% share", "Note", "Leasehold", "Leased fee"), the
  meeting workbook's price-cell note, the deal header ("Price · 49%
  share") and the internal comps' price column. **A note is underwritten
  as a note** (#416, `lib/note-yield.ts`, pure): the extraction files
  each of the loan's terms as a row of its own — "Unpaid principal
  balance", "Note rate", "Maturity date" (as written, with its month; the
  initial maturity, never an extended one), "Amortization", "Payment
  status", and the collateral's value under "Whole-asset value" — and
  `readNoteTerms` reads only those rows, through one finder
  (`noteRowsOf`) that the key terms share: a bare-year maturity is no
  maturity; an amortization in months is read in years; an interest-only
  row's figure is the interest-only period, never an amortization; and an
  interest-only period beside an amortization is run interest-only and
  said so, since the OM does not say which applies from today. `readNote`
  runs the note month by month from today's balance to its maturity and
  solves its yield to maturity with the engine's `irr` (the monthly rate
  × 12, the way the coupon is quoted). Beside it are the current yield,
  the price in cents on the dollar, and the loan-to-value at the balance
  and at the price, over the value the OM states. Four rules. **The
  discount is the return**: the yield past the current yield is the
  discount accreting, and a premium larger than the interest left to
  collect is a loss, said as one (the report test's $68M ask for a $60M
  balance read −0.1%, which the first sentence printed without saying
  why). **A term the OM does not state is not invented.** **A
  non-performing note's contract yield is not the buyer's**: it is said as
  what the note would earn if it paid. **A note past its maturity has no
  contract yield.** `readInterest(ex, price, asOf = today)` carries the
  read as `note`. The headline adds the yield and the cushion
  (`noteYieldSentence`, `noteCollateralSentence`) after the `lead`, so the
  deal context and the challenger read them on the day they run. The
  panel draws the yield as three tiles (to maturity, current yield, on
  the dollar), and only where the note pays or may: a large yield nobody
  earns is not drawn. Beneath the tiles go the months and the payment
  basis (`noteCaption`), then the collateral's stated value as the track,
  with the balance filled light (`data-bar="note-balance"`) and the price
  dark over it; a loan under water gets a tick at the value. The memo's
  and the workbook cover's short line adds "13.8% to its Mar 2028
  maturity". The report prints the note's own terms under the model's
  caveat. A note's key terms lead with the loan's rows after the price
  (`keyTermRows`' `interest`, `noteTermRows`), and a test holds the
  prompt's labels to the reader's. **A leasehold is valued on its term**
  (#421). The extraction files when the ground lease ends as rows of its
  own:
  - "Ground lease expiration": the current term's end as written, never a
    date that assumes the options are exercised;
  - "Ground lease term remaining": only where the OM states a count
    instead of a date;
  - "Ground lease extension options".

  `lib/ground-lease-term.ts` (pure) reads them three ways, best first:
  - a stated date, as written (`parseStatedDate` in lib/note-yield,
    `parseMaturity`'s reader with a year range, since a 99-year lease can
    end after 2100);
  - a year alone, read as its FIRST day, the earliest end the year allows;
  - a count of years, counted from today and said to be possibly short,
    since the memorandum's own date is earlier.

  The options are read apart from the term: "four 10-year options", "4 x
  10 years", "three successive 10-year", "to 2111". A separator is
  required between the count and the length, so "25-year" is never two
  of five. A term "including options" is a ceiling. A purchase option is
  never an extension. `readInterest` carries the result as `term` and
  `termLine`; the deal context and the challenger read it, and the panel
  draws it (`app/lease-term-bar.tsx`, `LeaseTermBar`, pure: the years
  left filled, the options dashed).

  `lib/leasehold-exit.ts` (pure) values the model's exit on the years
  left at its sale. The rate is the model's own exit return, its exit cap
  plus the rate its NOI grows in the year after the sale: what a buyer
  paying that cap for a building that never reverts earns. At it, the
  term is worth `1 − ((1+g)/(1+c+g))^n` of the capitalised figure
  (`termShare`; tests pin it to a year-by-year sum and to /tools'
  `leaseholdPv`). The engine is run again at the cap that value implies,
  so the returns on the term are the model's own. A lease that ends
  inside the hold prices no sale. The options are the ceiling, beside
  the term, never instead of it. The lender line asks whether a buyer's
  10-year loan at the sale gets its `TERM_MARGIN_YEARS` margin, unless
  the lease says it is subordinated. It is the term's arithmetic alone,
  the generous side of the truth, and the card says so.

  On the sample model as a leasehold ending Dec 2071, 40.3 years are left
  at the sale. The term bears 87% of the $82.5M capitalised exit. That is
  the 5.45% exit cap read as 6.23%, and the levered IRR is 6.2% against
  11.7%.

  The card is `app/(app)/deals/[id]/leasehold-exit-card.tsx` on the
  Financials tab under the assumable card. It draws the term with the
  hold marked (`data-bar="lease-hold"`, `lease-term`, `lease-options`,
  `lease-past` for the hold's years past the lease's end), and the two
  exits on one track (`lh-capitalised`, `lh-term`).

  #422 carries it wherever the deal is summarized:
  - the pipeline row's tag and its CSV, the deal header and the internal
    comps (`interestTag(ex, asOf)`): "Leasehold, 45 yrs left", whole years
    down, and "Leased fee, reverts in 45 yrs";
  - the memo's header and the workbook cover's "What is being sold"
    (`interestShortLine`'s clause): "…; the lease ends Dec 2071, 45.3
    years from today";
  - the report, as `LeaseholdBlock` beside the assumable block, from the
    same `leaseholdExitView` the route builds off its own derived model:
    the term and the two exits in plain Views, then the sentence and the
    small print;
  - the workbook cover (`meta.leasehold`): the read with the exit cap
    that runs the workbook on the term ("Enter 6.23% as the Exit Cap…").
    The input stays the model's; the reader decides.

  The shared screen already draws the term, since it draws the panel.

  **The compare table reads each price for what it buys** (#423,
  `lib/compare-interest.ts`, pure). The table reads each deal's
  document-generated model, which runs at the documents' price: a loan's
  on a note, the share's on a share. `compareInterest` applies the deal
  page's rules:
  - a note has no cap, so its cell shows the note's yield to maturity at
    its price (only where the note pays or may), and its returns are
    withheld as the collateral's;
  - a share's cap is struck on the whole its price implies
    (`buildingPriceOf`), and its returns stand only where the model
    already ran at that whole, within 2%;
  - a leasehold and a leased fee stand as the model runs them.

  Withheld cells say "n/a — note" or "n/a — share", the way a plan deal's
  say "n/a — plan", and the price row carries the pipeline's
  `interestTag`. The leverage rows follow the corrected cap.
- Affordable housing (#453): the extraction reads whether a covenant or a
  contract sets the rents (`ExtractionResult.affordable`: `programs` —
  `lihtc`, `section8`, `bond`, `tax_exemption`, `inclusionary`, `other`;
  the agreement and the assistance as stated; the unit mix by income tier
  with each tier's rent and stated limit) and labels its figures as rows:
  "Restricted units", "Market-rate units", "Units under HAP contract",
  "Affordability expiration", "Compliance period end", "HAP contract
  expiration". Only a RECORDED restriction or a contract is listed —
  "workforce" or "naturally occurring affordable" is marketing, and the
  multifamily trap list says so. `lib/affordable.ts` (pure) reads them:
  counts (a tier sum only where every tier states its units; counts that
  cannot all be true are said, and no share is read off them; 239 of 240 is
  99%, never 100%), the three clocks (a year alone read on the side that
  does not flatter the buyer — a restriction's last day, a HAP contract's
  first; an end stated as a term from a start, "30 years from 2011", kept
  as stated rather than added up), each tier's rent against its limit (at
  it, rents grow only as the limits do; over it, a compliance finding, not
  income) and the restricted tiers' average against the market tier's on
  the memorandum's own averages. Its rules: a restricted rent moves with
  HUD's income limits, not the market; a gap to market is the
  restriction's cost, not loss to lease; a HAP contract renews on HUD's
  terms; the restriction outlasts the credits' compliance period, and a
  qualified-contract release is never read as its end. The model is NOT
  changed — its one rent growth rate is said to be the market-rate units'
  (`modelCaveat`), since HUD's limit growth is a feed not yet read. Where
  it shows: the deal context and the challenger (`affordableNote`, each
  program's traps by name — the LIHTC list includes the value-add capped
  by the limit), `app/affordable-panel.tsx` (`AffordablePanel`, pure: the
  units by tier `data-bar="affordable-units"`, a HAP contract's units
  `affordable-hap`, the clocks `affordable-clock`, each tier's rent against
  its limit `affordable-rent`) on the deal page and the shared screen, the
  key terms (`affordableTermRows` after the unit count), the pipeline row,
  card and CSV and the meeting workbook's price note (`affordableTag`:
  "LIHTC, 75% restricted", "Section 8, 34% of units"), the memo under its
  title and the workbook cover (`affordableShortLine`), the report over its
  grids (`AffordableCaveat`) and the compare table's Affordability row (a
  dash, never "market-rate", for a screen saved before it was read).
- One tenant leases the whole property (#454): the extraction reads
  `ExtractionResult.singleTenant` (the tenant, its guarantor, the lease
  type, the landlord's obligations and the tenant's rights, each as stated;
  a blank tenant on a multi-tenant or vacant property and on a leased fee,
  whose lease is the ground lease) and labels the lease's figures as rows:
  "Lease expiration" (the primary term, never one that assumes an option),
  "Lease term remaining" (only a stated count), "Renewal options", "Rent
  increases", "Annual base rent", "Tenant credit rating" and "Early
  termination date". `lib/single-tenant.ts` (pure) reads them through
  `readLeaseTerm` — the ground-lease reader's own core
  (`lib/ground-lease-term`), so a tenant's lease and a ground lease share
  one copy of the three readings of an end and of the options — and never
  from a ground lease's, a loan's or a note's row. Its rules: the term is
  the asset (years left today and at the model's sale; a lease that ends
  inside the hold leaves years the model counts as rent and the buyer does
  not have); the options are the tenant's, drawn dashed after the term;
  an early termination is the lease's end (`effective`, the rollover
  card's break rule); the increases are the growth — "10% every 5 years"
  compounds to 1.92% a year, "flat" is 0%, only the primary term's words
  are read and whatever turns to the options is the options', CPI and
  anything else stay as stated (`readIncreases`); the guarantor is the
  credit, and a stated rating is graded by its own letters (BBB- / Baa3
  and above investment grade, a disagreement across the line a split,
  "N/A" unrated — `readRating`). The model is NOT changed:
  `singleTenantModelLine` says the years left at its sale (or the lease
  ending inside its hold, with its vacancy "a market's allowance, not a
  single tenant's all-or-nothing") and the lease's increases against its
  Rent Growth input — "enter 1.92% as the rent growth to run the model on
  the lease" — only where the lease outlasts the sale. Where it shows: the
  deal context and the challenger (`singleTenantNote`, traps (a)–(g) keyed
  to the facts, the tenant's rights named by their words — a right of
  first refusal, a first offer, a termination, a purchase option, going
  dark), `app/single-tenant-panel.tsx` (`SingleTenantPanel`, pure: the term
  through `LeaseTermBar` with `optionsWord="Renewal options"`, the hold
  where the page has the model, `data-bar="lease-increase"` against
  `model-growth`, the facts as stated) on the deal page (with the derived
  model) and the shared screen (without), the key terms
  (`singleTenantTermRows` — the end, the increases, the options — after
  the count), the pipeline row, card and CSV's "Tenancy" column and the
  meeting workbook's price note (`singleTenantTag`: "Single tenant, 9 yrs
  left", "Single tenant, may leave in 4 yrs"), the memo under its title
  (`singleTenantShortLine`), the workbook cover ("The single tenant",
  `meta.singleTenant`: the line and the model read), the report over its
  grids (`SingleTenantCaveat`, from the route's derived model; the line
  alone where a caller built none) and the compare table's Tenancy row.
- What a hotel is sold with (#455): the extraction reads
  `ExtractionResult.hotel` (the flag as stated or "Independent", the
  franchise and the management as stated, `encumbrance` —
  `unencumbered`, `brand`, `management`, `brand_and_management`,
  `unknown` — and the PIP's own words; blank on anything but a hotel) and
  labels the figures as rows: "PIP cost", "PIP cost per key" (each only as
  stated, never one derived from the other), "Franchise expiration",
  "Management agreement expiration", "ADR", "RevPAR" (today's — a pro
  forma or budget figure under its own label, which the reader never
  takes), "RevPAR index" and "FF&E reserve". `lib/hotel-deal.ts` (pure)
  reads them: the PIP total and per key (the other multiplied or divided
  over the key count, in the count's own noun — "rooms" where the OM counts
  rooms), the building's price a key (`buildingPriceOf`, none on a note or
  the land) and the all-in basis a key with the PIP on top; the two clocks
  through the affordable reader's `datedEnd` (a year alone: the franchise's
  FIRST day, the management agreement's LAST — the side that does not
  flatter the buyer); ADR × occupancy against the stated RevPAR (tied
  within 2%, or said not to tie, never choosing one; ADR and RevPAR read to
  the cent, since `parseUsd` rounds); and the RevPAR index against 100.
  **The model takes a stated PIP** as its first-year capital where no other
  capital budget is stated (`capitalImprovementsYr1`, extracted, "PIP cost —
  the brand's property improvement plan, as stated…"); a stated renovation
  budget is read as including it and never added to it.
  `hotelModelLine` says which, plus a franchise ending inside the hold (a
  relicensing brings its own PIP) and a management agreement outlasting the
  sale on an encumbered hotel; it rides in `meta.hotel` (the workbook
  cover's "The hotel", the report's caveat through the route's derived
  model, the deal page's panel), so the three say the same sentence. Where
  it shows: the deal context and the challenger (`hotelNote`, the contract
  traps (a)–(d) beside the class's own HOTEL_TRAPS), `app/hotel-panel.tsx`
  (`HotelPanel`, pure: `data-bar="hotel-price"` + `hotel-pip` for the basis
  a key, `hotel-clock` with the model's sale as `hotel-hold`, the rooms
  equation and `hotel-index` against a 100 line) on the deal page and the
  shared screen, the key terms (`hotelTermRows`: the PIP, the franchise's
  end, RevPAR), the pipeline row, card and CSV's "Hotel" column and the
  meeting workbook's price note (`hotelTag`: "Mgmt encumbered, PIP
  $35k/key", "Unencumbered", "Independent"), the memo under its title
  (`hotelShortLine`) and the compare table's Hotel row.
- How the property is sold (#456): the extraction reads
  `ExtractionResult.sale` (`method` — `negotiated`, `auction`,
  `receivership`, `bankruptcy`, `reo`, `unknown` — with the sale's terms
  and the condition it is sold in, each as stated) and labels the figures
  as rows: "Starting bid" (never filed under "Asking price"), "Buyer's
  premium", "Reserve price", "Bid deadline" and "Stalking horse bid".
  `lib/sale-terms.ts` (pure) reads them. **A starting bid is not a price**:
  a cap struck on it is the ceiling of what the building yields.
  **The premium is part of the price**: `readPremium` reads one percentage
  (25% at most) and any stated minimum, `allInFor` puts it on top of a bid
  and `hammerFor` backs it out of an all-in figure, the minimum binding
  where it must (a test holds them inverse). **A reserve is the seller's**
  (`none` — "absolute", "no reserve" — `undisclosed`, an amount, or the
  words), and the reserve's pattern is anchored so a "Replacement reserve"
  row is never read as one. **A receiver, a trustee or a lender is not an
  owner**: the headline says who is selling and what that means (as-is, no
  representations, the court). Auction figures make an auction whatever the
  method field says; a negotiated sale, and an unknown one with no bid, no
  premium and no stalking horse, read null. **The model runs at the floor**:
  where no asking price is stated, `deriveUnderwriteInputs` prices at the
  starting bid plus the premium (`floorAllIn`, "derived", the note saying
  every return is therefore a ceiling), after a stated price and a share's
  gross-up, before the cap-implied price. **The ceiling bid** is
  `lib/sale-ceiling.ts` (`saleCeiling`): the max-bid solver's all-in
  ceiling at the hurdle, backed out of the premium, said by
  `ceilingBidLine` — over or under the starting bid, and, where the model
  still clears the hurdle at the solver's own ceiling, "the bidding, not
  the model, sets the ceiling". The hurdle is the buy box's IRR floor, else
  `SALE_HURDLE_PCT` (the report grid's 15%), on the deal page, the report
  and the workbook alike (the workbook route reads the buy box only for a
  deal sold this way). The solver no longer gives up when its search floor
  (5% of the price) fails: on a high-yield deal the IRR there is past the
  routine's reach and reads as none while prices further up clear, so only
  a grid on which no stop clears has nothing to report. Where it shows: the deal context and the
  challenger (`saleNote`: SALE TRAPS (a)–(d) at auction, (a)–(c) for a
  receiver, a bankruptcy or a lender), `app/sale-panel.tsx` (`SalePanel`,
  pure: `data-bar="sale-bid"` + `sale-premium` with a `sale-ceiling` tick,
  a bids-due chip) on the deal page and the shared screen, the key terms
  (`saleTermRows`, right after the price), the pipeline row, card and CSV's
  "Sale" column and the meeting workbook's price note (`saleTag`: "Auction,
  5% premium", "Receivership sale", "Bankruptcy sale", "Bank-owned
  (REO)"), the memo under its title (`saleShortLine`), the workbook's cover
  ("How it is sold", `meta.sale`), the report's caveat and the compare
  table's Sale row.
- The tenants of a multi-tenant property (#457): the extraction lists
  them in `ExtractionResult.tenants` as the memorandum's tenant summary
  does, largest first, twelve at most — each tenant's name, `role`
  (`anchor`, `inline`, `outparcel`, `other`), `inSale` (`no` is an anchor
  the memorandum says is NOT part of the offering: a shadow anchor), its
  area, its rent (a year's, a foot's or a month's, as stated), its lease's
  end as written, its options, its first date to leave early and the
  rights it holds, each "" where the memorandum states nothing — and
  labels a quoted WALT "WALT". Empty on a single-tenant property, housing,
  a hotel, storage, parking and land; a one-entry list is dropped.
  `lib/tenant-roster.ts` (pure) reads them through the rollover card's own
  arithmetic (`readRollover` in lib/tools/rollover), at
  `ROSTER_HOLD_YEARS` (5, held to `HOLD_MONTHS` by a test, kept apart so a
  pipeline slot never loads the model). Six rules: **the roll is the
  risk** (the share of the listed rent — or area, where the list states
  no rents — expiring each year before the model's sale, the worst year
  named with its tenants); **weight by rent** (the memorandum's quoted
  WALT against the listed leases' rent-weighted term); **a break is an
  expiry** (a stated early termination date is the lease's end, and a
  year alone is read as its FIRST day through the affordable reader's
  `datedEnd`); **a shadow anchor is not bought** (named apart, never in the
  roll); **co-tenancy rides on the anchor** (the rent under co-tenancy
  clauses as a share, and a tenant that may go dark named); **the list is
  not the building** (every figure is said as the listed tenants', with
  the share of the building's area they cover). Null where one tenant
  leases the whole property (lib/single-tenant reads it), on a leased fee
  and on a class whose income is not business tenants. `rentOf` reads a
  rent to the cent (`parseUsd` rounds). The model is untouched; its read
  (`rosterModelLine`, in `meta.roster`) says it carries no leasing capital
  — TI and commissions are placeholders of zero — while the roll lands
  inside its hold, and that its vacancy stays flat through a worst year of
  25% or more. Where it shows: the deal context and the challenger
  (`rosterNote`: MULTI-TENANT TRAPS (a)–(f), (g) the shadow anchor, (h)
  co-tenancy and go-dark), `app/roster-panel.tsx` (`RosterPanel`, pure:
  `data-bar="roster-roll"` a column a year to the sale, `roster-tenant` a
  segment a listed tenant of the building's area with `roster-shadow`
  dashed apart, and a three-column list — each lease's end in the warning
  tone before the sale, the area and rights under the name, so it fits a
  phone — under the read's first two sentences, the rest folded) on the
  deal page and the shared screen, the key terms
  (the quoted WALT), the pipeline row, card and CSV's "Tenants" column and
  the meeting workbook's price note (`rosterTag`: "Shadow-anchored", "56%
  rolls in 5 yrs", or both — its own `roster` slot, apart from the single
  tenant's `tenancy`), the memo under its title (`rosterShortLine`), the
  workbook's cover ("The tenants", `meta.roster`), the report's caveat and
  the compare table's Tenants row.
- A value-add renovation program (#460): the extraction labels the
  program's figures as rows of their own, each only as stated — "Units to
  renovate", "Units renovated", "Renovation cost per unit", "Renovation
  premium", "Achieved renovation premium", "Classic rent", "Renovated
  rent", "Annual turnover", "Renovation period" — and `lib/value-add.ts`
  (pure) reads them (`readValueAdd`; null unless the deal is a value-add or
  states the doors beside a cost or a premium). Five rules: **the premium
  is a claim until a door proves it** (an achieved premium is evidence, a
  projected one a pro forma, and the panel's chip says which); **the return
  on cost has no clock** (the premium a year over a door's cost — how many
  doors are done by the sale is the pace's question); **the pace is set by
  turnover** (a program of N months needs 12/N of the classic units to turn
  each year, set against the building's own turnover where stated);
  **the premium is worth its cap, less its cost** (`valueAddModelLine`: a
  door's premium at the model's exit cap against its cost, and the
  break-even premium, cost × cap / 12); **a blank is null**. The model is
  not the plan: it grows today's rent at one rate, so its read (in
  `meta.valueAdd`) says the premium is in none of its returns. **A program
  stated a door at a time is the plan's budget** where the memorandum
  states no total: `renovationProgramBudget` in `lib/deal-strategy.ts`
  multiplies the doors by a door's cost (`renovationCostPerDoor`: a range
  or a figure past `DOOR_COST_CEILING`, $250,000, is none) and marks it
  `program` with the arithmetic as its label ("192 doors × $15,000 a door,
  the renovation program as stated"), on a value-add only and never added
  to a stated total. `planSummary` and the model's capital line read it
  (provenance "derived"), so such a deal has a total cost — and, where the
  memorandum states a stabilized NOI, a yield on cost and the report's
  plan page — and the plan facts say "Budget (doors × cost a door)";
  before, a value-add with a per-door program and no total had neither the
  IRR page (omitted on a plan deal) nor the plan's. The two rows' patterns live in `lib/deal-strategy`
  (`RENOVATION_DOORS_ROW`, `RENOVATION_COST_PER_DOOR_ROW`), since
  `lib/value-add` imports from there. Where it shows: the deal context and
  the challenger (`valueAddNote`: VALUE-ADD TRAPS (a)–(e)),
  `app/value-add-panel.tsx` (`ValueAddPanel`, pure: `data-bar="va-done"` /
  `va-left` the doors, `va-premium` / `va-achieved` the premium on one
  scale with `va-breakeven` a tick at the model's exit cap, `va-needed` /
  `va-turnover` the pace; the read's first sentence, the rest folded) on
  the deal page and the shared screen, the key terms, the pipeline row,
  card and CSV and the meeting workbook's price note (`valueAddTag`: "Reno
  $250/mo, 20% on cost", its own `valueAdd` slot), the memo under its
  title (`valueAddShortLine`), the workbook's cover ("The value-add
  program", `meta.valueAdd`), the report's caveat and the compare table's
  Value-add row.
- A property-tax abatement (#461): the extraction labels its figures as
  rows of their own, each only as stated — "Tax abatement" (the program as
  named), "Tax abatement expiration" (the last phase's end as written, or
  a term counted from a start as written), "Abated real estate taxes",
  "Unabated real estate taxes", "Annual tax abatement savings" and "Tax
  abatement phase-out" — and `lib/tax-abatement.ts` (pure) reads them
  (`readTaxAbatement(ex, asOf)`; a "None" or "N/A" row is no row, a bare
  "Yes" names no program). Five rules: **the NOI is on abated taxes**;
  **the step-up is said as a price** (the full bill less the abated one,
  else the stated savings, over the going-in cap — the tax-reassessment
  card's rule); **the end is read early** (a year alone is its FIRST day,
  through lib/affordable's `datedEnd`; a term from a stated start is the
  start plus the term, `from: "term"`, said as counted); **the sale is the
  clock** (`taxAbatementModelLine`: ending inside the model's hold leaves
  its exit on a NOI the building no longer earns, the step-up at its exit
  cap; ending after the sale is the next buyer's to price); **a blank is
  null** (no full bill is never estimated). `taxBillOf` refuses a range and
  a bill per unit or per foot. `ownerPays` is true for housing, a hotel,
  storage and parking (gross leases); elsewhere the read says leases that
  pass taxes through put the step-up on the tenants. The model is
  untouched: it grows today's abated taxes with its expenses, and its read
  (`meta.taxAbatement`) says where the abatement ends against its sale.
  Where it shows: the deal context and the challenger (`taxAbatementNote`:
  TAX-ABATEMENT TRAPS (a)–(e) — the NOI on abated taxes, the burn-off, the
  transfer, the conditions, the assessment), `app/tax-abatement-panel.tsx`
  (`TaxAbatementPanel`, pure: `data-bar="abate-left"` / `abate-after` the
  clock with `abate-sale` the model's sale as a line, `abate-now` /
  `abate-full` the bill on one scale, `abate-noi` / `abate-step` the NOI
  with the step-up's share; the first sentence, the rest folded) on the
  deal page and the shared screen, the key terms, the pipeline row, card
  and CSV and the meeting workbook's price note (`taxAbatementTag`: "Tax
  abated, 4 yrs left, +$450k/yr", "Abatement ended", its own `abatement`
  slot), the memo under its title (`taxAbatementShortLine`), the workbook's
  cover ("The tax abatement"), the report's caveat and the compare table's
  Tax abatement row.
- A note the seller offers to carry (#462): the extraction labels its
  terms as rows of their own, each only as stated — "Seller financing
  amount" (dollars, or the share of the price as stated), "… rate", "…
  term" (from closing), "… amortization" (years or "Interest-only") and
  "… position" where it sits behind new senior debt — never a lender's
  quote and never the seller's existing loan (#417's rows).
  `lib/seller-financing.ts` (pure) reads them and runs the assumption
  card's arithmetic with the note in the seller's loan's place:
  `readAssumption` (lib/tools/loan-assumption) against the model's own new
  loan, through lib/assumable-debt's `modelForAssumption`, only where the
  price buys the building (`assumableApplies`). A share of the price is
  struck on the model's price, or on the stated ask where there is no
  model (`askingPriceOf`), and said. Five rules: the rate is paid for
  somewhere (a below-market note is usually in the price, so it is priced
  by what it is worth against the new loan, never by its rate); the note's
  size sets the cheque (a larger note takes less equity, and its lower
  coverage is said: "Its year-one coverage is 1.16× against the model's
  loan's 1.31×"); a short term is a refinance (whole years at the note's
  rate, then today's); a second is not a first (read, never run against
  the model's loan); a term not stated is named. The card is the
  assumable card itself: `AssumableView.kind` ("assumption" | "seller")
  switches its words ("The seller's note, offered to carry the price",
  `data-qa="seller-note"`) and the report's `AssumableBlock`'s, and the
  equity tile's sub now follows the sign ("a larger loan, a smaller
  cheque") for both. Where it shows: the Financials tab under the
  assumable card (`sellerFinancingView`, plain data through `DealView`'s
  `sellerNote`), the deal context and the challenger (`sellerFinancingNote`:
  SELLER-FINANCING TRAPS (a)–(e) — the price, the balloon, the underlying
  loan, the second, the paper), the key terms, the pipeline row, card and
  CSV's "Seller financing" column and the meeting workbook's price note
  (`sellerFinancingTag`: "Seller financing 5.00%", its own `sellerNote`
  slot), the memo and the shared screen (`sellerFinancingLine`, the terms
  only), the workbook's cover ("The seller's note", `meta.sellerNote`), the
  report beside the grids (`buildReportData`'s twentieth argument) and the
  compare table's Seller financing row.
- What the third-party reports found (#465): the extraction labels each
  finding a memorandum cites as a row of its own, each only as stated —
  "Phase I ESA date", "Phase I ESA findings", "Phase II ESA", "PCA date",
  "PCA immediate repairs" (one dollar total, never per unit or a range),
  "PCA replacement reserves", "Seismic PML" and "Zoning conformance"
  (never the district alone). `lib/site-reports.ts` (pure) reads them
  (`readSiteReports(ex, asOf)`; null where none is cited). A Phase I or II
  row must name the environmental report, so a development's "Phase I
  units" is never one. Five rules: **the seller's reports are the
  seller's** (reliance is the buyer's lender's question); **a Phase I is
  good for a year** (40 CFR 312 / ASTM E1527-21: completed within the year
  before the purchase, its interviews, searches and site visit within 180
  days — `esaAge`: current, update, redo; the date read as early as its
  words allow, a month or a year alone its first day, `reportDate`); **a
  finding is what the words say** (`esaFinding`: a REC, a CREC, an HREC,
  de minimis, none — a denial like "no RECs", "did not identify any RECs",
  "RECs: none" or "RECs were not identified" struck out before the rest is
  read, so "No RECs; one HREC" is the historical one; an exception in the
  denial's own clause is the finding, and the standard's "no evidence of
  RECs … except for the following:" lists RECs, while an "except" in a
  clause of its own is not one; a "no further action" letter is said as
  stated, never as clean); **the immediate repairs are capital at
  closing** (the model's `capitalImprovementsYr1` carries them, extracted,
  where the memorandum states no budget and no PIP; a stated budget or PIP
  is read as including them, never the two added); **a blank is null**
  ("None" repairs is a finding of zero, but a row that states nothing —
  "N/A", "Not stated", "—" — is no row at all, never a clean report; an
  uncited report is absent). A date filed under the report's own name
  ("Phase I ESA": "March 2026") is its date, never its finding. The
  zoning reader strikes "no violations" before it reads, and reads
  "legal, non-conforming" with its comma. Tags, most serious
  first: "Phase I: REC", "PML 24%", "Phase I: CREC", "Non-conforming",
  "Legal non-conforming", "Repairs $630k", "Phase I over a year old".
  `PML_LENDER_PCT` (20) is the line most lenders ask for earthquake
  insurance at. Where it shows: the deal context and the challenger
  (`siteReportsNote`: SITE-REPORT TRAPS (a)–(e) — reliance, the Phase I's
  age and findings, the immediate repairs, the reserves, seismic and
  zoning), `app/site-reports-panel.tsx` (`SiteReportsPanel`, pure: a tile a
  report in the tone of what it found, `data-report`; the Phase I's age on
  a track with the 180-day and one-year marks, `data-bar="esa-age"`,
  `esa-180`, `esa-year`; the PML against 20%, `pml`, `pml-line`; the first
  report's read, the rest folded) on the deal page and the shared screen,
  the key terms, the pipeline row, card and CSV's "Reports" column and the
  meeting workbook's price note (`siteReportsTag`, its own `reports`
  slot), the memo under its title (`siteReportsShortLine`), the workbook's
  cover ("The reports", `meta.siteReports`), the report's caveat
  (`buildReportData`'s twenty-first argument) and the compare table's
  Reports row.
- A price stated as a range (#466): pricing guidance or a whisper —
  "$40,000,000 – $42,000,000", "$40M-$42M", "$40–42M", "$40 to $42
  million", "between $40M and $42M" — is read at its TOP, the end that
  does not flatter a return. `priceRange` in `lib/criteria.ts` reads the
  two ends (the second figure's scale carried to a first written without
  one, where that makes a range at all; a second no larger than the first,
  or more than twice it, is no range: "$42,000,000 – $500,000 credit",
  "– 5.25% cap"), `parsePrice` is the range's top or else `parseMoney`, and
  `priceRangeShort` writes "$40–42M" for a slot that shows one price.
  **Every reader of an asking price goes through `parsePrice`**:
  `askingPriceOf`, the plan (`planSummary`) and its capital budget (a cost
  read as a price is), the plausibility check, the model
  (`deriveUnderwriteInputs`, whose source note says "the top of the
  $40,000,000–$42,000,000 range the OM states, the end that does not
  flatter the returns; enter the price you would pay"), the mandate
  ceiling, the internal comps, the analytics, the market memory, the key
  terms' budget, the comps' subject basis, the portfolio's allocation
  against the ask, the screen diff's price row, the debt sizer's seed, the
  deal page's building price, the letter of intent's prefill, the
  pipeline's sort and price column (the range shown as one) and the
  meeting workbook (the top in the cell, the range in its note). The buy
  box's price band judges a ceiling by the range's top and a floor by its
  bottom, and says the range ("the ask is $40.0M–$42.0M, its top 2%
  over"). `parseMoney` itself still reads a range's first figure: an
  income's unflattering end is its bottom, not its top, so it stays the
  reader of every other figure. The header and the key terms print the
  price row as stated.
- The offering process (#467): the extraction files when offers are due as
  a row, "Offers due", exactly as written (never a tour, questions or
  closing date; "Offers reviewed as received" where so), and the brokers
  the memorandum names to contact as `ExtractionResult.listingTeam` (name,
  title, firm, phone, email, page, each as printed, never looked up; at
  most six). `lib/offering.ts` (pure) reads them. Four rules: **a deadline
  is a day** (`offersDueOf`: a date with its day AND its year is a
  deadline, `iso`; "October 15th" or "October 2026" is shown as written and
  never stored, since a guessed year moves the deadline by a year); **the
  reader's date wins** (`offersDueUpgrade(current, ex)`: the memorandum's
  day fills `deals.offers_due` only where it is empty — the pipeline writes
  it after the extraction, the deal page and the pipeline list write it for
  deals screened before, each with `.is("offers_due", null)` so a date typed
  meanwhile survives, and the list only for rows its deadline read answered
  for); **a broker is as printed** (`listingTeamOf`: a phone links as
  `tel:` only with a North American number's ten digits, `telOf`, an
  extension kept in the words and off the link; an email links only where
  it is one; a page only where the memorandum has it); **a blank is null**.
  Where it shows: the deal header's deadline control (`OffersDueControl`'s
  `fromMemorandum` — an "OM" mark, its page in the title and for a screen
  reader — and `calendarHref`, the deal's `/api/deals/[id]/offers-due.ics`:
  one all-day event with a two-day reminder, the deal's link in it, its UID
  the deal's so a second download updates it, built by `lib/ics.ts`, pure,
  CRLF lines, RFC 5545 text escaping and folding at 75 octets counted in
  bytes), `app/(app)/deals/[id]/listing-team.tsx` (`ListingTeam`, pure:
  "Offered by CBRE", the call for offers as written, time of day and all,
  and a broker a row with an initials badge and the links) under the
  reports, the pipeline's CSV "Broker" column (`PipelineSlots.broker`,
  `brokerageOf`) and the compare table's Broker row. Never on the shared
  screen or in an email: the listing team is the reader's contact list.
- Student housing (#468): the extraction labels a student deal's leasing as
  rows of its own, each only as stated — "Pre-leased" (the share leased for
  the coming academic year, with its term and date as written), "Pre-leased
  last year" (the same point a year earlier), "Beds", "Rent per bed",
  "Distance to campus", "University", "University enrollment", "Parental
  guarantees" and "Lease term" — and `lib/student-housing.ts` (pure) reads
  them (`readStudentHousing`; null unless the class is student housing or a
  pre-leasing row sits beside a count of beds). Five rules: **pre-leasing is
  next year's rent roll** (the model's read, `studentModelLine`: its
  vacancy against the beds still to sign, or "covered" where the building
  has already signed more); **the pace is the comparison** (points against
  last year's same point, from its own row or from the same row only where
  the words say "last year" or "a year ago"; two bare figures are no pace);
  **beds, not units** (the building's price over the beds through
  `buildingPriceOf`, the rent a bed a month as stated, never an annual
  figure); **the walk is the moat** (`campusWalk`: within
  `PEDESTRIAN_MILES`, half a mile, or `PEDESTRIAN_MINUTES`, a ten-minute
  walk, or words placing it on the campus's edge, is pedestrian; read only
  from miles, feet or minutes stated, "close to campus" is no distance);
  **a blank is null**. Where it shows: the deal context and the challenger
  (`studentNote`, beside the class's own STUDENT_TRAPS),
  `app/student-housing-panel.tsx` (`StudentHousingPanel`, pure:
  `data-bar="prelease"` on a track to 100% with `prelease-prior` last
  year's tick and `prelease-model` the model's occupancy dashed, where the
  page has a model; a tile each for the beds, the price and rent a bed, the
  walk and the guarantees, `data-student`) on the deal page and the shared
  screen, the key terms (`studentTermRows`), the pipeline row, card and
  CSV's "Student housing" column and the meeting workbook's price note
  (`studentHousingTag`: "Pre-leased 87%, +5 pts y/y", "Drive-to campus"; a
  pace behind in the warning tone), the memo under its title
  (`studentShortLine`), the workbook's cover ("Student housing",
  `meta.student`), the report's caveat (`buildReportData`'s twenty-second
  argument) and the compare table's Pre-leasing row.
- The basis at a glance (#469): each pipeline card prints the price per
  unit under the price, as a listing card does — `PipelineSlots.basis`,
  `basisTag` in `lib/pipeline-slots.ts`: "$274k/unit", "$200k/key",
  "$100k/bed", "$212/SF". It reads through the comps page's
  `subjectBasis` (lib/comp-detail), so the card and the comps' subject
  tick are one figure: the building's price (a range's top, a share's
  grossed up, none for a note, the land or a share of no stated
  percentage) over the count in the memorandum's own noun (`countNoun`),
  or over the building's area where the class is priced by the foot
  (`assetWords(cls).basis`). None on a conversion or a development, whose
  basis is the all-in cost. `TileStat`'s `sub` draws it under the price
  (`data-qa="tile-sub"`); the list row's price tooltip and the CSV's
  "Basis" column carry it too.
- A manufactured-housing park (#470): the extraction labels a park's
  figures as rows of their own, each only as stated — "Pads" (never with
  the RV sites in it), "Occupied pads", "Lot rent" (the average monthly
  rent in place), "Market lot rent", "Park-owned homes", "Tenant-owned
  homes", "Park-owned home rent" (home and lot together), "Water and
  sewer", "Utility billing", "Age restriction", "RV sites" and "Rent
  control" — and `lib/manufactured-housing.ts` (pure) reads them
  (`readManufacturedHousing`; null unless the class is a park or a lot
  rent sits beside pads or park-owned homes, and null where only the pads
  and the occupancy are stated, which the key terms carry already). Six
  rules: **the lot is the asset** (a park-owned home is occupancy the park
  bought — the share of the pads and "as much as" the share of the
  occupancy, since a vacant one is on a pad too; its rent above its lot's
  is the home's income, "up to" across every one of them); **the gap to
  market is the upside and closes slowly** (a month, a share and a year
  across the occupied pads; a market range read at its LOW end, the
  smaller gap; an in-place range is no average, `monthlyRentOf`); **a
  vacant pad needs a home**; **a private utility is the park's to run**
  (`readUtilities`: the water and the sewer apart, from words that name a
  source — "well maintained" is no well, a negated source is dropped,
  and the park's own wins where the words name both; `billingOf` reads
  who pays, the park's words first so "not billed back" is the park's);
  **an age restriction is a narrower pool, kept by a rule** (a 55+ park
  keeps the Fair Housing Act's exemption only while at least 80% of its
  occupied homes have a resident 55 or older); **a blank is null** ("0" or
  "None" park-owned homes is a stated none, not a blank). The model is
  untouched: `mhModelLine` (`meta.mh.read`) says the gap closed by the sale
  at the model's exit cap and that the model reads no market rent, that it
  capitalises the homes' rent with the lots' at one cap, and that its
  reserve is a default, never a figure for a private system. Where it
  shows: the deal context and the challenger (`mhNote`, beside MH_TRAPS),
  `app/manufactured-housing-panel.tsx` (`ManufacturedHousingPanel`, pure:
  `data-bar="mh-resident"` / `mh-park` the homes on one track of the pads
  with `mh-occupied` today's occupancy dashed, `mh-lot-rent` against
  `mh-market` (a range `mh-market-range`) and `mh-home-rent` the home's
  part above the lot, a tile each `data-mh`) on the deal page and the
  shared screen, the key terms (`mhTermRows`), the pipeline row, card and
  CSV's "Manufactured housing" column and the meeting workbook's price
  note (`manufacturedHousingTag`: "Lot rent $430 vs $525 mkt, Private
  water & sewer", two parts; every part on the compare table's row; a
  private system in the warning tone), the memo under its title
  (`mhShortLine`), the workbook's cover ("The park", `meta.mh`) and the
  report's caveat (`buildReportData`'s twenty-third argument). Two fixes
  ride with it: `unitCountRow` (lib/criteria) counts a park by its pads
  where it states RV sites too, whichever row comes first — every per-pad
  figure divided by the RV sites before — and a park or a build-to-rent
  portfolio wears a drawing of homes as its cover (the `homes` kind in
  lib/deal-cover-art), never the apartment block.
- A self-storage facility (#471): the extraction labels its figures as
  rows of their own, each only as stated — "Physical occupancy" (units),
  "SF occupancy" (area), "Economic occupancy", "In-place rent" and "Street
  rate" (each with its basis and period as written), "Climate-controlled",
  "Tenant insurance", "Management", "Expansion" and "Storage SF per
  capita" — and `lib/self-storage.ts` (pure) reads them
  (`readSelfStorage`; null unless the class is storage, or no class was
  read and a street rate sits beside an in-place rent — an apartment
  memorandum speaks of street rents too, so a deal read as another class
  is never storage by its rows). Six rules: **physical is units, economic
  is rent** (the gap in points is discounts, concessions and delinquency;
  by area it runs lower where small units fill first); **in-place over
  street is the increases' premium, and a move-out gives it back** (the
  premium over the street rate, and the rent with every tenant at street
  as the downside — compared only on one footing: `storageRateOf` reads a
  rate's basis, per SF or per unit, and its period only from its words; a
  monthly and a yearly figure are converted, a per-unit one is never set
  against a per-foot one, and two bare figures compare as stated); **under
  `STABILIZED_UNITS_PCT` (85) by units is a lease-up**; **the platform's
  income is the platform's** (tenant insurance and a manager's brand and
  pricing system are not bought with the building); **supply is as
  stated** (per capita with its radius, never held to a norm the site
  does not read); **a blank is null**. The model is untouched:
  `storageModelLine` (`meta.storage.read`) says the premium's worth in
  year-one rent and at the exit cap, a downside it does not run, and — on
  a lease-up — that its one vacancy is held flat across its years. Where
  it shows: the deal context and the challenger (`storageNote`, beside
  STORAGE_TRAPS), `app/self-storage-panel.tsx` (`SelfStoragePanel`, pure:
  `data-bar="storage-units"` / `storage-area` / `storage-economic` against
  a `storage-stabilized` line at 85%, `storage-inplace` against
  `storage-street` on one scale, a tile each `data-storage`) on the deal
  page and the shared screen, the key terms (`storageTermRows`, only
  where a street rate is stated), the pipeline row, card and CSV's
  "Self-storage" column and the meeting workbook's price note
  (`selfStorageTag`: "Lease-up, 72% occupied", "In-place 21.1% over
  street, Economic 84%"; a lease-up in the warning tone), the memo under
  its title (`storageShortLine`), the workbook's cover ("The facility",
  `meta.storage`), the report's caveat (`buildReportData`'s
  twenty-fourth argument) and the compare table's row.
- Render smoke tests: `lib/deal-view.render.test.ts` and
  `lib/views.render.test.ts` render the signed-in views on fixtures — and the
  shared screen's view (`app/share/[token]/share-view.tsx`; its `page.tsx`
  is only the loader, so keep the markup in the view; the token's
  resolution — the six refusals, then the deal — is `lib/share-resolve.ts`,
  shared with the token-scoped picture and aerial routes
  (`app/api/share/[token]/picture`, `…/aerial`), so never resolve a share
  anywhere else) — and lint
  the visible text with `lib/render-lint.ts` (a digit glued to a word, a word
  doubled, an article the figure after it does not take; `a11yIssues`: an
  image with no alt, a nameless button or link, an unlabelled control, a
  duplicate id; `visibleText` decodes `&amp;` last, so a double-escaped
  entity — the literal `&nbsp;` a reader would see — stays in the text).
  **An article before a value goes through `lib/article.ts`** (`aOrAn`,
  `withArticle`): the figure decides — an 8.0% cap, an 11-story tower, an
  18% return, an 800 SF unit, an $80M loan, and a 1.8% spread, a 1,800-unit
  portfolio — and so does a word's sound (an office, an SFR, a unit). The
  notes' "a 18.0% discount" and the deal context's "a 11.7% yield on
  cost" shipped because a template typed "a" before whatever arrived, and
  the fixtures happened to hold figures that took "a";
  `lib/article.test.ts` scans every source for an article typed before an
  interpolation (`a ${…}`, `a {…}`, `a{" "}<span>{…}`) and holds the lint's
  copy of the rule to the helper's, since `render-lint.ts` loads under
  plain Node from `scripts/lint-pages.mjs` and cannot import it. With
  `VIEW_SHOTS_DIR` set they also
  write each view as a full document with the built stylesheet linked, so
  headless Chromium can open it at 390px — the visual half, run by hand.
  `lib/jsx-whitespace.test.ts` scans every page's source for the JSX shape
  the compiler glues (a leading space after `}` or `>`, a line break, an
  entity); the fix is an explicit `{" "}`. A number followed only by a
  margin-spaced `<span>` is one word to a screen reader — spell the space.
  The public pages get the same lint after every deploy:
  `scripts/lint-pages.mjs` over the HTML live-verify fetches.
  `lib/live-verify-markers.test.ts` holds every round marker that greps
  `/tools` to text that is really in the SERVED html: React's server
  renderer puts `<!-- -->` between adjacent text nodes, so a marker
  grepping prose that spans an interpolated value (`the full
  {EXCHANGE_DAYS} days`) reads NOT DEPLOYED on a page that is perfectly
  fine — and neither the render tests (`renderToStaticMarkup`, no
  separators) nor `visibleText` (strips them) can see it. Grep prose with
  no `{expression}` in it. The other half of a marker's job is being able
  to fail: where the phrase is already on the page before the change (a
  second "Copy as table"), the marker counts the matches through a
  `grep -o … | wc -l` helper instead, and the guard reads `-o` patterns
  alongside `-q` ones so both kinds stay honest. **The same file renders
  `/whats-new`** (its page is synchronous, so `renderToString` gives the
  bytes a curl gets) and holds every grep of `p_whats-new.html` to it: a
  round's marker greps its changelog title, and a title trimmed from the
  log reads NOT DEPLOYED on a site that is fine. It caught four
  diagnostics that had been printing "not yet deployed" on every run
  since September 7's and 8's entries were trimmed; they are gone. When it
  fails on an old round's title, retire that marker. The page draws the
  newest `FULL_NOTES` (100) in full and every older entry as one line of
  its "Earlier improvements" archive (`changelogArchive`, #433): it had
  drawn only the newest hundred, so each new note pushed an old one off
  the page — the card-note guard in `lib/changelog.test.ts` caught a
  tool card's note falling off, and every round would have pushed another.
  `lib/a11y-source.test.ts` scans every page's source for a form control
  with no accessible name (the pages the render tests cannot reach). The
  root layout renders the one skip link (`app/skip-link.tsx`); every page's
  main content is `<main id="main">`, and the lint fails an in-page link
  whose target id is missing. Never crawl a local `next start` while a
  build runs, and never leave one running across a rebuild: an ISR page it
  re-renders overwrites the fresh build's prerender with its stale code.
- The page on paper: `app/globals.css` ends with one `@media print` rule
  setting `print-color-adjust: exact` page-wide, because **every picture on
  this site is a background colour** and browsers drop those when printing
  — "Background graphics" is an UNTICKED checkbox in Chrome's dialog, so
  without it the default print of `/tools` is nineteen cards of empty grey
  tracks. Measured, same page and stylesheet with the rule undone via
  `economy`: 1,995 bytes of backgrounds dropped, against zero with it;
  targeting `[data-bar]` alone recovered only half, since the tracks,
  swatches and card fills are backgrounds too. Everything else a print
  needs is a `print:` utility at its own element — the chrome
  (`app/public-shell.tsx`), the photograph (`app/aerial-img.tsx`, so the
  band keeps its dark scrim and white words without a page of ink), the
  jump index, and `print:break-inside-avoid` on each card so a bar never
  lands on a different sheet from its figure. The exception is the copy
  buttons: `print:hidden` lives inside `CopyButton`'s own base class, not
  at its three call sites, because a copy button is dead ink on paper
  under every circumstance — the per-element version of that rule was
  written once and then missed by both "Copy as table" buttons.
  `lib/print-styles.test.ts` scans for all of it; the byte measurement
  needs a real Chromium and is the by-hand half.
- The documents: the memo and report PDFs are read back as text in their
  tests (`lib/memo/pdf-text-of.ts`, test tooling) — assert on what the page
  says, not on its page count. `lib/key-terms.ts` orders a "Key terms" block
  (memo and shared screen): the deal-defining rows first, then the flagged
  ones. Standard Helvetica is WinAnsi-only (`lib/memo/pdf-text.ts`): no "✓",
  no arrows. The memo's cover picture — the deal's own photograph cut to
  the cover's pixels (`fitCover`), else the aerial (`coverPictureFor`,
  #434) — is fetched at render time, bounded, and its bytes validated
  before embedding (`lib/memo/cover-aerial.ts`):
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
  `lib/cost-card.render.test.ts`. **Beside it, what each feed last
  wrote** (#383): `lib/feed-health.ts` (pure) judges every pull on ITS
  OWN cadence — FRED's daily, weekly, monthly and quarterly series
  apart, the metro series, the BLS rent index, the Census survey,
  Zillow, Realtor.com — from the same cached reads the public pages
  draw, and names the stale series rather than averaging them away; the
  per-metro feeds are judged on `SAMPLE_METRO` (Washington DC, the one
  market every source covers) and the card says so; the states' series
  (#400) on `SAMPLE_STATE` (Pennsylvania, under its `state:PA` market
  id), a row of their own, because they are the last and longest part of
  the pull and a stall there is invisible from the metros' rows. The nightly
  steward's whole-table rule ("no `rates` row newer than five days")
  cannot see a dead monthly pull behind fresh daily rows, and this can;
  a feed with no rows says "no rows", never "current".
  `app/(app)/data-health/feeds-card.tsx` draws it, rendered on the
  runner's fixture in `lib/feeds-card.render.test.ts`.
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
  `assetClassLabel`, the forms' option list — sixteen classes: the four
  the app was born with, then net lease, medical office, mixed-use, SFR /
  BTR, student housing, senior housing, manufactured housing,
  self-storage, hospitality / STR, data center, parking and land) — every
  surface that prints one goes through it, so a stored `self_storage`
  never reaches a page raw; the pipeline row's slots and its "Auto" rule
  are `lib/pipeline-slots.ts` (`shownAssetClass`: a deal filed
  "Auto-detect" shows what the deck turned out to be). **What each class
  is spoken in is `lib/asset-words.ts`** (pure): per class, what one is
  called (`noun` — unit, key, pad, bed, home, space, acre; null for a
  class measured by its area alone), the `basis` its price is quoted on
  (unit / sf / acre) and its `basisLabel`, how its `income` is quoted
  (rent / unit / mo, ADR, rent / SF / yr; null for land), the
  `countLabel` the extraction is asked for ("Keys", "Pads", "Total SF",
  "Acres"), whether it is `residential` (rental housing the rent-control,
  TOPA and just-cause rules can reach — lodging, licensed care and
  commercial are not), whether it is `operating` (land is not: no NOI, no
  cap, no occupancy), the rent-roll `profile` family it leases like and
  the research tables' `researchSector`. `assetClassKey` files a phrase
  the model wrote ("boutique hotel", "NNN retail") by its words —
  self-storage by name first, then refrigerated buildings and outdoor-
  storage yards as industrial, then the bare word "storage"; housing named
  by its program or tenants ("Affordable Housing (LIHTC)") as multifamily
  after every other rule (#479: the bare word had filed a cold-storage
  warehouse as self-storage). **A deal has one class**: every reader goes
  through `shownAssetClass` (the analyst's class where they filed one, the
  deck's where they left Auto) — the market check, the deal page's
  since-this-screen, demand and portfolio cards and the shared screen had
  read the deck's word first while the header read the analyst's;
  `countNoun` reads a count row's OWN noun ahead of the class's, because
  the OM's word wins wherever the screen read one. The survey that
  bought the table (2026-09-22) found the deal header printing
  "Self_storage", a hotel's keys relabelled "units", a development's
  land cost labelled "Price" beside a cap it should not have, the Excel
  cover saying "auto", rent-control rules run against offices and
  hotels, and the challenger grilling every class about loss-to-lease.
  Every one of those reads the table now: the deal page's header and
  Size / Price / Going-in-cap-or-Yield-on-cost slots, the memo and the
  report, the workbook's cover and the model's per-class defaults
  (`CLASS_DEFAULTS` in `lib/underwrite/inputs.ts`, every class), the
  comp and market memories' basis (`/key`, `/pad`, per SF for storage,
  none for land), the plausibility band (per-unit for a unit-basis
  class, per-SF otherwise; a data center held to its floor only, since
  its price is its power, and an outdoor-storage yard to no per-SF band,
  since it trades by the acre), the rules panel (`buildSubject`'s
  `residential` — an office is commercial property to the regimes, and a
  class nothing has read yet keeps their questions open), the rent-roll
  profile default, the manual deal form's labels and metrics ("Keys",
  "Price per key" — `METRIC_FIND.perUnit` reads key / pad / bed / home /
  space / room), the plan's "Basis per key (all-in)" on the deal page,
  the shared screen and the report, and the prompts: the class is named
  as a page names it with its noun, basis and income, the extraction asks
  for the count under the OM's own noun, the verdict's ranges are asked
  for in the class's terms, and the challenger keeps the two traps every
  property shares (the tax reset, the legacy insurance premium) and
  appends each class's OWN list — RevPAR's two levers and the fee stack
  on a hotel, street rate against in-place on storage, pad rent against
  home rent on a park, the entitlement odds and the carry on land, dark
  value on a net lease — with "auto" carrying every list once, gated on
  what the deck turns out to be. `lib/asset-words.test.ts` holds the
  table to the label map's keys and every class to a noun, a basis and a
  rules verdict; the manual-deal and internal-comps tests pin a hotel's
  "$200k/key" and a park's "$60k/pad". The second round (#372) put the
  rest on the table: the buy box's basis check is "Basis / key" on a
  hotel (the mandate's own field stays "per unit" — a box spans classes)
  and its class list is the whole label map; the workbook's per-unit rows
  read "Price / Key" and "Year-1 Rent / Pad / Month" off `meta.unitNoun`
  while the named range stays `UnitsCount`; the comps page's and the
  report's bar captions carry `BasisScale.noun`; and each new class asks
  its own facts in `SECTOR_FIELDS` (a net lease's credit and bumps, an
  MOB's campus, a data center's committed megawatts). The third round
  (#373) took the model's area placeholder: a deal that states a count
  and no area runs on the count times the class's typical size
  (`CLASS_DEFAULTS[cls].sfPerUnit` — 850 for an apartment, 550 a key,
  350 a bed, none for a park's pads or for a class an OM always states
  the area of), marked "248 units × 850 SF typical — enter the rentable
  SF" in the workbook's Sources column, and only a deal with no count at
  all falls to the flat 100,000 SF, because a per-SF figure struck on
  100,000 SF for a 40-unit building is a made-up number wearing a decimal
  point. The fourth round (#375) took the buy box's size band, which was
  square feet only: `unitsMin` / `unitsMax` beside `sfMin` / `sfMax`,
  checked as its own row in the deal's noun (`countNoun` — "Keys" on a
  hotel, "Pads" on a park, the OM's own count label first) and folded
  into the fit score's ONE `size` dimension (a miss on either band is a
  miss, a near-miss on either is partial with the smaller credit, a band
  with no figure is left out, so a counted building that states no area
  is scored on its count rather than parked on the blank). The count
  reader (`isCountLabel`, `parseCount`, `unitCountRow`,
  `unitCountFromMetrics`) moved beside the size reader in
  `lib/criteria.ts`, and `lib/deal-strategy.ts` re-exports it under the
  names every surface imports — the buy box reads it, and `lib/criteria`
  cannot import from `lib/deal-strategy`.
- A market's photograph: `lib/skyline.ts` (pure — one verified Wikimedia
  Commons file per metro with its photographer and licence, plus
  `commonsUrl` / `creditLine`). **Every credit carries what the licence
  asks** (2026-09-30, CC BY-SA 4.0 §3(a)(1)): the photographer linked to
  the file's page on Commons, the licence linked to its text, and
  "cropped to fit", since every surface crops (`skylineCredit`,
  `galleryCreditParts`; `app/photo-credit.tsx` draws them with their
  links in `creditLine`'s and `galleryCredit`'s own words, and
  `lib/photo-credit.test.ts` holds the two to each other). A pipeline
  card, itself a link, keeps its corner text, and the page carries one
  linked line under the cards. Served by `app/api/imagery/skyline/[id]`
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
  least. It caught exactly that on 2026-09-30 (#449): USGS's export ran
  past the route's 10-second timeout on two runs in a row, a day after
  answering in time, so Montgomery County showed no picture at all. The
  overhead is fetched through `lib/metro-overhead` now as the skyline is:
  held per process by frame (count- and byte-bounded), one fetch per frame
  at a time however many visitors ask, a failure kept by nobody, and
  `OVERHEAD_TIMEOUT_MS` 20 seconds. Prefer those steps' lines over a round marker:
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
  never asked for. A fifth, the same shape: a 429 from Commons printed
  `DEAD` too, and on the 2026-09-24 run Indianapolis's and Kansas City's
  served files read DEAD while the visitor's check beneath showed both
  loading — a rate limit is `BUSY` now (the thumbnail read is paced like
  the API's, a busy file is asked again once after a pause at the end of
  the sweep, and the summary counts it apart: "N not checked"), never a
  verdict on the file. **A photographer's name is not necessarily Latin-1**:
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
  **A metro area the site reads no figures for** (#472) is a row too,
  keyed by its Census code (`areaSkylineId`: `cbsa:41940`) with the name
  its card shows (`SkylineShot.name`, "San Jose, CA"), reached through the
  county the deal is placed in (`marketPictureFor`'s `county`, after the
  market the site reads, never instead of it); the table's test holds such a
  row to a real metro area in the delineation, to a name, and to not being
  one the site reads. Its candidates are in the same file under the same
  id, and the sheet's folder takes the id with the colon replaced.
  Twenty-one are served (2026-09-30: Albuquerque, Birmingham, Boise,
  Bridgeport, Buffalo, Charleston, Des Moines, Grand Rapids, Greenville,
  Hartford, Honolulu, Knoxville, Louisville, Memphis, Milwaukee, New
  Orleans, Oklahoma City, Omaha, Providence, Tucson, Tulsa), each judged
  through the card's 16:10 and the deal page's 21:9 crops — never the 4:1
  band, which a `cbsa:` row never draws; San Jose, Fresno and Madison had
  nothing usable and keep the aerial, and Birmingham's first search read
  Birmingham, England's categories (its entry names Alabama's now).
  Milwaukee's and Greenville's credits are the author Commons names, where
  each filename names another (the owner was told). The route
  decodes the key itself (the cards ask for it percent-encoded, and no key
  holds a "%"), and live-verify's PHOTOGRAPHS step reads the quoted keys
  too.
  Montgomery County
  is deliberately absent: a suburban submarket has no skyline, and the
  overhead is the more honest picture of a place shaped by its land — the
  one search run for it so far surfaced a high-altitude aerial of Bethesda
  and a category of berries and blue jays. **NoVA and PG County are the
  exceptions**: Rosslyn is a real high-rise cluster, zoned tall because it
  stands across the Potomac from a height-limited Washington (added
  2026-09-16), and National Harbor's Capital Wheel on the river is the
  picture Prince George's County is actually known by (added 2026-09-21).
  The rule is the photograph a place is known by, not a skyline for its
  own sake. **A photograph is chosen BY EYE, from a contact sheet**
  (2026-09-21): the probe's search prints a file's name, author and size,
  and none of that says whether it is any good, so
  `scripts/probe-skylines.mjs --search --thumbs=<dir>` saves 640px copies
  of every usable candidate (the market's current choice first, for
  comparison) with `index.json` and a README naming each file's author
  and licence, and `skyline-sheet.yml` pushes that directory to its own
  branch, `skyline-sheet` — force-pushed each run, never merged — which
  the sandbox CAN fetch (`git fetch origin skyline-sheet`, `git archive`
  into the scratchpad) and look at with the Read tool. Six markets at a
  time keeps a run inside the search's budget. What the first sheet
  changed: Washington's overhead of the Mall became the Lincoln Memorial
  from Arlington at ground level, Richmond's 1600px file became a
  5424px one, and PG County got the wheel; Baltimore's harbour panorama
  and Rosslyn from Georgetown were kept over their alternatives (a sunset
  drone shot of Fell's Point, an oblique aerial of Rosslyn's towers —
  handsome, and aerials). The second sheet showed that Norfolk's file
  was a street corner at dusk — a hotel and a garage — and swapped it for
  the same photographer's daytime waterfront from the Elizabeth River.
  The third gave Los Angeles its downtown against the snow on the San
  Gabriels over a tight tower cluster that could have been any city, and
  kept San Francisco, Seattle, Miami and Atlanta. Dallas took a fourth,
  ONE-MARKET run: the probe shares a check budget across the markets
  asked for (`CHECK_BUDGET`, nine a market on a full sweep, thirty-six
  for one), because the two-market run had checked nine names, found
  seven too small, and never opened the search door — which opens only
  when the first two doors gathered fewer than the budget. Thirty-six
  deep, the Downtown Dallas article's own lead was the dusk skyline with
  the green-lit Bank of America Plaza, a JPEG; the city article's lead
  was a 6000px PNG, and a PNG photograph at 1600px is megabytes where a
  JPEG is hundreds of kilobytes (the probe measured it: 3,110 KB
  against the JPEG's 736 KB), so it stays a candidate the probe weighs
  and is never served. A one-market run is how to look harder. The fifth
  sheet (five markets, 2026-09-22) kept Philadelphia, Jersey City, New
  York and Boston on their current files — each was the strongest frame
  on its own sheet — and showed Chicago's to be the weakest of the five,
  a soft daytime strip 795px tall; the sixth, a Chicago-only run
  (35792083388), opened the search door and found NorbertNagel's sunrise
  frame from the lakefront, 4000px and the band's own 2.4:1 shape, which
  now serves. **The twenty-six metro areas read without a brief** (#407)
  took five six-market sheets (runs 35943054619, 35943350787,
  35943520435, 35943694349, 35943831078) and a one-market run each for
  the six whose sheet held nothing (Phoenix 35944782635, Charlotte
  35944863842, San Diego 35944937703, Orlando 35944984991, Indianapolis
  35945058692, Riverside 35945179705) — every file's comment in
  `lib/skyline.ts` names its run, and **every candidate was judged
  through the band's own crop, not the thumbnail**: a scratchpad script
  (sharp) crops each file as `object-cover` at 50% / 42% to 1064×336 and
  302×240 and paints the caption scrim over it, because a 1.5:1 frame
  that looks superb on a contact sheet loses its tallest tower's top in
  a 4:1 band. That is how Cleveland's sunrise panorama, gorgeous on the
  sheet, lost to the Lakewood Park frame whose towers stand above the
  words. Riverside has no skyline and keeps a real view from Box Springs
  Mountain rather than an overhead; Salt Lake City's city sits at the
  foot of its frame under the Wasatch, and its own one-market run
  (35945126660) found nothing better.
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
- What each layer of that stack costs: `lib/tools/capital-stack.ts` (pure —
  the mezzanine and preferred that sit between `sizeLoan`'s senior and
  `runWaterfall`'s common equity). Five rules, and collapsing any of them
  flatters the deal. **Leverage is tested at the MARGIN, never on the
  blend**: a layer helps only if its own rate is below the unlevered yield
  on cost, and a large cheap senior drags the average under that yield
  while the layers above it destroy equity value — the seeded stack is
  exactly that case (6.13% blended against 6.5%, with both upper layers
  dilutive), and `blendHidesIt` names it. **Amortisation is a transfer,
  not a cost** — test on the RATE, size coverage on the CONSTANT; a 5%
  senior over 25 years has a constant above a 6.5% yield, and judging it
  there rejects a plainly accretive loan. **An accruing preferred flatters
  the current return**: it takes no cash, so it lifts cash-on-cash by
  shrinking the denominator — on the seeded deal the stack takes $900,000
  a year out and cash-on-cash still RISES 6.59% → 7.89%, which is why
  `cashOnCashSeniorOnlyPct` is drawn beside it. **Compounding is its own
  cost** (`accrualCost`, $1,080,465 over five years — the accrual less the
  same rate paid current). And **three coverage ratios, not one**: the
  senior's DSCR, combined DSCR with the mezzanine (1.68× → 1.36×, the
  ratio that decides who can take the property), and fixed-charge coverage
  once a current-pay preferred is counted. Equity is the plug here too,
  and an oversized stack reports negative common equity rather than zero.
  The card's marker on the bars is `data-bar="layer"` — `data-bar="stack"`
  belongs to sources-and-uses, and its own count test caught the collision.
- Today's rates, and which may become a number in a box: `lib/live-rates.ts`
  (pure — the FRED series the weekday cron writes, each figure's age, its
  move since the observation before in its own unit, its recent path, the
  shape of the curve, and the two rules) with `lib/live-rates-read.ts`
  (the `server-only` read) and `app/rates-strip.tsx` (the pure strip — at
  the app root beside `place-band.tsx` because `/tools` and `/market` both
  draw it). **The series list is `data/fred-series.json` and nowhere
  else**: the cron script and the module both import it, so the two cannot
  disagree about what a series is, and `readSeriesTable` REFUSES a
  malformed entry rather than skipping it (a skipped entry is a series the
  cron keeps writing and the page silently stops showing). Fifty-three
  series in seven groups: the whole Treasury curve (eleven tenors, the
  breakeven, the real yield), the money market (SOFR, its 30-day average,
  fed funds, prime), credit spreads, mortgage and bank lending (the two
  PMMS surveys, bank CRE loans y/y, delinquency, the three SLOOS
  standards series, and — #410 — commercial property prices against a
  year ago, `BOGZ1FL010000386Q`, the Fed's Financial Accounts, the one
  free current CRE price figure: the BIS series FRED also carries stopped
  at 2025 Q2 and the private indexes are licensed; the probe now prints a
  candidate's notes and a terms line, and caught Case-Shiller's
  copyright where this series names none), inflation and cost (CPI, core, rent, OER, the five
  lessor rent indexes — #390: the BLS producer price indexes for the
  rents lessors of nonresidential buildings charge, by the building let —
  office, retail, industrial, self-storage operators and the aggregate,
  each year over year; a commercial deal's one rent figure of its own
  kind, national and said so, read by `rentIndexFor` in
  `lib/live-market-brief.ts` for the market check's brief and the
  model's rent check, and drawn under each commercial sector's tracker
  fundamentals on `/market` by `app/market/lessor-rent-line.tsx`
  (`LessorRentLine`, pure — #392 — the nation's figure, said so, with
  the series linked); probe run 35917247236 printed the ids, dry run
  35917848391 the transformed figures the fixture holds — core PCE,
  three construction PPIs, construction wages, nonres spending), jobs and
  output, and the supply pipeline (starts, permits and completions in 5+
  unit buildings, total starts, rental vacancy). **Every id was verified
  from the runner, never from memory**: the sandbox cannot reach FRED, so
  the workflow's `dry_run` input fetches each series' own title beside its
  id and writes nothing, and a series goes into the JSON only once a dry
  run has printed it — the first list paid for the rule at once, because
  `DRTSCLCC`, remembered as the old CRE-standards series, is "Net
  Percentage of Domestic Banks Tightening Standards for CREDIT CARD
  Loans". **An index never reaches the page as a level**: the cron asks
  FRED for its own percent-change-from-a-year-ago transform (`units:
  pc1`) and stores it under a `_YOY` id, so nobody reads 3.4 as an index
  level, and the module refuses a transformed series stored under FRED's
  own id. **What a figure IS is a property of the series** (`unit`): a
  rate is a percent and moves in bps, a spread is quoted by ICE in percent
  points and shown as bps, a share or a change (CPI y/y, the net share of
  banks tightening — negative when they are EASING, and shown signed) is a
  percent that moves in points, and a count of housing units moves in
  percent. **A benchmark is not a quote.** Only a rate a loan document
  NAMES may pre-fill a field (`contractRate`): the Treasury tenors, SOFR
  and its 30-day average, prime. The 30-year mortgage survey looks
  seedable and is not: it is an owner-occupier RESIDENTIAL rate, which is
  why `lib/leverage.ts` already treats it as a one-sided floor rather than
  a price, so it is shown and never seeded. The prepayment card is seeded
  from `treasuryForTerm` — the tenor NEAREST the remaining term, which is
  what a yield-maintenance clause names (the 2-year on the worked example,
  27 bps under the 10-year the strip leads with, and so a larger penalty;
  a tie breaks toward the shorter tenor for the same reason) — and the
  strip marks exactly the tiles that fill a field, from the page's own
  list. And **stale is per series, because the cadence is**: a monthly
  index is dated the FIRST of its month and published two to eight weeks
  after that month ends (core PCE was 82 days old and current on the day
  this shipped — a 80-day threshold, written here first, would have marked
  it dead), and a quarterly observation is dated the quarter's FIRST day
  and published about two months after that quarter ENDS, so the April
  figure is the newest one available until late November and is eight
  months old while current — a one-quarter threshold reports a working
  feed as broken, while a five-day one marks half the table permanently
  dead. **The picture is the curve** (`yieldCurve`): every fresh tenor,
  today solid and a week earlier dashed, with the 10-yr-less-2-yr slope
  taken from the DRAWN points and never from FRED's own `T10Y2Y`, which
  posts a day apart from the tenors and would put two slopes on one card;
  a stale tenor is left off rather than drawn, and under four points there
  is no curve. Each tile draws its recent path (`HISTORY_ROWS` per series,
  the table's own number, so the read returns exactly what the cron
  backfilled), and the groups past the curve and the money market fold
  into `<details>` whose summary line already carries the headline
  figures. Two more traps, both paid for: migration 0023 grants `select`
  on `rates` `to authenticated`, so a PUBLIC page reads it with the
  service role (a migration would be inert until the operator ran it, and
  FRED data is public anyway); and the read is ONE QUERY PER SERIES,
  because a single `order by obs_date desc limit N` silently drops the
  quarterly series once the daily ones have filed a few months of rows.
  A third (#399's second commit): **the cached read is keyed by the list
  of series ids it is asked for** (`cachedSeriesRows` in
  `lib/live-rates-read.ts`, one function behind `liveRates`,
  `liveMetroRates` and `liveMetricRates`), so a series added to the
  table is a different cache entry and is read the day it arrives —
  keyed by the metro alone, the entry a build made before the pull wrote
  the single-family permits served the old rows for an hour, and the
  demo drew the demand bars and no supply line while the market page, on
  another entry, drew both; nothing on either page said so.
  A stale figure still SHOWS with its date — a dead feed is worth seeing —
  it just stops seeding, because a date beside a figure is read and a
  figure inside a form field is not. `/market` had its own copy of this
  strip and its own copy of the bug: it read through the REQUEST-scoped
  client, so a signed-in visitor saw the live rates and everyone else
  silently got a checked-in PMMS snapshot, with nothing on the page saying
  which. Both pages go through this one now. The fixture every test draws
  the strip on (`lib/live-rates.fixture.ts`) is the runner's own dry-run
  output, figure for figure. Cap rates have NO free daily source (CBRE,
  Green Street and RCA are all licensed), so they stay dated, sourced
  research in `data/research/` and the page says so. **Each covered
  metro's own figures** are the same table's `metroSeries` (`metro`,
  `metric`: unemployment / jobs_yoy / permits / hpi_yoy, `area` — what
  FRED's title calls the place), read by `readMetroRates` and drawn by
  `app/market/metro-live.tsx` (`MetroLive`, pure) under the market brief,
  cached per metro in `liveMetroRates`. Four rules. **A metro's permits
  arrive as one month's count, not seasonally adjusted**, so a month is
  mostly the season: `permitsTrailingYear` sums twelve and sets them
  against the twelve before, and answers null for a partial year rather
  than scaling it (a `units` unit — a plain count, moving in percent —
  beside `count`, which is the national thousands at an annual rate).
  **Borrowed is said**: a suburb has its own unemployment rate and nothing
  else at this cadence, so `metroAliases` names the MSA whose figures fill
  the metrics it lacks, metric by metric (`metroSeriesFor`), and a
  borrowed series keeps the MSA's `metro` and `area` so the tile wears
  the MSA's name — passing an MSA figure off as a county's flatters
  whichever county is weaker. Newark borrows New York's jobs and keeps its
  own house prices. **A metro's monthly figure lags two months** (July's
  unemployment publishes in early September and is the newest until
  October, ninety-odd days old and current), so metro monthly `freshDays`
  is 110. And **a stopped series is left out, not shown stale**: FRED's
  Washington and Atlanta MSA house price series end at 2024 Q4 under the
  new delineations, so neither has an `hpi_yoy` tile; the divisions
  (Philadelphia, Newark, New York, Boston, Chicago, Los Angeles, San
  Francisco, Seattle, Miami, Dallas) and the smaller MSAs are current.
  Three probes bought the table: `RICH951` does not exist (Richmond is
  `RICH051`), Boston's `BOST625URN` is the DISCONTINUED NECTA series (the
  MSA's is the BLS-shaped `LAUMT251446000000003`, its payrolls
  `SMS25144600000000001`), Los Angeles's `LOSA106NA` stopped in 2014 (the
  MSA's payrolls are `SMS06310800000000001`), and an un-paced probe of
  eighty ids collected 429s from the sixtieth onward that printed as
  "series does not exist" — the workflow's `probe_ids` and
  `probe_search` inputs are how a candidate is checked before it is
  trusted, and the pace is 350 ms with one retry after a 429. One more
  the full dry run bought: FRED REFUSES ITS OWN `pc1` TRANSFORM on
  Boston's payrolls ("units is not one of: ch1, chg, lin"), so that one
  series is stored as the LEVEL under FRED's own id with `derived:
  "yoy"`, and `yearOverYear` works the change out on read — each month
  against the same month a year earlier, never the nearest, and a point
  with no partner a year back is dropped rather than compared to
  whatever is closest. The validator holds a derived series to the
  level's own id and no transform, for the same reason a transformed one
  must carry a `_YOY` id: the table row is what it says it is.
  **The fifth metric is the rent index** (`rent_cpi_yoy`): the CPI's rent
  of primary residence against a year ago — what SITTING tenants pay
  across the area's leases, where the asking rent above it on the page is
  this month's new ones; an underwrite needs both, since a rent roll
  grows at the first and a vacant unit re-lets at the second. **FRED
  carries it for eight metros under the BLS's PRE-2018 area codes** (New
  York is `CUURA101SEHA`, San Francisco `CUURA422SEHA` — found by FRED's
  own search from the runner, because the S-coded ids memory offers,
  `CUURS35ASEHA` and its kin, all answer "does not exist" there), **and
  not at all for the areas the BLS redrew in 2018**: Washington,
  Baltimore and Los Angeles have only DISCONTINUED pre-2018 series on
  FRED, so those three come from the BLS's own API (`source: "bls"` in
  the table; one POST a run to `api.bls.gov`, inside the unregistered
  allowance; `BLS_API_KEY` is optional and adds the catalog so a dry run
  prints the title). Their area codes were pinned from FRED's
  average-price series for the same places (`APUS35A…` is
  Washington-Arlington-Alexandria, `APUS35E…` Baltimore, `APUS49A…` Los
  Angeles), and the rates workflow's `probe_bls` input prints a BLS id's
  newest observation before it is trusted. A BLS series is stored under
  its BLS id as the level with `derived: "yoy"` — FRED's transforms
  cannot apply to a series FRED does not have — and the eight FRED copies
  are stored the same way so the twelve read alike. `seriesUrl` links a
  tile to whichever source publishes it, the tile's link says "· BLS",
  the panel's heading reads "Live from FRED and the BLS", and the note
  says where the figure came from: a figure is never credited to a
  source that does not publish it. Richmond and Hampton Roads have no
  CPI area and a region's figure is not a metro's, so their tile is
  absent rather than borrowed.
  **The seventh metric is the metro area's own rental vacancy** (#378,
  `rental_vacancy_msa`), from the Housing Vacancy Survey's 75-largest-MSA
  tables, which the Census Bureau publishes as .xlsx and nothing else
  (FRED carries only the four regions): `scripts/fetch-hvs.mjs` reads
  the current year's table and the eleven-year history with exceljs on a
  quarterly cron (`hvs.yml`, the 6th of Feb / May / Aug / Nov), after
  `probe-url.mjs` printed both workbooks' shape from the runner (run
  35794270430 — a header block naming each quarter with "Margin of Error"
  beside it, the area names padded with dot leaders and carrying footnote
  digits, a few spelt differently between the two tables: "Dallas-Fort
  Worth" against "Dallas-Ft. Worth", the Virginia Beach area retitled).
  Three rules. **The year and the quarter columns are read from each
  header row**, never assumed, so a block's rows are dated by the header
  above them. **An area is matched by a name PREFIX** (`census` on the
  entry, `source: census`), kept short of where the spellings diverge,
  and the dry run prints the row each metro matched — a wrong prefix is a
  loud "no row", never a silent figure for another city. And **the
  margin of error is stored**, in a companion series named by `moe`
  (`HVS_RVR_<cbsa>_MOE`, read beside its figure for the SAME date —
  `LiveRate.moe`), because a sample's quarterly figure for one metro is
  wide (Richmond's ±5 points on a 7% rate) and a figure shown without it
  reads as more than it is: the tile prints "±2.2 pts margin of error"
  under the move, the link says "· Census" and goes to the survey's
  page (`HVS_RATES_URL`), the heading reads "Live from FRED, the BLS and
  the Census Bureau", and the note says a quarter's move inside the
  margin is noise. The region's tile stays beside it as the steadier
  figure, so the two vacancy metrics keep different names and
  `metroSeriesFor` shows both; a suburb borrows the MSA's and wears its
  name. A companion is nobody's series: `readSeriesTable` refuses a
  `moe` id that is also a series, and the server read fetches it with
  its figure (one index scan a series still). It came after the region's
  (below, #374), which is why the numbering runs the other way from the
  order on the page. **The sixth metric is the region's rental
  vacancy** (`rental_vacancy`): the Census Bureau's Housing Vacancy
  Survey publishes it for the four Census regions and never for a metro,
  so it is the one figure every metro BORROWS from its region — filed in
  `regionSeries` under the REGION's id (northeast / midwest / south /
  west, never a covered metro's, so the metro test's "every series is a
  covered metro's" holds), mapped by `metroRegions`, appended last by
  `metroSeriesFor` and named on the tile ("Rental vacancy · South Census
  region") with the note saying the survey's grain; the "the metro
  area's" sentence is about MSA borrowing and leaves the region out. The
  four ids were printed from the runner before they were trusted (rates
  run 35790692228: "Rental Vacancy Rate in the South Census Region",
  quarterly, percent, newest 2026-04-01 — the South at 9.5% against the
  West's 5.3%). It contradicts the rent-index rule above on its face
  ("a region's figure is not a metro's"): the difference is that the rent
  index HAS metro figures for most metros, so a region's would be passing
  as one, where the vacancy rate has none at any finer grain and is said
  to be the region's. That probe run also bought the job cap: the run
  before it sat ten minutes on a two-minute step, and `timeout-minutes`
  on the three pull workflows now ends a stall instead of holding a
  runner for six hours.
  **Payrolls by sector** (#393, five metrics: `jobs_pbs_yoy`,
  `jobs_eduhealth_yoy`, `jobs_transport_yoy`, `jobs_retail_yoy`,
  `jobs_leisure_yoy` — `SECTOR_JOBS_METRICS`): the BLS's supersector
  employment for each MSA, each FRED's own change from a year ago, five
  a metro for all fourteen, seventy series. All payrolls is what rental
  housing reads; a commercial deal reads the ONE sector that fills its
  kind of building — `sectorJobsFor` in `lib/live-market-brief.ts`:
  professional and business services for an office, education and
  health for a medical office or senior housing, transportation,
  warehousing and utilities for a warehouse, retail trade for a store,
  leisure and hospitality for a hotel; a net lease (whose tenant may be
  a store or a depot), a data centre, storage, parking and land read
  none, because a sector picked for them would be a guess wearing a
  figure — and the brief carries that one line (figure key
  `sector_jobs_yoy`, one key so a later screen compares the same
  sector) after the jobs line, with the prompt naming it as what a
  lease-up or absorption claim is checked against. On `/market` the five
  are ONE picture under the metro's tiles, never five more tiles
  (`SectorJobsPicture` in `app/market/metro-live.tsx`: signed bars from
  a centre line beside all payrolls, each figure linked, a stale sector
  named rather than dropped; `data-bar="sectorjobs"`), and each
  commercial sector's own line under its fundamentals
  (`app/market/sector-jobs-line.tsx`, the same map). **Every id was
  printed by the runner** (probes 35920921683, 35920930790 and
  35921989451): FRED's short ids carry three sectors for twelve metros
  (`WASH911PBSV`, `…EDUH`, `…LEIH`), retail trade and transportation
  exist only under the BLS-shaped `SMU…SA` ids
  (`SMU11479004200000001SA`), Los Angeles has all five in that form and
  no short ids, Boston's exist only NOT seasonally adjusted
  (`SMU25144606000000001`, no suffix — the `SA` and `SMS` forms both
  "do not exist"), and the `SMS` form exists for no supersector
  anywhere. The dry run on the branch (35922719610) then found FRED
  REFUSES its own transform on three of Boston's five ("Value of units
  is not one of: ch1, chg, lin", the refusal Boston's total nonfarm
  already had) while accepting it on the other two, so those three are
  stored as the level under FRED's own id with `derived: "yoy"` and the
  page works the change out on read — which is why a series goes in only
  after a dry run has printed it, not after a probe has. Two rules the
  probes bought: FRED's limit is per KEY, so a
  probe dispatched beside the weekday pull cost the pull two series and
  three probes dispatched together lost each other one apiece (run them
  one after another, never beside the pull), and the pace is 520 ms now
  the table passes two hundred series. **The sector page ranks the
  markets by the same figure** (the second commit of #393, `app/market/sector-jobs-rank.tsx`,
  `SectorJobsRank`, pure): under the vacancy leaderboard, the covered
  markets ranked by their payrolls in the sector that fills that kind of
  building (`sectorPayrollMetric` — the sector's own metric, all
  payrolls on the apartment page, none for a page no count speaks to),
  fastest first, signed bars, a suburb reading its MSA's series and
  saying so (two suburbs of one MSA share a bar, which is the truth), a
  market with no fresh figure listed unranked with the reason. It is a
  second ranking and named as one: the table says where the space is
  tight, this where the demand for it is growing, and the two need not
  agree. The read is `liveMetricRates` in `lib/live-rates-read.ts` — ONE
  metric across the metros (`metricSeries`, `readMetricRates`), cached
  per metric — never every metro's whole panel for one figure apiece.
  **And the whole board over the demand side** (#393's third commit,
  `app/market/sector-jobs-board.tsx`, `SectorJobsBoard`, pure): under
  the vacancy board on `/market`, every metro area × all payrolls and
  the five sectors, each against a year ago, shaded within its column
  fastest first by the one shade both boards use (`heatShade` in
  `app/market/heat-shade.ts`, so office-using jobs compare to
  office-using jobs); rows are the metro areas with series of their own
  (a suburb reads its MSA's row, said in the note, rather than one figure
  printed under three names); a stale cell keeps its figure and date,
  dashed and unranked; a series FRED does not carry is a dash. Six cached
  reads (`BOARD_METRICS` through `liveMetricRates`), and a failed read
  leaves the board out rather than half-drawn. **The metro areas read
  without a brief are rows too** (#403): the page appends `DATA_METROS`
  after the briefed markets under one heading, "Read without a brief",
  with `briefed: false`, and the board ranks them in the same columns —
  Phoenix's office-using jobs against Washington's is the comparison the
  board exists for — while leaving the name unlinked (no market page
  behind it) and saying in its note what the block is. The rank picture
  under each sector's leaderboard stays paired with the leaderboard's own
  markets, since the two rankings are of the same list by design. **And
  each has a market page** (#404, `app/market/read-only-metro.tsx`,
  `ReadOnlyMetroView`, pure): `/market?metro=pittsburgh` opens on the
  place (`METRO_VIEWS` carries each one's business district, checked by
  eye on the deploy, never assumed — `lib/metro-imagery.test.ts` holds
  the table to both lists), says in one string what the page is and is
  not, and draws exactly what the site holds — Zillow's asking rents with
  no fair market rent beside them, Realtor.com's for-sale market, the
  metro's own tiles with the demand and supply pictures — through the
  same components a briefed market's page uses, and nothing else: no
  research note, sector snapshot, comps line or rules. The explorer's
  chip rows are `MetroChips`, shared by both page bodies, with the
  twenty-six folded under "Read without a brief" (open where one is the
  page), because a row of twenty-six chips is a wall rather than a
  directory. Live-verify fetches Pittsburgh's page (`p_market_pitt.html`)
  and greps the note; the fold's line is grepped on `/market` itself.
  **The one vacancy figure every metro has on the same basis is a board
  too** (#405, `app/market/survey-vacancy-board.tsx`,
  `SurveyVacancyBoard`, pure, under the payroll board): the survey's
  rental vacancy for all forty metro areas — briefed and read without a
  brief alike — ranked tightest first, each bar carrying the survey's own
  margin as a whisker (`LiveRate.moe`, the companion the read fetches
  beside the figure), the national rate (`RRVRUSQ156N`, off the strip's
  read) as a thin line, a stale row named after the ranked ones, and the
  note saying the one thing the picture must not let a reader forget:
  two metro areas whose whiskers overlap are not ordered by the survey,
  whatever the ranking says. The tracker figures on the sector pages
  are a different measure and the note says that too. One cached read
  (`liveMetricRates("rental_vacancy_msa")`) plus `liveRates()`; a
  suburb has no series of its own and is not a row; `data-bar="surveyvac"`.
  **And the rents** (#408, `app/market/rent-board.tsx`, `RentBoard`,
  pure, under it): Zillow's apartment asking rent against a year ago for
  every metro area the site reads, ranked fastest first with signed bars
  from a centre line and the typical home's price in years of the
  all-homes rent beside each; a suburb shares its MSA's row (`shared`)
  and is not listed twice; a metro with no apartment row this month is
  listed after with its all-homes change, never ranked on a different
  measure; Zillow's credit is in the note. ONE query for every metro's
  rows (`fetchBenchRowsFor` in `lib/live-rates-query.ts`, `.in("metro",
  names)`; `liveZoriAll` in `lib/zori-read.ts`, cached under the list of
  names) — forty-four per-metro queries for one picture is the shape the
  per-series read exists to avoid. `data-bar="rentboard"`.
- **The deal's own model reads the same table** (#380): `lib/debt-index.ts`
  (pure) picks the index a loan is quoted over off today's rates — the
  Treasury tenor NEAREST the hold for the permanent loan (`treasuryForTerm`,
  the prepayment card's rule; a five-year hold prices off the 5-year),
  30-day average SOFR for construction debt (overnight SOFR only where the
  average is not fresh; Term SOFR is CME's and not on FRED) — and
  `lib/debt-index-read.ts` (`server-only`, `liveDebtSeeds`) hands it to
  EVERY surface that derives the model: the deal page, the workbook route,
  the report route and the bridge's current-assumptions read, so the page
  and the workbook cannot print two rates for one deal on one day.
  `deriveUnderwriteInputs` takes it as a fourth argument (`MarketForModel`)
  and sets `allInRatePct` to index + `CLASS_DEFAULTS[cls].spreadBps` — the
  index is the fact, the spread is the assumption, and the note says both
  with the date: "5-yr Treasury 4.78% (FRED, Sep 17, 2026) + 200 bps
  multifamily spread, a screening default — enter your quote". The seed
  rides in `meta.rateSeed` so the deal page's debt sizer starts where the
  workbook does (a loan the documents state still outranks it: a quote
  beats a benchmark — and only a rate a document states is a quote: the
  first-draft model carries a rate whatever the documents say, so the
  sizer takes it only where `statedModelRate` (lib/model/stated-rate)
  finds its rate metric won by a document, never a market norm, 2026-09-30;
  a note's or a leased fee's price seeds no property loan), and the
  construction panel starts from SOFR + 350
  instead of a flat 8%. **A benchmark is not a quote** holds here as on
  `/tools`: only a `contractRate` series that is fresh and plausible seeds
  (`seedRate`), a stale table seeds nothing and every surface keeps its old
  flat default with the OLD note — never a sentence claiming the market
  was consulted — land carries no permanent loan and says so, and the
  sample deal is never seeded, since its figures are pinned in the demo's
  tests. The hold is `HOLD_MONTHS` (60), one constant, because the caller
  that reads the tenor must ask for the hold the model runs on. Before
  this the model's rate was 6.00% on every deal on every day, the sizer's
  6.50% and the construction panel's 8.00%. **The page says what its
  returns carry for buying and selling** (#479, `costAssumptionsLine` in
  `lib/underwrite/cost-note`, under the sensitivity playground's
  figures): the transfer and recordation tax — none is said as the
  model's default, never as the jurisdiction's rate — the closing hold
  and the cost of sale, from the inputs themselves; only the workbook had
  named them. **The leverage check reads
  the same curve** (#386): `DebtSeeds.tenYear` carries the 10-year beside
  the tenor, `capSpreadRead` in `lib/leverage.ts` says the cap's spread
  over it — a fact with a direction and a date, no verdict, because what
  a normal spread is depends on the class and the year and is not the
  module's to assert — and `leverageRead` takes the benchmark's NAME, so
  the deal page's research panel reads the cap against the 30-yr fixed as
  before (one-sided, an owner-occupier rate) and then against today's
  index plus the class spread, printing the seed's own note so the
  assumption half is named; the compare table gets a signed "Cap over
  10-yr Treasury" row beside its leverage row. **The survey rides with
  the seeds** (#387): `DebtSeeds.survey30` carries the 30-year mortgage
  survey off the same cached read — shown with its date whatever its age,
  flagged when the table is stale, never a seed — and `benchmark30` picks
  it over the research layer's checked-in snapshot with the SOURCE saying
  which ("FRED · MORTGAGE30US" / "FRED PMMS, the checked-in snapshot"),
  so the deal page's research panel, the compare table and the demo read
  one table through one read; each had queried the row for itself, and
  the demo read the August snapshot on the one page a visitor sees
  without signing in. The demo's card is `app/demo/leverage-card.tsx`
  (`SampleLeverageCard`, pure, rendered in `lib/views.render.test.ts`
  with the marker's phrase checked against `renderToString`), and it
  prints the cap over today's 10-year beside the survey read.
- The model's assumptions against the published figures:
  `lib/model-vs-market.ts` (pure, no model call — #388). The four
  numbers that decide the model's return (rent growth, expense growth,
  stabilized vacancy, the exit cap), each set against the figure that
  speaks to it from the same cached reads the deal page makes for "since
  this screen": rent growth against Zillow's asking rents (all homes and
  apartments alone) and the CPI rent sitting tenants pay, expense growth
  against CPI and core, vacancy against the survey's metro figure INSIDE
  ITS MARGIN and then the region's, and the exit cap's spread over
  today's 10-year beside the going-in cap's (a widening is the
  conservative direction; a compression "is not a plan"). Four rules:
  only a fresh figure is read and a check with nothing fresh is omitted;
  a figure is set against an assumption of its own kind (rental housing's
  rents and vacancy reach a `residential` class only, prices and the
  10-year every `operating` one, land none — and a commercial class's
  rents reach the national index of its own kind of lessor, #390:
  `rentIndexFor`, said as the nation's lessors and never the metro's,
  with lodging and licensed care reading none, since they sell nights and
  care rather than leases); the survey's margin is the tolerance; and
  nothing is a verdict — the sentence says a trailing year is what the
  assumption is being asked to beat, not a forecast. Each check carries
  its `scope` (metro / national) and the card's and the report's scope
  sentence names the rows the read has rather than a fixed three. The card
  is `app/(app)/deals/[id]/model-vs-market-card.tsx` (pure, under the
  debt sizer on the Financials tab; rendered and linted in
  `lib/model-vs-market.test.ts`); the page reads the figures once for
  both checks (`todayReads`), whether or not the market check stored any.
  The submarket card (`lib/market/checks.ts`) is the same idea against
  the analyst's OWN loaded series; this runs on what every deal gets.
  The full report prints the same read (#389): the route makes the same
  reads in its own try (a failed live read leaves the grids in place)
  and `ReportInput.modelVsMarket` lands as `AssumptionsBlock` under the
  sensitivity grids, or under the plan's grid on a plan deal, which has
  no sensitivity page; `report-render.test.ts` reads it back with the
  PDF's line breaks folded, because the extracted text wraps where the
  page does. **And the workbook carries it** (#391) as a "Market Read"
  tab beside Assumptions — one row a published figure, the value raw so
  it sorts, data only so the live model is untouched; absent with
  nothing read, never an empty tab. The three surfaces read through ONE
  function: `todayReads` (`lib/model-vs-market-read.ts`, `server-only`,
  the cached readers once) and `modelVsMarketFor` (pure, in
  `lib/model-vs-market.ts`: the class the deck turned out to be, whether
  the deal is a plan, the page's own cap where it passes one and the
  extraction's otherwise), so the page, the report and the workbook
  cannot disagree about what was checked against what. **The research
  tracker rides beside the feeds** (#394, `lib/tracker-read.ts`, pure):
  `trackerFor` reads the metro's sector snapshot (`data/research/metros.json`,
  the blocks the market brief's "By asset type" panel and the vacancy
  board draw) for the deal's kind of building — `trackerSectorFor`:
  office, industrial, retail and multifamily read their own tracker; a
  medical office, a net lease, storage, a hotel and the rest read none,
  since a neighbour's figure is not theirs — as a vacancy BAND (a spread
  is never averaged into a printed number: a band is two published
  figures, a point one), the cap range where the tracker has one, the
  snapshot's day and the first source's host. It is dated research, not a
  feed, and every sentence says so ("on the research tracker (as of Aug
  25, 2026; colliers.com) — a quarterly print, not a feed"). Three reads:
  a commercial deal's stabilized vacancy — which had no row, the Census
  survey counting rental housing only — is set against the band (under
  its low end tighter, over its high end looser and conservative, inside
  inside); an apartment deal's survey check carries the tracker's
  apartment read beside the survey, shown and never the anchor; and where
  the tracker has a cap range the exit-cap check adds it to the 10-year
  read (over its high end the conservative direction for an exit, under
  its low end "cap compression on top of the spread read") and its scope
  becomes the metro's. `modelVsMarketFor` reads it, so the page, the
  report and the workbook agree; `modelVsMarket` takes it as `tracker`,
  and a read without one is exactly as before.
- HUD's fair market rents (#476): `lib/fmr.ts` (pure, no runtime
  imports, so the two scripts load it under plain Node) is the one reader.
  `fmrOf` reads a metros.json entry's `fmr` block — `fy`, `effective`,
  `area` (HUD's name for it), the bedrooms `0br`…`4br`, `status`,
  `sources`, `as_of` (the day the figures were read, never the day they
  take effect) and `note` — and a block that names no fiscal year, no day
  inside it or no area is null, never printed. **The year is data**: every
  surface prints `FY${fy}` from the block (`fmrLabel`) — the markets band,
  the brief's `FmrRow` (`app/market/fmr-row.tsx`: HUD's area and
  "effective Oct 1, 2026", or "ended Sep 30, 2027" in the warning tone once
  `fmrPhase` says the year is over), the compare card
  (`app/market/compare-metros.ts`, which will not set two different years'
  2BR figures against each other), the Mid-Atlantic DC line, the ZORI bar,
  the demo and the deal page's research panel (one line a metro, one
  source link). Rows are `hud_fmr_fy<fy>_<bed>` (`fmrMetric`), built by
  `fmrRows` / `fmrBenchmarkRows`, which the app's seeds,
  `scripts/seed-research.mjs` and `scripts/fetch-fmr.mjs` all call, so the
  table and the file are one shape; `newestFmrOnly` drops a row where its
  own metro has a newer year (the Washington rows an older pull filed under
  "Washington DC" read as `DC_AREA_METRO`'s) and anywhere once its own year
  has ended and a newer one is on file — never sooner, so a metro the
  newest pull missed keeps the year still in force rather than showing no
  rent (it had been global and immediate; the pre-ship audit of
  2026-09-30). **A year ends everywhere** (#479, `fmrWhen`): past its last
  day every surface says "ended Sep 30, 2027" — the research panel (whose
  source badge reads "year ended" rather than the 180-day "stale", which
  called a year in force stale), the compare card, the ZORI line, the demo,
  the Mid-Atlantic line and the brief's citation — and the homepage band
  leaves an ended figure out; each page reads today outside its render
  (`fmrToday`) and hands it in.
  `lib/fiscal-year-literal.test.ts` fails on a typed "FY20xx" anywhere in
  app/, lib/ or the two scripts. The FY2027 figures were read from HUD's
  FY27_FMRs.xlsx (the Internet Archive's capture of 2026-09-22), effective
  2026-10-01 per FR 2026-17891. The database may still hold FY2026 rows;
  they are hidden on read, and `node scripts/seed-research.mjs` writes the
  FY2027 ones.
- What landlords are asking this month: `lib/zori.ts` (pure — a metro's
  Zillow Observed Rent Index and its change from a year ago, read out of
  the two `benchmarks` rows the MONTHLY pull writes, `scripts/fetch-zori.mjs`
  via `zori.yml` on the 20th, from Zillow Research's public metro CSV),
  `lib/zori-read.ts` (the `server-only` read, admin client, cached per
  metro) and `app/market/zori-line.tsx` (`ZoriLine`, pure — the asking rent
  drawn against the 2BR fair market rent on ONE scale, with the gap said).
  **The FMR is HUD's yearly two-bedroom figure, utilities included; the ZORI
  is what landlords are ASKING**: one is set once a year from survey data
  two years old by the time it applies, the other is this month's listings
  across all home types before concessions, and the page shows both and
  lets neither stand in for the other — the gap between them is between two
  measures, never a premium over what HUD pays (the first sentence said
  "the fair market rent HUD pays", which was not true) — an underwrite that takes the FMR for the market rent is
  a year or two behind, one that takes the asking rent for the achievable
  rent has not priced the concessions. **Zillow's condition for use is
  attribution**, so `ZORI_CREDIT` is part of the component, not the
  page's to forget. The pull matches Zillow's MSA rows BY NAME
  ("Washington, DC"), the way the FMR pull matches HUD's areas; the four
  Washington suburbs and Newark share their MSA's row and the row's note
  says so (`shared`). Like every other feed, the CSV's URL, its column
  shape and each metro's RegionName are claims until the workflow's
  `dry_run` prints them from the runner. **The same pull reads two more
  of Zillow's files** (`FILES` in the script, one shape, each verified
  by its own dry run): the index over MULTIFAMILY listings alone —
  the apartment asking rent, the figure an apartment underwrite should
  be reading, which runs under the all-homes one wherever houses are
  dear, drawn as a third bar with the gap said — and the Home Value
  Index (mid-tier, seasonally adjusted), said against a year of the
  all-homes asking rent as the price-to-rent ratio in years
  (`priceToRentYears`), the arithmetic that keeps a renter renting.
  `ZILLOW_METRICS` is the one list the pull writes and the read asks
  for. A file that fails is a loud line and the others still write; a
  figure the pull did not have is null on the page, never zero, and the
  line simply lacks it.
- The for-sale market this month: `lib/realtor.ts` (pure — a metro's
  median list price, active listings and median days on market, each
  against a year ago, out of the `benchmarks` rows the MONTHLY pull
  writes, `scripts/fetch-realtor.mjs` via `realtor.yml` on the 8th, from
  Realtor.com's public metro CSV), `lib/realtor-read.ts` (the
  `server-only` read) and `app/market/realtor-line.tsx` (`RealtorLine`,
  pure, under the Zillow line). **The for-sale market is the other side
  of the renter's decision**: the Zillow line says the price side (a
  typical home in years of rent) and this says the FLOW — a market
  where listings pile up and sit longer is loosening, and a loosening
  market is one a renter can buy into; fewer and faster keeps them
  renting. `marketDirection` calls it only with BOTH flow changes and
  never from the price, because half the evidence is not a call, and
  the line says the list price is what sellers are ASKING, not what
  buyers paid. **Matched by CBSA code, checked by name**: the file is
  one month per file with the year-ago change already in it as a
  fraction (stored as a percent), and the dry run prints each metro's
  title beside its code so a wrong code is visible rather than silently
  another city; columns are read by the header's own names, never by
  position. **The first probe of a feed is `zori.yml`'s `probe_url`**
  (`scripts/probe-url.mjs`): fetch any candidate file from the runner
  and print its status, type, size, header, first and last rows and the
  rows naming a place — or, for a page, the links to data files on it.
  It is how Realtor.com's file was found to be real (run 35782501160)
  and Apartment List's not to be — its download is gated and its static
  host does not resolve — so that feed was dropped rather than guessed
  at. Realtor.com's condition for use is attribution (`REALTOR_CREDIT`).
  **The same pull reads Realtor.com's hotness file** (#377 — the metro
  HISTORY file, every month back to 2017 for the 300 largest metros,
  8.6 MB, probed by run 35793378647): the rank among the 300 is stored
  (`rdc_hotness_rank`), and beside it the rank THE SAME MONTH A YEAR
  EARLIER read out of the history (`rdc_hotness_rank_prior`), so the move
  on the year is `hotnessMove`'s subtraction of two printed figures and
  never a sign inferred from the file's `_yy` column — the dry run prints
  whether that column agrees. A smaller rank is hotter, which is the
  easy thing to get backwards, and the test pins it. The two components
  are stored in plain units against the U.S. — listing views per
  property as a ratio (`rdc_views_per_listing_vs_us`), days on market as
  days (`rdc_days_on_market_vs_us`, negative sells faster) — and the
  composite score is not, because the mean of two percentile ranks says
  nothing the rank and its parts do not. `HotnessRow` in the for-sale
  line prints "Hotness #154 of 300 metros · 12 places cooler than a year
  ago · listing views per property 35% under the U.S. · sells 17 days
  faster than the U.S.", each phrase one JS string. A file that fails is
  a loud line and the inventory rows still write. The probe script
  (`scripts/probe-url.mjs`) also describes a WORKBOOK now — each sheet's
  name, its first rows and the rows naming a place, through exceljs —
  because the Census Bureau publishes its Housing Vacancy Survey tables
  as .xlsx and nothing else, and reading one as text printed noise.
  **A dry run never upserts, so it cannot see the table refuse a row**:
  the first real pull (run 35785192214) failed on `benchmarks_unit_check`
  — migration 0023 admits `usd`, `pct`, `ratio`, `months`, `count` and
  `usd_month`, and the dry run had happily printed rows in `listings` and
  `days`. Both are `count` now (a listing is counted, so is a day; the
  reader reads by metric and never by unit), the script holds its own
  units to that list before it fetches anything, and
  `lib/benchmark-units.test.ts` reads the list out of the migration and
  holds every `unit:` literal in every script that writes the table to it
  — so the next new unit fails in CI, not on the 8th of the month.
- The construction loan's interest reserve, run rather than approximated:
  `lib/tools/construction-draw.ts` (pure). A construction loan funds its own
  interest, so the reserve is CIRCULAR — the loan pays interest on a balance
  that already holds the interest it has paid — and a closed form needs an
  assumption about the draw's shape, which is why every screening model
  swaps the schedule for a constant. `lib/construction-debt.ts`, which sizes
  a plan deal's loan on the deal page, is one of them (`drawProfile`,
  `DEFAULT_DRAW_PROFILE` 0.55). This runs the months and reports how far
  that constant is off, holding itself to the exported constant so the two
  cannot drift. **Equity goes in first, and that is the whole reason the
  reserve is smaller than people expect**: a lender requires the sponsor's
  equity fully funded before the first advance, so on the seeded $30M at 65%
  LTC the loan does not draw until month 7 of 24 and averages 42% of itself
  outstanding, not 55% — $1,357,269 against the shortcut's $1,905,738, 40%
  high. Run the same project PARI PASSU and the constant is roughly right
  (0.61), which is the point: it describes a funding order construction
  lenders do not use. **The reserve is a fixed point**, iterated to
  convergence, and a test pins the identity it has to close on —
  `costs − equity + reserve === loan`. **And the shortcut errs
  CONSERVATIVE**, which is why it survives: an overstated reserve overstates
  cost and understates yield on cost, so it reads as prudence rather than as
  a mistake and the deal it kills is killed quietly. The curve is an
  assumption and named as one (smoothstep `3x² − 2x³`, or straight line);
  land draws at closing, soft costs split between closing and the works. A
  0% LTC is all-cash and answers zero rather than refusing. Bars:
  `data-bar="draw"` (one a month) and `data-bar="reserve"` (the three ways
  of stating it).
- The floating-rate loan and its cap: `lib/tools/floating-rate.ts` (pure —
  the bridge debt every other card on `/tools` pretends is fixed, and the
  one card whose main input the site already knows, since a note
  references SOFR BY NAME with no term to match). **A cap struck above the
  breach point protects nothing you care about**: the lender requires a
  cap, the borrower buys the cheapest strike that satisfies it, and nobody
  checks that strike against the index at which the loan breaks its OWN
  covenant — the seeded $20M is struck at 4.00% against a breach at 3.92%,
  so rates rise, the loan fails, the lender takes the building, and the
  cap starts paying afterwards. It was covering the lender's loss severity
  the whole time. **A cap and a floor are not a collar and do not act on
  the same thing**: a floor is a term of the NOTE and lifts what is owed, a
  cap is a separate instrument on the INDEX and reimburses the excess, so
  the rate is `max(index, floor) + spread − max(0, index − strike)` and
  the shorthand `min(max(index, floor), strike) + spread` agrees only
  while the floor is under the strike — above it, the shorthand hands the
  borrower a cap payment nothing triggered. **The premium is a rate**
  ($300,000 on $20M over two years is 75 bps a year, the only unit in
  which it sets against a fixed quote) and **a USE funded at closing**
  (`sources-uses`' rule), never netted out of proceeds. It is an INPUT:
  pricing a cap needs a vol surface, so it is a broker quote and the card
  says so. The extension's required strike is the same solve on the
  extension's NOI. `breachIndexPct` is solved through the loan constant
  (`rateForConstant`, a bisection since the constant is monotone in the
  rate), and a test rebuilds the loan at the solved index and asserts the
  DSCR comes back exactly the covenant. Bars: `data-bar="float"`.
- What it costs to get out of the loan early: `lib/tools/prepayment.ts`
  (pure — the calculation that decides whether a deal can be sold, and
  the one whose answer reverses on a fact about the MARKET rather than
  about the building). **Yield maintenance is cheap when rates have
  risen and dear when they have fallen**, which is the opposite of most
  intuitions: it makes the lender whole on interest it will not receive,
  so where today's Treasury is above the coupon there is no loss at all
  and the penalty drops to its floor (the seeded $20M at 3.75% against a
  4.75% Treasury is $200,000 of pure floor). **Defeasance is not a
  penalty but a PURCHASE** — Treasuries replicating the remaining
  payments — so when rates have risen that portfolio costs LESS than the
  balance it retires and defeasance is a GAIN ($385,213 here, after
  $75,000 of hard costs that do not scale); yield maintenance can never
  go below its floor, defeasance can go below zero, and in a fallen-rate
  world the order reverses. Two exact identities the tests pin: where
  the floor does not bind, **defeasance is yield maintenance plus the
  hard costs to the dollar** (both price the same stream at the same
  rate), and at the coupon itself the raw penalty is exactly zero.
  **The same rate move makes the loan worth MORE to a buyer who could
  assume it** (`debtMarkToMarket`, against the market LENDING rate, not
  the Treasury — conflating the two is the easy mistake), so the two
  numbers pull opposite ways and belong on one page. And **the open
  window costs nothing**, so the penalty is really the price of closing
  sooner, said as a rate per month of waiting bought back — and null,
  not negative, where leaving early pays. Runs monthly, as `debt-math`
  does. Bars: `data-bar="prepay"`.
- A below-market lease, and what ending it is worth: `lib/tools/lease-buyout.ts`
  (pure). The naive answer — market less in-place, over the years left,
  discounted, minus the cost of re-tenanting — is wrong on BOTH halves.
  **The turnover is not avoided by waiting, only DEFERRED**: the lease ends
  eventually and the downtime, allowance and commission are owed either
  way, so charging their full amount against a buyout counts a cost the
  landlord was always going to pay. **And the prize is not the spread**:
  ending the lease hands over the downtime first, so the answer is the
  difference between TWO STREAMS over one horizon — the lease running its
  course against it ending today — which is all `buyoutValue` is. Two
  consequences, each with a test. **A lease with nothing left to run is
  worth nothing to end**, however far under market, because the spread is
  still there on the last day; and on a modest spread the honest answer
  FLIPS SIGN against the naive one (at $38 against a $42 market the spread
  says pay $908,072 to end it, the streams say −$527,092 — pay them to
  stay). Strip every friction out and `buyoutValue` equals the naive figure
  to the dollar, which is the check that the two are one model. **The
  spread cancels between the two sides**, so with no friction, no move and
  one discount rate the zone of possible agreement is exactly ZERO — a
  buyout creates no value of itself, and the two inputs that make one
  happen are `outsideValue` (vacant possession worth more than the rent)
  and a tenant discounting the future harder than the landlord. Shares
  `lease-math`'s two conventions (annual steps on the lease's own
  anniversary; commission against the GROSS rent) and runs monthly, since
  downtime is quoted in months. Bars: `data-bar="buyout"` (a signed pair
  from a centre line, because the two answers can point opposite ways) and
  `data-bar="side"`.
- Which trailing window the memorandum chose: `lib/tools/trailing-window.ts`
  (pure). The only trap on `/tools` that is not an error but a **selection** —
  "T-3 annualized" and "T-12" are both true statements about the same
  building, the seller quotes whichever is larger, and nothing on the cover
  page says a choice was made. Four rules, the first two running opposite
  ways. **Annualizing a short window annualizes its seasonality too**, so
  the best quarter times four is the claim that every quarter is the best
  quarter. **The window is the argument**, and at the stated cap the spread
  between the most and least flattering window is a dollar figure —
  `valueSpread`, which only an NOI column gets, because a revenue line and
  an expense line are each half of one and dividing either by a cap rate
  states a value the building does not have. **For an expense, flattering
  means LOWEST** (the sign trap: `better()` reverses on `kind`), so the
  check that matters there is not the spread but whether the tax
  instalment falls inside the window at all — `lumpOutsideShort`, a month
  at least 2× the median sitting outside the last three. And **the honest
  short-window read is year over year**: `priorYearQuarter` needs fifteen
  months, which is exactly why a memorandum quoting T-3 rarely includes it.
  On the seeded column T-3 reads +8.7% against the full year and +3.6%
  against the same quarter a year earlier — five of those nine points are
  the season. The column reads through `readStrip` (the cash-flow card's
  reader), so the comma-as-thousands-mark trap stays solved in one place.
- Whether to hold it another year: `lib/tools/hold-or-sell.ts` (pure). The
  one question on `/tools` a **lifetime IRR cannot answer** — it is an
  average over the whole hold, dominated by what already happened, so a
  building can sit at a 17% lifetime IRR while the next twelve months earn
  six. Five rules. **The decision is marginal, never average**: the return
  on holding for ONE more year, which is the cash plus the change in the
  cheque, over the cheque. **The capital at stake is the net sale
  proceeds** — not the building's value (that ignores the debt) and not
  the original equity (that ignores that the market moved). **Selling
  costs are paid whenever you sell**, so they are on both sides and mostly
  cancel; `naiveNextYearReturnPct` prices the error of charging the hold
  year's own selling cost, which on the seed turns 14.1% into 18.8% and
  reverses the answer. **The marginal return DECAYS on its own** (14.1% →
  11.0% over ten years on the seed) because the equity in the denominator
  grows faster than the cash flow does — the loan amortises and the value
  rises on top — which is why the answer is a YEAR and the module runs a
  schedule. And **the hurdle is an input**: what else the money would do.
  The exit capitalises the forward NOI (`what-you-believe`'s rule) and the
  loan balance comes from `readDebt`, run to the HORIZON rather than to
  the balloon — holding past a balloon is a refinance, which is
  `testRefi`'s question and not this one.
- What you can pay: `lib/tools/max-bid.ts` (pure). Every other card judges
  a price somebody else set; this one **solves for it**, and it is the
  calculation people fudge hardest because doing it properly is circular —
  a lower price means a smaller loan at the same loan-to-value, which
  changes both the cheque and the debt service, which changes the return.
  So the price is BISECTED (the levered IRR is monotone decreasing in
  price, which a test asserts rather than assumes) and then the whole
  stream is rebuilt at the answer and run back through `irr` from
  `lib/underwrite/engine` — `checkIrrPct`, which the card prints beside the
  price. Three more rules. **Which lender test binds moves with the
  price**: LTV scales with the price and the coverage tests do not, so
  `bindingFlipPrice` solves for the crossing, and the note's direction is
  the easy thing to get backwards (LTV is the smaller, and therefore
  binding, BELOW it) — both branches have a test, because the first version
  had them swapped. **A levered target belongs here and only here**, which
  is the complement of `what-you-believe` saying its return is unlevered.
  And **the cheque is not the price less the loan**: closing costs and the
  loan fee are funded at closing (`sources-uses`' rule), so they are equity
  at risk and leaving them out overstates the bid. With coverage tests set
  and NO loan-to-value cap the search's low end sizes a loan larger than
  the building, so the refusal names the missing LTV rather than blaming
  the target — a missing input and an unreachable return want different
  answers.
- What sits below the NOI line: `lib/tools/below-the-line.ts` (pure). A
  broker's NOI and an owner's NOI are different numbers for the same
  building, and the difference is **not** a disagreement about operations —
  it is a disagreement about what counts as an operating expense. Four
  rules. **Capital that recurs is an expense**: replacing a twenty-fifth of
  a roof every year forever is a cost of doing business, and the test is
  recurrence rather than accounting treatment. **Leasing capital is not
  optional and its annual cost is not its invoice** — a building on
  five-year leases re-tenants a fifth of itself a year, so `leasingAnnual`
  is the per-foot TI and commission over the term, on the share that
  actually rolls; spending nothing this year means the cost is late, not
  absent. **A renewal is cheaper than a new lease and the mix is an
  assumption**, so the probability is an input and BOTH ends are reported
  (`leasingIfAllRenew` / `leasingIfNoneRenew`, a 3.3× range on the seed) —
  a memorandum quoting only the renewal cost is quoting the best case as
  the expectation. And **the cost is said as a price**, capitalised at the
  ADVERTISED cap because that is the rate the price was set at:
  `valueOfTheLine` is to the dollar the ask less `priceForAdvertisedCap`,
  which is the identity the module exists to make checkable.
- What the building actually collects: `lib/tools/economic-occupancy.ts`
  (pure — the bridge from gross potential rent to EGI). **Physical
  occupancy counts DOORS, economic occupancy counts DOLLARS**, and "95%
  occupied" is on the cover because it is the higher of the two. Four more
  rules. **The denominator is market rent, never the in-place rent roll** —
  divide collections by the rents currently CHARGED and loss to lease
  vanishes, because it is sitting in the denominator (the seeded building
  reads 90.5% that way against an honest 87.3%). **Loss to lease is not a
  collections problem**: it closes as leases roll rather than by managing
  anything, which is why every line carries a `kind` and the note names
  which bucket the largest part of the gap is in — the buckets carry
  opposite instructions. **A concession is rent you agreed not to collect;
  bad debt is rent you failed to** — both reduce EGI, only one is a
  decision. And **other income stays out of the ratio** (rule 5): parking,
  RUBS and fees belong in EGI and not in the numerator, or a full building
  prints above 100%. Non-revenue units get their own line because the
  cover's occupancy counts them as full — a model unit IS physically
  occupied and pays nothing. `capIfVacancyOnlyPct` prices the naive
  underwrite (4.96% against 4.30% on the seed, 66bp) and `valueOfGap`
  capitalises the difference at the HONEST cap, since that is the rate this
  NOI supports.
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
- When the income rolls: `lib/tools/rollover.ts` (pure — a rent roll's
  expiry schedule, and the WALT a memorandum quotes against the three it
  does not). Four rules, the first two changing the figure rather than
  shading it. **Weight by rent, never by area**: they are different numbers
  and the longer one gets quoted, because the long leases in a building are
  the cheap ones — the seeded roll runs 7.0 years by area and 5.1 by rent on
  the strength of one 60,000-foot distribution tenant twelve years out at
  $8.50. **A break option is an expiry** — the landlord cannot make the
  tenant stay and the lender will not assume it, so `waltToBreak` (4.3 here,
  0.8 years off the quoted term) is the one to bid on, and the schedule
  buckets by the break rather than the expiry. **An average hides a cliff**:
  two rolls with the same 3.0-year WALT roll 20% and 60% of the income in
  their worst year, which the mean cannot see and the year-by-year table
  can, so `worstYear` is drawn against `evenYearSharePct`. And **the cliff's
  cost is capital, not rent** — the TI and commission land whole in the year
  the space rolls, and on the seed year 4 owes $1,530,000 against $1,292,000
  of rent rolling, a cheque larger than the income at risk and none of it in
  the NOI (`below-the-line` prices the same cost as a run rate over an
  average year; this prices it in the year it lands). The reader shares
  `unit-mix`'s `cellsOf` — one copy of the comma-is-also-a-thousands-mark
  precedence — and decides TWO columns for the whole table at once: whether
  the rent column is per foot or a TOTAL annual rent (the ratio to the square
  footage; at or above 1 would mean a lease of under one square foot, and
  reading $1,012,000 as a per-foot rent puts the building's income in the
  billions), and whether the expiry column is years remaining or calendar
  years. A pasted date yields its year rather than dropping the lease, since
  a dropped lease silently shortens every figure the module reports. The roll
  is LEASED space, so occupancy needs the building's own size — and a roll
  carrying more feet than the building says the two inputs disagree rather
  than clamping quietly. Bars: `data-bar="walt"` (three terms on one track)
  and `data-bar="roll"` (one a year, with the even-roll tick).
- Filling an empty building: `lib/tools/lease-up.ts` (pure — the months
  between delivery and stabilization that a pro forma covers in a
  footnote). Four rules. **The trough is not at delivery**: the allowance
  and the commission fall due at SIGNING, ahead of the rent they buy, so
  the seeded 120,000-foot building's worst month is month 22, the month it
  FILLS — $6,200,437, deep into a lease-up that is going well.
  **A slower lease-up does not show up in the reserve, and that is the
  trap**, because the reserve is what gets stress-tested: slipping six
  months takes the trough DOWN to $5,674,789, since a slower pace spends
  the leasing capital slower. The cost is time, and it shows only at a
  COMMON date — hence `compareMonth` (36, clamped to the horizon) and the
  three `cumulative…AtCompare` figures, signed so a paid-back schedule is
  not printed as zero: $3,465,450 out as planned against $4,158,892
  slipped, $693,442 worse and 1.9x what a 5% rent miss costs. **An empty
  building still pays its taxes**, so the operating expense splits — a
  fixed share running from the certificate of occupancy (worth $656,370 of
  trough on the seed) and a variable share following the space OCCUPIED,
  since a tenant inside its free rent is still running the lights. And
  **leased is not paying**: the building is full at month 22 and paid in
  full at 28, and the concession alone is $1,314,787 of the trough.
  Pre-leased space pays from month one — it burned its free rent during
  construction. Unlevered unless a monthly debt service is given, because
  a construction loan's own interest reserve is `construction-draw` and
  counting it twice would overstate the hole. ONE `runSchedule` behind the
  answer and both shocks: a shock re-runs the whole schedule rather than
  scaling, since the trough moves in TIME as well as size. Bars:
  `data-bar="leaseup"` (the J-curve, one a month from a centre line) and
  `data-bar="slip"` (the three positions at the common date).
- The sale-leaseback: `lib/tools/sale-leaseback.ts` (pure — the structure
  where both sides price it wrong in the same direction). Four rules.
  **The rent is the price lever**, because the seller writes its own lease:
  the seeded $9 contract rent on space letting at $7.50, at a 6.00% credit
  cap, is a $27,000,000 price against a $21,600,000 building — $5,400,000
  of it the LEASE, which is cash borrowed rather than value created.
  **An above-market lease reverts to market**, so the buyer is really
  buying the term's rent plus a market-rent building afterwards
  ($23,026,443); capitalising the contract NOI overpays by $3,973,557, and
  it is WORSE on a SHORT lease because the reversion arrives sooner — the
  direction people get backwards. The identity that proves the two pieces
  are one model: strip the premium and discount at the market cap and
  `honestValue` equals `marketValue` to the dollar. **The credit is the
  cap rate**, so the two caps are kept apart and neither stands in for the
  other. And **it looks cheaper than a mortgage in year one without being
  cheaper**: compare the rent to the COUPON, never to the constant
  (`capital-stack`'s rule — amortisation is a transfer, not a cost, and
  the constant is reported separately for exactly that reason). The seed
  is 6.09 cents against 6.50%, crossing in `yearRentPassesCoupon` = 5 and
  reaching 8.87 by the term's end, having raised $26,595,000 where
  `sizeLoan` allows $12,816,579. One trap already paid for: with the
  contract rent AT market and a discount rate above the market cap,
  `overpayment` is still positive — the two inputs simply disagree about
  the yield — so the reversion sentence is gated on there BEING a rent
  premium, or the card calls an artifact of two assumptions a finding
  about the deal. Bars: `data-bar="slb"` (three values on one track) and
  `data-bar="coupon"` (a year each, against the coupon's dashed line).
- The insurance line: `lib/tools/insurance.ts` (pure — the expense that
  reprices hardest and gets read least, and structurally the same trap as
  `tax-reassessment`). **The premium in a memorandum is the SELLER's
  expiring policy**, bound on limits the seller chose in a market that may
  no longer exist; nothing in it is false, it describes someone else's
  placement, which is what makes it invisible. Insurance is a FIXED
  expense, so the gap comes out of NOI whole — the seeded Florida
  apartment's $420,000 against a $780,000 quote is $360,000, which at the
  advertised 5.25% cap is **$6,857,143** and takes the buyer's cap to
  4.60%, 65bp. **A named-storm deductible is a percentage of the INSURED
  VALUE, not a dollar amount**: 5% of a $52M replacement cost is
  $2,600,000 retained per event, said as `deductibleYearsOfNoi` (0.9) —
  the figure nobody writes down, and the one the note leads with even
  where the premium came in fine, because the premium is what people argue
  about and this is what takes the building. Struck against the insured
  value and never the price, which would be a different and wronger
  number. And **raising the deductible is a priceable trade**:
  `breakEvenYearsBetweenEvents` (16.3) is the frequency at which the
  annual saving meets the extra per-event retention, assuming every event
  is a full-deductible loss — the CONSERVATIVE reading, so the real
  break-even is at or below it, never above. A LOWER alternative
  deductible answers null: that is the opposite trade and this figure does
  not answer it. Both premiums are inputs, because what a building is
  quoted turns on its roof, its year built and the carrier's appetite.
  Bars: `data-bar="prem"` (the two premiums) and `data-bar="storm"` (one
  event's retention against a year's NOI). **"16.3 years" is deliberately
  not a live-verify marker** — it spans an interpolated value, so React's
  `<!-- -->` sits inside it in the served HTML.
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
- What `/tools` answers: `lib/tools/catalog.ts` (`TOOL_INDEX`, `TOOL_COUNT`,
  `TOOL_GROUPS` and `groupedTools()`
  — pure data, no `"use client"`, so a server-rendered page can import it).
  The page's jump index renders from it, each card takes its `id` from it,
  **and the homepage's shelf renders from it too** — the homepage went on
  saying "size a loan, or run the cap rate math" while the page grew from
  four calculators to fifteen, and one list imported by both makes that
  drift impossible rather than merely unlikely. The count in the page's own
  meta description is prose and cannot render from the constant, so
  `catalog.test.ts` holds the spelled-out number to `TOOL_COUNT` instead;
  that claim went stale twice in one evening before the guard existed. The
  index is CLUSTERED, not a flat row: the page measured 187KB of HTML,
  4,165 words and 189 input fields at twenty-six cards, and a row of
  twenty-six chips is a wall rather than a directory. **Re-clustered at
  forty cards** (349KB, 7,521 words, 331 input fields — nearly double the
  first measurement): two of the six groups had reached the eight-card
  ceiling the test enforces, so the next lease card and the next land card
  could not be filed at all. THE GUARD REFUSING THEM IS THE SIGNAL that
  the shape has run out — widening the ceiling answers the guard instead
  of the reader. Eight groups of four to seven now, with headroom in each:
  "Leases" split from "Rent & recoveries", and "Value & land" into "Value"
  (what a standing building is worth) and "Development" (what a site could
  become). A card's own `eyebrow` is a DESCRIPTIVE label, never a group
  name — three cards borrowed group names when they were written and now
  read "The statement", "The envelope", "New supply". `groupedTools()` is the one place that
  regrouping lives, and `catalog.test.ts` holds every card to exactly one
  cluster, every cluster to two through eight cards, and the order to
  `TOOL_GROUPS` — because the filter means a card with a group outside
  that list VANISHES from the index while staying on the page. The
  `data-bar` namespace is flat across all of them and a collision adds
  two cards' render counts together, which happened twice (`stack`,
  `exit`); the same test now splits the file at its card functions and
  holds each marker to one. A cluster heading with an ampersand serves as
  `&amp;`, so a live-verify marker must grep the escaped form.
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
- What the tenant actually owes: `lib/tools/expense-recovery.ts` (pure —
  the operating-expense reconciliation). Three rules, and the first is the
  one that moves the most money. **Gross up BOTH years, or neither** —
  variable expenses scale with occupancy, so a base year struck in a
  70%-leased building is artificially low and the tenant is later billed
  for the building filling up; the error to catch is the ONE-SIDED version
  (this year grossed up, the base year left at its actual), which
  `oneSidedCost` prices rather than merely warns about. `grossUp` scales
  the variable part only and never scales a building already fuller than
  the target. **A base year is not an expense stop** — one is an outcome
  and can drift, the other is a negotiated number and cannot, so the
  caller says which the lease has. And **a cap is cumulative or it is
  not**: cumulative compounds off the base year and banks unused headroom,
  non-cumulative allows one year's worth; both are "a 5% cap" in a term
  sheet. The cap reaches CONTROLLABLE expenses only and the carve-out is
  reported beside it, because a 5% cap is worth little in a year the
  insurance doubled. Every displayed figure is rounded once and the
  differences are taken from the rounded pair (the debt schedule's rule),
  so the card's numbers add up.
- The retail lease's own arithmetic: `lib/tools/percentage-rent.ts` (pure).
  Three rules, the middle one changing an answer rather than shading it.
  **The natural breakpoint is DERIVED** — base rent over the rate, the
  sales at which percentage rent equals base rent — so a lease stating
  anything else has an ARTIFICIAL one, which the module names and sides
  (below natural favours the landlord, above it the tenant). **Percentage
  rent is owed on the YEAR'S sales, reconciled at year end**: billed
  monthly against a twelfth of the breakpoint with no true-up, a landlord
  collects on every strong month and refunds nothing for the weak ones, so
  the seeded seasonal tenant pays $22,300 on a year whose annual figure is
  ZERO — and no single month's statement shows it, which is why the card
  draws twelve months with the monthly line across them. And **the
  occupancy cost ratio is the test of whether the rent is durable**;
  `salesToClearCeiling` SOLVES for the sales that reach the caller's
  ceiling rather than scaling a ratio (above the breakpoint the cost is
  itself a function of sales), and answers null for a ceiling at or under
  the percentage rate, which no sales figure can ever reach. What counts as
  healthy is the tenant's category, so the ceiling is an input with a
  default and never a number this module asserts. The sales column reads
  through `readStrip` — the cash-flow card's reader, so the
  comma-as-thousands-mark trap stays solved in one place.
- What you would have to believe: `lib/tools/what-you-believe.ts` (pure).
  The only card on `/tools` that runs BACKWARDS — it takes the price and
  the return and reports the growth rate the deal is quietly assuming,
  because a pro forma is a set of assumptions chosen to reach a
  conclusion and a deal that pencils at 3% growth looks identical on a
  summary page to one that pencils at 9%. Four rules. **The exit
  capitalises the FORWARD NOI** (year N+1, what the next buyer is
  purchasing); capitalising the trailing year understates the exit by a
  whole year of growth, by an amount that varies with the rate being
  solved for. **Solve, do not scan**: NPV at the TARGET rate is monotone
  in growth, so its zero is exactly where the IRR equals the target —
  and a test rebuilds the stream at the solved rate and runs it through
  `irr` from `lib/underwrite/engine`, the one behind the Excel export, so
  the page and the workbook can never disagree (the same round trip
  checks the exit-cap solve). **The required growth is a CLAIM, not a
  verdict** — the benchmark is an input and the words ("at market", "a
  stretch", "heroic", at `STRETCH_POINTS` / `HEROIC_POINTS`) describe the
  DISTANCE from it, never the market. And **cap compression is not a
  plan**: the module solves the other lever too and flags the case that
  should stop a screening, an exit cap required to be TIGHTER than the
  going-in cap. On the seeded $25M / $1.5M deal a 12% unlevered return
  needs 7.16% growth, or an exit cap of 5.01% against the 6.00% being
  bought at. **The return is UNLEVERED and the card says so**: a levered
  target typed into an unlevered solve makes every deal look heroic, and
  debt is deliberately out of scope because `sizeLoan` and `readDebt`
  already do it.
- A building on someone else's land: `lib/tools/ground-lease.ts` (pure).
  The one structure on `/tools` where ordinary screening arithmetic is
  wrong by a MULTIPLE rather than by a margin, and wrong the flattering
  way. **A leasehold is a WASTING asset**: at expiry the building reverts,
  so its value is the present value of the term's cash flows and nothing
  after them — no reversion, no terminal value. `leaseholdPv` runs the
  schedule year by year because the NOI and the ground rent grow at
  DIFFERENT rates and no single annuity factor covers it (a test pins it
  against a hand-built schedule for exactly that reason). Capitalising the
  leasehold's NOI at a fee-simple cap values a perpetuity that expires:
  on the seeded lease that is $120M against $97.5M over 40 years (18.7%
  imaginary), and the same lease with 10 years left is 62.8% imaginary —
  the error grows as the term shortens, which is why both figures are
  drawn side by side. **Ground rent coverage is the lender's test**, not
  DSCR: on an unsubordinated lease the ground rent outranks the mortgage,
  and a default terminates the lease, the building and the mortgage
  together. **A reset is an uncapped repricing** — a rent struck at a
  share of THEN-CURRENT land value takes the seeded lease from 4× to
  2.22× coverage, and doubling land value takes it to 1.11×. And
  **subordination decides financeability**: `TERM_MARGIN_YEARS` (10) is
  the margin by which an unsubordinated term must outlast the loan, and
  the boundary is stated so it cannot drift. The leased fee is the mirror
  — the rent plus the land coming back — and it moves the OPPOSITE way as
  the clock runs ($32.7M → $42.3M as the leasehold falls $97.5M → $44.7M),
  which is why the two halves trade to different buyers.
- What the taxes become once you own it: `lib/tools/tax-reassessment.ts`
  (pure). **The memorandum's tax line is the SELLER's bill**, struck on
  the seller's assessed value — and where the jurisdiction reassesses on
  transfer, the purchase resets that assessment to the price, so the NOI,
  the cap and the coverage ratio downstream of it were all computed on a
  bill that stops existing at closing. Nothing in the memorandum is false;
  it is describing someone else's ownership, which is what makes this
  invisible. Three more rules. **A bill is assessed value × rate and
  assessed value is not the price** — the ratio is kept apart from the
  rate, and where the current bill and assessment are both given the
  module derives the rate they IMPLY and flags a disagreement (usually a
  special district, sometimes a stale assessment). **A phase-in is a
  deferral, not a discount**: year one is reported beside the stabilized
  bill and the stabilized one is the headline, because pricing an exit off
  the year-one figure prices it on a NOI the building never earns again.
  And **the cost is said as a PRICE**, `priceForOmCap` SOLVED rather than
  scaled — `P = (omNoi + currentTax) / (c + k)`, since paying less lowers
  the assessment that lowers the tax that raises the NOI; on the seeded
  $25M deal that is $22.8M, where scaling the stabilized NOI at the
  advertised cap would have said $22.25M and overstated the discount. A
  jurisdiction that does NOT reassess answers zero rather than nothing —
  that is the answer, and which jurisdictions do is a fact about a place
  rather than arithmetic, so it is an input and the card says so.
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
- The self-storage rate increase: `lib/tools/storage-ecri.ts` (pure — the
  last asset class `/tools` did not speak to, and the one whose central
  lever exists nowhere else). Storage leases month to month, so a sitting
  tenant can be repriced whenever the operator likes — the EXISTING
  CUSTOMER RATE INCREASE, eight to fifteen percent, once or twice a year.
  Four rules. **The ECRI is a trade and the trade has a CLOSED FORM**:
  setting revenue after against revenue before gives
  `m* = e / (1 + e − k)` where `k = (street/inPlace) × (12 − downtime)/12`
  — a 10% increase breaks even at a **25.8%** move-out on the seed, against
  the three to eight percent an operator sees. The REACH cancels out of it
  entirely (raising half the book and all of it break even at the same
  rate, because both sides scale with it), which a test pins. **The ECRI
  eats its own runway**: each increase widens the in-place-to-street gap
  that is the whole denominator of the trade, so the break-even falls
  25.8 → 20.7 over five years — and how fast is a RACE with the street
  rate's own growth (9.4 points of decay over eight years at 0% growth,
  4.3 at 4%), so it is run rather than claimed. **The street rate and the
  in-place average are two different numbers** and which is underwritten
  decides the deal: `revenueAtStreet` is every tenant churned to today's
  ask, $210,600 below a rent roll that looks perfectly healthy, and on a
  facility about to face a new competitor it is a forecast rather than a
  stress test. And **a free month is not a fixed discount** — it costs one
  month out of the whole tenancy, and that length is a market fact:
  9.1% at eleven months, 12.5% at eight, 4.2% at two years
  (`SHORTER_STAY_PCT` sets the comparison proportionally so it holds at any
  stay). One guard the probe bought: a street rate ABOVE the raised
  in-place rent printed a **736.4%** break-even, which reads as a figure
  and is not one — a facility cannot lose more tenants than it has — so
  above 100% the answer is null and the note says there is no trade to
  make. Bars: `data-bar="ecri"` (the assumed response against the
  break-even) and `data-bar="runway"` (one a year).
- Taking over the seller's loan: `lib/tools/loan-assumption.ts` (pure — the
  other half of `prepayment`, which asks what it costs to get OUT of a loan
  early; this asks what it is worth to step INTO one somebody else signed,
  and in a market where a 2021 coupon sits three points under today's that
  is the question deciding which buildings trade). Four rules. **The rate
  benefit and the equity cost pull OPPOSITE ways and only one of them gets
  quoted**: the seller's loan has been amortising for years and the building
  has appreciated since, so the balance is well under what a new loan would
  advance — assuming it is the LARGER cheque. On the seed, $2,376,000 more
  equity against $333,460 a year of debt service, so the module runs BOTH
  COMPLETE POSITIONS (cheque in, cash out, balance retired at the exit) and
  reports the two levered returns rather than either half. A wonderful rate
  on a small balance is worth almost nothing — $4M at 3.00% saves MORE debt
  service than the seed's $9.6M at 3.50% and prices at a tenth as much,
  because the equity swamps it. **You are buying the OVERLAP, not the
  term**: the premium is $934,223 at five years remaining and EXACTLY THE
  SAME at seven and at ten, because the building is sold at five either way;
  below the hold it falls with the overlap ($130,918 at one year). The
  obvious version of that rule — a remaining term at which assuming first
  beats a new loan — was written first and the probe killed it: assuming
  wins at every term on the seed, so the "break-even" was 1 and said
  nothing. **The assumption fee is a USE funded at closing** (`sources-uses`'
  rule), never a reduction of the loan. And **it buys coverage as well as
  rate** — 1.91× against 1.21×, which survives a coupon that kills the IRR
  gap, so a marginal deal can be financeable one way only and no IRR shows
  it. The headline `pricePremium` is BISECTED (the price moves the new loan,
  the equity and the exit together) and a test pays it back in and asserts
  the two paths meet. A loan balloon inside the hold refinances at the
  MARKET rate for the same balance — the minimum refinance, so the
  comparison stays about rate rather than a second sizing decision.
  Schedules from `readDebt`, the rate from `irr` in
  `lib/underwrite/engine`. Bars: `data-bar="assume"` (the two returns) and
  `data-bar="premium"` (the premium against the asking price).
- The seller's loan on a deal (#417): `lib/assumable-debt.ts` (pure) runs
  that card's arithmetic on the deal's OWN model. The extraction labels an
  assumable loan's terms as rows of their own — "Assumable loan balance",
  "… rate", "… maturity", "… amortization", "… debt service" and
  "Assumption fee" — only where the OM offers the loan for assumption,
  never a quote for new financing. `readAssumableTerms` reads only those
  rows; no balance row means no loan to assume. `modelForAssumption`
  takes the model's price, year-1 NOI and the NOI's compounded growth over
  the hold, its exit cap, its closing costs and acquisition fee, and its
  new loan: amount, the model's own rate (today's tenor plus the class
  spread where the table seeded it), amortization, interest-only and fee.
  So the comparison is against the loan the page already assumes the
  buyer takes. `AssumptionTerms` gained `assumedIoYears` and
  `newLoanIoYears` for it; absent, the card reads exactly as before.
  Four rules:
  - **The schedule comes from what is stated**: a stated debt service
    solves the years the loan has left (the level payment on today's
    balance at the coupon, which a stated original amortization cannot
    say); then the OM's own statement; and an undated interest-only
    period beside an amortization is run amortizing, the reading that
    does not flatter the loan.
  - **The coupon runs for the FULL years to maturity, rounded down** (a
    part-year is refinanced at today's rate with the rest), and under a
    year to run is a refinance, not an assumption. The first cut rounded
    4.5 years up to 5 at the coupon and called it refinanced.
  - **A term not stated is named, not assumed** (`missing`: its rate, its
    maturity, its payment schedule). A fee not stated is none, and said.
  - **Only where the price buys the building** (`assumableApplies`: fee
    simple, leasehold, unknown). A note's, a share's or the land's buyer
    does not choose the property's debt.

  The card (`app/(app)/deals/[id]/assumable-card.tsx`, pure, under the
  debt sizer on the Financials tab) takes plain data (`assumableView`),
  keeping the engine out of the client bundle. It draws the coupon
  against the model's rate (`data-bar="assume-rate"`) and the year-1
  coverage both ways (`data-bar="assume-dscr"`); the premium, the return
  gap, the extra equity and the debt service saved as tiles; then one
  sentence, then what the two positions ran on. It draws NO absolute
  return: those run on the model's NOI before reserves and sale costs,
  and would sit beside the model's own levered IRR as a second figure
  for the same loan. The deal context carries the stated terms and what
  their value turns on (`assumableContextLine`), and the challenger gets
  the assumable-debt traps by name (`assumableNote`).

  **Wherever the deal is summarized** (#419), the loan goes too:
  - the pipeline row, at every width, as `assumableTag` ("Assumable
    3.45%", or "Assumable loan" where no rate is stated), through
    `PipelineSlots.debt`;
  - the pipeline CSV's "Assumable debt" column, and the meeting
    workbook's price-cell note beside what the price buys;
  - the memo under its title and the shared screen under the interest
    panel (`assumableLine`, the terms only);
  - the workbook's cover (`meta.assumable`: the line, plus the deal
    page's own read against the model's new loan);
  - the report's block beside the assumptions read (`AssumableBlock`,
    from the same `assumableView` the report route builds off its
    derived model).

  A document that carries no model never claims more than the terms.
- What a hotel actually earns: `lib/tools/hotel.ts` (pure — the asset class
  forty-two cards did not speak to, although the extraction readers have
  known the word "keys" since #223). A hotel's lease is one night long and
  three things follow. **RevPAR is one number made of TWO levers and they
  are not interchangeable**: 10% more rate and 10% more occupancy are the
  same RevPAR and the same top line, and a different bottom line, because
  an occupied room costs money to turn and an empty one does not — $489,657
  of value apart on the seed. The usual conclusion that rate always wins is
  wrong in one direction: occupancy brings ancillary spend and rate does
  not, so the crossing is SOLVED (`leverCrossingPerRoom`) and it is not the
  obvious `other − variable` — the probe caught that. The rooms-revenue
  terms cancel exactly between the two paths, but the ancillary revenue an
  occupancy gain brings is itself taxed by the management fee and the
  reserve while the variable cost is not, so the crossing is
  `variableCost / (1 − managementFee% − reserve%)` — $32 of housekeeping
  needs $34.41 of ancillary spend. Where the occupancy lift would pass 100%
  the two no longer reach the same RevPAR, so the WINNER is withheld rather
  than reported from a test the inputs no longer support. **The penetration
  index says whether you are the problem or the market is, and only once it
  is taken apart**: the seed takes 90% of its fair share while charging 8.8%
  MORE than its comp set, so the whole shortfall is empty rooms and a
  revenue manager reading only the RevPAR index would cut rate, which is
  precisely the wrong move; `occupancyForParityPct` states the gap at
  today's rate and clamps at 100 rather than printing an impossible figure.
  **The FF&E reserve is 4% of REVENUE and it is real cash** — `below-the-line`'s
  rule, except struck against revenue rather than NOI, which makes it
  several times the equivalent line elsewhere: an 8.00% cap quoted before it
  is 9.25%, $3.5M of price. And **the fee stack is three fees on TWO bases**
  (franchise and marketing on rooms revenue, management on total), so it is
  12.4% of rooms and 11.0% of total and neither is the term sheet's number.
  Every displayed figure derives from the rounded pieces (the debt
  schedule's rule): the three fee lines sum to the printed total, the NOI is
  the displayed figure less the displayed reserve, and the value is that NOI
  at the stated cap. Bars: `data-bar="revpar"` (three indices against a 100
  line) and `data-bar="lever"` (the two paths to one RevPAR).
- The value-add renovation program: `lib/tools/renovation.ts` (pure — page 12
  of every multifamily memorandum, quoted as one multiplication: $15,000 a
  door times 200 doors against $250 a month times 200 times twelve, "a twenty
  percent return on cost"). Four rules, and they do not all point the same
  way. **Turnover sets the pace**, because interiors are renovated when the
  resident leaves — so a "24-month program" on 200 doors is a claim that half
  the book turns every year, and the pace is the LOWER of turnover and what
  the crew can do with the binding one NAMED (`sizeLoan`'s convention). On the
  seed, turnover binds at 70 doors a year and the program runs 2.9 years
  against the 2 claimed. **The quoted premium is two numbers**: the renovated
  comp's rent less the subject's in-place rent decomposes exactly into
  `(renovatedComp − classicComp)`, what renovation buys, plus
  `(classicComp − subjectInPlace)`, the gap to a different building, which
  granite does not close — $150 and $100 of the $250 quoted, so 40% of the
  "value-add" is the comparable being a better property. It is SIGNED: a
  subject that already out-rents the comp's classic stock has its premium
  UNDERSTATED. **The make-ready is deferred, not avoided** (`buyoutValue`'s
  rule at unit scale) — paint and carpet were owed at the turn whatever
  happened, so the incremental cost is the invoice LESS the make-ready, while
  the extra weeks down are a real loss the cost per door never mentions; the
  two corrections run opposite ways, which is why neither is ever made.
  Corrected, the memorandum's 20% on cost is 13.4% and its $9.0M of value
  created is $4.5M. And **the return on cost has no clock in it**: the same
  program earns 63.7% sold the year it finishes and 31.4% held to a five-year
  exit, because 90% of its present value is the RESALE rather than the rent —
  a renovation is a transaction, not an income strategy. Both shocks are
  computed rather than asserted (`PREMIUM_MISS_PCT`, `EXIT_CAP_SHOCK_BPS`):
  the premium usually dominates, since it sets the rent and the exit where
  the cap moves only the exit, but not at every hold and cap, and a card
  asserting it would be wrong on the deals where it is not. `breakEvenPremium`
  ($56 a month) is the honest floor — the argument is how much, not whether.
  The rate comes from `irr` in `lib/underwrite/engine`, so the page and the
  workbook cannot disagree. Bars: `data-bar="split"` (the premium's two
  pieces on one track) and `data-bar="reno"` (one a year).
- Whether anyone will build against you: `lib/tools/feasibility-rent.ts` (pure).
  "We are buying at sixty percent of replacement cost" is the most quoted
  comfort in the business and on its own it protects NOTHING — replacement
  cost says what building would cost, not whether anyone will. Four rules.
  **The feasibility rent falls out of the developer's required return, not
  the market**: `rent = (totalCost × yoc + opex × sf) / (sf × (1 − vacancy))`,
  a COST-side figure that can sit above the rents being signed for years.
  **The discount to replacement cost is not the moat; the RENT GAP is**, and
  they can point opposite ways — the seeded building at 53.3% of replacement
  is EXPOSED once the market pays $52 (the market already pays $9.92/ft more
  than a new building needs), while the same building at 86% of replacement
  in a market 40% under feasibility has 11.5 years. `supplyProtected` reads
  the rent gap and nothing else, and a test drives the basis from $100 to
  $900 to prove it cannot move the answer. **Replacement cost carries
  TODAY's land price**, so the same building is a different percentage of it
  in two different years with no brick having moved — hence
  `landShareOfCostPct` beside it. And **the gap closes from either side**:
  `yearsOfGrowthToFeasibility` prices rents rising, `breakEvenHardCostPerSf`
  solves costs falling ($263.37 against the $310 assumed), and building at
  that solved cost makes the feasibility rent EXACTLY today's market rent —
  the round trip a test pins. A negative break-even is its own finding: the
  land alone is dear enough that free construction would not work. The
  developer's fee is struck on hard plus soft and never on the land. Bar:
  `data-bar="feas"` (the two rents on one track).
- The entitlement period, and the option that avoids it:
  `lib/tools/entitlement.ts` (pure — `land-residual` solves what the dirt is
  worth entitled and `zoning-envelope` what the code allows; this is the
  twelve to thirty-six months in between that a pro forma covers as month
  zero). Four rules. **THE CARRY RUNS ON THE LAND AND NOBODY BUDGETS IT** —
  a pro forma has one line called "land" and it is the purchase price, so
  the seeded $6M site at 9% over 24 months carries $1,248,600, 20.8% on top
  of the basis and $52,025 a month against any delay. Compounded, because
  interest on land is capitalised into the basis rather than paid out of an
  income the site does not have. **AN OPTION IS INSURANCE WITH A CLOSED
  FORM**: `f* = (1 − p)(L − A) + C` — the carry you avoid plus the
  probability-weighted loss on land you would be stuck with. The identity a
  test pins at every probability: where the land is worth what you paid
  whatever happens (`L = A`), the option is worth EXACTLY the carry. The
  consultants pursuing the approval are paid on BOTH paths, so
  `entitlementSpend` is reported and deliberately kept out of the
  break-even — charging it against the option is `hold-or-sell`'s
  selling-costs error. **THE RISK IS A PROBABILITY, NOT A CONTINGENCY**:
  `valueIfApproved` $1,801,400 against `valueIfRefused` −$3,498,600, an
  expectation $1,590,000 below the case a deck shows, and
  `breakEvenProbabilityPct` inverts it into how sure you would have to be
  before buying wins. On the seed there is no crossing at all
  (`optionWinsAtAnyOdds`) because the fee is UNDER the carry it replaces —
  which the probe surfaced as a bare null and is the reason land gets
  optioned rather than bought. And **"APPLICABLE TO THE PURCHASE PRICE" IS
  ONE WORD**: an applicable fee's break-even is `(L − A) + C/(1 − p)`,
  strictly larger, and it runs away toward certainty because a fee you
  always get back costs nothing — refused above `CERTAINTY_PCT` rather than
  printed as an enormous figure, with the note saying why nobody grants
  one. A site under water even approved (`deadEvenApproved`) says so rather
  than naming the path that loses less. Bars: `data-bar="entitle"` (the fee
  against its break-even) and `data-bar="path"` (the two expected outcomes,
  signed from a centre line, because either can be negative).
- The swap, and what it costs to get out of one: `lib/tools/swap.ts` (pure —
  the other half of `floating-rate`, which prices the CAP a bridge lender
  requires; this is the instrument every borrower who calls itself hedged
  actually has). Four rules, the first two the same sentence said twice
  because the trap is that people believe the second and not the first.
  **A CAP IS AN OPTION; A SWAP IS AN OBLIGATION** — a cap's worst case is
  its premium, a swap settles BOTH ways and its worst case lands on the
  side nobody stress-tests, rates FALLING. The seeded $20M swapped at
  4.50% against a 3.00% market is $845,849 under water; the position is
  monotone in the rate with NO KINK at the strike, which is the difference
  between an option and an obligation and is only visible as a shape (the
  card draws nine positions from a centre line for exactly that reason).
  **THE MARK-TO-MARKET IS THE BREAKAGE COST AND IT IS WHAT MAKES THE
  BUILDING UNSELLABLE** — and it is `prepayment`'s yield-maintenance
  finding on the opposite instrument IN THE SAME RATE DIRECTION, so a
  borrower who chose floating-plus-swap over a fixed loan for its
  flexibility chose an identically shaped exit problem
  (`sameShapeAsYieldMaintenance`). A cap's whole cost is its premium
  whatever happens, so `capWouldHaveCostLess` flips at exactly the premium
  ($277,744 of breakage against a $300,000 quote still favours the swap).
  **THE ALL-IN RATE IS THE SWAP RATE PLUS THE CREDIT SPREAD** — the swap
  fixes the INDEX only, so a "3.50% swap" on SOFR plus 250 is a 6.00%
  loan; the spread reaches the position only through the loan's
  amortisation, which is the point: a quoting rule, not an arithmetic one.
  And **THE NOTIONAL HAS TO FOLLOW THE BALANCE** or you are hedging debt
  already repaid — a flat notional on the seeded loan is $654,607 over the
  balance at the swap's end, and a swap outlasting the loan
  (`nakedMonths`) is a rate position rather than a hedge, the larger
  number and the one nobody models because the loan is gone by then.
  Balances come from `readDebt` run to whichever of the loan and the swap
  lasts longer — built only to the loan's term the notional FLATLINED at
  the balloon and overstated the naked position, the one figure that case
  exists to report. Two more the probe bought: `annualCostOfBeingWrong` is
  struck on the notional outstanding today, not the original loan (it read
  $300,000 flat on a notional that had already amortised), and an EXPIRED
  swap says so rather than falling through to the coupon of a loan whose
  hedge has run off. Bars: `data-bar="swap"` (the ladder, signed from a
  centre line) and `data-bar="notional"`.
- A grid of comps, adjusted to the subject: `lib/tools/comp-grid.ts` (pure).
  Every analyst does this and it is the one calculation on `/tools` whose
  METHOD is argued over — and the argument is worth a rounding error while
  two things nobody argues about are worth millions. **The adjustment is
  applied TO THE COMP, so an inferior comp adjusts UP**: the sign convention,
  the commonest error in a grid, and getting it backwards costs roughly twice
  the adjustment — $2,524,284 on the seed, a ninth of the deal, which
  REVERSES the answer rather than shading it (the ask reads defensible one
  way and 11.4% rich the other). It hides in a grid whose adjustments point
  both ways (5.0% there against 11.3%) and never quite cancels, because the
  comps sit at different bases. **The time adjustment comes first and is the
  one left out** — $743,844 against $10,668 for the sequential-versus-additive
  argument, seventy times over, which is the finding the module exists to
  make checkable. Both conventions are ordinary practice and no grid says
  which it used; the sequential one is reported, because a relative statement
  compounds and because summing can take a price to zero or below
  (`additiveWentNegative`, the one place the convention is not taste).
  **Gross adjustment measures comparability; net does not** — ±15% nets to
  zero and is 30% judgement — and a flagged comp is still shown, since
  dropping it leaves thinner evidence. **The reconciliation is weighted by
  inverse gross**, floored at `MIN_GROSS_FOR_WEIGHT` (5) because the inverse
  runs away near zero and made a 1%-adjusted comp worth twice a 2% one. Grades
  a set by the same floors `lib/public-comps` uses — under three is not a
  grid, under five is thin. `readGridText` takes the pasted table, sharing
  `cellsOf` with `unit-mix`; a true CSV whose figures also carry grouped
  thousands is REFUSED and handed back rather than guessed at (it collapsed
  one line into a price of 184,000,001,848,826). Bars: `data-bar="grid"` and
  `data-bar="graderr"` — and the catalog's collision guard files a marker
  named in a comment ABOVE a card function under the card BEFORE it, which is
  how that comment first reported a collision between two unrelated cards.
- The statement's rent against the building's: `lib/tools/straight-line-rent.ts`
  (pure). GAAP does not report the rent a tenant paid — it reports the TERM'S
  TOTAL OVER THE TERM, the same figure every year — so an "NOI" read off an
  audited statement is deliberately not cash, and nothing says so because to
  an accountant it is not a discrepancy. Four rules. **The sign REVERSES**:
  early in an escalating lease the statement is above cash, late it is below,
  and they cross exactly once (`crossingYear`) — so "knock ten percent off for
  straight-lining" is wrong half the time IN THE WRONG DIRECTION. On the seed
  (20,000 SF at $32, 3% bumps, six months free) the gap runs +$381,688 in year
  1 to −$133,367 in year 10, crossing at year 5. **Free rent is averaged in
  too**, which is why year 1 reports $701,688 against $320,000 collected —
  119%, the widest the gap ever gets. **The gap capitalises** ($42,488 at 6.5%
  is $653,662 of price), and it prices capitalising THIS year's reported
  figure against THIS year's cash without claiming either is the right year to
  capitalise. And **the deferred rent receivable is the SELLER's** — the
  cumulative gap, $424,177 here, written off at closing because the buyer's
  own straight-line starts fresh. The identity the module rests on and a test
  pins: **the cumulative gap returns to exactly zero at expiry** — straight-line
  moves rent between years and never creates any. A flat lease with no
  concession has NO crossing rather than one at year 1: the two lines are the
  same line, and saying cash "overtakes" a figure it never trailed would be a
  lie the test caught. Bar: `data-bar="sline"` (one a year, signed from a
  centre line).
- What the site actually holds: `lib/tools/zoning-envelope.ts` (pure). A
  development pro forma opens with a unit count that almost always comes
  from ONE line of the code — usually density, because it is the one
  written as a number of units — and the code imposes four caps at once.
  Four rules. **The answer is the MINIMUM and the binding cap is its real
  name** (`sizeLoan`'s convention, applied to dirt): the seeded two acres
  allow 160 by density, 198 by floor area, 238 by the height-and-coverage
  envelope and 140 by parking, so parking binds and nobody writes that
  down. **Floor area ratio is measured GROSS and a unit is sold NET** — a
  900 SF apartment at 82% efficiency consumes 1,098 SF of it, so dividing
  buildable area by the unit size claims 242 against the 198 the code
  allows, 44 units that are not there (`naiveUnitsByFar`). **Surface
  parking is not a separate cap but a JOINT constraint** — the spaces and
  the footprint compete for the same site, solved together as
  `units × (ratio × SF_PER_SURFACE_SPACE + unitGross / floors) ≤ site`;
  a deck escapes the land and pays in the envelope instead, which is worth
  20 units here, and whether it consumes floor area is a fact about the
  code so it is an input. With no storey count there is no footprint to
  trade against, so the parking cap is null rather than assuming one
  storey. And **a density bonus is a trade with a computable break-even**:
  the set-aside is struck against the BONUSED count, so
  `bonusBreakEvenPct = s(M−R) / (M − s(M−R))` — 8.7% at a 20% set-aside on
  the seeded rents, and a 5% bonus for that set-aside costs $150,000 a year
  while reading as free density. The crossing is continuous and apartments
  are whole, so the realised sign flips a little above it (a 9% bonus is
  still $12,000 down) — documented, not a rounding bug. Bars:
  `data-bar="envelope"` (the four caps on one track) and
  `data-bar="setaside"` (restricted against market). **`cap` was already
  taken** by the cap-rate card and the catalog's collision guard caught it.
- What the LP actually nets: `lib/tools/fee-drag.ts` (pure — the sponsor's
  fees layered around `runWaterfall`, never re-implementing the ladder). The
  IRR on a syndication's cover is the PROPERTY's return, and the gap to the
  LP is TWO numbers from two causes that move opposite ways: the promote,
  earned only on performance and disclosed on its own page, and the fees,
  collected either way and sitting in three lines at the back with no
  arithmetic attached. Modelling only the waterfall sees the disclosed half.
  Four rules. **An acquisition fee is quoted against the PRICE and paid out
  of the EQUITY** — two denominators, and the larger one is in the deck:
  1.5% of a $30M price is 4.11% of the $10.95M cheque, taken on day one. It
  is an extra cheque at closing (`sources-uses`' rule), never netted from a
  distribution. **The asset management fee's BASE is the lever the term
  sheet omits** — "1.5%" is $164,250 a year on invested equity and $54,000
  on gross revenue, so both are computed whenever both are available, and a
  revenue base with no revenue given SAYS SO rather than charging nothing.
  **The fees are senior to the pref**: run the seed weak (a 3.4% property
  return) and the promote is exactly zero while $1,581,250 of fees is paid
  in full — 100% of the sponsor's compensation on a deal that failed its
  investors. And **the fee share grows as the deal weakens**, which is why
  the take is drawn twice: 47.6% fee as underwritten, 66.5% on an exit
  `DOWNSIDE_EXIT_HAIRCUT`% softer, because the promote more than halves
  while the fees fall $40,000. That haircut is struck against the SALE
  PRICE, not the final flow — the flow is net of the loan payoff, so
  $4,000,000 off the sale against $2,150,000 off the flow, and it moves the
  property's return 20.63% → 13.49%. Cutting the flow would understate the
  downside by exactly the leverage. Identities the tests pin: with no fees
  the LP's net return IS the waterfall's, and with no promote either it is
  the property's. Bars: `data-bar="feereturn"` (the three returns on one
  track) and `data-bar="sponsor"` (fee and promote, two rows).
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
- A deal's address, and where it comes from (#441). The row's `address`
  holds a picked suggestion (the autocomplete's structured pick, with a
  state), a typed line, or nothing. A typed line used to be stored as a
  label and nothing else, and a deal uploaded with the address box empty
  had no address at all, although its memorandum names its street. Every
  reader found blank fields: no market figures, no market photograph, no
  street-level geocode (so a district-wide aerial with no ring), no Street
  View and no flood tab. Now:
  - `addressFromLine` (`lib/address.ts`, pure) reads a line's street (the
    part before the city that opens on a number, a spelled one included),
    city, state and ZIP (after the street, so a five-digit street number
    is never it). A line naming no state is not read.
  - `typedAddress` stores a typed line read that way (the deal actions),
    and the matchers read a label-only address the same way
    (`readableAddress` in `lib/market-match.ts`), never over a field the
    address states.
  - `memorandumAddress` is the extraction's stated street address, marked
    `from: "memorandum"`; never a portfolio's, and never a line with no
    street, which places a market, not a building.
  - `addressUpgrade(current, extraction)` is the one rule for what a row
    should become: a blank address takes the memorandum's, a typed line is
    filled from itself, and a picked suggestion, a line with no state, an
    address with fields and no line, and the sample are never touched. The
    screen writes it right after the extraction; the pipeline page and the
    deal page write it for deals screened before, and read it for that
    view whatever the row's policy allows; the compare page, the report
    and the workbook read it too.
  - The location cache is kept with the address it was resolved for
    (`geoFor`, `geoKey`: the line and whether it named a street;
    `GEO_VERSION` 3), and a Street View verdict with the point it was
    reached for (`checkedFor`). Before, an edited address kept the old
    one's point, so the aerial, the pin and the flood zone showed the old
    place for up to a month.
- Where a deal is, by its county (#447). The markets' keyword lists name
  principal cities and a few counties, so a deal in Frisco, Irvine, Fort
  Lauderdale or Cranberry Township read its STATE's figures.
  `data/cbsa-counties.json` is the Census Bureau's delineation (List 1,
  July 2023): all 1,252 metropolitan counties of the 393 metro areas, by
  five-digit FIPS, with each county's CBSA, division, name and state.
  `scripts/fetch-cbsa-counties.mjs` wrote it, run by `cbsa-counties.yml`
  (dispatch only). That workflow publishes to its own `cbsa-counties`
  branch, since the sandbox cannot reach census.gov; the runner printed
  the file first (zori.yml probe run 36655654711). `lib/market-county.ts`
  (`server-only`: the table is 130 KB and `lib/market-match` is
  universal) does two things:
  - `countyOf(address, siteFlags)` finds the county. First choice is the
    building's census tract from the site flags, used only where the tract
    lies in the state the address names and the flags were looked up for
    this address (`siteFlagsStale` in `lib/site-flags/core.ts`: an edited
    address keeps the old point's tract until the lookup runs again).
    Otherwise it takes the county the address names, whole: "Collin
    County", "City of Alexandria". A bare "Richmond" is never read, since
    Virginia has a Richmond city and a Richmond County in different places.
  - `placeDeal(address, county)` answers every "where is it" question at
    once: `briefed`, `read`, `placedBy`, `live`. With no county it is
    exactly the address matchers' answer. With one:
    - the county decides the metro area. The keywords, read with the
      county's name beside the address, only choose among the markets
      inside it (`marketsForAddress` in `lib/market-match` lists every
      match). A word naming a place in another metro area is dropped:
      Kingston, WA is in Kitsap County, not King, and Dade City is Pasco
      County's, so Tampa's by Tampa's own word, not Miami's;
    - a county the market's own keywords name is that market's, brief and
      all (Irving by its tract is Dallas County; Pasadena is Los Angeles
      County);
    - a county they do not name reads the metro area's published figures
      and nothing else (`read` plus `placedBy`): Orange County is in Los
      Angeles's metro area, and Los Angeles's brief, tracker and
      benchmarks are Los Angeles County's. `modelVsMarketFor` reads no
      tracker for a `placedBy` market. Washington's metro area reads
      `dc`'s figures (the MSA's), New York's `nyc`'s, or `newark_jc`'s in
      New Jersey;
    - a county in no metro area the site reads places the deal in none:
      the state's figures, whatever its words matched.

  Every surface places the deal through this one function: the
  pipeline's market check, the deal page (live figures, market photo,
  research panel, public-record card), the pipeline list, the compare
  page, the report route and the workbook route. The market check's
  header, the deal page's fold, the shared screen, the report and the
  verdict's brief each say how a county-placed deal reached its market
  (`lib/placed-by.ts`, no imports, so the client fold can take it; the
  stored record carries `placedBy`). The pipeline row reads "Dallas–Fort
  Worth · Collin County" and the compare row "(by its county, …)".
  The screen looks the site flags up itself where the page has not
  (`siteFlagsForScreen` in the pipeline, at most `SITE_FLAGS_WAIT_MS`,
  15 s): a batch upload, or a deal whose address came with its
  memorandum, has no page view before its market check. The flags are
  read once, before the comp step, for the flood line and the county.
  "Since this screen" compares only a stored brief whose market is
  today's (`storedBrief.metro === liveMarket.name`). A check stored for
  the state before the county placed the deal is a different market's
  figures, and no move between the two is a move.
- A rule's jurisdiction (#452). `jurisdictionOf` in `lib/research.ts` answers
  "yes", "no" or "unknown", comparing names WHOLE. The first version
  matched any name containing another, and let a county stand in for a
  city: "Los Angeles County" read the City of Los Angeles's rent
  stabilization onto Pasadena, "Baltimore County" Baltimore City's rental
  license onto Towson, and South San Francisco, Chicago Heights and East
  Newark each read their neighbour's rules. The rules:
  - a county's rule holds where the deal's county is that county;
  - a city's rule reads the building's municipality where the Census
    geocoder named it (`RuleSubject.place`);
  - without it, the address's own place names decide. A county of the
    city's name places the deal in the city only where the county IS the
    city (`CONSOLIDATED`: San Francisco, Philadelphia, New York's five).
    Elsewhere it is "unknown", which `evaluateRules` shows as "possibly
    applies" with `within_city_limits` asked;
  - a rule filed under "… City" is an independent city, which a county of
    its name does not contain.

  The municipality comes free with the tract. The site flags' one
  `geographies/coordinates` call carries "Incorporated Places" and
  "Counties" beside the tract (`parseCensusPlace`, `parseCensusCounty`;
  the runner printed the shape in zori.yml probe run 36658903671, through
  `scripts/probe-url.mjs`'s JSON describer):
  - Van Nuys is "Los Angeles city";
  - Pasadena is "Pasadena city";
  - Brooklyn is "New York city";
  - Towson has no place layer at all, which is unincorporated (null),
    never unknown.

  Flags carry `v: SITE_FLAGS_V` (3 since #472 and #473). An answered
  lookup from before is made again on the deal's next view
  (`siteFlagsOutdated`), and `buildSubject` takes the Census county over
  the address's own.

  **The Opportunity Zone check** (#473). The zones were designated on 2010
  tract numbers, so the lookup asks the geocoder again under its
  `Census2010_Current` vintage (`layers=Census Tracts`, a call of its own:
  the current vintage answers the current tract under the same layer name —
  the runner printed both, and Frisco's 2010 tract 48085030408 is
  48085030410 today) and checks the zone by it (`ozTract`,
  `vintage: "2010"`), falling back to the current number, with
  `OZ_CURRENT_NUMBER_CAVEAT`, only where that call fails. The answer comes
  first from `data/qoz-tracts.json` (`lib/qoz.ts`, server-only): the CDFI
  Fund's list of all 8,764 designated tracts (8,566 low-income communities,
  198 contiguous, in 56 states and territories; updated December 14, 2018;
  the Fund's note says the official list is the IRS's), read on the runner
  by `scripts/fetch-qoz-tracts.mjs` — the `qoz` job of `cbsa-counties.yml`,
  published to the `qoz-tracts` branch, since the sandbox cannot reach
  cdfifund.gov; the header's first cell carries the filter note above
  "State", so columns are found by a cell's last line. The registry
  (`incentive_zones`, Maryland's tracts unless a national layer is loaded)
  is asked only for a tract the list does not name, and a registry that
  cannot be read leaves the list's answer. A miss is "not on the list" only
  where the list holds the tract's state (`opportunityZoneFrom`,
  `OZ_STATE_RULE_V`: a v2 miss was read against any state's zones and now
  reads as not checked), and a check that did not run says why (no tract,
  the tract lookup failed). The labels name the list's year ("Tract not on
  the 2018 Opportunity Zone list"), so they stay true whatever is
  designated later.
- What the site says is held to its sources (#473, an audit's fixes):
  - **A rule's words are the file's.** Nothing but
    `scripts/seed-research.mjs` writes a rule's text to the database (the
    steward only stamps `as_of` on a re-verification, the intel job reads
    ids), so `mergeRules` (lib/research-data) takes each rule the file holds
    from the file, and the database's later `as_of` only where its words
    are the file's own, compared key-order-free since jsonb reorders keys; a
    rule only the database holds is kept. Taking the database's copy kept a
    corrected rule wrong until someone reseeded.
  - **Rolling windows roll.** California's and Washington's new-building
    exemptions are `building_age_years_lt` (15 and 12, as their statutes
    count), read against the current year; a permit year alone can prove a
    building young, never old.
  - **One list of outside services.** `lib/data-processors.ts`, printed by
    the security and privacy pages (`app/processor-list.tsx`) and held by
    its test to the hosts the code calls.
  - **A date or none.** `metroFact` returns the figure with its snapshot's
    `as_of`, `asOfLabel` says "as of …" or "undated", a research file with
    no date is never given a typed-in one (a source scan guards it), and
    the demo's 2–4 unit median prints its month through `twoToFourMedian`.
  - **A rule of thumb says so.** The memo's and the report's market flags,
    and the deal page's overview risk, call a typical range a rule of thumb.
  - **The challenger computes a tax reset only from the memorandum's own
    bill and assessed value**, and otherwise says the tax line resets and
    the rate is the assessor's to give — never an assumed ratio or millage.
  - **The second audit** (2026-09-30, #478), each claim read against the
    code. A recorded-sales feed is "live" only where the provider registry
    runs it (`compsFeedLive` in lib/public-comps/core; Washington's
    `dc_its` is documented, `configured: false`). The homepage's Excel
    copy describes `lib/underwrite/workbook.ts`'s tabs (the first-draft
    workbook and its conflicts sheet were retired in July). Outside the
    covered markets the screen does not stop: statewide rules evaluate and
    the market check reads the metro area's or state's figures. The rules
    are "source-linked" (one has no source, five cite secondary sites),
    the nine major markets are "nine of the largest", and "the AI never
    does the arithmetic" became what is true: the cash flows, returns,
    loan sizing and scores are computed in code. The homepage's buy-box
    chips are the sample's own checks against `SAMPLE_DEMO_BOX`.
  - **A Claude step that judges financing is handed today's rates**:
    `ratesPromptLine` (lib/debt-index) writes the seeded indices — the
    tenor the model prices off, the 10-year, 30-day average SOFR — dated,
    from `debtSeeds`' own freshness rule, and null where nothing is fresh.
    The screen reads the series bare (`isDebtSeedSeries`,
    `todaysRatesLine` in the pipeline) and appends the line to the
    challenger's notes, after the document so the cache never moves; the
    first-draft model's reconciliation gets it through `liveDebtSeeds`.
  - **The Opportunity Zone answer names its round**: beside every answer
    from the 2018 list, `OZ_NEXT_ROUND_NOTE` says the next round's zones
    take effect January 1, 2027 and the 2018 zones run to December 31,
    2028 (data/research/tax_law.json).
- Each building's own photograph: `lib/om-photo.ts` (pure) reads the JPEG
  image objects out of the deal's memorandum — a `/DCTDecode` stream IS the
  JPEG's bytes, verbatim, and `jpegInfo` reads its width, height and
  component count off the SOF marker — and `scanShaped` admits one of a
  photograph's shape (`COVER_MIN` 480×320, an aspect between 0.5 and 2.6,
  three or four components because a one-component image is a mask).
  Which one is the cover is the PAGES' to say (#444, below): the scan
  supplies the camera's bytes for the picture they choose, and guesses
  only where pdfjs cannot read the file. Only what the file states: a Flate-then-DCT
  stream, a form object, a stream that is not a JPEG are all skipped, never
  decoded. `lib/deal-picture.ts` (`server-only`) makes the two derivatives
  with sharp — a hero inside 1600px and a 240px cover-crop by attention for
  the pipeline thumbnail — stores them at `photos/<dealId>/<stamp>-hero.jpg`
  and `-thumb.jpg` (`dealPhotoPath`; storage kind `photo`, scope-checked
  like every other object; migration 0034's row assertion does not cover
  the `photo` column, so the classifier is the gate), caches the pair in
  `deals.photo.picture` and `ensureDealPicture` runs the extraction on the
  deal's FIRST VIEW: never on the sample deal, never twice inside thirty
  days of a memorandum that had no photograph (`pictureCheckedAt`), at
  most two in flight per process, and the page reads whatever is cached
  rather than waiting. `/api/deals/[id]/picture?size=hero|thumb` serves
  it; `/api/deals/[id]/image` (the pipeline row) and `PropertyVisual` both
  put it FIRST (`imagePlan`'s `hasPicture`, the Photo tab), and the credit
  follows the source — `PICTURE_CREDIT`: "From the offering memorandum" or
  "Photograph added to the deal" — so a memorandum's picture is never
  credited to Google or to USGS. A replaced memorandum drops the picture
  taken from the old one; a picture the reader added ("Replace photo" /
  "Add photo" on the deal page, `replacePicture`, 12 MB, never on the
  sample) survives a reissue. **A secured memorandum's cover is found
  too** (#440). A broker's "secured" file (printing or copying locked:
  an owner password over an EMPTY user password) encrypts every stream,
  the photographs included, so the byte scan found no JPEG and the deal
  showed its market or an overhead; so did a photograph stored as pixels
  (`/FlateDecode`, a PNG). `lib/om-photo-decode.ts` (`decodeOmCover`)
  opens the file with pdfjs as a viewer does (RC4 40 and 128, AES 128 and
  256 — a file that asks for a password to OPEN is never read), reads the
  images the first `COVER_PAGES` (4) pages paint, skips a greyscale
  picture (sampled pixels, since pdfjs hands grey over as RGB) and a mask,
  decodes inside `MAX_DECODE_PIXELS` and `DECODE_BUDGET_MS`, never throws,
  and says what it managed (`opened`, `pageOneRead`). The pixels go to
  sharp raw (`PictureInput`, an alpha channel laid on white). **The cover
  page's photograph, never a map** (#444): the scan had taken the largest
  JPEG in the WHOLE file, and a memorandum's largest pictures are its
  "property aerial" and its location maps (a 4800 × 3600 export beside a
  1600 × 1200 cover), so a card could show a map credited as the
  building's own photograph. Every memorandum is read through the pages
  now (`coverOf`): page one's largest photograph wins outright, whatever is
  larger further in (`pickDecodedCover`), the next three pages are decoded
  only where page one holds none, and nothing past page four is a
  candidate. A photograph is told from a map, a site plan, a chart or a
  page of text by `flatShare` — the share of an even 64 × 64 sample, cut
  to five bits a channel, its eight commonest colours cover — under
  `FLAT_SHARE` (0.6), measured before it was set: 23 Commons photographs
  reached 0.39, 18 USGS aerials and 12 flood composites 0.46, a road map
  0.87 as a JPEG and 0.98 as a PNG, a site plan 1.00, a page of text
  0.96. The picture chosen is served as the file's own JPEG where one of
  the same size and the same colour on a 16 × 16 sample exists
  (`storedJpegOf`, so a different picture of the same size is never taken
  for it), as pixels otherwise; only where pdfjs cannot read the file, or
  ran out of time before page one, does the scan guess: the FIRST
  photograph-shaped, non-flat JPEG in the file's first 30%. The tests
  build real files with the report's own PDF writer
  (`lib/test-memorandum.ts`, `@react-pdf/pdfkit`, and `testMap`, a
  location map's flat fills), every cipher, a PNG, a map on the cover, a
  larger picture on page three, one past page four, a file pdfjs cannot
  open, and a user password refused. A verdict carries the rules it was
  reached under (`pictureSearchV`, `PICTURE_SEARCH_VERSION` 3;
  `searchedRecently`), and so does a picture: a memorandum photograph
  lifted under older rules (`staleOmPicture`) is judged again on its next
  ask (`lib/deal-picture.test.ts` drives it with storage faked) —
  replaced by the cover page's, dropped where the first pages hold none,
  kept while reads of the memorandum are cut short and dropped at the
  third in a row (#479: it had been stamped with today's rules and kept for
  good, and it may be a map); a page render shows the old
  one at once and judges behind it, and the pipeline asks for it like one
  never looked for (`pictureMayBeInMemorandum`, the picture faded in over
  the next source). The reader's own upload is never judged again. Searches take turns
  (`RunGate.acquireWithin`): the two picture routes wait up to
  `SEARCH_WAIT_MS` (20 s) for one and share a search already running for
  the deal, where they used to answer "not yet" at once, so the first view
  of a pipeline shows every picture it can. A page render never waits
  (`waitMs` 0), so a busy process costs a deal page its photograph this once
  and never its speed. On a card, the unread memorandum's photograph is
  `pending` (`bannerSources`): `DealBanner` shows the next picture at once
  and asks for the photograph over it, invisible and out of the
  accessibility tree, then fades it in under its own credit the moment it
  loads, or drops it on a 404. Checked in Chromium over a harness, with a
  slow, a missing and a fast photograph. **The shared screen and the IC memo lead
  with it too** (#434): they had printed the USGS aerial alone, so a
  partner opening the link, or a committee reading the memo, met the
  roofs of the block while the sender was looking at the building.
  `SharePicture` (`app/share/[token]/share-picture.tsx`) walks the stored
  photograph through the token-scoped `/api/share/[token]/picture` (only
  what is stored — a share never reads the memorandum — revalidated
  against the stored path, so a revoked link's picture stops with the
  link), then the aerial, the credit following whichever loaded; the
  memo's cover and so the report's first page take the photograph cut to
  the cover's pixels (`coverPictureFor`, `fitCover`), credited as the
  memorandum's or the reader's, the aerial behind it. Google's frames
  stay off the public page and off paper. **And every list of deals
  pictures each one** (#435, `app/(app)/deal-avatar.tsx`, `DealAvatar`):
  the building at avatar size through the pipeline row's own
  `/api/deals/[id]/image`, asked at twice the slot, lazy, a plate where
  nothing loads so the names start at one x — in the ⌘K list with the
  call's dot on its corner, and beside each comparable in the deal page's
  "From your pipeline" comps. **A building's photograph is never fetched
  from a listing portal or an image search**: the memorandum's cover was
  sent to the reader to evaluate this deal, which is exactly this use, and
  a portal's photograph is under that portal's terms. The Street View
  photograph remains the operator's `GOOGLE_MAPS_API_KEY` path. **The
  compare page pictures every building it compares** (#418): each column
  on desktop, and each card on a phone, opens on the deal's picture. The
  list of sources is `bannerSources` in `lib/deal-banner.ts` (pure, in
  `imagePlan`'s order): the deal's own cached photograph, then Street
  View where the key and a street address allow, then the USGS aerial —
  no Google satellite at card size. Each source is PINNED to one route, so
  the corner credit is exactly the picture on screen. `DealBanner` (client)
  advances to the next source when one fails, and the credit follows it.
  Nothing loads, or there is no address and no photograph: a blank plate
  with the building mark holds the slot. A picture that failed before
  hydration fired its `error` with no listener, so the banner also checks
  on mount (`complete` with no `naturalWidth` is a failure). The
  pipeline's `DealThumb` makes the same check, and since #420 it shows
  on a phone too: it was `hidden` below `sm`, so the width where a list
  reads most like a set of places showed none. It is 56px there (its
  `srcSet` asks for 168px, a 3× phone's slot, since the map sources are
  rendered at the size asked for) and 48px from `sm` up (#428; it was a
  36px postage stamp). Below
  `sm` the row's call leads its price line rather than taking an 88px
  column: beside the picture, the column left the name "The Maddox /
  at…". **The pipeline opens as cards** (#428, `DealTile` in
  `app/(app)/deals/pipeline.tsx`, the Dealpath / listing-site pattern): a
  card a deal in a grid (one column on a phone, up to four wide), led by
  the building's picture through `DealBanner` at `CARD` (720×450, 16:10)
  with the call on it as a solid chip, the flood / interest / assumable
  tags on it, then the name, the class and place, and price, cap (or yield
  on cost) and fit, with the stage select in a footer outside the link.
  `bannerSources` gained `memorandumUnread` (lib/deal-picture
  `pictureMayBeInMemorandum` — a memorandum nobody has looked for a cover
  in: the picture route lifts it on this first ask, or 404s and the next
  source follows, credited as the memorandum's since only it can be
  uncached) and a `marker` on a street address's aerial (a ring at the
  centre; never on a neighbourhood placement). **Pictures, not maps**
  (#438, the operator's words for the pipeline): an overhead at card size
  reads as a map, so a card with no photograph of the building's own and
  no Street View shows the photograph its market is known by before the
  aerial — `marketPictureFor` (`lib/market-picture.ts`, pure: the
  address's briefed market or metro area read without a brief, else the
  market the memorandum names through `metroForName`, a suburb with no
  photograph of its own borrowing its metro's through `metroAliasOf`),
  handed to `bannerSources` as `market` by the pipeline page only (two
  compare columns in one market would show one skyline twice). The card
  names it on its face — "Market photo" over the market's name on a shade
  at the foot (`data-picture="market"`), the photographer and licence
  beside it (`photographerLine`), the place in its alt text with "No
  photograph of the building yet" — and `lib/market-picture.test.ts`
  holds every market the site covers to having a photograph for its
  cards, its own or its metro's. The compare pick sits beside the call,
  clear of the caption. **No overhead on the pipeline at all** (#442):
  the page passes `aerial: false` to `bannerSources`, so a photograph
  that fails, or a deal outside every photographed market, falls to the
  deal's COVER (`lib/deal-cover.ts`, pure, drawn by
  `app/(app)/deals/deal-cover.tsx`): an evening illustration of its kind
  of building (`coverKindFor` through `assetClassKey`: an apartment block,
  homes, an office tower, a warehouse, a storefront, a hotel, storage
  doors, a staked parcel, a plain building — lit from a low sun, some
  windows glowing, a distant city or hills behind) under one of eight
  skies picked by hashing the deal's id (`coverToneFor`, the old
  gradients' index, so a deal keeps its hue), with the deal's own draw
  (`coverVariantFor`) of the sun, the lit windows and the building's form,
  so two deals of one kind are two buildings; and at a card's foot "No
  photo yet" over its place (`coverPlace`: the address's city and state,
  else the market's name, else the memorandum's words) — the market
  caption's type, and its accessible name saying there is no photograph of
  the deal yet. A wide frame's horizon sits at 72%, so the words sit on the
  ground on the smallest card (224×140), and `lib/deal-cover.test.ts` holds
  the place to AAA and the eyebrow to AA over the worst pixel under each
  line, before the shade, across every kind and sky. The list row's thumbnail had asked the image route for
  "the best picture", which fell to the USGS aerial for every deal
  without a photograph — a column of little maps; `DealThumb` now takes
  the card's own sources at the `THUMB` frame (168px, which asks for
  the stored 240px crop, `size=thumb`), the memorandum's photograph
  faded in over the cover while it is searched, and never the market's
  photograph: a skyline is a sliver at 48px, and its licence wants the
  photographer named beside it, which a row has no room for. The
  compare page keeps its aerial, where two columns' overheads tell two
  buildings apart, and the deal page keeps it one step along its
  filmstrip. **And every other small picture of a deal** (#443):
  `/api/deals/[id]/image?fallback=cover` never tries an overhead
  (`imagePlan`'s `overhead: false`, through `fetchBestBuildingImage`)
  and, where no photograph of the building answers, draws the deal's
  cover as an SVG (`coverSvg` in `lib/deal-cover-art.ts`, pure and
  dependency-free, laying the scene out for the frame asked —
  `coverLayout`, `SMALL_FRAME_PX` — and the ONE document `DealCover`
  paints as its background through `coverImage`, so the card, the row and
  the avatar show one cover for one deal and no extra request; the class
  the deck turned out to be through `shownAssetClass`; the route's ETag
  carries `COVER_EDITION`, so a browser holding the old drawing is sent
  the new one). `DealAvatar`
  (⌘K, the comps from the reader's own pipeline, the sticky bar) and
  the pipeline map's hover card ask for it; a caller that does not keeps
  the overheads and the 404. The SVG carries no words, script or style,
  refuses a tone that is not a hex colour, and is served under
  `default-src 'none'`; `lib/deal-cover-art.test.ts` draws every kind
  through sharp (librsvg), so a document a browser could not read fails
  there, and drives the route with its reads faked. **The deal page opens
  on the same photograph** (#439): `PropertyVisual` takes the page's
  `marketPictureFor` as `market` and adds a Market view, leading only
  where there is no photograph of the building's own and no Street View
  (a picture that fails to load hands the lead to it), the aerial, the
  flood map and the map one step along the filmstrip, "Add photo" on it.
  Both surfaces draw ONE caption, `MarketCaption`
  (`app/(app)/deals/market-caption.tsx`, pure). The List view is one
  `ViewToggle` away; the choice of cards or list is a cookie the page
  reads, so the server draws the view the reader left without a flash of
  the other, and the map is opened for a visit and never landed on
  (`landingView`, `remembersView`). **Both live in
  `lib/pipeline-view.ts`, never in the pipeline's client module**: every
  export of a `"use client"` module is a client reference on the server,
  so the page read `cookies().get(PIPELINE_VIEW_COOKIE)` with a function
  as the name, found nothing, and opened every visit on the cards — the
  list the reader chose was silently never read (and a helper called that
  way throws, a 500). `lib/client-reference.test.ts` reads every source
  and fails on a server file importing a value (an ALL_CAPS or camelCase
  export) from a client module. **The aerial is drawn at the photograph's own
  grain** (#429): `MAX_SOURCE_ZOOM.aerial` is 17. The aerial sheet
  (`scripts/probe-aerial.mjs`, `skyline-sheet.yml`'s aerial mode, pushed
  to the `aerial-sheet` branch — run 36193817674, eight places six ways,
  judged by eye) showed z19 as the export stretching NAIP's metre-scale
  photograph into mush everywhere, downtowns included, and z18 soft; z17
  is crisp. `fetchAerialImage` holds an explicit zoom to the cap too (the
  flood route clamps to the same cap, so its overlay can never be asked
  for a frame the aerial will not draw) and every USGS frame, the metro
  overheads included, passes `finishAerial` (`lib/aerial-finish.ts`: a
  little contrast and colour into the flat midday light, an unsharp mask
  sized to the grain; tone only, so the flood overlay still lies over it
  pixel for pixel). The deal page's Aerial tab rings a street address's
  building (`data-picture="aerial-pin"`), and its views are a FILMSTRIP
  under the picture (#432, `PropertyVisual`), where they were a row of
  words: each view's own picture under its name (`data-view-thumb`), the
  one on screen ringed, the Flood thumbnail FEMA's zones over the same
  frame and the Map a glyph. A thumbnail draws the very URL its view
  draws, so it costs no request the view does not already make, and one
  that fails takes its view away as the view failing would. **Every view
  opens full screen** (#445, `app/(app)/deals/[id]/photo-viewer.tsx`): a
  click on the picture, or the expand control at its top left (the top
  right is Replace photo; never over the map), opens `PhotoViewer`, a
  dialog over the page with the views one at a time at the largest size
  the site holds them (the overheads at 1280 × 960 rather than the
  header's band), each with its own view's credit, the building ringed on
  an overhead of a street address, the arrows, the arrow keys and a swipe
  stepping between them, and the views' own pictures along the foot. Esc,
  Close or a click on the dark closes it and gives the focus back; while
  it is open the focus stays inside and the page behind does not scroll.
  It renders through a portal into `document.body`, since a transformed
  ancestor would hold a fixed layer to its own box; `PhotoViewerBody` is
  the markup, which the render test draws with no page to portal into.
  Checked in Chromium over CDP: keys, wrap, the focus trap, the return of
  focus and scroll, the backdrop, at 1280 and 390. **A picture is never
  soft and never half-drawn** (#446), a listing site's three habits:
  - **Enough pixels for the screen.** A market photograph on a card is
    asked at `MARKET_PHOTO_WIDTH` 1600 (it was 1280, the link previews'
    width): a panorama cropped into a 16:10 card is covered by its HEIGHT,
    and a phone's full-width card is ~224px tall, 672 device pixels at 3×,
    which a 2.5:1 panorama reaches only near 1,680px wide — so a
    photograph whose size the table records (`SkylineShot.size`, every
    served file's, as the verify probe prints it) is asked at the route's
    2400 step where 1600 would fall short of 672 tall
    (`marketPhotoWidth`: Louisville's 4.2:1 panorama was 383px tall).
    `CityPhoto`
    takes a `sizes` and offers the skyline at `SKYLINE_SRCSET` (480 / 960
    / 1600, `skylineSrcSet` in lib/skyline) and an overhead at twice its
    size; a tile's `sizes` says the width the picture must be drawn at to
    fill the tile's HEIGHT, up to 1.9× a 4:3 tile's own width. Measured in
    Chromium at seven screens against a 2.5:1 file, the homepage's gallery
    and the submarket cards draw no tile past 1.09× its pixels; the one
    480px file had been stretched 1.9–2.2× on every phone and dense
    laptop. **The bands too, and lighter** (#451): every Commons JPEG is
    encoded again before it is held or served (`lighten` in
    lib/skyline-fetch: upright, sRGB, no metadata, mozjpeg at
    `SKYLINE_QUALITY` 82, kept as Commons sent it where that would not be
    smaller or cannot run) — Commons renders at an archive's quality
    (Washington's 1600px frame was 616 KB) and real photographs from the
    contact sheets came out at 53–57% of their bytes — which makes a 2400px
    width affordable, so `SKYLINE_SRCSET` is 480 / 960 / 1600 / 2400 and
    `PlaceBackdrop` offers it (`sizes`: the full width for a page's band,
    the 72rem column for `MarketBand`): a phone takes 1600 and a dense
    laptop 2400 where one 1400px file had been stretched twice over. The
    PHOTOGRAPHS step's byte counts are what a visitor downloads.
  - **A small photograph enlarged by us, not the browser.** A memorandum
    exported for email carries its cover at 600–900px; `derivePicture`
    enlarges a hero under `HERO_MIN_PX` (1200) with Lanczos and a light
    unsharp mask, never past `MAX_ENLARGE` (2×) — compared by eye against
    the browser's stretch of the same file — and
    `PICTURE_SEARCH_VERSION` 4 re-derives the memorandum pictures lifted
    before.
  - **Shown only once whole.** `DealBanner` and `DealThumb` hold the frame
    with the deal's cover (`DealCover`'s `words={false}`: the illustration
    without its words, `aria-hidden`, no "No photo yet" over a photo on its
    way)
    and fade the picture in on `load` — never its progressive scans, never
    an empty frame; the mount check catches a load that finished before
    hydration. The first four cards are `loading="eager"` and
    `fetchPriority="high"` (React also emits a preload link for them), the
    rest lazy, and a card's picture zooms a little on hover
    (`motion-safe:`).
  - **Its own colours first** (#463, the blur-up): every stored photograph
    carries a `preview` (`DealPicture.preview`) — the hero `PREVIEW_PX`
    (24) px on its long side as a WebP data URI, a few hundred characters,
    made by `previewOf` in `derivePicture` for the cover and each gallery
    photograph and kept in the photo cache — and `lib/photo-preview.ts`
    (pure) turns it into ONE CSS value, `blurredBackground`: an SVG with a
    Gaussian blur over the preview (next/image's blur-placeholder
    technique, with `edgeMode='duplicate'` and an opaque alpha so the edges
    never fade to white), guarded by `isPreview` (a small base64 image data
    URI and nothing else, since it lands in a style attribute).
    `DealBanner` and `DealThumb` paint it (`data-preview`) in place of the
    cover while the deal's own photograph loads (`bannerSources`'
    `picturePreview`, on the stored photo only, never a pending one); the
    deal page's photograph, mosaic tiles and gallery views and the shared
    screen's picture carry it as the `<img>`'s own background. A cover
    stored before previews gets one from the hero bytes the picture route
    already holds, after the response (`backfillPreview` in `after()`: the
    row read again just before the write, and the preview put only onto the
    picture stored then if it is still the one the bytes are of, so a
    photograph replaced while the request ran is never put back); gallery
    photographs get theirs when their gallery is next read.
  **And in the emails** (#464): the screen-complete email opens on the
  building (a 520px banner linked to the deal) and the Monday digest puts
  each deal's 48px square beside its name, the way a listing alert does. A
  mail client fetches with no session, so the picture comes from
  `/api/email/picture/<token>?s=banner|thumb`, public, where the token is
  the whole permission (`lib/email-picture`: the deal's id and an expiry,
  `EMAIL_PICTURE_DAYS` 365, signed with an HMAC key derived from the
  service-role key under a label of its own — no new secret, and rotating
  that key retires every link already sent). The route serves only what is
  stored and never searches: the photograph cut to the frame by attention,
  else the deal's cover (`coverSvg` for the banner and the square alike,
  laid out for each frame), both as JPEG; a bad token, a deleted deal and the sample
  answer 404. `/api` is outside the proxy's matcher, so no sign-in bounce
  reaches it. Before the screen-complete email goes, `emailPicture`
  (lib/email) looks for the memorandum's cover where nobody has yet
  (`pictureMayBeInMemorandum`), with `ensureDealPicture`'s `gallery:
  false` — the cover alone, so the worker never decodes sixteen pages
  beside the next screen; the gallery waits for the deal's first view —
  bounded by `EMAIL_PICTURE_WAIT_MS`, and the banner's alt names a
  photograph only where the search (or the cache) says there is one. The
  deal's bridge, rent roll and valuations pages head with `DealCrumb`
  (`app/(app)/deals/[id]/deal-crumb.tsx`: `DealAvatar` at its `md` 40px
  beside the way back).
  **Found sooner, drawn sharper** (#477). The screen lifts the cover
  itself, right after the extraction and beside the steps that follow
  (`liftPictureBeside` in the pipeline: the bytes it already holds, the
  cover alone, never the sample, only where `pictureMayBeInMemorandum`,
  waiting at most `SCREEN_PICTURE_WAIT_MS` 30 s for a turn and settling
  within `SCREEN_PICTURE_MS` 60 s; a failure is a log line). **A read cut
  short says nothing**: `readCover`'s `complete` is true only for a read
  that reached its end (or a file that cannot be opened at all), and a
  read the time budget cut short writes no verdict — it is counted
  (`pictureRetry`), the next waits `RETRY_AFTER_MS` (10 minutes, then 2
  hours), and the third in a row (`MAX_CUT_READS`) stands for the month;
  `PICTURE_SEARCH_VERSION` 5 looked again at the old "none" verdicts,
  while `PHOTO_RULES_SINCE` 4 keeps every photograph already lifted. A
  gallery read the time cut short is counted the same way (#479,
  `galleryRetry`, `galleryRetryWaiting`): stored as far as it got without
  `galleryV`, never over a stored gallery it found fewer of, the third in a
  row taken as the gallery. **A cover is written onto the picture its
  search began from** (#479, `storePicture` through `swapPicture`, the row
  read at the write): the screen's lift held its copy of the row through
  its wait for a turn and replaced a photograph the reader uploaded
  meanwhile, leaving the upload's files outside every deletion sweep. A
  memorandum's cover, or a drop of an old one, now loses to a picture
  stored meanwhile (its own new files go), a reader's upload goes over
  whatever is there, and the files removed are the picture actually
  replaced, `full` copy included.
  **JPEG 2000** covers decode: `lib/pdfjs-wasm.ts` hands pdfjs its wasm
  decoder on every `getDocument` (the same value each time — it is
  process-wide), tested on a real JP2 (`lib/test-jpx.ts`). **A full-size
  copy** up to `FULL_MAX_PX` (2560) is kept where the source is larger
  than the hero (`<stamp>-full.jpg`, `?size=full`, swept with the rest by
  `picturePaths`), and `lib/photo-srcset.ts` writes the `srcset` and
  `sizes` for the deal header, the mosaic's tiles and the viewer from the
  page's own layout, so only a screen that needs it fetches it; older
  memorandum photographs are derived again quietly behind a view
  (`DERIVED_VERSION`), replacing the stored one only where the pages give
  the same photograph by its hash, never a reader's upload. **Crops stay
  centred.** A focal point from sharp's attention analysis, applied as
  `object-position`, was built and reverted: judged by eye on 31 real
  photographs cropped to the header's 21:9 and a mosaic tile, the point
  sat on an edge or a corner in 8, and on the one-tower shot most like a
  memorandum's cover it pulled the band down to the cars and cut the
  crown. The 240px thumbnail keeps its attention cut; nothing else does.
  **The memorandum's other photographs are the deal's gallery** (#448): a
  listing shows the building from every side, and a memorandum carries
  those pictures while the site showed one. `decodeOmPhotos`
  (`lib/om-photo-decode`) walks the first `GALLERY_PAGES` (16) pages
  through the same page walker as the cover (`walkPaintedImages`; an image
  painted on several pages is visited once) and hands each photograph —
  by the cover's own rules (`coverShaped`: colour, a photograph's size and
  shape, never flat) — to a callback while its pixels are alive, so one
  decoded picture is held at a time, never the set. A picture within
  `NEAR_BITS` (10) of one already taken, or of the cover, is the same
  photograph placed again (`differenceHash`: 64 bits, neighbouring cells'
  brightness on a 9 × 8 grid of 4 × 4 means; a resized copy lands within a
  few bits, two photographs twenty or more apart), up to `GALLERY_MAX` (8)
  inside `GALLERY_BUDGET_MS`. `galleryOf` (`lib/deal-picture`) derives
  each as the cover is (the file's own JPEG where it stores one), and the
  cache keeps them as `DealVisualCache.gallery` (`DealPicture` with its
  `page`) with `galleryV` (`GALLERY_VERSION`). **It is read behind the
  cover in the same turn** (the search answers with the cover and holds
  its turn until the gallery is stored), and for a deal whose cover needs
  no search — the reader's own, one already current — in a turn of its
  own only if one is free now (`refreshGalleryBehind`); the cover's hash
  comes from its stored hero (`hashOf`, the same hash through sharp).
  **A gallery gives way to a cover**: it is not started while a cover
  search waits for a turn, and one under way stops at its next picture
  the moment one does (`coverWaiting`, `decodeOmPhotos`'s `yieldTo`) —
  a cover is what a card is holding a placeholder for, and an incomplete
  gallery is never stored, so a later view reads it whole.
  **A gallery photograph never becomes the cover**: past the first pages
  it may be the neighbourhood, so it is credited with its page
  (`memorandumPhotoCredit`: "From the offering memorandum, page 7") and
  never leads a view. The picture route serves it as `?g=N` from what is
  stored, never searching; a replaced memorandum drops it
  (`clearOmPicture`), the deletion sweep counts it (`picturePaths`), and
  the sample deal and the shared screen never have one. On the deal page
  each is a view of its own after the cover (`g1`, `g2`… labelled "Photo
  2", "Photo 3"), the filmstrip drawing its stored 240px crop and its hero
  asked for only once its view is opened; `data-picture="photo-count"`
  beside the expand control says "2 / 5" on a photograph and "5 photos"
  elsewhere (a way to the first), and the viewer steps through them all.
  The pipeline card counts them over the deal's own photograph
  (`DealBanner`'s `photos`, a camera and the number, "photographs" for a
  screen reader). **And flips through them there** (#450, a listing
  card's habit): `DealCard.slides` (the gallery's heroes, each with its
  page's credit, only where the card leads with the deal's own
  photograph), and `DealTile` holds which is on screen. The arrows are
  buttons OUTSIDE the card's link (`data-flip="photos"`, an overlay of the
  picture's shape with `pointer-events-none` and the buttons re-enabled,
  since a button inside an anchor is invalid), hidden at rest and shown on
  hover or focus, and always on a touch screen (`pointer-coarse:`); a
  horizontal swipe across the picture flips too, and a dot a photograph
  (five at most, a window round the one on screen) says where you are.
  `DealBanner` lays the one asked for (`slide`) over the lead photograph,
  fades it in once whole and moves the credit and the count ("2 / 5") to
  it only then; one that fails is dropped from the card's set
  (`onSlideGone`), so the arrows, dots and count never point at a picture
  the card cannot show, and a card whose own photograph failed offers
  nothing (`onPhoto`). The next photograph is asked for on the first hover
  or touch, one ahead of the reader. Checked in Chromium with the device's
  own hover and pointer (`--blink-settings=primaryHoverType=…,
  primaryPointerType=…`: headless Chromium reports no hover and no
  pointer, and `Emulation.setEmulatedMedia` ignores both features, so
  without the flag every hover style reads as broken).
  **And the deal page opens on them as a mosaic** (#458, `MOSAIC` in
  `PropertyVisual`): where the deal has a photograph of its own and two
  more from the memorandum, the Photo view splits its frame from the
  header's 42rem up — the cover across two thirds, the next two stacked
  beside it (`data-picture="mosaic"`, `data-mosaic-tile`), each asked for
  at the cover's size (`size=hero&g=N`, lazy, since a phone keeps the one
  picture), each credited with its page ("Memorandum, p. 7", the full
  credit as its title), each opening the viewer at itself, the last
  saying "+N more". The reader's Replace photo moves onto the cover tile,
  and a tile that fails drops the mosaic back to the one picture. Checked
  in Chromium at 390, 820 and 1280. **The full report prints them too**
  (#459): `galleryPhotosFor` (lib/memo/cover-aerial) reads up to
  `PHOTO_PAGE_MAX` (4) stored gallery heroes, cuts each to
  `PHOTO_PAGE_SIZE` (512 × 340, twice the 256 × 170 pt frame) by
  attention, bounds each as the cover is and credits it with its page;
  the report's "The property" page (`PhotosBlock`, two to a row) sits
  before the site's, and fewer than two photographs — the memo's cover
  already prints one — makes no page. It reads only what is stored, never
  the memorandum.
  **The deal
  page opens the way a listing does** (#433, `app/(app)/deals/[id]/deal-hero.tsx`,
  `DealHero`, pure): the picture is the header's own — no card of its
  own, marked `data-hero-picture` — beside the name, the call and the
  three figures where the header is 48rem wide, and first where it is
  not (at 21:9 on a laptop's width, so the figures stay on the first
  screen); the tools sit in a bar beneath, Replace photo on the picture
  itself. The split reads the header's OWN width (a container query —
  the sidebar takes 240px of every desktop) and a `:has()` on the
  picture, so a header whose picture unmounted is never half an empty
  column. The card never clips: `overflow-hidden` would cut the share
  panel and the deal's menu, which open out of the toolbar, so the
  picture rounds its own top corners and the toolbar its own bottom when
  it is the last row. **The deal stays in view past it** (#437,
  `app/(app)/deals/[id]/deal-sticky-bar.tsx`, `DealStickyBar`): once an
  IntersectionObserver sees `[data-deal-hero]` leave, a slim bar holds
  the building (`DealAvatar`), the name (a button back to the top), the
  call and the header's own price and return figures, word for word (one
  `priceFigure` / `returnFigure` feeds both, so "Price · 49% share" never
  loses its tag). It is fixed at the top from `md` (clear of the 240px
  sidebar) and at the foot on a phone (under the thumb, clear of the
  app's sticky top bar), and hidden it is `inert` and `aria-hidden`, so
  no reader meets the header twice. **Every Leaflet map is `isolate`**:
  Leaflet's panes sit at z-index 400 to 1000 and each map's basemap
  switch at z-[1000], which with no stacking context of their own drew
  over the phone's z-10 top bar as the map scrolled under it (checked in
  Chromium: the map's overlay path was the element on top at the bar's
  point); `lib/map-isolation.test.ts` holds every file that loads Leaflet
  to a `relative isolate` wrapper. **And on one map** (#431, `app/(app)/deals/pipeline-map.tsx`,
  `PipelineMap`; the rules pure in `lib/pipeline-map.ts`): the third view
  beside Cards and List (`PipelineView` `"map"`, the same cookie) draws
  every deal the filters leave as a pin in its call's colour — the split
  bar's four — hollow where the placement is vaguer than a street, with a
  hover card of the building's picture, name, call and figures (every
  string escaped: a name is whatever its owner typed) and a click that
  opens the deal (or selects it in compare mode, where the pin wears a
  brand ring). A pin sits on the location `lib/deal-location` cached for
  the deal's own pictures — the page reads the cache and never geocodes
  (`cacheFresh`), and the map places the rest on its first view through
  the cached location route, three at a time and `MAX_TO_PLACE` at most;
  `partitionForMap` keeps placed, to-place and unplaceable apart and
  `placementLine` counts every deal in exactly one of them, so a deal no
  geocoder could place is counted, never guessed. It frames the pins until
  the reader moves the map, then adds a late pin without pulling the view
  away.
- FEMA's flood map over the building (#425, rebuilt #472): the deal
  page's picture has a Flood view for a deal with a street address
  geocoded finer than a neighbourhood (neither centre is the building): the
  USGS aerial at `FLOOD_ZOOM` (17, about 1.5 × 1.1 km) with FEMA's National
  Flood Hazard Layer zones drawn over it, a ring at the frame's centre (the
  building), a key of the zones the picture shows and one sentence on the
  zone at the building.
  **It is drawn once a deal and kept** (`lib/flood-map.ts`, `server-only`;
  the pure half is `lib/flood-frame-core.ts`). The first cut asked two
  pictures of two federal hosts on every view (the aerial 10 s with no
  retry, FEMA 15 s), kept nothing, and removed the view whenever either
  missed; the runner measured both hosts answering a cold first request in
  20–30 s, so it failed "sometimes": the cold views. Now
  `ensureFloodFrame` draws the deal's frame — 4:3, `FLOOD_FRAME`, the
  aerial finished (#429), brought to the zones' pixels and calmed
  (`FLOOD_AERIAL_MUTE`), FEMA's zones at `scale` 2 for the same ground
  (dpi 192; the service allows 4096 px a side) — stores it at
  `flood/<dealId>/<stamp>.jpg` (storage kind `flood`) and records it on the
  deal's photo cache (`DealVisualCache.floodFrame`: the path, the point it
  was drawn around as `pointKey`, the version, the classes each crop shows).
  A frame stands while `floodFrameCurrent` says so (same point, same rules,
  under 30 days); one draw a deal at a time, two a process (`RunGate`), a
  failure never recorded. The deal page draws it behind its first render
  (`after()`), so it is usually there before the view is opened. Every
  request is asked twice (`askTwice`: a throw, a 5xx or a non-image is asked
  again) with a 35 s timeout sized to the cold answer.
  `/api/deals/[id]/flood?w=&h=` cuts the frame from its centre to the
  shape asked for (`floodCrop`, never past the frame's pixels): the view's
  own 16:9 at 1x and 2x (`FLOOD_VIEW`), the filmstrip's 192×108, the
  viewer's whole 4:3, the report's band. A frame not drawn yet is drawn and
  waited for up to 50 s; a longer draw goes on behind the request, which
  answers 503 so the page asks again; `?meta=1` answers the classes instead
  and says by status which failure a picture was — 404 nothing to draw,
  503 not drawn yet. The URL carries `v=<FLOOD_FRAME_VERSION>.<pointKey>`,
  so a moved deal asks for a new picture. `PropertyVisual` shows a plate
  ("Drawing FEMA's flood map…") until the picture is whole, fades it in,
  retries three times a little later each time, reads a failure that
  settled before hydration on mount, and says the map did not come through
  if it never does — the key and the sentence stay. The viewer takes the
  whole frame at its drawn pixels; there is no second overlay image any
  more.
  **The zones in the site's palette** (`lib/flood-style.ts`, pure). The
  service reports `supportsDynamicLayers: true`, so `floodDynamicLayers`
  POSTs (the class list is some 80 KB, `nfhlRestyledForm` in
  `lib/basemaps.ts`, the one frame definition shared with `usgsAerialUrl`)
  FEMA's own zones layer three times, top first: hatches, tints and
  outlines, white casings. The classes are FEMA's legend entries by their
  FLD_ZONE,ZONE_SUBTY values, "<Null>" and the empty subtype included — a
  first cut keyed on SFHA_TF drew nothing over Hoboken's Zone AE, and
  FEMA's renderer has no default symbol, so a value no entry lists is
  undrawn in both. The 1% zone blue, its floodway red-hatched OVER the
  blue (it is part of the 1% zone; hatch alone read as the river), the
  0.2% zone amber, future conditions purple, levee areas teal and brown,
  Zone D grey; FEMA's labels off. The legend is FEMA's own, cached a day,
  else the runner's copy (`data/nfhl-legend.json`, `VENDORED_LEGEND`,
  generated from flood-sheet run 36745937081's index — never edited by
  hand). **FEMA's layer transparency is not to be trusted either way**: the
  zones layer carries 70% of its own, and one run returned the restyle's
  tint at alpha 32 (105 × 0.3) while a run thirteen minutes later, with
  the identical request, returned 105 — so every overlay is measured
  (`overlayAlphaScale`, the interior tint's alpha against the asked one)
  and a scaled one corrected (`unscaleAlpha`); an alpha that fits neither
  is not kept. **The key is read off the drawn pixels** (`classesIn`, by a
  tint's interior at its own alpha — colour alone keyed a levee class in
  New Orleans where amber met a dark-blue outline — and the floodway by its
  red hatch), per crop (`cropRegion`), and matched FEMA's own frame query
  on all eight places the runner drew (Hoboken, Houston, Manayunk, New
  Orleans, Galveston, Sacramento, St. Louis, Miami Beach); the building's
  own class leads, marked (`floodClassOfZone`). The swatches are CSS on the
  page (`floodSwatchBackground`) and PNGs from `floodSwatchSvg` in the
  report. **Everything FEMA-shaped was printed by the runner first** — the
  sandbox cannot reach hazards.fema.gov — through `scripts/probe-flood.mjs`
  in `skyline-sheet.yml`'s flood mode (it restates the restyle for plain
  Node and a test holds the two equal), which pushes each place's
  composite, overlay, aerial and the zones' polygons (`frameQuery`) to the
  `flood-sheet` branch: the zones are layer 28 of 32 (resolved at run
  time by name, `resolveNfhlLayerId`), drawn only finer than 1:36,112
  (hence `FLOOD_MIN_ZOOM` 15), and **Zone X of minimal hazard has no
  legend entry — FEMA maps it and leaves it undrawn**. A vector drawing is
  possible (`frameQuery` answers in 0.1–3 s) but New Orleans' polygons are
  228,000 vertices, 5 MB a frame, so the export stays the source.
  **The sentence** (`floodZoneLine`) says the zone, FEMA's name for it and
  what it means for a loan — a Special Flood Hazard Area needs flood
  insurance on a federally backed loan, and the premium belongs in the
  expense line — with FEMA's base flood elevation where it states one
  (STATIC_BFE with its unit and datum; FEMA writes -9999 for none) or an
  AO zone's depth; the regulatory floodway (new building and fill
  restricted) and a V zone (storm waves add to the flood) say so; open
  water says the point is likely off the building, an area the map does not
  include says another map covers it, Zone D says FEMA has not determined
  the hazard, and a bare Zone X says only that it is outside the Special
  Flood Hazard Area. A point with no zone polygon ("FEMA's digital flood
  map has no zone at the building's point") is kept apart from minimal
  hazard. **The zone said is the zone under the ring**: the site-flags
  lookup (`runSiteFlags`) looks up at the deal's own point
  (`resolveDealLocation`, the one its pictures are drawn around) where it
  used to geocode the line itself (Photon's first result), asks FEMA and
  the Census twice at 25 s, and a lookup whose flood zone FEMA did not
  answer is asked again after `FLOOD_RETRY_MS` (6 h) — one timeout used to
  be kept for good. `SITE_FLAGS_V` 3 remakes every answered lookup on its
  deal's next view. **`/api/flood/health`** (public, `floodHealth`) draws a
  small restyled frame of a public place from Render's own network and
  names each step — the layer list, the legend against the runner's copy
  (values FEMA added or dropped listed), the overlay and whether FEMA sent
  it at its own 30%, the aerial — kept ten minutes a process; live-verify
  prints it after every deploy. **The tract's own Census figures wait on a
  key**: the ACS data API now answers a keyless request with a redirect to
  `missing_key.html` (probe run 2026-09-25), so a free `CENSUS_API_KEY` is
  the operator's move before the site reads a deal's tract.
  **The zone goes wherever the deal is summarized** (#426), one reader per
  shape in `lib/site-flags/core.ts`, each from the stored lookup and silent
  while it is pending:
  - the pipeline row's red tag in a Special Flood Hazard Area only
    (`floodTag`: "Flood AE"), and the CSV's "Flood zone" column in every
    case (`floodCell`: "AE (SFHA)", "X (minimal)", "no FEMA digital map");
  - the compare table's "Flood zone" row (`floodCell`, the SFHA in red);
  - the memo under its title and the shared screen under its assumable
    line (`floodShortLine` — the SFHA and every drawn hazard in FEMA's
    words, nothing for minimal hazard or an absence);
  - the deal context the Claude steps read (`floodContextLine`, passed to
    `dealContextFor` by the pipeline where the lookup has answered by the
    time the step runs): in an SFHA the expense line needs a flood premium
    the seller's figures may not carry.

  **The full report prints the map** (#427) on a page of its own, "The
  site", before the portfolio and the terms: `floodMapFor` takes the deal's
  frame (drawing it where it must, bounded at 20 s, the draw going on for
  the next report and the page) cut to `REPORT_FLOOD_SIZE`'s band at twice
  its points, the key of the classes that band shows with the building's
  own in bold, and `floodZoneLine`, so the report and the Flood view say the
  same thing. The picture and every swatch pass `intactImage` before they
  are embedded; the ring is drawn by the PDF over a dark halo. It never
  throws: a frame not drawn in time leaves the words without the picture,
  and a deal with no street address, or no zone and no picture, gets no
  page. `lib/flood-map.test.ts` drives the draw, the correction, the keep,
  the crop and the key against a faked network and bucket with real
  pixels; the report test reads the page back from the PDF.
- The homepage's hero (2026-09-30): its words sit at the TOP of its band,
  where the shared "band" scrim is clear, so it has a scrim of its own
  (`scrim="hero"` in `app/place-band.tsx`). Below lg the photograph is a
  strip across the top (`HERO_STRIP`, 18rem / 22rem) fading into the band,
  and the words start at its foot (`HERO_WORDS_TOP`); from lg the words'
  column is dark from the left (`HERO_SIDE_SCRIM`) and the photograph
  shows across the sample card's side. Measured in Chromium over a pure
  white frame, the headline had read 1.9:1 on a phone and 3.0:1 on a
  laptop; every text box now reads 6:1 or better, and
  `lib/place-band.contrast.test.ts` holds the strip to the words' start
  and the column's tiers to the floor.
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
  measured too. **A market's own band on `/market` is `MarketBand`**
  (#409 — one component for the briefed markets and the ones read without
  a brief) under a third shape, `"caption"`: the proportional "band"
  scrim is 85% opaque at 55% of the height because a page's opening
  words can reach 60% up, and on a 256px card band that veiled the lower
  half of every photograph. `CAPTION_SCRIM` is anchored in PIXELS to the
  tallest words the band holds (an eyebrow over a name wrapped to two
  lines on a phone, 110px), clear by 208px, and the band is 15rem / 21rem
  so everything above that is picture; the contrast test imports the
  stops and holds white to AAA and the accent eyebrow to AA at every
  point the words reach, against the same pure-white frame. **A
  submarket opens on its metro's photograph** (#424): the submarket's
  metro is whatever its owner typed, so `metroForName`
  (`lib/market-match.ts`, pure) reads it only where the text says which
  market it is — the site's own name for one, whole ("Northern
  Virginia", "Pittsburgh PA", "Dallas-Fort Worth"), or a city with its
  state through `placeOf` and the address matchers ("Arlington, VA",
  "Brooklyn NY", "DC" — the District is its city), with "metro", "MSA"
  or "market" dropped off the end. A bare city is never read
  ("Portland", "Columbus" and "Richmond" are each more than one place),
  a state alone is no metro, and nothing falls back to the state's
  market, since a state has no photograph or page. The page
  (`app/(app)/submarkets/[id]/page.tsx`) then opens on `MarketBand`
  with the market's name as the eyebrow and the submarket's as the
  page's `h1` (`as="h1"`; the market pages keep `h3`), and links to the
  metro's market page; the band's name is clamped to two lines
  (`line-clamp-2`, held by the contrast test) because the scrim is
  measured to a two-line name and a submarket's is user text. The
  "Your submarkets" cards on `/market` are `SubmarketCards`
  (`app/market/submarket-cards.tsx`, pure, rendered in
  `lib/views.render.test.ts`): each card whose metro names a market
  opens on a strip of its photograph wearing the market's name
  (`data-picture="submarket"`), and ONE credit line under the grid names
  every photographer shown (`galleryCredit`, and
  `OVERHEAD_GRID_CREDIT` where a market shows its overhead — the same
  line the homepage's gallery prints).
- How many markets (2026-09-30): every count a page states reads
  `lib/market-count` — `MARKET_COUNT` (15: the Washington area's four
  briefs are one market), `BRIEF_COUNT` (18, what a grid of tiles shows,
  and the homepage's gallery says why the two differ) and `MARKETS_READ`
  (41, with the 26 metro areas read without a brief — /market's search
  description had said 44 by counting the Washington area four times).
  `lib/market-scope.test.ts` pins all three.
- Being found (#430): `lib/public-pages.ts` (pure) is the one catalogue
  of the public market and sector pages — every briefed market and every
  metro area read without a brief (`marketPages`, each once), every
  sector (`sectorPages`) — and `marketMeta` names each: its own title,
  description and canonical (`/market?metro=dc`), a brief claimed only
  where there is one, a metro winning over a sector when a link carries
  both. `app/market/page.tsx`'s `generateMetadata` reads it (the page had
  gone out as one bare "Market data" under forty-odd addresses), and
  `app/sitemap.ts` lists every page from the same catalogue. The
  homepage's JSON-LD names the Organization and the WebSite beside the
  SoftwareApplication and the FAQ, `<` escaped as Next's own guide does.
  Search Console's and Bing's HTML-tag tokens render from
  `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` (root layout's
  `verification`, nothing until set). The site serves an IndexNow key at
  its root (`public/<key>.txt`) and `scripts/indexnow.mjs` (via
  `indexnow.yml`, weekly and on dispatch) checks the live key and hands
  the live sitemap to IndexNow — Bing, and through it DuckDuckGo and
  Yahoo; `lib/indexnow.test.ts` holds the served file to the script's
  key. `lib/canonical-host.ts` (pure) is the move to the operator's own
  domain, inert until `CANONICAL_HOST` is set: a GET or HEAD at another
  public host goes to the canonical one with a 308, path and query kept,
  while `/api` (a webhook does not follow a redirect), `/auth` (an email
  link's code is exchanged against a verifier cookie on the host it was
  requested from), a posted form and a local server never move;
  `proxy.ts` asks it first. The domain itself is a purchase and the
  operator's (WILL_TODO's first section has the order of the move:
  Render's custom domain, `NEXT_PUBLIC_APP_URL` on web and worker,
  Supabase's URLs, then `CANONICAL_HOST` last). Live-verify fetches the
  sitemap and the key and greps Pittsburgh's page title. **Each market
  page previews its own city** (#436): a shared `/market?metro=` link had
  gone out under the homepage's title and the site's one card, because a
  child's `openGraph` replaces the root's wholesale, so the page's
  `generateMetadata` states the preview's title, description and picture
  (`marketMeta`'s `image`). A metro's picture is
  `/api/og/market/[id]` (`lib/og-card.tsx`): the market's own skyline
  (`lib/skyline-fetch`, the one Commons fetch and cache the skyline route
  shares) cut to 1200 × 630, the words drawn by next/og in its bundled
  Geist as a transparent layer and laid over by sharp as a JPEG, with the
  photographer's credit, the licence and "cropped" on the card — and a
  photograph whose credit the card's font cannot draw (`cardCanDraw`:
  Philadelphia's 颐园居) stays off the card, the business district's USGS
  overhead (`lib/metro-overhead`, shared with the overhead route) standing
  in; where neither answers, a 307 to the site's own card, never a blank.
  Live-verify prints each card's type and size (`OG CARD`).
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
- **The market check reads the metro's published figures** (#381): where
  a deal's address sits in a covered market (`metroForAddress`), the
  pipeline reads the same rows the market brief draws for a visitor — the
  metro's FRED / BLS / Census series (`metroSeriesFor`, `readMetroRates`),
  Zillow's and Realtor.com's `benchmarks` rows — bare, through
  `lib/live-rates-query.ts` (the one copy of each query; the page readers
  wrap the same functions in `unstable_cache`, the pipeline cannot, since
  the worker has no Next cache), and `lib/live-market-brief.ts` (pure)
  writes them out one dated, sourced line a figure ("Unemployment 3.4% (Jul
  2026, Washington MSA; FRED), +0.2 pt on the month before"; the year of
  permits summed against the year before, never a month; the metro's
  vacancy with its margin; Zillow's asking rents "before concessions";
  Realtor.com's list prices "asks, not sales"). `liveMarketClause` appends
  the block LAST, after the deal context, so the cached document prefix
  never moves, and tells the model to check an OM assumption against the
  FIGURE where one answers, cite it with its date, keep `typicalRange` as
  the norm the figure is read beside, and state a metro figure as the
  metro's, never the submarket's or the building's. Three rules: only a
  FRESH figure is said (a stale series is left out, the strip's own
  freshness); a blank is absent, never zero; and a read that fails is a
  check without figures, never a failed screen. The figures handed in are
  stored on the result (`MarketResult.liveBrief`: metro, the day read, the
  lines) so the deal page's market section can fold them open under the
  summary — a check's evidence is never hidden. Outside the covered markets
  the check reasons from typical ranges alone, as before, and the aside
  still says "not pulled comps". The pipeline test's fake database answers
  `rates` and `benchmarks` for a Washington deal and pins the text the
  check was handed. **The figures are stored as values too**
  (`liveBrief.figures`, keyed by metric and dated), and **the deal page
  says what moved since** (#382, `lib/brief-delta.ts`, pure): the page
  reads the same metro's figures today through the cached readers and
  `briefDelta` compares by key in each figure's own unit — a share in
  points, a dollar figure and a count in percent, days in days, a rank in
  places with a smaller rank hotter — and keeps three things apart that
  must never read the same: a newer observation that moved, a newer
  observation that did not ("unchanged at 41 days", a fact), and a figure
  the publisher has not updated since the screen ("no newer figure"). A
  figure read then and unreadable now is left out rather than shown as a
  move to nothing. `SinceThisScreen` under the folded brief prints the
  day, the counts and one sentence per move (`moveSentence`). **And the
  demand side is a picture there** (#395, `lib/metro-demand.ts`, pure):
  `metroDemand` turns the metro's rows read today into a picture's rows —
  all payrolls first, then each sector against a year ago, the sector
  that fills this building's kind marked by the same map the market
  check reads (`sectorJobsFor`), a stale sector kept and named with its
  date — as PLAIN DATA, because `deal-view.tsx` and `deal-sections.tsx`
  are client components and handing them the rows rather than the series
  keeps the series table out of the browser bundle. `MetroDemandCard`
  (deal-sections.tsx, `data-bar="demand"`) draws it under the folded
  brief: the building's own sector full, the others faded, rental
  housing singling nothing out, each figure linked; the page threads it
  through `DealView` and the analyses panel as one prop, off the figures
  it already reads for the model's checks, and nothing renders outside
  the covered markets or before the pull has written a sector row. **The
  demo draws the same picture on the sample** (#396,
  `app/demo/demand-card.tsx`, `SampleDemandCard`, pure): the metro the
  sample's own address falls in through `metroForAddress`, read through
  `liveMetroRates`, beside the leverage card — the one page a visitor
  reads without signing in showing what a screened deal gets; the sample
  is an apartment building, so nothing is singled out. The bars are
  `app/demand-bars.tsx` (`DemandBars`), the ONE picture the deal page's
  client card and the demo's server card both draw, so it takes plain
  rows and imports nothing but a type. **`metroDemand` takes the deal's
  CLASS, not a sector, and writes the sentence under the heading itself**
  (`intro`), because the sentence is the class's: rental housing runs on
  all payrolls; a class that reads no sector — storage, land, a net
  lease, parking, a data centre — says so, where the first cut called
  every deal without a sector rental housing, which a self-storage
  facility is not; a sector the metro has no row for is named as
  missing; a kind nothing has read yet is said to be unread. A failed read leaves
  the card out, never the page down, and the card renders only when the
  read answered — so a NOT DEPLOYED on its marker after a deploy means
  the read had nothing, not that the build is old. `lib/views.render.test.ts`
  draws it on a fixture and checks the marker's phrase against
  `renderToString`. **The supply side rides beside the demand side**
  (#397, `lib/metro-supply.ts`, pure): the units the metro area permitted
  in buildings of two or more over the last twelve months against the
  twelve before — the pipeline an apartment underwrite competes with.
  **FRED publishes no multi-unit permit series for any metro or state**
  (probe 35928492801: `BP5FH` and `BP24FH` "do not exist" for every
  metro tried and for Pennsylvania; only the nation has `PERMIT5`), but
  it carries each metro's SINGLE-FAMILY permits (`<CITY><NNN>BP1FH`,
  fourteen series, metric `permits_1unit`), so the multi-unit figure is
  the total less the single-family series, month by month, and every
  surface says so ("the total less the single-family series, since FRED
  carries no multi-unit series for a metro or a state" — one constant,
  `NO_MULTI_UNIT_SERIES` in `lib/permit-split.ts`; the first wording said
  no split was published at all, and a market check saved with it is read
  through `currentBriefLine`). Three rules: the two series are aligned
  by their own dates and a month one of them lacks leaves BOTH sums, so
  the subtraction never runs across different months; a month of permits
  is the season, so the figure is twelve months against the twelve before
  (`permitsTrailingYear`) and a partial year is null, never scaled; and
  the share is of the same window. The single-family series is never a
  tile or a line of its own — it feeds the picture. Where it shows: the
  market brief's permits line carries the split with its own figure key
  (`permits_multi_ttm`, so since-this-screen compares the pipeline), and
  the prompt clause names it as what a supply claim on rental housing is
  checked against; `/market` draws each year as one stacked bar under the
  sector picture (`SupplyPicture` in `metro-live.tsx`, `data-bar="supply"`,
  single-family in the neutral tone, the remainder in the brand tone, a
  suburb's heading wearing the MSA's name); and `MetroDemand.supply`
  carries it to the deal page's demand card and the demo's for RENTAL
  HOUSING ONLY (`SupplyLine` in `app/demand-bars.tsx`) — an office does
  not compete with new apartments. The Census counts are not seasonally
  adjusted, which is why the window is a year. **And the insurance line
  has a published figure** (#398, `INSURANCE_INDEX_ID` in
  `lib/live-market-brief.ts`): the BLS producer price index for premiums
  for commercial multiple peril insurance — the policy a building carries
  — against a year ago (`PCU9241269241265_YOY`, printed by the runner in
  run 35929534333 before it was trusted), in the strip's inflation fold
  ("Property insurance premiums y/y"), on the market brief for every
  operating class as the nation's carriers and never this building's
  quote (figure key `insurance_index_yoy`; land reads none), in the
  prompt clause as what the insurance line is checked against, and in
  the model's expense-growth check beside CPI and core — SHOWN beside the
  price indexes and never averaged into them, because the tone reads the
  expense base against prices and folding one line's repricing into the
  band would let a 3% model read "inside" a 3–8% range. The read says
  why: a memorandum's premium is the seller's expiring policy, bound on
  limits the seller chose in a market that may no longer exist, and the
  index says how far a new owner's quote has moved. **A deal outside the
  covered metros reads its STATE's figures** (#399): every state and the
  District publish unemployment, payrolls, permits (and the single-family
  split), house prices, the survey's annual rental vacancy and the five
  sector payrolls, and FRED carries them under one pattern a state
  (`<ST>UR`, `<ST>NA`, `<ST>BPPRIV`, `<ST>BP1FH`, `<ST>STHPI`, `<ST>RVAC`,
  `<ST>PBSV` / `EDUH` / `LEIH`, and the BLS-shaped `SMS<fips>0000042…` and
  `…43…` for retail and transport alone — `<ST>TRAD` is the combined
  trade-transport-utilities supersector and is not used; probed 2026-09-23,
  run 35931065205). They are `stateSeries` in `data/fred-series.json`
  (557 entries, generated from the address table's state list; the
  branch's dry run 35933147137 answered 557 of 561 — FRED carries no
  short education-and-health id for the District, Mississippi, Tennessee
  or Wyoming, so those four read four sectors and the demand card names
  the missing one), filed by `readSeriesTable` under the market id
  `state:PA` in the SAME shape as a metro's, so `metroSeriesFor`,
  `readMetroRates`, `liveMetroRates`, `metroDemand`, `metroSupply` and the
  brief work unchanged — but kept in `STATE_SERIES`, apart from
  `METRO_SERIES`, so the market page's boards and ranks never carry a
  state as a row. `stateForAddress` (`lib/market-match.ts`) is the
  fallback the pipeline and the deal page take where `metroForAddress` is
  null; `isStateMarket` / `stateOfMarket` tell the grain. **Every sentence
  says whose figure it is**: the brief carries `grain: "metro" | "state"`
  (stored with the result; an older stored brief has none and reads as a
  metro's), its header opens "Published figures for the state of
  Pennsylvania the deal sits in — the address lies outside the metros the
  site tracks, so these are the state's own figures", the prompt clause
  tells the model to state a state figure as the state's, the deal page's
  market aside, the shared screen and the verdict's brief say "the
  state's", and the vacancy check anchors on the state's annual figure
  (`rental_vacancy_state`, cadence `annual`, `freshDays` 800 — dated the
  first of its year, published the March after, current until the next
  March) only where no metro or region figure exists, saying so. A state
  has no Zillow, Realtor.com or tracker rows, so those lines and checks
  are simply absent. **Between the briefed markets and the state sit the
  metro areas the site READS but does not brief** (#402,
  `data/data-metros.json`, 26 of them: Pittsburgh, Phoenix, Denver,
  Nashville, Charlotte, Austin, Houston, Minneapolis-St. Paul, San Diego,
  Las Vegas, Tampa, Orlando, Raleigh, Salt Lake City, San Antonio,
  Sacramento, Columbus, Indianapolis, Kansas City, St. Louis, Cincinnati,
  Jacksonville, Riverside-San Bernardino, Detroit, Portland, Cleveland).
  A deal in one gets the metro's OWN figures everywhere a briefed
  market's deal does — the market check, the deal page's brief, demand
  and supply pictures and since-this-screen, the model's read, the
  report, the workbook — and nothing else: no research brief, no comps
  pull, no tracker, and no row on `/market`'s boards, which rank the
  briefed markets alone. `marketForAddress` is briefed market ?? data
  metro ?? state (`dataMetroForAddress`, the same keyword-by-state rule,
  a metro spanning two states listing both — Kansas City's Kansas side,
  St. Louis's Illinois side, Cincinnati's Kentucky side, Portland's
  Vancouver); `metroForAddress` stays the research question and answers
  null for these; the pipeline list's row and the compare table's
  "Covered market" line say "Pittsburgh PA · read" / "(read, not
  briefed)" (`readMarket`, from `dataMetroForAddress`, #406) rather than
  nothing, the comps page keeps saying "not a covered market", and the
  research panel says "read, not briefed" (`isDataMetro`). The series ride in `metroSeries`
  under the metro's own id (the boards filter by the research list, so
  they never draw one), each verified from the runner before it went in
  (probes 35937200224, 35937859807, 35938586038 and 35938785892): FRED's
  own prefixes (`PITT342`, `PHOE004`, `STL`, `DETR826`, `PORT941` …) for
  unemployment, payrolls, the three short sectors and both permit
  series; the BLS-shaped `SMU<fips><cbsa>42…SA` / `43…SA` for retail and
  transport; `ATNHPIUS<cbsa>Q` for house prices — Detroit's is the
  DIVISION's (`19804`; the MSA's does not exist), Tampa's stopped at
  2024 Q4 like Washington's and is left out; a CPI rent series exists for
  Houston (`CUURA318SEHA`) and Detroit (`CUURA208SEHA`) alone, every
  other pre-2018 area code answering "does not exist". **Cleveland is
  the one the 2023 redraw broke**: every `CLEV439` series stopped at
  2024-12 (its permits at 2023-12), the MSA is 17410 now and FRED files
  the new series under the BLS-shaped ids (`LAUMT391741000000003`,
  `SMS39174100000000001` — the `SMS` form, which exists for no other
  metro's payrolls — and the five sectors NOT seasonally adjusted under
  `SMU39174106000000001`, `…06500…`, `…07000…`, `…04200…`, `…04300…`, no
  `SA` suffix, the `SA` and `SMS` forms both "do not exist"; probe run
  35938949231), all six stored as the LEVEL with `derived: "yoy"` the
  way Boston's are, since FRED refuses its own transform on that form,
  and it carries no permits (`CLEV439BPPRIV` stopped 2023-12) and no
  index (`ATNHPIUS17460Q` stopped 2024-10, `…17410Q` does not exist);
  its `cbsa` is the redrawn 17410, because Realtor.com's file has no
  17460 row (the branch's first dry run missed Cleveland alone), and
  the survey id is `HVS_RVR_17410` with it. The three pulls' dry runs
  on the branch printed every row: the survey 40 of 40 (each metro's
  area named, the two tables' spellings both matched — "Phoenix-Mesa-
  Chandler" / "Phoenix-Mesa-Scottsdale"), Zillow 44 of 44 in all three
  files, Realtor.com 44 of 44. The survey's
  vacancy is matched by name prefix like the others (`census`), Zillow
  by RegionName (`zillow`) and Realtor.com by CBSA (`cbsa`) — the two
  monthly pulls append the list to their own (`require("../data/data-
  metros.json")`), and the HVS pull reads the entries out of the series
  table as before; each key is a claim until that pull's dry run prints
  the row it matched. `metroRegions` carries each one's Census region so
  the regional vacancy is borrowed and named as before. The weekday pull
  now walks about a thousand series and the stall guard is 45 minutes.
  **The debt
  market rides after the metro's lines, for every deal** (#384,
  `DEBT_MARKET_IDS`): the 10-year Treasury, what banks say about their
  standards for THIS kind of loan (`lendingStandardsFor` — rental housing
  is a multifamily loan, everything else that operates a nonfarm
  nonresidential one, a plan deal adds construction and land, land reads
  construction alone; the Fed's SLOOS net share, negative when easing,
  said so), CRE delinquency at commercial banks and bank CRE lending
  against a year ago — the capital side beside the income side, since a
  check that reads one without the other reads half the deal. The
  pipeline reads the seven national series bare; the page's
  since-this-screen reads them through `liveRates`; the prompt clause
  names the exit cap and the debt assumptions as what they answer. After
  them, for a building that trades on its income (never land), **what
  the capital buys** (#410, `CRE_PRICE_ID`): national commercial real
  estate prices against a year ago, a "Capital markets —" line said as
  the nation's, a trailing year, not this market's and not a cap rate,
  and the clause sets an exit value that leans on prices rising against
  it. **A deal with a plan reads what building costs** (2026-09-30,
  `CONSTRUCTION_COST_IDS`): the BLS producer price index for the goods
  that go into residential or nonresidential construction, by the class
  being built, and construction's average hourly earnings, each against a
  year ago — series the strip already carried, verified when they joined
  the table. Two "Construction costs —" lines after the insurance line,
  counted with the national ones, said as the nation's and never the
  project's bids; the clause checks a budget's escalation and contingency
  against them. A building already built reads neither. **A
  commercial deal's rents ride just ahead of them** (#390): the national
  index of rents its kind of lessor charges (`rentIndexFor`,
  `RENT_INDEX_IDS`), one line said as the nation's lessors and never the
  metro's, and `BRIEF_NATIONAL_IDS` is the one list the pipeline reads
  and the page reads, so the two cannot differ. **The
  figures follow the check into the verdict and the documents** (#385):
  `buildBrief` in `lib/anthropic/verdict.ts` (exported for its test)
  gives the stored lines their own dated section after the market check
  and tells the synthesizer to name a figure and its date as a screen
  range's or a next step's source; the report's market page prints them
  under the checks ("Figures the check read beside the rules of thumb",
  Standard Helvetica, so the lines carry WinAnsi text only); the shared
  screen's Market read says how many were read, for which metro, on
  which day. A check that read none leaves all three exactly as before.
- The pipeline's failure modes: `lib/anthropic/failure.ts` turns any failure
  into one sentence the analyst can act on (the raw text goes to the server
  log, never the page), and its `structured()` wraps every structured-output
  call so a cut-off, a refusal or unreadable JSON is named. `lib/screen-run.ts`
  reads the job row: a failed run's step says which stored results still
  belong to the previous screen (`staleAfterFailure`), and so does a run
  still GOING (`staleWhileRunning`, #479): a re-screen writes the terms first
  and the verdict last, so for its minutes the deal holds the new terms
  beside the last run's call. `previousScreenResults` is the one rule (both
  cases) and `verdictBehind` says why the call on file is behind, if it is:
  the memo and report routes refuse (`memostale` / `memorunning`,
  `reportstale` / `reportrunning`), the shared screen marks the call and the
  comp and market reads the run has not reached, the deal page marks every
  such result and draws the header's and sticky bar's call dashed, and the
  pipeline card, row, CSV and meeting workbook say "Re-screening" over the
  call, the list refreshing while any deal runs. `listJobStatus` is the
  pipeline list's Running / Stalled / Failed, and a live job that is no
  screen (a comp search, a model build, the reconciler before its verdict
  step) leaves the call alone. Every verdict is dated from its own
  `generatedAt` (`screenedOn`): the memo prints "Screened Sep 12, 2026"
  under the export date, the deal page and the shared screen date the call.
  The deal page, the list, the memo and report routes and the shared screen
  all read it there — never decide "is this result current" anywhere else.
  A deal keeps ONE `analysis_jobs` row that every run claims again
  (`claimJob`), so the claim restamps its `created_at` with the claim's
  moment: the worker's oldest-first queue orders a re-screen by when it was
  asked for, and the deal page's progress clock counts from that moment,
  queue wait included (`lib/run-clock.ts`, read in an effect once the page
  has loaded — the server's markup and the first frame show 0:00 — so a
  reload mid-screen picks up the run's time rather than starting again; a
  start over `MAX_RUN_MS` back is a row stamped before the restamp, and the
  page's own moment stands in). In-process runs heartbeat
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
  bare `true` without a column grant behind it. **A page never signs a
  link at render** (#479): a signed URL lasts an hour, so a page left open
  handed the reader the storage host's expiry error. The OM opens through
  `/api/deals/[id]/om` (`lib/om-link`), and a file added with a note, a
  source document and a BOV citation through `/api/deals/[id]/file?p=`
  (`dealFileLinkFor` in `lib/deal-file-link`, pure): each signs at the
  click and answers 302, never cached, and the file route signs only a
  path of this deal's own supplement or document shape that the deal's
  own records list (a `deals.supplements` file entry, a `deal_documents`
  row), read under the reader's session. The account page's logo is the
  one signed-at-render image, since it loads with the page.
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
  research note on `/market` folds (`Fold` in `app/market/fold.tsx`): the
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

## Agents

`.claude/agents/` holds the roles the build hands work to (2026-09-30, the
owner's ask: agents that take the work that does not need the lead, and one
always looking for ways to make the site better). Each file's frontmatter
names its tools; each body binds it to this file's rules.

- `site-researcher` — the outside view (what other CRE tools do) and the
  inside view (what on the site is wrong or stale), ranked, with files named.
- `correctness-auditor` — reads a change or an area for statements the site
  makes that are not true, or will stop being true on a date.
- `surface-wirer` — carries a new reader to every surface a deal-type round
  touches (the context line, the panel, the key terms, the pipeline slot and
  CSV, the workbook, the memo, the report, the compare row).
- `ship-checker` — the local ship loop: types, lint, the full suite, a build,
  the page lint, the changelog marker.
- `picture-curator` — the skyline, aerial and flood sheets from the runner,
  judged by eye through the site's own crops; credits only as printed.
- `data-verifier` — a candidate series, file or column printed by the runner
  before it is trusted.

Rules for the lead: an agent that edits works in its own worktree
(`isolation: "worktree"`, `.claude/worktrees/` is ignored) and commits
locally; the lead reviews each diff and cherry-picks. An agent never pushes,
never edits this file, the changelog or a workflow, and never writes a
figure, id, filename or credit from memory. Nothing an agent finds that
changes the model's math, needs a key or a purchase, or widens the covered
markets ships without the owner's permission.

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
