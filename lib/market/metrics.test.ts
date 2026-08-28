import { describe, expect, it } from "vitest";
import {
  deliverySchedule,
  monthsOfSupply,
  reconcilePipeline,
  rentTrend,
  submarketMetrics,
  trailing12Absorption,
  ucShareOfInventory,
} from "./metrics";
import {
  applyExclusionRules,
  exclusionReasonFor,
  exclusionSummary,
  isRoundPlaceholder,
  staleVerdict,
} from "./exclusions";
import { assumptionWarnings, memoLinesFor } from "./checks";
import { parseRentBasis, parsePeriodLabel, parseStatus, suggestMarketMapping, toPeriods, toPipeline, PERIOD_FIELDS, PIPELINE_FIELDS } from "./import";
import { parseCsv } from "@/lib/rentroll/parse";
import { EMPTY_RULES, type PipelineProperty, type Submarket, type SubmarketPeriod } from "./types";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";

// ---------------------------------------------------------------------------
// Fixtures — a corridor industrial submarket with four quarters of data.
// ---------------------------------------------------------------------------

const period = (over: Partial<SubmarketPeriod> & { period: string }): SubmarketPeriod => ({
  id: over.period,
  submarketId: "sm",
  inventorySf: 20_000_000,
  vacancyPct: 0.06,
  netAbsorptionSf: 150_000,
  underConstructionSf: 1_200_000,
  askingRent: 9.5,
  rentBasis: "nnn_direct",
  source: "market-export.csv",
  unverified: false,
  sourceUrl: null,
  ...over,
});

/** Rents compound at roughly 2.9%/yr on one consistent basis — slower than the
 *  4.0% the deal below underwrites, which is the whole point of the check. */
const PERIODS: SubmarketPeriod[] = [
  period({ period: "2025-03-31", askingRent: 9.3, netAbsorptionSf: 120_000, vacancyPct: 0.052 }),
  period({ period: "2025-06-30", askingRent: 9.35, netAbsorptionSf: 180_000, vacancyPct: 0.048 }),
  period({ period: "2025-09-30", askingRent: 9.42, netAbsorptionSf: 90_000, vacancyPct: 0.055 }),
  period({ period: "2025-12-31", askingRent: 9.5, netAbsorptionSf: 110_000, vacancyPct: 0.06 }),
];

const prop = (over: Partial<PipelineProperty> & { id: string }): PipelineProperty => ({
  submarketId: "sm",
  name: over.id,
  address: "",
  sf: 200_000,
  status: "under_construction",
  expectedDelivery: "2027-05-15",
  subtype: "Warehouse/Distribution",
  ownerOccupied: false,
  excluded: false,
  exclusionReason: null,
  staleFlag: false,
  staleReason: null,
  source: "pipeline-export.csv",
  notes: "",
  ...over,
});

const PIPELINE: PipelineProperty[] = [
  prop({ id: "Building A", sf: 212_400, expectedDelivery: "2027-02-10" }),
  prop({ id: "Building B", sf: 347_600, expectedDelivery: "2027-05-15" }),
  prop({ id: "Cascade Data Center Campus", sf: 640_000, subtype: "Data Center", expectedDelivery: "2027-08-01" }),
  prop({ id: "Building D", sf: 996_977, expectedDelivery: "2028-01-20" }),
  prop({ id: "Proposed E", sf: 1_000_000, status: "proposed", expectedDelivery: "2029-06-30" }),
];

const AS_OF = "2026-01-15";

// ---------------------------------------------------------------------------
// Trap 4 — stale entries
// ---------------------------------------------------------------------------

