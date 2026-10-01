/**
 * The payoff: checking a deal's assumptions against what the submarket has
 * actually done.
 *
 * Exit cap and rent growth swing IRR more than anything else, and in most
 * screening tools the user just types a number. Nothing checks it. A deal
 * underwritten to 4% rent growth in a market with 18 months of supply under
 * construction is a bad deal that screens well.
 *
 * Every warning here is SOFT and dismissible — an analyst overriding a check
 * is normal. Doing it silently isn't, so a dismissal requires a one-line reason
 * and that reason lands in the deal memo.
 *
 * Pure.
 */
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import { withArticle } from "@/lib/article";
import { STRATEGY_LABEL, isPlanDeal, type StrategyKind } from "@/lib/deal-strategy";
import { trailingYearBasis, unverifiedMark, type SubmarketMetrics } from "./metrics";
import { RENT_BASIS_LABEL, type Dismissal, type Submarket } from "./types";

export type CheckCode =
  | "rent_growth_above_trend"
  | "supply_vs_exit_cap"
  | "vacancy_below_trough"
  | "pipeline_does_not_tie"
  | "rent_basis_inconsistent"
  | "stale_pipeline_entries";

export type CheckSeverity = "warning" | "info";

export interface AssumptionWarning {
  code: CheckCode;
  severity: CheckSeverity;
  /** short headline for the card */
  title: string;
  /** the full sentence, always carrying the actual number */
  message: string;
  /** where the comparison figure came from — no orphan numbers */
  basis: string;
  /** the gap itself, compactly ("4.0% vs 2.94% CAGR") — what an override is
   *  written against, and kept with it */
  figure: string;
  /** the override that stands: one written against this same figure (or
   *  one recorded before figures were kept) */
  dismissed: Dismissal | null;
  /** an override written against a DIFFERENT figure: the gap has moved
   *  since, so it no longer stands, and the card says what it was */
  staleOverride: Dismissal | null;
}

const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;

/** A basis line with the figure's unverified mark on the end, where a
 *  web-sourced period went into it — never blended in silently. */
const marked = (basis: string, unverified: number): string => {
  const mark = unverifiedMark(unverified);
  return mark ? `${basis}; ${mark}` : basis;
};

/** The deal's going-in cap the exit is set against — lib/model-vs-market's
 *  `dealGoingInCap`, percent — or null where the deal has none. */
export interface GoingInCapRead {
  pct: number;
  source: "stated" | "implied" | "implied_whole";
}

const GOING_IN_SOURCE: Record<GoingInCapRead["source"], string> = {
  stated: "as stated",
  implied: "implied by the stated NOI over the price",
  implied_whole: "implied by the stated NOI over the whole the share's price grosses up to",
};

/**
 * What the exit cap assumes, set against the deal's own going-in cap — the
 * compression a deep pipeline makes hard to defend is a move from one to the
 * other, and an exit cap low in the abstract (a 5.25% exit on a deal bought at
 * 4.75%) widens rather than tightens. With no going-in cap (a plan deal, a
 * note, nothing stated or implied) there is nothing to compress from, and the
 * sentence says nothing about compression at all.
 */
function exitAgainstGoingIn(exitCap: number, goingIn: GoingInCapRead | null): string {
  if (!goingIn) return "";
  const entry = goingIn.pct / 100;
  const bps = Math.round(Math.abs(exitCap - entry) * 10_000);
  if (bps === 0) return ` Your ${pct(exitCap, 2)} exit cap holds the going-in cap flat while that delivers.`;
  return exitCap < entry
    ? ` Your ${pct(exitCap, 2)} exit cap is ${bps} bps under the ${pct(entry, 2)} going-in cap — it assumes the market tightens while that delivers.`
    : ` Your ${pct(exitCap, 2)} exit cap sits ${bps} bps over the ${pct(entry, 2)} going-in cap.`;
}

/**
 * Run every check. Dismissed warnings are RETURNED, not filtered out — the card
 * shows them struck through with the reason, which is the whole point of
 * requiring one.
 *
 * `goingIn` is the deal's going-in cap (`dealGoingInCap`), the one the exit is
 * set against; null leaves the supply warning silent on compression.
 */
