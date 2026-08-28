import type { TrendPoint, TrendSegment } from "@/lib/market/metrics";

/**
 * A dual-axis trend: one series as bars, one as a line, sharing an x of
 * periods. Server-rendered SVG — no charting dependency, no client state.
 *
 * The rent line is drawn per SEGMENT. A basis change breaks it rather than
 * connecting across, which is the visual half of trap 2: two points on
 * different bases are not a trend.
 */
export function DualAxisTrend({
  bars,
  barLabel,
  segments,
  lineLabel,
  formatBar,
  formatLine,
}: {
  bars: TrendPoint[];
  barLabel: string;
  segments: TrendSegment[];
  lineLabel: string;
  formatBar: (n: number) => string;
  formatLine: (n: number) => string;
}) {
  const periods = [...new Set([...bars.map((b) => b.period), ...segments.flatMap((s) => s.points.map((p) => p.period))])].sort();
  if (!periods.length) return <p className="text-sm text-muted">No periods loaded yet.</p>;

  const COL_W = 78;
  const PAD_L = 12;
  const PAD_T = 26;
  const PLOT_H = 170;
  const AXIS_H = 46;
  const W = PAD_L * 2 + periods.length * COL_W;
  const H = PAD_T + PLOT_H + AXIS_H;
  const x = (period: string) => PAD_L + periods.indexOf(period) * COL_W + COL_W / 2;

  const barMax = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  const barY = (v: number) => PAD_T + PLOT_H - (Math.abs(v) / barMax) * PLOT_H * 0.9;

  const lineValues = segments.flatMap((s) => s.points.map((p) => p.value));
  const lineMin = Math.min(...lineValues, Infinity);
  const lineMax = Math.max(...lineValues, -Infinity);
  const lineSpan = lineMax - lineMin || 1;
  const lineY = (v: number) => PAD_T + PLOT_H * 0.85 - ((v - lineMin) / lineSpan) * PLOT_H * 0.7;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: Math.min(W, 560) }} role="img"
        aria-label={`${barLabel} and ${lineLabel} by period`}>
        <line x1={PAD_L} x2={W - PAD_L} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H} stroke="var(--color-line)" />

        {bars.map((b) => {
          const cx = x(b.period);
          const top = barY(b.value);
          const negative = b.value < 0;
          return (
            <g key={`bar-${b.period}`}>
              <title>{`${b.period} — ${barLabel}: ${formatBar(b.value)} (${b.source}${b.unverified ? ", unverified" : ""})`}</title>
              <rect
                x={cx - 16}
                y={negative ? PAD_T + PLOT_H : top}
                width={32}
                height={Math.max(2, PAD_T + PLOT_H - top)}
                rx={2}
                fill={negative ? "var(--color-kill)" : "var(--color-brand)"}
                opacity={b.unverified ? 0.45 : 0.28}
              />
            </g>
          );
        })}

        {segments.map((s, si) => (
          <g key={`seg-${si}`}>
            {s.points.length > 1 ? (
              <polyline
                points={s.points.map((p) => `${x(p.period)},${lineY(p.value)}`).join(" ")}
                fill="none"
                stroke="var(--color-caution)"
                strokeWidth={2}
                strokeDasharray={s.basis == null ? "4 3" : undefined}
              />
            ) : null}
            {s.points.map((p) => (
              <g key={`pt-${p.period}`}>
                <title>{`${p.period} — ${lineLabel}: ${formatLine(p.value)} (${s.basisLabel}; ${p.source}${
                  p.unverified ? ", unverified" : ""
                })`}</title>
                <circle cx={x(p.period)} cy={lineY(p.value)} r={3.5} fill="var(--color-caution)" />
                <text
                  x={x(p.period)}
                  y={lineY(p.value) - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-ink)"
                >
                  {formatLine(p.value)}
                </text>
              </g>
            ))}
          </g>
        ))}

        {periods.map((p) => (
          <text
            key={`x-${p}`}
            x={x(p)}
            y={PAD_T + PLOT_H + 18}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-muted)"
          >
            {p.slice(0, 7)}
          </text>
        ))}
        {bars.map((b) => (
          <text
            key={`bl-${b.period}`}
            x={x(b.period)}
            y={PAD_T + PLOT_H + 32}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-muted)"
          >
            {formatBar(b.value)}
          </text>
        ))}
      </svg>
      <p className="mt-1 text-xs text-muted">
        Bars: {barLabel} · Line: {lineLabel}. A dashed run has no stated basis; a break in the line
        is a basis change.
      </p>
    </div>
  );
}
