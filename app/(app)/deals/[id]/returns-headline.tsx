"use client";

// The model's returns headline, moved out of model-view.tsx so a page that
// draws only it (the homepage's walkthrough of the sample deal) loads none of
// the model tab's server actions, sensitivity engine or document panel;
// model-view.tsx re-exports it and draws its tiles with the same Stat.
import { withArticle } from "@/lib/article";
import type { UnderwritingModel } from "@/lib/model/types";
import type { ModelReturnsRead } from "@/lib/compare-interest";
import { CAP_WITHHELD } from "@/lib/cap-slot";
import { noIrrText, noIrrWhy } from "@/lib/underwrite/no-irr";
import { YOC_WITHHELD, modelYieldWithheld } from "@/lib/plan-facts";

export const usd = (n: number | null | undefined) =>
  n == null
    ? "—"
    : (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString();
export const pct = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(2) + "%";
export const mult = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(2) + "x";

function Stat({
  label,
  value,
  tone,
  words = false,
}: {
  label: string;
  value: string;
  /** colour the figure when it is a warning rather than a result */
  tone?: "kill" | "caution";
  /** the value is words, not a figure — why none is shown — said small */
  words?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      {words ? (
        <p className="mt-1.5 text-sm font-medium leading-snug text-muted">{value}</p>
      ) : (
        <p
          className={`mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums ${
            tone === "kill" ? "text-kill" : tone === "caution" ? "text-caution" : ""
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}

/** The yield that stands in the cap's slot where the price buys no
 *  building's cap — lib/compare-interest `OWN_YIELD_WORDS`' labels, whose
 *  module this client file does not load (as app/(app)/deals/pipeline.tsx
 *  keeps its own copy). */
const OWN_YIELD_LABEL: Record<"note" | "position", string> = {
  note: "Yield to maturity",
  position: "Yield to redemption",
};

/** Past this, NOI ÷ price is not a cap rate: no operating US property yields
 *  a quarter of its price a year. The figure is a stabilized pro forma on a
 *  different basis (the finished conversion, the renovated building) or a
 *  misread — either way not a return. Mirrors lib/deal-strategy. */
const IMPLAUSIBLE_CAP = 0.25;

export function ReturnsHeadline({
  model,
  interest = null,
}: {
  model: UnderwritingModel;
  /** what the price buys (lib/compare-interest `modelReturnsRead`): a
   *  note's, a share's or a preferred equity position's returns are
   *  withheld, with the reason */
  interest?: ModelReturnsRead | null;
}) {
  const r = model.returns;
  const withheld = interest?.withheld ?? null;
  // What a withheld tile says after "n/a — ": what the price buys, or where
  // the lease ends inside the hold, when (lib/compare-interest).
  const naWord = withheld ? (interest?.word ?? withheld) : null;
  // A yield on cost no project earns, refused (research pass 38).
  const yieldRefused = modelYieldWithheld(r.yieldOnCostPct);
  // Where no IRR solves, why, in the dash's place (research pass 38,
  // lib/underwrite/no-irr): the cash back is the profit plus the equity.
  const noIrrReason = noIrrWhy(r.leveredIrrPct, r.netSaleProceeds, r.profit + r.equity);
  const noIrr = noIrrReason ? noIrrText(noIrrReason) : null;
  // The building's NOI over a loan's or a share's price is no misread plan:
  // the price is not the building's, and the line above the figures says so.
  const implausible = !withheld && r.purchasePrice > 0 && r.year1Noi / r.purchasePrice >= IMPLAUSIBLE_CAP;
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        {/* Named, since the screening model's returns can sit beside it
            (the Overview's playground, /demo's Sensitivity tab). */}
        <h2 className="text-sm font-semibold tracking-tight">
          Projected returns{" "}
          <span className="font-normal text-muted">· first-draft model</span>
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted">
          {model.holdYears}-yr hold
        </span>
      </div>
      {implausible && (
        <div className="mt-3 rounded-xl border border-kill/30 border-l-4 border-l-kill bg-kill/5 px-4 py-3">
          <p className="text-sm font-semibold text-kill">
            This model books the finished project’s NOI as year-1 income
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {usd(r.year1Noi)} of NOI against {withArticle(usd(r.purchasePrice))} price is{" "}
            {withArticle(pct(r.goingInCapPct))} cap rate, which no operating property yields. The
            figure is the stabilized pro forma — what the building earns once
            the plan is complete and leased — but this model carries no
            construction budget, downtime or lease-up, so every return below is
            computed against the acquisition price alone and overstates the
            deal. Regenerate the model: the screen now reads the plan and
            reports yield on total cost with the years it takes to get there.
          </p>
        </div>
      )}
      {/* A deal with a plan is judged on what the finished building earns
          against everything it cost to get there — the yield on cost — and
          its going-in cap is whatever year 1 really is, dark or not. Models
          stored before the plan existed carry no yardsticks (undefined) and
          render as before. */}
      {r.yieldOnCostPct != null && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* A yield no project earns is refused, its sentence under the
              tiles — the compare table's cell for this model says the same
              (lib/plan-facts `modelYieldWithheld`, research pass 38). */}
          <Stat
            label={r.stabilizedYear ? `Yield on cost (Yr ${r.stabilizedYear}, incl. carry)` : "Yield on cost"}
            value={yieldRefused ? YOC_WITHHELD : pct(r.yieldOnCostPct)}
          />
          <Stat
            label={r.worksCarry != null && r.worksCarry > 0 ? "Total cost (incl. carry)" : "Total cost"}
            value={usd(r.totalCost)}
          />
          <Stat label="Capital budget" value={usd(r.capitalBudget)} />
          <Stat
            label={r.stabilizedYear ? `Stabilized NOI (Yr ${r.stabilizedYear})` : "Stabilized NOI"}
            value={r.stabilizedNoi != null ? usd(r.stabilizedNoi) : "—"}
          />
        </div>
      )}
      {yieldRefused && (
        <p data-qa="yield-withheld" className="mt-3 max-w-2xl text-xs leading-relaxed text-muted">
          {yieldRefused}
        </p>
      )}
      {interest?.line && (
        <p data-qa="returns-withheld" className="mt-3 max-w-2xl text-xs leading-relaxed text-muted">
          {interest.line}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Levered IRR"
          value={naWord ? `n/a — ${naWord}` : (noIrr ?? pct(r.leveredIrrPct))}
          tone={implausible ? "kill" : undefined}
          words={!naWord && noIrr != null}
        />
        <Stat label="Cash-on-cash (Yr 1)" value={naWord ? `n/a — ${naWord}` : pct(r.cashOnCashPct)} tone={implausible ? "kill" : undefined} />
        <Stat label="Equity multiple" value={naWord ? `n/a — ${naWord}` : mult(r.equityMultiple)} tone={implausible ? "kill" : undefined} />
        {withheld === "note" || withheld === "position" ? (
          // A note has no cap: its yield to maturity at its price where it
          // pays or may, the deal header's own slot (lib/compare-interest);
          // nor has a preferred equity position: its yield to redemption
          // where the date has not gone by.
          interest?.noteYtmPct != null ? (
            <Stat label={OWN_YIELD_LABEL[withheld]} value={pct(interest.noteYtmPct)} />
          ) : interest?.underWater ? (
            // Under water, its contract yield assumes a repayment the
            // collateral does not cover (research pass 38).
            <Stat label={OWN_YIELD_LABEL.note} value={CAP_WITHHELD.under_water.na} />
          ) : (
            <Stat label="Going-in cap" value={`n/a — ${withheld}`} />
          )
        ) : interest?.share ? (
          // A share's cap is struck on the whole its price implies.
          <Stat
            label="Going-in cap (on the whole)"
            value={interest.cap != null ? pct(interest.cap) : "n/a — share"}
          />
        ) : (
          <Stat
            label={r.yieldOnCostPct != null ? "Going-in cap (Yr 1)" : "Going-in cap"}
            value={pct(r.goingInCapPct)}
            tone={implausible ? "kill" : r.goingInCapPct < 0 ? "caution" : undefined}
          />
        )}
        <Stat label="Purchase price" value={usd(r.purchasePrice)} />
        <Stat label="Equity" value={usd(r.equity)} />
        <Stat
          label="Year-1 NOI"
          value={usd(r.year1Noi)}
          tone={implausible ? "kill" : r.year1Noi < 0 ? "caution" : undefined}
        />
        <Stat label="Exit value" value={usd(r.exitValue)} tone={implausible ? "kill" : undefined} />
      </div>
    </section>
  );
}
