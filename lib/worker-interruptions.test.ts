/**
 * The worker's last word on a run it stopped retrying (worker/index.ts): the
 * interruptions it names are the ones it recorded — a restart, the job
 * timeout, a crash — and the retry it offers picks up from the last finished
 * step, as "Try again" on a failed worker run does (lib/jobs
 * `keepCheckpoints`). It said "while our servers restarted … to run it
 * fresh" for timeouts and crashes too (research pass 30).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { interruptedMessage, interruptionKinds, interruptionOf } from "./worker-interruptions";

const RETRY = "Choose “Try again” on the deal page — it picks up from the last step it finished.";

describe("interruptedMessage — what a run that stopped retrying says", () => {
  it("three restarts are three restarts, said as they always were", () => {
    const m = interruptedMessage(["restart", "restart", "restart"], 3, 30);
    expect(m).toBe(`The screen was interrupted 3 times while our servers restarted, so it stopped trying on its own. ${RETRY}`);
  });

  it("timeouts and crashes are named as what they were, never as restarts", () => {
    const timeouts = interruptedMessage(["timeout", "timeout", "timeout"], 3, 30);
    expect(timeouts).toBe(
      `The screen stopped 3 times before it finished (it ran past the 30-minute limit on a run 3 times), so it stopped trying on its own. ${RETRY}`,
    );
    expect(timeouts).not.toMatch(/restart/);
    const mixed = interruptedMessage(["restart", "timeout", "crash"], 3, 30);
    expect(mixed).toBe(
      `The screen stopped 3 times before it finished (it ran past the 30-minute limit on a run once, our servers restarted under it once and it broke off on an unexpected error once), so it stopped trying on its own. ${RETRY}`,
    );
    expect(interruptedMessage(["crash", "crash", "restart"], 3, 45)).toContain(
      "(our servers restarted under it once and it broke off on an unexpected error twice)",
    );
  });

  it("names no cause it did not record: a lost record, or a run re-queued before the kinds were kept", () => {
    expect(interruptedMessage([], 3, 30)).toBe(`The screen stopped 3 times before it finished, so it stopped trying on its own. ${RETRY}`);
    // Two restarts recorded of three: never "while our servers restarted" of all three.
    expect(interruptedMessage(["restart", "restart"], 3, 30)).toBe(
      `The screen stopped 3 times before it finished (our servers restarted under it twice), so it stopped trying on its own. ${RETRY}`,
    );
  });

  it("never says to run it fresh, never names the worker", () => {
    for (const kinds of [[], ["restart", "restart", "restart"], ["timeout", "crash", "restart"]] as const) {
      const m = interruptedMessage([...kinds], 3, 30);
      expect(m).not.toMatch(/fresh|worker|hit /);
      expect(m).toContain("Choose “Try again” on the deal page");
    }
  });

  it("reads the kinds the worker records, by the reason it logs, and drops anything else", () => {
    expect(interruptionOf("SIGTERM")).toBe("restart");
    expect(interruptionOf("SIGINT")).toBe("restart");
    expect(interruptionOf("timed out")).toBe("timeout");
    expect(interruptionOf("uncaught exception")).toBe("crash");
    expect(interruptionOf("unhandled rejection")).toBe("crash");
    expect(interruptionKinds(["restart", "nope", 3, "timeout"])).toEqual(["restart", "timeout"]);
    expect(interruptionKinds(undefined)).toEqual([]);
    expect(interruptionKinds("restart")).toEqual([]);
  });

  it("the worker records each re-queue's kind, and words its failure from them", () => {
    const src = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
    expect(src).toMatch(/payload: \{ \.\.\.payload, interruptions: recorded \}/);
    expect(src).toMatch(/interruptedMessage\(interruptionKinds\(payload\.interruptions\), attempts, TIMEOUT_MINUTES\)/);
    expect(src).not.toMatch(/run it fresh/);
    for (const reason of ['requeueCurrent("timed out")', "requeueCurrent(signal)", 'requeueCurrent("uncaught exception")', 'requeueCurrent("unhandled rejection")']) {
      expect(src).toContain(reason);
    }
  });
});
