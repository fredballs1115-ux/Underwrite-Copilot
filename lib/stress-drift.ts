// The stress test "since the call" (2026-10-28) — display only. The verdict
// keeps the stress test as it stood at the call (lib/stress-snapshot, in the
// verdict's jsonb); the deal page builds today's from today's evidence, the
// way the call's was built (lib/stress-at-call `stressTestAtCall`: no
// lender's quote and none of the reader's past screens, which the verdict's
// brief is never handed). A buyer asking whether the screen was right wants
// to see what has moved since: a row whose verdict word changed, a deciding
// figure that is newer (the same piece, a later period), and the headline's
// evidence case then against now. This reads the two and says it; it
// changes nothing. Pure.
//
// Its rules:
//   - a snapshot struck under other rules than today's (its `rules` stamp,
//     lib/stress-test-types `STRESS_RULES_V`, absent on one kept before the
//     stamp) is compared to nothing: the method changed, so a move would be
//     the method's, not the evidence's (`methodChanged`);
//   - the call's results behind a re-screen that failed, stalled or is
//     running (lib/screen-run `verdictBehind`) are compared to nothing: null;
//   - a row is matched by its key (the challenger's "other" points are read
//     by no figure and are left out);
//   - a row whose OM figure is not the one the call tested says so
//     (`om_changed`), never a move: the memorandum changed, not the evidence;
//   - a verdict word that changed is a move (`moved`), whatever else did;
//   - a figure is set against a later one ONLY where both decided their row
//     and are the same piece — the same step of the row's order
//     (lib/stress-deciders `deciderStepOf`, never the label, which can carry
//     a figure) on one yardstick: a later period is `newer_figure`, the same
//     period at another figure as printed `revised`; a different piece is
//     `decider_changed`, said as the decider changing and never as a move
//     between the two figures;
//   - a row unchecked at the call or today says so (`unchecked`);
//   - a version-1 snapshot (`v`), kept before its rows said which piece
//     decided them, is read for its verdict words alone (`wordsOnly`);
//   - the headline's evidence case is set against today's only where both
//     were struck on the same measure and both solve; today's is struck with
//     today's figures, the rate's seed among them;
//   - the sample's test has nothing that postdates its screen: null.

import type { BehindWhy } from "@/lib/screen-run";
import type { StressSnapshot, StressSnapshotRow } from "@/lib/stress-snapshot";
import { deciderStepOf } from "@/lib/stress-deciders";
import { STRESS_RULES_V, type EvidenceKind, type StressEvidence, type StressKey, type StressRow, type StressTest, type StressVerdict } from "@/lib/stress-test-types";
import { evidenceFigureText, evidencePeriod, isoDayOf, liveHeadline } from "@/lib/stress-test-words";
import { compactUsd } from "@/lib/money";

export type DriftKind = "same" | "moved" | "om_changed" | "newer_figure" | "revised" | "decider_changed" | "new_row" | "gone_row";

/** The view's sentence where the rules changed since the call. */
export const METHOD_CHANGED = "The test's method changed since the call; re-screen to compare.";
/** The view's sentence on a row whose OM figure changed since the call. */
export const OM_FIGURE_CHANGED = "The OM's figure changed since the call";

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
  /** the call was struck under other rules than today's: nothing is
   *  compared, and the view says so (`METHOD_CHANGED`) */
  methodChanged: boolean;
  /** every row read, unchanged ones included, changed ones first; none
   *  where the method changed */
  rows: StressDriftRow[];
  counts: Record<Exclude<DriftKind, "same">, number>;
  /** the evidence's case then and now, where both stand on one measure */
  headline: StressDriftHeadline | null;
  /** a version-1 snapshot: verdict words alone were read */
  wordsOnly: boolean;
  /** anything to say: the method changed, a row that is not `same`, or the
   *  headline */
  changed: boolean;
}

/** How far a verdict sits from holding, for a move's direction. */
const DISTANCE: Record<Exclude<StressVerdict, "unchecked">, number> = { holds: 0, stretched: 1, unsupported: 2 };

/** The order changed rows are listed in. */
const ORDER: Record<DriftKind, number> = { moved: 0, om_changed: 1, decider_changed: 2, newer_figure: 3, revised: 4, new_row: 5, gone_row: 6, same: 7 };

