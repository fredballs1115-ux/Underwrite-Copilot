import { describe, expect, it } from "vitest";
import { readMix, totalMix } from "@/lib/tools/unit-mix";

// The table every multifamily memorandum prints.
const OM_TABLE = `Studio\t24\t520\t1,395\t1,525
1 Bed / 1 Bath\t60\t715\t1,650\t1,795
2 Bed / 2 Bath\t48\t1,040\t2,150\t2,340
3 Bed / 2 Bath\t12\t1,320\t2,650\t2,795`;

describe("readMix — the shapes an OM prints", () => {
  it("reads a tab-separated table off a memorandum", () => {
    const { rows, skipped } = readMix(OM_TABLE);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toEqual({
      label: "1 Bed / 1 Bath",
      units: 60,
      sf: 715,
      inPlace: 1650,
      market: 1795,
    });
  });

  it("keeps a label with single spaces and slashes intact", () => {
    // "2 Bed / 2 Bath" must not split on its spaces — a single space is not
    // a separator, which is the whole reason the rule is two-or-more.
    expect(readMix(OM_TABLE).rows[2].label).toBe("2 Bed / 2 Bath");
  });

  it("reads columns separated by runs of spaces", () => {
    const { rows } = readMix("2 Bed / 2 Bath    48    1040    2150    2340");
    expect(rows[0].label).toBe("2 Bed / 2 Bath");
    expect(rows[0].units).toBe(48);
    expect(rows[0].market).toBe(2340);
  });

  it("reads pipes and commas too", () => {
    expect(readMix("Studio | 24 | 520 | 1395 | 1525").rows[0].units).toBe(24);
    expect(readMix("Studio, 24, 520, 1395, 1525").rows[0].market).toBe(1525);
  });

  it("reads the shorthand the rest of /tools reads", () => {
    const { rows } = readMix("Studio\t24\t520\t$1,395\t$1.525k");
    expect(rows[0].inPlace).toBe(1395);
    expect(rows[0].market).toBe(1525);
  });

  it("three numbers close together are count, rent, market", () => {
    // $1,795 against $1,650 is a market rent — that closeness is what makes
    // it comparable. Reading it as square footage would silently zero the
    // loss to lease, which is the figure the table exists for.
    const { rows } = readMix("1 Bed\t60\t1,650\t1,795");
    expect(rows[0]).toEqual({ label: "1 Bed", units: 60, sf: null, inPlace: 1650, market: 1795 });
  });

  it("three numbers far apart are count, SF, rent", () => {
    // 520 against $1,395 is not a pair of rents.
    const { rows } = readMix("Studio\t24\t520\t1,395");
    expect(rows[0]).toEqual({ label: "Studio", units: 24, sf: 520, inPlace: 1395, market: null });
  });

  it("decides the column for the WHOLE table, not row by row", () => {
    // A column is a property of the table. Three of these four rows are
    // plainly SF-and-rent; the odd one (900 against $1,200) would read as
    // rents on its own, and must not, because its neighbours outvote it.
    const { rows } = readMix(
      `Studio\t24\t520\t1,395\n1 Bed\t60\t715\t1,650\n2 Bed\t48\t900\t1,200\n3 Bed\t12\t1,320\t2,650`,
    );
    expect(rows.map((r) => r.sf)).toEqual([520, 715, 900, 1320]);
    expect(rows.every((r) => r.market === null)).toBe(true);
  });

  it("a four-number row does not vote on the three-number ones", () => {
    // The rows that carry every column are unambiguous already, so they are
    // ignored when deciding what a short row means.
    const { rows } = readMix(`A\t10\t700\t1,000\t1,100\nB\t20\t1,800\t1,900`);
    expect(rows[0].sf).toBe(700);
    expect(rows[1]).toEqual({ label: "B", units: 20, sf: null, inPlace: 1800, market: 1900 });
  });

  it("two numbers are count and rent, with no market claimed", () => {
    expect(readMix("1 Bed\t60\t1,650").rows[0]).toEqual({
      label: "1 Bed",
      units: 60,
      sf: null,
      inPlace: 1650,
      market: null,
    });
  });

  it("takes a row that opens with its count", () => {
    const { rows } = readMix("24\t520\t1,395\t1,525");
    expect(rows[0].units).toBe(24);
    expect(rows[0].label).toBe("24 units");
  });

  it("sets aside a line it cannot read, verbatim", () => {
    const { rows, skipped } = readMix(`Unit Mix\n${OM_TABLE}\nTotal: 144 units`);
    expect(rows).toHaveLength(4);
    expect(skipped).toContain("Unit Mix");
  });

  it("refuses a row with no unit count", () => {
    expect(readMix("Studio\t0\t520\t1,395").rows).toHaveLength(0);
  });
});

