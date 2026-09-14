import { describe, expect, it } from "vitest";
import {
  callCost,
  costByStep,
  medianUsd,
  newLedger,
  priceFor,
  recordUsage,
  summarizeUsage,
  usageLogLine,
  usageOfResponse,
  withUsageLedger,
  type CallUsage,
} from "./usage";
import { PRICES } from "./models";

const flagship = PRICES[0];

const call = (over: Partial<CallUsage> = {}): CallUsage => ({
  what: "Extraction",
  model: flagship.prefix,
  input: 1_000,
  cacheWrite: 0,
  cacheRead: 0,
  output: 500,
  ms: 1_200,
  ...over,
});

describe("the ledger", () => {
  it("records only inside an open ledger; a call outside is a no-op", async () => {
    const ledger = newLedger();
    recordUsage(call());
    expect(ledger.calls).toHaveLength(0);
    await withUsageLedger(ledger, async () => {
      recordUsage(call());
      await new Promise((r) => setTimeout(r, 1));
      recordUsage(call({ what: "The verdict" }));
    });
    expect(ledger.calls.map((c) => c.what)).toEqual(["Extraction", "The verdict"]);
    recordUsage(call());
    expect(ledger.calls).toHaveLength(2);
  });

  it("two runs side by side keep their own ledgers", async () => {
    const a = newLedger();
    const b = newLedger();
    await Promise.all([
      withUsageLedger(a, async () => {
        await new Promise((r) => setTimeout(r, 2));
        recordUsage(call({ what: "A" }));
      }),
      withUsageLedger(b, async () => {
        recordUsage(call({ what: "B" }));
      }),
    ]);
    expect(a.calls.map((c) => c.what)).toEqual(["A"]);
    expect(b.calls.map((c) => c.what)).toEqual(["B"]);
  });
});

describe("usageOfResponse", () => {
  it("reads the four meters and the model off a response; a missing meter is 0", () => {
    expect(
      usageOfResponse(
        "Extraction",
        { model: "m-1", usage: { input_tokens: 12, cache_creation_input_tokens: null, cache_read_input_tokens: 300, output_tokens: 7 } },
        99.6,
      ),
    ).toEqual({ what: "Extraction", model: "m-1", input: 12, cacheWrite: 0, cacheRead: 300, output: 7, ms: 100 });
  });

  it("a response with no usage records nothing", () => {
    expect(usageOfResponse("Extraction", { model: "m-1" }, 5)).toBeNull();
    expect(usageOfResponse("Extraction", { usage: null }, 5)).toBeNull();
  });
});

describe("the price table", () => {
  it("prices the flagship by id prefix, in any case, and no other id", () => {
    expect(priceFor(flagship.prefix)).toEqual({ input: flagship.input, output: flagship.output });
    expect(priceFor(flagship.prefix.toUpperCase() + "-20990101")).toEqual({ input: flagship.input, output: flagship.output });
    expect(priceFor("some-other-model")).toBeNull();
    expect(priceFor("")).toBeNull();
  });

  it("a call's dollars: input at list, cache writes at the write premium, reads at a tenth, output at list", () => {
    const c = call({ input: 1_000_000, cacheWrite: 1_000_000, cacheRead: 1_000_000, output: 1_000_000 });
    expect(callCost(c)).toBeCloseTo(flagship.input * (1 + 1.25 + 0.1) + flagship.output, 6);
    expect(callCost(call({ model: "unknown-model" }))).toBeNull();
  });
});

describe("summarizeUsage", () => {
  it("totals the meters, sums the dollars to cents, and keeps the calls", () => {
    const ledger = newLedger();
    ledger.calls.push(
      call({ what: "The first signal", cacheWrite: 300_000, input: 2_000, output: 400, ms: 8_000 }),
      call({ what: "Extraction", cacheRead: 300_000, input: 1_500, output: 6_000, ms: 40_000 }),
    );
    const s = summarizeUsage(ledger, new Date("2026-09-14T17:00:00Z"));
    expect(s.totals).toEqual({ input: 3_500, cacheWrite: 300_000, cacheRead: 300_000, output: 6_400 });
    expect(s.ms).toBe(48_000);
    expect(s.at).toBe("2026-09-14T17:00:00.000Z");
    expect(s.unpriced).toEqual([]);
    const expected =
      (3_500 * flagship.input + 300_000 * flagship.input * 1.25 + 300_000 * flagship.input * 0.1 + 6_400 * flagship.output) /
      1_000_000;
    expect(s.usd).toBe(Math.round(expected * 100) / 100);
    expect(s.calls).toHaveLength(2);
  });

  it("an unpriced model leaves the dollars blank and is named, while its tokens still count", () => {
    const ledger = newLedger();
    ledger.calls.push(call(), call({ what: "The verdict", model: "mystery-model", input: 20_000 }));
    const s = summarizeUsage(ledger);
    expect(s.usd).toBeNull();
    expect(s.unpriced).toEqual(["mystery-model"]);
    expect(s.totals.input).toBe(21_000);
    expect(usageLogLine("d1", s)).toMatch(/unpriced model: mystery-model/);
  });

  it("the log line names the deal, the call count, the four meters and the dollars", () => {
    const ledger = newLedger();
    ledger.calls.push(call({ input: 12_340, cacheWrite: 310_200, cacheRead: 1_240_800, output: 21_300 }));
    const line = usageLogLine("d1", summarizeUsage(ledger));
    expect(line).toMatch(/^\[pipeline\] screen usage for deal d1: 1 calls · in 12,340 · cache write 310,200 · cache read 1,240,800 · out 21,300 · ≈ \$\d+\.\d\d at list price$/);
  });
});

describe("the operator's picture", () => {
  it("splits the dollars by step in call order; a repeated step adds up; an unpriced step is blank", () => {
    const ledger = newLedger();
    ledger.calls.push(
      call({ what: "The first signal", input: 1_000_000, output: 0 }),
      call({ what: "Extraction", input: 1_000_000, output: 0 }),
      call({ what: "Extraction", input: 1_000_000, output: 0 }),
      call({ what: "The verdict", model: "mystery-model" }),
    );
    expect(costByStep(summarizeUsage(ledger))).toEqual([
      { what: "The first signal", usd: flagship.input },
      { what: "Extraction", usd: flagship.input * 2 },
      { what: "The verdict", usd: null },
    ]);
  });

  it("the median of the screens' dollars, to cents; none is null", () => {
    expect(medianUsd([])).toBeNull();
    expect(medianUsd([3.1])).toBe(3.1);
    expect(medianUsd([1, 4, 2])).toBe(2);
    expect(medianUsd([1, 4, 2, 3])).toBe(2.5);
  });
});
