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
import type { ReconDirection } from "@/lib/anthropic/types";

export type GapUnit = "usd" | "bps" | "pct";

export interface GapFigure {
  /** the magnitude as stated, always positive */
  value: number;
  unit: GapUnit;
}

const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*([kKmMbB])?(?![a-zA-Z])/;
const BPS = /(\d+(?:\.\d+)?)\s*(?:bps|bp|basis points?)\b/i;
const PCT = /(\d+(?:\.\d+)?)\s*(?:%|percent(?:age points?)?|pts?\b)/i;

/** The magnitude a gap line states, or null when it states none. Dollars
 *  win over basis points over percentages when a line carries more than one
 *  ("$174k, 4.5% below" is a dollar gap with its share beside it). */
export function gapFigure(text: string | null | undefined): GapFigure | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const m = s.match(MONEY);
  if (m) {
    const whole = m[1].replace(/,/g, "");
    let n = Number(`${whole}${m[2] ? `.${m[2]}` : ""}`);
    const suffix = (m[3] ?? "").toLowerCase();
    if (suffix === "k") n *= 1_000;
    else if (suffix === "m") n *= 1_000_000;
    else if (suffix === "b") n *= 1_000_000_000;
    if (Number.isFinite(n) && n > 0) return { value: n, unit: "usd" };
  }
  const b = s.match(BPS);
  if (b) {
    const n = Number(b[1]);
    if (Number.isFinite(n) && n > 0) return { value: n, unit: "bps" };
  }
  const p = s.match(PCT);
  if (p) {
    const n = Number(p[1]);
    if (Number.isFinite(n) && n > 0) return { value: n, unit: "pct" };
  }
  return null;
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
  rows: ReadonlyArray<{ gap?: string | null; direction?: ReconDirection | string | null }>,
): GapScale {
  const figures = rows.map((r) => (r.direction === "neutral" ? null : gapFigure(r.gap)));
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
