"use client";

// "Break it yourself": the screening model's engine (lib/underwrite/engine,
// through the deal page's own playground layer), running in the reader's
// browser on the illustrative sample deal. Three levers — exit cap, rent
// growth, vacancy — and every tick re-runs the engine that prices each deal
// page's returns and builds the Excel workbook (pure code, no server
// round-trip, no AI). Its base is the sample's base case as the workbook and
// the homepage's Excel tile derive it (lib/sample-derive, the T-12 leading),
// handed down from the server so no derivation runs in the browser — the
// bench, the tile and the workbook print one figure (research pass 40, M1:
// it had run the first-draft model under words naming it the workbook's
// engine, its dot "the broker's base", which was that model's reconciled
// case). No new arithmetic: a lever left at its base is the base's own input.
// No animation — state changes only, so reduced-motion needs no branch.

import { useMemo, useState } from "react";
import { computeUnderwrite, type UnderwriteInputs } from "@/lib/underwrite/engine";
import { fmtPct, fmtX, runScenario } from "@/lib/underwrite/playground";
import { noIrrText } from "@/lib/underwrite/no-irr";
import { SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { SLIDER_SWEEP_BPS } from "@/lib/marketing-constants";
import { compactUsd } from "@/lib/money";

// The exit-cap lever sweeps the SAME band the product's slider does
// (SLIDER_SWEEP_BPS each way, in percentage points here), centred on the
// base case's exit cap.
const CAP_HALF = SLIDER_SWEEP_BPS / 100;
// A model's rate to two places, as the lever shows it: the base sits on the
// lever's own grid, so "Reset to base" and a drag back land on one figure.
const pct2 = (dec: number) => Math.round(dec * 10_000) / 100;
// A lever at its base runs the base's own input, never the rounded figure.
const moved = (v: number, base: number) => Math.abs(v - base) > 1e-9;

const fmtM = (n: number) => compactUsd(n);

type Levers = { exitCapPct?: number; rentGrowthPct?: number; vacancyPct?: number };

/** The returns as the deal page's playground reads them (`runScenario`),
 *  and the engine's own exit value and year-1 NOI under the same levers. */
function scenario(model: UnderwriteInputs, levers: Levers) {
  const r = computeUnderwrite({ ...model, expenseLines: model.expenseLines.map((l) => ({ ...l })), ...levers });
  return {
    ...runScenario(model, levers),
    exitValue: r.residual.grossSaleProceeds,
    year1Noi: r.cashFlow[0]?.noi ?? null,
  };
}

function Lever({
  label,
  value,
  base,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  base: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-white/70">{label}</span>
        <span className="font-mono tabular-nums text-accent">
          {value.toFixed(2)}
          {unit}
          <span className="text-white/55">
            {" "}
            · base {base.toFixed(2)}
            {unit}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label}, base ${base}${unit}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-auto"
        style={{ accentColor: "#7fd6cc" }}
      />
    </label>
  );
}

// ── IRR gauge ── an analog needle over the same number the big readout
// prints, swinging live as the levers move. Scale 0–25% IRR; the accent
// tick marks the demo mandate's target (a real stored criterion, not an
// invented hurdle) and the faint dot marks the base case.
// aria-hidden — the numeric IRR reads right below it.
const GAUGE_MAX = 25;
const GAUGE_HURDLE = SAMPLE_DEMO_BOX.minIrrPct ?? null;

function gaugeAngle(pct: number | null): number {
  if (pct == null || !isFinite(pct)) return 0;
  return (Math.min(Math.max(pct, 0), GAUGE_MAX) / GAUGE_MAX) * 180;
}
function arcPoint(deg: number, radius: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [100 - radius * Math.cos(rad), 92 - radius * Math.sin(rad)];
}

function IrrGauge({ irr, baseIrr }: { irr: number | null; baseIrr: number | null }) {
  const a = gaugeAngle(irr);
  const hurdleA = GAUGE_HURDLE != null ? gaugeAngle(GAUGE_HURDLE) : null;
  const [hx1, hy1] = hurdleA != null ? arcPoint(hurdleA, 70) : [0, 0];
  const [hx2, hy2] = hurdleA != null ? arcPoint(hurdleA, 86) : [0, 0];
  const basePt = baseIrr != null ? arcPoint(gaugeAngle(baseIrr), 78) : null;
  return (
    <svg viewBox="0 0 200 104" className="irr-gauge mx-auto block w-full max-w-[15rem]">
      <path
        d="M 22 92 A 78 78 0 0 1 178 92"
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {hurdleA != null && (
        <line x1={hx1} y1={hy1} x2={hx2} y2={hy2} stroke="#7fd6cc" strokeWidth="2.5" opacity="0.9" />
      )}
      {basePt && <circle cx={basePt[0]} cy={basePt[1]} r="3" fill="rgba(255,255,255,0.45)" />}
      <g className="gauge-needle" style={{ transform: `rotate(${a}deg)` }}>
        <line x1="100" y1="92" x2="34" y2="92" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="100" cy="92" r="5" fill="currentColor" />
      <text x="18" y="102" fontSize="7" fill="rgba(255,255,255,0.4)">0%</text>
      <text x="168" y="102" fontSize="7" fill="rgba(255,255,255,0.4)">{GAUGE_MAX}%</text>
    </svg>
  );
}

