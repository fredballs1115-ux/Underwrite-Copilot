import { describe, expect, it } from "vitest";
import { compareSortValues, pipelineSortValue, type PipelineSortKey, type SortDir, type SortableDeal } from "./pipeline-sort";

const sorted = (values: (string | number | null)[], dir: SortDir) =>
  [...values].sort((a, b) => compareSortValues(a, b, dir));

const deal = (name: string, over: Partial<SortableDeal> = {}): SortableDeal => ({
  name,
  assetClass: "multifamily",
  createdAt: "2026-09-01T12:00:00Z",
  verdict: null,
  jobStatus: null,
  fit: null,
  score: null,
  offersDue: null,
  slots: { price: null, cap: null },
  ...over,
});

/** The deals' names in the list's order under a column, as the pipeline
 *  sorts them. */
const order = (deals: SortableDeal[], key: PipelineSortKey, dir: SortDir) =>
  [...deals].sort((a, b) => compareSortValues(pipelineSortValue(a, key), pipelineSortValue(b, key), dir)).map((d) => d.name);

describe("a blank figure sorts last whichever way the list runs", () => {
  // A blank price, cap or fit had sorted as -1, so the cheapest-first list
  // opened on every unpriced deal, read as the cheapest.
  const priced = [
    deal("Unpriced"),
    deal("Big", { slots: { price: "$68,000,000", cap: "5.6%" } }),
    deal("Call for offers", { slots: { price: "Call for offers", cap: "TBD" } }),
    deal("Small", { slots: { price: "$4,000,000", cap: "8.1%" } }),
  ];

  it("by price: the priced deals in order, the unpriced and unparsed after them", () => {
    expect(order(priced, "price", "asc")).toEqual(["Small", "Big", "Unpriced", "Call for offers"]);
    expect(order(priced, "price", "desc")).toEqual(["Big", "Small", "Unpriced", "Call for offers"]);
    expect(pipelineSortValue(deal("Unpriced"), "price")).toBeNull();
    expect(pipelineSortValue(priced[2], "price")).toBeNull();
  });

  it("by cap: the same", () => {
    expect(order(priced, "cap", "asc")).toEqual(["Big", "Small", "Unpriced", "Call for offers"]);
    expect(order(priced, "cap", "desc")).toEqual(["Small", "Big", "Unpriced", "Call for offers"]);
  });

  // The second pre-merge audit: the column draws a plan deal's yield on cost
  // and a note's yield to maturity where there is no cap, and sorted both
  // with the blanks, in no order among themselves.
  it("by cap: the figure the column draws — a plan's yield on cost, a note's yield to maturity — sorts with the caps", () => {
    const column = [
      deal("Plan", { slots: { price: "$20,000,000", cap: null, yoc: "7.2%" } }),
      deal("Note", { slots: { price: "$9,000,000", cap: null, noteYield: "13.8%" } }),
      deal("Blank"),
      ...priced.slice(1),
    ];
    expect(order(column, "cap", "asc")).toEqual(["Big", "Plan", "Small", "Note", "Blank", "Call for offers"]);
    expect(order(column, "cap", "desc")).toEqual(["Note", "Small", "Plan", "Big", "Blank", "Call for offers"]);
  });

  it("by fit: a score, then the fold before a score was read, then no fit at all", () => {
    const fits = [
      deal("No box"),
      deal("Scored 71", { score: 71, fit: "near" }),
      deal("Fits, unscored", { fit: "fits" }),
      deal("Outside, unscored", { fit: "outside" }),
      deal("Scored 18", { score: 18, fit: "outside" }),
    ];
    expect(order(fits, "fit", "desc")).toEqual(["Scored 71", "Scored 18", "Fits, unscored", "Outside, unscored", "No box"]);
    expect(order(fits, "fit", "asc")).toEqual(["Outside, unscored", "Fits, unscored", "Scored 18", "Scored 71", "No box"]);
  });
});

describe("how the pipeline orders its deals", () => {
  it("puts the offers due soonest first, and a deal with no deadline last", () => {
    const due = [null, "2026-10-15", "2026-09-30", null, "2026-10-01", "2026-09-02"];
    expect(sorted(due, "asc")).toEqual(["2026-09-02", "2026-09-30", "2026-10-01", "2026-10-15", null, null]);
  });

  it("keeps a deal with no deadline last when the list runs the other way", () => {
    const due = [null, "2026-10-15", "2026-09-30", null, "2026-10-01"];
    expect(sorted(due, "desc")).toEqual(["2026-10-15", "2026-10-01", "2026-09-30", null, null]);
  });

  it("sorts text A to Z and figures by size, as the columns always have", () => {
    expect(sorted(["maddox", "harbor view", "arlington"], "asc")).toEqual(["arlington", "harbor view", "maddox"]);
    expect(sorted([5.6, 11.7, -1, 8.1], "desc")).toEqual([11.7, 8.1, 5.6, -1]);
    expect(compareSortValues(3, 3, "asc")).toBe(0);
    expect(compareSortValues(null, null, "desc")).toBe(0);
  });
});
