# DEPLOY_DIAGNOSIS — why the live site "hasn't changed" (it has), checked item by item

Diagnosis run 2026-08-21 from the build environment. Constraint stated up
front: this container has **no network path to the live site, Render, or
Supabase** (every probe returns proxy-blocked), so items below are split into
VERIFIED (checked directly) and CANNOT-VERIFY-FROM-HERE (exact check handed
to you in SHIPPED.md).

## The checklist

1. **Unmerged branch?** — VERIFIED NO. `git log origin/main` shows every PR
   merged through #48 (`13fd589`); `site-polish` and the old feature branch
   carry nothing unmerged. Work is NOT stranded.
2. **Which branch does Render deploy?** — `render.yaml` pins `branch: main`
   with `autoDeploy: true` for both services. Whether the *dashboard* has
   auto-deploy toggled off, or a build failed, is CANNOT-VERIFY-FROM-HERE →
   SHIPPED.md task 2.
3. **Migrations applied to production?** — CANNOT-VERIFY-FROM-HERE (no DB
   access). You reported running 0001–0026; **0027 (`deals.photo`) is newer
   than that run** and is presumed unapplied → SHIPPED.md task 1. All
   migrations are additive/idempotent; no destructive step exists.
4. **Env vars on Render?** — CANNOT-VERIFY-FROM-HERE. Missing keys do NOT
   blank these pages by design: every research surface falls back to
   checked-in seeds, and photos/comps degrade to labeled empty states.
5. **Build failing silently?** — the same commit builds clean here
   (`npm run build`, 301 tests). A Render-side failure would be visible in
   its deploy log → SHIPPED.md task 2.
6. **Caching?** — ROOT CAUSE, VERIFIED IN CODE. The homepage is ISR with
   `revalidate = 86400`; each deploy rebuilds it, but a browser that visited
   before the deploy shows its cached copy until hard-refresh. **Your own
   screenshot proves the new code is live** — it shows the research panel's
   "VS. MARKET" block, which has only existed since this build.

## The two real bugs your screenshot exposed (both fixed in this pass)

- **FY2026 FMRs wore a "stale · 2025-10-01" badge.** The rows were stamped
  with the FY *effective* date; the 180-day staleness rule then flagged
  current-law rents as old. Fixed: `as_of` = verification date (2026-08-21),
  the effective window moved into the note, labels prettified
  ("FY2026 fair market rent · studio" instead of "hud fmr fy2026 0br").
- **A photo that "doesn't make sense in context."** Street View was rendering
  for the sample's NEIGHBORHOOD-level placement — a random Brewerytown block
  presented as the building. Fixed at the root: street-level imagery now
  requires a street-level address (page-side gate + route-side guard), so
  neighborhood placements always get the clean no-photo card. No fabricated
  photo existed; no manual photo row exists in the schema.

## Source-link audit

Cannot execute from this container (egress blocked). Delivered instead:
`scripts/audit-source-links.mjs` (HEAD-checks every research/DB source URL →
`data/research/link_audit.json`) + a render-time gate (`lib/link-audit.ts`)
already wired into the provenance components: any URL the audit marks dead
renders as plain text "source on file — link unavailable", never a clickable
404. Run + commit per SHIPPED.md task 3; dead-link count lands in the audit
file.
