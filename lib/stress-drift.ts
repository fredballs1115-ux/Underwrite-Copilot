// The stress test "since the call" (2026-10-28) — display only. The verdict
// keeps the stress test as it stood at the call (lib/stress-snapshot, in the
// verdict's jsonb); the deal page builds today's from today's evidence. A
// buyer asking whether the screen was right wants to see what has moved
// since: a row whose verdict word changed, a deciding figure that is newer
// (the same piece, a later period), and the headline's evidence case then
// against now. This reads the two and says it; it changes nothing. Pure.
//
// Its rules:
//   - a row is matched by its key (the challenger's "other" points are read
//     by no figure and are left out);
//   - a verdict word that changed is a move (`moved`), whatever else did;
//   - a figure is set against a later one ONLY where both decided their row
//     and are the same piece — its kind, its label and its publisher, on one
//     yardstick: a later period is `newer_figure`, the same period at another
//     figure `revised`; a different piece is `decider_changed`, said as the
//     decider changing and never as a move between the two figures;
//   - a row unchecked at the call or today says so (`unchecked`);
//   - a snapshot kept before its rows said which piece decided them
//     (`StressSnapshotRow.decided`) is read for its verdict words alone
//     (`wordsOnly`), its figures never set against today's;
//   - the headline's evidence case is set against today's only where both
//     were struck on the same measure and both solve;
//   - the sample's test has nothing that postdates its screen: null.

import type { StressSnapshot, StressSnapshotRow } from "@/lib/stress-snapshot";
import type { EvidenceKind, StressEvidence, StressKey, StressRow, StressTest, StressVerdict } from "@/lib/stress-test-types";
import { evidenceFigureText, evidencePeriod, isoDayOf, liveHeadline } from "@/lib/stress-test-words";
import { compactUsd } from "@/lib/money";

export type DriftKind = "same" | "moved" | "newer_figure" | "revised" | "decider_changed" | "new_row" | "gone_row";

/** A deciding figure as a chip prints it. */
export interface DriftFigure {
  /** in the row's own unit: "6.2%", "$1.2M", "$2,600/mo" */
  text: string;
  /** the period it is for, by its own cadence ("Q2 2026"); null undated */
  period: string | null;
  /** "Rental vacancy, metro area", "The deal's T-12" */
  label: string;
  publisher: string;
  kind: EvidenceKind;
}

export interface StressDriftRow {
  key: StressKey;
  /** the row's title, today's where it has one */
  title: string;
  kind: DriftKind;
  /** the verdict at the call and today; null where the row was not there */
  then: StressVerdict | null;
  now: StressVerdict | null;
  /** the figure that decided the row at the call and today, where each did
   *  and the snapshot says so; null otherwise */
  thenFigure: DriftFigure | null;
  nowFigure: DriftFigure | null;
  /** the piece that decides today is not the one that decided at the call */
  deciderChanged: boolean;
  /** which side reads the row unchecked */
  unchecked: "then" | "now" | "both" | null;
  /** a moved row's direction for the buyer: a verdict further from holding
   *  is worse; null where either side is unchecked or the row is not moved */
  direction: "worse" | "better" | null;
  /** the snapshot kept no word of which piece decided: verdict words alone */
  wordsOnly: boolean;
}

export interface StressDriftHeadline {
  measure: "levered_irr" | "yield_on_cost";
  /** the evidence's case, in percent */
  then: number;
  now: number;
}

export interface StressDrift {
  /** the day of the call in words ("Oct 20, 2026"); null where none is known */
  calledOn: string | null;
  /** every row read, unchanged ones included, changed ones first */
  rows: StressDriftRow[];
  counts: Record<Exclude<DriftKind, "same">, number>;
  /** the evidence's case then and now, where both stand on one measure */
  headline: StressDriftHeadline | null;
  /** the snapshot's rows carried no decider: verdict words alone were read */
  wordsOnly: boolean;
  /** anything at all moved: a row that is not `same`, or the headline */
  changed: boolean;
}

/** How far a verdict sits from holding, for a move's direction. */
const DISTANCE: Record<Exclude<StressVerdict, "unchecked">, number> = { holds: 0, stretched: 1, unsupported: 2 };

/** The order changed rows are listed in. */
const ORDER: Record<DriftKind, number> = { moved: 0, decider_changed: 1, newer_figure: 2, revised: 3, new_row: 4, gone_row: 5, same: 6 };

const SAME_FIGURE = 1e-9;

