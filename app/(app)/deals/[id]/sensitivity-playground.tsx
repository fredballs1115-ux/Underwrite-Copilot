"use client";

import { useMemo, useState } from "react";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import {
  sliderValues,
  runScenario,
  yearOneNoi,
  fmtPct,
  fmtX,
  fmtBpsDelta,
  fmtPtDelta,
  type ScenarioMetrics,
} from "@/lib/underwrite/playground";
import { METRIC_FIND, type BuyBox } from "@/lib/criteria";
import { scoreMandateFit, type MandateVerdict } from "@/lib/mandate";
import { solveMaxBid, type BidFloors, type MaxBidSolution } from "@/lib/underwrite/solver";

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
  // Slider stops are fixed by the base model; each lever carries its own
  // base index (range ends can collapse when the base sits near a bound).
  const caps = useMemo(() => sliderValues("exitCapPct", inputs.exitCapPct), [inputs]);
  const growths = useMemo(
    () => sliderValues("rentGrowthPct", inputs.rentGrowthPct),
    [inputs],
  );
  const vacs = useMemo(() => sliderValues("vacancyPct", inputs.vacancyPct), [inputs]);

  const [capIdx, setCapIdx] = useState(caps.baseIdx);
  const [growthIdx, setGrowthIdx] = useState(growths.baseIdx);
  const [vacIdx, setVacIdx] = useState(vacs.baseIdx);
  // Your price: null = the modeled price. Typing a price (or a going-in cap,
  // its mirror) reprices the WHOLE model — debt, equity, fees, and every
  // metric below recompute, exactly like re-running the screen at that basis.
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  // If the underlying model changes (re-screen, actuals fold-in), the stop
  // lists are rebuilt — snap back to the NEW base during render (the React
  // "adjust state when props change" idiom); a stale index may not even
  // exist in the new list.
  const [prevStops, setPrevStops] = useState(caps);
  if (prevStops !== caps) {
    setPrevStops(caps);
    setCapIdx(caps.baseIdx);
    setGrowthIdx(growths.baseIdx);
    setVacIdx(vacs.baseIdx);
    setPriceOverride(null);
  }
  const dirty =
    capIdx !== caps.baseIdx ||
    growthIdx !== growths.baseIdx ||
    vacIdx !== vacs.baseIdx ||
    priceOverride != null;

  // The EFFECTIVE base is the sliders' base stops (clamped into physical
  // range), so a degenerate derived input can't make the resting metrics
  // disagree with what the levers say they're at.
  const base = useMemo(
    () =>
      runScenario(inputs, {
        exitCapPct: caps.values[caps.baseIdx],
        rentGrowthPct: growths.values[growths.baseIdx],
        vacancyPct: vacs.values[vacs.baseIdx],
      }),
    [inputs, caps, growths, vacs],
  );
  const current = useMemo(
    () =>
      dirty
        ? runScenario(inputs, {
            exitCapPct: caps.values[capIdx],
            rentGrowthPct: growths.values[growthIdx],
            vacancyPct: vacs.values[vacIdx],
            ...(priceOverride != null ? { purchasePrice: priceOverride } : {}),
          })
        : base,
    [inputs, caps, growths, vacs, capIdx, growthIdx, vacIdx, priceOverride, dirty, base],
  );

  // Year-one NOI at the current vacancy lever — the price <-> going-in-cap
  // inversion pivots on it (price never enters NOI).
  const noiY1 = useMemo(
    () => yearOneNoi(inputs, { vacancyPct: vacs.values[vacIdx] }),
    [inputs, vacs, vacIdx],
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

  // Max bid: the highest price that still clears the box's return floors,
  // solved under the CURRENT slider scenario — drag exit cap out 50bps and
  // watch your number drop. Pure engine (grid + bisection), ~2ms per solve.
  const bid = useMemo(() => {
    if (!box) return null;
    const floors: BidFloors = {
      ...(box.minIrrPct != null ? { minIrr: box.minIrrPct / 100 } : {}),
      ...(box.minCoCPct != null ? { minCoc: box.minCoCPct / 100 } : {}),
      ...(box.minCapPct != null ? { minCap: box.minCapPct / 100 } : {}),
    };
    if (floors.minIrr == null && floors.minCoc == null && floors.minCap == null)
      return null;
    return solveMaxBid(inputs, floors, {
      exitCapPct: caps.values[capIdx],
      rentGrowthPct: growths.values[growthIdx],
      vacancyPct: vacs.values[vacIdx],
    });
  }, [box, inputs, caps, growths, vacs, capIdx, growthIdx, vacIdx]);

  const reset = () => {
    setCapIdx(caps.baseIdx);
    setGrowthIdx(growths.baseIdx);
    setVacIdx(vacs.baseIdx);
    setPriceOverride(null);
  };

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Sensitivity playground
        </h2>
        <p className="text-xs text-muted">
          Recomputed from the underwriting model as you type or drag — no
          re-screen.
        </p>
      </div>

      <PriceCapControls
        basePrice={inputs.purchasePrice}
        noiY1={noiY1}
        value={priceOverride}
        onChange={setPriceOverride}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Lever
          label="Exit cap"
          values={caps.values}
          baseIdx={caps.baseIdx}
          idx={capIdx}
          onChange={setCapIdx}
          display={(v) => fmtPct(v, 2)}
          deltaOf={fmtBpsDelta}
        />
        <Lever
          label="Rent growth"
          values={growths.values}
          baseIdx={growths.baseIdx}
          idx={growthIdx}
          onChange={setGrowthIdx}
          display={(v) => fmtPct(v, 1)}
          deltaOf={fmtBpsDelta}
        />
        <Lever
          label="Vacancy"
          values={vacs.values}
          baseIdx={vacs.baseIdx}
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

      {bid && (
        <MaxBidCard
          bid={bid}
          box={box!}
          modeledPrice={inputs.purchasePrice}
          dirty={dirty}
        />
      )}
      {box && !bid && (
        <p className="mt-3 text-xs text-muted">
          Add an IRR, cash-on-cash, or cap-rate floor to your buy box and this
          panel will solve for your max bid.
        </p>
      )}

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
            {dirty && score.base.score === score.current.score && (
              // The score is recomputed on every drag; when it legitimately
              // doesn't move (returns stay on the same side of every mandate
              // threshold), say so — a static chip must never read as broken.
              <span>
                fit unchanged — these returns don&apos;t cross a mandate
                threshold
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

/** Parse "$2,000,000", "2000000", "2m", "2.5 MM", "750k" → dollars. */
function parsePriceText(s: string): number | null {
  const m = s.trim().toLowerCase().match(/^\$?\s*([\d,]*\.?\d+)\s*(mm?|k)?$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const mult = m[2]?.startsWith("m") ? 1e6 : m[2] === "k" ? 1e3 : 1;
  return n * mult;
}

const fmtUsd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Price ⇄ going-in cap, as one linked control. Typing either reprices the
 * whole model: price is a real engine input (debt, fees, and equity re-size
 * from it), and cap is its mirror through year-one NOI (cap = NOI ÷ price),
 * so the two fields can never disagree.
 */
function PriceCapControls({
  basePrice,
  noiY1,
  value,
  onChange,
}: {
  basePrice: number;
  noiY1: number;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState<"price" | "cap" | null>(null);
  const [draft, setDraft] = useState("");
  const price = value ?? basePrice;
  const capPct = price > 0 && noiY1 > 0 ? (noiY1 / price) * 100 : null;
  const atBase = value == null;
  const deltaPct = basePrice > 0 ? ((price - basePrice) / basePrice) * 100 : 0;

  // Snapping back to (nearly) the modeled price clears the override entirely,
  // so "base" stays an exact state, never a float hair away from it.
  const commit = (n: number | null) => {
    if (n == null) return;
    // Ignore keystroke fragments ("5" on the way to "55000000"): only prices
    // within 1%–100x of the modeled price commit; anything else waits for
    // more typing. Snapping (nearly) back to base clears the override.
    if (n < basePrice * 0.01 || n > basePrice * 100) return;
    onChange(Math.abs(n - basePrice) < 0.5 ? null : n);
  };
  const commitPrice = (s: string) => {
    setDraft(s);
    commit(parsePriceText(s));
  };
  const commitCap = (s: string) => {
    setDraft(s);
    const c = parseFloat(s.replace(/[%\s]/g, ""));
    if (Number.isFinite(c) && c > 0.1 && c < 50 && noiY1 > 0) {
      commit(noiY1 / (c / 100));
    }
  };
  const inputCls =
    "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm font-semibold tabular-nums outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

  return (
    <div className="mt-4 rounded-xl border border-brand/25 bg-brand/[0.04] p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-tight">Your price</span>
        <span className="text-[11px] text-muted">
          type a price or a going-in cap — the whole model reprices
        </span>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-muted">
            Purchase price
          </span>
          <input
            inputMode="decimal"
            value={editing === "price" ? draft : fmtUsd0(price)}
            onFocus={(e) => {
              setEditing("price");
              setDraft(e.currentTarget.value);
            }}
            onChange={(e) => commitPrice(e.currentTarget.value)}
            onBlur={() => setEditing(null)}
            aria-label="Purchase price scenario"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-muted">
            Going-in cap
          </span>
          <input
            inputMode="decimal"
            value={
              editing === "cap"
                ? draft
                : capPct != null
                  ? `${capPct.toFixed(2)}%`
                  : "—"
            }
            onFocus={(e) => {
              setEditing("cap");
              setDraft(e.currentTarget.value);
            }}
            onChange={(e) => commitCap(e.currentTarget.value)}
            onBlur={() => setEditing(null)}
            aria-label="Going-in cap scenario"
            className={inputCls}
          />
        </label>
        <div className="flex items-end pb-2.5">
          {atBase ? (
            <span className="text-xs text-muted">at the modeled price</span>
          ) : (
            <span
              className={`text-xs font-medium tabular-nums ${
                deltaPct < 0 ? "text-pass" : "text-caution"
              }`}
            >
              {deltaPct >= 0 ? "+" : "−"}
              {Math.abs(deltaPct).toFixed(1)}% vs modeled ({fmtUsd0(basePrice)})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Rounded DOWN at display precision so the printed bid still clears the
 *  floors — "$9.74M" must never stand for a solved $9,738,000. */
function fmtBid(n: number): string {
  if (n >= 1e9) return `$${(Math.floor(n / 1e7) / 100).toFixed(2)}B`;
  if (n >= 1e6) return `$${(Math.floor(n / 1e4) / 100).toFixed(2)}M`;
  return `$${Math.floor(n / 1e3).toLocaleString("en-US")}k`;
}

function bindingLabel(key: NonNullable<MaxBidSolution["binding"]>, box: BuyBox): string {
  switch (key) {
    case "minIrr":
      return `your ${box.minIrrPct}% IRR floor binds`;
    case "minCoc":
      return `your ${box.minCoCPct}% cash-on-cash floor binds`;
    case "minCap":
      return `your ${box.minCapPct}% going-in cap floor binds`;
  }
}

function MaxBidCard({
  bid,
  box,
  modeledPrice,
  dirty,
}: {
  bid: MaxBidSolution;
  box: BuyBox;
  modeledPrice: number;
  dirty: boolean;
}) {
  return (
    <div className="mt-3 rounded-xl border border-brand/25 bg-brand/[0.04] p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tracking-tight">Max bid</span>
        <span className="text-[11px] text-muted">
          highest price that still clears your box
          {dirty ? " — under the current slider scenario" : ""}
        </span>
      </div>
      {bid.price == null ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          No price in range clears your floors under this scenario — the deal
          economics, not the price, are the blocker.
        </p>
      ) : bid.unbounded ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Your floors hold even at twice the modeled price — the buy box
          isn&apos;t the constraint on this deal.
        </p>
      ) : (
        <>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-lg font-semibold tabular-nums">
              {fmtBid(bid.price)}
            </span>
            {bid.deltaPct != null && modeledPrice > 0 && (
              <span
                className={`text-xs font-medium tabular-nums ${
                  bid.deltaPct < 0 ? "text-caution" : "text-pass"
                }`}
              >
                {bid.deltaPct >= 0 ? "+" : "−"}
                {Math.abs(bid.deltaPct * 100).toFixed(1)}% vs the modeled price
              </span>
            )}
            {bid.binding && (
              <span className="text-xs text-muted">
                {bindingLabel(bid.binding, box)}
              </span>
            )}
          </p>
          {bid.at && (
            <p className="mt-1 text-[11px] tabular-nums text-muted">
              at that price: IRR {fmtPct(bid.at.irr)} · year-1 CoC{" "}
              {fmtPct(bid.at.coc)} · going-in cap {fmtPct(bid.at.cap, 2)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Lever({
  label,
  values,
  baseIdx,
  idx,
  onChange,
  display,
  deltaOf,
}: {
  label: string;
  values: number[];
  baseIdx: number;
  idx: number;
  onChange: (i: number) => void;
  display: (v: number) => string;
  deltaOf: (v: number, base: number) => string;
}) {
  const v = values[idx];
  // "Base" is decided by INDEX, not value equality — a clamped stop that
  // happens to duplicate the base must not claim to be it.
  const atBase = idx === baseIdx;
  const base = display(values[baseIdx]);
  const d = atBase ? "base" : deltaOf(v, values[baseIdx]);
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
