import { describe, expect, it } from "vitest";
import { readingMemorandum } from "./screen-reading";
import {
  STALE_MS,
  isLiveJob,
  isStalled,
  jobAgeMs,
  listJobStatus,
  previousScreenResults,
  screenStopped,
  screenedOn,
  staleAfterFailure,
  staleWhileRunning,
  storedPreviousResults,
  verdictBehind,
} from "./screen-run";

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

  it("a live job that is no screen leaves the call alone — a comp search is not a re-screen", () => {
    expect(listJobStatus({ status: "running", step: "comps_search", updated_at: iso(1_000) }, true, now)).toBeNull();
    expect(listJobStatus({ status: "running", step: "model", updated_at: iso(1_000) }, false, now)).toBeNull();
    expect(listJobStatus({ status: "queued", step: "reconcile", updated_at: iso(1_000) }, true, now)).toBeNull();
    // The reconciler's second step re-runs the verdict: the call is being replaced.
    expect(listJobStatus({ status: "running", step: "verdict", updated_at: iso(1_000) }, true, now)).toBe("running");
    // A re-screen is running over a verdict on file.
    expect(listJobStatus({ status: "running", step: "extract", updated_at: iso(1_000) }, true, now)).toBe("running");
  });
});

describe("a screen still running — its results are this run's only once their step is done", () => {
  it("marks the step in progress and every step after it, as a failure there would", () => {
    // Mid re-screen: the terms are this run's, the challenger onward the last run's.
    expect([...staleWhileRunning({ status: "running", step: "challenge" })]).toEqual([
      "challenges",
      "comps",
      "market",
      "verdict",
    ]);
    // At the verdict step the terms, challenges, comps and market are new and
    // the verdict is still the last run's — the pairing the memo must refuse.
    expect([...staleWhileRunning({ status: "running", step: "verdict" })]).toEqual(["verdict"]);
  });

  it("a queued run has rewritten nothing, and a done or failed run is not running", () => {
    expect(staleWhileRunning({ status: "queued", step: null }).size).toBe(5);
    expect(staleWhileRunning({ status: "done", step: "verdict" }).size).toBe(0);
    expect(staleWhileRunning({ status: "error", step: "comps" }).size).toBe(0);
    expect(staleWhileRunning(null).size).toBe(0);
    // A job that is not a screen rewrites none of the five.
    expect(staleWhileRunning({ status: "running", step: "model" }).size).toBe(0);
    // The reconciler's second step is the verdict.
    expect([...staleWhileRunning({ status: "running", step: "verdict" })]).toEqual(["verdict"]);
  });

  it("previousScreenResults is the one rule: a failure's unreached steps and a live run's", () => {
    expect([...previousScreenResults({ status: "error", step: "market" })]).toEqual(["market", "verdict"]);
    expect([...previousScreenResults({ status: "running", step: "comps" })]).toEqual(["comps", "market", "verdict"]);
    expect(previousScreenResults({ status: "done", step: "verdict" }).size).toBe(0);
    expect(previousScreenResults(undefined).size).toBe(0);
    expect(isLiveJob({ status: "queued", step: null })).toBe(true);
    expect(isLiveJob({ status: "running", step: "extract" })).toBe(true);
    expect(isLiveJob({ status: "done", step: "verdict" })).toBe(false);
  });

  it("only a stored result is the previous screen's: a first screen marks nothing it never reached (research pass 30)", () => {
    const failedAtExtract = { status: "error", step: "extract" };
    // A first screen: nothing stored, nothing marked.
    expect(storedPreviousResults(failedAtExtract, {})).toEqual([]);
    expect(storedPreviousResults(failedAtExtract, { extraction: null, verdict: undefined })).toEqual([]);
    // A re-screen: the previous screen's results the run never reached.
    expect(storedPreviousResults({ status: "error", step: "comps" }, { extraction: {}, challenges: {}, comps: {}, verdict: {} })).toEqual([
      "comps",
      "verdict",
    ]);
    expect(storedPreviousResults({ status: "running", step: "market" }, { market: {}, verdict: {} })).toEqual(["market", "verdict"]);
    expect(storedPreviousResults({ status: "done", step: "verdict" }, { verdict: {} })).toEqual([]);
  });

  it("screenStopped is a screen that failed before its end — never a finished run, a live one or a side job", () => {
    expect(screenStopped({ status: "error", step: "extract" })).toBe("failed");
    expect(screenStopped({ status: "error", step: "verdict" })).toBe("failed");
    expect(screenStopped({ status: "error", step: null })).toBe("failed");
    expect(screenStopped({ status: "done", step: "verdict" })).toBeNull();
    expect(screenStopped({ status: "running", step: "comps" })).toBeNull();
    expect(screenStopped({ status: "error", step: "comps_search" })).toBeNull();
    expect(screenStopped({ status: "error", step: "model" })).toBeNull();
    expect(screenStopped(null)).toBeNull();
  });

  it("verdictBehind says why the stored call is the previous screen's, or nothing", () => {
    expect(verdictBehind({ status: "error", step: "comps" })).toBe("failed");
    expect(verdictBehind({ status: "running", step: "challenge" })).toBe("running");
    expect(verdictBehind({ status: "queued", step: null })).toBe("running");
    // The verdict step is under way: the call on file is still the last one.
    expect(verdictBehind({ status: "running", step: "verdict" })).toBe("running");
    expect(verdictBehind({ status: "done", step: "verdict" })).toBeNull();
    // A comp search or a model build never rewrites the verdict.
    expect(verdictBehind({ status: "running", step: "comps_search" })).toBeNull();
    expect(verdictBehind({ status: "error", step: "model" })).toBeNull();
    expect(verdictBehind(null)).toBeNull();
  });
});

