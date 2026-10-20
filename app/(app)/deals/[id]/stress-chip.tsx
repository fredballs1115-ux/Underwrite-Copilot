import { Fragment } from "react";
import type { StressVerdict } from "@/lib/stress-test-types";

/**
 * The stress test at a glance, beside the call (2026-10-20): the header's
 * chip, and the bar that keeps the deal in view, each linking to the
 * Overview's panel (`STRESS_TEST_ANCHOR`). The counts are the panel's own —
 * `verdictCounts` (lib/stress-test-words), the same filter by verdict the
 * panel's read line counts with — in its words and its colours: the most
 * severe first, "holds" for one and "hold" for more, a verdict with no row
 * left out. Pure; plain data in, so the client bar can draw it.
 *
 * On a phone the header's chip takes its own line under the name and wraps
 * only between its parts, never inside one. The bar's compact form draws a
 * dot and a count a verdict, the words for a screen reader, and leaves the
 * unchecked out where any row was tested.
 */

/** The id the Overview gives its stress-test panel, which the chips link to. */
export const STRESS_TEST_ANCHOR = "stress-test";

export type StressCounts = Record<StressVerdict, number>;

const PARTS: { verdict: StressVerdict; word: (n: number) => string; dot: string; text: string }[] = [
  { verdict: "unsupported", word: () => "unsupported", dot: "bg-kill", text: "text-kill" },
  { verdict: "stretched", word: () => "stretched", dot: "bg-caution", text: "text-caution" },
  { verdict: "holds", word: (n) => (n === 1 ? "holds" : "hold"), dot: "bg-pass", text: "text-pass" },
  { verdict: "unchecked", word: () => "unchecked", dot: "border border-muted", text: "text-muted" },
];

/** "Stress test: 1 unsupported, 2 stretched, 1 holds, 5 unchecked" — null
 *  where no row was struck. */
export function stressChipLine(counts: StressCounts | null): string | null {
  const said = PARTS.filter((p) => (counts?.[p.verdict] ?? 0) > 0);
  if (!counts || said.length === 0) return null;
  return `Stress test: ${said.map((p) => `${counts[p.verdict]} ${p.word(counts[p.verdict])}`).join(", ")}`;
}

/** The panel's tone, by the worst verdict a row was given. */
function toneOf(counts: StressCounts): string {
  if (counts.unsupported > 0) return "border-kill/30 bg-kill/5";
  if (counts.stretched > 0) return "border-caution/30 bg-caution/5";
  return "border-line bg-surface";
}

export function StressChip({ counts, compact = false }: { counts: StressCounts | null; compact?: boolean }) {
  if (!counts || !stressChipLine(counts)) return null;
  const tested = counts.unsupported + counts.stretched + counts.holds > 0;
  const parts = PARTS.filter((p) => counts[p.verdict] > 0 && !(compact && tested && p.verdict === "unchecked"));
  return (
    <a
      href={`#${STRESS_TEST_ANCHOR}`}
      data-qa={compact ? "stress-chip-compact" : "stress-chip"}
      title={stressChipLine(counts) ?? undefined}
      className={`inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-2.5 py-0.5 font-semibold transition-colors hover:border-brand/50 ${
        compact ? "shrink-0 text-[11px]" : "max-w-full text-xs"
      } ${toneOf(counts)}`}
    >
      <span className="whitespace-nowrap text-ink">Stress test</span>{" "}
      {parts.map((p) => (
        <Fragment key={p.verdict}>
          <span className={`inline-flex items-center gap-1 whitespace-nowrap ${p.text}`}>
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${p.dot}`} />
            {compact ? (
              <>
                {counts[p.verdict]}
                <span className="sr-only">{` ${p.word(counts[p.verdict])}`}</span>
              </>
            ) : (
              `${counts[p.verdict]} ${p.word(counts[p.verdict])}`
            )}
          </span>{" "}
        </Fragment>
      ))}
    </a>
  );
}
