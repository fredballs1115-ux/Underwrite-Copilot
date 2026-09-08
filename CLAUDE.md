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
- Render smoke tests: `lib/deal-view.render.test.ts` and
  `lib/views.render.test.ts` render the signed-in views on fixtures — and the
  shared screen's view (`app/share/[token]/share-view.tsx`; its `page.tsx`
  is only the loader, so keep the markup in the view; the token's
  resolution — the six refusals, then the deal — is `lib/share-resolve.ts`,
  shared with the token-scoped aerial route `app/api/share/[token]/aerial`,
  so never resolve a share anywhere else) — and lint
  the visible text with `lib/render-lint.ts` (a digit glued to a word, a word
  doubled; `a11yIssues`: an image with no alt, a nameless button or link, an
  unlabelled control, a duplicate id). With `VIEW_SHOTS_DIR` set they also
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
  no arrows.
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
  comps data source (deliberate: avoids data-licensing constraints).
- This is **Next.js 16** — see AGENTS.md; check `node_modules/next/dist/docs/`
  before using unfamiliar Next APIs.

## Outstanding work

`WILL_TODO.md` is the forward list — read it first in a new session. It names
whose move each item is. As of 2026-08-28 the blocking item is **running
migrations 0030–0033 in Supabase**: phases 1–4 are merged and deployed but
their four pages stay inert (empty states, saves fail) until those tables
exist.

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
