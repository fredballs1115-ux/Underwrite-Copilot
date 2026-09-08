import type { PlanSummary } from "@/lib/deal-strategy";
import {
  SPREAD_LABEL,
  buildYieldOnCostGrid,
  planBreakevens,
  spreadBucket,
  type SpreadBucket,
} from "@/lib/plan-sensitivity";

const money = (n: number): string =>
  Math.abs(n) >= 1e6
    ? `$${(n / 1e6).toFixed(1)}M`
    : Math.abs(n) >= 1e3
      ? `$${Math.round(n / 1e3)}k`
      : `$${Math.round(n)}`;
const pct = (d: number, dp = 1): string => `${(d * 100).toFixed(dp)}%`;
const delta = (d: number): string => `${d > 0 ? "+" : ""}${Math.round(d * 100)}%`;

/** Fills by development spread. Teal deepens as the spread widens; the warms
 *  take over under 150 bps; below the cap is the kill colour. Numbers print in
 *  every cell regardless, so the story survives grayscale and colour-blind
 *  readers. */
const BUCKET_CLS: Record<SpreadBucket, string> = {
  wide: "bg-brand/25",
  adequate: "bg-brand/12",
  thin: "bg-caution/15",
  none: "bg-caution/35",
  negative: "bg-kill/20",
};
const LEGEND: SpreadBucket[] = ["wide", "adequate", "thin", "none", "negative"];

export interface RefCap {
  /** decimal */
  pct: number;
  provenance: "extracted" | "derived" | "assumption";
}

/**
 * Yield on total cost, stressed. The sensitivity a plan deal is judged on:
 * stabilized NOI under the pro forma down the rows, budget over the OM's
 * across, each cell the yield on everything the project cost and its spread
 * over the model's exit cap. Renders nothing for a stabilized asset, or when
 * the OM did not state a budget or a stabilized NOI — a blank is never a grid.
 */
export function PlanSensitivity({
  plan,
  refCap,
}: {
  plan: PlanSummary | null;
  refCap: RefCap | null;
}) {
  if (!plan || !refCap) return null;
  const grid = buildYieldOnCostGrid(plan, refCap.pct);
  const be = planBreakevens(plan, refCap.pct);
  if (!grid || !be) return null;
  const noi = plan.stabilizedNoi!.value;
  const budget = plan.budget!.budget;
  const refNote =
    refCap.provenance === "derived"
      ? "the OM's going-in cap, which the model also exits at"
      : refCap.provenance === "extracted"
        ? "the OM's stated cap"
        : "the model's exit-cap default — set your own view in the model";

  return (
    <section
      aria-label="Yield on cost, stressed"
      className="mt-4 rounded-xl border border-line bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold">Yield on cost, stressed</p>
        <p className="text-[11px] text-muted">
          Spread over a {pct(refCap.pct, 2)} reference cap — {refNote}
        </p>
      </div>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
        The plan is judged on this spread, not on a cap rate against the price.
        Stabilized NOI under the pro forma runs down the rows, budget over the
        OM&apos;s across; each cell is the yield on total cost and its spread over
        the reference cap. A pro forma that keeps its spread with NOI 20% short
        and the budget 30% over is conservative; one that needs its own base case
        is not.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center text-xs">
          <thead>
            <tr>
              <th
                scope="col"
                className="text-left align-bottom text-[10px] font-medium uppercase tracking-wide text-muted"
              >
                NOI ↓ · Budget →
              </th>
              {grid.budgetCols.map((c) => (
                <th key={c.delta} scope="col" className="align-bottom font-mono text-[11px] font-medium text-muted">
                  {c.delta === 0 ? "OM budget" : delta(c.delta)}
                  <span className="block text-[10px] font-normal">{money(c.totalCost)} total</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.noiRows.map((r, ri) => (
              <tr key={r.delta}>
                <th scope="row" className="text-left font-mono text-[11px] font-medium text-muted">
                  {r.delta === 0 ? "OM NOI" : delta(r.delta)}
                  <span className="block text-[10px] font-normal">{money(r.noi)}</span>
                </th>
                {grid.cells[ri].map((cell, ci) => {
                  const bucket = spreadBucket(cell.spreadBps);
                  const base = ri === grid.baseRow && ci === grid.baseCol;
                  return (
                    <td
                      key={ci}
                      title={SPREAD_LABEL[bucket]}
                      className={`rounded-md px-2 py-1.5 font-mono tabular-nums ${BUCKET_CLS[bucket]} ${
                        base ? "ring-2 ring-ink" : ""
                      }`}
                    >
                      <span className="block text-sm font-semibold">{pct(cell.yieldOnCost)}</span>
                      <span className="block text-[10px] text-muted">
                        {cell.spreadBps >= 0 ? "+" : ""}
                        {cell.spreadBps} bps
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 space-y-1 text-sm leading-relaxed">
        <li>
          {be.noiCushion > 0
            ? `Stabilized NOI can come in ${pct(be.noiCushion)} under the OM's ${money(noi)} — down to ${money(
                be.noiAtRefCap,
              )} — before the yield on cost falls to the ${pct(refCap.pct, 2)} reference cap.`
            : `The OM's ${money(noi)} stabilized NOI already yields less than the ${pct(
                refCap.pct,
                2,
              )} reference cap on ${money(plan.totalCost ?? 0)} of total cost — the plan is under water before any stress.`}
        </li>
        <li>
          {be.overrunToRefCap != null
            ? `The budget would have to run ${pct(be.overrunToRefCap, 0)} over — ${money(
                budget * (1 + be.overrunToRefCap),
              )} against ${money(budget)} — before the yield fell to the reference cap.`
            : "Any overrun deepens a yield that already sits below the cap."}
        </li>
      </ul>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {LEGEND.map((b) => (
          <span key={b} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${BUCKET_CLS[b]}`} aria-hidden />
            {SPREAD_LABEL[b]}
          </span>
        ))}
      </p>
    </section>
  );
}
