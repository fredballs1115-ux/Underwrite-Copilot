import { datedLong } from "@/lib/debt-index";
import type { CheckTone, FigureMark, ModelCheck, ModelVsMarket, PublishedFigure } from "@/lib/model-vs-market";
import { readGrainNote, readScope } from "@/lib/model-vs-market-scope";
import { Key, KeyItem, MEASURE, Tick } from "@/app/panel-parts";

/**
 * The model's assumptions against the published figures — the pure card
 * for `lib/model-vs-market`. One row an assumption: the model's figure,
 * where it came from, a chip saying which way it runs against the
 * published figures, and the one sentence that names the figures with
 * their dates and publishers. Nothing here is a verdict; the header says
 * what a trailing year is and is not.
 */
const TONE_CLASS: Record<CheckTone, string> = {
  ahead: "bg-caution/10 text-caution",
  behind: "bg-brand/10 text-brand",
  inside: "bg-pass/10 text-pass",
  tighter: "bg-caution/10 text-caution",
  looser: "bg-brand/10 text-brand",
  widens: "bg-pass/10 text-pass",
  compresses: "bg-kill/10 text-kill",
  level: "bg-faint text-muted",
  stated: "bg-faint text-muted",
  aside: "bg-faint text-muted",
  // Research past its limit (lib/research-age): shown, named, held to nothing.
  stale: "bg-caution/10 text-caution",
  // A figure the sector leaderboard would not rank for its own period: the
  // same.
  undated: "bg-caution/10 text-caution",
  old: "bg-caution/10 text-caution",
};

