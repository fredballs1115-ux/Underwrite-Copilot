/**
 * The analysis worker's queue (research pass 39): job rows are the deal's
 * owner's to write, so the worker holds them to three rules — a deal runs
 * once at a time, a deal holds one queued run, and one account's backlog
 * never keeps another account's run waiting past the batch upload's share.
 * The pure rules first, then the worker's own reads and writes over an
 * in-memory table that filters, orders and updates as PostgREST does.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { BATCH_MAX_FILES } from "./batch-run";
import { STALE_MS } from "./screen-run";
import {
  CLAIM_LOG_ACCOUNTS,
  OWNER_QUEUE_SHARE,
  QUEUE_PAGE_ROWS,
  SUPERSEDED,
  noteClaim,
  readQueue,
  type ClaimLog,
  type QueuedRow,
} from "./worker-queue";
import {
  claimQueuedRow,
  collapseDeal,
  newestQueued,
  readQueueHead,
  supersedeOthers,
} from "./worker-claim";

const T0 = Date.parse("2026-10-05T12:00:00Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const row = (id: string, dealId: string, owner: string | null, s: number): QueuedRow => ({
  id,
  dealId,
  owner,
  createdAt: at(s),
});

describe("the share is the app's own: a batch upload's limit", () => {
  it("is the batch panel's four", () => {
    expect(OWNER_QUEUE_SHARE).toBe(BATCH_MAX_FILES);
    expect(BATCH_MAX_FILES).toBe(4);
  });
});

describe("rule 1 — a deal runs one job at a time", () => {
  it("skips a deal whose run is still writing, and takes the next one in line", () => {
    const rows = [row("j1", "d1", "a", 1), row("j2", "d2", "b", 2)];
    const read = readQueue(rows, [{ dealId: "d1", updatedAt: at(50) }], T0 + 60_000);
    expect(read.pick).toMatchObject({ dealId: "d2", behind: false });
  });

  it("takes it again once that run has stopped writing (the app's one stall rule)", () => {
    const rows = [row("j1", "d1", "a", 1), row("j2", "d2", "b", 2)];
    const now = T0 + 100_000 + STALE_MS;
    expect(readQueue(rows, [{ dealId: "d1", updatedAt: at(99) }], now).pick?.dealId).toBe("d1");
  });

  it("has nothing to take where every queued deal is still running", () => {
    const read = readQueue([row("j1", "d1", "a", 1)], [{ dealId: "d1", updatedAt: at(5) }], T0 + 10_000);
    expect(read.pick).toBeNull();
    expect(read.readMore).toBe(true);
  });
});

describe("rule 2 — a deal holds one queued run", () => {
  it("names every deal met with a second queued row, at the place of its oldest", () => {
    const rows = [row("j1", "d1", "a", 1), row("j2", "d1", "a", 3), row("j3", "d2", "b", 2), row("j4", "d1", "a", 4)];
    const read = readQueue(rows, [], T0 + 10_000);
    expect(read.collapse).toEqual(["d1"]);
    expect(read.pick?.dealId).toBe("d1");
  });
});

describe("rule 3 — one account's backlog never keeps another's run waiting past the share", () => {
  /** Run the worker's choice to the end, a claim a second after the last. */
  function drain(rows: QueuedRow[], start: number, log: ClaimLog = new Map()): string[] {
    const order: string[] = [];
    let queue = [...rows];
    let clock = start;
    while (queue.length) {
      const read = readQueue(queue, [], clock, log);
      if (!read.pick) break;
      order.push(read.pick.dealId);
      noteClaim(log, read.pick.account, clock);
      queue = queue.filter((r) => r.dealId !== read.pick!.dealId);
      clock += 1_000;
    }
    return order;
  }

  it("runs a batch of four in its own order, and a customer who asked first before it", () => {
    const rows = [row("b0", "B0", "b", 0), ...[1, 2, 3, 4].map((i) => row(`a${i}`, `A${i}`, "a", i))];
    expect(drain(rows, T0 + 60_000)).toEqual(["B0", "A1", "A2", "A3", "A4"]);
  });

  it("takes a waiting customer's run after the share of a flood that was queued first, never after the whole of it", () => {
    const flood = Array.from({ length: 12 }, (_, i) => row(`a${i + 1}`, `A${i + 1}`, "a", i + 1));
    const rows = [...flood, row("b1", "B1", "b", 20)];
    const order = drain(rows, T0 + 100_000);
    expect(order.indexOf("B1")).toBe(OWNER_QUEUE_SHARE);
    expect(order.slice(0, OWNER_QUEUE_SHARE)).toEqual(["A1", "A2", "A3", "A4"]);
    // …and the backlog keeps its own order after.
    expect(order.slice(OWNER_QUEUE_SHARE + 1)).toEqual(flood.slice(OWNER_QUEUE_SHARE).map((r) => r.dealId));
  });

  it("counts only the runs taken after a customer asked: one asked mid-backlog waits for the share of them", () => {
    const flood = Array.from({ length: 12 }, (_, i) => row(`a${i + 1}`, `A${i + 1}`, "a", i + 1));
    const log: ClaimLog = new Map();
    // A1 and A2 were taken before the customer asked…
    noteClaim(log, "a", T0 + 100_000);
    noteClaim(log, "a", T0 + 101_000);
    // …the customer asks at 101.5 s: the backlog's next four runs, each taken
    // after they asked, go before them, and no more.
    const rows = [...flood.slice(2), row("b1", "B1", "b", 101.5)];
    const order = drain(rows, T0 + 102_000, log);
    expect(order.indexOf("B1")).toBe(OWNER_QUEUE_SHARE);
  });

  it("says a run was held back, and reads on for one that was not", () => {
    const flood = Array.from({ length: 6 }, (_, i) => row(`a${i + 1}`, `A${i + 1}`, "a", i + 1));
    const log: ClaimLog = new Map();
    for (let i = 0; i < OWNER_QUEUE_SHARE; i++) noteClaim(log, "a", T0 + 100_000 + i * 1_000);
    const read = readQueue(flood.slice(OWNER_QUEUE_SHARE), [], T0 + 200_000, log);
    // Only the backlog in sight: its next run, held back to its claims.
    expect(read.pick).toMatchObject({ dealId: "A5", behind: true });
    expect(read.readMore).toBe(true);
  });

  it("keeps the last share of claims an account, and a bounded number of accounts", () => {
    const log: ClaimLog = new Map();
    for (let i = 0; i < 10; i++) noteClaim(log, "a", i);
    expect(log.get("a")).toEqual([6, 7, 8, 9]);
    for (let i = 0; i < CLAIM_LOG_ACCOUNTS + 5; i++) noteClaim(log, `acct${i}`, i);
    expect(log.size).toBe(CLAIM_LOG_ACCOUNTS);
    expect(log.has("a")).toBe(false);
  });

  it("counts a deal whose creator was not read as an account of its own", () => {
    const rows = [row("j1", "d1", null, 1), row("j2", "d2", null, 2)];
    const read = readQueue(rows, [], T0 + 10_000);
    expect(read.pick).toMatchObject({ dealId: "d1", account: "deal:d1" });
  });
});

