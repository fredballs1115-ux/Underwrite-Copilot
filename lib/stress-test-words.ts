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
  type StressHeadline,
  type StressHeadlinePart,
  type StressImpact,
  type StressKept,
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
      : test.measure === "yield_on_cost"
        ? "; the plan's yield on total cost re-run with one figure swapped for the evidence's, in code."
        : "; the levered return re-run with one input swapped for the evidence's, in code.";
  return `${head}${tail}`;
}

/** Whether a re-run measures a plan deal's yield on total cost. */
export const isYieldImpact = (impact: StressImpact | null | undefined): boolean => impact?.measure === "yield_on_cost";

/** Whether a headline is a plan deal's yield on total cost. */
export const isYieldHeadline = (h: StressHeadline | null | undefined): boolean => h?.measure === "yield_on_cost";

/** What a headline's two cases and its parts are measured in, as a surface
 *  names it: "Levered IRR" or "Yield on cost". */
export function measureName(h: StressHeadline | null | undefined): string {
  return isYieldHeadline(h) ? "Yield on cost" : "Levered IRR";
}

/** A headline's two cases in percent, in its own measure: the levered IRRs,
 *  or a plan deal's yields on total cost. */
export function headlineCases(h: StressHeadline): { om: number | null; evidence: number | null } {
  return isYieldHeadline(h) ? { om: h.omYocPct ?? null, evidence: h.evidenceYocPct ?? null } : { om: h.omIrrPct, evidence: h.evidenceIrrPct };
}

/** The places a headline's figures print at: a levered IRR at one, a yield
 *  on cost at two (lib/plan-facts `pctText`, the precision every surface
 *  prints a yield on cost at). */
export const headlinePlaces = (h: StressHeadline | null | undefined): 1 | 2 => (isYieldHeadline(h) ? 2 : 1);

/** The evidence a row is read against: the one figure that decided it
 *  (`decidedBy`), else the one its impact swapped in, else the first that
 *  carries a figure, else the first; null with none. */
export function bestEvidence(row: StressRow): StressEvidence | null {
  if (row.decidedBy != null && row.evidence[row.decidedBy]) return row.evidence[row.decidedBy];
  if (row.impact && row.evidence[row.impact.evidenceIndex]) return row.evidence[row.impact.evidenceIndex];
  return row.evidence.find((e) => e.value != null) ?? row.evidence[0] ?? null;
}

/** The tag on the piece that decided a row (lib/stress-deciders' rule: ONE
 *  figure decides), and on every other piece of a row a figure decided. */
export const DECIDES_TAG = "Decides";
export const BESIDE_TAG = "Beside it, not deciding";

/** "Decides" on the piece a row was decided on, "Beside it, not deciding"
 *  on every other; null on a row nothing decided (unchecked) or one built
 *  before the rule. */
export function decidesTag(row: StressRow, index: number): string | null {
  if (row.decidedBy == null || row.verdict === "unchecked") return null;
  return index === row.decidedBy ? DECIDES_TAG : BESIDE_TAG;
}

/** A percent at one or two places, a negative with the minus sign (U+2212),
 *  and none on a figure that rounds to nothing. */
const signedPct = (n: number, places: number): string => {
  const t = n.toFixed(places);
  return Number(t) < 0 ? `\u2212${t.slice(1)}%` : `${t.replace(/^-/, "")}%`;
};
const pct1 = (n: number) => signedPct(n, 1);
const pct2 = (n: number) => signedPct(n, 2);
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
  if (isYieldImpact(impact)) {
    const yoc = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "not struck" : pct2(n));
    if (Math.abs(impact.altValue - impact.omValue) < 0.5) return `Yield on cost ${yoc(impact.baseYocPct)}, already at the evidence`;
    return `Yield on cost ${yoc(impact.baseYocPct)} to ${yoc(impact.altYocPct)}`;
  }
  if (impact.baseIrrPct == null && impact.altIrrPct == null) return "IRR does not solve either way";
  const same = Math.abs(impact.altValue - impact.omValue) < 1e-9;
  if (same) return `IRR ${irrText(impact.baseIrrPct)}, already run at the evidence`;
  return `IRR ${irrText(impact.baseIrrPct)} to ${irrText(impact.altIrrPct)}`;
}