export function assumptionWarnings(
  inputs: UnderwriteInputs,
  metrics: SubmarketMetrics,
  submarket: Submarket,
  dismissals: Dismissal[] = [],
  strategy: StrategyKind = "unknown",
  goingIn: GoingInCapRead | null = null,
): AssumptionWarning[] {
  const byCode = new Map(dismissals.map((d) => [d.code, d]));
  const out: AssumptionWarning[] = [];
  // An override is keyed to the gap it was written against as well as the
  // check: a reason given for 4.0% growth against a 2.9% trend is not a
  // reason for 6.0% against it. One recorded before the figure was kept
  // stands as it did.
  const push = (w: Omit<AssumptionWarning, "dismissed" | "staleOverride">) => {
    const d = byCode.get(w.code) ?? null;
    const stands = d != null && (d.figure == null || d.figure === w.figure);
    out.push({ ...w, dismissed: stands ? d : null, staleOverride: d && !stands ? d : null });
  };

  // A plan deal (conversion, development, lease-up, value-add) is not a
  // bystander to the construction pipeline — it IS part of it. Its lease-up
  // competes with every building in that pipeline for the same tenants, so
  // the supply warnings say so rather than treating the deal as an operating
  // asset watching supply arrive around it.
  const planClause = isPlanDeal(strategy)
    ? ` This ${STRATEGY_LABEL[strategy].toLowerCase()} deal delivers into that same pipeline — its lease-up competes with every one of those buildings for the same tenants.`
    : "";

  // ── Rent growth vs the submarket's own trailing CAGR ────────────────────
  const { rent } = metrics;
  if (rent.cagr != null && inputs.rentGrowthPct > rent.cagr) {
    const gapBps = Math.round((inputs.rentGrowthPct - rent.cagr) * 10_000);
    push({
      code: "rent_growth_above_trend",
      severity: "warning",
      title: "Rent growth runs ahead of the submarket",
      message: `You're underwriting ${pct(inputs.rentGrowthPct)} rent growth. ${
        submarket.name
      } has compounded at ${pct(rent.cagr, 2)} over ${rent.cagrYears?.toFixed(1)} years — you're ${gapBps} bps above what it has actually done.`,
      basis: marked(
        `${rent.cagrFrom} → ${rent.cagrTo}, ${
          rent.cagrBasis ? RENT_BASIS_LABEL[rent.cagrBasis] : "basis not stated"
        }`,
        metrics.unverified.cagr,
      ),
      figure: `${pct(inputs.rentGrowthPct, 2)} vs ${pct(rent.cagr, 2)} CAGR, ${rent.cagrFrom} to ${rent.cagrTo}`,
    });
  }

  // The exit cap against the going-in cap, as an override is written
  // against it: plain words, no symbols a printed memo cannot set.
  const exitFigure = `exit ${pct(inputs.exitCapPct, 2)}${goingIn ? ` vs ${goingIn.pct.toFixed(2)}% going-in` : ""}`;

  // ── Months of supply vs the exit cap against the going-in cap ───────────
  const threshold = submarket.supplyWarningMonths;
  const goingInBasis = goingIn
    ? `; going-in cap ${goingIn.pct.toFixed(2)}%, ${GOING_IN_SOURCE[goingIn.source]}`
    : "";
  if (metrics.supply.status === "supply_exceeds_demand") {
    const entry = goingIn ? goingIn.pct / 100 : null;
    // At or under the going-in cap is what the market giving space back
    // makes hard to defend; over it, the sentence says by how much.
    const exitClause =
      entry == null
        ? ""
        : inputs.exitCapPct <= entry + 0.00005
          ? ` Your ${pct(inputs.exitCapPct, 2)} exit cap, at or under the ${pct(entry, 2)} going-in cap, is hard to defend here.`
          : exitAgainstGoingIn(inputs.exitCapPct, goingIn);
    push({
      code: "supply_vs_exit_cap",
      severity: "warning",
      title: "Supply exceeds demand",
      message: `${submarket.name} has ${Math.round(metrics.supply.ucSf).toLocaleString(
        "en-US",
      )} SF under construction against ${Math.round(metrics.supply.t12Absorption).toLocaleString(
        "en-US",
      )} SF of trailing-12 net absorption — the market is giving space back while more is being built.${exitClause}${planClause}`,
      basis: marked(
        `${trailingYearBasis(metrics.absorption)}: ${metrics.absorption.periods.join(", ")}${goingInBasis}`,
        metrics.unverified.supply,
      ),
      figure: `${Math.round(metrics.supply.ucSf).toLocaleString("en-US")} SF UC vs ${Math.round(
        metrics.supply.t12Absorption,
      ).toLocaleString("en-US")} SF trailing-year absorption; ${exitFigure}`,
    });
  } else if (metrics.supply.status === "ok" && metrics.supply.months > threshold) {
    push({
      code: "supply_vs_exit_cap",
      severity: "warning",
      title: "Deep construction pipeline",
      message: `${metrics.supply.months.toFixed(
        0,
      )} months of supply under construction, against your ${threshold}-month threshold.${exitAgainstGoingIn(
        inputs.exitCapPct,
        goingIn,
      )}${planClause}`,
      basis: marked(
        `${Math.round(metrics.supply.ucSf).toLocaleString("en-US")} SF UC ÷ ${Math.round(
          metrics.supply.monthlyAbsorption,
        ).toLocaleString("en-US")} SF/mo absorption (${trailingYearBasis(metrics.absorption)})${goingInBasis}`,
        metrics.unverified.supply,
      ),
      figure: `${metrics.supply.months.toFixed(0)} months of supply vs ${withArticle(`${threshold}-month threshold`)}; ${exitFigure}`,
    });
  }

  // ── Stabilized vacancy below the submarket's trough ─────────────────────
  const trough = metrics.troughVacancy;
  if (trough && inputs.vacancyPct < trough.value) {
    push({
      code: "vacancy_below_trough",
      severity: "warning",
      title: "Stabilized vacancy below the submarket's best quarter",
      message: `You're assuming ${pct(inputs.vacancyPct)} vacancy. ${
        submarket.name
      } has never been tighter than ${pct(trough.value)} in the data you've loaded.`,
      basis: marked(`trough was ${trough.period}`, metrics.unverified.trough),
      figure: `${pct(inputs.vacancyPct, 2)} vs ${withArticle(`${pct(trough.value, 2)} trough`)}, ${trough.period}`,
    });
  }

  // ── The data-quality traps, surfaced on the deal, not just the library ──
  if (!metrics.reconciliation.ties && metrics.reconciliation.gridSf != null) {
    push({
      code: "pipeline_does_not_tie",
      severity: "info",
      title: "Pipeline doesn't tie",
      message: metrics.reconciliation.message,
      basis: marked(`latest period ${metrics.latest?.period ?? "—"}`, metrics.unverified.latest),
      figure: `grid ${Math.round(metrics.reconciliation.gridSf).toLocaleString("en-US")} SF vs list ${Math.round(
        metrics.reconciliation.listSf,
      ).toLocaleString("en-US")} SF, ${metrics.latest?.period ?? "no period"}`,
    });
  }

  if (metrics.rent.basisChanged) {
    push({
      code: "rent_basis_inconsistent",
      severity: "info",
      title: "Rent series changes basis",
      message: metrics.rent.basisFlag!,
      basis: `${metrics.periodsCovered} periods loaded`,
      figure: metrics.rent.segments.map((s) => `${s.basisLabel} from ${s.points[0]?.period ?? "?"}`).join("; "),
    });
  }

  const stale = metrics.deliveries.filter((d) => d.hasStale);
  if (stale.length) {
    push({
      code: "stale_pipeline_entries",
      severity: "info",
      title: "Pipeline entries need a manual look",
      message: `${stale.length} delivery quarter${
        stale.length === 1 ? "" : "s"
      } (${stale.map((d) => d.quarter).join(", ")}) contain buildings flagged as stale — round-number placeholders, or a delivery date that has passed with the status unchanged.`,
      basis: "property-level pipeline",
      figure: `stale in ${stale.map((d) => d.quarter).join(", ")}`,
    });
  }

  return out;
}

/** The lines that go into the deal memo: what was flagged, and why the analyst
 *  overrode it — only an override that still stands (one written against
 *  the figure the warning states now). An override with no reason never gets
 *  here, because the form requires one. */
export function memoLinesFor(warnings: AssumptionWarning[]): string[] {
  return warnings
    .filter((w) => w.dismissed)
    .map((w) => `${w.title} — overridden: ${w.dismissed!.reason}`);
}
