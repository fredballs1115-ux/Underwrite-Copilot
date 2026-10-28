// The stress test, said in words for the documents and the verdict
// (2026-10-19, the refocus): the memo's block after its verdict box, the
// report's "The stress test" page and the verdict brief's section each read
// ONE set of sentences off a StressTest (lib/stress-test), so no document
// can say a row differently from another. Pure, no I/O; imports only the
// types, the dollar writer, the cadence reader (lib/live-rates-core
// `periodLabel`, which holds no table) and STRESS_KEYS.
//
// Rules: a figure is written in the assumption's own unit, the one the
// reader struck it in; the evidence a row is read against is the one its
// impact swapped in (else the first that carries a figure); the return's
// move is the engine's own — two runs of the model with one input swapped
// — and where the model already runs at the evidence's figure the move is
// said as none, never as a move; an arrow is spelled "to", since the
// documents print in standard Helvetica (WinAnsi only).

import { periodLabel } from "@/lib/live-rates-core";
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

/** A piece of evidence that is a scenario struck on the OM's own figures
 *  (the tax bill at today's rate on the price, if the sale resets the
 *  assessment) rather than the OM contradicting itself: its label says so
 *  ("A scenario: …", lib/stress-deciders `RESET_BILL_LABEL`), and every
 *  surface marks it as one in its kind's place. */
export const SCENARIO_KIND_WORD = "A scenario on the OM's figures";
export const isScenarioPiece = (e: Pick<StressEvidence, "kind" | "label">): boolean => e.kind === "om_internal" && /^A scenario:/.test(e.label);
/** The kind's word for one piece, from a surface's own table of words. */
export function evidenceKindWord(e: Pick<StressEvidence, "kind" | "label">, words: Record<StressEvidence["kind"], string>): string {
  return isScenarioPiece(e) ? SCENARIO_KIND_WORD : words[e.kind];
}

/** The verdict words, as every document prints them. */
export const VERDICT_WORD: Record<StressVerdict, string> = {
  holds: "holds",
  stretched: "stretched",
  unsupported: "unsupported",
  unchecked: "unchecked",
};

/** How far a row's re-run moves its measure, in points (the levered IRR, or
 *  a plan's yield on cost); null where it carries no re-run, or one whose
 *  two runs do not both solve. Display order only: no figure is changed. */
export function moveSize(row: StressRow): number | null {
  const i = row.impact;
  if (!i) return null;
  const base = isYieldImpact(i) ? (i.baseYocPct ?? null) : i.baseIrrPct;
  const alt = isYieldImpact(i) ? (i.altYocPct ?? null) : i.altIrrPct;
  return base != null && alt != null && Number.isFinite(base) && Number.isFinite(alt) ? Math.abs(alt - base) : null;
}

/** The rows a document leads with: unsupported first, then stretched;
 *  within each, by the row's share of the headline's gap (its Shapley part,
 *  in the measure's points) — the price row, which the headline leaves out
 *  because both cases pay the ask, by its own re-run in the same points —
 *  then a row the headline leaves out for another reason by its own move,
 *  then a row with no re-run, and the test's own order between equals; at
 *  most `max`. Without a headline, by each row's own move. */
export function leadRows(test: StressTest, max = 4): StressRow[] {
  const rank: Record<StressVerdict, number> = { unsupported: 0, stretched: 1, holds: 2, unchecked: 3 };
  const h = liveHeadline(test);
  const share = new Map<StressKey, number>((h?.parts ?? []).map((p) => [p.key, Math.abs(p.pts)]));
  // The tier a row is weighed in: 0 the headline's split (and the price row
  // beside it), 1 a row the split leaves out with its own re-run, 2 none.
  const weigh = (r: StressRow): { tier: number; size: number | null } => {
    const own = moveSize(r);
    if (h && share.has(r.key)) return { tier: 0, size: share.get(r.key)! };
    if (h && r.key === "basis" && own != null) return { tier: 0, size: own };
    if (!h) return { tier: own == null ? 2 : 0, size: own };
    return { tier: own == null ? 2 : 1, size: own };
  };
  const bySize = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : b - a);
  return test.rows
    .filter((r) => r.verdict === "unsupported" || r.verdict === "stretched")
    .map((r, i) => ({ r, i, w: weigh(r) }))
    .sort((a, b) => rank[a.r.verdict] - rank[b.r.verdict] || a.w.tier - b.w.tier || bySize(a.w.size, b.w.size) || a.i - b.i)
    .slice(0, max)
    .map((x) => x.r);
}

/** How many rows read each way. */
export function verdictCounts(test: StressTest): Record<StressVerdict, number> {
  const counts: Record<StressVerdict, number> = { holds: 0, stretched: 0, unsupported: 0, unchecked: 0 };
  for (const r of test.rows) counts[r.verdict]++;
  return counts;
}

/** Whether the memorandum states the row's assumption: a figure on its OM
 *  side, or a challenge the challenger read out of it ("other"). */
export const omStatesIt = (row: StressRow): boolean => row.key === "other" || row.omSays.value != null;

