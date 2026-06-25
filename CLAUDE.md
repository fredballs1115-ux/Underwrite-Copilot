@AGENTS.md

# Underwrite Copilot — project orientation

CRE deal-screening web app. One uploaded offering memorandum (OM) flows through a
five-step analysis loop, all sharing one "deal":
**extract → challenge → reconcile (vs the user's own model) → market check → verdict.**
Plus accounts + saved deals. (Stripe billing is a later phase.)

## Architecture

- **Next.js 16 App Router + TypeScript**, Tailwind v4. Server Components by default.
- **Claude (Anthropic)** does the analysis. The key is server-side only:
  `lib/anthropic/client.ts` imports `server-only` so it can never leak into the
  browser bundle.
- **Long analyses run in a background worker** (`worker/`), not in a web request,
  because a 150–200pp OM plus several Claude calls takes a minute+. The web app
  enqueues a job in `analysis_jobs`; the worker runs the pipeline and updates progress.
- **Supabase** = Postgres + Auth + Storage (the OM PDFs). Per-user isolation via RLS.
- **Render** hosts the web service and (Phase 2) the worker.

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
- This is **Next.js 16** — see AGENTS.md; check `node_modules/next/dist/docs/`
  before using unfamiliar Next APIs.

## Build roadmap

Phase 0 ✅ scaffold. Phase 1 auth + saved deals. Phase 2 OM upload + extraction +
worker engine. Phase 3 challenger. Phase 4 reconciler. Phase 5 market check.
Phase 6 verdict. Later: Stripe billing, polish.