describe("a run that stopped making progress — one stall rule for every surface (research pass 30)", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const STALLED = { status: "running", step: "challenge", updated_at: iso(STALE_MS + 60_000) };

  it("isStalled: a live row past the stale line, read on the age the server measured where the job carries one", () => {
    expect(isStalled(STALLED, now)).toBe(true);
    expect(isStalled({ status: "queued", step: "signal", updated_at: iso(STALE_MS + 1) }, now)).toBe(true);
    expect(isStalled({ status: "running", step: "challenge", updated_at: iso(30_000) }, now)).toBe(false);
    // A finished or failed row is never stalled, however old.
    expect(isStalled({ status: "error", step: "comps", updated_at: iso(STALE_MS * 3) }, now)).toBe(false);
    expect(isStalled({ status: "done", step: "verdict", updated_at: iso(STALE_MS * 3) }, now)).toBe(false);
    // The server's own age wins over a caller's clock running ten minutes fast…
    expect(isStalled({ status: "running", step: "comps", updated_at: iso(30_000), ageMs: 30_000 }, now + STALE_MS)).toBe(false);
    expect(jobAgeMs({ status: "running", step: "comps", updated_at: iso(30_000), ageMs: 30_000 }, now + STALE_MS)).toBe(30_000);
    // …and is all a page needs, reading no clock during its render.
    expect(isStalled({ status: "running", step: "comps", ageMs: STALE_MS + 1 })).toBe(true);
    // No age carried and no clock handed in: no stall is claimed.
    expect(isStalled({ status: "running", step: "comps", updated_at: iso(STALE_MS * 3) })).toBe(false);
    expect(jobAgeMs({ status: "running", step: "comps" }, now)).toBeNull();
  });

  it("verdictBehind says stalled where the pipeline card says Stalled — never running", () => {
    expect(listJobStatus(STALLED, true, now)).toBe("stalled");
    expect(verdictBehind(STALLED, now)).toBe("stalled");
    expect(verdictBehind({ ...STALLED, ageMs: STALE_MS + 60_000, updated_at: null })).toBe("stalled");
    expect(verdictBehind({ status: "queued", step: "signal", updated_at: iso(STALE_MS + 1) }, now)).toBe("stalled");
    expect(verdictBehind({ ...STALLED, updated_at: iso(30_000) }, now)).toBe("running");
    // A failure stays a failure, and a stalled side job leaves the verdict alone.
    expect(verdictBehind({ status: "error", step: "comps", updated_at: iso(STALE_MS * 3) }, now)).toBe("failed");
    expect(verdictBehind({ status: "running", step: "comps_search", updated_at: iso(STALE_MS * 2) }, now)).toBeNull();
  });

  it("a stalled screen has stopped; the header's shimmer agrees it is reading nothing", () => {
    expect(screenStopped(STALLED, now)).toBe("stalled");
    expect(screenStopped({ ...STALLED, updated_at: iso(1_000) }, now)).toBeNull();
    expect(screenStopped({ status: "running", step: "model", updated_at: iso(STALE_MS * 2) }, now)).toBeNull();
    expect(screenStopped({ status: "running", step: "extract", ageMs: STALE_MS + 1 })).toBe("stalled");
    expect(readingMemorandum({ status: "running", step: "extract", updated_at: iso(STALE_MS + 1) }, now)).toBe(false);
    expect(readingMemorandum({ status: "running", step: "extract", ageMs: STALE_MS + 1 }, now)).toBe(false);
    expect(readingMemorandum({ status: "running", step: "extract", updated_at: iso(1_000) }, now)).toBe(true);
  });
});

describe("screenedOn — the day a verdict was written", () => {
  it("reads the stamp's own day in UTC, the same on the server and in the browser", () => {
    expect(screenedOn("2026-09-12T14:03:00.000Z")).toBe("Sep 12, 2026");
    expect(screenedOn("2026-09-30T23:59:59.000Z")).toBe("Sep 30, 2026");
  });

  it("an unstamped or unreadable verdict has no date rather than a wrong one", () => {
    expect(screenedOn(undefined)).toBeNull();
    expect(screenedOn("")).toBeNull();
    expect(screenedOn("yesterday")).toBeNull();
  });
});
