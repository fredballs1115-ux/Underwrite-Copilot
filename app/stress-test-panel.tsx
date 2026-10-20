import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { compactUsd } from "@/lib/money";
import { BarRow, BarRows, Key, KeyItem, MEASURE, PanelFold, PanelHead, PanelNote, Tick } from "@/app/panel-parts";
import { HEADLINE_WITHHELD, headlineLine, headlineName, noMoveWhy, ptsText } from "@/lib/stress-test-words";
import type { EvidenceKind, StressEvidence, StressHeadline, StressImpact, StressKey, StressRow, StressTest, StressVerdict } from "@/lib/stress-test-types";

/**
 * The OM's assumptions, tested (2026-10-19, the refocus) — the pure panel
 * for `lib/stress-test`, drawn by the deal page's Overview first after the
 * call, by the shared screen under the call, and by /demo and the
 * homepage's walkthrough on the sample. Plain data in: the deal page builds
 * the test on the server from what it already holds, and this draws it.
 *
 * THE HEADLINE leads (`HeadlineView`): the levered IRR on the OM's figures
 * against the evidence's, and the bridge between them split by assumption.
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
 *     whisker where the evidence states one, and under the track a bracket
 *     over the evidence's span labelled with its figures;
 *   - THE EVIDENCE, each item led by its kind's glyph (the track's own
 *     mark), with its kind, its publisher, its date and whose figure it is
 *     (a metro's figure is the metro's, never the building's);
 *   - THE GAP in words, and THE IMPACT: the levered IRR with the OM's figure
 *     and with the evidence's, the engine run again with that one input
 *     swapped (`StressImpact`), as a pair and two bars on one scale — or "no
 *     return struck", the reason said once at the top where the model's
 *     reads are withheld. The gap and the impact sit in a card of their own,
 *     beside the evidence where the row is wide enough and under it on a
 *     phone;
 *   - THE CHALLENGE, the challenger's own words and its question for the
 *     broker, folded;
 *   - HOW THIS WAS TESTED: the row's method sentence, linking to the
 *     methodology page's own section for the key.
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

const SCOPE: Record<StressEvidence["scope"], string> = {
  deal: "the deal's own figure",
  metro: "the metro's figure, not the building's",
  region: "the Census region's figure, not the building's",
  state: "the state's figure, not the building's",
  nation: "the nation's figure, not the building's",
  class: "the class's, not this market's",
};

const SEVERITY: Record<NonNullable<StressRow["challenge"]>["severity"], string> = { high: "High", medium: "Medium", low: "Low" };

/** "Jun 30, 2026" for an ISO day; a period as published ("Q2 2026") as is. */
function dayText(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const at = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(at)) return s;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** A figure in the assumption's own unit, as the row's reader writes it. */
function figureText(key: StressKey, v: number): string {
  switch (key) {
    case "exit_cap":
    case "debt":
      return `${v.toFixed(2)}%`;
    case "vacancy":
    case "rent_growth":
    case "expense_growth":
      return `${v.toFixed(1)}%`;
    case "renovation_premium":
      return `${compactUsd(v, MONEY)}/mo`;
    default:
      return compactUsd(v, MONEY);
  }
}

const pctText = (n: number | null): string => (n == null ? "does not solve" : `${n.toFixed(1)}%`);

/** Most severe first, the reader's order inside a verdict. */
export function sortStressRows(rows: readonly StressRow[]): StressRow[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => VERDICT[a.r.verdict].rank - VERDICT[b.r.verdict].rank || a.i - b.i).map((x) => x.r);
}

/** "9 assumptions: 1 unsupported, 2 stretched, 1 holds; 5 could not be
 *  checked" — a row that could not be checked is never counted among the
 *  tested, and the line says so in a reader's words. */
export function stressReadLine(rows: readonly StressRow[]): string {
  const n = (v: StressVerdict) => rows.filter((r) => r.verdict === v).length;
  const parts: [number, string][] = [
    [n("unsupported"), "unsupported"],
    [n("stretched"), "stretched"],
    [n("holds"), n("holds") === 1 ? "holds" : "hold"],
  ];
  const said = parts.filter(([c]) => c > 0).map(([c, w]) => `${c} ${w}`);
  const read = rows.length;
  const head = `${read} assumption${read === 1 ? "" : "s"}`;
  const notChecked = n("unchecked");
  if (said.length === 0) return `${head}: none could be checked`;
  return `${head}: ${said.join(", ")}${notChecked > 0 ? `; ${notChecked} could not be checked` : ""}`;
}