/**
 * The read line over the rows: "12 assumptions read, 9 stated in the OM — 7
 * tested (2 unsupported, 3 stretched, 2 hold), 5 unchecked; the levered
 * return re-run with one input swapped for the evidence's, in code." What
 * the OM states is counted off the rows (`omStatesIt`). An unchecked row was
 * read and not tested, so it is never counted among the tested. Where no
 * return was re-run, why; where nothing is withheld and no row draws a
 * re-run, the counts alone, never a re-run the rows do not make.
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
  // What the memorandum states, counted off the rows: a row whose OM side is
  // no figure is an assumption the model still makes (its own figure, said
  // on the row), never one the OM stated. How many it leaves out is never
  // said: a row the OM states no figure for is built only where some
  // evidence is read (an expense growth row only where the CPI is), so that
  // count would move with the day's feeds — the sample's read 3 left out
  // with the figures read and 2 without — while the OM had left out no
  // fewer. The rows read are said as read; the stated count stands whatever
  // the feeds do.
  const stated = test.rows.filter(omStatesIt).length;
  const statedPart = stated === n ? (n === 1 ? "stated in the OM" : "all stated in the OM") : stated === 0 ? "none stated in the OM" : `${stated} stated in the OM`;
  const head =
    n === 0
      ? "No assumption of the memorandum's could be tested in code."
      : `${n} assumption${n === 1 ? "" : "s"} read, ${statedPart} — ${testedPart}${c.unchecked ? `, ${c.unchecked} unchecked` : ""}`;
  // The withheld reason is a whole sentence that already says no return is
  // re-run (lib/stress-test), printed as it stands. The re-run clause is
  // said only where a row draws one; with none, the line ends on its counts.
  const tail = test.impactsWithheld
    ? `${head.endsWith(".") ? "" : "."} ${test.impactsWithheld}`
    : n === 0
      ? ""
      : !test.rows.some(drawsRerun)
        ? "."
      : test.measure === "yield_on_cost"
        ? "; the plan's yield on total cost re-run with one figure swapped for the evidence's, in code."
        : "; the levered return re-run with one input swapped for the evidence's, in code.";
  return `${head}${tail}`;
}

/** What an unchecked row is called where a line counts it in a reader's
 *  words, beside the verdict word "unchecked" on its chip. */
export const UNCHECKED_COUNT_WORDS = "could not be checked";

/**
 * The counts in short, for the panel's header and the deal header's chip:
 * "9 assumptions: 1 unsupported, 2 stretched, 1 holds; 5 could not be
 * checked". `stressReadLine` is the documents' whole sentence; this is its
 * counts alone, a row that could not be checked never counted among the
 * tested.
 */
export function stressCountLine(rows: readonly StressRow[]): string {
  const n = (v: StressVerdict) => rows.filter((r) => r.verdict === v).length;
  const parts: [number, string][] = [
    [n("unsupported"), "unsupported"],
    [n("stretched"), "stretched"],
    [n("holds"), n("holds") === 1 ? "holds" : "hold"],
  ];
  const said = parts.filter(([c]) => c > 0).map(([c, w]) => `${c} ${w}`);
  const head = `${rows.length} assumption${rows.length === 1 ? "" : "s"}`;
  const notChecked = n("unchecked");
  if (said.length === 0) return `${head}: none could be checked`;
  return `${head}: ${said.join(", ")}${notChecked > 0 ? `; ${notChecked} ${UNCHECKED_COUNT_WORDS}` : ""}`;
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
/** An equity multiple at two places, a negative with the true minus. */
const multipleText = (n: number) => signedPct(n, 2).replace(/%$/, "x");
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
    case "opex":
      return money(value);
    case "basis": {
      // The reader writes the OM's basis first in its text ("$274k/unit …");
      // the noun is the memorandum's, so the figure keeps it.
      const noun = rowText?.match(/^\$[\d.,]+[kMB]?\/(\S+)/)?.[1];
      return `${money(value)}${noun ? `/${noun}` : ""}`;
    }
    case "renovation_premium":
      return `$${Math.round(value).toLocaleString("en-US")}/mo`;
    case "market_rent": {
      // The reader writes the OM's rent first on its own yardstick ("$2,600/mo
      // …", "$38.00/SF …"); without it, a figure a foot is under $200.
      const perSf = rowText ? /^\$[\d.,]+\/SF/.test(rowText) : value < 200;
      return perSf ? `$${value.toFixed(2)}/SF` : `$${Math.round(value).toLocaleString("en-US")}/mo`;
    }
    default:
      return String(value);
  }
}

/** Whether a row's figure is a growth rate a year (rent or expense growth). */
const isGrowth = (key: StressKey) => key === "rent_growth" || key === "expense_growth";

/** A piece of evidence's figure in the row's unit, as a track label prints
 *  it: a growth row's published figure is a trailing year's change, signed
 *  ("+1.1%") and never a rate a year — the OM's figure is the rate a year
 *  ("4.0%/yr", `figureText`); every other figure as `figureText` writes it. */
export function evidenceFigureText(key: StressKey, value: number | null, rowText?: string): string {
  if (value == null || !Number.isFinite(value)) return "not stated";
  if (!isGrowth(key)) return figureText(key, value, rowText);
  const t = pct1(value);
  return Number(value.toFixed(1)) > 0 ? `+${t}` : t;
}

/** A full ISO timestamp ("2026-10-12T15:04:05.123Z", a recorded-sales pull's
 *  `retrievedAt`) as its UTC day ("2026-10-12"); any other text as it
 *  stands, trimmed. A day is what every surface prints for a piece read at a
 *  moment, never the moment's raw string. */
