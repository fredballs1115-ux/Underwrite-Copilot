/**
 * What the pipeline could not read just now, said over the list (research
 * pass 42). The page reads each deal's latest screen, its offers-due date and
 * the name of the teammate who added it in reads of their own, beside the
 * deals; one that fails had been read as no rows — no card saying a screen is
 * running, no deadline, every teammate "Teammate" — with nothing saying a
 * read had failed. Each failure is said by what the list then leaves out.
 *
 * No imports: the page reads it, and so can a test.
 */

/** The reads beside the deals, true where one failed. */
export type PipelineReadFailures = {
  /** each deal's latest screen (running, stalled, failed) */
  jobs?: boolean;
  /** each deal's offers-due date */
  offersDue?: boolean;
  /** the names of the teammates who added the team's deals */
  names?: boolean;
};

/** "A", "A and B", "A, B and C". */
function listed(parts: readonly string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The sentence over the list where a read beside the deals failed, or null
 *  where every one answered. */
export function pipelineReadNote(failed: PipelineReadFailures): string | null {
  const effects = [
    failed.jobs ? "no card says whether its screen is running, stalled or failed" : null,
    failed.offersDue ? "no offers-due date is shown" : null,
    failed.names ? "a teammate’s deal says “Teammate” rather than who added it" : null,
  ].filter((e): e is string => !!e);
  if (effects.length === 0) return null;
  return `Part of the pipeline couldn’t be read just now: ${listed(effects)}. Refresh in a moment.`;
}
