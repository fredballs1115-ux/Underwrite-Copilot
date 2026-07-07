# RESEARCH.md — what's worth building, and why

Internal working doc (July 2026). Two research passes — consumer-SaaS best
practices and the day-to-day workflow of CRE acquisitions analysts at small
shops — distilled into a ranked build list. Sources are named inline in the
findings; scores are analyst value × build effort, judged against what the
product already has.

## Key findings that drive decisions

**From the CRE workflow research:**

- The screen IS the job. Small shops see 10–15 OMs/week, spend 20–45 min
  per manual screen, and fully model only 1–3 of every 10. Brokers send OMs
  Thursday/Friday with offers due Monday — screening speed is the wedge.
  (acquios.ai, proprise.ai, wallstreetoasis.com)
- Nobody trusts broker math. The first real move is rebuilding the cap rate
  on in-place T-12 actuals and comparing it to the pro forma cap; the gap is
  the finding. (tacticares.com)
- Four documented "instant disqualifiers" juniors miss: property taxes not
  reset to the sale price, OpEx ratio under ~30% of gross potential rent,
  aggressive loss-to-lease/concession burn-off, insurance at the seller's
  legacy premium. (breneman.com, rea.co)
- The re-typing tax is the #1 time sink: rent rolls/T-12s/OM figures keyed
  into Excel, then again into a tracker, then again into a memo. Extraction
  with page citations is the trust-maker. (archer.re, rediq.com)
- Competitive gap: Dealpath is $15–50k/yr institutional; extraction tools
  stop at the spreadsheet; only Cactus/Archer stitch extract → screen →
  memo, both young with gated pricing. A small-shop-priced screen-to-memo
  tool is a real position.
- Analysts speak in exact labels — price/door, going-in cap (T-12),
  untrended yield-on-cost, DSCR, debt yield, loss-to-lease. Using their
  vocabulary is itself a trust signal.

**From the SaaS best-practices research:**

- One activation event, reachable in minutes: "first completed verdict."
  Preloaded sample beats tours (empty-state CTAs convert ~3× vs tooltips;
  checklists average only ~19% completion — keep ours at 3 items).
  (getperspective.ai, pixxen.com, Userpilot)
- Proof-of-work beats testimonials when you have no customers: a public
  full sample analysis and precise, honest copy. Fake social proof is
  forbidden anyway. (thegood.com, koombea.com)
- For confidential-document buyers, a plain security page (isolation,
  encryption, subprocessors, no-training pledge, deletion) outweighs badges.
  Never claim SOC 2 before holding it. (vanta.com, sprinto.com)
- Long jobs need staged progress with real step names, not spinners; the
  60-second analysis should read as rigor. (ui-deploy.com)
- Completion email + weekly digest are the top re-entry triggers for an
  event-cadence tool — email brings users back, in-app engages 3–10× while
  they're present. (notilayer.com)
- Core Web Vitals p75 bar: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1; keep
  first-load JS lean and stream the rest. (web.dev)

## Ranked build list (value / effort, 1–5)

Existing-feature upgrades outrank net-new. ✅ = shipped in this run.

| # | Item | Value | Effort | Status |
|---|------|-------|--------|--------|
| 1 | Buy-box row in side-by-side compare (mandate fit + why, per deal) | 4 | 1 | ✅ upgrade of existing compare |
| 2 | Security page + full subprocessor disclosure (incl. Photon) | 4 | 1 | ✅ net-new trust surface |
| 3 | Interactive sensitivity panel — exit cap × rent growth grid + adjustable hold/rate on the generated model, recomputed instantly client-side | 5 | 3 | ✅ upgrade (model existed, static grids only) |
| 4 | Public demo deal — the full sample analysis, logged out, labeled | 5 | 2 | ✅ net-new activation/proof-of-work |
| 5 | Broker-trick red flags added to the challenger's checklist (tax reset, OpEx ratio, LTL burn-off, stale insurance) | 5 | 1 | ✅ prompt enrichment — logged analysis-logic change |
| 6 | Global search: ⌘K palette also matches address and document filenames | 3 | 1 | ✅ upgrade of existing palette |
| 7 | Browser notification (opt-in) when a screen finishes and the tab is hidden | 3 | 1 | ✅ complements the existing toast |
| 8 | Call-for-offers deadline on deals + urgency in pipeline | 4 | 3 | not built — needs a migration (user-run step); recommended next |
| 9 | Email "analysis ready" + weekly pipeline digest | 4 | 3 | not built — requires an email provider key (flagged; won't add a dependency silently) |
| 10 | Batch triage: upload several OMs, ranked buy-box list | 4 | 4 | not built — large; pipeline + fit column covers the read half |
| 11 | Internal comps memory (own deal flow as a private comp set) | 3 | 4 | not built — meaningful schema + product surface; revisit |
| 12 | Deterministic debt sizer (LTV/DSCR/debt-yield most-restrictive) | 3 | 3 | not built — needs rate inputs we don't collect; verdict's debt lever covers narratively |
| 13 | Changelog page with "updated on" date | 2 | 1 | not built — goes stale without a maintenance habit; hurts trust if abandoned |

Already solid (verified this run, no rebuild): extraction with page cites,
staged progress rail, buy-box mandate engine with near-miss grading, PDF
memo, template-driven Excel model, retrade watch, stages, compare, teams +
seat billing, ⌘K palette, onboarding checklist, sample deal (logged-in),
empty/loading/error states, pricing page, accessibility floor (focus-visible,
reduced-motion, tabular numerals, semantic tables).
