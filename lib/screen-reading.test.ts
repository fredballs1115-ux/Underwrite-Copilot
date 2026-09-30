import { describe, expect, it } from "vitest";
import { readingMemorandum } from "./screen-reading";
import { STALE_MS } from "./screen-run";

describe("readingMemorandum — a missing header figure is 'not read yet' only while the screen reads", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  const fresh = new Date(now - 30_000).toISOString();
  const job = (status: string, step: string | null, updated_at: string | null = fresh) => ({ status, step, updated_at });

  it("is reading while a live screen has not written the terms: queued, first signal, extracting", () => {
    expect(readingMemorandum(job("queued", null), now)).toBe(true);
    expect(readingMemorandum(job("queued", "signal"), now)).toBe(true);
    expect(readingMemorandum(job("running", "signal"), now)).toBe(true);
    expect(readingMemorandum(job("running", "extract"), now)).toBe(true);
  });

  it("is not, once the terms are written — a figure still missing is one the memorandum does not state", () => {
    for (const step of ["challenge", "comps", "market", "verdict"]) {
      expect(readingMemorandum(job("running", step), now), step).toBe(false);
    }
  });

  it("is not for a finished, failed or absent run, nor a side job that reads no figures", () => {
    expect(readingMemorandum(job("done", "verdict"), now)).toBe(false);
    expect(readingMemorandum(job("error", "extract"), now)).toBe(false);
    expect(readingMemorandum(null, now)).toBe(false);
    for (const step of ["reconcile", "model", "comps_search"]) {
      expect(readingMemorandum(job("running", step), now), step).toBe(false);
    }
  });

  it("is not for a run that stopped writing progress: a stalled run reads nothing", () => {
    const stale = new Date(now - STALE_MS - 1_000).toISOString();
    expect(readingMemorandum(job("running", "extract", stale), now)).toBe(false);
    // A row with no stamp is taken at its word.
    expect(readingMemorandum(job("running", "extract", null), now)).toBe(true);
  });
});
