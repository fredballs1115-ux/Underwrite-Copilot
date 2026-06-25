# Underwrite Copilot

Self-serve deal-screening for commercial real estate analysts and small
acquisitions shops. Upload an offering memorandum (OM) and Underwrite Copilot
runs the **whole screen** on one deal:

1. **Extract & flag** — pull every term out of the OM and flag the figures to
   verify against the source.
2. **Challenge** — red-team the pro forma like an investment committee, with the
   exact question to ask the broker, plus a stress test.
3. **Scrutinize the broker comps** — pull the sale and lease comps out of the OM
   itself, rate whether each actually supports the price, and flag the
   cherry-picking (no external comps data — sidesteps licensing).
4. **Reconcile** — compare the OM against _your own_ ARGUS/Excel model and
   surface the gap. _(the differentiator)_
5. **Market check** — sanity-test the rent and cap assumptions against market
   norms (rules-of-thumb, not pulled comps).
6. **Verdict** — one screen synthesizing all of it: pass / caution / kill, top
   risks, next steps.

Plus accounts and saved deals so you can come back to a deal later.

> First-pass screen, not investment advice. Always verify flagged figures
> against source documents before acting.

## Tech stack

| Layer                           | Choice                                       |
| ------------------------------- | -------------------------------------------- |
| App framework                   | Next.js 16 (App Router) + TypeScript         |
| Styling                         | Tailwind CSS v4                              |
| AI                              | Claude (Anthropic API) — **server-side only** |
| Database / auth / file storage  | Supabase (Postgres, Auth, Storage)           |
| Background jobs                 | A Render worker service (long OM analyses)   |
| Hosting                         | Render                                       |
| Billing (later phase)           | Stripe                                       |

## Project structure

```
app/                 Next.js routes + UI (Server Components by default)
  layout.tsx         shared HTML shell, fonts, page metadata
  page.tsx           landing page
  globals.css        Tailwind import + design tokens
lib/
  anthropic/         the Claude "brain"
    client.ts        server-only Anthropic client (reads your API key)
    models.ts        which model each step uses (cost/quality lever)
    types.ts         output shape for every step (the shared contract)
    prompts.ts       the analysis prompts (extract/challenge/comps/reconcile/market/verdict)
  supabase/          database + auth helpers (server + browser)
worker/              background job runner for the long analysis (Phase 2)
supabase/
  migrations/        database schema (SQL)
render.yaml          Render deployment blueprint
.env.example         the environment variables you need (copy to .env.local)
```

## Run it locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your local env file and fill in values:
   ```bash
   cp .env.example .env.local
   ```
   (`.env.local` is gitignored — your keys never get committed.)
3. Start the dev server:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000.

You don't need any keys to see the landing page. You'll need an Anthropic key
once analysis is wired up (Phase 2), and a Supabase project for accounts
(Phase 1).

## Environment variables

See `.env.example`. In short:

- `ANTHROPIC_API_KEY` — Claude. **Server-side only.**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase (safe in the browser).
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase admin key. **Server-side only.**
- `NEXT_PUBLIC_APP_URL` — the app's public URL.

## Deploy to Render

Push to GitHub, then in Render: **New → Blueprint** and point it at this repo.
Render reads `render.yaml` and creates the web service. Add the secrets above in
the dashboard (they're marked `sync: false`, so they're never read from the
repo). See `render.yaml` for details.

## Roadmap

- **Phase 0 (done)** — scaffold, theme, folder structure, prompts folded in, deploy config.
- **Phase 1** — accounts (Supabase Auth) + saved deals.
- **Phase 2** — OM upload + extraction + the background-job engine.
- **Phase 3** — Assumption Challenger.
- **Phase 4** — Broker-comp scrutiny.
- **Phase 5** — Reconciler.
- **Phase 6** — Market plausibility check.
- **Phase 7** — One-screen verdict.
- **Later** — Stripe billing, polish.

## Scripts

| Command             | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Start the local dev server            |
| `npm run build`     | Production build                      |
| `npm start`         | Run the production build              |
| `npm run lint`      | Lint the code                         |
| `npm run typecheck` | Type-check without building           |
