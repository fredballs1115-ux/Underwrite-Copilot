/**
 * Pictures this process has already made, held so the next ask is served
 * from memory instead of being made again, with one making per key at a
 * time so a burst of asks shares the first one's work (the security review
 * of 2026-10-01). lib/metro-overhead and lib/skyline-fetch each carry this
 * pattern inline; this is the same rule as one class, for the share link's
 * aerial (lib/deal-aerial) and the email's picture.
 *
 * The bounds are on the count and on the total bytes, and the oldest entry
 * goes first. An entry that is read moves to the end, so a picture in demand
 * stays. A copy larger than the whole byte bound is served but not held. A
 * failure (null, or a throw) is held by nobody, so the next ask makes it
 * again.
 *
 * Pure: no I/O of its own, so the bounds are tested directly.
 */
export class HeldCopies<T extends { bytes: Uint8Array }> {
  private readonly held = new Map<string, T>();
  private readonly making = new Map<string, Promise<T | null>>();
  private heldBytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
  ) {}

  /** How many copies are held, and their bytes together. */
  get count(): number {
    return this.held.size;
  }
  get bytes(): number {
    return this.heldBytes;
  }

  /**
   * The copy held under `key`, where `fresh` (any copy, by default) accepts
   * it; moved to the end. A copy `fresh` refuses stays until a making under
   * the same key replaces it.
   */
  peek(key: string, fresh?: (held: T) => boolean): T | undefined {
    const hit = this.held.get(key);
    if (!hit || (fresh && !fresh(hit))) return undefined;
    this.held.delete(key);
    this.held.set(key, hit);
    return hit;
  }

  /**
   * The copy under `key` where `fresh` accepts it; else the making already
   * under way under `flight` (`key` by default), shared; else a new making,
   * whose copy, if any, is held under `key` in place of whatever was there.
   * `flight` lets a caller keep one copy a key while two makings of
   * different things under it (a deal before and after it moved) stay apart.
   */
  async take(
    key: string,
    make: () => Promise<T | null>,
    opts: { fresh?: (held: T) => boolean; flight?: string } = {},
  ): Promise<T | null> {
    const hit = this.peek(key, opts.fresh);
    if (hit) return hit;
    const flight = opts.flight ?? key;
    const running = this.making.get(flight);
    if (running) return running;

    const work = (async () => {
      const got = await make();
      if (got) this.hold(key, got);
      return got;
    })();
    this.making.set(flight, work);
    try {
      return await work;
    } finally {
      // Only our own making: a later one under the same flight has its own.
      if (this.making.get(flight) === work) this.making.delete(flight);
    }
  }

  /** Forget every held copy (tests; a making under way still finishes). */
  forget(): void {
    this.held.clear();
    this.making.clear();
    this.heldBytes = 0;
  }

  private hold(key: string, got: T): void {
    const old = this.held.get(key);
    if (old) {
      this.heldBytes -= old.bytes.byteLength;
      this.held.delete(key);
    }
    if (got.bytes.byteLength > this.maxBytes) return;
    this.held.set(key, got);
    this.heldBytes += got.bytes.byteLength;
    while (this.held.size > this.maxEntries || this.heldBytes > this.maxBytes) {
      const oldest = this.held.keys().next().value;
      if (oldest === undefined || oldest === key) break;
      this.heldBytes -= this.held.get(oldest)!.bytes.byteLength;
      this.held.delete(oldest);
    }
  }
}
