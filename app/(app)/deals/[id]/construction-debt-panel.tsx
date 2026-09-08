"use client";

import { useMemo, useState } from "react";
import { parseMoney } from "@/lib/criteria";
import type { PlanSummary } from "@/lib/deal-strategy";
import { sizeConstructionDebt, worksYearsFromTimeline } from "@/lib/construction-debt";

const fmtUsd = (n: number) =>
  Math.abs(n) >= 1e6
    ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`
    : `$${Math.round(n).toLocaleString("en-US")}`;
const fmtInput = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (d: number, dp = 1) => `${(d * 100).toFixed(dp)}%`;

const BINDING_LABEL = {
  dscr: "DSCR binds",
  debt_yield: "debt yield binds",
  ltv: "LTV on stabilized value binds",
} as const;

/**
 * Construction & take-out for a plan deal: the loan a construction lender
 * sizes to total cost (with the interest reserve it funds inside the loan),
 * what the finished project's NOI can carry as permanent debt at
 * stabilization, and the gap between the two when there is one. Seeded from
 * the OM's plan — budget, stabilized NOI, timeline — and from the permanent
 * sizer's own lender terms, so one set of assumptions drives both stories.
 * Pure math, no AI; every figure stays editable.
 */
export function ConstructionDebtPanel({
  plan,
  planLabel,
  exitCapPct,
  takeOutRatePct,
  amortYears,
  minDscr,
  minDebtYieldPct,
  maxLtvPct,
  numCls,
}: {
  plan: PlanSummary;
  planLabel: string;
  /** the model's exit cap, % — values the finished project at take-out */
  exitCapPct: number | null;
  takeOutRatePct: number;
  amortYears: number;
  minDscr: number;
  minDebtYieldPct: number;
  maxLtvPct: number;
  numCls: string;
}) {
  const seededYears = worksYearsFromTimeline(plan.timeline);
  const [budgetRaw, setBudgetRaw] = useState(plan.budget ? fmtInput(plan.budget.budget) : "");
  const [noiRaw, setNoiRaw] = useState(plan.stabilizedNoi ? fmtInput(plan.stabilizedNoi.value) : "");
  const [worksYears, setWorksYears] = useState(seededYears ?? 2);
  const [ratePct, setRatePct] = useState(8);
  const [maxLtcPct, setMaxLtcPct] = useState(60);
  const [exitCap, setExitCap] = useState(exitCapPct ?? 6);

  const budget = parseMoney(budgetRaw);
  const noi = parseMoney(noiRaw);
  // An OM that states an all-in total and no price: the total is the works
  // figure seeded above, and there is no price to add to it.
  const price = plan.price ?? (plan.budget?.isTotal ? 0 : null);

  const r = useMemo(
    () =>
      price != null && budget != null && noi != null
        ? sizeConstructionDebt({
            price,
            budget,
            stabilizedNoi: noi,
            worksYears,
            ratePct,
            maxLtcPct,
            takeOut: {
              ratePct: takeOutRatePct,
              amortYears,
              minDscr,
              minDebtYieldPct,
              maxLtvPct,
              exitCapPct: exitCap > 0 ? exitCap : null,
            },
          })
        : null,
    [price, budget, noi, worksYears, ratePct, maxLtcPct, takeOutRatePct, amortYears, minDscr, minDebtYieldPct, maxLtvPct, exitCap],
  );

  return (
    <section aria-label="Construction and take-out debt" className="mt-2">
      <p className="text-sm text-muted">
        {plan.kind === "value_add" || plan.kind === "lease_up"
          ? `A ${planLabel.toLowerCase()} is usually financed with bridge debt sized to total cost — price plus the works, carry included — and refinanced into permanent debt once the plan stabilizes. The take-out uses the lender terms in the sizer below.`
          : `A ${planLabel.toLowerCase()} borrows against what it costs, not against income it does not have yet: a construction or bridge loan sized to total cost — carry included — paid off at stabilization by permanent debt sized on the finished NOI. The take-out uses the lender terms in the sizer below.`}
        {seededYears == null && (
          <span> The OM states no timeline, so the road to take-out defaults to 2 years — set it.</span>
        )}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Works budget</span>
          <input value={budgetRaw} onChange={(e) => setBudgetRaw(e.target.value)} placeholder="$160M" inputMode="decimal" aria-label="Works budget" className={numCls} />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Stabilized NOI</span>
          <input value={noiRaw} onChange={(e) => setNoiRaw(e.target.value)} placeholder="$21M" inputMode="decimal" aria-label="Stabilized NOI" className={numCls} />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Years to take-out</span>
          <input type="number" step={0.25} min={0.25} max={15} value={worksYears} onChange={(e) => setWorksYears(Number(e.target.value))} aria-label="Years to take-out" className={numCls} />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Construction rate %</span>
          <input type="number" step={0.05} min={0} max={25} value={ratePct} onChange={(e) => setRatePct(Number(e.target.value))} aria-label="Construction loan rate percent" className={numCls} />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Max LTC %</span>
          <input type="number" step={1} min={1} max={95} value={maxLtcPct} onChange={(e) => setMaxLtcPct(Number(e.target.value))} aria-label="Maximum loan to cost percent" className={numCls} />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Exit cap %</span>
          <input type="number" step={0.05} min={0} max={25} value={exitCap} onChange={(e) => setExitCap(Number(e.target.value))} aria-label="Exit cap rate percent" className={numCls} />
        </label>
      </div>

      {r ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Total cost, carry included", `${fmtUsd(r.totalCost)}`, `${fmtUsd(r.hardSoftCost)} price + works, ${fmtUsd(r.interestReserve)} interest reserve`],
                ["Construction loan", fmtUsd(r.constructionLoan), `${maxLtcPct}% of total cost · ${pct(r.equityPctOfCost, 0)} equity = ${fmtUsd(r.equity)}`],
                [
                  "Take-out the finished NOI carries",
                  fmtUsd(r.takeOut.loan),
                  `${BINDING_LABEL[r.takeOut.binding]}${r.stabilizedValue != null ? ` · ${fmtUsd(r.stabilizedValue)} value at a ${exitCap}% cap` : ""}`,
                ],
                [
                  r.refinanceGap > 0 ? "Cash-in refinance at take-out" : "Take-out headroom",
                  r.refinanceGap > 0 ? fmtUsd(r.refinanceGap) : fmtUsd(r.takeOut.loan - r.constructionLoan),
                  r.refinanceGap > 0
                    ? "the finished NOI cannot carry the whole construction loan — the sponsor funds the difference"
                    : "the finished NOI carries more than the construction loan",
                ],
              ] as [string, string, string][]
            ).map(([label, value, note]) => (
              <div
                key={label}
                className={`rounded-lg border px-3 py-2 ${
                  label.startsWith("Cash-in") ? "border-kill/30 bg-kill/5" : "border-line"
                }`}
              >
                <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
                <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</dd>
                <dd className="mt-0.5 text-[11px] leading-snug text-muted">{note}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Yield on total cost with the carry inside it:{" "}
            <span className="font-mono font-semibold tabular-nums text-ink">{pct(r.yieldOnCost)}</span>
            {plan.yieldOnCost != null && (
              <>
                {" "}
                against the OM&apos;s {pct(plan.yieldOnCost)}{" "}on price plus works alone — the reserve is
                a real cost of the plan and the OM&apos;s figure leaves it out.
              </>
            )}{" "}
            The draw is assumed to average {Math.round(0.55 * 100)}% outstanding across the works.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Enter the works budget and the stabilized NOI above and the construction sizing appears here.
        </p>
      )}
    </section>
  );
}
