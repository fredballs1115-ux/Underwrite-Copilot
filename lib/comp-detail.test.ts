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
    // A "unit" price below $1,000 is a rent or a fee, never a basis.
    expect(compFigures("$5/unit/mo").perUnit).toBeNull();
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
