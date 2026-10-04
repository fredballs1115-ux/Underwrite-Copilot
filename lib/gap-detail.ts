// One reader for the reconciliation's gap — the text a row carries beside its
// direction ("$174k below the OM — heavier expense load", "300 bps higher, in
// line with in-place", "+4.2%", "In agreement") — so the deal page and the
// report can draw the gap instead of printing it alone. Pure and LLM-free,
// and it reads only the magnitude the text states: a dollar figure, a
// basis-point figure or a percentage. The SIGN is the row's own direction
// (favorable / unfavorable, from the buyer's side), never inferred from the
// words, and a row that states no figure ("In agreement", "Not modelled")
// reads as nothing. Dollars, basis points and percentages are different
// yardsticks: the scale puts each unit on its own track and never mixes them.
//
// The two VALUES a row compares are read with the sign they state
// (`valueFigure`): a model's rent growth of "-1.0%" is a figure below zero,
// not one point, and the gap the two values make is subtracted with their
// signs. The first cut read "-1.0%", "−1.0%" and "(1.0%)" as +1.0, so 3.0%
// against -1.0% made 200 bps, and the page said the reconciler's correct
// "400 bps" line was wrong.
import type { ReconDirection } from "@/lib/anthropic/types";
import { looksLikeRange } from "@/lib/typical-range";

export type GapUnit = "usd" | "bps" | "pct";

export interface GapFigure {
  /** the magnitude as stated, always positive */
  value: number;
  unit: GapUnit;
}

/** A row's value as it states it — signed, so a model figure below zero is
 *  read as one. */
export interface ValueFigure {
  value: number;
  unit: GapUnit;
}

// "$174k", "$1.2M", "$1.2 million", "$450 thousand", "$5MM", "$2bn",
// "$174,000". A suffix must end at a word boundary, so "$174 mortgage" is
// $174 and not $174M.
const MONEY =
  /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|thousand|mm|mn|m|million|bn|b|billion)?\b/i;
const BPS = /(\d+(?:\.\d+)?)\s*(?:bps|bp|basis points?)\b/i;
// "+4.2%", "3 percentage points", "3 pts", "2 pp", "4 per cent".
const PCT = /(\d+(?:\.\d+)?)\s*(?:%|percent(?:age points?)?|per cent|pts?\b|pp\b)/i;

/** A figure the text states, and where in the text it stands. */
interface Located extends GapFigure {
  start: number;
  end: number;
}

/** The first figure a text states, by the precedence `gapFigure` names. */
function locate(s: string): Located | null {
  const m = s.match(MONEY);
  if (m && m.index != null) {
    const whole = m[1].replace(/,/g, "");
    let n = Number(`${whole}${m[2] ? `.${m[2]}` : ""}`);
    const suffix = (m[3] ?? "").toLowerCase();
    if (suffix === "k" || suffix === "thousand") n *= 1_000;
    else if (suffix === "m" || suffix === "mm" || suffix === "mn" || suffix === "million") n *= 1_000_000;
    else if (suffix === "b" || suffix === "bn" || suffix === "billion") n *= 1_000_000_000;
    if (Number.isFinite(n) && n > 0) return { value: n, unit: "usd", start: m.index, end: m.index + m[0].length };
  }
  const b = s.match(BPS);
  if (b && b.index != null) {
    const n = Number(b[1]);
    if (Number.isFinite(n) && n > 0) return { value: n, unit: "bps", start: b.index, end: b.index + b[0].length };
  }
  const p = s.match(PCT);
  if (p && p.index != null) {
    const n = Number(p[1]);
    if (Number.isFinite(n) && n > 0) return { value: n, unit: "pct", start: p.index, end: p.index + p[0].length };
  }
  return null;
}

/** The magnitude a gap line states, or null when it states none. Dollars
 *  win over basis points over percentages when a line carries more than one
 *  ("$174k, 4.5% below" is a dollar gap with its share beside it). */
