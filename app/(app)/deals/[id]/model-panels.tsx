"use client";

// The first-draft model card's views — the sensitivity grid, the stress
// test, the conflicts, the assumptions, the capital plan and the cash flow —
// moved out of model-view.tsx so a page that draws them on the sample (/demo
// and the homepage, through model-body's `ModelBody`) loads none of the
// card's server actions. model-view.tsx re-exports every one.
import { useMemo, useState } from "react";
import { ScrollRegion } from "@/app/scroll-region";
import type { UnderwritingModel, ReconciledMetric } from "@/lib/model/types";
import { computeModel, type CashFlowYear } from "@/lib/model/compute";
import { statedByDocument } from "@/lib/model/provenance";
import { computeSensitivityGrid, SENSITIVITY_PRICE_FACTORS } from "@/lib/model/sensitivity";
import { compactUsd } from "@/lib/money";
import { mult, pct, usd } from "./returns-headline";

const CONF: Record<string, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-pass/10 text-pass" },
  medium: { label: "Med", cls: "bg-caution/10 text-caution" },
  low: { label: "Low", cls: "bg-kill/10 text-kill" },
};

function irrTone(v: number | null): string {
  if (v == null) return "text-muted";
  if (v >= 15) return "text-pass";
  if (v >= 8) return "text-ink";
  if (v >= 0) return "text-caution";
  return "text-kill";
}

