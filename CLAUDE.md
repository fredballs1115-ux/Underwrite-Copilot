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
- DB schema: `supabase/migrations/`

## Conventions

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
