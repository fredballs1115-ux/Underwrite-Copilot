// The deal's actuals read one way for the card, the report's page and the
// memo's line (research pass 24, B3).
import { describe, expect, it } from "vitest";
import type { RentRollSummary, T12Summary } from "./types";
import { actualsFromRows, actualsShortLine, readActuals, rentRollDateWords, t12DateWords } from "./actuals-read";

const ROLL: RentRollSummary = {
  unitCount: 120,
  occupiedUnits: 113,
  totalSf: 100_000,
  occupiedSf: 94_200,
  sfWeightedOccupancy: 0.942,
  waltYears: 3.14,
  weightedAvgRentPsf: 24.5,
  avgRentMonthly: 1850,
  rentUnits: 113,
  expiryBuckets: null,
  expiryCoveredSf: 0,
  truncated: false,
  asOfUsed: "2026-09-02",
};
const T12: T12Summary = {
  collectedRent: 3_000_000,
  vacancyLoss: 150_000,
  otherIncome: 60_000,
  egi: 2_910_000,
  opex: [],
  totalOpex: 1_000_000,
  noi: 2_400_000,
  noiDerived: false,
};
const OM = [{ label: "NOI (pro forma)", value: "$2,616,000" }];

describe("readActuals", () => {
  it("holds the OM's NOI against the T-12, graded, and dates each document", () => {
    const read = readActuals({
      metrics: OM,
      strategy: { kind: "stabilized", label: "Stabilized" },
      rentRoll: { asOf: "2026-06-01", summary: ROLL },
      t12: { periodEnd: "2026-05-31", summary: T12 },
      assetClass: "multifamily",
    })!;
    expect(read.noiComparison).toMatchObject({ omNoi: 2_616_000, t12Noi: 2_400_000, severity: "material", direction: "above", omBasis: "stabilized" });
    expect(t12DateWords(read.t12)).toBe("TTM to May 31, 2026");
    expect(rentRollDateWords(read.rentRoll)).toBe("as of Jun 1, 2026");
    expect(actualsShortLine(read)).toBe(
      // An apartment roll's leases run a year or less: no WALT, by the
      // rent-roll page's rule (actualsWalt), as the card and the report say.
      "T-12 NOI $2.40M (TTM to May 31, 2026): OM pro forma NOI 9.0% over, material. Rent roll (as of Jun 1, 2026): 94.2% occupied.",
    );
    const office = readActuals({
      metrics: OM,
      strategy: { kind: "stabilized", label: "Stabilized" },
      rentRoll: { asOf: "2026-06-01", summary: ROLL },
      t12: null,
      assetClass: "office",
    })!;
    expect(actualsShortLine(office)).toContain("WALT 3.1 yrs");
  });

  it("says an undated document as undated, never silently", () => {
    const read = readActuals({
      metrics: [],
      strategy: { kind: "stabilized", label: "Stabilized" },
      rentRoll: { asOf: null, summary: ROLL },
      t12: { periodEnd: null, summary: T12 },
    })!;
    expect(read.noiComparison).toBeNull();
    expect(actualsShortLine(read)).toBe(
      "T-12 NOI $2.40M (period not stated). Rent roll (undated): 94.2% occupied, WALT 3.1 yrs.",
    );
  });

  // Audit C8, L3: the line had written "(derived) (period not stated)", and
  // called a comparison of no stated basis the "OM pro forma NOI", where the
  // report says "OM NOI".
  it("puts a derived NOI and its date in one bracket, and names an OM figure of no stated basis as the report does", () => {
    const derived = readActuals({
      metrics: [],
      strategy: { kind: "stabilized", label: "Stabilized" },
      rentRoll: null,
      t12: { periodEnd: null, summary: { ...T12, noiDerived: true } },
    })!;
    expect(actualsShortLine(derived)).toBe("T-12 NOI $2.40M (derived; period not stated).");
    const dated = { ...derived, t12: { periodEnd: "2026-05-31", summary: { ...T12, noiDerived: true } } };
    expect(actualsShortLine(dated)).toBe("T-12 NOI $2.40M (derived; TTM to May 31, 2026).");
    const noBasis = {
      ...dated,
      noiComparison: { omNoi: 2_616_000, t12Noi: 2_400_000, deltaPct: 0.09, direction: "above" as const, severity: "material" as const },
    } as unknown as Parameters<typeof actualsShortLine>[0];
    expect(actualsShortLine(noBasis)).toBe("T-12 NOI $2.40M (derived; TTM to May 31, 2026): OM NOI 9.0% over, material.");
  });

  it("on a plan deal holds the T-12 against the in-place figure, never the finished project's, and says so", () => {
    const read = readActuals({
      metrics: [{ label: "NOI (stabilized, pro forma)", value: "$4,000,000" }],
      strategy: { kind: "value_add", label: "Value-add" },
      rentRoll: null,
      t12: { periodEnd: "2026-05-31", summary: T12 },
    })!;
    expect(read.noiComparison).toBeNull();
    expect(read.noiNote).toContain("the OM states only the finished project's NOI");
  });

  it("compares nothing against an actual NOI of nothing, and is null with neither document", () => {
    const read = readActuals({
      metrics: OM,
      strategy: { kind: "stabilized", label: "Stabilized" },
      rentRoll: null,
      t12: { periodEnd: "2026-05-31", summary: { ...T12, noi: 0 } },
    })!;
    expect(read.noiComparison).toBeNull();
    expect(actualsFromRows({ metrics: OM }, { kind: "stabilized", label: "Stabilized" }, null, null, { summary: null })).toBeNull();
    expect(actualsShortLine(null)).toBe("");
  });
});
