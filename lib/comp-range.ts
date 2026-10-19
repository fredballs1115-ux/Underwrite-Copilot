import { middleRead } from "@/lib/analytics";
import { fmtBasis } from "@/lib/market-memory";
import { pctText } from "@/lib/plan-facts";

/**
 * The reader's own past screens as a picture: the going-in cap and the basis
 * each a min–max track, one dot a comparable deal, this deal a dark tick —
 * the "From your past screens" strip and the "From your pipeline" block on
 * the deal page. Pure, and computed on the server: the component draws plain
 * numbers and words, so no reader rides into the client bundle.
 *
 * Four rules. **Every figure is at the ask** — struck on a memorandum's
 * asking price, never a price anyone paid — and the track's label says so.
 * **A median only from three deals** (lib/analytics `middleRead`, the
 * analytics' own floor): two deals are a low and a high, never a middle.
 * **No tick for this deal where its figure is not one**: its cap slot
 * withheld (lib/compare-interest `capSlotWithheld` — a note, a position, a
 * share beside its entity's loan), a leased fee's ground-rent cap, a plan
 * deal (judged on its yield on cost), or a basis `subjectBasis` reads none
 * for. **A plan deal's all-in basis is never on a building's track**: the
 * comparables whose basis is total cost over the planned units draw a track
 * of their own, with no tick for this deal on it.
 */

export interface RangeComp {
  /** the comparable deal's name, for its dot's title */
  name: string;
  /** its going-in cap, percent — null where it pools none */
  cap: number | null;
  /** its basis, dollars, on the track's basis — `allIn` where it is a plan
   *  deal's total cost over its planned units */
  basis: { value: number; allIn: boolean } | null;
}

export interface RangeSubject {
  /** this deal's going-in cap, percent — null where it has none to draw */
  cap: number | null;
  /** this deal's basis on the track's basis (lib/comp-detail
   *  `subjectBasis`) — null where it reads none */
  basis: number | null;
}

export interface RangeDot {
  value: number;
  /** "The Maddox: 5.40%" */
  title: string;
}

export interface RangeTrack {
  key: "cap" | "basis" | "basis_all_in";
  /** "Going-in cap, at the ask" */
  label: string;
  dots: RangeDot[];
  /** the comparables' own ends */
  lo: number;
  hi: number;
  /** "5.20–5.60%", or one figure where the ends agree */
  rangeText: string;
  /** the median, from three deals up; null below */
  median: number | null;
  medianText: string | null;
  subject: number | null;
  subjectText: string | null;
  /** the scale's two ends: the comparables and this deal, a little room
   *  past each */
  domain: [number, number];
}

/** The basis the comparables are on: per unit (with its noun) or per SF. */
export interface RangeBasis {
  unit: "unit" | "sf";
  /** "unit", "key", "pad" — null per SF */
  noun: string | null;
}

function domainOf(values: readonly number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  // A little room past each end, so a dot at an end sits on the track; one
  // figure alone sits in the middle of a track 10% of its value wide.
  const pad = span > 0 ? span * 0.08 : Math.abs(lo) * 0.05 || 1;
  return [lo - pad, hi + pad];
}

function rangeTextOf(lo: number, hi: number, fmt: (n: number) => string, joinSuffix: string | null): string {
  const a = fmt(lo);
  const b = fmt(hi);
  if (a === b) return a;
  // "5.20–5.60%", "$240k–$262k/unit": the suffix said once.
  if (joinSuffix && a.endsWith(joinSuffix) && b.endsWith(joinSuffix)) {
    return `${a.slice(0, -joinSuffix.length)}–${b}`;
  }
  return `${a}–${b}`;
}

function trackOf(
  key: RangeTrack["key"],
  label: string,
  entries: readonly { name: string; value: number }[],
  subject: number | null,
  fmt: (n: number) => string,
  joinSuffix: string | null,
): RangeTrack | null {
  const values = entries.map((e) => e.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const mid = middleRead(values);
  const median = mid.kind === "median" ? mid.value : null;
  const tick = subject != null && Number.isFinite(subject) && subject > 0 ? subject : null;
  return {
    key,
    label,
    dots: entries.filter((e) => Number.isFinite(e.value)).map((e) => ({ value: e.value, title: `${e.name}: ${fmt(e.value)}` })),
    lo,
    hi,
    rangeText: rangeTextOf(lo, hi, fmt, joinSuffix),
    median,
    medianText: median != null ? fmt(median) : null,
    subject: tick,
    subjectText: tick != null ? fmt(tick) : null,
    domain: domainOf(tick != null ? [...values, tick] : values),
  };
}

/**
 * The tracks for a set of comparables against this deal: the going-in cap
 * where any comparable pools one, the basis of the buildings where any
 * states one, and the plan deals' all-in basis on a track of its own.
 */
export function compRangeTracks(comps: readonly RangeComp[], subject: RangeSubject, basis: RangeBasis | null): RangeTrack[] {
  const tracks: RangeTrack[] = [];
  // The market memory's own bound on a cap (lib/market-memory `buildComps`):
  // a misread 300% is no going-in cap, and would stretch the track to
  // nothing.
  const capOk = (v: number | null): v is number => v != null && v > 0 && v <= 25;
  const caps = comps.flatMap((c) => (capOk(c.cap) ? [{ name: c.name, value: c.cap }] : []));
  const cap = trackOf("cap", "Going-in cap, at the ask", caps, capOk(subject.cap) ? subject.cap : null, pctText, "%");
  if (cap) tracks.push(cap);
  if (basis) {
    const fmt = (n: number) => fmtBasis(n, basis.unit, basis.noun);
    const suffix = basis.unit === "sf" ? "/SF" : `/${basis.noun ?? "unit"}`;
    const per = basis.unit === "sf" ? "SF" : (basis.noun ?? "unit");
    const building = comps.flatMap((c) => (c.basis && !c.basis.allIn && c.basis.value > 0 ? [{ name: c.name, value: c.basis.value }] : []));
    const allIn = comps.flatMap((c) => (c.basis && c.basis.allIn && c.basis.value > 0 ? [{ name: c.name, value: c.basis.value }] : []));
    const b = trackOf("basis", `Basis / ${per}, at the ask`, building, subject.basis, fmt, suffix);
    if (b) tracks.push(b);
    // Total cost over the planned units: its own track, and never this
    // deal's tick, whose basis is a building's price.
    const a = trackOf("basis_all_in", `All-in basis / ${per} (plan deals), at the ask`, allIn, null, fmt, suffix);
    if (a) tracks.push(a);
  }
  return tracks;
}
