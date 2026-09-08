/**
 * The atomic job claim, against a recording fake: what a retry after a
 * FAILED worker run keeps, and what every other claim resets.
 */
import { describe, expect, it } from "vitest";
import { claimJob } from "./jobs";

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
  payload: { kind: "screen", snapshotPrior: true, completed: ["signal", "extract", "challenge"] },
});

describe("claimJob — a retry after a failed worker run keeps the steps that finished", () => {
  it("keepCheckpoints on an errored row carries `completed` into the new payload", async () => {
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
    });
    // The payload column is read only in worker mode, where 0016 is live.
    expect(calls[0].selectCols).toContain("payload");
  });

  it("without keepCheckpoints the same retry starts from nothing (a replace-OM must never resume the old file)", async () => {
    const { db, calls } = fakeDb(failedRun());
    await claimJob(db, "d1", "signal", { kind: "screen" });
    const update = calls.find((c) => c.update)!.update as { payload: Row };
    expect(update.payload.completed).toEqual([]);
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

  it("a live, fresh row is busy; a live row past the stale window is reclaimable", async () => {
    const fresh = fakeDb({ id: "j1", status: "running", updated_at: new Date().toISOString() });
    expect((await claimJob(fresh.db, "d1", "signal")).outcome).toBe("busy");
    const stale = fakeDb({ id: "j1", status: "running", updated_at: HOUR_AGO });
    expect((await claimJob(stale.db, "d1", "signal")).outcome).toBe("claimed");
  });
});
