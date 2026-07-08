import { describe, it, expect } from "vitest";
import { scoreMandateFit, WEIGHTS } from "./mandate";
import { evaluateBuyBox, foldBuyBoxChecks, type BuyBox } from "./criteria";

/** Build a minimal extraction-like object for the score to read. */
function ex(
  metrics: Array<[string, string]>,
  extra: { assetClass?: string; market?: string; address?: string } = {},
) {
  return {
    assetClass: extra.assetClass,
    market: extra.market,
    address: extra.address,
    metrics: metrics.map(([label, value]) => ({ label, value })),
  };
}

const dim = (r: ReturnType<typeof scoreMandateFit>, key: string) =>
  r.dimensions.find((d) => d.key === key);

describe("scoreMandateFit — weighting", () => {
  it("weights sum to 100 across all seven dimensions", () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe("scoreMandateFit — perfect fit", () => {
  const box: BuyBox = {
    assetClasses: ["multifamily"],
    geos: [{ label: "Dallas, TX", city: "Dallas", state: "TX" }],
    sfMin: 100_000,
    sfMax: 300_000,
    minCapPct: 5.0,
    minCoCPct: 6.0,
    minIrrPct: 14.0,
    dealbreakers: { maxPriceM: 100 },
  };
  const extraction = ex(
    [
      ["Total SF", "200,000 SF"],
      ["Going-in cap rate", "5.50%"],
      ["Cash-on-cash", "7.0%"],
      ["IRR", "16.0%"],
      ["Purchase price", "$80,000,000"],
    ],
    { assetClass: "multifamily", market: "North Dallas, TX", address: "123 Main St, Dallas, TX" },
  );

  it("scores 100 and PURSUE when every dimension clears", () => {
    const r = scoreMandateFit("multifamily", extraction, box);
    expect(r.score).toBe(100);
    expect(r.verdict).toBe("PURSUE");
    expect(r.dealbreakerTripped).toBe(false);
    expect(r.unresolvedDealbreakers).toBe(0);
    for (const d of r.dimensions) expect(d.status).toBe("pass");
  });

  it("is deterministic — same inputs, identical result", () => {
    const a = scoreMandateFit("multifamily", extraction, box);
    const b = scoreMandateFit("multifamily", extraction, box);
    expect(a).toEqual(b);
  });
});

describe("scoreMandateFit — hard fail (dealbreaker tripped)", () => {
  it("a violated price ceiling forces PASS even with a strong score", () => {
    const box: BuyBox = {
      assetClasses: ["multifamily"],
      geos: [{ label: "Dallas, TX", city: "Dallas" }],
      sfMin: 100_000,
      sfMax: 300_000,
      minCapPct: 5.0,
      minCoCPct: 6.0,
      minIrrPct: 14.0,
      dealbreakers: { maxPriceM: 100 },
    };
    const extraction = ex(
      [
        ["Total SF", "200,000 SF"],
        ["Going-in cap rate", "5.50%"],
        ["Cash-on-cash", "7.0%"],
        ["IRR", "16.0%"],
        ["Purchase price", "$120,000,000"], // over the $100M ceiling
      ],
      { assetClass: "multifamily", market: "North Dallas, TX", address: "Dallas, TX" },
    );
    const r = scoreMandateFit("multifamily", extraction, box);
    expect(r.dealbreakerTripped).toBe(true);
    expect(r.verdict).toBe("PASS"); // forced, despite a high point total
    expect(r.score).toBe(85); // 6 of 7 dims pass, dealbreakers earns 0
    expect(dim(r, "dealbreakers")?.status).toBe("miss");
  });

  it("a location dealbreaker trips when the deal is off-map", () => {
    const box: BuyBox = {
      geos: [{ label: "Dallas, TX", city: "Dallas" }],
      minCapPct: 5.0,
      dealbreakers: { requireGeography: true },
    };
    const extraction = ex([["Going-in cap rate", "6.00%"]], {
      market: "Houston, TX",
      address: "Houston, TX",
    });
    const r = scoreMandateFit("auto", extraction, box);
    expect(r.dealbreakerTripped).toBe(true);
    expect(r.verdict).toBe("PASS");
    expect(dim(r, "market")?.status).toBe("miss");
  });
});

describe("scoreMandateFit — proportional partial credit", () => {
  it("a cap just under the floor earns linear partial credit", () => {
    const box: BuyBox = { minCapPct: 5.0 }; // tol band is 0.25pt
    const extraction = ex([["Going-in cap rate", "4.90%"]]); // 0.10pt under
    const r = scoreMandateFit("auto", extraction, box);
    const cap = dim(r, "cap")!;
    expect(cap.status).toBe("partial");
    // 15 * (1 - 0.10/0.25) = 9
    expect(cap.earned).toBeCloseTo(9, 5);
    expect(r.score).toBe(60); // 9 / 15
    expect(r.verdict).toBe("WATCH");
  });

  it("a size just over the band earns linear partial credit", () => {
    const box: BuyBox = { sfMax: 300_000 }; // NEAR_REL = 10%
    const extraction = ex([["Total SF", "315,000 SF"]]); // 5% over
    const r = scoreMandateFit("auto", extraction, box);
    const size = dim(r, "size")!;
    expect(size.status).toBe("partial");
    // 10 * (1 - 0.05/0.10) = 5
    expect(size.earned).toBeCloseTo(5, 5);
    expect(r.score).toBe(50);
  });

  it("beyond the tolerance band it is a clean miss (zero)", () => {
    const box: BuyBox = { minCapPct: 5.0 };
    const extraction = ex([["Going-in cap rate", "4.50%"]]); // 0.50pt under > 0.25 tol
    const r = scoreMandateFit("auto", extraction, box);
    expect(dim(r, "cap")?.status).toBe("miss");
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("PASS");
  });
});

describe("scoreMandateFit — unknowns never fake a pass or a fail", () => {
  it("an unresolvable dealbreaker is excluded and surfaced, not tripped", () => {
    const box: BuyBox = {
      assetClasses: ["multifamily"],
      dealbreakers: { minCapPct: 6.0 },
    };
    // No cap figure in the screen → the dealbreaker can't be evaluated.
    const extraction = ex([], { assetClass: "multifamily" });
    const r = scoreMandateFit("multifamily", extraction, box);
    expect(dim(r, "dealbreakers")?.status).toBe("unknown");
    expect(r.dealbreakerTripped).toBe(false);
    expect(r.unresolvedDealbreakers).toBe(1);
    // Scored only on the asset class (which passes) → 100, dealbreaker excluded.
    expect(r.score).toBe(100);
    expect(r.verdict).toBe("PURSUE");
  });

  it("a criterion with no parseable figure is dropped from the denominator", () => {
    const box: BuyBox = { minCapPct: 5.0, minCoCPct: 6.0 };
    const extraction = ex([["Going-in cap rate", "5.50%"]]); // no CoC in the OM
    const r = scoreMandateFit("auto", extraction, box);
    expect(dim(r, "coc")?.status).toBe("unknown");
    expect(dim(r, "cap")?.status).toBe("pass");
    expect(r.score).toBe(100); // 15/15 — CoC excluded, not counted as a fail
  });

  it("returns null when nothing configured is checkable yet", () => {
    const box: BuyBox = { minCapPct: 5.0 };
    const extraction = ex([["Some other metric", "whatever"]]);
    const r = scoreMandateFit("auto", extraction, box);
    expect(r.score).toBeNull();
    expect(r.verdict).toBeNull();
  });
});

describe("scoreMandateFit — verdict thresholds", () => {
  it("exactly 75 → PURSUE", () => {
    // cap passes (15/15), IRR half-credit (7.5/15) → 22.5 / 30 = 75
    const box: BuyBox = { minCapPct: 5.0, minIrrPct: 14.0 };
    const extraction = ex([
      ["Going-in cap rate", "5.50%"],
      ["IRR", "13.5%"], // 0.5pt under a 1.0pt band → half credit
    ]);
    const r = scoreMandateFit("auto", extraction, box);
    expect(r.score).toBe(75);
    expect(r.verdict).toBe("PURSUE");
  });

  it("exactly 50 → WATCH", () => {
    // cap passes (15), IRR misses (0) → 15 / 30 = 50
    const box: BuyBox = { minCapPct: 5.0, minIrrPct: 14.0 };
    const extraction = ex([
      ["Going-in cap rate", "5.50%"],
      ["IRR", "11.0%"], // 3pt under → clean miss
    ]);
    const r = scoreMandateFit("auto", extraction, box);
    expect(r.score).toBe(50);
    expect(r.verdict).toBe("WATCH");
  });

  it("below 50 → PASS", () => {
    // cap passes (15), market + IRR miss → 15 / 45 = 33
    const box: BuyBox = {
      geos: [{ label: "Dallas, TX", city: "Dallas" }],
      minCapPct: 5.0,
      minIrrPct: 14.0,
    };
    const extraction = ex(
      [
        ["Going-in cap rate", "5.50%"],
        ["IRR", "9.0%"],
      ],
      { market: "Phoenix, AZ", address: "Phoenix, AZ" },
    );
    const r = scoreMandateFit("auto", extraction, box);
    expect(r.score).toBe(33);
    expect(r.verdict).toBe("PASS");
  });
});

describe("scoreMandateFit — agrees with the buy-box check on the shared figures", () => {
  it("a cap-floor miss shows as both an outside fold and a cap miss", () => {
    const box: BuyBox = { minCapPct: 6.0 };
    const extraction = ex([["Going-in cap rate", "4.00%"]]);
    const fold = foldBuyBoxChecks(evaluateBuyBox("auto", extraction, box));
    const r = scoreMandateFit("auto", extraction, box);
    expect(fold).toBe("outside");
    expect(dim(r, "cap")?.status).toBe("miss");
  });
});
