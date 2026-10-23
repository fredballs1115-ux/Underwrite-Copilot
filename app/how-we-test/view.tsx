import Link from "next/link";
import {
  CADENCE_RULE,
  CANNOT,
  HEADLINE_METHOD,
  HOW_WE_TEST_MARKER,
  HOW_WE_TEST_TITLE,
  KIND_LABEL,
  PUBLISHERS,
  SCORING_RULE,
  SCREENING_MODEL_SECTION,
  STRESS_METHODS,
  TRACK_RECORD,
  VERDICT_RULES,
  VERDICT_WORDS,
  WHO_DOES_WHAT,
  engineReruns,
  evidenceKindOf,
} from "@/lib/how-we-test";
import type { StressMethod, StressRow, StressTest, StressVerdict } from "@/lib/stress-test-types";
import { drawsRerun } from "@/lib/stress-test-words";
import { StressRowExample, sortStressRows } from "@/app/stress-test-panel";
import { SAMPLE_PLAN_NOTE, SCENARIO_KIND_WORD } from "@/lib/stress-test-words";
import { STRESS_TEST_ANCHOR } from "@/app/(app)/deals/[id]/stress-chip";
import { BarRow, BarRows, Key, KeyItem, Tick } from "@/app/panel-parts";
import { NOT_TESTED, NOT_TESTED_HEADING, NOT_TESTED_ID, NOT_TESTED_LINK, type NotTested } from "@/lib/not-tested";

/**
 * The methodology page, pure (2026-10-19): one section an assumption the
 * screen tests, drawn from lib/stress-test-types' STRESS_METHODS in the
 * table's order and the table's words, never copied by hand — so what the
 * page says of a test is what the reader of a stress-test row does. The
 * page's own words (who does what, the publishers, the cadence rule, what
 * a test cannot do) are lib/how-we-test's. No hooks and no I/O:
 * lib/how-we-test.render.test.ts draws it and reads its text.
 *
 * The public pages' rule: one idea a section, a picture where a picture
 * will do, no paragraph past a line.
 */

// The stress-test panel's own tones a kind and a verdict
// (app/stress-test-panel `KIND`, `VERDICT`), so the page and the panel mark
// one kind of evidence, and one verdict, alike.
const KIND_TONE: Record<string, string> = {
  published: "bg-pass/10 text-pass",
  document: "bg-brand/10 text-brand",
  rule_of_thumb: "bg-faint text-muted",
  om_internal: "bg-caution/10 text-caution",
};

const VERDICT_TONE: Record<StressVerdict, string> = {
  unsupported: "bg-kill/10 text-kill",
  stretched: "bg-caution/10 text-caution",
  holds: "bg-pass/10 text-pass",
  unchecked: "bg-faint text-muted",
};

/**
 * The schematic a section opens on: a track with the OM's mark and the
 * evidence's, and an arrow to the IRR — the gap between the two marks is
 * what the engine runs. Purely illustrative: no figures, and hidden from a
 * screen reader, which has the words beneath it. Where the engine swaps no
 * figure (the renovation premium, the challenger's other points) the arrow
 * is dashed.
 */
function MethodPicture({ reruns }: { reruns: boolean }) {
  return (
    <svg
      viewBox="0 0 320 60"
      className="h-14 w-full max-w-sm"
      aria-hidden="true"
      focusable="false"
      data-qa="method-picture"
    >
      {/* the track */}
      <line x1="16" y1="30" x2="208" y2="30" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" strokeLinecap="round" />
      {/* the OM's mark */}
      <line x1="72" y1="18" x2="72" y2="42" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      <text x="72" y="12" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.7">
        OM
      </text>
      {/* the evidence's mark */}
      <circle cx="152" cy="30" r="5" className="fill-brand" />
      <text x="152" y="54" textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.7">
        evidence
      </text>
      {/* the gap between them */}
      <line x1="72" y1="30" x2="152" y2="30" className="stroke-brand" strokeWidth="3" strokeLinecap="round" />
      {/* the arrow to the return */}
      <line
        x1="222"
        y1="30"
        x2="268"
        y2="30"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={reruns ? undefined : "4 4"}
      />
      <path d="M262 24 L270 30 L262 36" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="296" y="34" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor">
        IRR
      </text>
    </svg>
  );
}

