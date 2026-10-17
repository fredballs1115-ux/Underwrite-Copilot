import Link from "next/link";
import type { AnalyticsDeal } from "@/lib/analytics";
import { median } from "@/lib/analytics";
import { chartWidthStyle } from "@/lib/chart-bounds";

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
 * - native <title> tooltips give every mark a hover readout, and a dot with
 *   an id opens its deal: a phone cannot hover, so it draws a narrower frame
 *   whose type reads at its own size and lists the deals under the chart.
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

/** A deal's screen day with its year: "Aug 11, 2026". */
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
/** A month on the axis and in a chart's spoken name, the year in full: the
 *  axis's "Aug 26" had read as the 26th of August. */
const MONTH_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const SPOKEN_MONTH_FMT = MONTH_FMT;

/** The scatter's name for a screen reader: how many deals, over which
 *  months, the median, and the lowest and highest — each said only where
 *  the points give it (one month is no span; one value is no range). */
export function timelineName(points: { at: string; value: number }[], format: (v: number) => string): string {
  const times = points.map((p) => new Date(p.at).getTime());
  const values = points.map((p) => p.value);
  const [first, last] = [SPOKEN_MONTH_FMT.format(Math.min(...times)), SPOKEN_MONTH_FMT.format(Math.max(...times))];
  const span = first === last ? `in ${first}` : `from ${first} to ${last}`;
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const range = lo === hi ? "" : `, lowest ${format(lo)}, highest ${format(hi)}`;
  return `${points.length} deals over time, ${span}; median ${format(median(values)!)}${range}`;
}

function niceBounds(lo: number, hi: number): [number, number] {
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    return [lo - pad, hi + pad];
  }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

/** One deal on a timeline: its screen date, its figure, its name, and —
 *  where the page has it — its id, so the dot opens the deal. */
export interface TimelinePoint {
  at: string;
  value: number;
  name: string;
  id?: string;
}

/** A timeline's frame: the viewBox, its padding, the type and the dot, and
 *  the classes that show it. The card is the container, and a frame draws
 *  only over the card widths it was drawn for, so its type reads at about
 *  its own size at every width: the phone's under 24rem (each dot with a hit
 *  area a finger can find — the wide frame's 9.5 units drew at about 5.5px
 *  on a 390px screen), then three wider frames, each shown between about
 *  0.9× and 1.2× its own width. One frame stretched across them all had
 *  drawn its 12 units at about 21px on a 600px phone (lib/chart-bounds caps
 *  each at 1.25× besides). */
export const TIMELINE_FRAMES = [
  { key: "phone", W: 320, H: 210, pad: { l: 50, r: 12, t: 16, b: 30 }, font: 12, r: 5.5, hit: 13, className: "@sm:hidden" },
  { key: "mid", W: 420, H: 200, pad: { l: 52, r: 14, t: 16, b: 28 }, font: 12, r: 5, hit: 11, className: "hidden @sm:block @lg:hidden" },
  { key: "wide", W: 560, H: 190, pad: { l: 52, r: 16, t: 14, b: 26 }, font: 11, r: 4.5, hit: 9, className: "hidden @lg:block @2xl:hidden" },
  { key: "widest", W: 740, H: 220, pad: { l: 56, r: 16, t: 14, b: 26 }, font: 11, r: 4.5, hit: 9, className: "hidden @2xl:block" },
] as const;
/** The card widths, in px, each frame shows over (Tailwind's container
 *  sizes: @sm 24rem, @lg 32rem, @2xl 42rem); the last runs to the widest
 *  column a timeline's card is laid out at — the app's 5xl column, one card
 *  across, less its padding. */
export const TIMELINE_FRAME_SPANS: Record<(typeof TIMELINE_FRAMES)[number]["key"], [number, number]> = {
  phone: [0, 384],
  mid: [384, 512],
  wide: [512, 672],
  widest: [672, 918],
};
type Frame = (typeof TIMELINE_FRAMES)[number];

/** A dot's words: its deal, its figure and its screen date. */
const dotWords = (p: TimelinePoint, format: (v: number) => string) =>
  `${p.name} — ${format(p.value)} · ${DATE_FMT.format(new Date(p.at))}`;

/** Discrete deals over time: one dot per deal, a dashed median reference.
 *  A dot with an id links to its deal (a phone cannot hover for a title),
 *  and on a phone the deals are listed under the chart too, each a link —
 *  the names a tap on a crowded scatter cannot give. */
export function DotTimeline({
  points,
  format,
  medianLabel,
}: {
  points: TimelinePoint[];
  format: (v: number) => string;
  medianLabel: string;
}) {
  const listed = points
    .filter((p): p is TimelinePoint & { id: string } => !!p.id)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return (
    <div className="@container">
      {TIMELINE_FRAMES.map((f) => (
        <Scatter key={f.key} frame={f} points={points} format={format} medianLabel={medianLabel} className={f.className} />
      ))}
      {listed.length > 0 ? (
        <details className="mt-2 text-xs sm:hidden" data-qa="timeline-list">
          <summary className="cursor-pointer py-2 text-muted">{`List the ${listed.length} deal${listed.length === 1 ? "" : "s"}`}</summary>
          <ul className="divide-y divide-line/60">
            {listed.map((p) => (
              <li key={p.id}>
                <Link href={`/deals/${encodeURIComponent(p.id)}`} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate font-medium text-brand">{p.name}</span>
                  <span className="shrink-0 font-mono tabular-nums text-muted">
                    {`${format(p.value)} · ${DATE_FMT.format(new Date(p.at))}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Scatter({
  frame,
  points,
  format,
  medianLabel,
  className,
}: {
  frame: Frame;
  points: TimelinePoint[];
  format: (v: number) => string;
  medianLabel: string;
  className: string;
}) {
  const { W, H, pad: PAD, font, r, hit } = frame;

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
  // Dots that open their deals are links, so the chart is a group of them
  // under its name: an image's children are hidden from a screen reader.
  const links = points.some((p) => p.id);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={chartWidthStyle(W)}
      role={links ? "group" : "img"}
      aria-label={timelineName(points, format)}
      className={className}
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
            y={y(tv) + font * 0.35}
            textAnchor="end"
            fontSize={font}
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
        fontSize={font}
        fill={C.muted}
      >
        {medianLabel} {format(med)}
      </text>

      {points.map((p, i) => {
        const cx = x(new Date(p.at).getTime());
        const cy = y(p.value);
        const dot = (
          <circle cx={cx} cy={cy} r={r} fill={C.brand} stroke="#ffffff" strokeWidth={2}>
            <title>{dotWords(p, format)}</title>
          </circle>
        );
        return p.id ? (
          <a key={i} href={`/deals/${encodeURIComponent(p.id)}`} aria-label={dotWords(p, format)}>
            {/* the hit area a finger can find, drawn clear */}
            <circle cx={cx} cy={cy} r={hit} fill="transparent" />
            {dot}
          </a>
        ) : (
          <g key={i}>{dot}</g>
        );
      })}

      <text x={PAD.l} y={H - 8} fontSize={font} fill={C.muted}>
        {MONTH_FMT.format(new Date(t0))}
      </text>
      <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize={font} fill={C.muted}>
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
          {/* The bar repeats the label and count beside it, both read as
              text, so it stays out of the accessibility tree (it had been
              an unnamed image between them); its title still shows on
              hover. */}
          <div className="h-4 min-w-0 flex-1">
            <svg viewBox="0 0 100 8" preserveAspectRatio="none" width="100%" height="100%" aria-hidden>
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