/** A period as a sortable day, where it can be read as one: an ISO day or
 *  stamp, "2026-08", "Q2 2026", a year in brackets or alone. */
function periodKey(asOf: string | null | undefined): string | null {
  const s = isoDayOf(asOf);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  const q = s.match(/^Q([1-4])\s+(\d{4})$/);
  if (q) return `${q[2]}-${String((Number(q[1]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return null;
}

/** A figure in the row's own unit, on the yardstick it was judged on. */
function figureOn(key: StressKey, value: number, per: string | null, rowText: string | undefined): string {
  if (key === "basis" && per) return `${compactUsd(value, { millions: 2, trim: true })}${per}`;
  if (key === "market_rent" && per) return per === "/SF" ? `$${value.toFixed(2)}/SF` : `$${Math.round(value).toLocaleString("en-US")}/mo`;
  return evidenceFigureText(key, value, rowText);
}

/** Today's deciding piece, where the row names one. */
function decidingPiece(row: StressRow): StressEvidence | null {
  if (row.verdict === "unchecked" || row.decidedBy == null) return null;
  const e = row.evidence[row.decidedBy];
  return e && typeof e.value === "number" && Number.isFinite(e.value) ? e : null;
}

/** The yardstick today's piece is judged on, as the snapshot keeps it. */
const perOf = (row: StressRow, e: StressEvidence): string | null => e.ownYardstick?.per ?? row.yardstick ?? null;

function nowFigureOf(row: StressRow, e: StressEvidence): DriftFigure {
  return {
    text: figureOn(row.key, e.value as number, perOf(row, e), row.omSays.text),
    period: evidencePeriod(e)?.said ?? null,
    label: e.label,
    publisher: e.publisher,
    kind: e.kind,
  };
}

function thenFigureOf(s: StressSnapshotRow, rowText: string | undefined): DriftFigure | null {
  const e = s.evidence;
  if (!e) return null;
  return {
    text: figureOn(s.key, e.value, s.per, rowText),
    period: e.period ?? evidencePeriod({ asOf: e.asOf, text: "" })?.said ?? null,
    label: e.label,
    publisher: e.publisher,
    kind: e.kind,
  };
}

function uncheckedOf(then: StressVerdict | null, now: StressVerdict | null): StressDriftRow["unchecked"] {
  const a = then === "unchecked";
  const b = now === "unchecked";
  return a && b ? "both" : a ? "then" : b ? "now" : null;
}

function directionOf(then: StressVerdict, now: StressVerdict): StressDriftRow["direction"] {
  if (then === "unchecked" || now === "unchecked" || then === now) return null;
  return DISTANCE[now] > DISTANCE[then] ? "worse" : "better";
}

/**
 * What moved in the stress test since the call: the verdict's snapshot
 * (`atCall`, read through lib/stress-snapshot `readStressSnapshot`) against
 * the test the page builds today. Null with no snapshot, no test today, or on
 * the sample. `calledOn` is the call's day in words (lib/screen-run
 * `screenedOn` of the verdict's `generatedAt`).
 */
export function stressDrift(
  atCall: StressSnapshot | null | undefined,
  today: StressTest | null | undefined,
  opts: { calledOn?: string | null; sample?: boolean } = {},
): StressDrift | null {
  if (!atCall || !today || today.rows.length === 0 || atCall.rows.length === 0) return null;
  if (opts.sample || today.sample) return null;

  const firstByKey = <T extends { key: StressKey }>(rows: readonly T[]): Map<StressKey, T> => {
    const m = new Map<StressKey, T>();
    for (const r of rows) if (r.key !== "other" && !m.has(r.key)) m.set(r.key, r);
    return m;
  };
  const thenRows = firstByKey(atCall.rows);
  const nowRows = firstByKey(today.rows);
  // A snapshot whose rows never say which piece decided them was kept before
  // the snapshot carried it: its figures are not set against today's.
  const wordsOnly = ![...thenRows.values()].some((r) => r.decided);

  const rows: StressDriftRow[] = [];
  const keys = [...new Set<StressKey>([...thenRows.keys(), ...nowRows.keys()])];
  for (const key of keys) {
    const s = thenRows.get(key) ?? null;
    const r = nowRows.get(key) ?? null;
    if (!s && r) {
      rows.push({ key, title: r.title, kind: "new_row", then: null, now: r.verdict, thenFigure: null, nowFigure: null, deciderChanged: false, unchecked: uncheckedOf(null, r.verdict), direction: null, wordsOnly });
      continue;
    }
    if (s && !r) {
      rows.push({ key, title: s.title, kind: "gone_row", then: s.verdict, now: null, thenFigure: null, nowFigure: null, deciderChanged: false, unchecked: uncheckedOf(s.verdict, null), direction: null, wordsOnly });
      continue;
    }
    if (!s || !r) continue;
    const rowWordsOnly = wordsOnly || !s.decided;
    const nowPiece = decidingPiece(r);
    const thenFig = !rowWordsOnly && s.decided ? thenFigureOf(s, r.omSays.text) : null;
    const nowFig = !rowWordsOnly && nowPiece ? nowFigureOf(r, nowPiece) : null;
    const samePiece =
      !!thenFig && !!nowFig && !!s.evidence && !!nowPiece &&
      s.evidence.kind === nowPiece.kind &&
      s.evidence.label === nowPiece.label &&
      s.evidence.publisher === nowPiece.publisher &&
      (s.per ?? null) === perOf(r, nowPiece);
    const deciderChanged = !!thenFig && !!nowFig && !samePiece;
    const verdictMoved = s.verdict !== r.verdict;

    let kind: DriftKind = "same";
    if (verdictMoved) kind = "moved";
    else if (deciderChanged) kind = "decider_changed";
    else if (samePiece && s.evidence && nowPiece) {
      const a = periodKey(s.evidence.asOf);
      const b = periodKey(nowPiece.asOf);
      const sameFigure = Math.abs(s.evidence.value - (nowPiece.value as number)) <= SAME_FIGURE;
      if (a && b && b > a) kind = "newer_figure";
      else if (isoDayOf(s.evidence.asOf) !== isoDayOf(nowPiece.asOf) || !sameFigure) kind = "revised";
    }

    rows.push({
      key,
      title: r.title,
      kind,
      then: s.verdict,
      now: r.verdict,
      // Two different pieces are never drawn as one figure moving: the row
      // says the decider changed, and names each, but sets no arrow between
      // their figures (the view's rule).
      thenFigure: thenFig,
      nowFigure: nowFig,
      deciderChanged,
      unchecked: uncheckedOf(s.verdict, r.verdict),
      direction: directionOf(s.verdict, r.verdict),
      wordsOnly: rowWordsOnly,
    });
  }
  rows.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.direction === "worse" ? 0 : 1) - (b.direction === "worse" ? 0 : 1));

  const counts: StressDrift["counts"] = { moved: 0, newer_figure: 0, revised: 0, decider_changed: 0, new_row: 0, gone_row: 0 };
  for (const r of rows) if (r.kind !== "same") counts[r.kind]++;

  const h = liveHeadline(today);
  const was = atCall.headline;
  let headline: StressDriftHeadline | null = null;
  if (h && was && was.evidence != null) {
    const measure = h.measure === "yield_on_cost" ? "yield_on_cost" : "levered_irr";
    const now = measure === "yield_on_cost" ? h.evidenceYocPct : h.evidenceIrrPct;
    if (measure === was.measure && typeof now === "number" && Number.isFinite(now)) headline = { measure, then: was.evidence, now };
  }
  // The headline moved where its one-place figure did, the way it is printed.
  const headlineMoved = !!headline && headline.then.toFixed(1) !== headline.now.toFixed(1);

  return {
    calledOn: opts.calledOn ?? null,
    rows,
    counts,
    headline,
    wordsOnly,
    changed: rows.some((r) => r.kind !== "same") || headlineMoved,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The line beside the heading: "2 rows moved, 1 newer figure" — what moved,
 *  most telling first; "" where nothing did. */
export function driftSummary(d: StressDrift): string {
  const c = d.counts;
  return [
    c.moved ? plural(c.moved, "row moved", "rows moved") : "",
    c.decider_changed ? plural(c.decider_changed, "decider changed", "deciders changed") : "",
    c.newer_figure ? plural(c.newer_figure, "newer figure", "newer figures") : "",
    c.revised ? plural(c.revised, "figure revised", "figures revised") : "",
    c.new_row ? plural(c.new_row, "row new", "rows new") : "",
    c.gone_row ? plural(c.gone_row, "row not read today", "rows not read today") : "",
    d.headline && d.headline.then.toFixed(1) !== d.headline.now.toFixed(1) ? "the evidence's case moved" : "",
  ]
    .filter(Boolean)
    .join(", ");
}
