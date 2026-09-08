import { describe, expect, it } from "vitest";
import { STALE_MS, listJobStatus, staleAfterFailure } from "./screen-run";

describe("staleAfterFailure — which results a failed screen never reached", () => {
  it("marks the failing step's result and every result after it", () => {
    expect([...staleAfterFailure({ status: "error", step: "comps" })]).toEqual([
      "comps",
      "market",
      "verdict",
    ]);
    expect([...staleAfterFailure({ status: "error", step: "verdict" })]).toEqual(["verdict"]);
    expect([...staleAfterFailure({ status: "error", step: "market" })]).toEqual(["market", "verdict"]);
  });

  it("a run that died before extracting leaves every result to the previous screen", () => {
    expect(staleAfterFailure({ status: "error", step: "signal" }).size).toBe(5);
    expect(staleAfterFailure({ status: "error", step: "extract" }).size).toBe(5);
    expect(staleAfterFailure({ status: "error", step: null }).size).toBe(5);
  });

  it("a completed or live run, and a failure outside the screen, mark nothing", () => {
    expect(staleAfterFailure({ status: "done", step: "verdict" }).size).toBe(0);
    expect(staleAfterFailure({ status: "running", step: "comps" }).size).toBe(0);
    expect(staleAfterFailure({ status: "error", step: "comps_search" }).size).toBe(0);
    expect(staleAfterFailure({ status: "error", step: "model" }).size).toBe(0);
    expect(staleAfterFailure({ status: "error", step: "reconcile" }).size).toBe(0);
    expect(staleAfterFailure(null).size).toBe(0);
  });
});

describe("listJobStatus — the pipeline list's read of the latest job", () => {
  const now = Date.parse("2026-09-08T08:00:00Z");
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  it("a live row is running; one that stopped writing past the stale window is stalled", () => {
    expect(listJobStatus({ status: "running", step: "comps", updated_at: iso(30_000) }, false, now)).toBe(
      "running",
    );
    expect(listJobStatus({ status: "queued", step: "signal", updated_at: iso(STALE_MS + 1) }, false, now)).toBe(
      "stalled",
    );
    expect(listJobStatus({ status: "running", step: "comps", updated_at: iso(STALE_MS + 1) }, true, now)).toBe(
      "stalled",
    );
    // No timestamp at all (the column was not selected) reads as running, never stalled.
    expect(listJobStatus({ status: "running", step: "comps" }, false, now)).toBe("running");
  });

  it("a failure that left the verdict behind is failed even when a verdict exists", () => {
    expect(listJobStatus({ status: "error", step: "comps" }, true, now)).toBe("failed");
    expect(listJobStatus({ status: "error", step: "comps" }, false, now)).toBe("failed");
  });

  it("a failure that never reached the verdict leaves the verdict pill alone", () => {
    expect(listJobStatus({ status: "error", step: "comps_search" }, true, now)).toBeNull();
    expect(listJobStatus({ status: "error", step: "model" }, true, now)).toBeNull();
    expect(listJobStatus({ status: "error", step: "comps_search" }, false, now)).toBe("failed");
  });

  it("a finished row and no row read as nothing", () => {
    expect(listJobStatus({ status: "done", step: "verdict" }, true, now)).toBeNull();
    expect(listJobStatus(null, true, now)).toBeNull();
  });
});
