import Link from "next/link";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import {
  DEAL_KILLERS,
  SAMPLE_RECONCILE_ROWS,
} from "@/lib/marketing-constants";

/** The screen, running — a looping six-stage trace band. Every line is
 *  DERIVED from the same sample fixture the demo renders — counts and the
 *  verdict word, not copywriting — so this strip can never claim an output
 *  shape the sample screen doesn't show. The animated block is aria-hidden;
 *  screen readers get one static sentence. Shared by the homepage and /why. */
export function ScreenRunStrip() {
  const metricCount = SAMPLE_DEAL.extraction.metrics.length;
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
    ["reconcile", `${SAMPLE_RECONCILE_ROWS.length} gaps called against your own model`],
    ["market", "assumptions graded vs typical ranges — labeled, never dressed as comps"],
    ["verdict", `${verdictWord} — reasons attached, honest edges shown`],
  ];
  return (
    <section
      aria-label="A live trace of the six analysis stages on the sample deal"
      className="band-dark border-y border-white/10 text-white"
    >
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">
            The screen, running — a live trace of the six stages on the sample
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
          The six stages run in order: extraction with page cites, assumption
          challenges on the three deal-killers, broker-comp ranking,
          reconciliation against your model, the market check, and a verdict
          with its reasons.
        </p>
        <div
          aria-hidden
          className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4 font-mono text-[12px] leading-relaxed sm:text-[13px]"
        >
          {LINES.map(([stage, detail], i) => (
            <p
              key={stage}
              style={{ "--i": i } as React.CSSProperties}
              className="screenrun-line flex flex-wrap gap-x-2 py-0.5"
            >
              <span className="text-white/35">▸</span>
              <span className="w-20 shrink-0 text-accent">{stage}</span>
              <span className="text-white/75">
                {detail}
                {i === LINES.length - 1 && (
                  <span className="screenrun-caret ml-1 text-accent">▍</span>
                )}
              </span>
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
