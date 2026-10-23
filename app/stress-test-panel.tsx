import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { compactUsd } from "@/lib/money";
import { BarRow, BarRows, Key, KeyItem, MEASURE, PanelFold, PanelHead, PanelNote, Tick } from "@/app/panel-parts";
import {
  HEADLINE_WITHHELD,
  HOLDS_NO_RERUN,
  UNCHECKED_COUNT_WORDS,
  decidesTag,
  drawsRerun,
  evidenceFigureText,
  evidenceDateTime,
  evidencePeriod,
  figureText,
  headlineLine,
  headlineName,
  headlinePlaces,
  isYieldHeadline,
  isYieldImpact,
  keptSentence,
  liveHeadline,
  modelCellText,
  statedYocSentence,
  modelIrrOf,
  noMoveWhy,
  noiRestSentence,
  partNote,
  ptsText,
  rerunWords,
  shownHeadline,
  stressCountLine,
  unsolvedSentence,
  untestedSentence,
  whenWords,
  type ShownPart,
} from "@/lib/stress-test-words";
import type { EvidenceKind, StressEvidence, StressHeadline, StressImpact, StressKept, StressKey, StressRow, StressTest, StressVerdict } from "@/lib/stress-test-types";

/**
 * The OM's assumptions, tested (2026-10-19, the refocus) — the pure panel
 * for `lib/stress-test`, drawn by the deal page's Overview first after the
 * call, by the shared screen under the call, and by /demo and the
 * homepage's walkthrough on the sample. Plain data in: the deal page builds
 * the test on the server from what it already holds, and this draws it.
 *
 * THE HEADLINE leads (`HeadlineView`): the levered IRR on the OM's figures
 * against the evidence's, and the bridge between them split by assumption,
 * with the model as it runs as a third mark (an outline, never a fill) and
 * a small table of the inputs the evidence's case runs at a figure the model
 * does not (`keptRows`, `keptSentence`'s own lists; the sentence is the
 * report's and the brief's). Each row's
 * re-run names its base — the model at its own IRR, one input changed
 * (`rerunWords`) — and draws that IRR as a dashed tick on its bars.
 *
 * ON A PLAN DEAL (a value-add, lease-up, conversion or development) the
 * re-runs and the headline are the plan's yield on total cost, at two places
 * and said so ("Yield on cost on the OM's figures 6.05% → 5.85% with the
 * evidence"), the OM's own stated yield on cost the third mark where it
 * states one; a row with no yield-on-cost meaning says why in its own words
 * (`StressRow.noRerun`).
 *
 * One row an assumption, most severe first (unsupported, stretched, holds).
 * Each tested row has its words beside its picture, so nothing rides on
 * colour:
 *
 *   - THE OM'S FIGURE, with its page as a chip, and the verdict code gave
 *     the row;
 *   - THE TRACK: the OM's figure as a dark tick labelled over the track
 *     ("OM 6.0%"), each piece of evidence that carries a figure as a mark
 *     shaped by its kind — a dot for the deal's own document, a diamond for
 *     a published figure, a hollow dot for the memorandum contradicting
 *     itself, a dashed tick for a rule of thumb — the survey's margin as a
 *     whisker where the evidence states one. ONE figure decides a row
 *     (lib/stress-deciders): its mark is drawn full and labelled under the
 *     track ("Decides 9.1%"), every other mark faded, so the comparison is
 *     read off the one figure and never off a span the pieces make;
 *   - THE EVIDENCE, each item led by its kind's glyph (the track's own
 *     mark), with its kind, a "Decides" or "Beside it, not deciding" tag in
 *     words, its publisher, its date and whose figure it is (a metro's
 *     figure is the metro's — that none is the building's is said once, in
 *     the key, `publishedScopeLine`); a range's two ends are one line
 *     (`rangeEnds`), the memorandum's sale comps a list (`compLines`), and
 *     the OM's own pieces carry no date and no grain, their kind saying
 *     whose they are;
 *   - THE GAP in words, and THE IMPACT: the levered IRR with the OM's figure
 *     and with the evidence's, the engine run again with that one input
 *     swapped (`StressImpact`), as a pair and two bars on one scale (the
 *     re-run's sentence, `StressImpact.note`, is the report's and the
 *     brief's: the bars are it) — or "no return struck", the reason said
 *     once at the top where the model's reads are withheld. The gap and the
 *     impact sit in a card of their own,
 *     beside the evidence where the row is wide enough and under it on a
 *     phone;
 *   - THE CHALLENGE, the challenger's own words and its question for the
 *     broker, folded;
 *   - HOW WE TEST IT: a link to the methodology page's own section for the
 *     key (the row's method sentence its title; the report prints it).
 *
 * Where the OM's figure is the evidence's (the impact's two runs are one,
 * read off its values), the pair is one figure, "Levered IRR 9.3%, run at
 * the evidence's figure", never "9.3% → 9.3%".
 *
 * THE UNCHECKED ROWS are one folded group at the end: a summary line
 * naming them ("5 could not be checked: debt, rent growth, …") and a fold
 * ("Read why (5)") whose body lists each in two lines — the title with the
 * OM's figure and its page chip, then why it stands unchecked — with the
 * challenger's words folded where there are any and the method link. Drawn
 * as fully as a tested row, five of the sample's nine rows were noise. Every
 * word stays in the HTML (the lints, a screen reader), and each row keeps
 * its `data-qa="stress-row-<key>"`.
 *
 * Every dollar goes through `compactUsd`, one option set for the panel.
 */

const MONEY = { millions: 2 as const, trim: true };

const VERDICT: Record<StressVerdict, { rank: number; label: string; chip: string }> = {
  unsupported: { rank: 0, label: "Unsupported", chip: "bg-kill/10 text-kill" },
  stretched: { rank: 1, label: "Stretched", chip: "bg-caution/10 text-caution" },
  holds: { rank: 2, label: "Holds", chip: "bg-pass/10 text-pass" },
  unchecked: { rank: 3, label: "Unchecked", chip: "bg-faint text-muted" },
};

// Each kind has its own SHAPE as well as its tone — a dot for the deal's
// document, a diamond for a published figure, a hollow dot for the OM
// against itself, a dashed tick for a rule of thumb — and the same glyph
// leads the kind's line in the evidence list and its entry in the key, so a
// mark on the track is read off the line beside it, never off a colour.
const KIND: Record<EvidenceKind, { word: string; chip: string; shape: string; mark: string }> = {
  document: { word: "The deal's own document", chip: "bg-brand/10 text-brand", shape: "size-2.5 rounded-full", mark: "bg-brand" },
  published: { word: "A published figure", chip: "bg-pass/10 text-pass", shape: "size-2 rotate-45 rounded-[1px]", mark: "bg-pass" },
  rule_of_thumb: { word: "A rule of thumb", chip: "bg-faint text-muted", shape: "h-3 w-0 border-l-2 border-dashed", mark: "border-ink/50" },
  om_internal: { word: "The OM against itself", chip: "bg-caution/10 text-caution", shape: "size-2.5 rounded-full", mark: "border-2 border-caution bg-surface" },
};

/** The verdicts' fills for the tally under the heading and the read line's
 *  dots, in the chips' own hues. */
