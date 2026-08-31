"use client";

import { useState } from "react";
import type { ValuationBridge, AggressivenessTally } from "@/lib/valuation/reconcile";
import { FIELD_LABELS, VALUATION_FIELDS, type ValuationField } from "@/lib/valuation/types";

/** One column of the comparison table, flattened server-side. */
export interface ColumnData {
  id: string;
  label: string;
  sourceType: string;
  extracted: boolean;
  /** the user's own underwriting, pinned last and not editable here */
  internal: boolean;
  documentUrl: string | null;
  note: string | null;
  values: Partial<Record<ValuationField, number | null>>;
  citations: Partial<Record<ValuationField, { page: string; snippet: string }>>;
  derivedFields: ValuationField[];
  implied: {
    ok: boolean;
    error?: string;
    leveredIrrPct: number | null;
    leveredEquityMultiple: number | null;
    substitutions: { label: string; reason: string }[];
  };
}

const usd = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
};

const FORMAT: Record<ValuationField, (n: number) => string> = {
  headlineValue: usd,
  year1Noi: usd,
  goingInCap: (n) => `${(n * 100).toFixed(2)}%`,
  exitCap: (n) => `${(n * 100).toFixed(2)}%`,
  holdYears: (n) => `${n} yr`,
  rentGrowth: (n) => `${(n * 100).toFixed(2)}%`,
  vacancyAssumption: (n) => `${(n * 100).toFixed(1)}%`,
  capexDeduction: usd,
  discountRate: (n) => `${(n * 100).toFixed(2)}%`,
};

const fmt = (field: ValuationField, v: number | null | undefined): string =>
  v == null ? "—" : FORMAT[field](v);

const pct1 = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

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

