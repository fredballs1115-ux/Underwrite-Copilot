import type { AnalyticsDeal } from "@/lib/analytics";
import { median } from "@/lib/analytics";

/**
 * Server-rendered SVG charts. Design rules (dataviz method):
 * - each chart carries ONE measure on ONE axis — never dual axes;
 * - discrete deals over time are DOTS, not a line (a line would imply the
 *   portfolio is one continuous series);
 * - single-series charts use the one brand hue (no categorical palette to
 *   validate; contrast vs the white surface passes at ≥3:1);
 * - the verdict mix uses the app's STATUS colors as status, never as a
 *   categorical set, and every segment carries a text label + count — the
 *   kill↔caution CVD distance sits in the floor band, which is acceptable
 *   only because identity never rides on color alone here;
 * - text wears text tokens (ink/muted), never the series color;
 * - native <title> tooltips give every mark a hover readout.
 */

const C = {
  brand: "#114e54",
  ink: "#18211f",
  muted: "#5f6b69",
  line: "#e7e4dd",
  pass: "#1b7a5e",
  caution: "#a05a1c",
  kill: "#b23a30",
};

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const MONTH_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

function niceBounds(lo: number, hi: number): [number, number] {
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    return [lo - pad, hi + pad];
  }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

/** Discrete deals over time: one dot per deal, a dashed median reference. */
export function DotTimeline({
  points,
  format,
  medianLabel,
}: {
  points: { at: string; value: number; name: string }[];
  format: (v: number) => string;
  medianLabel: string;
}) {
  const W = 560;
  const H = 190;
  const PAD = { l: 52, r: 16, t: 14, b: 26 };

  const times = points.map((p) => new Date(p.at).getTime());
  const values = points.map((p) => p.value);
  const [v0, v1] = niceBounds(Math.min(...values), Math.max(...values));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const spanT = Math.max(t1 - t0, 1);

  const x = (t: number) => PAD.l + ((t - t0) / spanT) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - v0) / (v1 - v0)) * (H - PAD.t - PAD.b);

  const med = median(values)!;
  const ticks = [v0 + (v1 - v0) * 0.15, (v0 + v1) / 2, v1 - (v1 - v0) * 0.15];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`${points.length} deals over time; median ${format(med)}`}
    >
      {ticks.map((tv, i) => (
        <g key={i}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(tv)}
            y2={y(tv)}
            stroke={C.line}
            strokeWidth={1}
          />
          <text
            x={PAD.l - 8}
            y={y(tv) + 3}
            textAnchor="end"
            fontSize={9.5}
            fill={C.muted}
          >
            {format(tv)}
          </text>
        </g>
      ))}

      {/* median reference — dashed, labeled in text tokens */}
      <line
        x1={PAD.l}
        x2={W - PAD.r}
        y1={y(med)}
        y2={y(med)}
        stroke={C.muted}
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text
        x={W - PAD.r}
        y={y(med) - 4}
        textAnchor="end"
        fontSize={9.5}
        fill={C.muted}
      >
        {medianLabel} {format(med)}
      </text>

      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(new Date(p.at).getTime())}
          cy={y(p.value)}
          r={4.5}
          fill={C.brand}
          stroke="#ffffff"
          strokeWidth={2}
        >
          <title>
            {`${p.name} — ${format(p.value)} · ${DATE_FMT.format(new Date(p.at))}`}
          </title>
        </circle>
      ))}

      <text x={PAD.l} y={H - 8} fontSize={9.5} fill={C.muted}>
        {MONTH_FMT.format(new Date(t0))}
      </text>
      <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize={9.5} fill={C.muted}>
        {MONTH_FMT.format(new Date(t1))}
      </text>
    </svg>
  );
}

const VERDICT_META = [
  { key: "pass", label: "Go", color: C.pass },
  { key: "caution", label: "Caution", color: C.caution },
  { key: "pass_on", label: "No-go", color: C.kill },
] as const;

/** One stacked bar + a labeled legend row — status colors, never color-alone. */
export function VerdictMix({ deals }: { deals: AnalyticsDeal[] }) {
  const counts = VERDICT_META.map((m) => ({
    ...m,
    n: deals.filter((d) => d.verdict === m.key).length,
  })).filter((m) => m.n > 0);
  const total = counts.reduce((s, m) => s + m.n, 0);
  if (total === 0) return null;

  const W = 560;
  const BAR_H = 16;
  const GAP = 2;
  // Precompute each segment's x offset (mutating an accumulator inside the
  // render map trips react-hooks/immutability).
  const usable = W - GAP * (counts.length - 1);
  const segs = counts.reduce<{ m: (typeof counts)[number]; x: number; w: number }[]>(
    (acc, m) => {
      const prev = acc[acc.length - 1];
      const x = prev ? prev.x + prev.w + GAP : 0;
      return [...acc, { m, x, w: (m.n / total) * usable }];
    },
    [],
  );

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${BAR_H}`} width="100%" role="img" aria-label="Verdict mix">
        {segs.map(({ m, x, w }) => (
          <rect key={m.key} x={x} y={0} width={w} height={BAR_H} rx={4} fill={m.color}>
            <title>{`${m.label}: ${m.n} of ${total}`}</title>
          </rect>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {counts.map((m) => (
          <span key={m.key} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: m.color }}
            />
            <span className="text-ink">
              {m.label} <span className="font-semibold">{m.n}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars in ladder order — one hue, counts direct-labeled. */
export function StageFunnel({
  rows,
}: {
  rows: { label: string; count: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-xs text-muted">
            {r.label}
          </span>
          <div className="h-4 min-w-0 flex-1">
            <svg viewBox="0 0 100 8" preserveAspectRatio="none" width="100%" height="100%">
              <rect
                x={0}
                y={0}
                width={Math.max((r.count / max) * 100, 1.5)}
                height={8}
                rx={2}
                fill={C.brand}
              >
                <title>{`${r.label}: ${r.count}`}</title>
              </rect>
            </svg>
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">
            {r.count}
          </span>
        </div>
      ))}
    </div>
  );
}
