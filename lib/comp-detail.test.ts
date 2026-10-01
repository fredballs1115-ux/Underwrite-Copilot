import { describe, expect, it } from "vitest";
import { basisScale, compFigures, fmtBasis, subjectBasis } from "./comp-detail";
import { SAMPLE_DEAL } from "./sample-deal";

const none = { perUnit: null, perSf: null, capPct: null };

describe("compFigures — reads a comp's stated basis and cap, nothing more", () => {
  it("reads a per-unit basis in its usual shapes", () => {
    expect(compFigures("$252k/unit · 5.6% cap · Q3'25")).toEqual({ perUnit: 252_000, perSf: null, capPct: 5.6 });
    expect(compFigures("$252,000 / unit").perUnit).toBe(252_000);
    expect(compFigures("$252,000 per unit").perUnit).toBe(252_000);
    expect(compFigures("$298K per door, 4.9% cap").perUnit).toBe(298_000);
    expect(compFigures("$185k/key · 2024").perUnit).toBe(185_000);
    expect(compFigures("$2.1M/unit").perUnit).toBe(2_100_000);
    expect(compFigures("Sold at $61.5M ($248k/unit)").perUnit).toBe(248_000);
  });

  it("reads a per-SF basis in its usual shapes", () => {
    expect(compFigures("$410/SF · 6.1% cap").perSf).toBe(410);
    expect(compFigures("$410 per sq. ft.").perSf).toBe(410);
    expect(compFigures("$410 psf").perSf).toBe(410);
    expect(compFigures("$1,250/sf (2025)").perSf).toBe(1_250);
  });

  it("reads a cap rate only when the word cap sits beside the percentage", () => {
    expect(compFigures("5.6% cap").capPct).toBe(5.6);
    expect(compFigures("5.60% going-in cap").capPct).toBe(5.6);
    expect(compFigures("cap rate 5.6%").capPct).toBe(5.6);
    expect(compFigures("Cap: 6%").capPct).toBe(6);
    // A growth rate, an occupancy, a vacancy — percentages that are not caps.
    expect(compFigures("3.0% rent growth · 94% occupied").capPct).toBeNull();
    // A percentage wearing the word but not a cap rate a building trades at.
    expect(compFigures("25% cap").capPct).toBeNull();
  });

  it("reads nothing from a rent, a bare price or an empty line", () => {
    expect(compFigures("$2,520/mo · 2BR")).toEqual(none);
    expect(compFigures("$61,500,000 · 2025")).toEqual(none);
    expect(compFigures("Renovated 2019, 240 units")).toEqual(none);
    expect(compFigures("")).toEqual(none);
    expect(compFigures(null)).toEqual(none);
    expect(compFigures(undefined)).toEqual(none);
    // A "unit" price below $5,000 is a rent or a fee, never a basis.
    expect(compFigures("$5/unit/mo").perUnit).toBeNull();
    expect(compFigures("$3,500 a unit").perUnit).toBeNull();
  });

  it("reads a figure its own clause calls a rent as no basis, whatever its period (the audit, 2026-10-01)", () => {
    expect(compFigures("Avg rent $2,100 a unit").perUnit).toBeNull();
    expect(compFigures("Asking rents $28/SF").perSf).toBeNull();
    expect(compFigures("ADR $185/key").perUnit).toBeNull();
    // A rent in its own clause leaves the price beside it alone.
    expect(compFigures("Rents $2,100/mo · $248k/unit").perUnit).toBe(248_000);
  });

  it("reads one cap where a year, a count or a T-12 sits before it", () => {
    for (const [line, cap] of [
      ["T-12 cap 5.2%", 5.2],
      ["Year 1 cap rate 5.4%", 5.4],
      ["Sold 2024 — 5.6% cap", 5.6],
      ["Built 1985 - 5.5% cap", 5.5],
      ["Units: 48 – 5.6% cap", 5.6],
      ["at a 5.4% cap", 5.4],
    ] as const) {
      expect(compFigures(line).capPct, line).toBe(cap);
    }
  });
});

