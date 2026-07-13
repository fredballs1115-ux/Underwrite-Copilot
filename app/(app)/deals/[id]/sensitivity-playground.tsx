"use client";

import { useMemo, useState } from "react";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import {
  leverValues,
  runScenario,
  fmtPct,
  fmtX,
  fmtBpsDelta,
  fmtPtDelta,
  type ScenarioMetrics,
} from "@/lib/underwrite/playground";
import { METRIC_FIND, type BuyBox } from "@/lib/criteria";
import { scoreMandateFit, type MandateVerdict } from "@/lib/mandate";

/** Everything the playground needs, computed server-side once. */
export interface PlaygroundData {
  inputs: UnderwriteInputs;
  dealAssetClass: string;
  /** the same source the buy-box check judges (extraction/first-signal) */
  checkSource: {
    assetClass?: string;
    market?: string;
    address?: string;
    metrics: { label: string; value: string }[];
  } | null;
  box: BuyBox | null;
}

const MANDATE_CHIP: Record<MandateVerdict, string> = {
  PURSUE: "bg-pass/15 text-pass",
  WATCH: "bg-caution/15 text-caution",
  PASS: "bg-kill/15 text-kill",
};
const MANDATE_LABEL: Record<MandateVerdict, string> = {
  PURSUE: "Pursue",
  WATCH: "Watch",
  PASS: "Pass",
};

/** Swap the scenario's computed IRR / CoC into the metric set the mandate
 *  score reads, replacing the OM's broker figures — same scorer, model basis. */
function withScenarioReturns(
  metrics: { label: string; value: string }[],
  irrDec: number | null,
  cocDec: number | null,
): { label: string; value: string }[] {
  const kept = metrics.filter(
    (m) => !METRIC_FIND.irr.inc.test(m.label) && !METRIC_FIND.coc.inc.test(m.label),
  );
  const out = [...kept];
  if (irrDec != null && Number.isFinite(irrDec)) {
    out.push({ label: "IRR", value: `${(irrDec * 100).toFixed(1)}%` });
  }
  if (cocDec != null && Number.isFinite(cocDec)) {
    out.push({ label: "Cash-on-cash", value: `${(cocDec * 100).toFixed(1)}%` });
  }
  return out;
}

/**
 * The Sensitivity Playground (Feature 2): three levers over the deal's
 * underwriting model, recomputed in-browser on every drag — returns, and the
 * mandate verdict + fit score, move live. Pure math (the tested engine); the
 * LLM pipeline is never re-run from here.
 */
