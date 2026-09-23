import { describe, expect, it } from "vitest";
import { briefDelta, figureValue, moveSentence } from "./brief-delta";
import type { LiveFigure } from "./live-market-brief";

const stored: LiveFigure[] = [
  { key: "unemployment", label: "Unemployment", value: 3.4, unit: "pts", asOf: "2026-07-01" },
  { key: "rental_vacancy_msa", label: "Rental vacancy, metro area", value: 6.2, unit: "pts", asOf: "2026-04-01" },
  { key: "permits_ttm", label: "Units permitted, trailing year", value: 12_000, unit: "count", asOf: "2026-08-01" },
  { key: "zori_rent", label: "Asking rent, all home types", value: 2_310, unit: "usd", asOf: "2026-08-31" },
  { key: "rdc_days_on_market", label: "Median days on market", value: 41, unit: "days", asOf: "2026-08-01" },
  { key: "rdc_hotness_rank", label: "Hotness rank", value: 40, unit: "rank", asOf: "2026-08-01" },
  { key: "zhvi", label: "Typical home value", value: 560_000, unit: "usd", asOf: "2026-08-31" },
];

const today: LiveFigure[] = [
  // A newer month, moved.
  { key: "unemployment", label: "Unemployment", value: 3.8, unit: "pts", asOf: "2026-08-01" },
  // The same quarter: the survey has not published since.
  { key: "rental_vacancy_msa", label: "Rental vacancy, metro area", value: 6.2, unit: "pts", asOf: "2026-04-01" },
  // A newer year, moved.
  { key: "permits_ttm", label: "Units permitted, trailing year", value: 11_400, unit: "count", asOf: "2026-09-01" },
  // A newer month, moved.
  { key: "zori_rent", label: "Asking rent, all home types", value: 2_335, unit: "usd", asOf: "2026-09-30" },
  // A newer month, unchanged to the day.
  { key: "rdc_days_on_market", label: "Median days on market", value: 41, unit: "days", asOf: "2026-09-01" },
  // Hotter: a smaller rank.
  { key: "rdc_hotness_rank", label: "Hotness rank", value: 28, unit: "rank", asOf: "2026-09-01" },
  // zhvi is missing today — a pull that failed — and is left out.
];

describe("briefDelta — what moved since the screen, in each figure's own unit", () => {
  const d = briefDelta("2026-09-02", stored, today)!;
  const by = Object.fromEntries(d.moves.map((m) => [m.key, m]));

  it("keeps the day of the screen and counts what is newer and what moved", () => {
    expect(d.since).toBe("2026-09-02");
    expect(d.moves.map((m) => m.key)).toEqual([
      "unemployment",
      "rental_vacancy_msa",
      "permits_ttm",
      "zori_rent",
      "rdc_days_on_market",
      "rdc_hotness_rank",
    ]);
    expect(d.newer).toBe(5);
    expect(d.moved).toBe(4);
  });

  it("a share moves in points, a dollar figure and a count in percent, days in days, a rank in places", () => {
    expect(by.unemployment).toMatchObject({ move: 0.4, moveUnit: "pts", kind: "moved" });
    expect(by.zori_rent).toMatchObject({ move: 1.1, moveUnit: "pct", kind: "moved" });
    expect(by.permits_ttm).toMatchObject({ move: -5, moveUnit: "pct", kind: "moved" });
    expect(by.rdc_days_on_market).toMatchObject({ move: 0, moveUnit: "days", kind: "unchanged" });
    expect(by.rdc_hotness_rank).toMatchObject({ move: 12, moveUnit: "places", kind: "moved" });
  });

  it("no newer observation is said as such, never as unchanged", () => {
    expect(by.rental_vacancy_msa.kind).toBe("no_newer");
    expect(moveSentence(by.rental_vacancy_msa)).toBe("Rental vacancy, metro area: no newer figure than the one the check read");
    expect(moveSentence(by.rdc_days_on_market)).toBe("Median days on market: unchanged at 41 days");
  });

  it("each move is one sentence in the figure's own unit, a smaller rank said as hotter", () => {
    expect(moveSentence(by.unemployment)).toBe("Unemployment: +0.4 pt to 3.8%");
    expect(moveSentence(by.zori_rent)).toBe("Asking rent, all home types: +1.1% to $2,335");
    expect(moveSentence(by.permits_ttm)).toBe("Units permitted, trailing year: −5.0% to 11,400");
    expect(moveSentence(by.rdc_hotness_rank)).toBe("Hotness rank: 12 places hotter, now #28");
    expect(moveSentence({ ...by.rdc_hotness_rank, move: -3, to: 43 })).toBe("Hotness rank: 3 places cooler, now #43");
  });

  it("a figure that cannot be read today is left out rather than shown as a move to nothing", () => {
    expect(by.zhvi).toBeUndefined();
  });

  it("nothing stored, or nothing readable today, is null", () => {
    expect(briefDelta("2026-09-02", undefined, today)).toBeNull();
    expect(briefDelta("2026-09-02", [], today)).toBeNull();
    expect(briefDelta("2026-09-02", stored, [])).toBeNull();
  });

  it("a hair under the floor is unchanged, a hair over is a move", () => {
    const s: LiveFigure[] = [{ key: "unemployment", label: "Unemployment", value: 3.4, unit: "pts", asOf: "2026-07-01" }];
    const under = briefDelta("d", s, [{ ...s[0], value: 3.42, asOf: "2026-08-01" }])!;
    const over = briefDelta("d", s, [{ ...s[0], value: 3.5, asOf: "2026-08-01" }])!;
    expect(under.moves[0].kind).toBe("unchanged");
    expect(over.moves[0].kind).toBe("moved");
  });
});

describe("figureValue", () => {
  it("prints each unit as the page does", () => {
    expect(figureValue("pts", 6.25)).toBe("6.3%");
    expect(figureValue("usd", 2335.4)).toBe("$2,335");
    expect(figureValue("count", 11_400)).toBe("11,400");
    expect(figureValue("days", 41)).toBe("41 days");
    expect(figureValue("rank", 28)).toBe("#28");
    expect(figureValue("years", 20.25)).toBe("20.3 years");
  });
});
