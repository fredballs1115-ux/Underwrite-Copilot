import Link from "next/link";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { DEAL_KILLERS } from "@/lib/marketing-constants";
import { PausableTicker } from "./pausable-ticker";

/** The trace's animation-play-state: running until its pause button says. */
const PLAY = "var(--screenrun-play, running)";

/** The screen, running — a looping replay of the six stages, in the
 *  pipeline's own order (reconcile last: its own run, once a model is added). Every line is
 *  DERIVED from the same sample fixture the demo renders — counts and the
 *  verdict word, not copywriting — so this strip can never claim an output
 *  shape the sample screen doesn't show. The animated block is aria-hidden;
 *  screen readers get one static sentence. Shared by the homepage and /why.
 *
 *  It replays forever, so it carries the tickers' pause button (WCAG 2.2.2,
 *  app/pausable-ticker). The button marks its wrapper `data-ticker-paused`,
 *  which sets `--screenrun-play` there; each line and the caret read it as
 *  their own animation-play-state, inline, because the lines' animation is
 *  an unlayered rule in globals.css that no utility can reach. */
export function ScreenRunStrip() {
  const metricCount = SAMPLE_DEAL.extraction.metrics.length;
  // The gaps the sample's own reconciliation calls — a row in agreement is
  // not a gap.
  const gapCount = SAMPLE_DEAL.reconciliation.rows.filter((r) => r.direction !== "neutral").length;
  const verdictWord =
    SAMPLE_DEAL.verdict.verdict === "pass"
      ? "Go"
      : SAMPLE_DEAL.verdict.verdict === "pass_on"
        ? "No-go"
        : "Caution";
  const LINES: [string, string][] = [
    ["extract", `${metricCount} figures pulled — each carrying its OM page cite`],
    ["challenge", `${DEAL_KILLERS} deal-killers stressed first: basis · exit · debt`],
    ["comps", "broker comps ranked: supports · leans favorable · stretched"],
    ["market", "assumptions graded vs typical ranges — labeled, never dressed as comps"],
    ["verdict", `${verdictWord} — reasons attached, honest edges shown`],
    // A run of its own, made when the buyer adds their model, after which
    // the verdict is synthesized again (lib/anthropic/pipeline).
    ["reconcile", `when you add your model: ${gapCount} gaps called against it, verdict re-run`],
  ];
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
          The screen runs in order: extraction with page cites, assumption
          challenges on the three deal-killers, broker-comp ranking, the
          market check, and a verdict with its reasons; when you add your own
          model, a reconciliation against it re-runs the verdict.
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