// ── The worker's reads and writes, over an in-memory table ───────────────

type Row = Record<string, unknown>;

/** Enough of PostgREST's query builder for the worker's queue: filters,
 *  order, range, single, and an update answering the rows it matched. */
function fakeDb(tables: Record<string, Row[]>) {
  class Q {
    private filters: ((r: Row) => boolean)[] = [];
    private orders: { col: string; asc: boolean }[] = [];
    private span: [number, number] | null = null;
    private cap: number | null = null;
    private single = false;
    private patch: Row | null = null;
    constructor(private readonly table: string) {}
    select() {
      return this;
    }
    update(p: Row) {
      this.patch = p;
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push((r) => r[c] === v);
      return this;
    }
    neq(c: string, v: unknown) {
      this.filters.push((r) => r[c] !== v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filters.push((r) => vs.includes(r[c]));
      return this;
    }
    not(c: string, op: string, v: unknown) {
      if (op !== "is" || v !== null) throw new Error(`fake: not ${op}`);
      this.filters.push((r) => r[c] != null);
      return this;
    }
    order(col: string, o?: { ascending?: boolean }) {
      this.orders.push({ col, asc: o?.ascending !== false });
      return this;
    }
    range(a: number, b: number) {
      this.span = [a, b];
      return this;
    }
    limit(n: number) {
      this.cap = n;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }
    then<T>(resolve: (v: { data: unknown; error: null }) => T, reject?: (e: unknown) => T) {
      return Promise.resolve().then(() => this.run()).then(resolve, reject);
    }
    private run(): { data: unknown; error: null } {
      const hit = (tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
      if (this.patch) {
        for (const r of hit) Object.assign(r, this.patch);
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      }
      hit.sort((a, b) => {
        for (const { col, asc } of this.orders) {
          const x = String(a[col]);
          const y = String(b[col]);
          if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
      let out = this.span ? hit.slice(this.span[0], this.span[1] + 1) : hit;
      if (this.cap != null) out = out.slice(0, this.cap);
      return { data: this.single ? (out[0] ?? null) : out, error: null };
    }
  }
  return { from: (t: string) => new Q(t) } as unknown as SupabaseClient;
}

const job = (id: string, deal: string, s: number, extra: Row = {}): Row => ({
  id,
  deal_id: deal,
  status: "queued",
  created_at: at(s),
  updated_at: at(s),
  attempts: 0,
  payload: { kind: "screen" },
  error: null,
  ...extra,
});

describe("the worker's claim, against the table", () => {
  it("runs a deal's newest queued row, and closes its others as superseded — never run, and saying so", async () => {
    const jobs = [
      job("old", "d1", 1),
      job("mid", "d1", 2),
      job("new", "d1", 3),
      // an in-process run's row has no payload: never the worker's to touch
      job("inproc", "d1", 4, { payload: null }),
      job("other", "d2", 5),
    ];
    const db = fakeDb({ analysis_jobs: jobs, deals: [{ id: "d1", user_id: "a" }, { id: "d2", user_id: "b" }] });
    const head = await readQueueHead(db, new Map(), T0 + 60_000);
    expect(head.pick?.dealId).toBe("d1");
    const next = await newestQueued(db, "d1");
    expect(next?.id).toBe("new");
    expect(await claimQueuedRow(db, next!)).toBe(true);
    expect(await supersedeOthers(db, "d1", next!.id)).toBe(2);
    const byId = Object.fromEntries(jobs.map((j) => [j.id, j]));
    expect(byId.new).toMatchObject({ status: "running", attempts: 1 });
    for (const id of ["old", "mid"]) expect(byId[id]).toMatchObject({ status: "error", error: SUPERSEDED });
    expect(byId.inproc.status).toBe("queued");
    expect(byId.other.status).toBe("queued");
    // A second worker reading the same row loses the claim.
    expect(await claimQueuedRow(db, { ...next!, attempts: 0 })).toBe(false);
  });

  it("passes over a deal still running to the next deal in line", async () => {
    const jobs = [job("q1", "d1", 1), job("r1", "d1", 0, { status: "running", updated_at: at(55), payload: null }), job("q2", "d2", 2)];
    const db = fakeDb({ analysis_jobs: jobs, deals: [{ id: "d1", user_id: "a" }, { id: "d2", user_id: "b" }] });
    expect((await readQueueHead(db, new Map(), T0 + 60_000)).pick?.dealId).toBe("d2");
  });

  it("reads past a page of one running deal's rows, and puts that deal back to one queued row", async () => {
    const jobs = [
      job("run", "busy", 0, { status: "running", updated_at: at(299) }),
      ...Array.from({ length: QUEUE_PAGE_ROWS + 10 }, (_, i) => job(`b${String(i).padStart(4, "0")}`, "busy", 1 + i / 1000)),
      job("late", "d2", 100),
    ];
    const db = fakeDb({ analysis_jobs: jobs, deals: [{ id: "busy", user_id: "a" }, { id: "d2", user_id: "b" }] });
    const head = await readQueueHead(db, new Map(), T0 + 300_000);
    expect(head.pick?.dealId).toBe("d2");
    expect(head.collapse).toContain("busy");
    expect(await collapseDeal(db, "busy")).toBe(QUEUE_PAGE_ROWS + 9);
    expect(jobs.filter((j) => j.deal_id === "busy" && j.status === "queued")).toHaveLength(1);
  });

  it("holds one account's backlog to the share once it has had it, by the claims it remembers", async () => {
    const jobs = [...Array.from({ length: 8 }, (_, i) => job(`a${i}`, `A${i}`, 1 + i)), job("b", "B", 30)];
    const deals = [...Array.from({ length: 8 }, (_, i) => ({ id: `A${i}`, user_id: "a" })), { id: "B", user_id: "b" }];
    const db = fakeDb({ analysis_jobs: jobs, deals });
    const log: ClaimLog = new Map();
    const order: string[] = [];
    for (let poll = 0; poll < 9; poll++) {
      const now = T0 + 100_000 + poll * 1_000;
      const head = await readQueueHead(db, log, now);
      const next = await newestQueued(db, head.pick!.dealId);
      expect(await claimQueuedRow(db, next!)).toBe(true);
      noteClaim(log, head.pick!.account, now);
      order.push(head.pick!.dealId);
      // the run finishes before the next poll
      jobs.find((j) => j.id === next!.id)!.status = "done";
    }
    expect(order.indexOf("B")).toBe(OWNER_QUEUE_SHARE);
  });
});