/** What a row that holds prints in its re-run's place. Its re-run at the
 *  evidence's figure is the favourable side (an office rent growth holding at
 *  +7.2% re-runs to 24.7%), which no surface draws as a return; the impact
 *  stays on the row for the headline's cases. */
export const HOLDS_NO_RERUN = "The OM's figure is within the evidence; no re-run.";

/** Whether a surface draws the row's re-run as a return: a row that holds
 *  draws none (`HOLDS_NO_RERUN`), an unchecked row's re-run (the insurance
 *  line at the seller's own premium) is said in its note alone, and a row
 *  with no impact has none to draw. */
export const drawsRerun = (row: StressRow): boolean => row.impact != null && row.verdict !== "holds" && row.verdict !== "unchecked";

/**
 * The row's return in one line, for the report and the verdict's brief: the
 * re-run's own note (after `lead`, where the surface names the re-run's base)
 * where the row draws one; `HOLDS_NO_RERUN` on a row that holds; else why no
 * return is re-run.
 */
export function rowMoveText(test: StressTest, row: StressRow, lead?: string): string {
  if (row.verdict === "holds") return HOLDS_NO_RERUN;
  if (row.impact) return lead ? `${lead}. ${row.impact.note}` : row.impact.note;
  return noMoveWhy(test, row);
}

/** Why a row prints no move, as one whole sentence that says no return is
 *  re-run: the test's reason, else the row's own. Printed as it stands. */
export function noMoveWhy(test: StressTest, row: StressRow): string {
  if (row.impact) return "";
  if (row.noRerun) return row.noRerun;
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
  // An unchecked row was set against nothing: no two ticks on one track.
  if (row.verdict === "unchecked") return null;
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
    move: row.verdict === "holds" ? "no re-run" : moveShort(row.impact),
    ticks: tickPositions(row),
  };
}

// ── The headline: the OM's case against the evidence's ───────────────────

/** Each assumption named mid-sentence in the headline's split. */
const HEADLINE_NAME: Record<StressKey, string> = {
  basis: "the price",
  exit_cap: "the exit cap",
  debt: "the loan rate",
  noi: "the NOI",
  vacancy: "vacancy",
  rent_growth: "rent growth",
  expense_growth: "expense growth",
  taxes: "the taxes",
  insurance: "insurance",
  renovation_premium: "the renovation premium",
  other: "another assumption",
};

/** The headline a surface prints: none wherever the re-runs are withheld,
 *  whatever the test carries — the headline goes with them. */
export function liveHeadline(test: StressTest): StressHeadline | null {
  return test.impactsWithheld ? null : (test.headline ?? null);
}

/** An assumption as the headline names it mid-sentence: "the exit cap". */
export function headlineName(key: StressKey): string {
  return HEADLINE_NAME[key];
}

/** A part's move in levered-IRR points, signed with a true minus: "+3.7
 *  pts", "−1.4 pts"; "0.0 pts" where it rounds to nothing. */
