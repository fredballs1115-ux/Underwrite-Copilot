/**
 * Why a worker run was put back in line, and what the deal page says when it
 * stops trying. Pure: the worker records each interruption's kind on the
 * job's payload as it re-queues the run, and words its last failure from
 * them. The sentence said "interrupted 3 times while our servers restarted"
 * for three 30-minute timeouts and for crashes too, and told the reader to
 * "run it fresh" when "Try again" on a failed worker run resumes from the
 * steps it finished (lib/jobs `keepCheckpoints`) — untrue twice in one
 * sentence (research pass 30).
 */

/** A deploy's or a stop's signal, the job timeout, or an uncaught failure. */
export type InterruptionKind = "restart" | "timeout" | "crash";

const KINDS: readonly InterruptionKind[] = ["restart", "timeout", "crash"];

/** The kinds a payload recorded, in order; anything else is dropped. */
export function interruptionKinds(raw: unknown): InterruptionKind[] {
  return Array.isArray(raw) ? raw.filter((k): k is InterruptionKind => KINDS.includes(k as InterruptionKind)) : [];
}

/** "once", "twice", "3 times". */
function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

/**
 * The sentence for a run that stopped trying after `attempts` interrupted
 * attempts. Every cause it names was recorded, so it never names a cause
 * that did not happen; where all of them were restarts it says so as it
 * always did, and where none was recorded (a run re-queued before the kinds
 * were) it names none. The retry picks up from the last finished step.
 */
export function interruptedMessage(
  recorded: readonly InterruptionKind[],
  attempts: number,
  timeoutMinutes: number,
): string {
  const tail =
    " so it stopped trying on its own. Choose “Try again” on the deal page — it picks up from the last step it finished.";
  const count = (k: InterruptionKind) => recorded.filter((r) => r === k).length;
  const restarts = count("restart");
  if (recorded.length > 0 && restarts === recorded.length && restarts >= attempts) {
    return `The screen was interrupted ${times(attempts)} while our servers restarted,${tail}`;
  }
  const causes = [
    count("timeout") > 0 ? `it ran past the ${timeoutMinutes}-minute limit on a run ${times(count("timeout"))}` : null,
    restarts > 0 ? `our servers restarted under it ${times(restarts)}` : null,
    count("crash") > 0 ? `it broke off on an unexpected error ${times(count("crash"))}` : null,
  ].filter((c): c is string => c !== null);
  const why =
    causes.length === 0
      ? ""
      : ` (${causes.length === 1 ? causes[0] : `${causes.slice(0, -1).join(", ")} and ${causes[causes.length - 1]}`})`;
  return `The screen stopped ${times(attempts)} before it finished${why},${tail}`;
}

/** The kind of the worker's re-queue, by the reason it logs. */
export function interruptionOf(reason: string): InterruptionKind {
  if (/^SIG(?:TERM|INT)$/.test(reason)) return "restart";
  if (/timed out/i.test(reason)) return "timeout";
  return "crash";
}
