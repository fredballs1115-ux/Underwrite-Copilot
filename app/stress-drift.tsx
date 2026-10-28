import { BarRow, BarRows, Key, KeyItem, PanelHead, PanelNote } from "@/app/panel-parts";
import { VERDICT_CHIP } from "@/app/stress-test-panel";
import { METHOD_CHANGED, OM_FIGURE_CHANGED, driftHeadlineMoved, driftSummary, labelInSentence, type DriftFigure, type StressDrift, type StressDriftRow } from "@/lib/stress-drift";
import type { StressVerdict } from "@/lib/stress-test-types";

/**
 * The stress test since the call (lib/stress-drift) — the pure view the deal
 * page's Overview draws right under the stress-test panel, and only where
 * something moved. Display only: the verdict's own snapshot against the test
 * built today the way the call's was. A picture, not a paragraph: one line a
 * row that moved, its verdict at the call and today as the panel's own chips
 * with an arrow between them (red where the row moved away from holding,
 * green where it moved toward it), and the deciding figure then and now
 * where the same piece decided both — a different piece is said as the
 * decider changing, never drawn as one figure moving. The headline's
 * evidence case, then and with today's figures, as two bars on one scale.
 * Where the call was struck under other rules, one sentence and nothing
 * compared. Never on the shared screen.
 */

/** Words for a verdict no row had on that side. */
const NEW_CHIP = { label: "Not tested", chip: "bg-faint text-muted" };
const GONE_CHIP = { label: "Not read today", chip: "bg-faint text-muted" };

function Chip({ v, empty }: { v: StressVerdict | null; empty: { label: string; chip: string } }) {
  const c = v ? VERDICT_CHIP[v] : empty;
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${c.chip}`}>{c.label}</span>;
}

/** The two chips, the arrow between them in the move's tone. The spaces are
 *  spelt, so a screen reader reads "At the call: Holds today: Stretched"
 *  as words, never one run glued by the flex gap. */
function VerdictPair({ row }: { row: StressDriftRow }) {
  const arrow = row.direction === "worse" ? "text-kill" : row.direction === "better" ? "text-pass" : "text-muted";
  return (
    <span className="inline-flex items-center gap-1" data-qa="drift-verdicts">
      <span className="sr-only">{"At the call:"}</span>{" "}
      <Chip v={row.then} empty={NEW_CHIP} />{" "}
      <span aria-hidden className={`text-xs font-bold ${arrow}`}>
        {"→"}
      </span>{" "}
      <span className="sr-only">{"today:"}</span>{" "}
      <Chip v={row.now} empty={GONE_CHIP} />
    </span>
  );
}

const when = (f: DriftFigure) => (f.period ? ` (${f.period})` : "");

/** The deciding figure then and now: one piece's two figures with an arrow,
 *  or — where another piece decides today — the two named, no arrow. */
function FigureLine({ row }: { row: StressDriftRow }) {
  if (row.kind === "om_changed") {
    return (
      <span className="basis-full text-xs text-muted" data-qa="drift-om">
        {`${OM_FIGURE_CHANGED}, so its verdicts are not compared.`}
      </span>
    );
  }
  const a = row.thenFigure;
  const b = row.nowFigure;
  if (!a || !b) return null;
  if (row.deciderChanged) {
    return (
      <span className="basis-full text-xs text-muted" data-qa="drift-decider">
        {`Decided now by ${labelInSentence(b.label)}, not ${labelInSentence(a.label)}`}
      </span>
    );
  }
  if (a.text === b.text && a.period === b.period) return null;
  return (
    <span className="basis-full text-xs text-muted" data-qa="drift-figure">
      {`${b.label}: `}
      <span className="font-mono tabular-nums text-ink">{a.text}</span>
      {when(a)}{" "}
      <span aria-hidden>{"→"}</span>
      <span className="sr-only">{"now"}</span>{" "}
      <span className="font-mono tabular-nums text-ink">{b.text}</span>
      {`${when(b)}${row.kind === "revised" ? ", revised" : ""}`}
    </span>
  );
}

const pct1 = (n: number) => (n < 0 ? `−${Math.abs(n).toFixed(1)}%` : `${n.toFixed(1)}%`);

/** The evidence's case at the call and today, two bars on one scale. */
function HeadlineDrift({ h }: { h: NonNullable<StressDrift["headline"]> }) {
  const top = Math.max(Math.abs(h.then), Math.abs(h.now), 1);
  const width = (v: number) => `${(Math.max(0, v) / top) * 100}%`;
  const measure = h.measure === "yield_on_cost" ? "yield on cost" : "levered IRR";
  return (
    <div className="mt-2 text-xs" data-qa="drift-headline">
      <p className="text-muted">{`The evidence's case, ${measure}, at the call and with today's figures`}</p>
      <BarRows className="mt-1 space-y-1">
        <BarRow label="At the call" figure={pct1(h.then)}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-ink/30" style={{ width: width(h.then) }} data-bar="drift-then" />
        </BarRow>
        <BarRow label="Today" figure={pct1(h.now)}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: width(h.now) }} data-bar="drift-now" />
        </BarRow>
      </BarRows>
    </div>
  );
}

export function StressDriftView({ drift, className = "" }: { drift: StressDrift | null; className?: string }) {
  if (!drift || !drift.changed) return null;
  const moved = drift.rows.filter((r) => r.kind !== "same");
  const summary = driftSummary(drift);
  const headlineMoved = driftHeadlineMoved(drift);
  const lead = drift.calledOn ? (summary ? `${drift.calledOn}: ${summary}` : `Called ${drift.calledOn}`) : summary;
  return (
    <section
      aria-label="The stress test since the call"
      data-qa="stress-drift"
      className={`${className ? `${className} ` : ""}rounded-xl border border-line bg-surface px-4 py-3`}
    >
      <PanelHead title="Since the call" tone="text-brand">
        {lead && <span className="text-xs text-muted">{lead}</span>}
      </PanelHead>
      {drift.methodChanged ? (
        <PanelNote>
          <span data-qa="drift-method">{METHOD_CHANGED}</span>
        </PanelNote>
      ) : (
        <>
          {moved.length > 0 && (
            <ul className="mt-1.5 divide-y divide-line" data-qa="stress-drift-rows">
              {moved.map((r) => (
                <li key={r.key} data-qa={`drift-${r.key}`} data-drift={r.kind} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm">
                  <span className="min-w-[9rem] font-medium text-ink">{r.title}</span>{" "}
                  {r.kind !== "om_changed" && (
                    <>
                      <VerdictPair row={r} />{" "}
                    </>
                  )}
                  <FigureLine row={r} />
                </li>
              ))}
            </ul>
          )}
          {headlineMoved && <HeadlineDrift h={drift.headline!} />}
          {moved.some((r) => r.direction) && (
            <Key className="mt-2" qa="stress-drift-key">
              {moved.some((r) => r.direction === "worse") && (
                <KeyItem mark="swatch" tone="bg-kill">
                  {"Moved away from holding"}
                </KeyItem>
              )}
              {moved.some((r) => r.direction === "better") && (
                <KeyItem mark="swatch" tone="bg-pass">
                  {"Moved toward holding"}
                </KeyItem>
              )}
            </Key>
          )}
          {drift.wordsOnly && (
            <PanelNote>{"This snapshot was kept before each row's deciding figure was stored, so only the verdict words are compared."}</PanelNote>
          )}
        </>
      )}
    </section>
  );
}