describe("totalMix — weighted by units, never by row", () => {
  const t = totalMix(readMix(OM_TABLE).rows);

  it("counts every unit", () => {
    expect(t.units).toBe(144);
    expect(t.sfUnits).toBe(144);
  });

  it("weights the average rent by unit count", () => {
    // (24×1395 + 60×1650 + 48×2150 + 12×2650) ÷ 144 = $267,480 ÷ 144 = $1,858
    // The average of the four ROW rents is $1,961 — the wrong number, and
    // the one you get by averaging what you can see.
    expect(t.avgInPlace).toBe(1858);
    const rowAverage = Math.round((1395 + 1650 + 2150 + 2650) / 4);
    expect(t.avgInPlace).not.toBe(rowAverage);
  });

  it("weights average SF by unit count too", () => {
    // (24×520 + 60×715 + 48×1040 + 12×1320) = 121,140 SF ÷ 144 = 841
    expect(t.avgSf).toBe(841);
    expect(t.sf).toBe(121_140);
  });

  it("gross potential rent is the monthly roll times twelve", () => {
    const monthly = 24 * 1395 + 60 * 1650 + 48 * 2150 + 12 * 2650;
    expect(t.gprInPlace).toBe(monthly * 12);
    const monthlyMarket = 24 * 1525 + 60 * 1795 + 48 * 2340 + 12 * 2795;
    expect(t.gprMarket).toBe(monthlyMarket * 12);
  });

  it("measures loss to lease against market, annually", () => {
    expect(t.gprMarket! - t.gprInPlace!).toBe(t.lossToLease);
    expect(t.lossToLease).toBeGreaterThan(0);
    expect(t.lossToLeasePct).toBeGreaterThan(7);
    expect(t.lossToLeasePct).toBeLessThan(9);
    expect(t.ltlUnits).toBe(144);
  });

  it("reports rent per foot both ways", () => {
    // $267,480 a month × 12 ÷ 121,140 SF = $26.50
    expect(t.inPlacePerSf).toBeCloseTo(26.5, 1);
    expect(t.marketPerSf!).toBeGreaterThan(t.inPlacePerSf!);
  });

  it("says nothing is missing when nothing is", () => {
    expect(t.note).toBeNull();
  });
});

describe("totalMix — a half-filled table is the normal case", () => {
  it("covers loss to lease only where a market rent is stated, and says so", () => {
    // The renovated types quote a market rent; the classics do not. A
    // loss-to-lease figure for 60 of 144 units must never read as the
    // building's.
    const rows = readMix(
      `Studio\t24\t520\t1,395\n1 Bed Renovated\t60\t715\t1,650\t1,795\n2 Bed\t48\t1,040\t2,150\n3 Bed\t12\t1,320\t2,650`,
    ).rows;
    const t = totalMix(rows);
    expect(t.units).toBe(144);
    expect(t.ltlUnits).toBe(60);
    expect(t.lossToLease).toBe((1795 - 1650) * 60 * 12);
    expect(t.note).toMatch(/covers 60 of 144 units/);
  });

  it("holds both sides of the subtraction to the same units", () => {
    // A row with a market rent but no in-place must not inflate the gap.
    const rows = readMix(`A\t10\t1,000\t1,200\nB\t10\t0\t2,000`).rows;
    const t = totalMix(rows);
    expect(t.ltlUnits).toBe(10);
    expect(t.lossToLease).toBe(200 * 10 * 12);
  });

  it("says there is no loss to lease when no market rent is stated", () => {
    const t = totalMix(readMix("Studio\t24\t520\t1,395").rows);
    expect(t.lossToLease).toBeNull();
    expect(t.lossToLeasePct).toBeNull();
    expect(t.note).toMatch(/No market rents stated/);
  });

  it("names a partial square-footage column", () => {
    const t = totalMix(readMix(`A\t10\t700\t1,000\t1,100\nB\t10\t1,200\t1,300`).rows);
    expect(t.sfUnits).toBe(10);
    expect(t.avgSf).toBe(700);
    expect(t.note).toMatch(/square footage covers 10 of 20/);
  });

  it("says there is no rent per foot when no SF is stated", () => {
    const t = totalMix(readMix("Studio\t24\t1,395\t1,525").rows);
    expect(t.inPlacePerSf).toBeNull();
    expect(t.note).toMatch(/no square footage stated/);
  });

  it("asks for the table rather than answering with zeroes", () => {
    const t = totalMix([]);
    expect(t.note).toMatch(/Paste the unit mix/);
    expect(t.gprInPlace).toBeNull();
    expect(t.units).toBe(0);
  });
});

describe("totalMix — the direction of the gap", () => {
  it("an over-rented building reads a negative loss to lease", () => {
    // In-place above market is real — a building that over-renovated, or a
    // market that moved. It is a gain to lease, and the figure must carry
    // its sign rather than clamp to zero.
    const t = totalMix(readMix("A\t10\t700\t2,000\t1,800").rows);
    expect(t.lossToLease).toBe(-200 * 10 * 12);
    expect(t.lossToLeasePct!).toBeLessThan(0);
  });
});
