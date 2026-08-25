// Pins benchmarksForDeal against the REAL seed benchmarks — the metro labels
// in the seeds are the contract ("New York City", "Washington DC area",
// "Philadelphia PA" vs "Philadelphia, PA"), so synthetic fixtures would test
// nothing.

import { describe, expect, it } from "vitest";
import { benchmarksForDeal, seedBenchmarks } from "@/lib/research-data";
import { metroForAddress } from "@/lib/market-match";
import metrosSeed from "@/data/research/metros.json";

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

describe("sector snapshot benchmark rows", () => {
  it("emits Philadelphia office vacancy as the observed tracker spread", () => {
    const row = seeds.find(
      (b) => b.metric === "office_vacancy_pct" && b.metro.startsWith("Philadelphia"),
    );
    expect(row).toBeTruthy();
    expect(row!.low).toBe(17.7);
    expect(row!.high).toBe(22.3);
    expect(row!.sector).toBe("office");
  });

  it("emits the DC multifamily cap band and NoVA industrial rent", () => {
    const cap = seeds.find(
      (b) => b.metric === "multifamily_cap_rate_pct" && b.metro === "Washington DC",
    );
    expect(cap).toBeTruthy();
    expect(cap!.low).toBe(4.75);
    expect(cap!.high).toBe(5.5);
    const nova = seeds.find(
      (b) => b.metric === "industrial_asking_rent_psf" && b.metro === "Northern Virginia",
    );
    expect(nova).toBeTruthy();
    expect(nova!.low).toBeCloseTo(17.44, 2);
  });

  it("emits NO cap-rate row where the research deliberately carries null", () => {
    // Philadelphia's MF cap is a documented gap (inconsistent aggregator) —
    // the generator must not conjure a row from the nulls.
    const row = seeds.find(
      (b) => b.metric === "multifamily_cap_rate_pct" && b.metro.startsWith("Philadelphia"),
    );
    expect(row).toBeUndefined();
  });

  it("every snapshot row carries provenance", () => {
    const snapRows = seeds.filter((b) =>
      /_(vacancy_pct|asking_rent_psf|cap_rate_pct)$/.test(b.metric),
    );
    expect(snapRows.length).toBeGreaterThanOrEqual(8);
    for (const r of snapRows) {
      expect(r.source, `${r.metro} ${r.metric}`).toMatch(/^https?:\/\//);
      expect(r.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it("the homepage spread board has at least three real divergences to draw", () => {
    // The SpreadBoard derives (metro, sector) pairs where two named trackers
    // publish different vacancy figures. Lock the derivation's ground truth:
    // the widest spread today is LA office (17.8-25.8), and there are always
    // at least three genuine spreads to fill the board.
    const rows: { name: string; sector: string; low: number; high: number }[] = [];
    for (const m of metrosSeed.metros ?? []) {
      const snap = (m as { sector_snapshot?: Record<string, unknown> | null }).sector_snapshot;
      if (!snap) continue;
      for (const [sector, blk] of Object.entries(snap)) {
        if (sector === "as_of" || typeof blk !== "object" || blk == null) continue;
        const b = blk as { vacancy_pct?: number | null; vacancy_pct_low?: number | null; vacancy_pct_high?: number | null };
        const low = b.vacancy_pct ?? b.vacancy_pct_low;
        const high = b.vacancy_pct ?? b.vacancy_pct_high;
        if (typeof low === "number" && typeof high === "number" && high > low) {
          rows.push({ name: m.name, sector, low, high });
        }
      }
    }
    rows.sort((a, b) => b.high - b.low - (a.high - a.low));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0].name).toBe("Los Angeles");
    expect(rows[0].sector).toBe("office");
    expect(rows[0].low).toBeCloseTo(17.8, 3);
    expect(rows[0].high).toBeCloseTo(25.8, 3);
  });
});
