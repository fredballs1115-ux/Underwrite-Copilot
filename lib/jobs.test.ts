/**
 * The atomic job claim, against a recording fake: what a retry after a
 * FAILED worker run keeps, and what every other claim resets.
 */
import { describe, expect, it } from "vitest";
import { claimJob, newJobRow, requesterOf } from "./jobs";

type Row = Record<string, unknown>;

function fakeDb(existing: Row | null) {
  const calls: { selectCols?: string; update?: Row }[] = [];
  class Q {
    private kind: "select" | "update" = "select";
    private cols = "";
    private patch: Row = {};
    select(cols: string) {
      if (this.kind === "select") this.cols = cols;
      return this;
    }
    update(patch: Row) {
      this.kind = "update";
      this.patch = patch;
      return this;
    }
    eq() {
      return this;
    }
    in() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    maybeSingle() {
      return this;
    }
    then<T>(resolve: (v: { data: unknown; error: null }) => T, reject?: (e: unknown) => T) {
      return Promise.resolve()
        .then(() => {
          if (this.kind === "select") {
            calls.push({ selectCols: this.cols });
            return { data: existing, error: null };
          }
          calls.push({ update: this.patch });
          return { data: existing ? [{ id: existing.id }] : [], error: null };
        })
        .then(resolve, reject);
    }
  }
  return { db: { from: () => new Q() } as never, calls };
}

const HOUR_AGO = new Date(Date.now() - 3_600_000).toISOString();
const failedRun = (): Row => ({
  id: "j1",
  status: "error",
  updated_at: HOUR_AGO,
  // …an attempt whose extraction had to fall back from the text layer to
  // the pages (pipeline.ts writes omPages the moment it does)
  payload: { kind: "screen", snapshotPrior: true, completed: ["signal", "extract", "challenge"], omPages: true },
});

