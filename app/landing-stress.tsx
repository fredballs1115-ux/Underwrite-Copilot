"use client";

// "Break it yourself": the deterministic return engine, running in the
// reader's browser on the illustrative sample deal. Three levers — exit cap,
// rent growth, vacancy — and every tick recomputes through the SAME
// computeModel the product ships (pure code, no server round-trip, no AI).
// This makes the toolkit tile's "drag the levers, watch it break" claim a
// demonstration instead of a promise. Sample data only, labeled as such.
// No animation — state changes only, so reduced-motion needs no branch.

import { useMemo, useState } from "react";
import { computeModel } from "@/lib/model/compute";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { SLIDER_SWEEP_BPS } from "@/lib/marketing-constants";

const BASE = SAMPLE_DEAL.model.inputs;
// The exit-cap lever sweeps the SAME band the product's slider claims
// (SLIDER_SWEEP_BPS total), centered on the broker's base.
const CAP_HALF = SLIDER_SWEEP_BPS / 200;

const fmtPct = (n: number | null) =>
  n == null || !isFinite(n) ? "—" : `${n.toFixed(1)}%`;
const fmtX = (n: number | null) =>
  n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}x`;
const fmtM = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

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
          <span className="text-white/40">
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

export function StressBench() {
  const [exitCap, setExitCap] = useState(BASE.exitCapPct);
  const [rentGrowth, setRentGrowth] = useState(BASE.rentGrowthPct);
  const [vacancy, setVacancy] = useState(BASE.vacancyPct);

  const base = useMemo(() => computeModel(BASE).returns, []);
  const r = useMemo(
    () =>
      computeModel({
        ...BASE,
        exitCapPct: exitCap,
        rentGrowthPct: rentGrowth,
        vacancyPct: vacancy,
      }).returns,
    [exitCap, rentGrowth, vacancy],
  );

  const touched =
    exitCap !== BASE.exitCapPct ||
    rentGrowth !== BASE.rentGrowthPct ||
    vacancy !== BASE.vacancyPct;
  const dIrr =
    r.leveredIrrPct != null && base.leveredIrrPct != null
      ? r.leveredIrrPct - base.leveredIrrPct
      : null;
  // Tone follows the DELTA from the broker's base — the panel never invents
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
    setExitCap(BASE.exitCapPct);
    setRentGrowth(BASE.rentGrowthPct);
    setVacancy(BASE.vacancyPct);
  };

  return (
    <div>
      <div className="grid gap-8 rounded-2xl border border-white/12 bg-white/[0.04] p-6 sm:p-7 lg:grid-cols-[1fr_auto] lg:gap-12">
        <div className="space-y-6">
          <Lever
            label="Exit cap"
            value={exitCap}
            base={BASE.exitCapPct}
            min={BASE.exitCapPct - CAP_HALF}
            max={BASE.exitCapPct + CAP_HALF}
            step={0.05}
            unit="%"
            onChange={setExitCap}
          />
          <Lever
            label="Rent growth"
            value={rentGrowth}
            base={BASE.rentGrowthPct}
            min={0}
            max={6}
            step={0.25}
            unit="%"
            onChange={setRentGrowth}
          />
          <Lever
            label="Vacancy"
            value={vacancy}
            base={BASE.vacancyPct}
            min={2}
            max={15}
            step={0.5}
            unit="%"
            onChange={setVacancy}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-white/45">
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

        <dl className="grid min-w-[15rem] grid-cols-2 content-start gap-x-10 gap-y-5">
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/45">
              Levered IRR
            </dt>
            <dd
              className={`mt-0.5 font-mono text-3xl font-semibold tabular-nums ${tone}`}
            >
              {fmtPct(r.leveredIrrPct)}
            </dd>
            <dd className="mt-0.5 h-4 text-xs text-white/50">
              {touched && dIrr != null && (
                <span className={tone}>
                  {dIrr > 0 ? "+" : ""}
                  {dIrr.toFixed(1)}pts vs the broker&apos;s base
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/45">
              Equity multiple
            </dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
              {fmtX(r.equityMultiple)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/45">
              Cash-on-cash (Yr 1)
            </dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
              {fmtPct(r.cashOnCashPct)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/45">
              Exit value
            </dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
              {fmtM(r.exitValue)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-white/45">
              Year-1 NOI
            </dt>
            <dd className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
              {fmtM(r.year1Noi)}
            </dd>
          </div>
        </dl>
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-white/45">
        Illustrative sample deal ({BASE.units} units, {fmtM(BASE.purchasePrice)}
        ) — not a real listing. Same deterministic <code>computeModel</code>{" "}
        that prices every real screen and builds the Excel workbook.
      </p>
    </div>
  );
}