function KindMark({ item }: { item: string }) {
  const kind = evidenceKindOf(item);
  if (!kind) return null;
  return (
    <span
      className={`mr-2 inline-block rounded px-1.5 py-0.5 align-middle text-[11px] font-medium ${KIND_TONE[kind]}`}
      data-kind={kind}
    >
      {/* A scenario struck on the memorandum's own figures is marked as one,
          as the panel marks its piece (lib/stress-test-words). */}
      {/^A scenario\b/.test(item) ? SCENARIO_KIND_WORD : KIND_LABEL[kind]}
    </span>
  );
}

function MethodSection({ method, index }: { method: StressMethod; index: number }) {
  return (
    <section id={method.key} className="rounded-2xl border border-line bg-surface p-5 sm:p-6" data-method={method.key}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {`${index + 1} of ${STRESS_METHODS.length}`}
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{method.title}</h2>
      <p className="mt-2 text-sm italic text-muted">{`The OM's claim: ${method.claim}`}</p>
      <div className="mt-3 text-ink">
        <MethodPicture reruns={engineReruns(method)} />
      </div>
      <h3 className="mt-3 text-xs font-medium uppercase tracking-wider text-muted">Set against</h3>
      <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed">
        {method.against.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <span>
              <KindMark item={item} />
              {item}
            </span>
          </li>
        ))}
      </ul>
      <h3 className="mt-4 text-xs font-medium uppercase tracking-wider text-muted">How the verdict is struck</h3>
      <p className="mt-1.5 text-sm leading-relaxed" data-qa="verdict-rule">
        {VERDICT_RULES[method.key]}
      </p>
      <h3 className="mt-4 text-xs font-medium uppercase tracking-wider text-muted">What the engine does</h3>
      <p className="mt-1.5 text-sm leading-relaxed">{method.engine}</p>
      <h3 className="mt-4 text-xs font-medium uppercase tracking-wider text-muted">Not checked</h3>
      <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-muted">
        {method.limits.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The headline's schematic: a bar for the OM's case, segments a swap each
 * stepping from its end, and a bar for the evidence's case ending where the
 * last segment does. No figures; hidden from a screen reader, which has the
 * words beneath it.
 */
function HeadlinePicture() {
  const rows: { x: number; w: number; tone: string }[] = [
    { x: 16, w: 200, tone: "fill-current opacity-40" },
    { x: 176, w: 40, tone: "fill-kill opacity-70" },
    { x: 146, w: 30, tone: "fill-kill opacity-70" },
    { x: 146, w: 22, tone: "fill-pass opacity-70" },
    { x: 16, w: 152, tone: "fill-caution opacity-70" },
  ];
  return (
    <svg viewBox="0 0 240 78" className="h-20 w-full max-w-xs" aria-hidden="true" focusable="false" data-qa="headline-picture">
      {rows.map((r, i) => (
        <rect key={i} x={r.x} y={6 + i * 14} width={r.w} height="8" rx="4" className={r.tone} />
      ))}
    </svg>
  );
}

/** The headline's section: what each case holds, how the gap is split,
 *  the overlap rule and what is left out — HEADLINE_METHOD's words. */
function HeadlineSection() {
  const m = HEADLINE_METHOD;
  const lists: { heading: string; items: readonly string[]; tone: string }[] = [
    { heading: "The two cases", items: [...m.omCase, ...m.evidenceCase], tone: "" },
    { heading: "The split", items: [...m.split, ...m.overlap], tone: "" },
    { heading: "On a plan deal", items: m.plan, tone: "" },
    { heading: "Not in it", items: m.limits, tone: "text-muted" },
  ];
  return (
    <section id="headline" className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6" data-qa="headline-method">
      <h2 className="text-lg font-semibold tracking-tight">{m.title}</h2>
      <p className="mt-2 text-sm italic text-muted">{m.claim}</p>
      <div className="mt-3 text-ink">
        <HeadlinePicture />
      </div>
      {lists.map((l) => (
        <div key={l.heading}>
          <h3 className="mt-4 text-xs font-medium uppercase tracking-wider text-muted">{l.heading}</h3>
          <ul className={`mt-1.5 space-y-1.5 text-sm leading-relaxed ${l.tone}`}>
            {l.items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// Where the rule's picture puts its marks, a share of the track: the OM's
// figure, the end of the row's margin past it, a later figure past that.
// Placed for legibility, not measured: the rule has no figures of its own.
const RULE_OM = 35;
const RULE_MARGIN_END = 50;
const RULE_LATER = 72;

/**
 * The scoring rule as a picture (lib/track-record `scoreTestRow`), drawn with
 * the deal panels' own parts (app/panel-parts): a track from better for the
 * buyer to worse, the OM's figure ticked and the row's margin shaded past
 * it, a later figure dashed; under it, where a flag and a hold come out
 * right and wrong. Captioned as the rule, with no figure in it; its key says
 * every mark in words, since the bars are hidden from a screen reader.
 */
function ScoringRulePicture() {
  const r = SCORING_RULE;
  const span = (from: number, to: number, tone: string, bar: string) => (
    <span className={`absolute inset-y-0 ${tone} ${from === 0 ? "rounded-l-full" : ""} ${to === 100 ? "rounded-r-full" : ""}`} style={{ left: `${from}%`, width: `${to - from}%` }} data-bar={bar} />
  );
  return (
    <figure className="mt-3 rounded-2xl border border-line bg-surface p-4" data-qa="scoring-rule">
      <figcaption className="text-xs font-medium uppercase tracking-wider text-muted">{r.caption}</figcaption>
      <p className="mt-2 flex justify-between text-[11px] text-muted">
        <span>{r.axis.better}</span>
        <span>{r.axis.worse}</span>
      </p>
      <BarRows className="mt-1 space-y-2 text-xs" qa="scoring-rule-rows">
        <BarRow label={r.row} figure="">
          {span(RULE_OM, RULE_MARGIN_END, "bg-caution/40", "rule-margin")}
          <Tick at={`${RULE_OM}%`} bar="rule-om" track="secondary" />
          <Tick at={`${RULE_LATER}%`} bar="rule-later" dashed tone="border-ink" track="secondary" />
        </BarRow>
        <BarRow label={r.flag} figure="">
          {span(0, RULE_MARGIN_END, "bg-kill/70", "rule-flag-wrong")}
          {span(RULE_MARGIN_END, 100, "bg-pass", "rule-flag-right")}
        </BarRow>
        <BarRow label={r.hold} figure="">
          {span(0, RULE_MARGIN_END, "bg-pass", "rule-hold-right")}
          {span(RULE_MARGIN_END, 100, "bg-kill/70", "rule-hold-wrong")}
        </BarRow>
      </BarRows>
      <Key stack className="mt-3">
        <KeyItem mark="tick" tone="bg-ink">
          {r.om}
        </KeyItem>
        <KeyItem mark="swatch" tone="bg-caution/40">
          {r.margin}
        </KeyItem>
        <KeyItem mark="dashed" tone="border-ink">
          {r.later}
        </KeyItem>
        <KeyItem mark="swatch" tone="bg-pass">
          {r.right}
        </KeyItem>
        <KeyItem mark="swatch" tone="bg-kill/70">
          {r.wrong}
        </KeyItem>
      </Key>
    </figure>
  );
}

/** Where an item's "beside it" line comes from, as the reader meets it: a
 *  tested row by its section's title (linked), or the headline. */
function besideSource(key: NonNullable<NotTested["beside"]>["key"]): { href: string; title: string } | null {
  if (key === "headline") return { href: "#headline", title: "the headline" };
  const m = STRESS_METHODS.find((s) => s.key === key);
  // "The NOI" reads "the NOI" mid-sentence; an acronym keeps its capitals.
  return m ? { href: `#${m.key}`, title: `${m.title[0].toLowerCase()}${m.title.slice(1)}` } : null;
}

/**
 * What the test does not check yet (lib/not-tested), beside the methods:
 * a tile a claim, its title, why it is not tested, and — where a tested row
 * shows part of it — that row named and linked. A grid of short tiles,
 * never a paragraph.
 */
function NotTestedSection() {
  return (
    <section className="mt-12" id={NOT_TESTED_ID} data-qa="not-tested" aria-labelledby={`${NOT_TESTED_ID}-heading`}>
      <h2 id={`${NOT_TESTED_ID}-heading`} className="text-lg font-semibold tracking-tight">
        {NOT_TESTED_HEADING}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {NOT_TESTED.map((item) => {
          const from = item.beside ? besideSource(item.beside.key) : null;
          return (
            <li key={item.id} className="rounded-2xl border border-dashed border-line bg-surface p-4" data-not-tested={item.id}>
              <h3 className="flex items-start gap-2 text-sm font-semibold tracking-tight">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line" aria-hidden="true" />
                <span>{item.title}</span>
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{item.why}</p>
              {item.beside && from && (
                <p className="mt-2 text-xs leading-relaxed text-muted" data-qa="not-tested-beside">
                  <a href={from.href} className="font-medium text-brand hover:text-brand-strong">
                    {`Beside it, ${from.title}:`}
                  </a>{" "}
                  {item.beside.line}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The row the page shows as its worked example: the sample's first row, by
 * the panel's own order (the most severe first), that re-runs the return —
 * else the first it tested at all. None where the build tested nothing.
 */
export function exampleRowOf(test: StressTest | null): StressRow | null {
  if (!test) return null;
  const tested = sortStressRows(test.rows).filter((r) => r.verdict !== "unchecked");
  return tested.find(drawsRerun) ?? tested[0] ?? null;
}

/** One row of the sample's stress test, as the panel draws it, ahead of
 *  the rules it follows: a reader sees a test before reading how one is
 *  struck. The sample's one build (lib/sample-stress), handed in by the
 *  page; nothing here is typed. */
function WorkedExample({ test }: { test: StressTest }) {
  const row = exampleRowOf(test);
  if (!row) return null;
  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6" data-qa="worked-example" aria-labelledby="worked-example">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">Illustrative sample</p>
      <h2 id="worked-example" className="mt-1 text-lg font-semibold tracking-tight">
        One row of the sample test
      </h2>
      <p className="mt-1 text-sm text-muted">An invented deal, struck by the same code as yours.</p>
      <div className="mt-2">
        <StressRowExample row={row} test={test} />
      </div>
      {/* A re-run is the stabilized deal's: said, as on every other surface
          that draws the sample's re-runs. */}
      {!test.impactsWithheld && row.impact && (
        <p className="mt-1 text-xs leading-relaxed text-muted" data-qa="sample-plan-note">
          {SAMPLE_PLAN_NOTE}
        </p>
      )}
      <Link href={`/demo#${STRESS_TEST_ANCHOR}`} className="mt-3 inline-block text-sm font-medium text-brand hover:text-brand-strong">
        See the whole sample test
      </Link>
    </section>
  );
}

export function HowWeTestView({ example = null }: { example?: StressTest | null }) {
  return (
    <div className="mx-auto w-full max-w-3xl" data-qa="how-we-test">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{HOW_WE_TEST_TITLE}</h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        A memorandum&apos;s key assumptions are each set against evidence a buyer can check.
      </p>
      <p className="mt-1 text-base leading-relaxed text-muted">
        A dated published figure, the deal&apos;s own documents, or a rule of thumb named as one.
      </p>
      <p className="mt-1 text-base leading-relaxed text-muted">
        Then the return is run again with the evidence&apos;s figure in the OM&apos;s place.
      </p>
      <p className="mt-3 text-sm font-medium text-ink" data-qa="how-we-test-marker">
        {HOW_WE_TEST_MARKER}
      </p>
      <p className="mt-2 text-sm">
        <a href={`#${NOT_TESTED_ID}`} className="font-medium text-brand hover:text-brand-strong" data-qa="not-tested-link">
          {NOT_TESTED_LINK}
        </a>
      </p>

      {example && <WorkedExample test={example} />}

      <div className="mt-8 grid gap-4 sm:grid-cols-2" data-qa="who-does-what">
        {[WHO_DOES_WHAT.ai, WHO_DOES_WHAT.code].map((side) => (
          <section key={side.heading} className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold tracking-tight">{side.heading}</h2>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
              {side.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-8" id="verdicts" data-qa="verdict-words">
        <h2 className="text-lg font-semibold tracking-tight">The four verdict words</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed">
          {VERDICT_WORDS.map((v) => (
            <li key={v.word} className="flex items-start gap-3">
              <span className={`mt-0.5 inline-block w-24 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-medium ${VERDICT_TONE[v.word]}`}>
                {v.word}
              </span>
              <span className="text-muted">{v.line}</span>
            </li>
          ))}
        </ul>
      </section>
      <HeadlineSection />

      {/* The model every row's return is re-run on, and the rule its growth
          and exit are set by: the one place the whole rule is said. */}
      <section id={SCREENING_MODEL_SECTION.id} className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-6" data-qa="screening-model">
        <h2 className="text-lg font-semibold tracking-tight">{SCREENING_MODEL_SECTION.heading}</h2>
        <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted">
          {SCREENING_MODEL_SECTION.lines.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label="The assumptions tested" className="mt-8">
        <ul className="flex flex-wrap gap-2 text-xs">
          {STRESS_METHODS.map((m) => (
            <li key={m.key}>
              <a href={`#${m.key}`} className="rounded-full border border-line px-2.5 py-1 text-muted transition-colors hover:text-ink">
                {m.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 space-y-5">
        {STRESS_METHODS.map((m, i) => (
          <MethodSection key={m.key} method={m} index={i} />
        ))}
      </div>

      <NotTestedSection />

      <section className="mt-12" id="sources" data-qa="figure-sources">
        <h2 className="text-lg font-semibold tracking-tight">Where the figures come from</h2>
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
          {PUBLISHERS.map((p) => (
            <li key={p.name} className="p-4 text-sm leading-relaxed">
              <p className="font-medium">
                {p.href ? (
                  p.href.startsWith("/") ? (
                    <Link href={p.href} className="text-brand hover:text-brand-strong">
                      {p.name}
                    </Link>
                  ) : (
                    <a href={p.href} className="text-brand hover:text-brand-strong" rel="noreferrer">
                      {p.name}
                    </a>
                  )
                ) : (
                  p.name
                )}
              </p>
              <p className="text-muted">{p.reads}</p>
              {p.notice && (
                <p className="mt-1 text-xs text-muted" data-qa="publisher-notice">
                  {p.notice}
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-2xl border border-line bg-faint p-4" data-qa="cadence-rule">
          <h3 className="text-sm font-semibold tracking-tight">{CADENCE_RULE.heading}</h3>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted">
            {CADENCE_RULE.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-12" id="track-record" data-qa="track-record">
        <h2 className="text-lg font-semibold tracking-tight">{TRACK_RECORD.heading}</h2>
        <ScoringRulePicture />
        <ul className="mt-3 space-y-1.5 rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed text-muted">
          {TRACK_RECORD.lines.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" id="limits" data-qa="cannot">
        <h2 className="text-lg font-semibold tracking-tight">What a stress test cannot do</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CANNOT.map((c) => (
            <div key={c.heading} className="rounded-2xl border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold tracking-tight">{c.heading}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{c.line}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight">See it on the sample deal</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">Start with the sample test, or upload an OM of your own and test it.</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {/* Where the homepage's own call to action goes (app/page.tsx). */}
          <Link href="/login?mode=signup" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong">
            Get started free
          </Link>
          <Link href="/demo" className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint">
            Sample test
          </Link>
          <Link href="/why" className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint">
            Why Underwrite Copilot
          </Link>
        </div>
      </div>
    </div>
  );
}
