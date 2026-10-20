// The stress test, said in words for the documents and the verdict
// (2026-10-19, the refocus): the memo's block after its verdict box, the
// report's "The stress test" page and the verdict brief's section each read
// ONE set of sentences off a StressTest (lib/stress-test), so no document
// can say a row differently from another. Pure, no I/O; imports only the
// types, the dollar writer and STRESS_KEYS.
//
// Rules: a figure is written in the assumption's own unit, the one the
// reader struck it in; the evidence a row is read against is the one its
// impact swapped in (else the first that carries a figure); the return's
// move is the engine's own — two runs of the model with one input swapped
// — and where the model already runs at the evidence's figure the move is
// said as none, never as a move; an arrow is spelled "to", since the
// documents print in standard Helvetica (WinAnsi only).

import { compactUsd } from "@/lib/money";
import {
  STRESS_KEYS,
  type StressEvidence,
  type StressImpact,
  type StressKey,
  type StressRow,
  type StressTest,
  type StressVerdict,
} from "@/lib/stress-test-types";

/** The verdict words, as every document prints them. */
export const VERDICT_WORD: Record<StressVerdict, string> = {
  holds: "holds",
  stretched: "stretched",
  unsupported: "unsupported",
  unchecked: "unchecked",
};

/** The rows a document leads with: unsupported first, then stretched, in
 *  the test's own order within each; at most `max`. */
export function leadRows(test: StressTest, max = 4): StressRow[] {
  const rank: Record<StressVerdict, number> = { unsupported: 0, stretched: 1, holds: 2, unchecked: 3 };
  return test.rows
    .filter((r) => r.verdict === "unsupported" || r.verdict === "stretched")
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank[a.r.verdict] - rank[b.r.verdict] || a.i - b.i)
    .slice(0, max)
    .map((x) => x.r);
}

/** How many rows read each way. */
export function verdictCounts(test: StressTest): Record<StressVerdict, number> {
  const counts: Record<StressVerdict, number> = { holds: 0, stretched: 0, unsupported: 0, unchecked: 0 };
  for (const r of test.rows) counts[r.verdict]++;
  return counts;
}

/**
 * The read line over the rows: "9 of the memorandum's assumptions read in
 * code — 4 tested (1 unsupported, 2 stretched, 1 holds), 5 unchecked; the
 * levered return re-run with one input swapped for the evidence's." An
 * unchecked row was read and not tested, so it is never counted among the
 * tested. Where no return was re-run, why.
 */
export function stressReadLine(test: StressTest): string {
  const c = verdictCounts(test);
  const n = test.rows.length;
  const tested = n - c.unchecked;
  const parts = [
    c.unsupported ? `${c.unsupported} unsupported` : "",
    c.stretched ? `${c.stretched} stretched` : "",
    c.holds ? `${c.holds} ${c.holds === 1 ? "holds" : "hold"}` : "",
  ].filter(Boolean);
  const testedPart = tested > 0 ? `${tested} tested (${parts.join(", ")})` : "none tested";
  const head =
    n === 0
      ? "No assumption of the memorandum's could be tested in code."
      : `${n} of the memorandum's assumptions read in code — ${testedPart}${c.unchecked ? `, ${c.unchecked} unchecked` : ""}`;
  // The withheld reason is a whole sentence that already says no return is
  // re-run (lib/stress-test), printed as it stands.
  const tail = test.impactsWithheld
    ? `${head.endsWith(".") ? "" : "."} ${test.impactsWithheld}`
    : n === 0
      ? ""
      : "; the levered return re-run with one input swapped for the evidence's, in code.";
  return `${head}${tail}`;
}

/** The evidence a row is read against: the one its impact swapped in, else
 *  the first that carries a figure, else the first; null with none. */
export function bestEvidence(row: StressRow): StressEvidence | null {
  if (row.impact && row.evidence[row.impact.evidenceIndex]) return row.evidence[row.impact.evidenceIndex];
  return row.evidence.find((e) => e.value != null) ?? row.evidence[0] ?? null;
}

const pct1 = (n: number) => `${n.toFixed(1)}%`;
const pct2 = (n: number) => `${n.toFixed(2)}%`;
const money = (n: number) => compactUsd(n, { millions: 2, trim: true });

/**
 * A figure in the row's own unit: a vacancy or a growth rate to one place
 * (a growth rate a year), a cap or a rate to two, a dollar figure compact,
 * a basis as the reader wrote it (its noun is the memorandum's own), a
 * premium a month.
 */
export function figureText(key: StressKey, value: number | null, rowText?: string): string {
  if (value == null || !Number.isFinite(value)) return "not stated";
  switch (key) {
    case "vacancy":
      return pct1(value);
    case "rent_growth":
    case "expense_growth":
      return `${pct1(value)}/yr`;
    case "exit_cap":
    case "debt":
      return pct2(value);
    case "noi":
    case "taxes":
    case "insurance":
      return money(value);
    case "basis": {
      // The reader writes the OM's basis first in its text ("$274k/unit …");
      // the noun is the memorandum's, so the figure keeps it.
      const noun = rowText?.match(/^\$[\d.,]+[kMB]?\/(\S+)/)?.[1];
      return `${money(value)}${noun ? `/${noun}` : ""}`;
    }
    case "renovation_premium":
      return `$${Math.round(value).toLocaleString("en-US")}/mo`;
    default:
      return String(value);
  }
}

