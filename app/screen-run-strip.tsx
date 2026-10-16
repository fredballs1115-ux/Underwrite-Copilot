import Link from "next/link";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import type { CompSupport, DealKiller, MarketAssessment } from "@/lib/anthropic/types";
import { PausableTicker } from "./pausable-ticker";

/** The trace's animation-play-state: running until its pause button says. */
const PLAY = "var(--screenrun-play, running)";

/** What the verdict calls each lever on its deal-killer cards, and the
 *  words the comp and market sections rate with — the product's own
 *  (deal-sections' LEVER_META, COMP_RATING and TONE, lower-cased).
 *  This file is a server component and cannot read a client module's
 *  values (each would arrive as a client reference), so
 *  lib/home.render.test.ts holds these words to the product's maps. */
export const STRIP_WORDS = {
  lever: { basis: "basis", exit: "exit", debt: "debt" } satisfies Record<DealKiller["lever"], string>,
  comp: { stretched: "stretched", favorable: "leans favorable", supports: "supports" } satisfies Record<CompSupport, string>,
  market: { aggressive: "aggressive", conservative: "conservative", "in-line": "in-line" } satisfies Record<MarketAssessment, string>,
};

/** The pipeline's own steps, in its order (deal-view's PIPELINE, which the
 *  deal page's progress rail counts as "Step N of 6"); the reconciliation
 *  is a run of its own, made once the buyer adds a model. */
