// A building's history is not a plan. An OM's "Year built / renovated" row,
// a "newly renovated" note or a renovation year must never infer a value-add
// for a stabilized asset — that inference strips the going-in cap on every
// surface for a deal screened before the extraction stated its strategy.
import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import { inferStrategy } from "./deal-strategy";

const m = (label: string, value: string): ExtractedMetric => ({ label, value, flagged: false, page: "" });

const base = (metrics: ExtractedMetric[], over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  dealName: "Maddox Apartments",
  assetClass: "multifamily",
  market: "Dallas, TX",
  address: "1 Maddox Way, Dallas, TX",
  metrics,
  ...over,
});

const OPERATING = [
  m("Asking price", "$50,000,000"),
  m("Going-in cap rate", "5.70%"),
  m("NOI (in-place)", "$2,850,000"),
  m("Units", "248"),
];

describe("inferStrategy — what was done to a building is not a plan", () => {
  it("a 'Year built / renovated' row keeps a stabilized asset stabilized", () => {
    expect(inferStrategy(base([...OPERATING, m("Year built / renovated", "1968 / 2019")])).kind).toBe(
      "stabilized",
    );
    expect(inferStrategy(base([...OPERATING, m("Renovation year", "2019")])).kind).toBe("stabilized");
    expect(inferStrategy(base([...OPERATING, m("Year built", "1985"), m("Vintage", "1985")])).kind).toBe(
      "stabilized",
    );
  });

  it("'newly renovated' in the notes or the name is history, not a plan", () => {
    expect(
      inferStrategy(base(OPERATING, { buyerNotes: "Newly renovated in 2021, fully leased." })).kind,
    ).toBe("stabilized");
    expect(inferStrategy(base(OPERATING, { dealName: "Maddox Apartments (renovated 2019)" })).kind).toBe(
      "stabilized",
    );
  });

  it("a renovation program, budget or plan still reads as value-add", () => {
    expect(inferStrategy(base([...OPERATING, m("Renovation budget", "$4,200,000")])).kind).toBe("value_add");
    expect(
      inferStrategy(base(OPERATING, { buyerNotes: "Renovation program across 120 classic units." })).kind,
    ).toBe("value_add");
    expect(inferStrategy(base(OPERATING, { buyerNotes: "Value-add: renovate 120 units." })).kind).toBe(
      "value_add",
    );
  });

  it("a stated strategy still wins over every word in the OM", () => {
    expect(
      inferStrategy(
        base([...OPERATING, m("Renovation budget", "$4,200,000")], {
          strategy: { kind: "stabilized", summary: "", capitalBudget: "", timeline: "" },
        }),
      ).kind,
    ).toBe("stabilized");
  });
});