export function ptsText(n: number, places: 1 | 2 = 1): string {
  const f = 10 ** places;
  const r = Math.round(n * f) / f;
  if (r === 0) return `${(0).toFixed(places)} pts`;
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(places)} pts`;
}

/** How a part struck against a rule of thumb alone is marked, on every
 *  surface: the loan rate's against the class's screening default, any
 *  other's against a rule of thumb. Null on a part that was not. */
export function partAgainst(part: Pick<StressHeadlinePart, "key" | "ruleOfThumb">): string | null {
  if (!part.ruleOfThumb) return null;
  return part.key === "debt" ? "against a screening default" : "against a rule of thumb";
}

/** A part as the headline prints it: its Shapley share, and `shown`, the
 *  share in tenths of a point as printed. */
export type ShownPart = StressHeadlinePart & { shown: number };

/**
 * The headline's figures as every surface prints them, so the printed parts
 * add up to the printed gap: each case's levered IRR at one place, the gap
 * taken from those two rounded figures (13.1% to 3.6% is a 9.5-point gap,
 * never the 9.6 the unrounded figures make), and each part rounded to tenths
 * by largest remainder so the parts sum to that gap to the tenth. Null
 * figures where a case's IRR does not solve; then no part is shown.
 */
export function shownHeadline(h: StressHeadline): { om: number | null; evidence: number | null; gap: number | null; parts: ShownPart[] } {
  // A levered IRR prints at one place, a plan's yield on cost at two: the
  // parts are rounded to the same place, so they add up to the printed gap.
  const places = headlinePlaces(h);
  const f = 10 ** places;
  const one = (n: number | null) => (n == null || !Number.isFinite(n) ? null : Number(n.toFixed(places)));
  const cases = headlineCases(h);
  const om = one(cases.om);
  const evidence = one(cases.evidence);
  if (om == null || evidence == null) return { om, evidence, gap: null, parts: [] };
  // In the printed place's units: the printed gap, and each part's floor
  // with its remainder.
  const target = Math.round((evidence - om) * f);
  const raw = h.parts.map((p) => p.pts * f);
  const tenths = raw.map((r) => Math.floor(r));
  let left = target - tenths.reduce((s, t) => s + t, 0);
  if (h.parts.length > 0) {
    // Largest remainder first where tenths are owed; smallest first where
    // they are over (a gap that rounds down past the parts' floors).
    const byRemainder = raw.map((r, i) => ({ i, rem: r - tenths[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (let k = 0; left > 0; k++, left--) tenths[byRemainder[k % byRemainder.length].i] += 1;
    for (let k = byRemainder.length - 1; left < 0; k = (k - 1 + byRemainder.length) % byRemainder.length, left++) tenths[byRemainder[k].i] -= 1;
  }
  const parts = h.parts.map((p, i) => ({ ...p, shown: tenths[i] / f }));
  return { om, evidence, gap: Math.abs(target) / f, parts };
}

/**
 * The headline's one line: "Levered IRR on the OM's figures 16.7% to 11.5%
 * with the evidence". `arrow` is "to" on paper (WinAnsi has no arrow) and
 * "→" on the page. Where nothing is past its evidence, the OM's case alone
 * and why the evidence's is the same run — said as nothing the headline
 * swaps where a row past its evidence is left out of it (the price, a
 * renovation premium). A case whose IRR does not solve is said in a clause
 * of its own, never as a figure. Null where the test carries no headline.
 */
export function headlineLine(test: StressTest, arrow = "to"): string | null {
  const h = liveHeadline(test);
  if (!h) return null;
  if (isYieldHeadline(h)) {
    // A plan deal's yield on total cost, at two places, both cases struck on
    // figures the plan states (a case with none has no headline at all).
    const s = shownHeadline(h);
    if (s.om == null || s.evidence == null) return null;
    if (h.parts.length === 0 && s.om === s.evidence) {
      return h.omitted.length > 0
        ? `Yield on cost on the OM's figures ${pct2(s.om)}, with nothing past its evidence that the headline moves, so the evidence moves nothing`
        : `Yield on cost on the OM's figures ${pct2(s.om)}; no figure the plan's yield is struck on is past its evidence, so the evidence moves nothing`;
    }
    return `Yield on cost on the OM's figures ${pct2(s.om)} ${arrow} ${pct2(s.evidence)} with the evidence`;
  }
  const om = irrText(h.omIrrPct);
  if (h.omIrrPct == null && h.evidenceIrrPct == null) return "The levered IRR does not solve on the OM's figures or with the evidence";
  if (h.evidenceIrrPct == null) return `Levered IRR on the OM's figures ${om}; with the evidence it does not solve`;
  if (h.omIrrPct == null) return `The levered IRR does not solve on the OM's figures; with the evidence it is ${irrText(h.evidenceIrrPct)}`;
  if (h.parts.length === 0 && Math.abs(h.evidenceIrrPct - h.omIrrPct) < 1e-9) {
    return h.omitted.length > 0
      ? `Levered IRR on the OM's figures ${om}, with nothing past its evidence that the headline swaps, so the evidence moves nothing`
      : `Levered IRR on the OM's figures ${om}; no figure the model takes is past its evidence, so the evidence moves nothing`;
  }
  return `Levered IRR on the OM's figures ${om} ${arrow} ${irrText(h.evidenceIrrPct)} with the evidence`;
}

/** "the price +3.7 pts, vacancy −3.2 pts and the loan rate −1.4 pts
 *  (against a screening default)", each part as printed (`shownHeadline`). */
