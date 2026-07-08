import { describe, it, expect } from "vitest";
import { scoreMandateFit } from "./mandate";
import type { BuyBox } from "./criteria";

describe("EDGE: tripped dealbreaker can leave a high NUMBER shown with a Pass label", () => {
  it("strong scored dims + one tripped red line → e.g. 75 shown, verdict PASS", () => {
    const box: BuyBox = {
      assetClasses: ["multifamily"],
      minCapPct: 5.0,
      minIrrPct: 14.0,
      dealbreakers: { maxPriceM: 100 },
    };
    const extraction = {
      assetClass: "multifamily",
      market: "",
      address: "",
      metrics: [
        { label: "Going-in cap rate", value: "6.0%" }, // pass 15
        { label: "IRR", value: "18.0%" }, // pass 15
        { label: "Purchase price", value: "$200,000,000" }, // TRIPS the 100M red line
      ],
    };
    const r = scoreMandateFit("multifamily", extraction, box);
    // asset 15 + cap 15 + irr 15 = 45 earned; denom = 45 + 15 (dealbreaker) = 60
    console.log("EDGE tripped: score", r.score, "verdict", r.verdict, "→ gauge shows the number in red 'Pass'");
    expect(r.score).toBe(75); // 45/60
    expect(r.verdict).toBe("PASS"); // forced, but the headline still prints "75"
    expect(r.dealbreakerTripped).toBe(true);
  });
});

describe("EDGE: display score and verdict are computed from the SAME rounded number", () => {
  it("raw 49.5 rounds to 50 → WATCH (no display/verdict split)", () => {
    // cap pass (15) + irr partial. Pick irr gap so numer/denom*100 ≈ 49.5.
    // Use two floors: cap 15/15, irr earns x/15, over denom 30. Want round=50.
    // 50 => (15+x)/30*100=50 => 15+x=15 => x=0 (irr miss). round(50)=50 → WATCH.
    const box: BuyBox = { minCapPct: 5.0, minIrrPct: 14.0 };
    const ex = {
      assetClass: "", market: "", address: "",
      metrics: [
        { label: "Going-in cap rate", value: "5.5%" },
        { label: "IRR", value: "10.0%" }, // clean miss
      ],
    };
    const r = scoreMandateFit("auto", ex, box);
    console.log("EDGE boundary: score", r.score, "verdict", r.verdict);
    expect(r.score).toBe(50);
    expect(r.verdict).toBe("WATCH");
  });

  it("a score that rounds to 75 is PURSUE (boundary is inclusive and matches display)", () => {
    // cap pass 15/15, irr half credit 7.5/15 → 22.5/30 = 75.0
    const box: BuyBox = { minCapPct: 5.0, minIrrPct: 14.0 };
    const ex = {
      assetClass: "", market: "", address: "",
      metrics: [
        { label: "Going-in cap rate", value: "5.5%" },
        { label: "IRR", value: "13.5%" }, // 0.5pt under 1.0 band → 7.5
      ],
    };
    const r = scoreMandateFit("auto", ex, box);
    console.log("EDGE 75 boundary: score", r.score, "verdict", r.verdict);
    expect(r.score).toBe(75);
    expect(r.verdict).toBe("PURSUE");
  });
});
