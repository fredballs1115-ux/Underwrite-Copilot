import {
  formatMove,
  formatValue,
  groupRates,
  seriesUrl,
  shortDate,
  yieldCurve,
  type LiveRate,
  type Observation,
  type YieldCurve,
} from "@/lib/live-rates";

/**
 * Today's rates — across the top of the calculators, and on `/market`.
 *
 * At the app root beside `place-band.tsx` because two pages draw it, and for
 * the same reason that one is: a second copy is how two surfaces come to
 * disagree about the same figure.
 *
 * Pure: the page reads the table and hands the rows in, so this renders on a
 * fixture in `lib/views.render.test.ts` without touching a database.
 *
 * THE PICTURE IS THE CURVE. Every fixed-rate quote on the site prices off a
 * Treasury tenor, and the shape of the curve — which tenor is dear, whether
 * the long end sits above the short — is a fact an analyst reads at a
 * glance from a line and cannot read from eleven tiles. So the curve is
 * drawn, today solid and a week earlier dashed, and the tiles beneath it
 * are the money-market rates a floating note actually references. The rest
 * of the table — credit, bank lending, inflation and the cost of building,
 * jobs, the supply pipeline — folds into groups whose summary line already
 * carries the headline figures, so the strip reads as one card and opens
 * as a monitor. Every tile draws its recent path, because "4.94%" says
 * less than "4.94%, drifting down from 5.1 since August".
 *
 * `seeds` is the series that actually pre-fill a field below, and it is a
 * prop rather than something derived here on purpose. `contractRate` says a
 * loan document NAMES the rate, which is the standing fact; whether a card
 * on this page currently takes it is a different and changing one. Drawing
 * the emphasis from the second means the marked tiles are exactly the ones
 * an analyst will find already filled in — the picture cannot drift from
 * what the page does, because it is the same list.
 */