export function headlineSplit(test: StressTest): string {
  const h = liveHeadline(test);
  if (!h) return "";
  return joinAnd(
    shownHeadline(h).parts.map((p) => {
      const against = partAgainst(p);
      return `${headlineName(p.key)} ${ptsText(p.shown, headlinePlaces(h))}${against ? ` (${against})` : ""}`;
    }),
  );
}

/** "The OM states its own yield on cost of 7.00% (Untrended yield on cost,
 *  p. 12)." — a plan deal's stated figure beside its two cases, said as the
 *  OM's; "" where it states none. */
export function statedYocSentence(h: StressHeadline): string {
  const s = isYieldHeadline(h) ? h.statedYoc : null;
  if (!s) return "";
  return `The OM states its own yield on cost of ${pct2(s.pct)} (${s.label}${s.page != null ? `, p. ${s.page}` : ""}).`;
}

/** "2 mixes of the swaps had no IRR and were counted at the engine's floor
 *  in the split." — "" where every mix solved. */
export function unsolvedSentence(h: StressHeadline): string {
  if (!(h.unsolved > 0)) return "";
  return `${h.unsolved} mix${h.unsolved === 1 ? "" : "es"} of the swaps had no IRR and ${h.unsolved === 1 ? "was" : "were"} counted at the engine's floor in the split.`;
}

const upperFirst = (t: string) => (t ? `${t[0].toUpperCase()}${t.slice(1)}` : t);

/** A component swap named before "swap": "the tax swap". */
const SWAP_NAME: Partial<Record<StressKey, string>> = { vacancy: "vacancy", taxes: "tax", insurance: "insurance" };

/**
 * What the component swaps leave of the NOI's gap where the NOI is left out
 * for them (`StressHeadline.noiRest`), one clause: "the rest of the NOI's
 * gap ($54k a year) is in neither case"; where the swaps move the year-one
 * NOI past the NOI's own gap, "the tax swap moves the year-one NOI $54k a
 * year past the NOI's own gap". "" where the headline carries none.
 */
export function noiRestClause(h: StressHeadline, test?: StressTest): string {
  const r = h.noiRest;
  if (!r) return "";
  if (r.usd > 0) return `the rest of the NOI's gap (${money(r.usd)} a year) is in neither case`;
  // With the test in hand, both figures are said: what the swaps take off
  // the year-one NOI (the NOI row's gap less the rest, `noiRest`'s own
  // arithmetic) and how much more that is than the OM's NOI sits over the
  // figure that decides its row — "the tax reset takes $224k off year-one
  // NOI, $50k more than the OM's NOI sits over the T-12".
  const said = test ? noiSwapClause(r, test) : "";
  if (said) return said;
  const names = r.components.map((k) => SWAP_NAME[k] ?? headlineName(k));
  const many = names.length > 1;
  return `the ${joinAnd(names)} swap${many ? "s" : ""} move${many ? "" : "s"} the year-one NOI ${money(-r.usd)} a year past the NOI's own gap`;
}

/** The NOI's rest past its gap, in both figures, read off the test's NOI
 *  row (the OM's NOI less the figure that decides it) and `noiRest`; "" where
 *  the row's figures are not there to read. A tax swap struck on a reset
 *  bill is "the tax reset". */
function noiSwapClause(r: NonNullable<StressHeadline["noiRest"]>, test: StressTest): string {
  const noi = test.rows.find((x) => x.key === "noi");
  const at = noi ? (noi.decidedBy ?? noi.impact?.evidenceIndex ?? null) : null;
  const best = noi && at != null ? noi.evidence[at] : null;
  if (!noi || noi.omSays.value == null || !best || best.value == null) return "";
  const gap = noi.omSays.value - best.value;
  const moved = gap - r.usd;
  if (!(gap > 0) || !(moved > 0)) return "";
  const resetBill = (k: StressKey) => {
    const row = test.rows.find((x) => x.key === k);
    const d = row ? (row.decidedBy ?? row.impact?.evidenceIndex ?? null) : null;
    const e = row && d != null ? row.evidence[d] : null;
    return !!e && /\breset/i.test(`${e.label} ${e.text}`);
  };
  const names = r.components.map((k) => (k === "taxes" && resetBill(k) ? "the tax reset" : `the ${SWAP_NAME[k] ?? headlineName(k)} swap`));
  const against = best.publisher.startsWith("the deal's ") ? `the ${best.publisher.slice("the deal's ".length)}` : /^the /i.test(best.publisher) ? best.publisher : "its evidence";
  return `${joinAnd(names)} take${names.length > 1 ? "" : "s"} ${money(moved)} off year-one NOI, ${money(-r.usd)} more than the OM's NOI sits over ${against}`;
}