export function ModelVsMarketCard({ read }: { read: ModelVsMarket | null }) {
  if (!read || read.checks.length === 0) return null;
  // The one scope sentence the report and the workbook print too
  // (lib/model-vs-market-scope): a deal outside the covered metros reads its
  // state's rows, and the sentence says so rather than calling a state a
  // market; the figures are the published ones, a forecast among them.
  const scope = readScope(read, datedLong(read.readOn));
  const grainNote = readGrainNote(read);
  return (
    <section
      className="rounded-2xl border border-line bg-surface shadow-card"
      data-qa="model-vs-market"
      aria-labelledby="model-vs-market-heading"
    >
      <div className="border-b border-line px-5 py-4">
        <h2 id="model-vs-market-heading" className="text-sm font-semibold tracking-tight">
          Assumptions against the published figures
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {`${scope} A trailing year is what an assumption is being asked to beat, not a forecast; ${grainNote}`}
        </p>
      </div>
      <ul className="divide-y divide-line">
        {read.checks.map((c) => (
          <li key={c.key} className="px-5 py-3" data-qa={`model-check-${c.key}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">{c.title}</span>
              <span className="font-mono text-sm tabular-nums">{c.model}</span>
              <span className="text-xs text-muted">{c.modelSource}</span>
              <span
                className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${TONE_CLASS[c.tone]}`}
              >
                {c.toneLabel}
              </span>
            </div>
            {stripOf(c) ? (
              <>
                <CheckStrip check={c} />
                {/* The sentence the report and the workbook print, whole in
                    the HTML, one tap under the picture that says it. */}
                <details className={`group mt-1.5 ${MEASURE} text-xs leading-relaxed text-muted`}>
                  <summary className="cursor-pointer font-semibold text-brand hover:underline pointer-coarse:py-2.5">
                    <span className="group-open:hidden">Read it in words</span>
                    <span className="hidden group-open:inline">Less</span>
                  </summary>
                  <p className="mt-1">{c.read}</p>
                </details>
              </>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-muted">{c.read}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A row's picture, where it has one: the model's figure and one mark a
 *  published figure. The exit cap's row has none — its claim is a spread
 *  against a spread, said in words. */
function stripOf(c: ModelCheck): { model: number; marks: FigureMark[] } | null {
  if (c.key === "exit_cap") return null;
  if (c.modelValue == null || !Number.isFinite(c.modelValue)) return null;
  if (!c.marks || c.marks.length !== c.published.length || c.published.length === 0) return null;
  return { model: c.modelValue, marks: c.marks };
}

/** Where a value falls on the row's scale, a CSS percentage. */
function at(value: number, [a, b]: readonly [number, number]): string {
  const share = b > a ? (value - a) / (b - a) : 0.5;
  return `${(Math.min(1, Math.max(0, share)) * 100).toFixed(2)}%`;
}

/** A figure is the nation's: the key says so, unless its label already does. */
function keyWords(p: PublishedFigure, m: FigureMark): string {
  const nation = m.nation && !/\bnation(al)?\b/i.test(p.label) ? ", the nation's" : "";
  return `${p.label}: ${p.text}${nation} (${p.publisher})`;
}

/**
 * One row as a strip: the published figures as ticks on one percent scale,
 * the range the chip reads filled between them, a survey's margin as a
 * whisker, and the model's assumption as a marker; the figures shown apart
 * from that range — an allowance, the insurance index, the breakeven, a
 * tracker's read beside the survey — on a track of their own beneath it, on
 * the same scale. Levels only: every figure is drawn at its own value.
 */
function CheckStrip({ check }: { check: ModelCheck }) {
  const s = stripOf(check)!;
  const figures = check.published.map((p, i) => ({ p, m: s.marks[i] }));
  const ends = figures.flatMap(({ p, m }) => (m.moe != null ? [p.value - m.moe, p.value + m.moe] : [p.value]));
  const lo0 = Math.min(s.model, ...ends);
  const hi0 = Math.max(s.model, ...ends);
  const pad = Math.max((hi0 - lo0) * 0.1, 0.5);
  const domain: [number, number] = [lo0 - pad, hi0 + pad];
  const range = figures.filter((f) => f.m.role === "range").map((f) => f.p.value);
  const main = figures.filter((f) => f.m.role !== "apart");
  const apart = figures.filter((f) => f.m.role === "apart");
  const marker = (bar: string) => (
    <div className="pointer-events-none absolute inset-y-0 left-px right-px">
      <span
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-surface"
        data-bar={bar}
        style={{ left: at(s.model, domain) }}
      />
    </div>
  );
  return (
    <figure className="m-0 mt-2" data-qa={`model-strip-${check.key}`}>
      <div className="relative h-3 rounded-full bg-faint" aria-hidden>
        {range.length > 1 && (
          <div className="absolute inset-y-0 left-px right-px">
            <div
              className="absolute inset-y-0 rounded-full bg-ink/10"
              data-bar="mvm-range"
              style={{
                left: at(Math.min(...range), domain),
                width: `calc(${at(Math.max(...range), domain)} - ${at(Math.min(...range), domain)})`,
              }}
            />
          </div>
        )}
        {main.map(({ p, m }, i) =>
          m.moe != null ? (
            <div key={`w${i}`} className="absolute inset-y-0 left-px right-px">
              <div
                className="absolute top-1/2 h-2 -translate-y-1/2 border-x-2 border-ink"
                data-bar="mvm-moe"
                style={{ left: at(p.value - m.moe, domain), width: `calc(${at(p.value + m.moe, domain)} - ${at(p.value - m.moe, domain)})` }}
              >
                <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-ink" />
              </div>
            </div>
          ) : null,
        )}
        {main.map(({ p, m }, i) => (
          <Tick
            key={i}
            at={at(p.value, domain)}
            bar={m.role === "range" ? "mvm-figure" : "mvm-beside"}
            tone={m.role === "range" ? "bg-ink" : "bg-muted"}
          />
        ))}
        {marker("mvm-model")}
      </div>
      {apart.length > 0 && (
        <div className="relative mt-2 h-2 rounded-full bg-faint" aria-hidden data-qa="model-strip-apart">
          {apart.map(({ p }, i) => (
            <Tick key={i} at={at(p.value, domain)} bar="mvm-apart" tone="border-caution" dashed track="secondary" />
          ))}
          <Tick at={at(s.model, domain)} bar="mvm-model-apart" tone="bg-brand/40" track="secondary" />
        </div>
      )}
      <Key>
        <KeyItem mark="swatch" tone="bg-brand">
          {`The model: ${check.model}`}
        </KeyItem>
        {main.map(({ p, m }, i) => (
          <KeyItem key={i} mark="tick" tone={m.role === "range" ? "bg-ink" : "bg-muted"}>
            {`${keyWords(p, m)}${m.role === "beside" ? ", shown beside" : ""}`}
          </KeyItem>
        ))}
        {apart.map(({ p, m }, i) => (
          <KeyItem key={`a${i}`} mark="dashed" tone="border-caution">
            {`${keyWords(p, m)} — shown apart, not in the range`}
          </KeyItem>
        ))}
      </Key>
    </figure>
  );
}
