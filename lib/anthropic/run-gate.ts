/**
 * How many screens one web process runs at once.
 *
 * In-process analyses start the moment their request returns (`after()`),
 * and a batch upload of four OMs starts four. Each holds its PDF in memory
 * and inflates it into a ~27MB base64 request body per model call, which the
 * SDK serializes again for the network — 50–80MB per run, times four, on a
 * 512MB starter instance. The gate lets ANALYSIS_CONCURRENCY runs (default
 * two) hold an OM at a time; the rest wait their turn with their claim
 * heartbeating, so nothing goes stale in the queue. Pure, so it is tested.
 */
export class RunGate {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  /** `limit` is read on every acquire, so an env change needs no restart. */
  constructor(private readonly limit: () => number) {}

  get inFlight(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiting.length;
  }

  /** Resolves with the release function once a slot is free. Release is
   *  idempotent, so a `finally` can call it after an early return. */
  async acquire(): Promise<() => void> {
    while (this.active >= Math.max(1, this.limit())) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.waiting.shift()?.();
    };
  }
}

/** ANALYSIS_CONCURRENCY from the environment; blank or nonsense means two. */
export function concurrencyFromEnv(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number(env.ANALYSIS_CONCURRENCY);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}
