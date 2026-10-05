// The sample's sentences quote its own first-draft model (lib/sample-deal).
// Research pass 40, L8: its exit was said to be "held flat to going-in" while
// the model exits at 5.50% against a 5.45% going-in cap — a 5 bps expansion,
// not flat. The exit's rationale and the model's summary say the exit and its
// 5 bps over the going-in cap now, read off the model itself (the going-in
// figure stays on the tab's own tile); the pinned figures are unchanged.
import { describe, expect, it } from "vitest";
import { SAMPLE_DEAL } from "@/lib/sample-deal";

describe("the sample's exit against its going-in cap (research pass 40, L8)", () => {
  it("says the exit as the model's figures, never as flat to going-in", () => {
    const model = SAMPLE_DEAL.model;
    expect(model.inputs.exitCapPct).toBe(5.5);
    expect(model.returns.goingInCapPct.toFixed(2)).toBe("5.45");
    const exit = model.metrics.find((m) => m.key === "exitCap")!;
    expect(exit.chosenValue).toBe("5.50%");
    expect(exit.rationale).toBe("5.50%, 5 bps over the going-in cap — no compression thesis.");
    expect(model.summary).toContain("the exit is 5.50%, 5 bps over the going-in cap, with no compression assumed.");
    expect(`${exit.rationale} ${model.summary}`).not.toMatch(/flat to going-in/i);
  });
});
