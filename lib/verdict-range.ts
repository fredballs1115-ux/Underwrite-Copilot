/**
 * The verdict's screening ranges as every surface reads them (pure, no
 * imports): the deal page's range cards, the shared screen, the memo and the
 * full report print a range's cells "Low", "Base" and "High" and draw the
 * base's place on one track from low to high.
 *
 * The verdict is asked for the smaller figure as `low` and the larger as
 * `high`, whichever end is the conservative one (research pass 18). Before
 * that it was asked for the conservative end first, so an exit cap stored
 * then can read "Low 5.75% / High 5.25%": a "Low" cell holding the larger
 * figure, and no track drawn. `rangeInOrder` reads such a pair with its ends
 * swapped, so every surface prints and draws one range the same way; ends
 * that do not both read as numbers on one scale are left as written.
 *
 * A cell is read with everything it states (`rangeFigure`): its sign, its
 * scale and its unit. The first reader took the first run of digits, so
 * "$950k / $1.05M / $1.2M" read 950, 1.05 and 1.2 and printed "Low $1.2M ·
 * High $950k" with the base's dot at the start, and "−3% / −2% / −1%" (the
 * minus sign, U+2212) read 3, 2 and 1 and swapped too.
 */

/** What a display figure is measured in. A bare number takes the unit of
 *  the figures beside it, since a range often writes its unit once
 *  ("5.25–5.75%"). */
export type FigureUnit = "usd" | "pct" | "bps" | "x" | "plain";

export interface RangeFigure {
  /** signed, its scale applied: "−$1.2M" is −1,200,000 */
  value: number;
  unit: FigureUnit;
}

// The scale an analyst writes after a figure, longer spellings first.
const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  m: 1e6,
  bn: 1e9,
  billion: 1e9,
  b: 1e9,
};

// A minus sign is the hyphen-minus, the minus sign (U+2212) or the en dash
// a word processor sets in its place — counted only directly before the
// figure or its dollar sign ("−$1.2M", "$-30,000"), never inside a word
// ("Year-2", "T-12"). The scale must end at a word boundary, so "5 months"
// is five and not five million.
const FIGURE =
  /(?:(?<![\p{L}\p{N}])([-−–]))?(?:(\$)([-−–])?)?(\d[\d,]*(?:\.\d+)?|\.\d+)(?:\s?(k|thousand|mm|mn|million|m|bn|billion|b)\b)?(?:\s*(%|percent\b|per\s*cent\b|bps\b|bp\b|basis\s+points?\b|pts?\b|pp\b|x\b|×))?/iu;

/** The first figure in a display string, with its sign, its scale and its
 *  unit: "$1,495" → 1,495 dollars, "5.25%" → 5.25 percent, "$950k" →
 *  950,000 dollars, "−3%" → −3 percent; null where it states none. */
export function rangeFigure(text: string): RangeFigure | null {
  const m = FIGURE.exec(text);
  if (!m) return null;
  const n = Number(m[4].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const scale = m[5] ? (SCALE[m[5].toLowerCase()] ?? 1) : 1;
  const sign = m[1] || m[3] ? -1 : 1;
  const value = sign * n * scale;
  const tail = (m[6] ?? "").toLowerCase();
  const unit: FigureUnit = m[2]
    ? "usd"
    : !tail
      ? "plain"
      : tail.startsWith("b")
        ? "bps"
        : tail === "x" || tail === "×"
          ? "x"
          : "pct";
  // "-0" is a number JavaScript prints with its sign attached.
  return { value: value === 0 ? 0 : value, unit };
}

/** Whether two figures are on one scale: the same unit, or a bare number
 *  beside either. */
export function sameScale(a: RangeFigure, b: RangeFigure): boolean {
  return a.unit === b.unit || a.unit === "plain" || b.unit === "plain";
}

/** The first number in a display string, its sign and scale read ("$1,495"
 *  → 1495, "5.25%" → 5.25, "$1.2M" → 1,200,000, "−2.5%" → −2.5). */
export function firstNumber(text: string): number | null {
  return rangeFigure(text)?.value ?? null;
}

/** The range with its smaller figure as `low` and its larger as `high` —
 *  swapped only where both ends read as figures on one scale. */
export function rangeInOrder<T extends { low: string; high: string }>(r: T): T {
  const lo = rangeFigure(r.low);
  const hi = rangeFigure(r.high);
  return lo && hi && sameScale(lo, hi) && lo.value > hi.value ? { ...r, low: r.high, high: r.low } : r;
}

/** Where the base sits inside low → high, 0..1, on the range read in order;
 *  null when the three figures do not parse as one scale. Which end is the
 *  sponsor's depends on the assumption (a higher rent is theirs, a higher
 *  vacancy the buyer's), so the position is drawn, never graded. */
export function basePosition(r: { low: string; base: string; high: string }): number | null {
  const o = rangeInOrder(r);
  const lo = rangeFigure(o.low);
  const hi = rangeFigure(o.high);
  const base = rangeFigure(o.base);
  if (!lo || !hi || !base) return null;
  if (!sameScale(lo, hi) || !sameScale(lo, base) || !sameScale(hi, base)) return null;
  return hi.value > lo.value
    ? Math.min(1, Math.max(0, (base.value - lo.value) / (hi.value - lo.value)))
    : null;
}