export function gapFigure(text: string | null | undefined): GapFigure | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const f = locate(s);
  return f ? { value: f.value, unit: f.unit } : null;
}

// A minus sign standing directly before a figure (or its dollar sign): the
// hyphen-minus, the minus sign (U+2212), or the en dash a word processor sets
// in its place — never one inside a word ("T-12", "Year-1").
const MINUS_BEFORE = /(?:^|[^\p{L}\p{N}])[-−–]$/u;
// A dash set apart from the figure by a space: a sign, or a separator
// ("NOI – $3,880,000")? The words do not say.
const DASH_APART = /[-−–]\s+$/u;

/** The sign a value's figure states: a minus directly before it, or
 *  accounting's brackets round it ("(1.0%)", "($30,000)"); null where a dash
 *  stands apart from it and could be either a sign or a separator. */
function signOf(s: string, f: Located): 1 | -1 | null {
  const before = s.slice(0, f.start);
  const after = s.slice(f.end);
  if (MINUS_BEFORE.test(before)) return -1;
  if (/\(\s*$/.test(before) && /^\s*\)/.test(after)) return -1;
  if (DASH_APART.test(before)) return null;
  return 1;
}

/**
 * A row's value as it states it: the figure `gapFigure` reads, with the sign
 * the text gives it — a minus in any of its forms ("-1.0%", "−1.0%",
 * "–1.0%") or accounting's brackets ("(1.0%)", "($30,000)"). Null where it
 * states no figure, or where a dash stands apart from the figure, a sign or
 * a separator, so the row's own line is read instead of a guess.
 */
export function valueFigure(text: string | null | undefined): ValueFigure | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const f = locate(s);
  if (!f) return null;
  const sign = signOf(s, f);
  return sign === null ? null : { value: sign * f.value, unit: f.unit };
}

// A percentage gap stated in points of a rate ("3 pts", "2 pp", "3
// percentage points"), not as a share of the figure.
const POINTS = /percentage points?|\bpts?\b|\bpp\b/i;

// The footing a dollar figure states: its period and what it is per. A gap
// line written "$150/mo below the OM" beside a model figure of "$28,800 /
// unit / yr" is a month's gap over a year's figure, and "$150 per unit"
// beside a building's "$6,499,500" is one door's gap over the whole: the
// share each division reads (0.5%, 0.002%) is no share at all.
const MONTHLY = /\/\s*(?:mo|month)\b|\bper\s+month\b|\ba\s+month\b|\bmonthly\b|\bmo\b/i;
const YEARLY = /\/\s*(?:yr|year|annum)\b|\bper\s+(?:year|annum)\b|\ba\s+year\b|\bannual(?:ly)?\b|\byr\b|\bp\.a\./i;
const PER_UNIT = /(?:\/\s*|\bper\s+|\ban?\s+)(?:unit|door|apartment|key|room|bed|pad|home|space|site)s?\b/i;
const PER_AREA = /(?:\/\s*|\bper\s+|\ban?\s+)(?:sf|sq\.?\s?ft|square\s+foot|square\s+feet|ft2|acre)\b|\bpsf\b/i;

interface Footing {
  period: "mo" | "yr" | null;
  per: "unit" | "area" | null;
}

function footingOf(text: string | null | undefined): Footing {
  const s = text ?? "";
  return {
    period: MONTHLY.test(s) ? "mo" : YEARLY.test(s) ? "yr" : null,
    per: PER_UNIT.test(s) ? "unit" : PER_AREA.test(s) ? "area" : null,
  };
}

/** Whether a dollar gap and a dollar figure are on one footing. What each
 *  is per must agree, an unstated "per" on both sides being the building's
 *  whole. A period stated on one side and not the other is read as the
 *  stated one's only where that is a year, the period a reconciliation's
 *  totals are quoted in; a month beside an unstated figure, or a month
 *  beside a year, is not one footing. */
