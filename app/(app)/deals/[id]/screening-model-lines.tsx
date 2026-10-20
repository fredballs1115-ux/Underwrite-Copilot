// The screening model in three short lines, where a page introduces it
// beside returns that are not its own (the sensitivity playground's
// heading, the first-draft card's workbook note): which model it is, what
// it is built on, and how its growth and exit are set — on a real deal the
// rule in a clause with a link to /how-we-test's "model" section, where the
// whole rule is; on the sample its pinned figures, read off its own derived
// model and never typed (lib/screening-model-words). Pure; one string a
// line, one text node each, a spelled space between them.
import Link from "next/link";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import {
  SCREENING_BUILT_ON,
  SCREENING_GROWTH_EXIT_LINE,
  SCREENING_RULE_HREF,
  SCREENING_RULE_LINK_WORDS,
  sampleScreeningPinned,
} from "@/lib/screening-model-words";

export type ScreeningFigures = Pick<UnderwriteInputs, "rentGrowthPct" | "expenseGrowthPct" | "exitCapPct">;

/** The third line's words before its link: a real deal's rule, or the
 *  sample's pinned figures where they were handed in. */
export function growthExitLine(sample: boolean, figures: ScreeningFigures | null | undefined): string {
  if (!sample) return `${SCREENING_GROWTH_EXIT_LINE} —`;
  return figures ? `${sampleScreeningPinned(figures)} See` : "The sample's growth and exit are pinned. See";
}

export function ScreeningModelLines({
  lead,
  sample = false,
  figures = null,
  className,
  qa,
}: {
  /** the first line: which model this is, beside the page's other one */
  lead: string;
  sample?: boolean;
  /** the screening model's own inputs: the sample's pinned figures */
  figures?: ScreeningFigures | null;
  className: string;
  qa: string;
}) {
  return (
    <p data-qa={qa} className={className}>
      <span className="block">{lead}</span>{" "}
      <span className="block">{SCREENING_BUILT_ON}</span>{" "}
      <span className="block" data-qa={`${qa}-growth-exit`}>
        {growthExitLine(sample, figures)}{" "}
        <Link href={SCREENING_RULE_HREF} className="font-medium text-brand hover:underline">
          {SCREENING_RULE_LINK_WORDS}
        </Link>
      </span>
    </p>
  );
}