/** An ISO day in words ("May 31, 2026"); any other stated period as it
 *  stands ("Q2 2026"); "undated" with none. */
export function whenWords(asOf: string | null | undefined): string {
  const s = (asOf ?? "").trim();
  if (!s) return "undated";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(`${s}T00:00:00Z`);
    if (Number.isFinite(t)) return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  return s;
}

/** "9.1% (the deal's rent roll, May 31, 2026)" — the evidence's figure in
 *  the row's unit with its publisher and date; its own words where it
 *  carries no figure. */
export function evidenceShort(row: StressRow, e: StressEvidence | null): string {
  if (!e) return "no evidence with a figure";
  // The evidence's figure wears the OM's own noun (a basis "/unit"): the
  // reader struck both on one track.
  const figure = e.value != null ? figureText(row.key, e.value, row.omSays.text) : e.text;
  // A published figure with no date is said undated; the deal's own
  // document, the memorandum's own figure and a rule of thumb carry a date
  // only where one is stated.
  const when = e.asOf ? `, ${whenWords(e.asOf)}` : e.kind === "published" ? ", undated" : "";
  return `${figure} (${e.publisher}${when})`;
}

/** "6.0% (p. 8)" — the OM's figure in the row's unit with its page. */
export function omShort(row: StressRow): string {
  const figure = figureText(row.key, row.omSays.value, row.omSays.text);
  return row.omSays.page != null ? `${figure} (p. ${row.omSays.page})` : figure;
}

/** The gap's magnitude in its unit: "3.1 pts", "20 bps", "5.1%", "$174k". */
export function gapShort(row: StressRow): string {
  const g = row.gap;
  if (!g) return "";
  const v = Math.abs(g.value);
  switch (g.unit) {
    case "pts":
      return `${v.toFixed(1)} pts`;
    case "bps":
      return `${Math.round(v)} bps`;
    case "pct":
      return `${v.toFixed(1)}%`;
    case "usd":
      return money(v);
  }
}

const irrText = (n: number | null): string => (n == null || !Number.isFinite(n) ? "does not solve" : pct1(n));

/**
 * The return's move, the engine's own: "IRR 9.3% to 7.1%"; where the model
 * already runs at the evidence's figure, "IRR 9.3%, already run at the
 * evidence"; "" with no impact.
 */
export function moveShort(impact: StressImpact | null): string {
  if (!impact) return "";
  if (impact.baseIrrPct == null && impact.altIrrPct == null) return "IRR does not solve either way";
  const same = Math.abs(impact.altValue - impact.omValue) < 1e-9;
  if (same) return `IRR ${irrText(impact.baseIrrPct)}, already run at the evidence`;
  return `IRR ${irrText(impact.baseIrrPct)} to ${irrText(impact.altIrrPct)}`;
}

/** Why a row prints no move, as one whole sentence that says no return is
 *  re-run: the test's reason, else the row's own. Printed as it stands. */
export function noMoveWhy(test: StressTest, row: StressRow): string {
  if (row.impact) return "";
  if (test.impactsWithheld) return test.impactsWithheld;
  if (row.key === "renovation_premium") return "No return is re-run: the premium is no model input; its worth is struck at the exit cap against a door's cost.";
  if (row.verdict === "unchecked") return "No return is re-run: no figure to swap.";
  return "No return is re-run: the model has no input for this figure.";
}

/**
 * The two ticks on one track, 0..1: the OM's figure and the evidence's,
 * padded a quarter each side so neither sits on an edge; null where the row
 * carries no two figures.
 */
export function tickPositions(row: StressRow): { om: number; evidence: number } | null {
  const e = bestEvidence(row);
  const om = row.omSays.value;
  const ev = e?.value ?? null;
  if (om == null || ev == null || !Number.isFinite(om) || !Number.isFinite(ev)) return null;
  const lo = Math.min(om, ev);
  const hi = Math.max(om, ev);
  const span = hi - lo;
  const pos = (x: number) => (span > 0 ? 0.25 + (0.5 * (x - lo)) / span : 0.5);
  return { om: pos(om), evidence: pos(ev) };
}

/** One row as a document prints it in short: the five cells and the ticks. */
export interface StressRowWords {
  key: StressKey;
  title: string;
  verdict: StressVerdict;
  /** "6.0% (p. 8)" */
  om: string;
  /** "9.1% (the deal's rent roll, May 31, 2026)" */
  against: string;
  /** "3.1 pts" */
  gap: string;
  /** "IRR 9.3% to 7.1%", or "" */
  move: string;
  ticks: { om: number; evidence: number } | null;
}

export function rowWords(row: StressRow): StressRowWords {
  return {
    key: row.key,
    title: row.title,
    verdict: row.verdict,
    om: omShort(row),
    against: evidenceShort(row, bestEvidence(row)),
    gap: gapShort(row),
    move: moveShort(row.impact),
    ticks: tickPositions(row),
  };
}

/** The rows in STRESS_KEYS' order, as the test holds them. */
export const KEY_ORDER: readonly StressKey[] = STRESS_KEYS;
