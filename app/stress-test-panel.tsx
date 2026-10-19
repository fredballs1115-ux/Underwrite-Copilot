import { Fragment } from "react";
import Link from "next/link";
import { compactUsd } from "@/lib/money";
import { BarRow, BarRows, Key, KeyItem, MEASURE, PanelFold, PanelHead, PanelNote, Tick } from "@/app/panel-parts";
import type { EvidenceKind, StressEvidence, StressImpact, StressKey, StressRow, StressTest, StressVerdict } from "@/lib/stress-test-types";

/**
 * The OM's assumptions, tested (2026-10-19, the refocus) — the pure panel
 * for `lib/stress-test`, drawn by the deal page's Overview first after the
 * call, by the shared screen under the call, and by /demo and the
 * homepage's walkthrough on the sample. Plain data in: the deal page builds
 * the test on the server from what it already holds, and this draws it.
 *
 * One row an assumption, most severe first (unsupported, stretched, holds).
 * Each tested row has its words beside its picture, so nothing rides on
 * colour:
 *
 *   - THE OM'S FIGURE, with its page as a chip, and the verdict code gave
 *     the row;
 *   - THE TRACK: the OM's figure as a dark tick, each piece of evidence that
 *     carries a figure as a mark keyed by its kind — a dot for the deal's
 *     own document and a published figure, a hollow dot for the memorandum
 *     contradicting itself, a dashed tick for a rule of thumb — and the
 *     survey's margin as a whisker where the evidence states one;
 *   - THE EVIDENCE, each item with its kind, its publisher, its date and
 *     whose figure it is (a metro's figure is the metro's, never the
 *     building's);
 *   - THE GAP in words, and THE IMPACT: the levered IRR with the OM's figure
 *     and with the evidence's, the engine run again with that one input
 *     swapped (`StressImpact`), as a pair and a small track — or "no return
 *     struck", the reason said once at the top where the model's reads are
 *     withheld;
 *   - THE CHALLENGE, the challenger's own words and its question for the
 *     broker, folded;
 *   - HOW THIS WAS TESTED: the row's method sentence, linking to the
 *     methodology page's own section for the key.
 *
 * Where the model already runs at the evidence's figure (the impact's two
 * runs are one), the pair is one figure, "Levered IRR 9.3%, as the model
 * runs", never "9.3% → 9.3%".
 *
 * THE UNCHECKED ROWS are one folded group at the end: a summary line
 * naming them ("5 assumptions unchecked: debt, rent growth, …") and a fold
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

const KIND: Record<EvidenceKind, { word: string; chip: string; mark: string }> = {
  document: { word: "The deal's own document", chip: "bg-brand/10 text-brand", mark: "bg-brand" },
  published: { word: "A published figure", chip: "bg-pass/10 text-pass", mark: "bg-pass" },
  rule_of_thumb: { word: "A rule of thumb", chip: "bg-faint text-muted", mark: "border-ink/50" },
  om_internal: { word: "The OM against itself", chip: "bg-caution/10 text-caution", mark: "border-2 border-caution bg-surface" },
};

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

/** "9 assumptions tested: 1 unsupported, 2 stretched, 1 holds, 5 unchecked" */
export function stressReadLine(rows: readonly StressRow[]): string {
  const n = (v: StressVerdict) => rows.filter((r) => r.verdict === v).length;
  const parts: [number, string][] = [
    [n("unsupported"), "unsupported"],
    [n("stretched"), "stretched"],
    [n("holds"), n("holds") === 1 ? "holds" : "hold"],
    [n("unchecked"), "unchecked"],
  ];
  const said = parts.filter(([c]) => c > 0);
  const tested = rows.length;
  return `${tested} assumption${tested === 1 ? "" : "s"} tested: ${said.map(([c, w]) => `${c} ${w}`).join(", ")}`;
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

/** "5 assumptions unchecked: debt, rent growth, real estate taxes, insurance, the renovation premium" */
export function uncheckedLine(rows: readonly StressRow[]): string {
  const n = rows.length;
  return `${n} assumption${n === 1 ? "" : "s"} unchecked: ${rows.map(uncheckedName).join(", ")}`;
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
    if (e.value == null) continue;
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

function EvidenceTrack({ row, at }: { row: StressRow; at: (v: number) => string }) {
  const om = row.omSays.value!;
  return (
    <BarRows className="mt-2 text-[11px]" qa="stress-track">
      <BarRow label="The OM against the evidence" figure={figureText(row.key, om)}>
        {row.evidence.map((e, i) => {
          if (e.value == null) return null;
          const moe = marginOf(e);
          if (e.kind === "rule_of_thumb") {
            return <Tick key={i} at={at(e.value)} bar="stress-evidence" tone={KIND.rule_of_thumb.mark} dashed track="secondary" />;
          }
          const left = at(e.value);
          return (
            <Fragment key={i}>
              {moe != null && (
                <div
                  className="absolute top-1/2 h-px -translate-y-1/2 bg-pass/60"
                  data-qa="stress-whisker"
                  style={{ left: at(e.value - moe), width: `${(parseFloat(at(e.value + moe)) - parseFloat(at(e.value - moe))).toFixed(1)}%` }}
                />
              )}
              <div
                className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${KIND[e.kind].mark}`}
                data-bar="stress-evidence"
                data-kind={e.kind}
                style={{ left }}
              />
            </Fragment>
          );
        })}
        <Tick at={at(om)} bar="stress-om" tone="bg-ink" track="secondary" />
      </BarRow>
    </BarRows>
  );
}

function ImpactView({ impact }: { impact: StressImpact }) {
  const base = impact.baseIrrPct;
  const alt = impact.altIrrPct;
  const top = Math.max(base ?? 0, alt ?? 0, 1) * 1.15;
  const width = alt == null ? "0%" : `${Math.max(0, Math.min(100, (alt / top) * 100)).toFixed(1)}%`;
  // The two runs are one where the model already runs at the evidence's
  // figure (lib/stress-test's own note): one figure, not "9.3% → 9.3%".
  const same = impact.note.startsWith("The model already runs");
  return (
    <div className="mt-2" data-qa="stress-impact">
      <p className="text-xs font-medium tabular-nums text-ink" data-qa="stress-impact-pair">
        {same ? `Levered IRR ${pctText(base)}, as the model runs` : `Levered IRR ${pctText(base)} → ${pctText(alt)}`}
      </p>
      <BarRows className="mt-1 text-[11px]">
        <BarRow label="At the evidence's figure" figure={pctText(alt)}>
          <div className="h-full rounded-full bg-caution/60" data-bar="stress-impact" style={{ width }} />
          {base != null && base > 0 && <Tick at={`${Math.min(100, (base / top) * 100).toFixed(1)}%`} tone="bg-ink" track="secondary" />}
        </BarRow>
      </BarRows>
      <p className={`mt-1 ${MEASURE} text-xs leading-relaxed`}>{impact.note}</p>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: readonly StressEvidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-1 text-[11px] leading-4" data-qa="stress-evidence-list">
      {evidence.map((e, i) => {
        const kind = KIND[e.kind];
        const when = e.asOf ? `, ${dayText(e.asOf)}` : e.kind === "rule_of_thumb" ? "" : ", undated";
        return (
          <li key={i} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5" data-evidence={e.kind}>
            <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${kind.chip}`}>{kind.word}</span>
            <span className={`${MEASURE} text-ink`}>{`${e.label}: ${e.text}`}</span>
            <span className="text-muted">{`— ${e.publisher}${when} · ${SCOPE[e.scope]}`}</span>
            {e.href && (
              <a href={e.href} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                Source
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PageChip({ page }: { page: number | null }) {
  return (
    <span className="rounded-full border border-line px-1.5 py-px text-[10px] text-muted" data-qa="stress-page">
      {page != null ? `OM p. ${page}` : "OM"}
    </span>
  );
}

function ChallengeFold({ challenge }: { challenge: NonNullable<StressRow["challenge"]> }) {
  return (
    <div className="mt-1.5" data-qa="stress-challenge">
      <p className="text-[11px] font-semibold text-muted">{`The challenge · ${SEVERITY[challenge.severity]} severity`}</p>
      <PanelFold rest={[challenge.challenge, `Ask the broker: ${challenge.question}`]} />
    </div>
  );
}

function MethodLine({ row }: { row: StressRow }) {
  return (
    <p className={`mt-1.5 ${MEASURE} text-[11px] leading-4 text-muted`} data-qa="stress-method">
      <span>{`How this was tested: ${row.method}`}</span>{" "}
      <Link href={`/how-we-test#${row.key}`} className="text-brand hover:underline">
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

function RowView({ row, withheld }: { row: StressRow; withheld: string | null }) {
  const v = VERDICT[row.verdict];
  const at = trackScale(row);
  const hasFigure = row.omSays.value != null;
  return (
    <li className="py-3 first:pt-2 last:pb-1" data-qa={`stress-row-${row.key}`} data-verdict={row.verdict}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${v.chip}`}>{v.label}</span>
        <h3 className="text-sm font-semibold text-ink">{row.title}</h3>
        {hasFigure && <PageChip page={row.omSays.page} />}
      </div>
      <p className={`mt-0.5 ${MEASURE} text-xs text-muted`}>{row.omSays.text}</p>

      {at && <EvidenceTrack row={row} at={at} />}
      <EvidenceList evidence={row.evidence} />

      {row.gap ? (
        <p className={`mt-1.5 ${MEASURE} text-xs leading-relaxed text-ink`} data-qa="stress-gap">{row.gap.text}</p>
      ) : row.unchecked ? (
        <p className={`mt-1.5 ${MEASURE} text-xs leading-relaxed text-muted`} data-qa="stress-unchecked">{row.unchecked}</p>
      ) : null}

      {row.impact ? (
        <ImpactView impact={row.impact} />
      ) : (
        <p className="mt-1.5 text-[11px] text-muted" data-qa="stress-no-impact">
          {withheld ? "No return struck: the model's reads are withheld (see above)." : "No return struck: no figure the engine can take."}
        </p>
      )}

      {row.challenge && <ChallengeFold challenge={row.challenge} />}
      <MethodLine row={row} />
    </li>
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
  for (const r of test.rows) for (const e of r.evidence) if (e.value != null && trackScale(r)) kindsShown.add(e.kind);

  return (
    <section
      aria-label="The OM's assumptions, tested"
      data-qa="stress-test-panel"
      className={`${className ? `${className} ` : ""}rounded-xl border border-l-4 px-4 py-3 ${tone.border}`}
    >
      <PanelHead title="The OM's assumptions, tested" tone={tone.head}>
        <span className="text-sm font-semibold" data-qa="stress-read">{stressReadLine(test.rows)}</span>
      </PanelHead>
      {test.impactsWithheld && <PanelNote>{`No return struck: ${test.impactsWithheld}`}</PanelNote>}

      {tested.length > 0 && (
        <ol className="mt-2 divide-y divide-line" data-qa="stress-rows">
          {tested.map((r, i) => (
            <RowView key={`${r.key}-${i}`} row={r} withheld={test.impactsWithheld} />
          ))}
        </ol>
      )}
      <UncheckedGroup rows={unchecked} />

      <Key className="mt-2 border-t border-line pt-2" qa="stress-key">
        <KeyItem mark="tick" tone="bg-ink">
          {"The OM's figure"}
        </KeyItem>
        {kindsShown.has("document") && (
          <KeyItem mark="swatch" tone={KIND.document.mark}>
            {KIND.document.word}
          </KeyItem>
        )}
        {kindsShown.has("published") && (
          <KeyItem mark="swatch" tone={KIND.published.mark}>
            {KIND.published.word}
          </KeyItem>
        )}
        {kindsShown.has("rule_of_thumb") && (
          <KeyItem mark="dashed" tone={KIND.rule_of_thumb.mark}>
            {KIND.rule_of_thumb.word}
          </KeyItem>
        )}
        {kindsShown.has("om_internal") && (
          <KeyItem mark="swatch" tone={KIND.om_internal.mark}>
            {KIND.om_internal.word}
          </KeyItem>
        )}
        {published && <KeyItem>{`Published figures read ${dayText(test.readOn)}`}</KeyItem>}
      </Key>
    </section>
  );
}