describe("claimJob — a retry after a failed worker run keeps the steps that finished", () => {
  it("keepCheckpoints on an errored row carries `completed` and the pages fallback into the new payload", async () => {
    const { db, calls } = fakeDb(failedRun());
    const claim = await claimJob(db, "d1", "signal", { kind: "screen" }, "queued", {
      keepCheckpoints: true,
    });
    expect(claim).toEqual({ outcome: "claimed", priorStatus: "error" });
    const update = calls.find((c) => c.update)!.update as { payload: Row };
    expect(update.payload).toEqual({
      kind: "screen",
      snapshotPrior: false,
      completed: ["signal", "extract", "challenge"],
      omPages: true,
    });
    // The payload column is read only in worker mode, where 0016 is live.
    expect(calls[0].selectCols).toContain("payload");
  });

  it("a failed attempt that never fell back carries no omPages mark", async () => {
    const { db, calls } = fakeDb({ ...failedRun(), payload: { kind: "screen", completed: ["signal"] } });
    await claimJob(db, "d1", "signal", { kind: "screen" }, "queued", { keepCheckpoints: true });
    const update = calls.find((c) => c.update)!.update as { payload: Row };
    expect(update.payload).toEqual({ kind: "screen", snapshotPrior: false, completed: ["signal"] });
  });

  it("without keepCheckpoints the same retry starts from nothing (a replace-OM must never resume the old file, nor its pages fallback)", async () => {
    const { db, calls } = fakeDb(failedRun());
    await claimJob(db, "d1", "signal", { kind: "screen" });
    const update = calls.find((c) => c.update)!.update as { payload: Row };
    expect(update.payload.completed).toEqual([]);
    expect("omPages" in update.payload).toBe(false);
  });

  it("a completed prior run is never resumed, only diffed against", async () => {
    const { db, calls } = fakeDb({ ...failedRun(), status: "done" });
    const claim = await claimJob(db, "d1", "signal", { kind: "screen" }, "queued", {
      keepCheckpoints: true,
    });
    expect(claim.priorStatus).toBe("done");
    const update = calls.find((c) => c.update)!.update as { payload: Row };
    expect(update.payload).toEqual({ kind: "screen", snapshotPrior: true, completed: [] });
  });

  it("an in-process claim touches no 0016 column at all", async () => {
    const { db, calls } = fakeDb({ id: "j1", status: "error", updated_at: HOUR_AGO });
    const claim = await claimJob(db, "d1", "signal", undefined, "queued", { keepCheckpoints: true });
    expect(claim.outcome).toBe("claimed");
    expect(calls[0].selectCols).not.toContain("payload");
    const update = calls.find((c) => c.update)!.update!;
    expect("payload" in update).toBe(false);
    expect("attempts" in update).toBe(false);
  });

  it("a claim restamps the row's created_at: the deal's one job row says when THIS run was asked for, never the first screen's day", async () => {
    const before = Date.now();
    const { db, calls } = fakeDb({ id: "j1", status: "done", updated_at: HOUR_AGO, created_at: "2026-01-05T09:00:00.000Z" });
    expect((await claimJob(db, "d1", "signal")).outcome).toBe("claimed");
    const update = calls.find((c) => c.update)!.update as { created_at: string; updated_at: string };
    expect(update.created_at).toBe(update.updated_at);
    expect(Date.parse(update.created_at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(update.created_at)).toBeLessThanOrEqual(Date.now());
  });

  it("a claim clears the last run's ledger, so a run that ends before any model call never wears its cost or time (the audit of 2026-10-01)", async () => {
    const { db, calls } = fakeDb({ id: "j1", status: "done", updated_at: HOUR_AGO });
    expect((await claimJob(db, "d1", "signal")).outcome).toBe("claimed");
    const update = calls.find((c) => c.update)!.update as { usage?: unknown };
    expect("usage" in update && update.usage === null).toBe(true);
  });

  it("a worker claim and a worker insert carry who asked for the run, and a retry carries the retrier, not the last asker", async () => {
    const ASKER = "22222222-2222-4222-8222-222222222222";
    const RETRIER = "33333333-3333-4333-8333-333333333333";
    const { db, calls } = fakeDb({ ...failedRun(), payload: { ...(failedRun().payload as Row), requestedBy: ASKER } });
    await claimJob(db, "d1", "signal", { kind: "screen", requestedBy: RETRIER }, "queued", { keepCheckpoints: true });
    const update = calls.find((c) => c.update)!.update as { payload: Row };
    expect(update.payload.requestedBy).toBe(RETRIER);
    expect(update.payload.completed).toEqual(["signal", "extract", "challenge"]);
    expect(newJobRow("d1", "signal", { workerPayload: { kind: "screen", requestedBy: ASKER } }).payload).toEqual({
      kind: "screen",
      requestedBy: ASKER,
      snapshotPrior: false,
      completed: [],
    });
  });

  it("reads a recorded requester only where it is a user id", () => {
    expect(requesterOf("22222222-2222-4222-8222-222222222222")).toBe("22222222-2222-4222-8222-222222222222");
    expect(requesterOf(" 22222222-2222-4222-8222-22222222222A ")).toBe("22222222-2222-4222-8222-22222222222a");
    for (const bad of [undefined, null, "", "u1", 42, { id: "x" }, "22222222-2222-4222-8222-2222222222222"]) {
      expect(requesterOf(bad), String(bad)).toBeNull();
    }
  });

  it("a live, fresh row is busy; a live row past the stale window is reclaimable", async () => {
    const fresh = fakeDb({ id: "j1", status: "running", updated_at: new Date().toISOString() });
    expect((await claimJob(fresh.db, "d1", "signal")).outcome).toBe("busy");
    const stale = fakeDb({ id: "j1", status: "running", updated_at: HOUR_AGO });
    expect((await claimJob(stale.db, "d1", "signal")).outcome).toBe("claimed");
  });
});