describe("compFigures — every shape a comp's detail line comes in (WILL_TODO's reader item, 2026-10-01)", () => {
  it("reads a per-unit basis however the line words it, in each class's own word", () => {
    for (const [line, perUnit] of [
      ["$252,000 a unit", 252_000],
      ["$252k/apartment", 252_000],
      ["$60k/space", 60_000],
      ["$35,000 per key", 35_000],
      ["$95,000/home", 95_000],
      ["Price/Unit: $252,000", 252_000],
      ["$/door $252K", 252_000],
      ["PPU $252K", 252_000],
    ] as const) {
      expect(compFigures(line).perUnit, line).toBe(perUnit);
    }
  });

  it("reads a per-SF basis on rentable, net or gross feet, or a foot alone", () => {
    for (const line of ["$410/RSF", "$410/NRSF", "$410 per GSF", "$410 per foot", "$410 a foot", "Price/SF: $410", "$/SF $410", "PSF $410"]) {
      expect(compFigures(line).perSf, line).toBe(410);
    }
  });

  it("reads a cap without its percent sign, and with words between", () => {
    expect(compFigures("sold at a 5.4 cap").capPct).toBe(5.4);
    expect(compFigures("a 5 cap").capPct).toBe(5);
    expect(compFigures("cap rate was 5.4%").capPct).toBe(5.4);
    expect(compFigures("cap rate of approximately 5.4%").capPct).toBe(5.4);
  });

  it("reads no cap from a range, a year, capex or a bare percentage", () => {
    for (const line of ["5.25%-5.75% cap", "5.25 to 5.75% cap", "cap rate 5.25%-5.75%", "2023 cap ex", "$1.2M of cap-ex", "5.4% on in-place NOI"]) {
      expect(compFigures(line).capPct, line).toBeNull();
    }
  });

  it("reads a rent per month or per year as no basis at all", () => {
    for (const line of ["$1,200 per unit per month", "$1,450/unit/mo", "$2,100 a unit monthly", "$25/SF/yr", "$32.50 per SF per year", "$28 psf annually"]) {
      const f = compFigures(line);
      expect([f.perUnit, f.perSf], line).toEqual([null, null]);
    }
  });
});

describe("subjectBasis — the deal's own basis from the shared readers", () => {
  it("divides the sample's asking price by its unit count", () => {
    const b = subjectBasis(SAMPLE_DEAL.extraction.metrics, "stabilized");
    expect(b.perUnit).toBe(Math.round(68_000_000 / 248));
    // The sample states no building size, so no per-SF basis is invented.
    expect(b.perSf).toBeNull();
  });

  it("gives a conversion or a development no price basis — they are judged on all-in cost", () => {
    expect(subjectBasis(SAMPLE_DEAL.extraction.metrics, "conversion")).toEqual({ perUnit: null, perSf: null });
    expect(subjectBasis(SAMPLE_DEAL.extraction.metrics, "development")).toEqual({ perUnit: null, perSf: null });
  });

  it("gives nothing when the OM states no price", () => {
    expect(subjectBasis([{ label: "Units", value: "248" }], "stabilized")).toEqual({ perUnit: null, perSf: null });
  });

  it("gives an outdoor-storage yard no per-SF basis: it trades by the acre, not by its shop building", () => {
    const yard = [
      { label: "Asking price", value: "$12,000,000" },
      { label: "Building SF", value: "4,000" },
      { label: "Usable acres", value: "8.5" },
    ];
    // $12M over a 4,000 SF shop read $3,000/SF, and the comps drew it as a tick.
    expect(subjectBasis(yard, "stabilized", undefined, "Industrial Outdoor Storage (IOS)")).toEqual({ perUnit: null, perSf: null });
    expect(subjectBasis(yard, "stabilized", undefined, "Truck terminal").perSf).toBeNull();
    // A warehouse on the same figures is priced by its feet, as before.
    expect(subjectBasis(yard, "stabilized", undefined, "Industrial").perSf).toBe(3_000);
    expect(subjectBasis(yard, "stabilized").perSf).toBe(3_000);
  });
});

describe("basisScale — every comp and the subject on one track", () => {
  it("scales the sample's three sale comps and the subject to the largest basis", () => {
    const subject = subjectBasis(SAMPLE_DEAL.extraction.metrics, "stabilized");
    const scale = basisScale(SAMPLE_DEAL.comps.saleComps, subject)!;
    expect(scale.unit).toBe("unit");
    expect(scale.max).toBe(298_000);
    expect(scale.shares.map((s) => Math.round((s ?? 0) * 100))).toEqual([85, 100, 88]);
    expect(Math.round((scale.subjectShare ?? 0) * 100)).toBe(92);
    expect(scale.subjectValue).toBe(274_194);
  });

  it("a comp that states no basis keeps its place with no bar", () => {
    const scale = basisScale([{ detail: "$300k/unit" }, { detail: "Renovated 2019" }], null)!;
    expect(scale.shares).toEqual([1, null]);
    expect(scale.subjectShare).toBeNull();
  });

  it("falls to per SF when no comp states a per-unit figure, and to nothing when none states a basis", () => {
    const sf = basisScale([{ detail: "$410/SF" }, { detail: "$350 psf" }], { perUnit: 250_000, perSf: 380 })!;
    expect(sf.unit).toBe("sf");
    expect(sf.max).toBe(410);
    expect(Math.round((sf.subjectShare ?? 0) * 100)).toBe(93);
    expect(basisScale(SAMPLE_DEAL.comps.leaseComps, null)).toBeNull();
    expect(basisScale([], null)).toBeNull();
  });
});

describe("fmtBasis", () => {
  it("names the yardstick", () => {
    expect(fmtBasis(274_194, "unit")).toBe("$274k/unit");
    expect(fmtBasis(2_100_000, "unit")).toBe("$2.1M/unit");
    expect(fmtBasis(410, "sf")).toBe("$410/SF");
  });
});
