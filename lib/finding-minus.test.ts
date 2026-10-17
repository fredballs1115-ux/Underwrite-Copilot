// Research pass 38, part 1's leftover (e): a building losing money beside a
// stated cap — its NOI under zero — drew a cap-mismatch finding whose title
// wrote the implied cap with a hyphen-minus, "-3.65%", where every other
// figure on the site carries its U+2212 minus. The plausibility check's
// percents now go through lib/money's sign rule. Every name is invented.
import { describe, expect, it } from "vitest";
import { assessPlausibility, inferStrategy } from "@/lib/deal-strategy";
import { compactUsd, minusFor } from "@/lib/money";
import { ex, m } from "@/lib/pass38.fixture";

const STABILIZED = { kind: "stabilized", summary: "A stabilized office building", capitalBudget: "", timeline: "" };
const losing = ex({
  assetClass: "Office",
  dealName: "Fernwood Center",
  strategy: STABILIZED,
  metrics: [m("Asking price", "20,000,000"), m("NOI (in-place)", "-730,000", "in_place"), m("Going-in cap rate", "5.50%"), m("Total SF", "80,000 SF")],
});

describe("a negative figure in a finding carries the site's minus (research pass 38)", () => {
  it("writes the implied cap on an NOI under zero with U+2212, never a hyphen-minus", () => {
    const f = assessPlausibility(losing, inferStrategy(losing)).find((x) => x.code === "cap_mismatch");
    expect(f?.title).toMatch(/^Stated 5\.50% cap vs −3\.65% from NOI \(in-place\) ÷ /);
    expect(f?.title).not.toMatch(/-\d/);
  });

  it("is compactUsd's own rule: a minus only where what is shown is not all zeros", () => {
    expect(minusFor(-0.0365, "3.65")).toBe("−");
    expect(minusFor(-0.000001, "0.00")).toBe("");
    expect(minusFor(0.055, "5.50")).toBe("");
    expect(compactUsd(-1_500_000)).toBe("−$1.5M");
    expect(compactUsd(-400)).toBe("−$400");
    expect(compactUsd(-0.4)).toBe("$0");
  });
});
