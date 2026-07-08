import { describe, it, expect } from "vitest";
import { scoreMandateFit } from "./mandate";
import {
  evaluateBuyBox,
  foldBuyBoxChecks,
  buyBoxCheckSource,
  type BuyBox,
} from "./criteria";

// Mirror the two production call sites:
//  - deal page:  scoreMandateFit(assetClass, buyBoxCheckSource(extraction, firstSignal, dealAddress), box)
//  - pipeline:   scoreMandateFit(assetClass, extraction, box)   (raw extraction, no address)

describe("REPRO 1: deal page vs pipeline disagree on the SAME deal (address widening)", () => {
  const box: BuyBox = {
    geos: [{ label: "Dallas, TX", city: "Dallas" }],
    minCapPct: 5.0,
  };
  // Extraction places the deal NOWHERE (no market, no address string), but a
  // cap figure is present and is a clean miss (0.5pt under the 0.25 tol band).
  const extraction = {
    assetClass: "multifamily",
    market: "",
    address: "",
    metrics: [{ label: "Going-in cap rate", value: "4.50%" }],
  };
  // The user typed a Dallas structured address on the deal.
  const dealAddress = { label: "Dallas, TX", county: "Dallas County", state: "TX" };

  it("pipeline (raw extraction) scores the deal one way", () => {
    const r = scoreMandateFit("multifamily", extraction, box);
    console.log("PIPELINE  score:", r.score, "verdict:", r.verdict,
      "market:", r.dimensions.find((d) => d.key === "market")?.status);
    // geography is UNKNOWN (empty haystack) → excluded; only cap counts → miss → 0
    expect(r.dimensions.find((d) => d.key === "market")?.status).toBe("unknown");
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("PASS");
  });

  it("deal page (buyBoxCheckSource) scores the SAME deal differently", () => {
    const src = buyBoxCheckSource(extraction, null, dealAddress);
    const r = scoreMandateFit("multifamily", src, box);
    console.log("DEALPAGE  score:", r.score, "verdict:", r.verdict,
      "market:", r.dimensions.find((d) => d.key === "market")?.status);
    // geography now PASSES (address widened the haystack) → market earns 15
    expect(r.dimensions.find((d) => d.key === "market")?.status).toBe("pass");
    expect(r.score).toBe(50);
    expect(r.verdict).toBe("WATCH");
  });
});

describe("REPRO 2: price band + per-unit are NOT scored — a deal 4x over ceiling scores 100/PURSUE", () => {
  const box: BuyBox = {
    priceMaxM: 50, // hard-ish band, but only a SCORED miss for evaluateBuyBox
    maxPerUnitK: 100,
    minCapPct: 5.0,
    minIrrPct: 14.0,
  };
  const extraction = {
    assetClass: "multifamily",
    market: "Dallas, TX",
    address: "Dallas, TX",
    metrics: [
      { label: "Purchase price", value: "$200,000,000" }, // 4x the 50M band
      { label: "Price per unit", value: "$500,000" }, // 5x the 100k cap
      { label: "Going-in cap rate", value: "6.00%" },
      { label: "IRR", value: "16.0%" },
    ],
  };
  it("evaluateBuyBox folds to OUTSIDE (price + basis miss)", () => {
    const fold = foldBuyBoxChecks(evaluateBuyBox("multifamily", extraction, box));
    expect(fold).toBe("outside");
  });
  it("scoreMandateFit ignores price/per-unit → 100 / PURSUE", () => {
    const r = scoreMandateFit("multifamily", extraction, box);
    console.log("REPRO2 score:", r.score, "verdict:", r.verdict,
      "dims:", r.dimensions.map((d) => d.key));
    expect(r.score).toBe(100);
    expect(r.verdict).toBe("PURSUE");
    // no price / per-unit dimension exists at all
    expect(r.dimensions.some((d) => d.key === ("price" as never))).toBe(false);
  });
});