export const STRIP_STAGES = ["signal", "extract", "challenge", "comps", "market", "verdict", "reconcile"] as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "2 high · 1 med": the counts in the order given, the zeros left out. */
function tally<K extends string>(items: K[], order: [K, string][]): string {
  return order
    .map(([k, word]) => [items.filter((i) => i === k).length, word] as const)
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}`)
    .join(" · ");
}

/** The trace's lines, one a stage, each crediting the stage with what IT
 *  writes on the sample: the signal its headline figures, the extraction
 *  its cited figures, the challenger its challenges and their questions for
 *  the broker, the comp scrutiny its ratings, the market check its reads
 *  against rules of thumb, and the verdict its ranges and the three
 *  deal-killers (lib/anthropic/prompts `verdictInstruction` — they had been
 *  credited to the challenger). */
export function screenRunLines(): [(typeof STRIP_STAGES)[number], string][] {
  const ex = SAMPLE_DEAL.extraction;
  const stated = (label: string) => ex.metrics.find((m) => m.label === label)?.value ?? "";
  const headline = [
    stated("Asking price"),
    stated("Units") && `${stated("Units")} units`,
    stated("Going-in cap") && `${stated("Going-in cap")} cap`,
  ]
    .filter(Boolean)
    .join(" · ");
  const cited = ex.metrics.filter((m) => m.page).length;
  const flagged = ex.metrics.filter((m) => m.flagged).length;
  const challenges = SAMPLE_DEAL.challenges.challenges;
  const asked = challenges.filter((c) => c.question).length;
  const comps = [...SAMPLE_DEAL.comps.saleComps, ...SAMPLE_DEAL.comps.leaseComps];
  const flags = SAMPLE_DEAL.comps.redFlags.length;
  const checks = SAMPLE_DEAL.market.checks;
  const screen = SAMPLE_DEAL.verdict.screen;
  const levers = (["basis", "exit", "debt"] as const).filter((l) =>
    (screen?.dealKillers ?? []).some((k) => k.lever === l),
  );
  // The gaps the sample's own reconciliation calls — a row in agreement is
  // not a gap.
  const gapCount = SAMPLE_DEAL.reconciliation.rows.filter((r) => r.direction !== "neutral").length;
  const verdictWord =
    SAMPLE_DEAL.verdict.verdict === "pass"
      ? "Go"
      : SAMPLE_DEAL.verdict.verdict === "pass_on"
        ? "No-go"
        : "Caution";
  const severities = tally(
    challenges.map((c) => c.severity),
    [["high", "high"], ["medium", "med"], ["low", "low"]],
  );
  const ratings = tally(
    comps.map((c) => c.support),
    [["stretched", STRIP_WORDS.comp.stretched], ["favorable", STRIP_WORDS.comp.favorable], ["supports", STRIP_WORDS.comp.supports]],
  );
  const reads = tally(
    checks.map((c) => c.assessment),
    [["aggressive", STRIP_WORDS.market.aggressive], ["conservative", STRIP_WORDS.market.conservative], ["in-line", STRIP_WORDS.market["in-line"]]],
  );
  return [
    ["signal", `the headline figures first: ${headline}`],
    [
      "extract",
      `${plural(ex.metrics.length, "figure")} pulled, ${cited === ex.metrics.length ? "each" : cited} with its OM page · ${flagged} flagged to verify`,
    ],
    [
      "challenge",
      `${plural(challenges.length, "assumption")} challenged (${severities}), ${asked === challenges.length ? "each" : asked} with a question for the broker${SAMPLE_DEAL.challenges.stressTest ? " · a stress test" : ""}`,
    ],
    ["comps", `${plural(comps.length, "broker comp")} rated: ${ratings}${flags ? ` · ${plural(flags, "selection flag")}` : ""}`],
    ["market", `${plural(checks.length, "assumption")} read against rules of thumb: ${reads}`],
    [
      "verdict",
      `${verdictWord} · ${plural(screen?.ranges.length ?? 0, "sourced range")} · ${plural(levers.length, "deal-killer")} stressed first: ${levers.map((l) => STRIP_WORDS.lever[l]).join(" · ")}`,
    ],
    // A run of its own, made when the buyer adds their model, after which
    // the verdict is synthesized again (lib/anthropic/pipeline).
    ["reconcile", `when you add your model: ${plural(gapCount, "gap")} called against it, verdict re-run`],
  ];
}

/** The screen, running — a looping replay of the six stages, in the
 *  pipeline's own order, then the reconciliation (its own run, once a
 *  model is added). Every line is DERIVED from the same sample fixture the
 *  demo renders — counts and the verdict word, not copywriting — so this
 *  strip can never claim an output shape the sample screen doesn't show.
 *  The animated block is aria-hidden; screen readers get one static
 *  sentence. Shared by the homepage and /why.
 *
 *  It replays forever, so it carries the tickers' pause button (WCAG 2.2.2,
 *  app/pausable-ticker). The button marks its wrapper `data-ticker-paused`,
 *  which sets `--screenrun-play` there; each line and the caret read it as
 *  their own animation-play-state, inline, because the lines' animation is
 *  an unlayered rule in globals.css that no utility can reach. */
export function ScreenRunStrip() {
  const LINES = screenRunLines();
  return (
    <section
      aria-label="A replay of the six analysis stages on the sample deal"
      className="band-dark border-y border-white/10 text-white"
    >
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-white/55">
            The screen, running — a replay of the six stages on the sample
            deal
          </p>
          <Link
            href="/demo"
            className="text-xs font-medium text-accent transition-colors hover:text-white"
          >
            See the full output →
          </Link>
        </div>
        <p className="sr-only">
          The screen runs in order: a first read of the headline figures,
          extraction with page cites, the assumptions challenged with a
          question for the broker, the broker&apos;s comps rated, the market
          check against rules of thumb, and a verdict with sourced ranges and
          the three deal-killers stressed first; when you add your own model,
          a reconciliation against it re-runs the verdict.
        </p>
        <PausableTicker what="trace" className="mt-4 data-[ticker-paused]:[--screenrun-play:paused]">
          <div
            aria-hidden
            className="rounded-xl border border-white/10 bg-black/25 p-4 pr-10 font-mono text-[12px] leading-relaxed sm:text-[13px]"
          >
            {LINES.map(([stage, detail], i) => (
              <p
                key={stage}
                style={{ "--i": i, animationPlayState: PLAY } as React.CSSProperties}
                className="screenrun-line flex flex-wrap gap-x-2 py-0.5"
              >
                <span className="text-white/55">▸</span>
                <span className="w-20 shrink-0 text-accent">{stage}</span>
                <span className="text-white/75">
                  {detail}
                  {i === LINES.length - 1 && (
                    <span className="screenrun-caret ml-1 text-accent" style={{ animationPlayState: PLAY }}>
                      ▍
                    </span>
                  )}
                </span>
              </p>
            ))}
          </div>
        </PausableTicker>
      </div>
    </section>
  );
}