const FILL: Record<StressVerdict, string> = { unsupported: "bg-kill", stretched: "bg-caution", holds: "bg-pass", unchecked: "bg-ink/15" };

/** A link's hit area a thumb's height on a touch screen, its line box
 *  unchanged (the padding and the negative margin cancel). */
const TAP = "pointer-coarse:inline-block pointer-coarse:-my-2.5 pointer-coarse:py-2.5";

// Whose figure a piece is. That a published figure is never the building's
// is said once, in the key (`publishedScopeLine`), not on every line.
const SCOPE: Record<StressEvidence["scope"], string> = {
  deal: "the deal's own figure",
  metro: "the metro's figure",
  region: "the Census region's figure",
  state: "the state's figure",
  nation: "the nation's figure",
  class: "the class's, not this market's",
};

/** The published grains, as the key names them. */
const GRAIN: Partial<Record<StressEvidence["scope"], string>> = {
  metro: "the metro's",
  region: "the Census region's",
  state: "the state's",
  nation: "the nation's",
};

/** "Published figures are the metro's, the Census region's or the nation's,
 *  never the building's." — the grains the panel's published pieces carry,
 *  said once in the key in place of a "not the building's" on every line;
 *  null where no published piece carries one. */
export function publishedScopeLine(rows: readonly StressRow[]): string | null {
  const order: StressEvidence["scope"][] = ["metro", "region", "state", "nation"];
  const seen = new Set(rows.flatMap((r) => r.evidence.filter((e) => e.kind === "published").map((e) => e.scope)));
  const words = order.filter((g) => seen.has(g)).map((g) => GRAIN[g]!);
  if (words.length === 0) return null;
  const said = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
  return `Published figures are ${said}, never the building's.`;
}

const SEVERITY: Record<NonNullable<StressRow["challenge"]>["severity"], string> = { high: "High", medium: "Medium", low: "Low" };

const upperFirst = (t: string) => (t ? `${t[0].toUpperCase()}${t.slice(1)}` : t);

const pctText = (n: number | null): string => {
  if (n == null) return "does not solve";
  // A negative return with the minus sign (U+2212), none on one that rounds to nothing.
  const t = n.toFixed(1);
  return Number(t) < 0 ? `\u2212${t.slice(1)}%` : `${t.replace(/^-/, "")}%`;
};

/** A plan deal's yield on cost, at two places as every surface prints one. */
const yocText = (n: number | null): string => {
  if (n == null) return "not struck";
  const t = n.toFixed(2);
  return Number(t) < 0 ? `\u2212${t.slice(1)}%` : `${t.replace(/^-/, "")}%`;
};

/** Most severe first, the reader's order inside a verdict. */
export function sortStressRows(rows: readonly StressRow[]): StressRow[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => VERDICT[a.r.verdict].rank - VERDICT[b.r.verdict].rank || a.i - b.i).map((x) => x.r);
}

/**
 * What would test an unchecked row, in plain words — only where the OM
 * states the figure and the document named is one the test reads when it
 * is on the deal (the T-12's NOI, the rent roll's occupancy by its doors,
 * the T-12's economic vacancy for a figure the OM states as economic). Null
 * elsewhere: a sentence never promises a test the code does not make — the
 * T-12's economic vacancy never tests a figure counted by doors, and its
 * insurance line tests a premium only where the OM's sits under it.
 */
export function testedByHint(row: StressRow): string | null {
  if (row.verdict !== "unchecked" || row.omSays.value == null) return null;
  switch (row.key) {
    case "noi":
    case "opex":
      return "Add the T-12 to test this.";
    case "vacancy":
      return row.measure === "economic" ? "Add the T-12 to test this." : "Add the rent roll to test this.";
    default:
      return null;
  }
}

/** What each key is called in the unchecked line, mid-sentence. */
const UNCHECKED_NAME: Record<Exclude<StressKey, "other">, string> = {
  basis: "the basis",
  exit_cap: "the exit cap",
  debt: "debt",
  noi: "the NOI",
  vacancy: "vacancy",
  rent_growth: "rent growth",
  market_rent: "the market rent",
  expense_growth: "expense growth",
  taxes: "real estate taxes",
  insurance: "insurance",
  opex: "the operating expenses",
  renovation_premium: "the renovation premium",
};

/** How an unchecked row is named in the summary line: the key's own name,
 *  or, for the challenger's own row, its title read mid-sentence — a
 *  leading figure dropped ("$200/mo renovation premium" is "the renovation
 *  premium"), the first word lowercased unless it is an acronym, and "the"
 *  put before it where no article leads. */
export function uncheckedName(row: StressRow): string {
  if (row.key !== "other") return UNCHECKED_NAME[row.key];
  let t = row.title.trim().replace(/^[$€£]?\d[\d,.]*[a-zA-Z%]*(?:\/[a-zA-Z]+)?\s+/, "");
  // A capital followed by a lowercase letter, a space or the end is a word,
  // not an acronym ("A 4% fee" is "a 4% fee"; "RUBS income" keeps its case).
  if (/^[A-Z](?:[a-z]|\s|$)/.test(t)) t = t[0].toLowerCase() + t.slice(1);
  return /^(?:the|a|an)\s/i.test(t) ? t : `the ${t}`;
}

/** "5 could not be checked: debt, rent growth, real estate taxes, insurance, the renovation premium" */
export function uncheckedLine(rows: readonly StressRow[]): string {
  return `${rows.length} ${UNCHECKED_COUNT_WORDS}: ${rows.map(uncheckedName).join(", ")}`;
}

/** The survey's margin, read back off the figure's own text ("6.2% ±2.2 pts"). */
function marginOf(e: StressEvidence): number | null {
  const m = e.text.match(/±\s*(\d+(?:\.\d+)?)\s*pts?/);
  return m ? Number(m[1]) : null;
}

/** Where every figure on a row's track falls: a scale a little wider than
 *  the figures and their margins, so the outermost mark sits inside the
 *  track. Null where the OM states no figure or no evidence carries one. */
function trackScale(row: StressRow): ((v: number) => string) | null {
  const om = row.omSays.value;
  if (om == null) return null;
  const points: number[] = [om];
  for (const e of row.evidence) {
    // A piece on another yardstick (a basis per SF beside the OM's per
    // unit) shares no track with the OM's figure.
    if (e.value == null || e.ownYardstick) continue;
    const moe = marginOf(e);
    points.push(e.value);
    if (moe != null) points.push(e.value - moe, e.value + moe);
  }
  if (points.length < 2) return null;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.12 : Math.abs(om) * 0.1 || 1;
  const from = lo - pad;
  const to = hi + pad;
  return (v: number) => `${Math.max(0, Math.min(100, ((v - from) / (to - from)) * 100)).toFixed(1)}%`;
}

/** A label over or under the track, kept inside it: centred on its value
 *  in the middle of the track, and run from (or to) the value near an end,
 *  so a figure never hangs past the panel's edge on a phone. Never wraps. */
