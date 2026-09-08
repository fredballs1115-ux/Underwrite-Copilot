import { describe, expect, it } from "vitest";
import { RunGate, concurrencyFromEnv } from "./run-gate";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("RunGate — at most N runs hold a slot; the rest wait their turn", () => {
  it("the third acquire waits until one of the first two releases", async () => {
    const gate = new RunGate(() => 2);
    const a = await gate.acquire();
    const b = await gate.acquire();
    let third: (() => void) | null = null;
    const pending = gate.acquire().then((release) => {
      third = release;
    });
    await tick();
    expect(third).toBeNull();
    expect(gate.inFlight).toBe(2);
    expect(gate.queued).toBe(1);

    a();
    await pending;
    expect(third).not.toBeNull();
    expect(gate.inFlight).toBe(2);
    expect(gate.queued).toBe(0);
    b();
    third!();
    expect(gate.inFlight).toBe(0);
  });

  it("release is idempotent, so a finally after an early return cannot free a slot twice", async () => {
    const gate = new RunGate(() => 1);
    const release = await gate.acquire();
    release();
    release();
    expect(gate.inFlight).toBe(0);
    const again = await gate.acquire();
    expect(gate.inFlight).toBe(1);
    again();
  });

  it("the limit is read on every acquire, and never below one", async () => {
    let limit = 0;
    const gate = new RunGate(() => limit);
    const a = await gate.acquire();
    let second = false;
    const pending = gate.acquire().then(() => {
      second = true;
    });
    await tick();
    expect(second).toBe(false);
    limit = 2;
    // A raised limit takes effect at the next release, not retroactively.
    a();
    await pending;
    expect(second).toBe(true);
  });

  it("wakes waiters in the order they arrived", async () => {
    const gate = new RunGate(() => 1);
    const order: string[] = [];
    const first = await gate.acquire();
    const p2 = gate.acquire().then((r) => {
      order.push("second");
      r();
    });
    const p3 = gate.acquire().then((r) => {
      order.push("third");
      r();
    });
    first();
    await Promise.all([p2, p3]);
    expect(order).toEqual(["second", "third"]);
  });
});

describe("concurrencyFromEnv", () => {
  it("reads a whole number of at least one, else two", () => {
    expect(concurrencyFromEnv({ ANALYSIS_CONCURRENCY: "3" })).toBe(3);
    expect(concurrencyFromEnv({ ANALYSIS_CONCURRENCY: "1.9" })).toBe(1);
    expect(concurrencyFromEnv({ ANALYSIS_CONCURRENCY: "0" })).toBe(2);
    expect(concurrencyFromEnv({ ANALYSIS_CONCURRENCY: "lots" })).toBe(2);
    expect(concurrencyFromEnv({})).toBe(2);
  });
});