describe("REPRO 3: coverage line 'N of M criteria you set' undercounts (price/per-unit dropped)", () => {
  it("box sets price + cap, but dimensions.length counts only cap", () => {
    const box: BuyBox = { priceMaxM: 50, maxPerUnitK: 100, minCapPct: 5.0 };
    const extraction = {
      assetClass: "multifamily",
      market: "",
      address: "",
      metrics: [
        { label: "Purchase price", value: "$200,000,000" },
        { label: "Price per unit", value: "$500,000" },
        { label: "Going-in cap rate", value: "5.5%" },
      ],
    };
    const r = scoreMandateFit("multifamily", extraction, box);
    // The UI prints: "Scored on {scored} of {dimensions.length} criteria you set"
    console.log("REPRO3 dimensions.length =", r.dimensions.length,
      "but box set 3 criteria (price, per-unit, cap)");
    expect(r.dimensions.length).toBe(1); // only cap; the copy will say "1 of 1"
  });
});

describe("REPRO 4: a cleared dealbreaker adds +15 and lifts a failing deal to WATCH", () => {
  it("cap miss alone is PASS; adding a cleared price dealbreaker makes it WATCH", () => {
    const base: BuyBox = { minCapPct: 5.0 };
    const withDb: BuyBox = { minCapPct: 5.0, dealbreakers: { maxPriceM: 100 } };
    const extraction = {
      assetClass: "multifamily",
      market: "",
      address: "",
      metrics: [
        { label: "Going-in cap rate", value: "4.0%" }, // clean miss
        { label: "Purchase price", value: "$50,000,000" }, // under the 100M red line
      ],
    };
    const a = scoreMandateFit("multifamily", extraction, base);
    const b = scoreMandateFit("multifamily", extraction, withDb);
    console.log("REPRO4 no-db:", a.score, a.verdict, "| with-cleared-db:", b.score, b.verdict);
    expect(a.score).toBe(0);
    expect(a.verdict).toBe("PASS");
    expect(b.score).toBe(50); // 15 (db clear) / 30
    expect(b.verdict).toBe("WATCH");
  });
});

describe("REPRO 5: dealbreaker forces PASS regardless of score (sanity)", () => {
  it("high fundamentals but tripped geography red line → PASS", () => {
    const box: BuyBox = {
      geos: [{ label: "Dallas, TX", city: "Dallas" }],
      minCapPct: 5.0,
      minIrrPct: 14.0,
      dealbreakers: { requireGeography: true },
    };
    const extraction = {
      assetClass: "multifamily",
      market: "Houston, TX",
      address: "Houston, TX",
      metrics: [
        { label: "Going-in cap rate", value: "6.0%" },
        { label: "IRR", value: "18.0%" },
      ],
    };
    const r = scoreMandateFit("multifamily", extraction, box);
    console.log("REPRO5 score:", r.score, "verdict:", r.verdict, "tripped:", r.dealbreakerTripped);
    expect(r.dealbreakerTripped).toBe(true);
    expect(r.verdict).toBe("PASS");
  });
});

describe("REPRO 6: determinism across many runs", () => {
  it("identical output over 100 runs", () => {
    const box: BuyBox = {
      assetClasses: ["multifamily"],
      geos: [{ label: "Dallas, TX", city: "Dallas" }],
      sfMin: 100_000, sfMax: 300_000,
      minCapPct: 5.0, minCoCPct: 6.0, minIrrPct: 14.0,
      dealbreakers: { maxPriceM: 100 },
    };
    const extraction = {
      assetClass: "multifamily", market: "Dallas, TX", address: "Dallas, TX",
      metrics: [
        { label: "Total SF", value: "315,000 SF" },
        { label: "Going-in cap rate", value: "4.90%" },
        { label: "Cash-on-cash", value: "5.5%" },
        { label: "IRR", value: "13.5%" },
        { label: "Purchase price", value: "$80,000,000" },
      ],
    };
    const first = JSON.stringify(scoreMandateFit("multifamily", extraction, box));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(scoreMandateFit("multifamily", extraction, box))).toBe(first);
    }
    console.log("REPRO6 stable score:", JSON.parse(first).score, JSON.parse(first).verdict);
  });
});