const ZERO_COUNTS = (): StressDrift["counts"] => ({ moved: 0, om_changed: 0, newer_figure: 0, revised: 0, decider_changed: 0, new_row: 0, gone_row: 0 });

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

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Today's deciding piece, where the row names one. */
function decidingPiece(row: StressRow): StressEvidence | null {
  if (row.verdict === "unchecked" || row.decidedBy == null) return null;
  const e = row.evidence[row.decidedBy];
  return e && finite(e.value) ? e : null;
}

/** The yardstick today's piece is judged on, as the snapshot keeps it. */
const perOf = (row: StressRow, e: StressEvidence | null): string | null => e?.ownYardstick?.per ?? row.yardstick ?? null;

/** Today's OM figure on the yardstick the snapshot keeps it on
 *  (lib/stress-snapshot `stressSnapshotOf`'s own rule). */
function omNowOf(row: StressRow): { value: number | null; per: string | null } {
  const picked = row.verdict === "unchecked" ? null : row.decidedBy != null ? row.evidence[row.decidedBy] : row.impact ? row.evidence[row.impact.evidenceIndex] : row.evidence.find((e) => e.value != null);
  const own = picked && finite(picked.value) && picked.ownYardstick && finite(picked.ownYardstick.om) ? picked.ownYardstick : null;
  return own ? { value: own.om, per: own.per } : { value: finite(row.omSays.value) ? row.omSays.value : null, per: row.yardstick ?? null };
}

/** Whether the OM's figure, as printed, is the one the call tested. */
function omChanged(s: StressSnapshotRow, r: StressRow): boolean {
  const now = omNowOf(r);
  if (s.om == null && now.value == null) return false;
  if (s.om == null || now.value == null) return true;
  return figureOn(s.key, s.om, s.per, r.omSays.text) !== figureOn(r.key, now.value, now.per, r.omSays.text);
}

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

/** Whether the piece that decided at the call is the one deciding today:
 *  the same step of the row's order, on one yardstick. A piece no step
 *  names (a challenger's own) is matched by its kind, label and publisher. */