export function StressBench({
  base: model,
  units,
}: {
  /** the sample's derived inputs (lib/sample-derive), the workbook's own */
  base: UnderwriteInputs;
  units: number | null;
}) {
  const capBase = pct2(model.exitCapPct);
  const growthBase = pct2(model.rentGrowthPct);
  const vacancyBase = pct2(model.vacancyPct);
  const [exitCap, setExitCap] = useState(capBase);
  const [rentGrowth, setRentGrowth] = useState(growthBase);
  const [vacancy, setVacancy] = useState(vacancyBase);

  const base = useMemo(() => scenario(model, {}), [model]);
  const r = useMemo(
    () =>
      scenario(model, {
        ...(moved(exitCap, capBase) ? { exitCapPct: exitCap / 100 } : {}),
        ...(moved(rentGrowth, growthBase) ? { rentGrowthPct: rentGrowth / 100 } : {}),
        ...(moved(vacancy, vacancyBase) ? { vacancyPct: vacancy / 100 } : {}),
      }),
    [model, exitCap, rentGrowth, vacancy, capBase, growthBase, vacancyBase],
  );

  const touched = moved(exitCap, capBase) || moved(rentGrowth, growthBase) || moved(vacancy, vacancyBase);
  const dIrr =
    r.leveredIrrPct != null && base.leveredIrrPct != null
      ? (r.leveredIrrPct - base.leveredIrrPct) * 100
      : null;
  // Tone follows the DELTA from the base case — the panel never invents
  // a hurdle rate, it just shows what the levers do to the stated case.
  const tone =
    dIrr == null || !touched
      ? "text-white"
      : dIrr <= -0.1
        ? "text-red-300"
        : dIrr >= 0.1
          ? "text-emerald-300"
          : "text-white";

  const reset = () => {
    setExitCap(capBase);
    setRentGrowth(growthBase);
    setVacancy(vacancyBase);
  };
  const asPct = (dec: number | null) => (dec == null ? null : dec * 100);
  // The vacancy lever keeps its old band (about 2–15% at half-point
  // steps), anchored on the base so the base is one of its stops.
  const vacancyMin = pct2((vacancyBase - 0.5 * Math.min(14, Math.floor(vacancyBase / 0.5))) / 100);
  const vacancyMax = pct2((vacancyBase + 12 * 0.5) / 100);

  return (
    <div>
      <div className="grid gap-8 rounded-2xl border border-white/12 bg-white/[0.04] p-6 sm:p-7 lg:grid-cols-[1fr_auto] lg:gap-12">
        <div className="space-y-6">
          <Lever
            label="Exit cap"
            value={exitCap}
            base={capBase}
            min={capBase - CAP_HALF}
            max={capBase + CAP_HALF}
            step={0.05}
            unit="%"
            onChange={setExitCap}
          />
          <Lever
            label="Rent growth"
            value={rentGrowth}
            base={growthBase}
            min={0}
            max={6}
            step={0.25}
            unit="%"
            onChange={setRentGrowth}
          />
          <Lever
            label="Vacancy"
            value={vacancy}
            base={vacancyBase}
            min={vacancyMin}
            max={vacancyMax}
            step={0.5}
            unit="%"
            onChange={setVacancy}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-white/60">
              A stated exit value is a snapshot, not a movie — drag the cap
              and watch the movie.
            </p>
            {touched && (
              <button
                type="button"
                onClick={reset}
                className="shrink-0 text-xs text-white/55 underline decoration-dotted underline-offset-2 transition-colors hover:text-white"
              >
                Reset to base
              </button>
            )}
          </div>
        </div>

        <div className="min-w-[15rem]">
          <div aria-hidden className={tone}>
            <IrrGauge irr={asPct(r.leveredIrrPct)} baseIrr={asPct(base.leveredIrrPct)} />
            <p className="mt-1 text-center text-[10px] text-white/55">
              tick = the demo mandate&apos;s{" "}
              {GAUGE_HURDLE != null ? `${GAUGE_HURDLE}%` : ""} IRR target · dot
              = the base case
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-2 content-start gap-x-10 gap-y-5">
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Levered IRR
            </dt>
            <dd
              className={`mt-0.5 font-mono text-3xl font-semibold tabular-nums ${tone}`}
            >
              {fmtPct(r.leveredIrrPct)}
            </dd>
            <dd className="mt-0.5 h-4 text-xs text-white/50">
              {r.leveredIrrPct == null && r.noIrr ? (
                <span>{noIrrText(r.noIrr)}</span>
              ) : (
                touched &&
                dIrr != null && (
                  <span className={tone}>
                    {dIrr > 0 ? "+" : ""}
                    {dIrr.toFixed(1)}pts vs the base case
                  </span>
                )
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Equity multiple
            </dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
              {fmtX(r.leveredEquityMultiple)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Cash-on-cash (Yr 1)
            </dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
              {fmtPct(r.cocYr1Pct)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Exit value
            </dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
              {fmtM(r.exitValue)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/60">
              Year-1 NOI
            </dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
              {r.year1Noi == null ? "—" : fmtM(r.year1Noi)}
            </dd>
          </div>
          </dl>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-white/60">
        Illustrative sample deal ({units != null ? `${units} units, ` : ""}
        {fmtM(model.purchasePrice)}), not a real listing — the screening engine
        behind each deal page&apos;s returns and the Excel workbook, run from
        the workbook&apos;s own base case.
      </p>
    </div>
  );
}