describe("round-number placeholder detection", () => {
  it("fires on 1,000,000 and not on 996,977", () => {
    expect(isRoundPlaceholder(1_000_000)).toBe(true);
    expect(isRoundPlaceholder(996_977)).toBe(false);
  });

  it("fires on other round approvals but leaves real dimensions alone", () => {
    expect(isRoundPlaceholder(900_000)).toBe(true);
    expect(isRoundPlaceholder(250_000)).toBe(true);
    expect(isRoundPlaceholder(212_400)).toBe(false);
    expect(isRoundPlaceholder(347_600)).toBe(false);
    // Below the threshold, round numbers are just small buildings.
    expect(isRoundPlaceholder(50_000)).toBe(false);
    expect(isRoundPlaceholder(null)).toBe(false);
  });

  it("flags a delivery date that has passed with the status unchanged", () => {
    const v = staleVerdict(
      { sf: 212_400, status: "under_construction", expectedDelivery: "2025-06-30" },
      AS_OF,
    );
    expect(v.stale).toBe(true);
    expect(v.reason).toContain("2025-06-30");
  });

  it("does not flag a building that delivered on time", () => {
    expect(
      staleVerdict({ sf: 212_400, status: "delivered", expectedDelivery: "2025-06-30" }, AS_OF).stale,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Trap 1 — category contamination
// ---------------------------------------------------------------------------

describe("exclusion rules", () => {
  it("excludes a subtype and says why", () => {
    const reason = exclusionReasonFor(PIPELINE[2], { ...EMPTY_RULES, subtypes: ["Data Center"] });
    expect(reason).toBe('subtype "Data Center"');
  });

  it("excludes by size band and by name pattern", () => {
    expect(
      exclusionReasonFor(PIPELINE[0], { ...EMPTY_RULES, minSf: 250_000 }),
    ).toContain("under 250,000 SF");
    expect(
      exclusionReasonFor(PIPELINE[2], { ...EMPTY_RULES, namePatterns: ["data center"] }),
    ).toContain("name matches");
  });

  it("changes the downstream under-construction figure", () => {
    const none = applyExclusionRules(PIPELINE, EMPTY_RULES, AS_OF);
    const excluded = applyExclusionRules(
      PIPELINE,
      { ...EMPTY_RULES, subtypes: ["Data Center"] },
      AS_OF,
    );
    // A + B + campus + D are under construction; E is proposed.
    expect(none.underConstructionSf).toBe(212_400 + 347_600 + 640_000 + 996_977);
    expect(excluded.underConstructionSf).toBe(212_400 + 347_600 + 996_977);
    expect(excluded.excludedCount).toBe(1);
    expect(excluded.includedCount).toBe(4);
  });

  it("un-excludes when the rule is removed — flags are recomputed, not patched", () => {
    const excluded = applyExclusionRules(PIPELINE, { ...EMPTY_RULES, subtypes: ["Data Center"] }, AS_OF);
    const restored = applyExclusionRules(excluded.properties, EMPTY_RULES, AS_OF);
    expect(restored.excludedCount).toBe(0);
    expect(restored.properties.every((p) => !p.excluded)).toBe(true);
  });

  it("counts the stale entries alongside the exclusions", () => {
    const applied = applyExclusionRules(PIPELINE, { ...EMPTY_RULES, subtypes: ["Data Center"] }, AS_OF);
    // Only Proposed E at 1,000,000 is a round-number placeholder. The campus at
    // 640,000 is not a multiple of 50,000, and A, B and D have real dimensions.
    expect(applied.staleCount).toBe(1);
    const summary = exclusionSummary(applied);
    expect(summary).toContain("5 properties");
    expect(summary).toContain("1 excluded");
    expect(summary).toContain("SF under construction");
    expect(summary).toContain("1 flagged for review");
  });
});

// ---------------------------------------------------------------------------
// Trap 2 — rent basis inconsistency
// ---------------------------------------------------------------------------

describe("rentTrend", () => {
  it("draws one unbroken segment when the basis holds", () => {
    const t = rentTrend(PERIODS);
    expect(t.segments).toHaveLength(1);
    expect(t.basisChanged).toBe(false);
    expect(t.basisFlag).toBeNull();
    expect(t.cagr).not.toBeNull();
  });

  it("breaks the line and flags the change when the basis moves mid-series", () => {
    const contaminated = [
      ...PERIODS.slice(0, 2),
      period({ period: "2025-09-30", askingRent: 8.1, rentBasis: "nnn_overall" }),
      period({ period: "2025-12-31", askingRent: 8.3, rentBasis: "nnn_overall" }),
    ];
    const t = rentTrend(contaminated);
    expect(t.segments).toHaveLength(2);
    expect(t.segments[0].basis).toBe("nnn_direct");
    expect(t.segments[1].basis).toBe("nnn_overall");
    expect(t.basisChanged).toBe(true);
    expect(t.basisFlag).toContain("changes rent basis");
  });

  it("computes CAGR only within one basis, never across a break", () => {
    const contaminated = [
      ...PERIODS.slice(0, 2),
      period({ period: "2025-09-30", askingRent: 8.1, rentBasis: "nnn_overall" }),
      period({ period: "2025-12-31", askingRent: 8.3, rentBasis: "nnn_overall" }),
      period({ period: "2026-03-31", askingRent: 8.5, rentBasis: "nnn_overall" }),
    ];
    const t = rentTrend(contaminated);
    expect(t.cagrBasis).toBe("nnn_overall");
    expect(t.cagrFrom).toBe("2025-09-30");
    expect(t.cagrTo).toBe("2026-03-31");
    // Not the -8.8→8.3 slide the mixed series would suggest.
    expect(t.cagr).toBeGreaterThan(0);
  });

  it("treats an unstated basis as its own segment, not a continuation", () => {
    const t = rentTrend([
      period({ period: "2025-03-31", askingRent: 9, rentBasis: "nnn_direct" }),
      period({ period: "2025-06-30", askingRent: 9.2, rentBasis: null }),
    ]);
    expect(t.segments).toHaveLength(2);
    expect(t.segments[1].basisLabel).toBe("basis not stated");
  });
});

// ---------------------------------------------------------------------------
// Absorption and months of supply
// ---------------------------------------------------------------------------

describe("monthsOfSupply", () => {
  it("divides UC SF by monthly absorption", () => {
    const s = monthsOfSupply(1_200_000, 600_000);
    expect(s.status).toBe("ok");
    if (s.status !== "ok") throw new Error("unreachable");
    expect(s.months).toBeCloseTo(1_200_000 / (600_000 / 12), 9);
  });

  it("says 'supply exceeds demand' at zero absorption rather than dividing by zero", () => {
    const s = monthsOfSupply(1_200_000, 0);
    expect(s.status).toBe("supply_exceeds_demand");
  });

  it("says the same at negative absorption rather than returning a negative month count", () => {
    const s = monthsOfSupply(1_200_000, -300_000);
    expect(s.status).toBe("supply_exceeds_demand");
    if (s.status !== "supply_exceeds_demand") throw new Error("unreachable");
    expect(s.t12Absorption).toBe(-300_000);
  });

  it("reports unknown, not zero, when a figure is missing", () => {
    expect(monthsOfSupply(null, 500_000).status).toBe("unknown");
    expect(monthsOfSupply(1_000_000, null).status).toBe("unknown");
  });
});

describe("trailing12Absorption", () => {
  it("sums the most recent four quarters and names them", () => {
    const t = trailing12Absorption(PERIODS);
    expect(t.sf).toBe(120_000 + 180_000 + 90_000 + 110_000);
    expect(t.quartersUsed).toBe(4);
    expect(t.periods).toEqual(["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"]);
  });

  it("sums what exists rather than annualizing one quarter", () => {
    const t = trailing12Absorption(PERIODS.slice(0, 1));
    expect(t.sf).toBe(120_000);
    expect(t.quartersUsed).toBe(1);
  });
});

describe("ucShareOfInventory", () => {
  it("is a share, and null rather than a divide-by-zero", () => {
    expect(ucShareOfInventory(1_000_000, 20_000_000)).toBeCloseTo(0.05, 12);
    expect(ucShareOfInventory(1_000_000, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Trap 3 — the pipeline that doesn't tie
// ---------------------------------------------------------------------------

describe("reconcilePipeline", () => {
  const applied = applyExclusionRules(PIPELINE, EMPTY_RULES, AS_OF).properties;
  const listSf = 212_400 + 347_600 + 640_000 + 996_977;

  it("ties when the grid matches the list", () => {
    const r = reconcilePipeline(listSf, applied);
    expect(r.ties).toBe(true);
    expect(r.deltaSf).toBe(0);
    expect(r.message).toContain("tie");
  });

  it("catches an injected mismatch and shows the delta", () => {
    const r = reconcilePipeline(listSf + 500_000, applied);
    expect(r.ties).toBe(false);
    expect(r.deltaSf).toBe(500_000);
    expect(r.message).toContain("500,000 SF");
    expect(r.message).toContain("double-counted or filtered inconsistently");
  });

  it("attributes a gap to the exclusion rules when they explain it", () => {
    const excluded = applyExclusionRules(
      PIPELINE,
      { ...EMPTY_RULES, subtypes: ["Data Center"] },
      AS_OF,
    ).properties;
    const r = reconcilePipeline(listSf, excluded);
    expect(r.ties).toBe(false);
    expect(r.excludedSf).toBe(640_000);
    expect(r.message).toContain("exclusion rules");
  });

  it("tolerates rounding rather than crying wolf", () => {
    expect(reconcilePipeline(listSf + 1_000, applied).ties).toBe(true);
  });

  it("says so plainly when there is no grid figure", () => {
    const r = reconcilePipeline(null, applied);
    expect(r.ties).toBe(false);
    expect(r.message).toContain("No grid figure");
  });
});

describe("deliverySchedule", () => {
  it("buckets included, undelivered buildings by quarter", () => {
    const applied = applyExclusionRules(
      PIPELINE,
      { ...EMPTY_RULES, subtypes: ["Data Center"] },
      AS_OF,
    ).properties;
    const q = deliverySchedule(applied);
    expect(q.map((x) => x.quarter)).toEqual(["2027-Q1", "2027-Q2", "2028-Q1", "2029-Q2"]);
    expect(q[0].sf).toBe(212_400);
    // The excluded campus does not appear in 2027-Q3.
    expect(q.some((x) => x.quarter === "2027-Q3")).toBe(false);
    // The 1,000,000 SF proposal carries its stale flag into its quarter.
    expect(q.find((x) => x.quarter === "2029-Q2")!.hasStale).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The payoff — assumption checks
// ---------------------------------------------------------------------------

const SUBMARKET: Submarket = {
  id: "sm",
  userId: "u",
  name: "I-95 Corridor",
  metro: "Richmond, VA",
  assetClass: "industrial",
  exclusionRules: EMPTY_RULES,
  supplyWarningMonths: 24,
  notes: null,
  createdAt: "",
};

const INPUTS = {
  rentGrowthPct: 0.04,
  vacancyPct: 0.03,
  exitCapPct: 0.055,
} as unknown as UnderwriteInputs;

describe("assumptionWarnings", () => {
  const metrics = submarketMetrics(PERIODS, applyExclusionRules(PIPELINE, EMPTY_RULES, AS_OF).properties);

  it("warns when rent growth runs ahead of the submarket's own CAGR, with the number", () => {
    const w = assumptionWarnings(INPUTS, metrics, SUBMARKET).find(
      (x) => x.code === "rent_growth_above_trend",
    )!;
    expect(w).toBeDefined();
    expect(w.message).toContain("4.0% rent growth");
    expect(w.message).toMatch(/compounded at \d+\.\d\d%/);
    expect(w.basis).toContain("NNN — direct");
  });

  it("stays quiet when the assumption sits under the trend", () => {
    const modest = { ...INPUTS, rentGrowthPct: 0.01 } as UnderwriteInputs;
    expect(
      assumptionWarnings(modest, metrics, SUBMARKET).some(
        (x) => x.code === "rent_growth_above_trend",
      ),
    ).toBe(false);
  });

  it("warns against exit cap compression above the months-of-supply threshold", () => {
    const heavy = submarketMetrics(
      PERIODS.map((p) => ({ ...p, underConstructionSf: 4_000_000 })),
      [],
    );
    const w = assumptionWarnings(INPUTS, heavy, SUBMARKET).find(
      (x) => x.code === "supply_vs_exit_cap",
    )!;
    expect(w).toBeDefined();
    expect(w.message).toContain("months of supply");
    expect(w.message).toContain("5.50% exit cap");
  });

  it("names the different problem when the market is giving space back", () => {
    const shrinking = submarketMetrics(
      PERIODS.map((p) => ({ ...p, netAbsorptionSf: -50_000 })),
      [],
    );
    const w = assumptionWarnings(INPUTS, shrinking, SUBMARKET).find(
      (x) => x.code === "supply_vs_exit_cap",
    )!;
    expect(w.title).toBe("Supply exceeds demand");
  });

  it("flags a stabilized vacancy below the submarket's own trough", () => {
    const w = assumptionWarnings(INPUTS, metrics, SUBMARKET).find(
      (x) => x.code === "vacancy_below_trough",
    )!;
    expect(w).toBeDefined();
    expect(w.message).toContain("4.8%"); // the 2025-06-30 trough
  });

  it("keeps a dismissed warning visible, with its reason, and puts it in the memo", () => {
    const dismissed = assumptionWarnings(INPUTS, metrics, SUBMARKET, [
      {
        code: "rent_growth_above_trend",
        reason: "Signed LOI at $11.00 with the anchor; trend lags the last two deals.",
        by: "analyst@example.com",
        at: "2026-01-15T00:00:00Z",
      },
    ]);
    const w = dismissed.find((x) => x.code === "rent_growth_above_trend")!;
    expect(w.dismissed).not.toBeNull();
    const memo = memoLinesFor(dismissed);
    expect(memo).toHaveLength(1);
    expect(memo[0]).toContain("overridden: Signed LOI");
  });
});

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

describe("import", () => {
  const PERIOD_CSV = `Market Statistics,,,,,,
I-95 Corridor Industrial,,,,,,
Period,Inventory SF,Vacancy,Net Absorption,Under Construction,Asking Rent,Rent Basis
2025 Q1,"20,000,000",5.2%,"120,000","1,200,000",$8.80,NNN Direct
2025 Q2,"20,000,000",4.8%,"180,000","1,200,000",$9.00,NNN Direct
2025 Q3,"20,150,000",5.5%,"90,000","1,050,000",$8.10,NNN Overall
`;

  it("skips a title block and maps market column names", () => {
    const grid = parseCsv(PERIOD_CSV);
    const mapping = suggestMarketMapping(grid, PERIOD_FIELDS);
    expect(mapping.headerRow).toBe(2);
    expect(mapping.columns.period).toBe(0);
    expect(mapping.columns.underConstructionSf).toBe(4);
    expect(mapping.columns.rentBasis).toBe(6);
  });

  it("parses quarters, percents, money and the rent basis", () => {
    const grid = parseCsv(PERIOD_CSV);
    const { rows } = toPeriods(grid, suggestMarketMapping(grid, PERIOD_FIELDS), "market-export.csv");
    expect(rows).toHaveLength(3);
    expect(rows[0].period).toBe("2025-03-31");
    expect(rows[0].vacancyPct).toBeCloseTo(0.052, 12);
    expect(rows[0].askingRent).toBe(8.8);
    expect(rows[0].rentBasis).toBe("nnn_direct");
    expect(rows[2].rentBasis).toBe("nnn_overall");
    // Every row carries where it came from.
    expect(rows.every((r) => r.source === "market-export.csv")).toBe(true);
  });

  it("reads a basis it doesn't recognise as null rather than guessing", () => {
    expect(parseRentBasis("Blended (see note)")).toBeNull();
    expect(parseRentBasis("")).toBeNull();
    expect(parseRentBasis("Triple Net Direct")).toBe("nnn_direct");
  });

  it("understands the quarter labels exports actually use", () => {
    expect(parsePeriodLabel("2026 Q1")).toBe("2026-03-31");
    expect(parsePeriodLabel("Q3 2026")).toBe("2026-09-30");
    expect(parsePeriodLabel("4Q25")).toBe("2025-12-31");
    expect(parsePeriodLabel("2026")).toBe("2026-12-31");
    expect(parsePeriodLabel("not a period")).toBeNull();
  });

  it("imports a property pipeline, dropping its totals row and flagging placeholders", () => {
    const csv = `Property Name,Address,RBA,Status,Expected Delivery,Property Type
Building A,100 Commerce Way,"212,400",Under Construction,2/10/2027,Warehouse
Cascade Data Center Campus,,"640,000",Under Construction,8/1/2027,Data Center
Proposed E,,"1,000,000",Proposed,6/30/2029,Warehouse
TOTAL,,"1,852,400",,,
`;
    const grid = parseCsv(csv);
    const { rows, skipped } = toPipeline(
      grid,
      suggestMarketMapping(grid, PIPELINE_FIELDS),
      "pipeline-export.csv",
      AS_OF,
    );
    expect(skipped).toBe(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].sf).toBe(212_400);
    expect(rows[0].staleFlag).toBe(false);
    expect(rows[2].staleFlag).toBe(true);
    expect(rows[2].staleReason).toContain("round-number placeholder");
    expect(parseStatus("Under Construction")).toBe("under_construction");
  });
});
