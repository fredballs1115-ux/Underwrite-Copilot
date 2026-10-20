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
      : "; the levered return re-run with one input swapped for the evidence's, in code.";
  return `${head}${tail}`;
}

/** The evidence a row is read against: the one its impact swapped in, else
 *  the first that carries a figure, else the first; null with none. */
export function bestEvidence(row: StressRow): StressEvidence | null {
  if (row.impact && row.evidence[row.impact.evidenceIndex]) return row.evidence[row.impact.evidenceIndex];
  return row.evidence.find((e) => e.value != null) ?? row.evidence[0] ?? null;
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
export function ptsText(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return "0.0 pts";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(1)} pts`;
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
  const one = (n: number | null) => (n == null || !Number.isFinite(n) ? null : Number(n.toFixed(1)));
  const om = one(h.omIrrPct);
  const evidence = one(h.evidenceIrrPct);
  if (om == null || evidence == null) return { om, evidence, gap: null, parts: [] };
  // In tenths: the printed gap, and each part's floor with its remainder.
  const target = Math.round((evidence - om) * 10);
  const raw = h.parts.map((p) => p.pts * 10);
  const tenths = raw.map((r) => Math.floor(r));
  let left = target - tenths.reduce((s, t) => s + t, 0);
  if (h.parts.length > 0) {
    // Largest remainder first where tenths are owed; smallest first where
    // they are over (a gap that rounds down past the parts' floors).
    const byRemainder = raw.map((r, i) => ({ i, rem: r - tenths[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (let k = 0; left > 0; k++, left--) tenths[byRemainder[k % byRemainder.length].i] += 1;
    for (let k = byRemainder.length - 1; left < 0; k = (k - 1 + byRemainder.length) % byRemainder.length, left++) tenths[byRemainder[k].i] -= 1;
  }
  const parts = h.parts.map((p, i) => ({ ...p, shown: tenths[i] / 10 }));
  return { om, evidence, gap: Math.abs(target) / 10, parts };
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
      return `${headlineName(p.key)} ${ptsText(p.shown)}${against ? ` (${against})` : ""}`;
    }),
  );
}

/** "2 mixes of the swaps had no IRR and were counted at the engine's floor
 *  in the split." — "" where every mix solved. */
export function unsolvedSentence(h: StressHeadline): string {
  if (!(h.unsolved > 0)) return "";
  return `${h.unsolved} mix${h.unsolved === 1 ? "" : "es"} of the swaps had no IRR and ${h.unsolved === 1 ? "was" : "were"} counted at the engine's floor in the split.`;
}

const upperFirst = (t: string) => (t ? `${t[0].toUpperCase()}${t.slice(1)}` : t);

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

/** "the model as it runs: 9.3%" — the derived model's own levered IRR, every
 *  input its own, as the headline carries it; "" on a headline struck before
 *  it was carried. */
export function modelClause(h: StressHeadline): string {
  if (h.modelIrrPct === undefined) return "";
  return h.modelIrrPct == null ? "the model as it runs: its levered IRR does not solve" : `the model as it runs: ${irrText(h.modelIrrPct)}`;
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
 * the model as it runs (9.3%), the evidence's case keeps the OM's figure
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
  const lead = `Against the model as it runs (${model}), the evidence's case`;
  const evidenceSaid = atEvidence.map((k) => `${headlineName(k.key)} ${figureText(k.key, k.evidence)} (the model's ${figureText(k.key, k.model)})`);
  const evidenceClause = evidenceSaid.length > 0 ? `the evidence's figure where the model runs another: ${joinAnd(evidenceSaid)}` : "";
  if (clauses.length === 0) return `${lead} runs ${evidenceClause}.`;
  const joined = clauses.length === 1 ? clauses[0] : `${clauses.slice(0, -1).join("; ")}; and ${clauses[clauses.length - 1]}`;
  return `${lead} keeps the OM's figure ${joined}.${evidenceClause ? ` It runs ${evidenceClause}.` : ""}`;
}

/** The sentence a document prints where the headline is withheld: the
 *  test's own reason, then that the headline goes with it. */
export const HEADLINE_WITHHELD = "The headline, the OM's figures against the evidence's in one run each, is withheld for the same reason.";

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
  const left = h.omitted.length > 0 ? ` Left out: ${h.omitted.map((o) => `${headlineName(o.key)} (${o.why})`).join("; ")}.` : "";
  // The model as it runs, and why the evidence's case is not it.
  const kept = keptSentence(test);
  const clause = modelClause(h);
  const model = kept ? ` ${kept}` : clause ? ` ${upperFirst(clause)}.` : "";
  return `${line}${multiples}${split}${unsolved}${left}${model}`;
}

/** The rows in STRESS_KEYS' order, as the test holds them. */
export const KEY_ORDER: readonly StressKey[] = STRESS_KEYS;