function oneFooting(gap: Footing, base: Footing): boolean {
  if (gap.per !== base.per) return false;
  if (gap.period === base.period) return true;
  if (gap.period === null) return base.period === "yr";
  if (base.period === null) return gap.period === "yr";
  return false;
}

/** A reconciliation row's three texts: the OM's figure, the model's, and
 *  the line the reconciler wrote between them. */
export interface GapRow {
  omValue?: string | null;
  myValue?: string | null;
  gap?: string | null;
}

// A value written as a range is no single figure to subtract, whether or
// not its ends make a range to draw against (lib/typical-range).
const isRange = (text: string | null | undefined) => looksLikeRange(text);

/**
 * The gap the row's two figures make, where both are stated on one footing.
 * The reconciler is asked for the difference and writes it as a line ("$174k
 * below the OM") — the model's arithmetic — beside two values that both
 * parse, so the code subtracts them: two dollar figures give dollars, two
 * rates give basis points. Each value is read with its own sign
 * (`valueFigure`), so 3.0% against -1.0% is 400 bps, never 200. Null where
 * either figure is unstated, a range, on another footing (a month beside a
 * year, one unit beside the whole) or carries a dash that may not be a sign,
 * and the row's own line is read instead. The SIGN of the gap stays the
 * row's stated direction; this is the size alone.
 */
export function valueGap(row: GapRow): GapFigure | null {
  if (isRange(row.omValue) || isRange(row.myValue)) return null;
  const om = valueFigure(row.omValue);
  const mine = valueFigure(row.myValue);
  if (!om || !mine || om.unit !== mine.unit) return null;
  if (om.unit === "usd") {
    if (!oneFooting(footingOf(row.omValue), footingOf(row.myValue))) return null;
    return { value: Math.abs(om.value - mine.value), unit: "usd" };
  }
  if (om.unit === "pct") return { value: Math.round(Math.abs(om.value - mine.value) * 10_000) / 100, unit: "bps" };
  return null;
}

/** The figure a row's gap is drawn and graded by: the two values' own gap
 *  where they make one, else the magnitude the row's line states. */
export function rowGap(row: GapRow): GapFigure | null {
  return valueGap(row) ?? gapFigure(row.gap);
}

/**
 * Where the reconciler's line states a gap of the values' own unit and
 * footing that the two values do not make — beyond the line's rounding (6%,
 * or $1,000 / 5 bps) — the two, so a page can say so rather than draw one
 * and print the other.
 */
export function gapDisagreement(row: GapRow): { computed: GapFigure; stated: GapFigure } | null {
  const computed = valueGap(row);
  let stated = gapFigure(row.gap);
  if (!computed || !stated) return null;
  if (stated.unit === "pct" && computed.unit === "bps" && POINTS.test((row.gap ?? "").match(PCT)?.[0] ?? "")) {
    stated = { value: stated.value * 100, unit: "bps" };
  }
  if (stated.unit !== computed.unit) return null;
  if (computed.unit === "usd" && !oneFooting(footingOf(row.gap), footingOf(row.omValue))) return null;
  const tolerance = Math.max(computed.value * 0.06, computed.unit === "usd" ? 1_000 : 5);
  return Math.abs(stated.value - computed.value) > tolerance ? { computed, stated } : null;
}

const sayGap = (f: GapFigure) =>
  f.unit === "usd" ? `$${Math.round(f.value).toLocaleString("en-US")}` : `${Math.round(f.value * 100) / 100} bps`;

/** The sentence a page prints under a row whose line and figures disagree. */
export function gapDisagreementLine(row: GapRow): string | null {
  const d = gapDisagreement(row);
  if (!d) return null;
  return d.computed.value === 0
    ? `The two figures are the same, where the line says ${sayGap(d.stated)}.`
    : `The two figures differ by ${sayGap(d.computed)}, where the line says ${sayGap(d.stated)}.`;
}