// Live exit-cap × price IRR grid — re-runs this model's own cash-flow engine
// (lib/model/compute) at each grid point. The Excel download is the OM
// underwrite (lib/underwrite), a separate model with its own grids.
export function Sensitivity({ model }: { model: UnderwritingModel }) {
  const base = model.inputs;
  if (!base?.exitCapPct || !base?.purchasePrice) return null;

  // The grid definition lib/model/sensitivity keeps once for this card.
  const rows = computeSensitivityGrid(base).map((g) => ({
    exit: g.exitCapPct,
    cells: g.cells.map((c) => ({ irr: c.irrPct, isBase: c.isBase })),
  }));

  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">
        Return sensitivity{" "}
        <span className="font-normal text-muted">· levered IRR</span>
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        IRR by exit cap and price; your base case is highlighted.
      </p>
      <ScrollRegion label="Return sensitivity grid" className="mt-3 rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-right text-[10px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5 text-left font-medium">
                Exit cap ↓ / price →
              </th>
              {SENSITIVITY_PRICE_FACTORS.map((pf) => (
                <th
                  key={pf}
                  className={`px-3 py-2.5 font-mono font-medium tabular-nums ${
                    pf === 1 ? "text-ink" : ""
                  }`}
                >
                  {compactUsd(base.purchasePrice * pf)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.exit} className="border-b border-line last:border-0">
                <td className="px-3 py-2.5 font-mono text-xs font-medium tabular-nums">
                  {r.exit.toFixed(2)}%
                </td>
                {r.cells.map((c, i) => (
                  <td
                    key={i}
                    className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                      c.isBase
                        ? "bg-brand/10 font-semibold text-brand"
                        : irrTone(c.irr)
                    }`}
                  >
                    {c.irr == null ? "—" : c.irr.toFixed(1) + "%"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stress the assumptions — the four levers a screen turns on,         */
/* recomputed live through this model's own engine (lib/model/compute; */
/* the Excel download is lib/underwrite's, a separate model).          */
/* ------------------------------------------------------------------ */

type StressAdjust = {
  exitCapPct: number;
  rentGrowthPct: number;
  ratePct: number;
  holdYears: number;
};

const STRESS_CONTROLS: {
  key: keyof StressAdjust;
  label: string;
  step: number;
  lo: number;
  hi: number;
  fmt: (v: number) => string;
}[] = [
  { key: "exitCapPct", label: "Exit cap", step: 0.25, lo: 3, hi: 12, fmt: (v) => v.toFixed(2) + "%" },
  { key: "rentGrowthPct", label: "Rent growth", step: 0.25, lo: -5, hi: 10, fmt: (v) => v.toFixed(2) + "%" },
  { key: "ratePct", label: "Interest rate", step: 0.25, lo: 0, hi: 12, fmt: (v) => v.toFixed(2) + "%" },
  { key: "holdYears", label: "Hold period", step: 1, lo: 1, hi: 15, fmt: (v) => v + (v === 1 ? " year" : " years") },
];

function clampStep(v: number, lo: number, hi: number): number {
  // Steps are quarter-points — round away float drift so 5.25 stays 5.25.
  return Math.min(hi, Math.max(lo, Math.round(v * 100) / 100));
}

/**
 * A stress tile's change from the base case, signed and in the figure's own
 * unit — percentage points for a rate, "x" for a multiple or a coverage —
 * at the figure's two places, so the tile never just repeats the headline
 * above it: at the base case it reads "±0.00 pts", muted. Coloured by
 * whether the move helps returns.
 */
function stressDeltaText(now: number, was: number, unit: "pts" | "x"): { text: string; sign: -1 | 0 | 1 } {
  const d = Math.round((now - was) * 100) / 100;
  const sign = d > 0 ? 1 : d < 0 ? -1 : 0;
  const mark = sign > 0 ? "+" : sign < 0 ? "−" : "±";
  return { text: `${mark}${Math.abs(d).toFixed(2)}${unit === "pts" ? " pts" : "x"}`, sign };
}

function StressDelta({
  now,
  was,
  unit,
}: {
  now: number | null;
  was: number | null;
  unit: "pts" | "x";
}) {
  if (now == null || was == null) return null;
  const { text, sign } = stressDeltaText(now, was, unit);
  // The space is spelled, not a margin: a number followed by a margin-spaced
  // span is one word to a screen reader.
  return (
    <>
      {" "}
      <span
        data-qa="stress-delta"
        className={`whitespace-nowrap font-mono text-[11px] font-medium tabular-nums ${
          sign > 0 ? "text-pass" : sign < 0 ? "text-kill" : "text-muted"
        }`}
      >
        {text}
        <span className="sr-only"> from the base case</span>
      </span>
    </>
  );
}

export function StressPanel({ model }: { model: UnderwritingModel }) {
  const base = model.inputs;
  const ok = !!base?.purchasePrice && !!base?.exitCapPct && !!base?.loan;
  const initial: StressAdjust = {
    exitCapPct: base?.exitCapPct ?? 5,
    rentGrowthPct: base?.rentGrowthPct ?? 3,
    ratePct: base?.loan?.ratePct ?? 6,
    holdYears: base?.holdYears ?? 5,
  };
  const [adj, setAdj] = useState<StressAdjust>(initial);

  const baseline = useMemo(() => (ok ? computeModel(base) : null), [base, ok]);
  const stressed = useMemo(() => {
    if (!ok) return null;
    return computeModel({
      ...base,
      exitCapPct: adj.exitCapPct,
      rentGrowthPct: adj.rentGrowthPct,
      holdYears: adj.holdYears,
      loan: { ...base.loan, ratePct: adj.ratePct },
    });
  }, [base, adj, ok]);

  if (!ok || !baseline || !stressed) return null;

  const dirty = STRESS_CONTROLS.some((c) => adj[c.key] !== initial[c.key]);
  const r = stressed.returns;
  const b = baseline.returns;
  const dscr = (cf: CashFlowYear[] | undefined): number | null => {
    const y1 = cf?.[0];
    if (!y1 || y1.debtService <= 0) return null;
    return y1.noi / y1.debtService;
  };
  const dscrNow = dscr(stressed.cashFlow);
  const dscrBase = dscr(baseline.cashFlow);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Stress the assumptions{" "}
          <span className="font-normal text-muted">
            · live, on this model
          </span>
        </h2>
        {dirty && (
          <button
            type="button"
            onClick={() => setAdj(initial)}
            className="text-xs font-medium text-brand transition-colors hover:text-brand-strong"
          >
            Reset to model
          </button>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
        Live — the saved model doesn&apos;t change; each figure carries its change from the base case.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {STRESS_CONTROLS.map((c) => {
          const v = adj[c.key];
          const changed = v !== initial[c.key];
          return (
            <div
              key={c.key}
              className="rounded-xl border border-line bg-surface p-3 shadow-sm"
            >
              <p className="text-[11px] uppercase tracking-wide text-muted">
                {c.label}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <button
                  type="button"
                  aria-label={`Decrease ${c.label.toLowerCase()}`}
                  disabled={v - c.step < c.lo}
                  onClick={() =>
                    setAdj((a) => ({
                      ...a,
                      [c.key]: clampStep(a[c.key] - c.step, c.lo, c.hi),
                    }))
                  }
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-sm font-semibold transition-colors hover:bg-faint disabled:cursor-not-allowed disabled:opacity-40"
                >
                  −
                </button>
                <span
                  className={`whitespace-nowrap font-mono text-sm font-semibold tabular-nums ${
                    changed ? "text-brand" : ""
                  }`}
                >
                  {c.fmt(v)}
                </span>
                <button
                  type="button"
                  aria-label={`Increase ${c.label.toLowerCase()}`}
                  disabled={v + c.step > c.hi}
                  onClick={() =>
                    setAdj((a) => ({
                      ...a,
                      [c.key]: clampStep(a[c.key] + c.step, c.lo, c.hi),
                    }))
                  }
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-sm font-semibold transition-colors hover:bg-faint disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted">
            Levered IRR
          </p>
          <p className="mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums">
            {pct(r.leveredIrrPct)}
            <StressDelta now={r.leveredIrrPct} was={b.leveredIrrPct} unit="pts" />
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted">
            Equity multiple
          </p>
          <p className="mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums">
            {mult(r.equityMultiple)}
            <StressDelta now={r.equityMultiple} was={b.equityMultiple} unit="x" />
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted">
            Cash-on-cash (Yr 1)
          </p>
          <p className="mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums">
            {pct(r.cashOnCashPct)}
            <StressDelta now={r.cashOnCashPct} was={b.cashOnCashPct} unit="pts" />
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted">
            DSCR (Yr 1)
          </p>
          <p className="mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums">
            {dscrNow == null ? "—" : dscrNow.toFixed(2) + "x"}
            <StressDelta now={dscrNow} was={dscrBase} unit="x" />
          </p>
        </div>
      </div>
      {dscrNow != null && dscrNow < 1.2 && (
        <p className="mt-2 text-xs font-medium text-caution">
          DSCR under 1.20x — most agency lenders won&apos;t size to this.
          Coverage, not the equity story, is the binding constraint here.
        </p>
      )}
    </section>
  );
}

function sourceLine(m: ReconciledMetric): string {
  return m.sources
    .map((s) => `${s.doc}: ${s.value}${s.basis ? ` (${s.basis})` : ""}`)
    .join("  ·  ");
}

export function Conflicts({
  conflicts,
  sample = false,
}: {
  conflicts: ReconciledMetric[];
  /** the sample deal: its documents are the sample's, never the reader's */
  sample?: boolean;
}) {
  if (conflicts.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          Source conflicts
        </h2>
        <p className="mt-2 text-sm text-muted">
          No material disagreements between {sample ? "the sample deal's" : "your"} documents — the
          sources lined up.
        </p>
      </section>
    );
  }
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">
          Source conflicts
        </h2>
        <span className="rounded-full bg-kill/10 px-2 py-0.5 text-[11px] font-medium text-kill">
          {conflicts.length} reconciled
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {conflicts.map((m, i) => (
          <div
            key={i}
            className="rounded-xl border border-line border-l-4 border-l-kill bg-surface p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{m.label}</span>
              <span className="ml-auto rounded-full bg-pass/10 px-2 py-0.5 text-[10px] font-medium uppercase text-pass">
                {m.chosenValue}
              </span>
            </div>
            <p className="mt-1.5 font-mono text-xs tabular-nums text-muted">
              {sourceLine(m)}
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              <span className="font-medium">Chose {m.authority} — </span>
              <span className="text-muted">{m.rationale}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Assumptions({
  metrics,
  generatedFrom = [],
  sample = false,
}: {
  metrics: ReconciledMetric[];
  /** the documents the model was built from, which a row's source may cite
   *  by file name (lib/model/provenance) */
  generatedFrom?: string[];
  /** the sample deal: its documents are the sample's, never the reader's */
  sample?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? metrics : metrics.slice(0, 8);
  // Counted, never claimed: a row no document states is the model's own.
  const assumed = metrics.filter((m) => !statedByDocument(m, generatedFrom)).length;
  const docs = sample ? "the sample deal's documents" : "your documents";
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">
        Assumptions{" "}
        <span className="font-normal text-muted">
          {assumed === 0
            ? `· each from ${docs}`
            : `· ${metrics.length - assumed} from ${docs}, ${assumed} assumed`}
        </span>
      </h2>
      <ScrollRegion label="Assumptions" className="mt-3 rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-medium">Assumption</th>
              <th className="px-4 py-2.5 font-medium">Value</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m, i) => {
              const c = CONF[m.confidence] ?? CONF.medium;
              return (
                <tr
                  key={i}
                  className="border-b border-line align-top last:border-0"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${m.isConflict ? "text-kill" : ""}`}
                    >
                      {m.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono tabular-nums">
                    {m.chosenValue}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {m.authority}
                    {!statedByDocument(m, generatedFrom) && (
                      <>
                        {" "}
                        <span
                          data-qa="assumed"
                          title="No document states this figure — the model chose it"
                          className="ml-1 inline-flex rounded-full bg-caution/10 px-1.5 py-px text-[10px] font-medium uppercase text-caution"
                        >
                          assumed
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${c.cls}`}
                    >
                      {c.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
      {metrics.length > 8 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-2 text-xs font-medium text-brand transition-colors hover:text-brand-strong"
        >
          {open ? "Show fewer" : `Show all ${metrics.length} assumptions`}
        </button>
      )}
    </section>
  );
}

/** Capital plan — every figure derived from the model itself (reserve input,
 *  units, cash-flow rows), never invented: annual reserve, per-unit funding,
 *  the total set aside across the hold, and the bite out of year-1 NOI. */
export function CapexPanel({ model }: { model: UnderwritingModel }) {
  const annual = model.inputs?.capexReserveAnnual ?? 0;
  if (!annual || annual <= 0) return null;
  const units = model.inputs?.units ?? 0;
  const totalOverHold = model.cashFlow.reduce(
    (sum, y) => sum + (y.capexReserve ?? 0),
    0,
  );
  const noi1 = model.cashFlow[0]?.noi ?? 0;
  const stats: [string, string][] = [
    ["Annual reserve", compactUsd(annual)],
    ...(units > 0
      ? ([["Per unit / yr", `$${Math.round(annual / units).toLocaleString("en-US")}`]] as [string, string][])
      : []),
    [`Funded over ${model.holdYears}-yr hold`, compactUsd(totalOverHold)],
    ...(noi1 > 0
      ? ([["Share of year-1 NOI", `${((annual / noi1) * 100).toFixed(1)}%`]] as [string, string][])
      : []),
  ];
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">
        Capital plan{" "}
        <span className="font-normal text-muted">· reserved below NOI</span>
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wide text-muted">
              {label}
            </dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Deducted below NOI in every year — a screening reserve, not an
        engineering budget.
      </p>
    </section>
  );
}

export function CashFlow({ cashFlow }: { cashFlow: CashFlowYear[] }) {
  const [open, setOpen] = useState(false);
  if (cashFlow.length === 0) return null;
  // The plan's spend gets its own line only when there is one — models
  // stored before the plan existed carry no capitalSpend and read as before.
  const hasPlanSpend = cashFlow.some((c) => (c.capitalSpend ?? 0) > 0);
  const rows: [string, (c: CashFlowYear) => number][] = [
    ["Gross potential rent", (c) => c.gpr],
    ["Vacancy loss", (c) => -c.vacancyLoss],
    ["Other income", (c) => c.otherIncome],
    ["Effective gross income", (c) => c.egi],
    ["Operating expenses", (c) => -c.opex],
    ["Net operating income", (c) => c.noi],
    ["Capital reserve", (c) => -(c.capexReserve ?? 0)],
    ...(hasPlanSpend
      ? ([["Capital spend (the plan)", (c) => -(c.capitalSpend ?? 0)]] as [string, (c: CashFlowYear) => number][])
      : []),
    ["Debt service", (c) => -c.debtService],
    ["Levered cash flow", (c) => c.cashFlow],
  ];
  const bold = new Set([
    "Effective gross income",
    "Net operating income",
    "Levered cash flow",
  ]);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-sm font-semibold tracking-tight"
      >
        Operating cash flow
        <span className="text-xs font-normal text-brand">
          {open ? "hide" : "show"}
        </span>
      </button>
      {open && (
        <ScrollRegion label="Operating cash flow" className="mt-3 rounded-xl border border-line bg-surface shadow-sm">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-line text-right text-[10px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 text-left font-medium">Line</th>
                {cashFlow.map((c) => (
                  <th key={c.year} className="px-4 py-2.5 font-medium">
                    Yr {c.year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, pick]) => (
                <tr key={label} className="border-b border-line last:border-0">
                  <td
                    className={`px-4 py-2.5 text-left ${bold.has(label) ? "font-semibold" : "text-muted"}`}
                  >
                    {label}
                  </td>
                  {cashFlow.map((c) => (
                    <td
                      key={c.year}
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${bold.has(label) ? "font-semibold" : ""}`}
                    >
                      {usd(pick(c))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </section>
  );
}