/** Dollar waterfall from A's value to B's, one bar per bridge component. */
function ValueWaterfall({ bridge }: { bridge: Extract<ValuationBridge, { ok: true }> }) {
  const COL_W = 108;
  const BAR_W = 66;
  const PAD_L = 8;
  const PAD_T = 34;
  const PLOT_H = 200;
  const AXIS_H = 56;

  const bars: { key: string; label: string; lo: number; hi: number; fill: string; caption: string; level: number }[] = [];
  let running = bridge.fromValue;
  bars.push({
    key: "__from",
    label: bridge.fromLabel,
    lo: 0,
    hi: bridge.fromValue,
    fill: "var(--color-brand)",
    caption: usd(bridge.fromValue),
    level: running,
  });
  for (const c of bridge.components) {
    if (Math.abs(c.amount) < 1) continue;
    const next = running + c.amount;
    bars.push({
      key: c.key,
      label: c.label,
      lo: Math.min(running, next),
      hi: Math.max(running, next),
      fill: c.amount >= 0 ? "var(--color-pass)" : "var(--color-kill)",
      caption: usd(c.amount),
      level: next,
    });
    running = next;
  }
  bars.push({
    key: "__to",
    label: bridge.toLabel,
    lo: 0,
    hi: bridge.toValue,
    fill: "var(--color-brand)",
    caption: usd(bridge.toValue),
    level: bridge.toValue,
  });

  const W = PAD_L * 2 + bars.length * COL_W;
  const H = PAD_T + PLOT_H + AXIS_H;
  const lo = Math.min(0, ...bars.map((b) => b.lo));
  const hi = Math.max(0, ...bars.map((b) => b.hi));
  const span = hi - lo || 1;
  const y = (v: number) => PAD_T + ((hi - v) / span) * PLOT_H;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ minWidth: Math.min(W, 640) }}
        role="img"
        aria-label={`Value bridge from ${bridge.fromLabel} to ${bridge.toLabel}`}
      >
        <line x1={PAD_L} x2={W - PAD_L} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
        {bars.map((b, i) => {
          const x = PAD_L + i * COL_W + (COL_W - BAR_W) / 2;
          const top = y(b.hi);
          const height = Math.max(2, y(b.lo) - y(b.hi));
          return (
            <g key={b.key}>
              <title>{`${b.label}: ${b.caption}`}</title>
              {i < bars.length - 1 ? (
                <line
                  x1={x + BAR_W}
                  x2={x + COL_W}
                  y1={y(b.level)}
                  y2={y(b.level)}
                  stroke="var(--color-line)"
                  strokeDasharray="3 3"
                />
              ) : null}
              <rect x={x} y={top} width={BAR_W} height={height} rx={2} fill={b.fill} opacity={0.9} />
              <text
                x={x + BAR_W / 2}
                y={top - 8}
                textAnchor="middle"
                fontSize={12}
                fill="var(--color-ink)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {b.caption}
              </text>
              <text
                x={x + BAR_W / 2}
                y={PAD_T + PLOT_H + 20}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {b.label.length > 17 ? `${b.label.slice(0, 16)}…` : b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ValuationsView({
  columns,
  bridge,
  summary,
  tally,
  aLabel,
  bLabel,
}: {
  columns: ColumnData[];
  bridge: ValuationBridge | null;
  summary: string | null;
  tally: AggressivenessTally | null;
  aLabel: string | null;
  bLabel: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* ── Comparison table ──────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                Assumption
              </th>
              {columns.map((c) => (
                <th key={c.id} className="px-3 py-2 text-right align-bottom">
                  <span className="block font-semibold text-ink">{c.label}</span>
                  <span className="block text-[11px] font-normal text-muted">
                    {c.internal ? "your underwriting" : c.extracted ? "extracted" : "typed"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VALUATION_FIELDS.map((field) => (
              <tr key={field} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 text-ink">{FIELD_LABELS[field]}</td>
                {columns.map((c) => {
                  const cite = c.citations[field];
                  const derived = c.derivedFields.includes(field);
                  return (
                    <td key={c.id} className="px-3 py-2 text-right font-mono text-ink">
                      <span title={cite ? `${cite.page}${cite.snippet ? ` — “${cite.snippet}”` : ""}` : undefined}>
                        {fmt(field, c.values[field])}
                      </span>
                      {derived ? (
                        <span
                          className="ml-1 rounded bg-caution/15 px-1 text-[10px] font-sans font-medium text-caution"
                          title="Computed from a stated value and NOI — not stated on the page"
                        >
                          der
                        </span>
                      ) : null}
                      {cite ? (
                        c.documentUrl ? (
                          <a
                            href={c.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 text-[10px] font-sans text-brand underline-offset-2 hover:underline"
                          >
                            {cite.page}
                          </a>
                        ) : (
                          <span className="ml-1 text-[10px] font-sans text-muted">{cite.page}</span>
                        )
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* The forward-looking layer, under the same table. */}
            <tr className="border-t-2 border-line bg-faint">
              <td className="px-3 py-2 font-medium text-ink">
                Levered IRR at that price
                <span className="block text-[11px] font-normal text-muted">under your model</span>
              </td>
              {columns.map((c) => (
                <td key={c.id} className="px-3 py-2 text-right font-mono font-medium text-ink">
                  {c.implied.ok ? (
                    <span
                      title={
                        c.implied.substitutions.length
                          ? `Borrowed from your model: ${c.implied.substitutions
                              .map((s) => `${s.label} (${s.reason})`)
                              .join("; ")}`
                          : undefined
                      }
                    >
                      {pct1(c.implied.leveredIrrPct)}
                      {c.implied.substitutions.length ? (
                        <span className="ml-1 text-[10px] font-sans text-muted">
                          ·{c.implied.substitutions.length}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted" title={c.implied.error}>
                      —
                    </span>
                  )}
                </td>
              ))}
            </tr>
            <tr className="bg-faint">
              <td className="px-3 py-2 text-muted">Equity multiple</td>
              {columns.map((c) => (
                <td key={c.id} className="px-3 py-2 text-right font-mono text-muted">
                  {c.implied.leveredEquityMultiple != null
                    ? `${c.implied.leveredEquityMultiple.toFixed(2)}x`
                    : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        A number with a page reference was read off that page — hover for the quote, click to open
        the document. <span className="font-medium text-caution">der</span> marks a cap rate backed
        out of a stated value and NOI rather than stated. A dash means the source is silent; nothing
        is filled in for it. The IRR row runs each price through <em>your</em> model — the
        superscript counts assumptions borrowed from it because the source didn&apos;t state them.
      </p>

      {/* ── Bridge ────────────────────────────────────────────────────── */}
      {bridge && !bridge.ok ? (
        <div className="rounded-lg border border-caution/30 bg-caution/5 px-4 py-3 text-sm text-caution">
          {bridge.error}
        </div>
      ) : null}

      {bridge?.ok && summary ? (
        <>
          <CopyLine text={summary} />
          <div className="rounded-lg border border-line bg-surface p-4">
            <ValueWaterfall bridge={bridge} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Driver</th>
                  <th className="px-3 py-2 text-right font-medium">Value effect</th>
                  <th className="px-3 py-2 text-right font-medium">Share of gap</th>
                </tr>
              </thead>
              <tbody>
                {bridge.components.map((c) => (
                  <tr key={c.key} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2 text-ink">{c.label}</td>
                    <td
                      className="px-3 py-2 text-right font-mono"
                      style={{ color: c.amount >= 0 ? "var(--color-pass)" : "var(--color-kill)" }}
                    >
                      {usd(c.amount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted">
                      {c.share == null ? "—" : `${Math.round(c.share * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {/* ── Aggressiveness tally ──────────────────────────────────────── */}
      {tally && aLabel && bLabel ? (
        <section className="rounded-lg border border-line bg-surface">
          <div className="flex flex-wrap items-baseline gap-x-3 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Who&apos;s more optimistic</h2>
            <p className="text-sm text-muted">
              {tally.aCount > tally.bCount ? aLabel : tally.bCount > tally.aCount ? bLabel : "Neither"}{" "}
              is more aggressive on {Math.max(tally.aCount, tally.bCount)} of {tally.comparable}{" "}
              comparable input{tally.comparable === 1 ? "" : "s"}.
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {tally.rows.map((r) => (
                <tr key={r.field} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2 text-ink">{r.label}</td>
                  <td className="px-4 py-2 text-right font-mono text-muted">
                    {fmt(r.field, r.aValue)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted">
                    {fmt(r.field, r.bValue)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs">
                    {r.moreAggressive == null ? (
                      <span className="text-muted">not comparable</span>
                    ) : r.moreAggressive === "tie" ? (
                      <span className="text-muted">same</span>
                    ) : (
                      <span className="font-medium text-caution">
                        {r.moreAggressive === "a" ? aLabel : bLabel}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
