/**
 * Which queued run the analysis worker takes next (worker/index.ts), pure.
 *
 * The worker's queue is every `analysis_jobs` row that is queued and carries
 * a worker payload, oldest first. Those rows are the deal's owner's and
 * teammates' to write (0007's "own jobs" policy), and the app keeps one row a
 * deal (lib/jobs `claimJob` reuses it), so the worker does not take the queue
 * on trust (research pass 39). Three rules, each one this module decides:
 *
 *   1. A deal runs one job at a time. A deal with a running row that is
 *      still writing (lib/screen-run's one stall rule) is skipped until that
 *      run ends: two runs of one deal interleave their writes on the same
 *      results.
 *   2. A deal holds one queued run: its newest. Every other queued row of
 *      it is closed as superseded and never run — the newest is the row the
 *      deal's readers and the pipeline's checkpoints read. The app never
 *      queues two (claimJob answers "busy" while a run is live), so only a
 *      write the app did not make leaves a second one.
 *   3. An account's runs past `OWNER_QUEUE_SHARE` wait behind other
 *      accounts': once the worker has taken that many of one account's runs
 *      since another account's run was asked for, that other run goes first.
 *      So whoever asks while one account has many deals queued waits for at
 *      most that many of its runs, never for the whole of them. The share is
 *      the batch upload's limit (lib/batch-run `BATCH_MAX_FILES`): the most
 *      screens the app itself ever queues for one person at once, so a
 *      call-for-offers batch runs in its own order, and only a backlog the
 *      app did not make waits its turn. The account is the deal's creator —
 *      fixed by 0007's protect_deal_identity, where a payload's
 *      `requestedBy` is whatever the row's writer wrote.
 *
 * Rule 3 needs to remember which runs it took: an order worked out afresh
 * from the queue alone puts an account's next run ahead of everyone again
 * the moment its last one leaves the queue, since its rows are the oldest.
 * The worker keeps the times of each account's last few claims in memory
 * (`noteClaim`), and a restart forgets them — at most one more share of a
 * backlog runs ahead of a waiting customer after a deploy.
 *
 * The worker reads the queue a page at a time (`QUEUE_PAGE_ROWS`, at most
 * `QUEUE_SCAN_PAGES` pages) and asks this module each time whether the pick
 * so far can still change: a deal first met on a later page was asked for
 * later, so the first deal in line that is neither running nor held back by
 * rule 3 is the answer however much of the queue is left unread.
 */
import { BATCH_MAX_FILES } from "@/lib/batch-run";
import { isStalled } from "@/lib/screen-run";

/** An account's runs that may go before another account's waiting run. */
export const OWNER_QUEUE_SHARE = BATCH_MAX_FILES;

/** The queue is read in pages of this many rows… */
export const QUEUE_PAGE_ROWS = 250;
/** …and no further than this many pages a poll. */
export const QUEUE_SCAN_PAGES = 8;

/** Accounts whose recent claims the worker remembers, at most. */
export const CLAIM_LOG_ACCOUNTS = 5_000;

/** What a deal's other queued rows say once one of its rows is the run. */
export const SUPERSEDED =
  "Closed without running: another queued run of this deal took its place, and a deal runs one screen at a time.";

/** A queued worker row, as the worker reads it. */
export interface QueuedRow {
  id: string;
  dealId: string;
  /** the deal's creator, or null where the deal's row was not read */
  owner: string | null;
  createdAt: string;
}

/** A running row, as the worker reads it. */
export interface RunningRow {
  dealId: string;
  updatedAt: string | null;
}

/** When the worker took each account's last runs, in ms, oldest first. */
export type ClaimLog = Map<string, number[]>;

/** The deal whose turn it is. */
export interface QueuePick {
  dealId: string;
  /** the account rule 3 counts it under */
  account: string;
  /** whether rule 3 held it back behind another account's run */
  behind: boolean;
}

export interface QueueRead {
  /** the deal to run, or null where none can run now */
  pick: QueuePick | null;
  /** whether a later page could still give an earlier answer: nothing
   *  found, or only a deal rule 3 held back */
  readMore: boolean;
  /** each deal met with more than one queued row (rule 2) */
  collapse: string[];
}

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

const by = <T extends string | number>(a: T, b: T): number => (a < b ? -1 : a > b ? 1 : 0);

/** Oldest first; a tie (or an unreadable time) by the row's id, so two
 *  workers reading the same rows read one order. */
export function queueOrder(a: QueuedRow, b: QueuedRow): number {
  return by(time(a.createdAt), time(b.createdAt)) || by(a.createdAt, b.createdAt) || by(a.id, b.id);
}

/** The account rule 3 counts a deal under: its creator, or the deal alone
 *  where the creator was not read. */
export const accountOf = (owner: string | null, dealId: string): string => owner ?? `deal:${dealId}`;

/** Whether a running row is a run still going (lib/screen-run's stall
 *  rule: written to inside the last ten minutes, or of no readable age). */
export function stillRunning(row: RunningRow, now: number): boolean {
  return !isStalled({ status: "running", step: null, updated_at: row.updatedAt }, now);
}

/** Record a run the worker took for `account` at `at`: only its last
 *  `share` claims are kept, and the oldest-touched accounts go first past
 *  `CLAIM_LOG_ACCOUNTS`. */
export function noteClaim(log: ClaimLog, account: string, at: number, share: number = OWNER_QUEUE_SHARE): void {
  const times = [...(log.get(account) ?? []), at].slice(-share);
  log.delete(account);
  log.set(account, times);
  while (log.size > CLAIM_LOG_ACCOUNTS) {
    const oldest = log.keys().next().value;
    if (oldest === undefined) break;
    log.delete(oldest);
  }
}

/**
 * The queue as read so far: `rows` the worker's queued rows in any order,
 * `running` the running rows of their deals, `now` the poll's clock, `log`
 * the worker's memory of the runs it took.
 */
export function readQueue(
  rows: readonly QueuedRow[],
  running: readonly RunningRow[],
  now: number,
  log: ReadonlyMap<string, readonly number[]> = new Map(),
  share: number = OWNER_QUEUE_SHARE,
): QueueRead {
  const busy = new Set(running.filter((r) => stillRunning(r, now)).map((r) => r.dealId));

  // Each deal once, at its oldest row's place in line.
  const deals = new Map<string, { first: QueuedRow; count: number }>();
  for (const row of [...rows].sort(queueOrder)) {
    const d = deals.get(row.dealId);
    if (d) d.count++;
    else deals.set(row.dealId, { first: row, count: 1 });
  }

  // Rule 3: an account that has had `share` runs taken since a deal was
  // asked for waits behind it — its place is no earlier than the share-th
  // most recent of those claims.
  const heldTo = (account: string): number => {
    const times = log.get(account) ?? [];
    return times.length >= share ? times[times.length - share] : Number.NEGATIVE_INFINITY;
  };
  const line = [...deals].map(([dealId, d]) => {
    const account = accountOf(d.first.owner, dealId);
    const asked = time(d.first.createdAt);
    const place = Math.max(asked, heldTo(account));
    return { first: d.first, place, pick: { dealId, account, behind: place > asked } };
  });
  line.sort((a, b) => by(a.place, b.place) || queueOrder(a.first, b.first));

  // Rule 1: a deal still running is skipped.
  const pick = line.find((d) => !busy.has(d.pick.dealId))?.pick ?? null;
  return {
    pick,
    readMore: !pick || pick.behind,
    collapse: [...deals].filter(([, d]) => d.count > 1).map(([dealId]) => dealId),
  };
}
