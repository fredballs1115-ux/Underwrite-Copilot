// The eighth review's first finding: the memo's "Key terms" block sorted the
// flagged rows first and cut at four, so the sample memo opened on four
// speculative pro-forma figures and never stated the asking price, the
// going-in cap or the unit count. One reader now orders the block for the
// memo and the shared screen alike.
import { describe, expect, it } from "vitest";
import { keyTermRows } from "./key-terms";
import { SAMPLE_DEAL } from "./sample-deal";
import { inferStrategy } from "./deal-strategy";

const conversion = [
  { label: "NOI (stabilized, pro forma)", value: "$21,000,000", flagged: true },
  { label: "Pro forma rent", value: "$3,400/mo", flagged: true },
  { label: "Rentable square feet", value: "300,000", flagged: false },
  { label: "Total project cost", value: "$180,000,000", flagged: false },
  { label: "Purchase price", value: "$20,000,000", flagged: false },
  { label: "Proposed units", value: "612", flagged: false },
];

describe("keyTermRows — the deal-defining rows lead the key terms", () => {
  it("on the sample deal: asking price, going-in cap and units first, then the flagged rows", () => {
    const rows = keyTermRows(SAMPLE_DEAL.extraction.metrics, inferStrategy(SAMPLE_DEAL.extraction).kind, 8);
    expect(rows.slice(0, 3).map((m) => m.label)).toEqual(["Asking price", "Going-in cap", "Units"]);
    // The flagged pro-forma rows still come before the unflagged rest.
    expect(rows[3].flagged).toBe(true);
    // Cut at four — the memo's width when the screen block is present — the
    // price is still on the page.
    expect(keyTermRows(SAMPLE_DEAL.extraction.metrics, "stabilized", 4).map((m) => m.value)).toContain("$68,000,000");
  });

  it("on a plan deal: the price, the stabilized NOI and the total cost the plan is judged on, then the planned units", () => {
    const rows = keyTermRows(conversion, "conversion", 4);
    expect(rows.map((m) => m.label)).toEqual([
      "Purchase price",
      "NOI (stabilized, pro forma)",
      "Total project cost",
      "Proposed units",
    ]);
  });

  it("a development with only a land cost leads with it; a stabilized asset never leads with a stabilized NOI", () => {
    const land = [
      { label: "Pro forma NOI (stabilized)", value: "$9,000,000", flagged: true },
      { label: "Land cost", value: "$8,000,000", flagged: false },
      { label: "Proposed units", value: "240", flagged: false },
    ];
    expect(keyTermRows(land, "development", 8)[0].label).toBe("Land cost");
    const stabilized = [
      { label: "NOI (stabilized, pro forma)", value: "$4,000,000", flagged: true },
      { label: "Going-in cap rate", value: "5.4%", flagged: false },
      { label: "Asking price", value: "$60,000,000", flagged: false },
    ];
    expect(keyTermRows(stabilized, "stabilized", 8).map((m) => m.label)).toEqual([
      "Asking price",
      "Going-in cap rate",
      "NOI (stabilized, pro forma)",
    ]);
  });

  it("drops rows that are not objects, never repeats a row, and honours the limit", () => {
    const rows = keyTermRows([null, ...conversion, undefined, conversion[4]], "conversion", 3);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((m) => m.label)).size).toBe(3);
    expect(keyTermRows([], "conversion", 4)).toEqual([]);
  });
});
