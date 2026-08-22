// Pins benchmarksForDeal against the REAL seed benchmarks — the metro labels
// in the seeds are the contract ("New York City", "Washington DC area",
// "Philadelphia PA" vs "Philadelphia, PA"), so synthetic fixtures would test
// nothing.

import { describe, expect, it } from "vitest";
import { benchmarksForDeal, seedBenchmarks } from "@/lib/research-data";
import { metroForAddress } from "@/lib/market-match";

const seeds = seedBenchmarks();

describe("benchmarksForDeal", () => {
  it("a Brooklyn deal finds the NYC FMR row via its covered-market name", () => {
    // City-only matching (the old behavior) finds nothing for a borough…
    expect(benchmarksForDeal(seeds, "Brooklyn", null)).toHaveLength(0);
    // …the market matcher closes the gap.
    const metro = metroForAddress({ city: "Brooklyn", state: "NY" });
    const rows = benchmarksForDeal(seeds, "Brooklyn", metro?.name);
    expect(rows.some((b) => b.metro === "New York City" && b.metric === "hud_fmr_fy2026_2br")).toBe(
      true
    );
  });

  it("a county-only DC address still reaches the DC-area FMR rows", () => {
    const metro = metroForAddress({ county: "District of Columbia", state: "DC" });
    const rows = benchmarksForDeal(seeds, null, metro?.name);
    expect(rows.some((b) => b.metro === "Washington DC area")).toBe(true);
  });

  it("DMV suburbs do NOT inherit the DC-proper FMR (unverified for counties)", () => {
    const metro = metroForAddress({ city: "Bethesda", state: "MD" });
    expect(metro?.id).toBe("montgomery_county");
    const rows = benchmarksForDeal(seeds, "Bethesda", metro?.name);
    expect(rows.some((b) => b.metro === "Washington DC area")).toBe(false);
  });

  it("Philadelphia proper gets both the city sales rows and the FMR row", () => {
    const metro = metroForAddress({ city: "Philadelphia", state: "PA" });
    const rows = benchmarksForDeal(seeds, "Philadelphia", metro?.name);
    expect(rows.some((b) => b.metro === "Philadelphia, PA")).toBe(true);
    expect(rows.some((b) => b.metro === "Philadelphia PA")).toBe(true);
  });

  it("Wilmington DE gets the Philadelphia-market FMR but not Philly-city sales", () => {
    const metro = metroForAddress({ city: "Wilmington", state: "DE" });
    const rows = benchmarksForDeal(seeds, "Wilmington", metro?.name);
    expect(rows.some((b) => b.metro === "Philadelphia PA")).toBe(true);
    expect(rows.some((b) => b.metro === "Philadelphia, PA")).toBe(false);
  });

  it("no city and no metro means no rows — never the whole national list", () => {
    expect(benchmarksForDeal(seeds, null, null)).toHaveLength(0);
    expect(benchmarksForDeal(seeds, "", "")).toHaveLength(0);
  });
});