/**
 * What would test an unchecked row, in plain words — only where the OM
 * states the figure and the document named is one the test reads when it
 * is on the deal (the T-12's NOI, vacancy and insurance line, the rent
 * roll's occupancy). Null elsewhere: a sentence never promises a test the
 * code does not make.
 */
export function testedByHint(row: StressRow): string | null {
  if (row.verdict !== "unchecked" || row.omSays.value == null) return null;
  switch (row.key) {
    case "noi":
    case "insurance":
      return "Add the T-12 to test this.";
    case "vacancy":
      return "Add the rent roll or the T-12 to test this.";
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
  expense_growth: "expense growth",
  taxes: "real estate taxes",
  insurance: "insurance",
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
  return `${rows.length} could not be checked: ${rows.map(uncheckedName).join(", ")}`;
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
 * The track: the OM's figure as a dark tick LABELLED over the track ("OM
 * 6.0%"), each piece of evidence that carries a figure as its kind's glyph,
 * and under the track a bracket over the evidence's span labelled with its
 * figures ("Evidence 4.6%–9.3%"), so the two sides of the comparison are
 * named where they are drawn. The labels sit in rows of their own above and
 * below, and never collide with each other.
 */
function EvidenceTrack({ row, at }: { row: StressRow; at: (v: number) => string }) {
  const om = row.omSays.value!;
  const pos = (v: number) => parseFloat(at(v));
  const figures = row.evidence.flatMap((e) => (e.value == null ? [] : [e.value]));
  const lo = Math.min(...figures);
  const hi = Math.max(...figures);
  const span = lo === hi ? figureText(row.key, lo) : `${figureText(row.key, lo)}–${figureText(row.key, hi)}`;
  return (
    <div className="mt-3 text-[11px] leading-4" data-qa="stress-track">
      <p className="text-muted">The OM against the evidence</p>
      <div className="relative mt-1 h-4">
        <TrackLabel at={pos(om)} className="font-semibold text-ink" qa="stress-om-label">{`OM ${figureText(row.key, om)}`}</TrackLabel>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-faint" aria-hidden>
        {row.evidence.map((e, i) => {
          if (e.value == null || e.ownYardstick) return null;
          const moe = marginOf(e);
          if (e.kind === "rule_of_thumb") {
            return <Tick key={i} at={at(e.value)} bar="stress-evidence" tone={KIND.rule_of_thumb.mark} dashed track="secondary" />;
          }
          return (
            <Fragment key={i}>
              {moe != null && (
                <div
                  className="absolute top-1/2 h-px -translate-y-1/2 bg-pass/60"
                  data-qa="stress-whisker"
                  style={{ left: at(e.value - moe), width: `${(pos(e.value + moe) - pos(e.value - moe)).toFixed(1)}%` }}
                />
              )}
              <div
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ring-1 ring-surface ${KIND[e.kind].shape} ${KIND[e.kind].mark}`}
                data-bar="stress-evidence"
                data-kind={e.kind}
                style={{ left: at(e.value) }}
              />
            </Fragment>
          );
        })}
        <Tick at={at(om)} bar="stress-om" tone="bg-ink" />
      </div>
      <div className={`relative ${lo === hi ? "h-6" : "h-8"}`}>
        {/* A bracket over the evidence's span; one figure needs none. */}
        {lo !== hi && (
          <div
            aria-hidden
            className="absolute top-1 h-2 rounded-b-sm border-x border-b border-ink/30"
            data-qa="stress-span"
            style={{ left: at(lo), width: `${(pos(hi) - pos(lo)).toFixed(1)}%` }}
          />
        )}
        <TrackLabel at={(pos(lo) + pos(hi)) / 2} className={`${lo === hi ? "top-1.5" : "top-3.5"} font-medium text-ink/80`} qa="stress-evidence-label">{`Evidence ${span}`}</TrackLabel>
      </div>
    </div>
  );
}

/** The return's move: the pair in words, then the two runs as bars on one
 *  scale — the OM's figure, then the evidence's — each labelled with the
 *  input it ran on. Where the two runs are one, one bar. */
function ImpactView({ impact }: { impact: StressImpact }) {
  const base = impact.baseIrrPct;
  const alt = impact.altIrrPct;
  const top = Math.max(base ?? 0, alt ?? 0, 1) * 1.15;
  const widthOf = (v: number | null) => (v == null ? "0%" : `${Math.max(0, Math.min(100, (v / top) * 100)).toFixed(1)}%`);
  // The two runs are one where the OM's figure IS the evidence's: one
  // figure, not "9.3% → 9.3%". Read off the values the engine was run on,
  // as lib/stress-test-words does, never off the note's words.
  const same = Math.abs(impact.altValue - impact.omValue) < 1e-9;
  // A re-run the evidence lifts is the OM's cushion, never a warning: only
  // a fall is drawn in the warning tone (`data-direction`).
  const direction = base == null || alt == null || Math.abs(alt - base) < 0.05 ? "flat" : alt < base ? "down" : "up";
  return (
    <div className="mt-2.5" data-qa="stress-impact">
      <p className="text-sm font-semibold tabular-nums text-ink" data-qa="stress-impact-pair">
        {same ? `Levered IRR ${pctText(base)}, run at the evidence's figure` : `Levered IRR ${pctText(base)} → ${pctText(alt)}`}
      </p>
      <BarRows className="mt-1.5 space-y-1 text-[11px]">
        {!same && (
          <BarRow label="At the OM's figure" figure={pctText(base)}>
            <div className="h-full rounded-full bg-ink/35" data-bar="stress-impact-om" style={{ width: widthOf(base) }} />
          </BarRow>
        )}
        <BarRow label="At the evidence's figure" figure={pctText(alt)}>
          <div className={`h-full rounded-full ${direction === "down" ? "bg-caution/70" : direction === "up" ? "bg-pass/70" : "bg-muted/40"}`} data-direction={direction} data-bar="stress-impact" style={{ width: widthOf(alt) }} />
        </BarRow>
      </BarRows>
      <p className={`mt-1.5 ${MEASURE} text-xs leading-relaxed text-ink/85`}>
        <Dated text={impact.note} />
      </p>
    </div>
  );
}

/** Each piece of evidence in one flowing line: the kind's glyph (where the
 *  track draws it), the kind, the figure in its own words, then whose it is
 *  and when, muted, and the source. */
function EvidenceList({ evidence, marks = false }: { evidence: readonly StressEvidence[]; marks?: boolean }) {
  if (evidence.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1.5 text-[11px] leading-4" data-qa="stress-evidence-list">
      {evidence.map((e, i) => {
        const kind = KIND[e.kind];
        return (
          <li key={i} className="flex gap-2" data-evidence={e.kind}>
            {marks && <span className="flex h-4 w-2.5 shrink-0 items-center justify-center">{e.value != null && <EvidenceGlyph kind={e.kind} />}</span>}
            <p className={`min-w-0 ${MEASURE}`}>
              <span className={`mr-1 inline-block rounded px-1 align-[1px] text-[9.5px] font-semibold uppercase leading-[14px] tracking-wide ${kind.chip}`}>{kind.word}</span>{" "}
              <span className="text-ink">
                <Dated text={`${e.label}: ${e.text}`} />
              </span>{" "}
              <span className="text-muted">
                {`— ${e.publisher}`}
                {e.asOf ? (
                  <>
                    {", "}
                    <time dateTime={e.asOf} className="whitespace-nowrap">
                      {dayText(e.asOf)}
                    </time>
                  </>
                ) : e.kind === "rule_of_thumb" ? null : (
                  ", undated"
                )}
                {` · ${SCOPE[e.scope]}`}
              </span>
              {e.href && (
                <>
                  {" "}
                  <a href={e.href} target="_blank" rel="noopener noreferrer" className={`font-medium text-brand hover:underline ${TAP}`}>
                    Source
                  </a>
                </>
              )}
            </p>
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

function MethodLine({ row }: { row: StressRow }) {
  return (
    <p className={`mt-2 ${MEASURE} text-[11px] leading-4 text-muted`} data-qa="stress-method">
      <span>{`How this was tested: ${row.method}`}</span>{" "}
      <Link href={`/how-we-test#${row.key}`} className={`whitespace-nowrap font-medium text-brand hover:underline ${TAP}`}>
        The method
      </Link>
    </p>
  );
}

/** An unchecked row inside the fold: the title with the OM's figure and its
 *  page, then why it stands unchecked. The OM's text is printed only where
 *  it says something the title and the reason do not ("The OM states no
 *  loan rate." is the reason already). */
function UncheckedRow({ row }: { row: StressRow }) {
  const why = row.unchecked ?? "No evidence with a figure could be read for this deal.";
  const hasFigure = row.omSays.value != null;
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
      <EvidenceList evidence={row.evidence} />
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
          <EvidenceList evidence={row.evidence} marks={at != null} />
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

            {row.impact ? (
              <ImpactView impact={row.impact} />
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

/** The verdicts' dots in the read line, drawn by the count's own element so
 *  the line's words stay one run of text. */
const DOT: Record<string, string> = {
  unsupported: "before:bg-kill",
  stretched: "before:bg-caution",
  hold: "before:bg-pass",
  holds: "before:bg-pass",
  "could not be checked": "before:bg-ink/25",
};

/**
 * The read line, word for word `stressReadLine`'s, each count kept whole on
 * its line ("1 holds" never breaks after its figure on a phone) and led by
 * its verdict's dot. The counts are `<b>`, which the line's weight already
 * is, so the words stay one run of text for a screen reader and the lints.
 */
function ReadLine({ rows }: { rows: readonly StressRow[] }) {
  const parts = stressReadLine(rows).split(/(\d+ (?:unsupported|stretched|holds?|could not be checked))/);
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
function HeadlineView({ headline: h, line }: { headline: StressHeadline; line: string }) {
  const om = h.omIrrPct;
  const ev = h.evidenceIrrPct;
  const walk: { part: StressHeadline["parts"][number]; from: number; to: number }[] = [];
  if (om != null) {
    let at = om;
    for (const part of h.parts) {
      walk.push({ part, from: at, to: at + part.pts });
      at += part.pts;
    }
  }
  const points = [0, ...(om != null ? [om] : []), ...(ev != null ? [ev] : []), ...walk.flatMap((w) => [w.from, w.to])];
  const lo = Math.min(...points);
  const hi = Math.max(...points, lo + 1);
  const span = (hi - lo) * 1.08;
  const x = (v: number) => ((v - lo) / span) * 100;
  const bar = (from: number, to: number) => ({ left: `${x(Math.min(from, to)).toFixed(2)}%`, width: `${Math.max(0.6, Math.abs(x(to) - x(from))).toFixed(2)}%` });
  const zero = lo < 0 ? x(0) : null;
  const left = h.omitted.map((o) => headlineName(o.key));
  return (
    <div className="mt-3 rounded-lg border border-line/80 bg-surface/80 px-3 py-3" data-qa="stress-headline">
      <p className={`${MEASURE} text-base font-semibold leading-snug tabular-nums text-ink`} data-qa="stress-headline-line">
        {line}
      </p>
      {h.parts.length > 0 && om != null && ev != null && (
        <BarRows className="mt-2.5 space-y-1.5 text-[11px]" qa="stress-headline-bridge">
          <BarRow label="On the OM's figures" figure={pctText(om)}>
            <div className="absolute inset-y-0 rounded-full bg-ink/40" data-bar="stress-headline-om" style={bar(0, om)} />
          </BarRow>
          {walk.map(({ part, from, to }) => (
            <BarRow key={part.key} label={part.label} figure={ptsText(part.pts)}>
              {zero != null && <Tick at={`${zero.toFixed(2)}%`} bar="stress-headline-zero" tone="bg-ink/30" track="secondary" />}
              <div
                className={`absolute inset-y-0 rounded-full ${part.pts < 0 ? "bg-kill/70" : "bg-pass/70"}`}
                data-bar="stress-headline-part"
                data-key={part.key}
                style={bar(from, to)}
              />
            </BarRow>
          ))}
          <BarRow label="With the evidence" figure={pctText(ev)}>
            <div className="absolute inset-y-0 rounded-full bg-caution/70" data-bar="stress-headline-evidence" style={bar(0, ev)} />
          </BarRow>
        </BarRows>
      )}
      <p className={`mt-2 ${MEASURE} text-[11px] leading-4 text-muted`} data-qa="stress-headline-note">
        {h.parts.length > 1
          ? "Each segment is one assumption's share of the gap, averaged over every order the swaps could be made in, so the segments add up to it; one to the right is evidence that raises the return."
          : h.parts.length === 1
            ? "One assumption the model takes is past its evidence, so the headline is that row's own re-run."
            : "Every figure the model takes is at the OM's in both runs."}
        {left.length > 0 ? ` Left out: ${left.join(", ")}.` : ""}{" "}
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
      {!test.impactsWithheld && test.headline && <HeadlineView headline={test.headline} line={headlineLine(test, "→")!} />}

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
        {published && (
          <KeyItem>{test.publishedRead ? `Published figures read ${dayText(test.readOn)}` : "Published figures as of the screen's market check"}</KeyItem>
        )}
      </Key>
    </section>
  );
}