function samePieceOf(key: StressKey, then: StressSnapshotRow, now: StressRow, piece: StressEvidence): boolean {
  const e = then.evidence;
  if (!e) return false;
  if ((then.per ?? null) !== perOf(now, piece)) return false;
  const a = deciderStepOf(key, e);
  const b = deciderStepOf(key, piece);
  if (a != null && b != null) return a === b;
  return e.kind === piece.kind && e.label === piece.label && e.publisher === piece.publisher;
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

/** The one-place figure a headline prints, compared as printed. */
const headlineMovedOf = (h: StressDriftHeadline | null): boolean => !!h && h.then.toFixed(1) !== h.now.toFixed(1);

/**
 * What moved in the stress test since the call: the verdict's snapshot
 * (`atCall`, read through lib/stress-snapshot `readStressSnapshot`) against
 * the test built today the way the call's was (lib/stress-at-call
 * `stressTestAtCall`). Null with no snapshot, no test today, on the sample,
 * or where the call's results are behind a re-screen (`behind`, lib/screen-run
 * `verdictBehind`). `calledOn` is the call's day in words (lib/screen-run
 * `screenedOn` of the verdict's `generatedAt`).
 */
export function stressDrift(
  atCall: StressSnapshot | null | undefined,
  today: StressTest | null | undefined,
  opts: { calledOn?: string | null; sample?: boolean; behind?: BehindWhy | null } = {},
): StressDrift | null {
  if (!atCall || !today || today.rows.length === 0 || atCall.rows.length === 0) return null;
  if (opts.sample || today.sample) return null;
  if (opts.behind) return null;
  const calledOn = opts.calledOn ?? null;
  const wordsOnly = atCall.v < 2;

  // Struck under other rules: a move would be the method's, so none is drawn.
  if (atCall.rules !== STRESS_RULES_V) {
    return { calledOn, methodChanged: true, rows: [], counts: ZERO_COUNTS(), headline: null, wordsOnly, changed: true };
  }

  const firstByKey = <T extends { key: StressKey }>(rows: readonly T[]): Map<StressKey, T> => {
    const m = new Map<StressKey, T>();
    for (const r of rows) if (r.key !== "other" && !m.has(r.key)) m.set(r.key, r);
    return m;
  };
  const thenRows = firstByKey(atCall.rows);
  const nowRows = firstByKey(today.rows);

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
    // The memorandum's figure is not the one the call tested: said so, and
    // nothing of the row is read as a move.
    if (omChanged(s, r)) {
      rows.push({ key, title: r.title, kind: "om_changed", then: s.verdict, now: r.verdict, thenFigure: null, nowFigure: null, deciderChanged: false, unchecked: uncheckedOf(s.verdict, r.verdict), direction: null, wordsOnly });
      continue;
    }
    const rowWordsOnly = wordsOnly || !s.decided;
    const nowPiece = decidingPiece(r);
    const thenFig = !rowWordsOnly ? thenFigureOf(s, r.omSays.text) : null;
    const nowFig = !rowWordsOnly && nowPiece ? nowFigureOf(r, nowPiece) : null;
    const samePiece = !!thenFig && !!nowFig && !!nowPiece && samePieceOf(key, s, r, nowPiece);
    const deciderChanged = !!thenFig && !!nowFig && !samePiece;

    let kind: DriftKind = "same";
    if (s.verdict !== r.verdict) kind = "moved";
    else if (deciderChanged) kind = "decider_changed";
    else if (samePiece && thenFig && nowFig && s.evidence && nowPiece) {
      const a = periodKey(s.evidence.asOf);
      const b = periodKey(nowPiece.asOf);
      if (a && b && b > a) kind = "newer_figure";
      // The same period: revised only where the figure as printed moved.
      else if (thenFig.text !== nowFig.text) kind = "revised";
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

  const counts = ZERO_COUNTS();
  for (const r of rows) if (r.kind !== "same") counts[r.kind]++;

  const h = liveHeadline(today);
  const was = atCall.headline;
  let headline: StressDriftHeadline | null = null;
  if (h && was && was.evidence != null) {
    const measure = h.measure === "yield_on_cost" ? "yield_on_cost" : "levered_irr";
    const now = measure === "yield_on_cost" ? h.evidenceYocPct : h.evidenceIrrPct;
    if (measure === was.measure && finite(now)) headline = { measure, then: was.evidence, now };
  }

  return {
    calledOn,
    methodChanged: false,
    rows,
    counts,
    headline,
    wordsOnly,
    changed: rows.some((r) => r.kind !== "same") || headlineMovedOf(headline),
  };
}

/** Whether the headline's evidence case moved, as printed. */
export function driftHeadlineMoved(d: StressDrift): boolean {
  return headlineMovedOf(d.headline);
}

/** Names that keep their capital mid-sentence: a publisher's, an index's. */
const PROPER_LEAD = /^(?:Zillow|Census|Realtor|Freddie|Fannie|Moody|HUD|BLS|FRED|CPI|PPI|SOFR|NCREIF|CoStar|Treasury)\b/;

/** A piece's label inside a sentence: its first word lowered where it is a
 *  common word ("The deal's T-12 NOI" → "the deal's T-12 NOI", "Rental
 *  vacancy, metro area" → "rental vacancy, metro area"), a proper name or an
 *  acronym kept ("Zillow's …", "CPI rent", "T-12 NOI"). */
export function labelInSentence(label: string): string {
  if (PROPER_LEAD.test(label)) return label;
  const first = label.match(/^[A-Z][a-z'’]*(?![A-Za-z0-9-])/)?.[0];
  return first ? `${first.toLowerCase()}${label.slice(first.length)}` : label;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The line beside the heading: "2 rows moved, 1 newer figure" — what moved,
 *  most telling first; "" where nothing did, and where the method changed
 *  (the view says that in a sentence of its own). */
export function driftSummary(d: StressDrift): string {
  if (d.methodChanged) return "";
  const c = d.counts;
  return [
    c.moved ? plural(c.moved, "row moved", "rows moved") : "",
    c.om_changed ? plural(c.om_changed, "OM figure changed", "OM figures changed") : "",
    c.decider_changed ? plural(c.decider_changed, "decider changed", "deciders changed") : "",
    c.newer_figure ? plural(c.newer_figure, "newer figure", "newer figures") : "",
    c.revised ? plural(c.revised, "figure revised", "figures revised") : "",
    c.new_row ? plural(c.new_row, "row new", "rows new") : "",
    c.gone_row ? plural(c.gone_row, "row not read today", "rows not read today") : "",
    // Today's case is struck with today's figures, the rate's seed among
    // them, so it can move with no row's verdict moving.
    driftHeadlineMoved(d) ? "the evidence's case moved with today's figures" : "",
  ]
    .filter(Boolean)
    .join(", ");
}