/**
 * A gap's size as a share of the buyer's own figure: the property-actuals
 * card's delta, (OM − actual) ÷ |actual|, with the row's model figure in the
 * actual's place. A reconciliation row can then be graded on that card's
 * band. It reads only what the row states, each through `gapFigure`: the
 * magnitude the gap line states, and the model's figure. There are three
 * footings:
 * - a dollar gap over a dollar figure;
 * - basis points, or percentage points, over a rate;
 * - a percentage of a dollar figure, as it stands.
 * Null where the two are not on one footing, or where either is unstated.
 * A dollar gap on a rate is not on one footing. Neither is a bare "4%"
 * beside a rate: it could be a share of the rate or points of it, and the
 * words do not say which. Nor is a dollar gap stated by the month, or per
 * unit or per foot, beside a figure stated another way (`oneFooting`).
 */
export function gapShare(row: GapRow): number | null {
  const base = gapFigure(row.myValue);
  if (!base || base.value <= 0) return null;
  // The two figures' own gap first (`valueGap`): it is on the values'
  // footing by construction.
  const computed = valueGap(row);
  if (computed) {
    if (computed.unit === "usd") return base.unit === "usd" ? computed.value / base.value : null;
    if (computed.unit === "bps") return base.unit === "pct" ? computed.value / 100 / base.value : null;
  }
  const g = gapFigure(row.gap);
  if (!g) return null;
  switch (g.unit) {
    case "usd":
      return base.unit === "usd" && oneFooting(footingOf(row.gap), footingOf(row.myValue))
        ? g.value / base.value
        : null;
    case "bps":
      return base.unit === "pct" ? g.value / 100 / base.value : null;
    case "pct": {
      if (base.unit === "usd") return g.value / 100;
      const points = POINTS.test((row.gap ?? "").match(PCT)?.[0] ?? "");
      return base.unit === "pct" && points ? g.value / base.value : null;
    }
  }
}

/**
 * The share a reconciliation risk is graded on, on the property-actuals
 * card's NOI band: only a row whose model figure is in dollars (an income,
 * an expense, a value). A rate's gap over the rate — 25 bps on a 5.50% cap
 * is 4.5% of it, 3 points on a 9% vacancy a third of it — is not a share
 * of the income, and the NOI band says nothing about it; such a row keeps
 * its grade.
 */
export function incomeGapShare(row: GapRow): number | null {
  return gapFigure(row.myValue)?.unit === "usd" ? gapShare(row) : null;
}

export interface GapScale {
  /** each row's gap as a signed share of the widest gap of its unit —
   *  positive when favorable to the buyer, negative when unfavorable; null
   *  for a neutral row or one that states no figure */
  shares: (number | null)[];
  /** the unit each drawn row is scaled within */
  units: (GapUnit | null)[];
}

/** Every row's gap on its unit's track: a dollar gap against the widest
 *  dollar gap, a basis-point gap against the widest in basis points, so a
 *  $174k gap and a 300 bps gap never share a scale. A neutral row draws
 *  nothing — its gap is not a distance in either direction. */
export function gapScale(
  rows: ReadonlyArray<GapRow & { direction?: ReconDirection | string | null }>,
): GapScale {
  // The two values' own gap where they make one (`rowGap`), so the bar is
  // the code's subtraction rather than the reconciler's; a zero gap draws
  // nothing.
  const figures = rows.map((r) => {
    if (r.direction === "neutral") return null;
    const f = rowGap(r);
    return f && f.value > 0 ? f : null;
  });
  const widest: Partial<Record<GapUnit, number>> = {};
  for (const f of figures) {
    if (!f) continue;
    widest[f.unit] = Math.max(widest[f.unit] ?? 0, f.value);
  }
  return {
    shares: figures.map((f, i) => {
      if (!f) return null;
      const max = widest[f.unit] ?? 0;
      if (max <= 0) return null;
      const share = Math.min(1, f.value / max);
      const dir = rows[i].direction;
      return dir === "favorable" ? share : dir === "unfavorable" ? -share : null;
    }),
    units: figures.map((f) => f?.unit ?? null),
  };
}
