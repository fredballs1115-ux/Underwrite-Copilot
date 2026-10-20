/**
 * The stop handler for in-process screens: a restart marks the runs this
 * process holds as failed at once, bounded and never throwing, and does
 * nothing in worker mode (the first-run audit of 2026-10-20).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESTART_MESSAGES,
  inProcessRuns,
  interruptedRunMessage,
  markInterruptedRuns,
  registerRestartHandler,
  resetInProcessRunsForTest,
  trackInProcessRun,
  type SignalSource,
} from "./in-process-runs";

function fakeProc() {
  const listeners = new Map<string, (() => void)[]>();
  const proc: SignalSource = {
    on(signal, listener) {
      listeners.set(signal, [...(listeners.get(signal) ?? []), listener]);
      return proc;
    },
  };
  return { proc, emit: (s: string) => (listeners.get(s) ?? []).forEach((l) => l()), listeners };
}

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetInProcessRunsForTest();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  resetInProcessRunsForTest();
  errSpy.mockRestore();
});

describe("trackInProcessRun", () => {
  it("holds a run until its own release, which is idempotent", () => {
    const release = trackInProcessRun("d1", "screen");
    trackInProcessRun("d2", "reconcile");
    expect([...inProcessRuns()]).toEqual([
      ["d1", "screen"],
      ["d2", "reconcile"],
    ]);
    release();
    release();
    expect([...inProcessRuns().keys()]).toEqual(["d2"]);
  });

  it("lives on globalThis, so two module runtimes in one process share it", () => {
    trackInProcessRun("d1", "screen");
    const key = Symbol.for("underwrite-copilot.in-process-runs");
    const shared = (globalThis as unknown as Record<symbol, { running: Map<string, string> }>)[key];
    expect(shared.running.get("d1")).toBe("screen");
  });
});

describe("markInterruptedRuns", () => {
  it("marks each held run with its kind's sentence, once however many signals", async () => {
    trackInProcessRun("d1", "screen");
    trackInProcessRun("d2", "reconcile");
    const mark = vi.fn(async () => {});
    const [a, b] = await Promise.all([markInterruptedRuns(mark), markInterruptedRuns(mark)]);
    expect(a).toEqual(["d1", "d2"]);
    expect(b).toEqual(["d1", "d2"]);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith([
      { dealId: "d1", message: RESTART_MESSAGES.screen },
      { dealId: "d2", message: RESTART_MESSAGES.reconcile },
    ]);
    expect(interruptedRunMessage("d1")).toBe(RESTART_MESSAGES.screen);
    expect(interruptedRunMessage("d3")).toBeNull();
  });

  it("says what happened and promises no resume: an in-process run keeps no checkpoints", () => {
    expect(RESTART_MESSAGES.screen).toBe("The site restarted while this screen ran — start it again.");
    for (const m of Object.values(RESTART_MESSAGES)) expect(m).not.toMatch(/resume|picks up|last finished/i);
  });

  it("is bounded: a database that never answers lets go after the timeout", async () => {
    trackInProcessRun("d1", "screen");
    const started = Date.now();
    const marked = await markInterruptedRuns(() => new Promise<void>(() => {}), 30);
    expect(marked).toEqual(["d1"]);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });

  it("never throws: a write that throws, or rejects, is logged", async () => {
    trackInProcessRun("d1", "screen");
    await expect(
      markInterruptedRuns(() => {
        throw new Error("no admin key");
      }),
    ).resolves.toEqual(["d1"]);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("no admin key"));
  });

  it("with nothing held, writes nothing", async () => {
    const mark = vi.fn(async () => {});
    expect(await markInterruptedRuns(mark)).toEqual([]);
    expect(mark).not.toHaveBeenCalled();
  });
});

describe("registerRestartHandler", () => {
  it("registers SIGTERM and SIGINT once a process, and the signal marks the held runs", async () => {
    const { proc, emit, listeners } = fakeProc();
    const mark = vi.fn(async () => {});
    expect(registerRestartHandler({ proc, workerMode: false, mark })).toBe(true);
    expect(registerRestartHandler({ proc, workerMode: false, mark })).toBe(false);
    expect(listeners.get("SIGTERM")).toHaveLength(1);
    expect(listeners.get("SIGINT")).toHaveLength(1);
    trackInProcessRun("d1", "screen");
    emit("SIGTERM");
    emit("SIGINT");
    await markInterruptedRuns(mark); // the same marking, settled
    expect(mark).toHaveBeenCalledTimes(1);
    expect(interruptedRunMessage("d1")).toBe(RESTART_MESSAGES.screen);
  });

  it("does nothing in worker mode", () => {
    const { proc, listeners } = fakeProc();
    expect(registerRestartHandler({ proc, workerMode: true })).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it("reads worker mode from ANALYSIS_WORKER by default", () => {
    const { proc, listeners } = fakeProc();
    process.env.ANALYSIS_WORKER = "1";
    try {
      expect(registerRestartHandler({ proc })).toBe(false);
    } finally {
      delete process.env.ANALYSIS_WORKER;
    }
    expect(listeners.size).toBe(0);
  });
});