export function SensitivityPlayground({ data }: { data: PlaygroundData }) {
  const { inputs, dealAssetClass, checkSource, box } = data;
  // Slider stops are fixed by the base model; index 2 is the base itself.
  const caps = useMemo(() => leverValues("exitCapPct", inputs.exitCapPct), [inputs]);
  const growths = useMemo(
    () => leverValues("rentGrowthPct", inputs.rentGrowthPct),
    [inputs],
  );
  const vacs = useMemo(() => leverValues("vacancyPct", inputs.vacancyPct), [inputs]);

  const [capIdx, setCapIdx] = useState(2);
  const [growthIdx, setGrowthIdx] = useState(2);
  const [vacIdx, setVacIdx] = useState(2);
  const dirty = capIdx !== 2 || growthIdx !== 2 || vacIdx !== 2;

  // The EFFECTIVE base is the sliders' center stops (clamped into physical
  // range), so a degenerate derived input can't make the resting metrics
  // disagree with what the levers say they're at.
  const base = useMemo(
    () =>
      runScenario(inputs, {
        exitCapPct: caps[2],
        rentGrowthPct: growths[2],
        vacancyPct: vacs[2],
      }),
    [inputs, caps, growths, vacs],
  );
  const current = useMemo(
    () =>
      dirty
        ? runScenario(inputs, {
            exitCapPct: caps[capIdx],
            rentGrowthPct: growths[growthIdx],
            vacancyPct: vacs[vacIdx],
          })
        : base,
    [inputs, caps, growths, vacs, capIdx, growthIdx, vacIdx, dirty, base],
  );

  // Live mandate fit on the SAME scorer, with the model's IRR/CoC swapped in.
  // Compared against the playground's own base (also model-based) so the
  // delta isolates the sliders, not the OM-vs-model difference.
  const score = useMemo(() => {
    if (!box || !checkSource) return null;
    const at = (m: ScenarioMetrics) =>
      scoreMandateFit(
        dealAssetClass,
        {
          ...checkSource,
          metrics: withScenarioReturns(checkSource.metrics, m.leveredIrrPct, m.cocYr1Pct),
        },
        box,
      );
    const b = at(base);
    const c = dirty ? at(current) : b;
    if (c.score == null || !c.verdict) return null;
    return { current: c, base: b };
  }, [box, checkSource, dealAssetClass, base, current, dirty]);

  const reset = () => {
    setCapIdx(2);
    setGrowthIdx(2);
    setVacIdx(2);
  };

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Sensitivity playground
        </h2>
        <p className="text-xs text-muted">
          Recomputed from the underwriting model as you drag — no re-screen.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Lever
          label="Exit cap"
          values={caps}
          idx={capIdx}
          onChange={setCapIdx}
          display={(v) => fmtPct(v, 2)}
          deltaOf={fmtBpsDelta}
        />
        <Lever
          label="Rent growth"
          values={growths}
          idx={growthIdx}
          onChange={setGrowthIdx}
          display={(v) => fmtPct(v, 1)}
          deltaOf={fmtBpsDelta}
        />
        <Lever
          label="Vacancy"
          values={vacs}
          idx={vacIdx}
          onChange={setVacIdx}
          display={(v) => fmtPct(v, 1)}
          deltaOf={fmtPtDelta}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Levered IRR" value={fmtPct(current.leveredIrrPct)} cur={current.leveredIrrPct} was={base.leveredIrrPct} baseText={fmtPct(base.leveredIrrPct)} dirty={dirty} />
        <Metric label="Equity multiple" value={fmtX(current.leveredEquityMultiple)} cur={current.leveredEquityMultiple} was={base.leveredEquityMultiple} baseText={fmtX(base.leveredEquityMultiple)} dirty={dirty} />
        <Metric label="Year-1 CoC" value={fmtPct(current.cocYr1Pct)} cur={current.cocYr1Pct} was={base.cocYr1Pct} baseText={fmtPct(base.cocYr1Pct)} dirty={dirty} />
        <Metric label="Year-1 DSCR" value={fmtX(current.dscrYr1)} cur={current.dscrYr1} was={base.dscrYr1} baseText={fmtX(base.dscrYr1)} dirty={dirty} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {score ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${MANDATE_CHIP[score.current.verdict!]}`}
            >
              {MANDATE_LABEL[score.current.verdict!]} · {score.current.score}/100
            </span>
            {dirty && score.base.score != null && score.base.score !== score.current.score && (
              <span>
                base {score.base.score}/100 — fit moves through IRR and
                cash-on-cash only
              </span>
            )}
            {!dirty && <span>mandate fit at the model&apos;s base case</span>}
          </p>
        ) : box && checkSource ? (
          // A box IS set but no configured dimension is computable for this
          // deal/scenario — say that, never "no buy box".
          <span className="text-xs text-muted">
            Mandate fit can&apos;t be computed for this deal&apos;s scenario yet.
          </span>
        ) : (
          <span className="text-xs text-muted">
            Set a buy box to see the fit score move with the sliders.
          </span>
        )}
        {dirty && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition-colors hover:bg-faint"
          >
            Reset to base case
          </button>
        )}
      </div>
    </section>
  );
}

function Lever({
  label,
  values,
  idx,
  onChange,
  display,
  deltaOf,
}: {
  label: string;
  values: number[];
  idx: number;
  onChange: (i: number) => void;
  display: (v: number) => string;
  deltaOf: (v: number, base: number) => string;
}) {
  const v = values[idx];
  // "Base" is decided by INDEX, not value equality — a clamped stop that
  // happens to duplicate the base must not claim to be it.
  const atBase = idx === 2;
  const base = display(values[2]);
  const d = atBase ? "base" : deltaOf(v, values[2]);
  return (
    <div className="rounded-xl border border-line/70 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {display(v)}
          <span className={`ml-1.5 text-[11px] font-normal ${atBase ? "text-muted" : "text-brand"}`}>
            {atBase
              ? `base ${base}`
              : `(base ${base}, ${d === "base" ? "no change" : d})`}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={values.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} scenario`}
        className="mt-2 w-full accent-brand"
      />
      <div className="flex justify-between text-[10px] tabular-nums text-muted">
        <span>{display(values[0])}</span>
        <span>{display(values[values.length - 1])}</span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  cur,
  was,
  baseText,
  dirty,
}: {
  label: string;
  value: string;
  cur: number | null;
  was: number | null;
  baseText: string;
  dirty: boolean;
}) {
  // Higher is better for all four headline metrics.
  const cls =
    !dirty || cur == null || was == null || Math.abs(cur - was) < 1e-9
      ? ""
      : cur > was
        ? "text-pass"
        : "text-kill";
  return (
    <div className="rounded-xl border border-line/70 p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`font-mono text-lg font-semibold tabular-nums ${cls}`}>{value}</p>
      {dirty && <p className="text-[10px] tabular-nums text-muted">base {baseText}</p>}
    </div>
  );
}
