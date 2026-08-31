"use client";

import { useState } from "react";
import type { Bridge, BridgeStep } from "@/lib/bridge/attribution";

export interface VersionOption {
  id: string;
  label: string;
  note: string | null;
  createdAt: string;
  automatic: boolean;
  leveredIrrPct: number | null;
}

const pct1 = (v: number | null) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);
const bps = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)} bps`;

/** Ink for a driver: green when it added return, red when it cost return. */
const barFill = (v: number) => (v >= 0 ? "var(--color-pass)" : "var(--color-kill)");

// ---------------------------------------------------------------------------
// Waterfall
// ---------------------------------------------------------------------------

interface Column {
  key: string;
  label: string;
  /** bar spans [lo, hi] in bps */
  lo: number;
  hi: number;
  fill: string;
  caption: string;
  title: string;
  /** the running IRR level (bps) the NEXT column starts from */
  level: number;
}

function columns(bridge: Bridge): Column[] {
  const start = (bridge.fromIrr ?? -0.9) * 10_000;
  const cols: Column[] = [
    {
      key: "__start",
      label: "Start",
      lo: Math.min(0, start),
      hi: Math.max(0, start),
      fill: "var(--color-brand)",
      caption: pct1(bridge.fromIrr),
      title: `Levered IRR before: ${pct1(bridge.fromIrr)}`,
      level: start,
    },
  ];
  let running = start;
  for (const step of bridge.steps) {
    const next = running + step.leveredIrrBps;
    cols.push({
      key: step.field,
      label: step.label,
      lo: Math.min(running, next),
      hi: Math.max(running, next),
      fill: barFill(step.leveredIrrBps),
      caption: bps(step.leveredIrrBps),
      title: `${step.label}: ${step.fromValue} → ${step.toValue} (${bps(step.leveredIrrBps)})`,
      level: next,
    });
    running = next;
  }
  const end = (bridge.toIrr ?? -0.9) * 10_000;
  cols.push({
    key: "__end",
    label: "End",
    lo: Math.min(0, end),
    hi: Math.max(0, end),
    fill: "var(--color-brand)",
    caption: pct1(bridge.toIrr),
    title: `Levered IRR after: ${pct1(bridge.toIrr)}`,
    level: end,
  });
  return cols;
}

function Waterfall({ bridge }: { bridge: Bridge }) {
  const cols = columns(bridge);
  const COL_W = 96;
  const BAR_W = 58;
  const PAD_L = 8;
  const PAD_T = 34;
  const PLOT_H = 210;
  const AXIS_H = 62;
  const W = PAD_L * 2 + cols.length * COL_W;
  const H = PAD_T + PLOT_H + AXIS_H;

  const lo = Math.min(0, ...cols.map((c) => c.lo));
  const hi = Math.max(0, ...cols.map((c) => c.hi));
  const span = hi - lo || 1;
  const y = (v: number) => PAD_T + ((hi - v) / span) * PLOT_H;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ minWidth: Math.min(W, 720) }}
        role="img"
        aria-label={`Waterfall from ${pct1(bridge.fromIrr)} to ${pct1(bridge.toIrr)} levered IRR`}
        className="max-w-full"
      >
        {/* zero line */}
        <line
          x1={PAD_L}
          x2={W - PAD_L}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--color-line)"
          strokeWidth={1}
        />
        {cols.map((c, i) => {
          const x = PAD_L + i * COL_W + (COL_W - BAR_W) / 2;
          const top = y(c.hi);
          const height = Math.max(2, y(c.lo) - y(c.hi));
          const isEnd = c.key === "__start" || c.key === "__end";
          return (
            <g key={c.key}>
              <title>{c.title}</title>
              {/* dotted connector carrying the running level into the next bar */}
              {i < cols.length - 1 ? (
                <line
                  x1={x + BAR_W}
                  x2={x + COL_W}
                  y1={y(c.level)}
                  y2={y(c.level)}
                  stroke="var(--color-line)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              ) : null}
              <rect
                x={x}
                y={top}
                width={BAR_W}
                height={height}
                rx={2}
                fill={c.fill}
                opacity={isEnd ? 1 : 0.88}
              />
              <text
                x={x + BAR_W / 2}
                y={top - 8}
                textAnchor="middle"
                fontSize={12}
                fill="var(--color-ink)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {c.caption}
              </text>
              <text
                x={x + BAR_W / 2}
                y={PAD_T + PLOT_H + 20}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {c.label.length > 15 ? `${c.label.slice(0, 14)}…` : c.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page body
// ---------------------------------------------------------------------------

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-faint p-4 sm:flex-row sm:items-start">
      <p className="flex-1 text-[15px] leading-relaxed text-ink">{text}</p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            setCopied(false);
          }
        }}
        className="shrink-0 rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand hover:text-white"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function StepRow({
  step,
  bridge,
}: {
  step: BridgeStep;
  bridge: Bridge;
}) {
  const se = bridge.standardErrorBps?.[step.field];
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3 text-ink">{step.label}</td>
      <td className="py-2 pr-3 text-right font-mono text-muted">{String(step.fromValue)}</td>
      <td className="py-2 pr-3 text-right font-mono text-muted">{String(step.toValue)}</td>
      <td
        className="py-2 pr-3 text-right font-mono font-medium"
        style={{ color: barFill(step.leveredIrrBps) }}
      >
        {bps(step.leveredIrrBps)}
        {se != null && se >= 0.5 ? (
          <span className="ml-1 text-[11px] font-normal text-muted">±{se.toFixed(0)}</span>
        ) : null}
      </td>
      <td className="py-2 pr-3 text-right font-mono text-muted">{bps(step.unleveredIrrBps)}</td>
      <td className="py-2 pr-3 text-right font-mono text-muted">
        {step.equityMultipleDelta >= 0 ? "+" : "−"}
        {Math.abs(step.equityMultipleDelta).toFixed(2)}x
      </td>
      <td className="py-2 text-right font-mono text-muted">
        {step.shareOfMove == null ? "—" : `${(step.shareOfMove * 100).toFixed(0)}%`}
      </td>
    </tr>
  );
}

export function BridgeView({
  bridge,
  sentence,
  fromVersion,
  toVersion,
}: {
  bridge: Bridge;
  sentence: string;
  fromVersion: VersionOption;
  toVersion: VersionOption;
}) {
  if (bridge.steps.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface p-6">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{fromVersion.label}</span> and{" "}
          <span className="font-medium text-ink">{toVersion.label}</span> carry identical
          assumptions — there is nothing to attribute. Levered IRR is {pct1(bridge.toIrr)} in both.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <CopyLine text={sentence} />

      <div className="rounded-lg border border-line bg-surface p-4">
        <Waterfall bridge={bridge} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-medium">Assumption</th>
              <th className="px-3 py-2 text-right font-medium">{fromVersion.label}</th>
              <th className="px-3 py-2 text-right font-medium">{toVersion.label}</th>
              <th className="px-3 py-2 text-right font-medium">Levered IRR</th>
              <th className="px-3 py-2 text-right font-medium">Unlevered</th>
              <th className="px-3 py-2 text-right font-medium">Multiple</th>
              <th className="px-3 py-2 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {bridge.steps.map((s) => (
              <StepRow key={s.field} step={s} bridge={bridge} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        {bridge.method === "exact"
          ? `Exact Shapley attribution over ${bridge.steps.length} changed assumption${
              bridge.steps.length === 1 ? "" : "s"
            } (${bridge.scenariosEvaluated} model runs). Contributions are order-independent and sum to the headline move.`
          : `Sampled Shapley attribution — ${bridge.steps.length} assumptions changed, so contributions are averaged over 2,000 random orderings (${bridge.scenariosEvaluated} model runs). The ± figure is one standard error.`}{" "}
        Unexplained residual {Math.abs(bridge.unexplainedBps).toFixed(2)} bps.
        {bridge.flooredScenarios > 0
          ? ` ${bridge.flooredScenarios} intermediate scenario${
              bridge.flooredScenarios === 1 ? "" : "s"
            } had no IRR solution and were floored at −90%; read the split with that in mind.`
          : ""}
      </p>
    </div>
  );
}