function TrackLabel({ at, children, className = "", qa }: { at: number; children: ReactNode; className?: string; qa?: string }) {
  const style = at < 30 ? { left: `${at.toFixed(1)}%` } : at > 70 ? { right: `${(100 - at).toFixed(1)}%` } : { left: `${at.toFixed(1)}%` };
  const pull = at < 30 ? "-translate-x-1" : at > 70 ? "translate-x-1" : "-translate-x-1/2";
  return (
    <span className={`absolute whitespace-nowrap tabular-nums ${pull} ${className}`} data-qa={qa} style={style}>
      {children}
    </span>
  );
}

/** A text with each ISO day in it kept whole on its line: a phone broke
 *  "2026-05-31" at its hyphen. A `<time>` adds nothing to the words. */
function Dated({ text }: { text: string }) {
  const parts = text.split(/(\d{4}-\d{2}-\d{2})/);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <time key={i} dateTime={p} className="whitespace-nowrap">
        {p}
      </time>
    ) : (
      p
    ),
  );
}

/** The kind's glyph, the one the track draws, at the head of its line in
 *  the list and in the key. */
function EvidenceGlyph({ kind }: { kind: EvidenceKind }) {
  return <span aria-hidden className={`block shrink-0 ${KIND[kind].shape} ${KIND[kind].mark}`} />;
}

/**
 * The piece a row was decided on: `decidedBy` (lib/stress-deciders), else,
 * on a row built before it, the one its re-run swapped in, else the first
 * that carries a figure; null on a row nothing decided.
 */
function decidingIndex(row: StressRow): number | null {
  if (row.verdict === "unchecked") return null;
  if (row.decidedBy != null) return row.decidedBy;
  if (row.impact) return row.impact.evidenceIndex;
  const i = row.evidence.findIndex((e) => e.value != null);
  return i >= 0 ? i : null;
}

/**
 * The track: the OM's figure as a dark tick LABELLED over the track ("OM
 * 6.0%"), each piece of evidence that carries a figure as its kind's glyph —
 * the one that decided drawn full and LABELLED under the track ("Decides
 * 9.1%"), every other faded, since it decides nothing — so the two sides of
 * the comparison are named where they are drawn. The labels sit in rows of
 * their own above and below, and never collide with each other.
 */
