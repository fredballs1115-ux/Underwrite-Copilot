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
import type { SubmarketMetrics } from "./metrics";
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
  dismissed: Dismissal | null;
}

const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;

/**
 * Run every check. Dismissed warnings are RETURNED, not filtered out — the card
 * shows them struck through with the reason, which is the whole point of
 * requiring one.
 */
export function assumptionWarnings(
  inputs: UnderwriteInputs,
  metrics: SubmarketMetrics,
  submarket: Submarket,
  dismissals: Dismissal[] = [],
): AssumptionWarning[] {
  const byCode = new Map(dismissals.map((d) => [d.code, d]));
  const out: AssumptionWarning[] = [];
  const push = (w: Omit<AssumptionWarning, "dismissed">) =>
    out.push({ ...w, dismissed: byCode.get(w.code) ?? null });

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
      basis: `${rent.cagrFrom} → ${rent.cagrTo}, ${
        rent.cagrBasis ? RENT_BASIS_LABEL[rent.cagrBasis] : "basis not stated"
      }`,
    });
  }

  // ── Months of supply vs exit cap compression ────────────────────────────
  const threshold = submarket.supplyWarningMonths;
  if (metrics.supply.status === "supply_exceeds_demand") {
    push({
      code: "supply_vs_exit_cap",
      severity: "warning",
      title: "Supply exceeds demand",
      message: `${submarket.name} has ${Math.round(metrics.supply.ucSf).toLocaleString(
        "en-US",
      )} SF under construction against ${Math.round(metrics.supply.t12Absorption).toLocaleString(
        "en-US",
      )} SF of trailing-12 net absorption — the market is giving space back while more is being built. An exit cap at or below the going-in cap is hard to defend here.`,
      basis: `${metrics.absorption.quartersUsed} quarter(s): ${metrics.absorption.periods.join(", ")}`,
    });
  } else if (metrics.supply.status === "ok" && metrics.supply.months > threshold) {
    const compressing = inputs.exitCapPct < 0.06;
    push({
      code: "supply_vs_exit_cap",
      severity: "warning",
      title: "Deep construction pipeline",
      message: `${metrics.supply.months.toFixed(
        0,
      )} months of supply under construction, against your ${threshold}-month threshold.${
        compressing
          ? ` Your ${pct(inputs.exitCapPct, 2)} exit cap assumes the market tightens while that delivers.`
          : ` Exit cap compression is hard to defend while that delivers.`
      }`,
      basis: `${Math.round(metrics.supply.ucSf).toLocaleString("en-US")} SF UC ÷ ${Math.round(
        metrics.supply.monthlyAbsorption,
      ).toLocaleString("en-US")} SF/mo absorption`,
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
      basis: `trough was ${trough.period}`,
    });
  }

  // ── The data-quality traps, surfaced on the deal, not just the library ──
  if (!metrics.reconciliation.ties && metrics.reconciliation.gridSf != null) {
    push({
      code: "pipeline_does_not_tie",
      severity: "info",
      title: "Pipeline doesn't tie",
      message: metrics.reconciliation.message,
      basis: `latest period ${metrics.latest?.period ?? "—"}`,
    });
  }

  if (metrics.rent.basisChanged) {
    push({
      code: "rent_basis_inconsistent",
      severity: "info",
      title: "Rent series changes basis",
      message: metrics.rent.basisFlag!,
      basis: `${metrics.periodsCovered} periods loaded`,
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
    });
  }

  return out;
}

/** The lines that go into the deal memo: what was flagged, and why the analyst
 *  overrode it. An override with no reason never gets here, because the form
 *  requires one. */
export function memoLinesFor(warnings: AssumptionWarning[]): string[] {
  return warnings
    .filter((w) => w.dismissed)
    .map((w) => `${w.title} — overridden: ${w.dismissed!.reason}`);
}
