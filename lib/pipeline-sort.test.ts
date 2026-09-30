import { describe, expect, it } from "vitest";
import { compareSortValues, type SortDir } from "./pipeline-sort";

const sorted = (values: (string | number | null)[], dir: SortDir) =>
  [...values].sort((a, b) => compareSortValues(a, b, dir));

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