function EvidenceTrack({ row, at }: { row: StressRow; at: (v: number) => string }) {
  const om = row.omSays.value!;
  const pos = (v: number) => parseFloat(at(v));
  const d = decidingIndex(row);
  const decider = d != null && row.evidence[d]?.value != null && !row.evidence[d].ownYardstick ? row.evidence[d] : null;
  return (
    <div className="mt-3 text-[11px] leading-4" data-qa="stress-track">
      <p className="text-muted">The OM against the figure that decides</p>
      <div className="relative mt-1 h-4">
        <TrackLabel at={pos(om)} className="font-semibold text-ink" qa="stress-om-label">{`OM ${figureText(row.key, om, row.omSays.text)}`}</TrackLabel>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-faint" aria-hidden>
        {row.evidence.map((e, i) => {
          if (e.value == null || e.ownYardstick) return null;
          const moe = marginOf(e);
          const deciding = i === d;
          // A piece beside the one that decides is drawn faded: it is shown,
          // and decides nothing.
          const fade = deciding ? "" : " opacity-40";
          if (e.kind === "rule_of_thumb") {
            return <Tick key={i} at={at(e.value)} bar="stress-evidence" tone={`${KIND.rule_of_thumb.mark}${fade}`} dashed track="secondary" />;
          }
          return (
            <Fragment key={i}>
              {moe != null && (
                <div
                  className={`absolute top-1/2 h-px -translate-y-1/2 bg-pass/60${fade}`}
                  data-qa="stress-whisker"
                  style={{ left: at(e.value - moe), width: `${(pos(e.value + moe) - pos(e.value - moe)).toFixed(1)}%` }}
                />
              )}
              <div
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ring-1 ring-surface ${KIND[e.kind].shape} ${KIND[e.kind].mark}${fade}`}
                data-bar="stress-evidence"
                data-kind={e.kind}
                data-decides={deciding ? "true" : undefined}
                style={{ left: at(e.value) }}
              />
            </Fragment>
          );
        })}
        <Tick at={at(om)} bar="stress-om" tone="bg-ink" />
      </div>
      <div className="relative h-6">
        {decider && (
          <TrackLabel at={pos(decider.value!)} className="top-1.5 font-semibold text-ink" qa="stress-evidence-label">{`Decides ${evidenceFigureText(row.key, decider.value!, row.omSays.text)}`}</TrackLabel>
        )}
      </div>
    </div>
  );
}

/** The return's move: the pair in words, then the two runs as bars on one
 *  scale — the OM's figure, then the evidence's — each labelled with the
 *  input it ran on. Where the two runs are one, one bar. */
function ImpactView({ impact, test }: { impact: StressImpact; test: StressTest }) {
  // A plan deal's re-run is its yield on total cost, at two places (the
  // precision every surface prints a yield on cost at); a stabilized deal's
  // the levered IRR, at one.
  const yoc = isYieldImpact(impact);
  const base = yoc ? (impact.baseYocPct ?? null) : impact.baseIrrPct;
  const alt = yoc ? (impact.altYocPct ?? null) : impact.altIrrPct;
  const show = yoc ? yocText : pctText;
  const name = yoc ? "Yield on cost" : "Levered IRR";
  // The model as it runs, the run each re-run changes one input of: a dashed
  // tick on both bars, the panel's key naming it. A plan's re-run starts from
  // the plan's own yield, so it carries no model tick.
  const model = yoc ? null : modelIrrOf(test);
  const top = Math.max(base ?? 0, alt ?? 0, model ?? 0, 1) * 1.15;
  const widthOf = (v: number | null) => (v == null ? "0%" : `${Math.max(0, Math.min(100, (v / top) * 100)).toFixed(1)}%`);
  // The two runs are one where the OM's figure IS the evidence's: one
  // figure, not "9.3% → 9.3%". Read off the values the engine was run on,
  // as lib/stress-test-words does, never off the note's words.
  const same = Math.abs(impact.altValue - impact.omValue) < (yoc ? 0.5 : 1e-9);
  // A re-run the evidence lifts is the OM's cushion, never a warning: only
  // a fall is drawn in the warning tone (`data-direction`).
  const direction = base == null || alt == null || Math.abs(alt - base) < (yoc ? 0.005 : 0.05) ? "flat" : alt < base ? "down" : "up";
  return (
    <div className="mt-2.5" data-qa="stress-impact" data-measure={yoc ? "yield_on_cost" : "levered_irr"}>
      <p className="text-sm font-semibold tabular-nums text-ink" data-qa="stress-impact-pair">
        {same ? `${name} ${show(base)}, run at the evidence's figure` : `${name} ${show(base)} → ${show(alt)}`}
      </p>
      <p className={`mt-0.5 ${MEASURE} text-[11px] leading-4 text-muted`} data-qa="stress-impact-base">
        {upperFirst(rerunWords(test, impact))}
      </p>
      <BarRows className="mt-1.5 space-y-1 text-[11px]">
        {!same && (
          <BarRow label="At the OM's figure" figure={show(base)}>
            <div className="h-full rounded-full bg-ink/35" data-bar="stress-impact-om" style={{ width: widthOf(base) }} />
            {model != null && <Tick at={widthOf(model)} bar="stress-impact-model" tone="border-ink/70" dashed track="secondary" />}
          </BarRow>
        )}
        <BarRow label="At the evidence's figure" figure={show(alt)}>
          <div className={`h-full rounded-full ${direction === "down" ? "bg-caution/70" : direction === "up" ? "bg-pass/70" : "bg-muted/40"}`} data-direction={direction} data-bar="stress-impact" style={{ width: widthOf(alt) }} />
          {model != null && <Tick at={widthOf(model)} bar="stress-impact-model" tone="border-ink/70" dashed track="secondary" />}
        </BarRow>
      </BarRows>
      {/* The re-run's sentence ("If … the levered IRR moves from …") is the
          pair and the bars above in words: the report and the verdict's
          brief print it, the panel draws it. What the run assumes, which the
          bars cannot show, is said under them. */}
      {impact.caveat && (
        <p className={`mt-1 ${MEASURE} text-[11px] leading-4 text-muted`} data-qa="stress-impact-caveat">
          {impact.caveat}
        </p>
      )}
    </div>
  );
}

/** Each piece of evidence in one flowing line: the kind's glyph (where the
 *  track draws it), the kind, whether it decided the row or stands beside
 *  the one that did, in words, the figure in its own words, then whose it
 *  is and when, muted, and the source. */
/**
 * A range's two ends read as two pieces (the tracker's cap range at its low
 * end and at its high end, each a figure on the track): the pair is one
 * line, its shared caption said once. Read off the labels the reader writes
 * ("…, low end" / "…, high end") and the pieces' own publisher, date, kind
 * and grain; null where the two are not one range's ends.
 */
export function rangeEnds(a: StressEvidence, b: StressEvidence | undefined): { base: string; text: string } | null {
  if (!b) return null;
  const lo = a.label.match(/^(.*), low end$/);
  const hi = b.label.match(/^(.*), high end$/);
  if (!lo || !hi || lo[1] !== hi[1]) return null;
  if (a.kind !== b.kind || a.publisher !== b.publisher || a.asOf !== b.asOf || a.scope !== b.scope) return null;
  // A period both ends carry ("(late 2025 / early 2026)") is said once.
  const tail = /^(.*?)( \([^()]*\))$/;
  const ta = a.text.match(tail);
  const tb = b.text.match(tail);
  const text = ta && tb && ta[2] === tb[2] ? `low end ${ta[1]}, high end ${tb[1]}${ta[2]}` : `low end ${a.text}; high end ${b.text}`;
  return { base: lo[1], text };
}

/** One of the memorandum's sale comps as the basis reader names it. */
export type CompLine = { name: string; figure: string; grade: "clean" | "favorable" | "stretched"; why: string | null };

/**
 * The basis reader's sale-comps sentence ("3 of 3 state a figure /unit;
 * graded clean (supports): The Brixton — 2.1 mi $252k/unit; Parkside — 1.4
 * mi $261k/unit — two graded clean, too few for a median (3 or more), so
 * none is set against the ask; left out, graded stretched by the comps step
 * (not comparable to the subject): Vue at Girard — 4.0 mi $298k/unit")
 * read back into its parts — the count, each comp with its figure and its
 * grade, and what is struck over the clean ones — so the panel draws a list.
 * Null where the text is not that sentence; the panel then prints it whole.
 */
export function compLines(e: StressEvidence): { head: string; comps: CompLine[]; struck: string } | null {
  if (!/^The memorandum's sale comps/.test(e.label)) return null;
  const m = e.text.match(
    /^(\d+ of \d+ state a figure \/\S+(?: alone, so (?:it is|they are) judged per SF)?)(?:; graded clean \(supports\): (.*?))?( — median .*? over the \d+| — (?:one|two) graded clean, too few for a median \(\d+ or more\), so none is set against the ask|, none graded clean \(supports\), so none is set against the ask)((?:; left out, graded .*)?)$/,
  );
  if (!m) return null;
  const entries = (list: string): { name: string; figure: string }[] | null => {
    const out: { name: string; figure: string }[] = [];
    for (const part of list.split("; ")) {
      const f = part.match(/^(.+) (\$[\d.,]+[kMB]?\/\S+)$/);
      if (!f) return null;
      out.push({ name: f[1], figure: f[2] });
    }
    return out;
  };
  const comps: CompLine[] = [];
  if (m[2]) {
    const clean = entries(m[2]);
    if (!clean) return null;
    comps.push(...clean.map((c) => ({ ...c, grade: "clean" as const, why: null })));
  }
  for (const g of (m[4] ?? "").matchAll(/; left out, graded (favorable|stretched) by the comps step \(([^()]*)\): (.*?)(?=; left out, graded |$)/g)) {
    const list = entries(g[3]);
    if (!list) return null;
    comps.push(...list.map((c) => ({ ...c, grade: g[1] as "favorable" | "stretched", why: g[2] })));
  }
  // No comp named, nothing to list; every left-out clause read, or the
  // sentence is printed whole.
  if (comps.length === 0) return null;
  if ((m[4] ?? "").split("; left out, graded ").length - 1 !== new Set(comps.filter((c) => c.grade !== "clean").map((c) => c.grade)).size) return null;
  const struck = m[3].replace(/^(?: — |, )/, "");
  return { head: m[1], comps, struck: upperFirst(struck) };
}

const GRADE_WORD: Record<CompLine["grade"], string> = {
  clean: "Graded clean",
  favorable: "Favorable, left out",
  stretched: "Stretched, left out",
};

/** The sale comps as a list: each comp with its figure and its grade in
 *  words, then what is struck over the clean ones. */
function CompList({ read }: { read: NonNullable<ReturnType<typeof compLines>> }) {
  return (
    <>
      <ul className="mt-0.5 space-y-0.5" data-qa="stress-comp-list">
        {read.comps.map((c, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-1.5" data-grade={c.grade}>
            <span className="text-ink">{c.name}</span>
            <span className="font-semibold tabular-nums text-ink">{c.figure}</span>
            <span className={c.grade === "clean" ? "font-medium text-ink" : "text-muted"}>{`· ${GRADE_WORD[c.grade]}${c.why ? `: ${c.why.replace(/^it /, "")}` : ""}`}</span>
          </li>
        ))}
      </ul>
      <span className="mt-0.5 block text-ink">{read.struck}</span>
    </>
  );
}

function EvidenceList({ row, marks = false }: { row: StressRow; marks?: boolean }) {
  const evidence = row.evidence;
  if (evidence.length === 0) return null;
  const d = decidingIndex(row);
  // Each line is one piece, or a range's two ends as one (`rangeEnds`).
  const lines: { at: number[]; range: ReturnType<typeof rangeEnds> }[] = [];
  for (let i = 0; i < evidence.length; i++) {
    const range = rangeEnds(evidence[i], evidence[i + 1]);
    lines.push({ at: range ? [i, i + 1] : [i], range });
    if (range) i++;
  }
  return (
    <ul className="mt-1 space-y-1.5 text-[11px] leading-4" data-qa="stress-evidence-list">
      {lines.map(({ at, range }) => {
        const e = evidence[at[0]];
        const kind = KIND[e.kind];
        const tags = at.map((i) => decidesTag({ ...row, decidedBy: d }, i));
        const deciding = d != null && at.includes(d);
        // A range's tag: the one both ends carry, else "Decides" on the end
        // that does, named.
        const tag = tags[0] == null ? null : tags.every((t) => t === tags[0]) ? tags[0] : `${tags[at.indexOf(d!)]}: the ${at.indexOf(d!) === 0 ? "low" : "high"} end`;
        const comps = range ? null : compLines(e);
        const href = at.map((i) => evidence[i].href).find(Boolean);
        const period = evidencePeriod(e);
        const Body = comps ? "div" : "p";
        return (
          <li key={at[0]} className="flex gap-2" data-evidence={e.kind} data-decides={tag == null ? undefined : deciding ? "true" : "false"}>
            {marks && (
              <span className={`flex h-4 w-2.5 shrink-0 items-center justify-center${deciding ? "" : " opacity-40"}`}>
                {at.some((i) => evidence[i].value != null) && <EvidenceGlyph kind={e.kind} />}
              </span>
            )}
            <Body className={`min-w-0 ${MEASURE}`}>
              <span className={`mr-1 inline-block rounded px-1 align-[1px] text-[9.5px] font-semibold uppercase leading-[14px] tracking-wide ${kind.chip}`}>{kind.word}</span>{" "}
              {tag && (
                <>
                  <span
                    className={`mr-1 inline-block rounded border px-1 align-[1px] text-[9.5px] leading-[12px] ${deciding ? "border-ink/60 font-semibold text-ink" : "border-line text-muted"}`}
                    data-qa="stress-decides-tag"
                  >
                    {tag}
                  </span>{" "}
                </>
              )}
              <span className="text-ink">
                <Dated text={range ? `${range.base}: ${range.text}` : comps ? `${e.label}: ${comps.head}` : `${e.label}: ${e.text}`} />
              </span>{" "}
              {/* The OM's own pieces are the memorandum itself: no date to
                  print, and their kind already says whose they are; their
                  page where one is validated. A piece is dated by its own
                  period (a month, a quarter, a day only for a day's figure),
                  and not again where its text already says it. */}
              <span className="text-muted">
                {`— ${e.publisher}`}
                {period ? (
                  period.inText ? null : (
                    <>
                      {", "}
                      {/* The machine-readable date matches the words: a day
                          for a day, a month for a month, none for a quarter
                          (lib/stress-test-words `evidenceDateTime`). */}
                      {evidenceDateTime(e) ? (
                        <time dateTime={evidenceDateTime(e)!} className="whitespace-nowrap">
                          {period.said}
                        </time>
                      ) : (
                        <span className="whitespace-nowrap">{period.said}</span>
                      )}
                    </>
                  )
                ) : e.kind === "rule_of_thumb" || e.kind === "om_internal" ? null : (
                  ", undated"
                )}
                {e.scope === "deal" && (e.kind === "document" || e.kind === "om_internal") ? "" : ` · ${SCOPE[e.scope]}`}
              </span>
              {e.page != null && (
                <>
                  {" "}
                  <PageChip page={e.page} />
                </>
              )}
              {href && (
                <>
                  {" "}
                  <a href={href} target="_blank" rel="noopener noreferrer" className={`font-medium text-brand hover:underline ${TAP}`}>
                    Source
                  </a>
                </>
              )}
              {comps && <CompList read={comps} />}
            </Body>
          </li>
        );
      })}
    </ul>
  );
}

function PageChip({ page }: { page: number | null }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-line bg-surface/70 px-1.5 py-px text-[10px] text-muted" data-qa="stress-page">
      {page != null ? `OM p. ${page}` : "OM"}
    </span>
  );
}

function ChallengeFold({ challenge }: { challenge: NonNullable<StressRow["challenge"]> }) {
  return (
    <div className="mt-2.5" data-qa="stress-challenge">
      <p className="text-[11px] font-semibold text-muted">{`The challenge · ${SEVERITY[challenge.severity]} severity`}</p>
      <PanelFold rest={[challenge.challenge, `Ask the broker: ${challenge.question}`]} />
    </div>
  );
}

/** The words of the way to the methodology page's section for a row's key:
 *  an \`other\` row's section says no reader tests it, so its link says so. */
export const methodLinkWords = (row: StressRow): string => (row.key === "other" ? "Why no reader tests this" : `How we test ${uncheckedName(row)}`);

/** The words of the fold that holds the row's own method sentence. */
export const METHOD_FOLD_LABEL = "This row's method";

/** The way to how the row is tested: the methodology page's own section for
 *  its key, then the row's own method sentence in a fold — a link's title
 *  is out of reach on a touch screen and from a keyboard, so the sentence
 *  is in the page, one tap away. */
function MethodLine({ row }: { row: StressRow }) {
  return (
    <div className="mt-2" data-qa="stress-method">
      <p className={`${MEASURE} text-[11px] leading-4`}>
        <Link href={`/how-we-test#${row.key}`} className={`font-medium text-brand hover:underline ${TAP}`}>
          {methodLinkWords(row)}
        </Link>
      </p>
      {row.method ? <PanelFold rest={[row.method]} label={METHOD_FOLD_LABEL} /> : null}
    </div>
  );
}

/** An unchecked row inside the fold: the title with the OM's figure and its
 *  page, then why it stands unchecked. The OM's text is printed only where
 *  it says something the title and the reason do not ("The OM states no
 *  loan rate." is the reason already). */
function UncheckedRow({ row }: { row: StressRow }) {
  const why = row.unchecked ?? "No evidence with a figure could be read for this deal.";
  // A page is chipped where the OM states a figure, or states the line in
  // words the row shows as stated (a floating rate, priced on nothing).
  const hasFigure = row.omSays.value != null || row.omSays.page != null;
  const figure = row.omSays.text !== row.title && row.omSays.text !== why ? row.omSays.text : null;
  return (
    <li className="py-2 first:pt-1 last:pb-0" data-qa={`stress-row-${row.key}`} data-verdict="unchecked">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-xs font-semibold text-ink">{row.title}</h3>
        {figure && <span className={`${MEASURE} text-xs text-muted`}>{figure}</span>}
        {hasFigure && <PageChip page={row.omSays.page} />}
      </div>
      <p className={`mt-0.5 ${MEASURE} text-xs leading-relaxed text-muted`} data-qa="stress-unchecked">{why}</p>
      {testedByHint(row) && (
        <p className={`mt-0.5 ${MEASURE} text-xs leading-relaxed text-ink`} data-qa="stress-tested-by">
          {testedByHint(row)}
        </p>
      )}
      <EvidenceList row={row} />
      {/* An unchecked row carries no re-run (lib/stress-test drops any: a
          move struck at a figure that tests nothing would read as one the
          evidence makes), so none is drawn. */}
      {row.challenge && <ChallengeFold challenge={row.challenge} />}
      <MethodLine row={row} />
    </li>
  );
}

/** The unchecked rows as one group: the line naming them, and the fold. The
 *  fold is PanelFold's own shape (app/panel-parts) with a body of rows in
 *  place of its paragraph, its control a thumb's height on a touch screen. */
function UncheckedGroup({ rows }: { rows: readonly StressRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 border-t border-line pt-2" data-qa="stress-unchecked-group">
      <p className={`${MEASURE} text-xs leading-relaxed text-muted`} data-qa="stress-unchecked-line">{uncheckedLine(rows)}</p>
      <details className="group mt-1">
        <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline pointer-coarse:py-2.5">
          <span className="group-open:hidden">{`Read why (${rows.length})`}</span>
          <span className="hidden group-open:inline">Less</span>
        </summary>
        <ul className="mt-1 divide-y divide-line" data-qa="stress-unchecked-rows">
          {rows.map((r, i) => (
            <UncheckedRow key={`${r.key}-${i}`} row={r} />
          ))}
        </ul>
      </details>
    </div>
  );
}

function RowView({ row, test }: { row: StressRow; test: StressTest }) {
  const withheld = test.impactsWithheld;
  // A row held to a rule of thumb alone keeps its word but is never drawn
  // as a green "holds": the site's own default is no evidence of the deal's.
  const v = row.ruleOfThumbOnly && row.verdict === "holds" ? { ...VERDICT.holds, chip: VERDICT.unchecked.chip } : VERDICT[row.verdict];
  const at = trackScale(row);
  const hasFigure = row.omSays.value != null;
  // Two columns once the row itself is wide (a container query, so the
  // homepage's narrower walkthrough and the deal page each decide by their
  // own width): what the OM says against the evidence on the left, and on
  // the right what the gap is and what it does to the return, then the
  // challenge and the method. One column, in the same order, on a phone.
  return (
    <li className="@container/row py-4 first:pt-3 last:pb-2" data-qa={`stress-row-${row.key}`} data-verdict={row.verdict}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${v.chip}`}>{v.label}</span>
        <h3 className="text-sm font-semibold text-ink">{row.title}</h3>
        {hasFigure && <PageChip page={row.omSays.page} />}
      </div>
      <p className={`mt-1 ${MEASURE} text-xs text-muted`}>
        <Dated text={row.omSays.text} />
      </p>

      <div className="@2xl/row:grid @2xl/row:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @2xl/row:gap-x-6">
        <div className="min-w-0">
          {at && <EvidenceTrack row={row} at={at} />}
          <EvidenceList row={row} marks={at != null} />
        </div>

        <div className="min-w-0 @2xl/row:pt-3">
          <div className="mt-3 rounded-lg border border-line/80 bg-surface/80 px-3 py-2.5 @2xl/row:mt-0" data-qa="stress-move">
            {row.gap ? (
              <p className={`${MEASURE} text-xs font-medium leading-relaxed text-ink`} data-qa="stress-gap">
                <Dated text={row.gap.text} />
              </p>
            ) : row.unchecked ? (
              <p className={`${MEASURE} text-xs leading-relaxed text-muted`} data-qa="stress-unchecked">{row.unchecked}</p>
            ) : null}

            {row.verdict === "holds" ? (
              // A row that holds draws no re-run: the evidence's side is the
              // favourable one (an office rent growth holding at +7.2% re-runs
              // to 24.7%), which is no return to show (lib/stress-test-words).
              <p className={`${row.gap || row.unchecked ? "mt-1.5 " : ""}${MEASURE} text-[11px] leading-4 text-muted`} data-qa="stress-no-rerun">
                {HOLDS_NO_RERUN}
              </p>
            ) : drawsRerun(row) ? (
              <ImpactView impact={row.impact!} test={test} />
            ) : (
              <p className={`${row.gap || row.unchecked ? "mt-1.5 " : ""}${MEASURE} text-[11px] leading-4 text-muted`} data-qa="stress-no-impact">
                {/* One sentence a row: the reason once at the top where the whole
                    test re-runs nothing, else the row's own (lib/stress-test-words). */}
                {withheld ? "No return is re-run (see the note above)." : noMoveWhy(test, row)}
              </p>
            )}
          </div>

          {row.challenge && <ChallengeFold challenge={row.challenge} />}
          <MethodLine row={row} />
        </div>
      </div>
    </li>
  );
}

/** One row of a test, drawn by the panel's own row (`RowView`) in the
 *  panel's own list, for a page that shows a single row as a worked example
 *  (the method page, on the sample's one build). The row and the test are
 *  the builder's, never a copy: its re-run reads the test's own model. */
export function StressRowExample({ row, test }: { row: StressRow; test: StressTest }) {
  return (
    <ol className="divide-y divide-line" data-qa="stress-row-example">
      <RowView row={row} test={test} />
    </ol>
  );
}

/** The verdicts' dots in the read line, drawn by the count's own element so
 *  the line's words stay one run of text. */
const DOT: Record<string, string> = {
  unsupported: "before:bg-kill",
  stretched: "before:bg-caution",
  hold: "before:bg-pass",
  holds: "before:bg-pass",
  [UNCHECKED_COUNT_WORDS]: "before:bg-ink/25",
};

/**
 * The read line, word for word lib/stress-test-words `stressCountLine`'s,
 * each count kept whole on its line ("1 holds" never breaks after its
 * figure on a phone) and led by its verdict's dot. The counts are `<b>`,
 * which the line's weight already is, so the words stay one run of text for
 * a screen reader and the lints.
 */
function ReadLine({ rows }: { rows: readonly StressRow[] }) {
  const parts = stressCountLine(rows).split(new RegExp(`(\\d+ (?:unsupported|stretched|holds?|${UNCHECKED_COUNT_WORDS}))`));
  return (
    <span className="text-sm font-semibold leading-snug" data-qa="stress-read">
      {parts.map((p, i) => {
        const m = p.match(/^\d+ (.+)$/);
        if (i % 2 === 0 || !m) return p;
        return (
          <b
            key={i}
            className={`whitespace-nowrap font-semibold before:mr-1 before:inline-block before:size-1.5 before:rounded-full before:align-[2px] before:content-[''] ${DOT[m[1]] ?? ""}`}
          >
            {p}
          </b>
        );
      })}
    </span>
  );
}

/** The read line as a picture: one segment an assumption, most severe
 *  first, in its verdict's hue (a "holds" struck on a rule of thumb alone
 *  in the unchecked hue, as its chip is). */
function Tally({ rows }: { rows: readonly StressRow[] }) {
  return (
    <div aria-hidden className="mt-2 flex h-2 max-w-md gap-0.5" data-bar="stress-tally">
      {rows.map((r, i) => (
        <span key={i} className={`flex-1 rounded-full ${r.ruleOfThumbOnly && r.verdict === "holds" ? FILL.unchecked : FILL[r.verdict]}`} />
      ))}
    </div>
  );
}

/**
 * THE HEADLINE, above the rows: the levered IRR with every tested figure
 * at the OM's ("the OM's case") against the same model with every figure
 * past its evidence swapped for the evidence's, as one line, then the
 * bridge between them — a bar from zero to the OM's case, one floating
 * segment an assumption from where the walk stands to where its share
 * takes it (signed, largest first: the Shapley split, so the segments end
 * exactly on the evidence's case), and a bar from zero to the evidence's
 * case — on one scale. What the headline leaves out is named under it,
 * the reasons folded. Where the re-runs are withheld, the panel's note says
 * the headline is withheld with them.
 */
/** The model as it runs on the headline's track: an outline from zero, its
 *  figure beside it — the base each row's re-run starts from. */
function ModelBarRow({ model, style, yoc = false }: { model: number; style: { left: string; width: string }; yoc?: boolean }) {
  // On a plan deal the third mark is the yield on cost the OM states in a
  // row of its own, labelled as the OM's.
  return (
    <BarRow label={yoc ? "The OM's stated yield on cost" : "The screening model as it runs"} figure={yoc ? yocText(model) : pctText(model)}>
      <div
        className="absolute inset-y-0 rounded-full border border-dashed border-ink/60"
        data-bar={yoc ? "stress-headline-stated" : "stress-headline-model"}
        style={style}
      />
    </BarRow>
  );
}

/** One input on which the evidence's case and the screening model differ
 *  (`keptRows`). */
export type KeptRow = { key: StressKey; assumption: string; evidence: string; why: string; model: string };

const KEPT_WHY: Record<StressKept["why"], string> = {
  holds: "the OM's; the row holds",
  left_out: "the OM's; left out of the headline",
  same: "the OM's, which is the evidence's",
};

/**
 * `keptSentence` as a table's rows, read off the same `keptAtOm` and
 * `atEvidence` in the same order: each input the evidence's case runs at a
 * figure the screening model does not — the OM's where a row holds, is left
 * out or is the evidence's own, else the evidence's — with the
 * model's figure beside it. Empty where `keptSentence` is null.
 */
export function keptRows(test: StressTest): KeptRow[] {
  const h = liveHeadline(test);
  if (!h || h.modelIrrPct === undefined || keptSentence(test) == null) return [];
  const order: StressKept["why"][] = ["holds", "left_out", "same"];
  const kept = h.keptAtOm ?? [];
  const rows: KeptRow[] = order.flatMap((why) =>
    kept
      .filter((k) => k.why === why)
      .map((k) => ({
        key: k.key,
        assumption: k.key === "noi" && k.noi != null ? `Rent line (makes the OM's ${compactUsd(k.noi, MONEY)} NOI)` : k.label,
        evidence: k.key === "noi" ? compactUsd(k.om, MONEY) : figureText(k.key, k.om),
        why: KEPT_WHY[why],
        model: k.key === "noi" ? compactUsd(k.model, MONEY) : modelCellText(test, k.key, k.model),
      })),
  );
  for (const a of h.atEvidence ?? []) {
    rows.push({ key: a.key, assumption: a.label, evidence: figureText(a.key, a.evidence), why: "the evidence's", model: modelCellText(test, a.key, a.model) });
  }
  return rows;
}

/** The evidence's case against the screening model, input by input: a small
 *  table whose column headers say what each figure is. */
function KeptTable({ rows, model }: { rows: readonly KeptRow[]; model: number | null }) {
  return (
    <table className="mt-2 w-full max-w-xl table-fixed border-collapse text-left text-[11px] leading-4" data-qa="stress-headline-kept">
      <caption className="pb-1 text-left text-xs text-ink/85">
        {`Where the evidence's case and the screening model as it runs (${model == null ? "its levered IRR does not solve" : pctText(model)}) differ`}
      </caption>
      <thead>
        <tr className="border-b border-line text-muted">
          <th scope="col" className="w-[38%] py-0.5 pr-2 font-medium">
            Assumption
          </th>
          <th scope="col" className="py-0.5 pr-2 font-medium">
            {"Evidence's case"}
          </th>
          <th scope="col" className="w-[24%] py-0.5 font-medium">
            Screening model
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-line/60 align-baseline last:border-0">
            <th scope="row" className="py-0.5 pr-2 font-normal text-ink">
              {r.assumption}
            </th>
            <td className="py-0.5 pr-2">
              <span className="font-semibold tabular-nums text-ink">{r.evidence}</span> <span className="text-muted">{`(${r.why})`}</span>
            </td>
            <td className="py-0.5 tabular-nums text-ink">{r.model}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HeadlineView({ headline: h, line, kept, test }: { headline: StressHeadline; line: string; kept: readonly KeptRow[]; test: StressTest }) {
  // The figures as printed (lib/stress-test-words `shownHeadline`): each
  // case at its measure's place (a levered IRR at one, a plan's yield on
  // cost at two) and each part rounded so the segments end exactly on the
  // evidence's printed case.
  const yoc = isYieldHeadline(h);
  const places = headlinePlaces(h);
  const fig = yoc ? yocText : pctText;
  const shown = shownHeadline(h);
  const om = shown.om;
  const ev = shown.evidence;
  // The model as it runs, every input its own — the third mark, drawn as an
  // outline from zero so it reads apart from the two filled cases: the base
  // every row's re-run starts from, which neither case is. On a plan deal,
  // the yield on cost the OM states, where it states one.
  const model = yoc
    ? h.statedYoc && Number.isFinite(h.statedYoc.pct)
      ? Number(h.statedYoc.pct.toFixed(2))
      : null
    : h.modelIrrPct != null && Number.isFinite(h.modelIrrPct)
      ? Number(h.modelIrrPct.toFixed(1))
      : null;
  const stated = statedYocSentence(h);
  const walk: { part: ShownPart; from: number; to: number }[] = [];
  if (om != null) {
    let at = om;
    for (const part of shown.parts) {
      walk.push({ part, from: at, to: at + part.shown });
      at += part.shown;
    }
  }
  const points = [0, ...(om != null ? [om] : []), ...(ev != null ? [ev] : []), ...(model != null ? [model] : []), ...walk.flatMap((w) => [w.from, w.to])];
  const lo = Math.min(...points);
  const hi = Math.max(...points, lo + 1);
  const span = (hi - lo) * 1.08;
  const x = (v: number) => ((v - lo) / span) * 100;
  const bar = (from: number, to: number) => ({ left: `${x(Math.min(from, to)).toFixed(2)}%`, width: `${Math.max(0.6, Math.abs(x(to) - x(from))).toFixed(2)}%` });
  const zero = lo < 0 ? x(0) : null;
  const left = h.omitted.map((o) => headlineName(o.key));
  return (
    <div className="mt-3 rounded-lg border border-line/80 bg-surface/80 px-3 py-3" data-qa="stress-headline" data-measure={yoc ? "yield_on_cost" : "levered_irr"}>
      <p className={`${MEASURE} text-base font-semibold leading-snug tabular-nums text-ink`} data-qa="stress-headline-line">
        {line}
      </p>
      {stated && (
        <p className={`mt-1 ${MEASURE} text-xs leading-relaxed text-ink/85`} data-qa="stress-headline-stated">
          {stated}
        </p>
      )}
      {/* What the headline does not test, where the deal's main risks are
          unchecked: said under the line, in the caution tone. */}
      {untestedSentence(h) && (
        <p className={`mt-1 ${MEASURE} text-xs font-medium leading-relaxed text-caution`} data-qa="stress-headline-untested">
          {untestedSentence(h)}
        </p>
      )}
      {kept.length > 0 && <KeptTable rows={kept} model={h.modelIrrPct ?? null} />}
      {!(h.parts.length > 0 && om != null && ev != null) && om != null && model != null && (
        <BarRows className="mt-2.5 space-y-1.5 text-[11px]" qa="stress-headline-cases">
          <BarRow label="On the OM's figures" figure={fig(om)}>
            <div className="absolute inset-y-0 rounded-full bg-ink/40" data-bar="stress-headline-om" style={bar(0, om)} />
          </BarRow>
          <ModelBarRow model={model} style={bar(0, model)} yoc={yoc} />
        </BarRows>
      )}
      {h.parts.length > 0 && om != null && ev != null && (
        <BarRows className="mt-2.5 space-y-1.5 text-[11px]" qa="stress-headline-bridge">
          <BarRow label="On the OM's figures" figure={fig(om)}>
            <div className="absolute inset-y-0 rounded-full bg-ink/40" data-bar="stress-headline-om" style={bar(0, om)} />
          </BarRow>
          {walk.map(({ part, from, to }) => {
            const against = partNote(part);
            return (
              <BarRow
                key={part.key}
                label={
                  against ? (
                    <>
                      {part.label}{" "}
                      <span className="text-[10px]" data-qa="stress-headline-against">
                        ({against})
                      </span>
                    </>
                  ) : (
                    part.label
                  )
                }
                figure={ptsText(part.shown, places)}
              >
                {zero != null && <Tick at={`${zero.toFixed(2)}%`} bar="stress-headline-zero" tone="bg-ink/30" track="secondary" />}
                <div
                  className={`absolute inset-y-0 rounded-full ${part.pts < 0 ? "bg-kill/70" : "bg-pass/70"}`}
                  data-bar="stress-headline-part"
                  data-key={part.key}
                  style={bar(from, to)}
                />
              </BarRow>
            );
          })}
          <BarRow label="With the evidence" figure={fig(ev)}>
            <div className="absolute inset-y-0 rounded-full bg-caution/70" data-bar="stress-headline-evidence" style={bar(0, ev)} />
          </BarRow>
          {model != null && <ModelBarRow model={model} style={bar(0, model)} yoc={yoc} />}
        </BarRows>
      )}
      <p className={`mt-2 ${MEASURE} text-[11px] leading-4 text-muted`} data-qa="stress-headline-note">
        {h.parts.length > 1
          ? `Each segment is one assumption's share of the gap, averaged over every order the swaps could be made in, so the segments add up to it; one to the right is evidence that raises the ${yoc ? "yield" : "return"}.`
          : h.parts.length === 1
            ? yoc
              ? "One assumption the plan's yield is struck on is past its evidence, so the whole gap is its own."
              : "One assumption the model takes is past its evidence, so the whole gap is its own, struck on the OM's case."
            : om == null || ev == null
              ? "One of the two runs has no levered IRR, so the gap is not split."
              : h.omitted.length > 0
                ? "Nothing past its evidence is a figure the headline swaps, so the two runs are one."
                : yoc
                  ? "Nothing the plan's yield is struck on is past its evidence, so the two runs are one."
                  : "Nothing the model takes is past its evidence, so the two runs are one."}
        {h.unsolved > 0 ? ` ${unsolvedSentence(h)}` : ""}
        {left.length > 0 ? ` Left out: ${left.join(", ")}.` : ""}
        {noiRestSentence(h, test) ? ` ${noiRestSentence(h, test)}` : ""}{" "}
        <Link href="/how-we-test#headline" className={`whitespace-nowrap font-medium text-brand hover:underline ${TAP}`}>
          How the headline is struck
        </Link>
      </p>
      {h.omitted.length > 0 && <PanelFold rest={h.omitted.map((o) => `${o.label}: ${o.why}.`)} />}
    </div>
  );
}

export function StressTestPanel({ test, className = "" }: { test: StressTest | null; className?: string }) {
  if (!test || test.rows.length === 0) return null;
  const rows = sortStressRows(test.rows);
  const tested = rows.filter((r) => r.verdict !== "unchecked");
  const unchecked = rows.filter((r) => r.verdict === "unchecked");
  const worst = rows[0].verdict;
  // An assumption the evidence cannot support sets the tone; one past the
  // evidence by a margin to price is a question to answer.
  const tone =
    worst === "unsupported"
      ? { border: "border-kill/30 border-l-kill bg-kill/5", head: "text-kill" }
      : worst === "stretched"
        ? { border: "border-caution/30 border-l-caution bg-caution/5", head: "text-caution" }
        : { border: "border-line border-l-brand bg-surface", head: "text-brand" };
  const published = test.rows.some((r) => r.evidence.some((e) => e.kind === "published"));
  const model = modelIrrOf(test);
  const kindsShown = new Set<EvidenceKind>();
  for (const r of test.rows) for (const e of r.evidence) if (e.value != null && !e.ownYardstick && trackScale(r)) kindsShown.add(e.kind);

  return (
    <section
      aria-label="The OM's assumptions, tested"
      data-qa="stress-test-panel"
      className={`${className ? `${className} ` : ""}rounded-xl border border-l-4 px-4 py-3 ${tone.border}`}
    >
      <PanelHead title="The OM's assumptions, tested" tone={tone.head}>
        <ReadLine rows={test.rows} />
      </PanelHead>
      <Tally rows={rows} />
      {/* The reason is a whole sentence that already says no return is
          re-run; the headline goes with the re-runs, said so. */}
      {test.impactsWithheld && <PanelNote>{`${test.impactsWithheld} ${HEADLINE_WITHHELD}`}</PanelNote>}
      {liveHeadline(test) && <HeadlineView headline={liveHeadline(test)!} line={headlineLine(test, "→")!} kept={keptRows(test)} test={test} />}

      {tested.length > 0 && (
        <ol className="mt-2 divide-y divide-line" data-qa="stress-rows">
          {tested.map((r, i) => (
            <RowView key={`${r.key}-${i}`} row={r} test={test} />
          ))}
        </ol>
      )}
      <UncheckedGroup rows={unchecked} />

      <Key className="mt-3 border-t border-line pt-2" qa="stress-key">
        <KeyItem mark="tick" tone="bg-ink">
          {"The OM's figure"}
        </KeyItem>
        {/* The dashed tick on each row's re-run bars: the model as it runs. */}
        {model != null && test.rows.some(drawsRerun) && (
          <KeyItem mark="dashed" tone="border-ink/70">
            {`The screening model as it runs, ${pctText(model)}: each re-run changes one input of it`}
          </KeyItem>
        )}
        {/* Each kind's own glyph, the one the track and the list draw. */}
        {(["document", "published", "rule_of_thumb", "om_internal"] as const).map((k) =>
          kindsShown.has(k) ? (
            <KeyItem key={k}>
              <span className="flex h-4 w-2.5 shrink-0 items-center justify-center">
                <EvidenceGlyph kind={k} />
              </span>
              {KIND[k].word}
            </KeyItem>
          ) : null,
        )}
        {/* One figure decides each row: its mark full, the rest faded. */}
        {tested.some((r) => trackScale(r) && r.evidence.filter((e) => e.value != null && !e.ownYardstick).length > 1) && (
          <KeyItem>{"A full mark decides its row; a faded one is shown beside it, not deciding"}</KeyItem>
        )}
        {published && (
          <KeyItem>{test.publishedRead ? `Published figures read ${whenWords(test.readOn)}` : "Published figures as of the screen's market check"}</KeyItem>
        )}
        {/* Whose a published figure is, said once for every line. */}
        {publishedScopeLine(test.rows) && <KeyItem>{publishedScopeLine(test.rows)}</KeyItem>}
      </Key>
    </section>
  );
}