export function isoDayOf(asOf: string | null | undefined): string {
  const s = (asOf ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(s)) {
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return s;
}

/** An ISO day in words ("May 31, 2026"), a full timestamp by its UTC day;
 *  any other stated period as it stands ("Q2 2026"); "undated" with none. A
 *  piece of evidence is dated by its own period (`evidencePeriod`), never by
 *  this alone. */
export function whenWords(asOf: string | null | undefined): string {
  const s = isoDayOf(asOf);
  if (!s) return "undated";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(`${s}T00:00:00Z`);
    if (Number.isFinite(t)) return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  return s;
}

/** The cadences a published figure's text is dated in, finest first
 *  (lib/live-rates-core `periodLabel`): a day, a month, a quarter. A year is
 *  read apart, only in brackets — "2026" alone is in most dates. */
const TEXT_CADENCES = ["daily", "monthly", "quarterly"] as const;

/**
 * The period a piece of evidence is for, said by its own cadence: the one
 * its own text is dated in, read through the cadence reader that wrote it
 * (lib/live-rates-core `periodLabel` — "Aug 2026" for a monthly index or a
 * Zillow month, "Q2 2026" for the survey's quarter, a day only for a day's
 * figure), with `inText` true where the text already says it, so no surface
 * prints it twice. A stored ISO day the text does not date is a day (a
 * T-12's period end, the day records were read — a full timestamp by its
 * UTC day, `isoDayOf`); any other stated period stands as written. Null with
 * no date.
 */
export function evidencePeriod(e: Pick<StressEvidence, "asOf" | "text">): { said: string; inText: boolean } | null {
  const s = isoDayOf(e.asOf);
  if (!s) return null;
  const text = e.text ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`))) {
    if (text.includes(s)) return { said: whenWords(s), inText: true };
    for (const c of TEXT_CADENCES) {
      const label = periodLabel(s, c);
      if (text.includes(label)) return { said: label, inText: true };
    }
    const year = s.slice(0, 4);
    if (text.includes(`(${year})`)) return { said: year, inText: true };
    return { said: whenWords(s), inText: false };
  }
  return { said: s, inText: text.includes(s) };
}

/** The ISO day a piece is dated, only where its own period IS a day
 *  (`evidencePeriod` says it as one): "2026-05-31" for a rent roll's day, a
 *  recorded-sales pull's UTC day; null for a month's or a quarter's figure
 *  stored under its first day, a stated period, or no date. A table cell
 *  holds a date only then, so a monthly figure never reads as its first. */
export function evidenceDay(e: Pick<StressEvidence, "asOf" | "text">): string | null {
  const s = isoDayOf(e.asOf);
  const p = evidencePeriod(e);
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return p.said === whenWords(s) ? s : null;
}

/**
 * What a surface prints after a piece's publisher where it prints the
 * piece's own text beside it (the report's evidence line, the verdict's
 * brief, the panel): ", Aug 2026" by the piece's own period; "" where the
 * text already says it, or where a document, the memorandum's own figure or
 * a rule of thumb states no date; ", undated" for a published figure with
 * none.
 */
export function evidenceWhen(e: Pick<StressEvidence, "asOf" | "text" | "kind">): string {
  const p = evidencePeriod(e);
  if (!p) return e.kind === "published" ? ", undated" : "";
  return p.inText ? "" : `, ${p.said}`;
}

/** The memorandum's sale comps a basis figure is struck over, in their
 *  count, read off the reader's own sentence (lib/stress-test `basisRow`):
 *  "the median of the 4 comps graded clean" — a figure is struck only over
 *  three or more; null on any other piece, or a sentence that strikes no
 *  figure. `ofTheOm` names whose comps they are where no page beside them
 *  says so: "the median of the OM's 3 comps graded clean". */
export function compsStruckOver(e: Pick<StressEvidence, "label" | "text" | "value">, ofTheOm = false): string | null {
  if (e.value == null || !/^The memorandum's sale comps\b/.test(e.label)) return null;
  const the = ofTheOm ? "the OM's" : "the";
  const m = e.text.match(/ — median .*? over the (\d+)\b/);
  return m ? `the median of ${the} ${m[1]} comps graded clean` : null;
}

/** The memorandum's own page a piece is read off, as a whole page number,
 *  where the engine holds a validated one (`StressEvidence.page`); null
 *  with none. */
export function evidencePage(e: Pick<StressEvidence, "page">): number | null {
  return e.page != null && Number.isInteger(e.page) && e.page > 0 ? e.page : null;
}

/** "OM p. 14" — the memorandum's own page a piece is read off, where the
 *  engine holds a validated one (`StressEvidence.page`); "" with none. */
export function evidencePageText(e: Pick<StressEvidence, "page">): string {
  const p = evidencePage(e);
  return p != null ? `OM p. ${p}` : "";
}

/** A piece's publisher with its validated OM page, as the report's evidence
 *  line and the verdict's brief print it after the piece's own words: "the
 *  rent roll", "the offering memorandum, OM p. 14" — the page alone, "OM p.
 *  14", where the publisher is the memorandum itself. */
export function sourceWithPage(e: Pick<StressEvidence, "publisher" | "page">): string {
  const page = evidencePageText(e);
  if (!page) return e.publisher;
  return e.publisher === "the offering memorandum" ? page : `${e.publisher}, ${page}`;
}

/**
 * The `dateTime` a page's `<time>` carries for a piece's period, matching
 * the words beside it (`evidencePeriod`): the day ("2026-05-31") where the
 * period is a day, the month ("2026-08") where it is a month, the year
 * ("2026") where a year; null for a quarter or a period stated in words,
 * which no valid HTML date string names.
 */
export function evidenceDateTime(e: Pick<StressEvidence, "asOf" | "text">): string | null {
  const day = evidenceDay(e);
  if (day) return day;
  const s = isoDayOf(e.asOf);
  const p = evidencePeriod(e);
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  if (p.said === periodLabel(s, "monthly")) return s.slice(0, 7);
  if (p.said === s.slice(0, 4)) return s.slice(0, 4);
  return null;
}

/** "9.1% (the deal's rent roll, May 31, 2026)" — the evidence's figure in
 *  the row's unit with its publisher and its period; its own words where it
 *  carries no figure. A growth row's published figure is said as the
 *  trailing year it is ("+1.1% over the year to Aug 2026 (Zillow
 *  Research)"), never as a rate a year; the memorandum's own figure carries
 *  its page ("(OM p. 14)") and, on a price struck over comps, their count
 *  ("(the median of the 3 comps graded clean, OM p. 14)"; with no validated
 *  page, "(the median of the OM's 3 comps graded clean)"). */
export function evidenceShort(row: StressRow, e: StressEvidence | null): string {
  if (!e) return "no evidence with a figure";
  const period = evidencePeriod(e);
  // A trailing year of a published growth figure, its period in its words.
  if (isGrowth(row.key) && e.value != null && /\bover the year\b/.test(e.text)) {
    return `${evidenceFigureText(row.key, e.value)} over the year${period ? ` to ${period.said}` : ""} (${e.publisher})`;
  }
  // A growth series' average over the years its history holds (lib/growth-
  // average): a rate a year over those years, said as one, never a year's.
  const years = isGrowth(row.key) && e.value != null ? e.text.match(/ a year (over the \S+ years to [^,]+),/)?.[1] : null;
  if (years) return `${evidenceFigureText(row.key, e.value)} a year ${years}, an average (${e.publisher})`;
  // The evidence's figure wears the OM's own noun (a basis "/unit"): the
  // reader struck both on one track.
  const figure = e.value != null ? evidenceFigureText(row.key, e.value, row.omSays.text) : e.text;
  // The memorandum's own figure is the memorandum's page where one is
  // validated, and a price struck over its comps says over how many — whose
  // comps they are, where no page beside them says so.
  const page = evidencePageText(e);
  const comps = compsStruckOver(e, !page);
  const omBase = comps ?? (e.publisher === "the offering memorandum" && page ? "" : e.publisher);
  const source = page ? (omBase ? `${omBase}, ${page}` : page) : comps ?? e.publisher;
  // A published figure with no date is said undated; the deal's own
  // document, the memorandum's own figure and a rule of thumb carry a date
  // only where one is stated — each by its own period, never a monthly
  // figure's first day.
  const when = period ? `, ${period.said}` : e.kind === "published" ? ", undated" : "";
  return `${figure} (${source}${when})`;
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

/** Whether a row's re-run swaps the price (the basis row): its evidence's
 *  run is what a lower price would earn, never good news about the deal,
 *  so it is said as what the ask costs and never drawn in the pass tone. */
export const isPriceImpact = (row: Pick<StressRow, "key" | "impact">): boolean => row.key === "basis" && row.impact != null;

/** A price row's re-run in words, as what the ask costs the return: "The ask
 *  costs 4.3 pts of levered IRR: 9.3% at it, 13.6% at the evidence's price";
 *  where the evidence's price earns no more, the two figures alone. Null
 *  where either run has no figure. */
export function basisMoveWords(impact: StressImpact): string | null {
  const yoc = isYieldImpact(impact);
  const base = yoc ? (impact.baseYocPct ?? null) : impact.baseIrrPct;
  const alt = yoc ? (impact.altYocPct ?? null) : impact.altIrrPct;
  if (base == null || alt == null || !Number.isFinite(base) || !Number.isFinite(alt)) return null;
  const show = (v: number) => (yoc ? pct2(v) : irrText(v));
  const name = yoc ? "yield on cost" : "levered IRR";
  // The cost is the difference of the two figures as printed beside it, each
  // rounded first: 9.25% and 13.64% print 9.3% and 13.6%, so the ask costs
  // 4.3 points, never the 4.4 the unrounded difference rounds to.
  const places = yoc ? 2 : 1;
  const shown = (v: number) => Number(v.toFixed(places));
  const pts = (shown(alt) - shown(base)).toFixed(places);
  if (!(Number(pts) > 0)) return `${upperFirst(name)} ${show(base)} at the ask, ${show(alt)} at the evidence's price`;
  return `The ask costs ${pts} pts of ${name}: ${show(base)} at it, ${show(alt)} at the evidence's price`;
}

/** What a row that holds prints in its re-run's place. Its re-run at the
 *  evidence's figure is the favourable side (an office rent growth holding at
 *  +7.2% re-runs to 24.7%), which no surface draws as a return; the impact
 *  stays on the row for the headline's cases. */
export const HOLDS_NO_RERUN = "The OM's figure is within the row's margin of the evidence; no re-run.";
/** The same, where the OM's figure sits on the cautious side of the
 *  evidence (its signed gap at or under zero: the OM less optimistic). */
export const HOLDS_CAUTIOUS_NO_RERUN = "The OM's figure is on the cautious side of the evidence; no re-run.";

/** What a row that holds prints in its re-run's place, read off its own
 *  signed gap: on the cautious side where the OM is no more optimistic than
 *  the evidence, else within the row's margin. */
export const holdsNoRerun = (row: Pick<StressRow, "gap">): string => (row.gap != null && row.gap.value < 0 ? HOLDS_CAUTIOUS_NO_RERUN : HOLDS_NO_RERUN);

/** Whether a surface draws the row's re-run as a return: a row that holds
 *  draws none (`HOLDS_NO_RERUN`), an unchecked row carries none (nothing on
 *  file tests it; lib/stress-test drops any), and a row with no impact has
 *  none to draw. */
export const drawsRerun = (row: StressRow): boolean => row.impact != null && row.verdict !== "holds" && row.verdict !== "unchecked";

/** Whether a surface may say the return is re-run in code: the re-runs
 *  stand (nothing withheld) and some row draws one (`drawsRerun`). */
export const rerunsStand = (test: StressTest): boolean => !test.impactsWithheld && test.rows.some(drawsRerun);

/**
 * The row's return in one line, for the report and the verdict's brief: the
 * re-run's own note (after `lead`, where the surface names the re-run's base)
 * where the row draws one; `HOLDS_NO_RERUN` on a row that holds; else why no
 * return is re-run.
 */
export function rowMoveText(test: StressTest, row: StressRow, lead?: string): string {
  if (row.verdict === "holds") return holdsNoRerun(row);
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

/** Why a tested row prints no move where the test re-runs others, in a few
 *  words for a cell: the row's own short reason (`StressRow.noRerunShort`,
 *  a plan's "no yield-on-cost re-run: a growth rate"); "" on an unchecked
 *  row, which was tested against nothing, and on a row whose gap says why
 *  (a stabilized deal's premium, no model input — the one-page memo has no
 *  line to spare for it). */
export function noMoveShort(row: StressRow): string {
  if (row.impact || row.verdict === "unchecked") return "";
  // A premium past the achieved one: whether the program still pays at the
  // achieved premium, which the one-page memo would otherwise drop with the
  // gap's sentence (`StressRow.paysAtAchieved`), after the short reason.
  const pays = row.paysAtAchieved == null ? "" : row.paysAtAchieved ? "still pays at the achieved premium" : "does not pay at the achieved premium";
  return [row.noRerunShort ?? "", pays].filter(Boolean).join("; ");
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
  /** "IRR 9.3% to 7.1%"; where the row carries no re-run, why in a few
   *  words ("no yield-on-cost re-run: a growth rate"); "" on a row read and
   *  not tested */
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
    move: row.verdict === "holds" ? "no re-run" : row.impact ? moveShort(row.impact) : noMoveShort(row),
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
  market_rent: "the pro forma rent",
  expense_growth: "expense growth",
  taxes: "the taxes",
  insurance: "insurance",
  opex: "the operating expenses",
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

/** The condition a part's evidence holds on, as every surface says it beside
 *  the part ("if the sale resets the assessment"); null on a part that holds
 *  on none. */
export function partConditional(part: Pick<StressHeadlinePart, "conditional">): string | null {
  return part.conditional?.trim() ? part.conditional.trim() : null;
}

/** What a surface prints in brackets after a part's figure: its rule of
 *  thumb, then its condition — "against a rule of thumb; if the sale resets
 *  the assessment"; null with neither. */
export function partNote(part: Pick<StressHeadlinePart, "key" | "ruleOfThumb" | "conditional">): string | null {
  const notes = [partAgainst(part), partConditional(part)].filter((t): t is string => !!t);
  return notes.length > 0 ? notes.join("; ") : null;
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

/** The evidence's case as the headline's line says it, in the bars' own
 *  words (`HEADLINE_EVIDENCE_CASE_LABEL`): only the rows read stretched or
 *  unsupported move to their evidence, so the line never says "with the
 *  evidence" as if every row ran at it. */
export const WITH_EVIDENCE_CASE = "with stretched and unsupported rows at the evidence";

/**
 * The headline's one line: "Levered IRR on the OM's figures 16.7% to 11.5%
 * with stretched and unsupported rows at the evidence". `arrow` is "to" on paper (WinAnsi has no arrow) and
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
    return `Yield on cost on the OM's figures ${pct2(s.om)} ${arrow} ${pct2(s.evidence)} ${WITH_EVIDENCE_CASE}`;
  }
  const om = irrText(h.omIrrPct);
  if (h.omIrrPct == null && h.evidenceIrrPct == null) return `The levered IRR does not solve on the OM's figures or ${WITH_EVIDENCE_CASE}`;
  if (h.evidenceIrrPct == null) return `Levered IRR on the OM's figures ${om}; ${WITH_EVIDENCE_CASE} it does not solve`;
  if (h.omIrrPct == null) return `The levered IRR does not solve on the OM's figures; ${WITH_EVIDENCE_CASE} it is ${irrText(h.evidenceIrrPct)}`;
  if (h.parts.length === 0 && Math.abs(h.evidenceIrrPct - h.omIrrPct) < 1e-9) {
    return h.omitted.length > 0
      ? `Levered IRR on the OM's figures ${om}, with nothing past its evidence that the headline swaps, so the evidence moves nothing`
      : `Levered IRR on the OM's figures ${om}; no figure the model takes is past its evidence, so the evidence moves nothing`;
  }
  return `Levered IRR on the OM's figures ${om} ${arrow} ${irrText(h.evidenceIrrPct)} ${WITH_EVIDENCE_CASE}`;
}

/** "the price +3.7 pts, vacancy −3.2 pts, the taxes −3.0 pts (if the sale
 *  resets the assessment) and the loan rate −1.4 pts (against a screening
 *  default)", each part as printed (`shownHeadline`), a part struck against
 *  a rule of thumb or on a condition marked so. */
export function headlineSplit(test: StressTest): string {
  const h = liveHeadline(test);
  if (!h) return "";
  return joinAnd(
    shownHeadline(h).parts.map((p) => {
      const note = partNote(p);
      return `${headlineName(p.key)} ${ptsText(p.shown, headlinePlaces(h))}${note ? ` (${note})` : ""}`;
    }),
  );
}

/** "the $43.8M total cost, the $42M price plus the $1.8M budget" — what a
 *  plan's own yield on cost is struck on, from its stated figures; null
 *  where the headline carries none. */
export function planCostWords(h: StressHeadline): string | null {
  const c = isYieldHeadline(h) ? h.planCost : null;
  if (!c || !(c.total > 0)) return null;
  if (c.price != null && c.budget != null) return `the ${money(c.total)} total cost, the ${money(c.price)} price plus the ${money(c.budget)} budget`;
  if (c.price != null && Math.abs(c.price - c.total) < 0.5) return `the ${money(c.total)} price, the buyer's whole cost`;
  return `the ${money(c.total)} total cost`;
}

/** "The OM states its own yield on cost of 7.00% (Untrended yield on cost,
 *  p. 12)." — a plan deal's stated figure beside its two cases, said as the
 *  OM's; where it differs from the plan's own at two places, what each is
 *  struck on: "…, its row naming no cost it is struck on; the plan's 6.85% is
 *  struck on the $43.8M total cost, the $42M price plus the $1.8M budget."
 *  "" where it states none. */
export function statedYocSentence(h: StressHeadline): string {
  const s = isYieldHeadline(h) ? h.statedYoc : null;
  if (!s) return "";
  const stated = `The OM states its own yield on cost of ${pct2(s.pct)} (${s.label}${s.page != null ? `, p. ${s.page}` : ""})`;
  const own = h.omYocPct;
  const cost = planCostWords(h);
  if (own == null || !Number.isFinite(own) || !cost || pct2(own) === pct2(s.pct)) return `${stated}.`;
  const its = s.namesCost ? "on the cost its row states" : "its row naming no cost it is struck on";
  return `${stated}, ${its}; the plan's ${pct2(own)} is struck on ${cost}.`;
}

/**
 * The IRR the memorandum states, beside a levered-IRR headline, said as the
 * OM's (`StressHeadline.statedIrr`). A levered one is set against the OM's
 * case, and the sentence says where the two can part: the case runs the
 * OM's figures only on the rows re-run here, and the engine's own on
 * everything else — "The OM states a levered IRR of 18.5% (Projected levered
 * IRR, p. 8); the engine, at the OM's figures on the rows re-run here, earns
 * 16.7%. The two part wherever the OM's own model runs an input these rows
 * do not hold to the OM's (the loan's terms, the hold, the costs of buying
 * and selling) or its own arithmetic." An unlevered one, or one whose words
 * say neither, is printed and set against nothing. "" where it states none.
 */
export function statedIrrSentence(h: StressHeadline): string {
  const s = isYieldHeadline(h) ? null : h.statedIrr;
  if (!s || !Number.isFinite(s.pct)) return "";
  const where = `(${s.label}${s.page != null ? `, p. ${s.page}` : ""})`;
  if (s.levered === false) return `The OM states an unlevered IRR of ${pct1(s.pct)} ${where}; the figures here are levered, so the two are not set against each other.`;
  if (s.levered === null) return `The OM states an IRR of ${pct1(s.pct)} ${where} without saying whether it is levered, so it is not set against the levered figures here.`;
  const stated = `The OM states a levered IRR of ${pct1(s.pct)} ${where}`;
  if (h.omIrrPct == null || !Number.isFinite(h.omIrrPct)) return `${stated}; the engine's does not solve at the OM's figures.`;
  const same = pct1(h.omIrrPct) === pct1(s.pct);
  const earns = same ? "earns the same" : `earns ${pct1(h.omIrrPct)}`;
  const part = same ? "" : " The two part wherever the OM's own model runs an input these rows do not hold to the OM's (the loan's terms, the hold, the costs of buying and selling) or its own arithmetic.";
  return `${stated}; the engine, at the OM's figures on the rows re-run here, ${earns}.${part}`;
}

/** The OM's own stated return beside the headline, whichever the measure:
 *  a plan's yield on cost, else an IRR. "" where it states none. */
export function statedReturnSentence(h: StressHeadline): string {
  return isYieldHeadline(h) ? statedYocSentence(h) : statedIrrSentence(h);
}

/** "2 mixes of the swaps had no IRR and were counted at the engine's floor
 *  in the split." — "" where every mix solved. */
export function unsolvedSentence(h: StressHeadline): string {
  if (!(h.unsolved > 0)) return "";
  return `${h.unsolved} mix${h.unsolved === 1 ? "" : "es"} of the swaps had no IRR and ${h.unsolved === 1 ? "was" : "were"} counted at the engine's floor in the split.`;
}

const upperFirst = (t: string) => (t ? `${t[0].toUpperCase()}${t.slice(1)}` : t);

/** A component swap named before "swap": "the tax swap". */
const SWAP_NAME: Partial<Record<StressKey, string>> = { vacancy: "vacancy", taxes: "tax", insurance: "insurance", opex: "operating-expense" };

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
  // The memorandum against itself is its own in-place NOI, never "the
  // offering memorandum" as a whole.
  const against =
    best.kind === "om_internal"
      ? "the OM's own in-place NOI"
      : best.publisher.startsWith("the deal's ")
        ? `the ${best.publisher.slice("the deal's ".length)}`
        : /^the /i.test(best.publisher)
          ? best.publisher
          : "its evidence";
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
  // Every re-run sells at the model's hold, never the OM's.
  if (u.hold) items.push(`the OM's ${yearsText(u.hold.omYears)} hold${u.hold.page != null ? ` (p. ${u.hold.page})` : ""}, since the model sells at ${u.hold.modelYears} year${u.hold.modelYears === 1 ? "" : "s"}`);
  if (items.length === 0) return "";
  const said = items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
  return `This headline does not test ${said}.`;
}

/** "7-year", "7.5-year". */
const yearsText = (y: number): string => `${Number.isInteger(y) ? y : y.toFixed(1)}-year`;

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
 * to 11.5% with stretched and unsupported rows at the evidence; the
 * report splits the gap." (the evidence's case in the bars' own words,
 * `WITH_EVIDENCE_CASE`, kept to two lines beside the read line).
 * The report prints `headlineSentence`, the split and what is left out
 * with why. Where a swap in the evidence's case was struck against a rule
 * of thumb alone (the loan rate against a screening default), the line says
 * so in its brackets, as the split marks the part ("…at the evidence (the
 * loan rate against a screening default; …)"); on a plan deal the OM's own
 * stated yield on cost rides there too, from the reader the panel's
 * sentence reads (`statedYoc`: "the OM states 7.10%, p. 24"). Null with no
 * headline.
 */
export function headlineShort(test: StressTest, withModel = true): string | null {
  const h = liveHeadline(test);
  const line = headlineLine(test);
  if (!h || !line) return null;
  const notes: string[] = [];
  const against = h.parts.map((p) => (partAgainst(p) ? `${headlineName(p.key)} ${partAgainst(p)}` : null)).filter((t): t is string => !!t);
  if (against.length > 0) notes.push(joinAnd(against));
  const stated = isYieldHeadline(h) ? h.statedYoc : null;
  if (stated && Number.isFinite(stated.pct)) notes.push(`the OM states ${pct2(stated.pct)}${stated.page != null ? `, p. ${stated.page}` : ""}`);
  const irr = isYieldHeadline(h) ? null : h.statedIrr;
  if (irr && Number.isFinite(irr.pct)) {
    const kind = irr.levered === true ? " levered" : irr.levered === false ? " unlevered" : "";
    notes.push(`the OM states ${pct1(irr.pct)}${kind}${irr.levered === null ? ", not saying whether levered" : ""}${irr.page != null ? `, p. ${irr.page}` : ""}`);
  }
  const model = withModel ? modelClause(h) : "";
  if (model) notes.push(model);
  return `${line}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}${h.parts.length > 0 ? "; the report splits the gap." : "."}`;
}

// ── The headline's three figures, each said as what it is ──────────────

/** The headline's OM's case, as a bar or a cell labels it. */
export const HEADLINE_OM_CASE_LABEL = "At the OM's figures";
/** The headline's evidence's case: only the rows read stretched or
 *  unsupported move, each to its evidence's figure. */
export const HEADLINE_EVIDENCE_CASE_LABEL = "Stretched and unsupported rows at the evidence";
/** The model as it runs, the third figure beside the two cases. */
export const HEADLINE_MODEL_LABEL = "The screening model as it runs";
/** Why the screening model's figure is neither case, short: the model runs
 *  its own figure on every input, the cases put the re-run rows at the
 *  OM's, and differ from each other only on the rows past their evidence.
 *  Published figures are said as read only where the model reads them: the
 *  sample's model is pinned and reads none (lib/model-market). */
export const HEADLINE_MODEL_WHY =
  "The screening model runs its own figure on every input: the deal's documents and its defaults, and published figures where it reads them. Both cases put each re-run row at the OM's figure instead; the second then moves only the rows past their evidence.";

// ── The model as it runs: the base every re-run starts from ─────────────

/** "the screening model as it runs, its own figure on every input: 9.3%" —
 *  the derived model's own
 *  levered IRR, every input its own, as the headline carries it, named as
 *  the screening model (lib/screening-model-words) where a surface first
 *  meets it; "" on a headline struck before it was carried. */
export function modelClause(h: StressHeadline): string {
  if (h.modelIrrPct === undefined) return "";
  // Said as what it is, so the third figure never reads as an unexplained
  // IRR beside the two cases: the model's own figure on every input.
  const what = "the screening model as it runs, its own figure on every input";
  return h.modelIrrPct == null ? `${what}: its levered IRR does not solve` : `${what}: ${irrText(h.modelIrrPct)}`;
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

/** The inputs the sample's model is pinned on (lib/sample-stress): its
 *  growth rates at the default, its exit at the going-in cap, its loan at
 *  the flat placeholder — never seeded from today's figures. */
const SAMPLE_PINNED: readonly StressKey[] = ["rent_growth", "expense_growth", "exit_cap", "debt"];

/** "(the model's 3.0%/yr)", or on the sample where the input is pinned,
 *  "(the sample's model is pinned at 3.0%/yr)". */
const modelBeside = (test: StressTest, key: StressKey, model: number): string =>
  test.sample && SAMPLE_PINNED.includes(key) ? `(the sample's model is pinned at ${figureText(key, model)})` : `(the model's ${figureText(key, model)})`;

/** The same, as a table's "Screening model" cell says it: a figure the
 *  sample's model pins is said as pinned, as the sentence says it. */
export const modelCellText = (test: StressTest, key: StressKey, model: number): string =>
  test.sample && SAMPLE_PINNED.includes(key) ? `pinned at ${figureText(key, model)}` : figureText(key, model);

const KEPT_LEAD: Record<StressKept["why"], string> = {
  holds: "where a row holds",
  left_out: "where a row is left out",
  same: "where the evidence is the OM's own figure",
};

/** What the kept rent line is struck at, read off the OM's case
 *  (`StressKept.struckAt`): "the OM's vacancy, the OM's taxes and insurance,
 *  and the model's other expenses at the T-12's expense ratio" — the model's
 *  expense line is struck at the T-12's expense load where a T-12 set it,
 *  else at the class's screening ratio, and the OM's case swaps into it only
 *  the expense rows it carries. A headline struck before the field was
 *  carried says it as it did. */
export function struckAtWords(at: StressKept["struckAt"]): string {
  if (!at) return "the OM's vacancy and expenses";
  const vacancy = at.vacancy === "om" ? "the OM's vacancy" : "the model's vacancy";
  const ratio = at.rest === "t12" ? " at the T-12's expense ratio" : at.rest === "default" ? " at the class's screening expense ratio" : "";
  const name = (k: StressKey) => (k === "taxes" ? "taxes" : k === "insurance" ? "insurance" : k === "opex" ? "operating expenses" : headlineName(k));
  const all = (["opex", "taxes", "insurance"] as const).every((k) => at.omExpenses.includes(k));
  if (all) return `${vacancy} and the OM's expenses`;
  if (at.omExpenses.length === 0) return `${vacancy} and the model's expenses${ratio}`;
  return `${vacancy}, the OM's ${joinAnd(at.omExpenses.map(name))}, and the model's other expenses${ratio}`;
}

/** One kept figure with the model's beside it. The NOI row keeps the rent
 *  line that makes the OM's NOI, never the NOI itself, and is said so. */
function keptText(test: StressTest, k: StressKept): string {
  if (k.key === "noi" && k.noi != null) {
    return `the rent line ${money(k.om)} that makes the OM's ${money(k.noi)} NOI at ${struckAtWords(k.struckAt)} (the model's rent line ${money(k.model)})`;
  }
  return `${headlineName(k.key)} ${figureText(k.key, k.om)} ${modelBeside(test, k.key, k.model)}`;
}

/**
 * Why the evidence's case is not the model as it runs, whole: the rows it
 * keeps at the OM's figure where the model has another, and the rows it runs
 * at the evidence's figure where the model has another, each named with both
 * figures, read off the headline's own `keptAtOm` and `atEvidence` — "Against
 * the screening model as it runs (9.3%), the evidence's case keeps the OM's figure
 * where a row holds: vacancy 6.0% (the model's 9.1%) and rent growth 4.0%/yr
 * (the model's 3.0%/yr); and where a row is left out: the rent line $7.62M
 * that makes the OM's $3.88M NOI at the OM's vacancy, the OM's taxes and
 * insurance, and the model's other expenses at the T-12's expense ratio
 * (`struckAtWords`; the model's rent line $7.15M). It runs the evidence's figure where the model
 * runs another: the taxes $952k (the model's $728k)." Null where neither list
 * names a figure, or where the headline does not carry the model.
 */
export function keptSentence(test: StressTest): string | null {
  const h = liveHeadline(test);
  if (!h || h.modelIrrPct === undefined) return null;
  const kept = h.keptAtOm ?? [];
  const atEvidence = h.atEvidence ?? [];
  if (kept.length === 0 && atEvidence.length === 0) return null;
  const order: StressKept["why"][] = ["holds", "left_out", "same"];
  const clauses = order.flatMap((why) => {
    const items = kept.filter((k) => k.why === why);
    if (items.length === 0) return [];
    return [`${KEPT_LEAD[why]}: ${joinAnd(items.map((k) => keptText(test, k)))}`];
  });
  const model = h.modelIrrPct == null ? "its levered IRR does not solve" : irrText(h.modelIrrPct);
  const lead = `Against the screening model as it runs (${model}), the evidence's case`;
  const evidenceSaid = atEvidence.map((k) => `${headlineName(k.key)} ${figureText(k.key, k.evidence)} ${modelBeside(test, k.key, k.model)}`);
  const evidenceClause = evidenceSaid.length > 0 ? `the evidence's figure where the model runs another: ${joinAnd(evidenceSaid)}` : "";
  if (clauses.length === 0) return `${lead} runs ${evidenceClause}.`;
  const joined = clauses.length === 1 ? clauses[0] : `${clauses.slice(0, -1).join("; ")}; and ${clauses[clauses.length - 1]}`;
  return `${lead} keeps the OM's figure ${joined}.${evidenceClause ? ` It runs ${evidenceClause}.` : ""}`;
}

/** The sentence a document prints where the headline is withheld: the
 *  test's own reason, then that the headline goes with it. */
export const HEADLINE_WITHHELD = "The headline, the OM's figures against the evidence's in one run each, is withheld for the same reason.";

/** Under the sample's panel (/demo, the homepage's walkthrough and the
 *  signed-in sample): the sample is read as stabilized, so the rows it
 *  re-runs move the levered return (a row that holds or is unchecked draws
 *  none, `drawsRerun`), and a plan deal's re-run its yield on total cost — in
 *  the plan rule's own words (lib/stress-test `PLAN_YIELD_LEAD`;
 *  lib/sample-stress.test.ts holds the two to one another). */
export const SAMPLE_PLAN_NOTE =
  "Read as stabilized, the sample's re-runs move its levered return. A value-add, lease-up, conversion or development OM is re-run on its yield on total cost instead, where it states its stabilized NOI and total cost: the model runs today's income, not the business plan.";

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
    h.omMultiple != null && h.evidenceMultiple != null && h.parts.length > 0 ? ` (equity multiple ${multipleText(h.omMultiple)} to ${multipleText(h.evidenceMultiple)})` : "";
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
  // The IRR the OM states, as the OM's.
  const stated = statedIrrSentence(h) ? ` ${statedIrrSentence(h)}` : "";
  return `${line}${multiples}${split}${unsolved}${untested}${left}${stated}${rest ? ` ${rest}` : ""}${model}`;
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
