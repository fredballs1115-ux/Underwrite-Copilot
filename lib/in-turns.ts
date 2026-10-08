/**
 * Work on a list a few items at a time (research pass 42, L8). The pipeline
 * page wrote each deal's filled-in deadline and address back before it drew
 * anything, every write at once — a pipeline of old screens waited on a
 * burst of hundreds of updates before its first byte. It now draws from the
 * values it computed and writes them behind the response, a few at a time.
 *
 * No imports.
 */

/** Writes a page puts in flight at once behind its response. */
export const WRITE_BACKS_IN_FLIGHT = 4;

/**
 * Runs `work` on each item, at most `inFlight` at once, and answers how many
 * failed — a rejection, or a `false` from `work`. Never throws.
 */
export async function inTurns<T>(
  items: readonly T[],
  work: (item: T) => PromiseLike<boolean | void>,
  inFlight = WRITE_BACKS_IN_FLIGHT,
): Promise<number> {
  let next = 0;
  let failed = 0;
  const lane = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        if ((await work(item)) === false) failed++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(inFlight, items.length)) }, lane));
  return failed;
}