/**
 * What the headline does not test, where the deal's main risks are unchecked
 * (`StressHeadline.untested`), one sentence: "This headline does not test
 * the price, the NOI or the 57% of the listed rent rolling in the year to
 * Oct 2028." "" where it names nothing, or carries no headline.
 */
export function untestedSentence(h: StressHeadline): string {
  const u = h.untested;
  if (!u) return "";
  const items = u.keys.map(headlineName);
  if (u.roll) items.push(`the ${Math.round(u.roll.sharePct)}% of the listed ${u.roll.basis} rolling in the year to ${u.roll.through}`);
  if (items.length === 0) return "";
  const said = items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
  return `This headline does not test ${said}.`;
}

/** `noiRestClause` as a sentence; "" with none. */
export function noiRestSentence(h: StressHeadline, test?: StressTest): string {
  const c = noiRestClause(h, test);
  return c ? `${upperFirst(c)}.` : "";
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The headline in one short clause, for the one-page memo, which has no
 * line to spare (measured on the sample: the line alone fits beside the
 * read line, the split does not): "Levered IRR on the OM's figures 16.7%
 * to 11.5% with the evidence; the report splits the gap by assumption."
 * The report prints `headlineSentence`, the split and what is left out
 * with why. Null with no headline.
 */
export function headlineShort(test: StressTest, withModel = true): string | null {
  const h = liveHeadline(test);
  if (!h) return null;
  const model = withModel ? modelClause(h) : "";
  return `${headlineLine(test)!}${model ? ` (${model})` : ""}${h.parts.length > 0 ? "; the report splits the gap by assumption." : "."}`;
}

// ── The model as it runs: the base every re-run starts from ─────────────

/** "the screening model as it runs: 9.3%" — the derived model's own
 *  levered IRR, every input its own, as the headline carries it, named as
 *  the screening model (lib/screening-model-words) where a surface first
 *  meets it; "" on a headline struck before it was carried. */
export function modelClause(h: StressHeadline): string {
  if (h.modelIrrPct === undefined) return "";
  return h.modelIrrPct == null ? "the screening model as it runs: its levered IRR does not solve" : `the screening model as it runs: ${irrText(h.modelIrrPct)}`;
}

/** The model's own levered IRR where the test's headline carries it: a
 *  figure, null where it does not solve, undefined where it is not carried. */
export function modelIrrOf(test: StressTest): number | null | undefined {
  const h = liveHeadline(test);
  return h ? h.modelIrrPct : undefined;
}

/**
 * What a row's re-run is, in the words every surface prints beside it: "from
 * the model's own 9.3% levered IRR, this input alone set to the OM's figure,
 * then to the evidence's" — each run the model as it runs with ONE input
 * changed, never the OM's case. The figure is named as a levered IRR, so it
 * never reads as a vacancy beside a rent roll's. Where the OM's figure is the
 * evidence's, the two runs are one, said so. Without the model's figure,
 * "from the model as it runs".
 */
export function rerunWords(test: StressTest, impact?: StressImpact | null): string {
  // A plan deal's re-run starts from the plan's own yield on cost: its
  // stated stabilized NOI over its total cost, which IS the OM's figure, so
  // only the evidence's run moves.
  if (test.measure === "yield_on_cost" || isYieldImpact(impact)) {
    const h = liveHeadline(test);
    const om = h && isYieldHeadline(h) ? h.omYocPct : (impact?.baseYocPct ?? null);
    const base = om != null && Number.isFinite(om) ? `from the plan's ${pct2(om)} yield on cost, its stabilized NOI over its total cost on the OM's own figures` : "from the plan's yield on cost on the OM's own figures";
    const same = impact != null && Math.abs(impact.altValue - impact.omValue) < 0.5;
    return same ? `${base}, where the OM's figure is the evidence's` : `${base}, one figure alone then set to the evidence's`;
  }
  const m = modelIrrOf(test);
  const base =
    m === undefined
      ? "from the model as it runs"
      : m == null
        ? "from the model as it runs (its levered IRR does not solve)"
        : `from the model's own ${irrText(m)} levered IRR`;
  const same = impact != null && Math.abs(impact.altValue - impact.omValue) < 1e-9;
  return same ? `${base}, this input alone set to the OM's figure, which is the evidence's` : `${base}, this input alone set to the OM's figure, then to the evidence's`;
}

const KEPT_LEAD: Record<StressKept["why"], string> = {
  holds: "where a row holds",
  left_out: "where a row is left out",
  same: "where the evidence is the OM's own figure",
  unchecked: "where a row is unchecked",
};

/** One kept figure with the model's beside it. The NOI row keeps the rent
 *  line that makes the OM's NOI, never the NOI itself, and is said so. */
function keptText(k: StressKept): string {
  if (k.key === "noi" && k.noi != null) {
    return `the rent line ${money(k.om)} that makes the OM's ${money(k.noi)} NOI at the OM's vacancy and expenses (the model's rent line ${money(k.model)})`;
  }
  return `${headlineName(k.key)} ${figureText(k.key, k.om)} (the model's ${figureText(k.key, k.model)})`;
}

/**
 * Why the evidence's case is not the model as it runs, whole: the rows it
 * keeps at the OM's figure where the model has another, and the rows it runs
 * at the evidence's figure where the model has another, each named with both
 * figures, read off the headline's own `keptAtOm` and `atEvidence` — "Against
 * the screening model as it runs (9.3%), the evidence's case keeps the OM's figure
 * where a row holds: vacancy 6.0% (the model's 9.1%) and rent growth 4.0%/yr
 * (the model's 3.0%/yr); and where a row is left out: the rent line $7.62M
 * that makes the OM's $3.88M NOI at the OM's vacancy and expenses (the
 * model's rent line $7.15M). It runs the evidence's figure where the model
 * runs another: the taxes $952k (the model's $728k)." Null where neither list
 * names a figure, or where the headline does not carry the model.
 */
export function keptSentence(test: StressTest): string | null {
  const h = liveHeadline(test);
  if (!h || h.modelIrrPct === undefined) return null;
  const kept = h.keptAtOm ?? [];
  const atEvidence = h.atEvidence ?? [];
  if (kept.length === 0 && atEvidence.length === 0) return null;
  const order: StressKept["why"][] = ["holds", "left_out", "same", "unchecked"];
  const clauses = order.flatMap((why) => {
    const items = kept.filter((k) => k.why === why);
    if (items.length === 0) return [];
    return [`${KEPT_LEAD[why]}: ${joinAnd(items.map(keptText))}`];
  });
  const model = h.modelIrrPct == null ? "its levered IRR does not solve" : irrText(h.modelIrrPct);
  const lead = `Against the screening model as it runs (${model}), the evidence's case`;
  const evidenceSaid = atEvidence.map((k) => `${headlineName(k.key)} ${figureText(k.key, k.evidence)} (the model's ${figureText(k.key, k.model)})`);
  const evidenceClause = evidenceSaid.length > 0 ? `the evidence's figure where the model runs another: ${joinAnd(evidenceSaid)}` : "";
  if (clauses.length === 0) return `${lead} runs ${evidenceClause}.`;
  const joined = clauses.length === 1 ? clauses[0] : `${clauses.slice(0, -1).join("; ")}; and ${clauses[clauses.length - 1]}`;
  return `${lead} keeps the OM's figure ${joined}.${evidenceClause ? ` It runs ${evidenceClause}.` : ""}`;
}

/** The sentence a document prints where the headline is withheld: the
 *  test's own reason, then that the headline goes with it. */
export const HEADLINE_WITHHELD = "The headline, the OM's figures against the evidence's in one run each, is withheld for the same reason.";

/** Under the sample's panel (/demo, the homepage's walkthrough and the
 *  signed-in sample): the sample is read as stabilized, so its rows re-run
 *  the levered return, and a plan deal's re-run its yield on total cost — in
 *  the plan rule's own words (lib/stress-test `PLAN_YIELD_LEAD`;
 *  lib/sample-stress.test.ts holds the two to one another). */
export const SAMPLE_PLAN_NOTE =
  "Read as stabilized, the sample re-runs each row's levered return. A value-add, lease-up, conversion or development OM is re-run on its yield on total cost instead, where it states its stabilized NOI and total cost: the model runs today's income, not the business plan.";

/**
 * The headline in whole sentences, for the memo, the report and the
 * verdict's brief: the line with the equity multiples, the split (the
 * Shapley share of each assumption past its evidence, the parts adding up
 * to the gap), and what is left out with why. Where the re-runs are
 * withheld, the reason and that the headline goes with it. Null where the
 * test has no headline and withholds nothing (no row carries a re-run).
 */
export function headlineSentence(test: StressTest): string | null {
  const h = liveHeadline(test);
  if (!h) return test.impactsWithheld ? `${test.impactsWithheld} ${HEADLINE_WITHHELD}` : null;
  if (isYieldHeadline(h)) return yieldHeadlineSentence(test, h);
  const line = headlineLine(test)!;
  const multiples =
    h.omMultiple != null && h.evidenceMultiple != null && h.parts.length > 0 ? ` (equity multiple ${h.omMultiple.toFixed(2)}x to ${h.evidenceMultiple.toFixed(2)}x)` : "";
  // The gap as printed: from the two rounded IRRs, which the parts add up to.
  const gap = shownHeadline(h).gap;
  const split =
    h.parts.length > 1 && gap != null
      ? `: ${headlineSplit(test)}, each assumption's share of the ${gap.toFixed(1)}-point gap averaged over every order the swaps could be made in.`
      : h.parts.length === 1
        ? `: ${headlineSplit(test)}, the one assumption past its evidence that the model takes.`
        : h.omIrrPct == null || h.evidenceIrrPct == null
          ? ", so the gap is not split."
          : ".";
  const unsolved = h.unsolved > 0 ? ` ${unsolvedSentence(h)}` : "";
  // What it does not test, where the deal's main risks are unchecked.
  const untested = untestedSentence(h) ? ` ${untestedSentence(h)}` : "";
  const left = h.omitted.length > 0 ? ` Left out: ${h.omitted.map((o) => `${headlineName(o.key)} (${o.why})`).join("; ")}.` : "";
  // What the component swaps leave of the NOI's gap, where it is material.
  const rest = noiRestSentence(h, test);
  // The model as it runs, and why the evidence's case is not it.
  const kept = keptSentence(test);
  const clause = modelClause(h);
  const model = kept ? ` ${kept}` : clause ? ` ${upperFirst(clause)}.` : "";
  return `${line}${multiples}${split}${unsolved}${untested}${left}${rest ? ` ${rest}` : ""}${model}`;
}

/**
 * A plan deal's headline in whole sentences: the line, the split (each
 * assumption's Shapley share of the gap in points of yield on cost, the
 * parts adding up to the printed gap), what it does not test, what is left
 * out with why, and the OM's own stated yield on cost where it states one.
 */
function yieldHeadlineSentence(test: StressTest, h: StressHeadline): string | null {
  const line = headlineLine(test);
  if (!line) return null;
  const gap = shownHeadline(h).gap;
  const split =
    h.parts.length > 1 && gap != null
      ? `: ${headlineSplit(test)}, each assumption's share of the ${gap.toFixed(2)}-point gap averaged over every order the swaps could be made in.`
      : h.parts.length === 1
        ? `: ${headlineSplit(test)}, the one assumption past its evidence that the plan's yield is struck on.`
        : ".";
  const untested = untestedSentence(h) ? ` ${untestedSentence(h)}` : "";
  const left = h.omitted.length > 0 ? ` Left out: ${h.omitted.map((o) => `${headlineName(o.key)} (${o.why})`).join("; ")}.` : "";
  const stated = statedYocSentence(h) ? ` ${statedYocSentence(h)}` : "";
  return `${line}${split}${untested}${left}${stated}`;
}

/** The rows in STRESS_KEYS' order, as the test holds them. */
export const KEY_ORDER: readonly StressKey[] = STRESS_KEYS;