export function RatesStrip({
  rates,
  seeds = [],
}: {
  rates: readonly LiveRate[];
  seeds?: readonly string[];
}) {
  if (rates.length === 0) return null;
  const filling = rates.filter((r) => seeds.includes(r.meta.id));
  const curve = yieldCurve(rates);
  const groups = groupRates(rates);
  const curveGroup = groups.find((g) => g.group.id === "curve");
  const money = groups.find((g) => g.group.id === "money");
  // The tenors are the picture. Under it, as tiles with their moves and
  // their links: the two tenors the slope is made of — the 2-year and the
  // 10-year, the ones a quote actually names — and the curve group's other
  // series, the breakeven and the real yield the 10-year decomposes into.
  // A tenor the picture could not draw (stale, so left off the line) gets
  // a tile too, since its date is the thing worth seeing.
  const drawn = new Set(curve?.points.map((p) => p.id) ?? []);
  const underCurve = (curveGroup?.rates ?? []).filter(
    (r) =>
      r.meta.tenorMonths === null ||
      r.meta.tenorMonths === 24 ||
      r.meta.tenorMonths === 120 ||
      !drawn.has(r.meta.id),
  );
  const folded = groups.filter((g) => g.group.id !== "curve" && g.group.id !== "money");

  return (
    <section
      aria-labelledby="rates-today"
      className="shadow-card rounded-2xl border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="rates-today" className="text-sm font-semibold tracking-tight">
          Rates today
        </h2>
        <p className="text-[11px] text-muted">
          FRED, pulled every weekday · {rates.length} series · each figure links to
          its source
        </p>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div>
          {curve ? (
            <CurveFigure curve={curve} />
          ) : (
            <p className="text-xs text-muted">
              Too few of the Treasury tenors answered today to draw the curve.
            </p>
          )}
          {underCurve.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {underCurve.map((r) => (
                <Tile key={r.meta.id} r={r} seeded={seeds.includes(r.meta.id)} />
              ))}
            </div>
          )}
        </div>
        {money && (
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {money.group.label}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
              {money.rates.map((r) => (
                <Tile key={r.meta.id} r={r} seeded={seeds.includes(r.meta.id)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {folded.map(({ group, rates: rs }) => (
        <details key={group.id} className="group mt-4 border-t border-line pt-3">
          <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 list-none [&::-webkit-details-marker]:hidden">
            <h3 className="text-sm font-semibold tracking-tight">{group.label}</h3>
            <span className="text-[11px] text-muted">
              {rs
                .slice(0, 3)
                .map((r) => `${r.meta.short} ${formatValue(r)}`)
                .join(" · ")}
            </span>
            <span className="ml-auto text-[11px] font-medium text-brand group-open:hidden">
              show {rs.length}
            </span>
            <span className="ml-auto hidden text-[11px] font-medium text-brand group-open:inline">
              fold
            </span>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
            {rs.map((r) => (
              <Tile key={r.meta.id} r={r} seeded={seeds.includes(r.meta.id)} />
            ))}
          </div>
        </details>
      ))}

      <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
        {filling.length > 0 && (
          <>
            <span className="font-medium text-ink">
              {filling.map((r) => r.meta.short).join(" and ")}
            </span>{" "}
            {filling.length === 1 ? "starts a field" : "start fields"}{" "}
            below at today&apos;s figure — type over it.{" "}
          </>
        )}
        The 30-year survey is an owner-occupier residential rate, not a
        commercial quote, so it is shown here and never fills a box. An index
        is shown as its change from a year ago, never as a level.
      </p>
    </section>
  );
}

// ── one figure ─────────────────────────────────────────────────────────────

function Tile({ r, seeded }: { r: LiveRate; seeded: boolean }) {
  return <RateTile r={r} seeded={seeded} />;
}

/**
 * One live figure: its name, the figure in its own unit, its recent path,
 * the move since the observation before, and the link to its series with
 * the observation's date. Exported because a metro's own figures on
 * `/market` are the same thing filed under a place — a second drawing of
 * "a figure with its date" is how two surfaces come to say it differently.
 * `value` and `sub` override the figure and the move line for a derived
 * figure (a year of permits summed) that is still one series.
 */
export function RateTile({
  r,
  seeded = false,
  value,
  sub,
  short,
}: {
  r: LiveRate;
  seeded?: boolean;
  value?: string;
  sub?: React.ReactNode;
  short?: string;
}) {
  const move = formatMove(r);
  return (
    <div className={`border-l-2 pl-3 ${seeded ? "border-brand" : "border-line"}`}>
      <p
        className="text-[11px] uppercase tracking-wide text-muted"
        title={r.meta.label}
      >
        {short ?? r.meta.short}
      </p>
      <div className="mt-0.5 flex items-end justify-between gap-2">
        <p className="font-mono text-xl font-semibold tabular-nums text-ink">
          {value ?? formatValue(r)}
        </p>
        <Sparkline history={r.history} />
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        {sub !== undefined
          ? sub
          : r.move !== null &&
            move !== null && (
              <>
                <span aria-hidden="true">
                  {r.move > 0 ? "▲" : r.move < 0 ? "▼" : "•"}
                </span>
                <span className="sr-only">
                  {r.move > 0 ? "up " : r.move < 0 ? "down " : "unchanged, "}
                </span>
                <span className="tabular-nums">{move.split(" ")[0]}</span>
                {move.includes(" ") ? ` ${move.split(" ")[1]} ` : " "}
              </>
            )}
        <a
          href={seriesUrl(r.meta.id)}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          {`${short ?? r.meta.short} as of ${shortDate(r.obsDate)}${r.meta.source === "bls" ? " · BLS" : ""}`}
        </a>
        {!r.fresh && <span className="ml-1 text-amber-700">· not updating</span>}
      </p>
    </div>
  );
}

/**
 * The series' recent path, as a line the width of a word. Decorative — the
 * figure and its move are the accessible text — so it is hidden from the
 * tree rather than given a name it would only repeat.
 */
export function Sparkline({ history }: { history: readonly Observation[] }) {
  if (history.length < 3) return null;
  const W = 64;
  const H = 20;
  const values = history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const y = (v: number) => (span === 0 ? H / 2 : 2 + ((max - v) / span) * (H - 4));
  const x = (i: number) => (i / (history.length - 1)) * (W - 2) + 1;
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${W} ${H}`}
      className="h-5 w-16 shrink-0 text-brand"
      data-spark
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx={x(values.length - 1).toFixed(1)} cy={y(last).toFixed(1)} r="1.8" fill="currentColor" />
    </svg>
  );
}

// ── the curve ──────────────────────────────────────────────────────────────

const THIN_MINUS = "−";

function CurveFigure({ curve }: { curve: YieldCurve }) {
  const W = 400;
  const H = 150;
  const left = 36;
  const right = 14;
  const top = 16;
  const bottom = 24;
  const drawn = curve.points.map((p) => p.value);
  const shown = curve.weekAgoDrawable
    ? drawn.concat(curve.points.map((p) => p.weekAgo as number))
    : drawn;
  const lo = Math.min(...shown);
  const hi = Math.max(...shown);
  // A grid step the range reads well on: quarter points across a narrow
  // curve, halves across a steep one.
  const step = hi - lo <= 1.5 ? 0.25 : 0.5;
  const yMin = Math.floor((lo - 0.05) / step) * step;
  const yMax = Math.ceil((hi + 0.05) / step) * step;
  const x = (i: number) =>
    left + (curve.points.length === 1 ? 0 : (i / (curve.points.length - 1)) * (W - left - right));
  const y = (v: number) => top + ((yMax - v) / (yMax - yMin)) * (H - top - bottom);
  const grid: number[] = [];
  for (let g = yMin; g <= yMax + 1e-9; g += step) grid.push(Math.round(g * 100) / 100);
  const today = curve.points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const weekAgo = curve.weekAgoDrawable
    ? curve.points
        .map((p, i) => `${x(i).toFixed(1)},${y(p.weekAgo as number).toFixed(1)}`)
        .join(" ")
    : null;
  const label =
    `The Treasury curve as of ${shortDate(curve.asOf)}: ` +
    curve.points.map((p) => `${p.short} ${p.value.toFixed(2)}%`).join(", ") +
    ".";
  const slope =
    curve.slopeBps === null
      ? null
      : `${curve.slopeBps < 0 ? THIN_MINUS : "+"}${Math.abs(curve.slopeBps)} bps`;

  return (
    <figure>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          The Treasury curve
        </h3>
        {slope && curve.shape && (
          <p className="text-[11px] text-muted">
            <span className="font-medium text-ink">10-yr less 2-yr {slope}</span>
            {" — "}
            {curve.shape === "normal"
              ? "a normal curve, long money dearer than short"
              : curve.shape === "inverted"
                ? "an inverted curve, short money dearer than long"
                : "a flat curve, the same money at every term"}
          </p>
        )}
      </div>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block h-auto w-full"
        data-curve
      >
        {grid.map((g) => (
          <g key={g}>
            <line
              x1={left}
              x2={W - right}
              y1={y(g).toFixed(1)}
              y2={y(g).toFixed(1)}
              stroke="#e7e4dd"
              strokeWidth="1"
            />
            <text
              x={left - 6}
              y={(y(g) + 3).toFixed(1)}
              textAnchor="end"
              fontSize="9"
              fill="#5f6b69"
            >
              {g.toFixed(2)}%
            </text>
          </g>
        ))}
        {weekAgo && (
          <polyline
            points={weekAgo}
            fill="none"
            stroke="#5f6b69"
            strokeWidth="1.25"
            strokeDasharray="3 3"
            opacity="0.8"
          />
        )}
        <polyline
          points={today}
          fill="none"
          stroke="#114e54"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {curve.points.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(i).toFixed(1)} cy={y(p.value).toFixed(1)} r="2.6" fill="#114e54" />
            <text
              x={x(i).toFixed(1)}
              y={(y(p.value) - 7).toFixed(1)}
              textAnchor="middle"
              fontSize="9"
              fill="#18211f"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            >
              {p.value.toFixed(2)}
            </text>
            <text
              x={x(i).toFixed(1)}
              y={H - 8}
              textAnchor="middle"
              fontSize="8.5"
              fill="#5f6b69"
            >
              {p.short.replace(" Treasury", "")}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 text-[11px] text-muted">
        Solid is today{weekAgo ? ", dashed a week earlier" : ""}, as of{" "}
        {shortDate(curve.asOf)}. Each tenor is a field&apos;s Treasury where a clause
        names one.
      </figcaption>
    </figure>
  );
}
