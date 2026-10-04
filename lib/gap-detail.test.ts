import { describe, expect, it } from "vitest";
import {
  gapDisagreement,
  gapDisagreementLine,
  gapFigure,
  gapScale,
  gapShare,
  incomeGapShare,
  rowGap,
  valueFigure,
  valueGap,
} from "./gap-detail";
import { SAMPLE_DEAL } from "./sample-deal";

describe("gapFigure — the magnitude a reconciliation gap states", () => {
  it("reads dollars in their usual shapes", () => {
    expect(gapFigure("$174k below the OM — heavier expense load")).toEqual({ value: 174_000, unit: "usd" });
    expect(gapFigure("−$120,000 vs the OM")).toEqual({ value: 120_000, unit: "usd" });
    expect(gapFigure("+$1.2M")).toEqual({ value: 1_200_000, unit: "usd" });
    expect(gapFigure("$45 per SF lighter")).toEqual({ value: 45, unit: "usd" });
  });

  it("reads the long-hand and the Wall Street suffixes, and never a word that merely starts with one", () => {
    expect(gapFigure("$1.2 million lighter")).toEqual({ value: 1_200_000, unit: "usd" });
    expect(gapFigure("$450 thousand below the OM")).toEqual({ value: 450_000, unit: "usd" });
    expect(gapFigure("$5MM over the OM's budget")).toEqual({ value: 5_000_000, unit: "usd" });
    expect(gapFigure("$2bn")).toEqual({ value: 2_000_000_000, unit: "usd" });
    expect(gapFigure("$3 Bn")).toEqual({ value: 3_000_000_000, unit: "usd" });
    // "m" is a suffix only when the word ends there.
    expect(gapFigure("$174 mortgage constant higher")).toEqual({ value: 174, unit: "usd" });
    expect(gapFigure("$40 below, monthly")).toEqual({ value: 40, unit: "usd" });
  });

  it("reads basis points and percentages", () => {
    expect(gapFigure("300 bps higher, in line with in-place")).toEqual({ value: 300, unit: "bps" });
    expect(gapFigure("25 basis points tighter")).toEqual({ value: 25, unit: "bps" });
    expect(gapFigure("+4.2%")).toEqual({ value: 4.2, unit: "pct" });
    expect(gapFigure("about 3 percentage points below")).toEqual({ value: 3, unit: "pct" });
    expect(gapFigure("2 pp higher")).toEqual({ value: 2, unit: "pct" });
    expect(gapFigure("4 per cent wider")).toEqual({ value: 4, unit: "pct" });
    // "pp" and "pts" are units only as whole words.
    expect(gapFigure("5 ppm")).toBeNull();
  });

  it("prefers the dollar figure when a line carries more than one yardstick", () => {
    expect(gapFigure("$174k (4.5%) below the OM")).toEqual({ value: 174_000, unit: "usd" });
  });

  it("reads nothing from agreement, a figureless note or an empty line", () => {
    expect(gapFigure("In agreement")).toBeNull();
    expect(gapFigure("Not modelled — the OM states no figure")).toBeNull();
    expect(gapFigure("")).toBeNull();
    expect(gapFigure(null)).toBeNull();
    expect(gapFigure(undefined)).toBeNull();
    // A year or a page is not a gap.
    expect(gapFigure("see p. 12")).toBeNull();
  });
});

describe("gapShare — a gap as a share of the model's own figure, the actuals card's footing", () => {
  it("reads the sample's rows: the NOI gap a share of the model's NOI, the vacancy gap of its rate, agreement nothing", () => {
    const [noi, vacancy, cap] = SAMPLE_DEAL.reconciliation.rows.map((r) => gapShare(r));
    // The two figures' own gap, $3,880,000 less $3,706,500 = $173,500 (the
    // line rounds it to "$174k"), over the model's NOI: the card's 4.7%.
    expect(noi).toBeCloseTo(173_500 / 3_706_500, 10);
    // 300 bps over the model's 9.0%.
    expect(vacancy).toBeCloseTo(3 / 9, 10);
    // 5.45% beside 5.45%: the figures' own gap is nothing.
    expect(cap).toBe(0);
  });

  it("puts points and a share of a dollar figure on the same footing, and refuses what the words do not settle", () => {
    expect(gapShare({ gap: "3 pts higher", myValue: "9.0%" })).toBeCloseTo(3 / 9, 10);
    expect(gapShare({ gap: "2 percentage points below", myValue: "8%" })).toBeCloseTo(0.25, 10);
    expect(gapShare({ gap: "+4.2% below the OM", myValue: "$3,706,500" })).toBeCloseTo(0.042, 10);
    // A bare percent beside a rate: a share of it, or points of it?
    expect(gapShare({ gap: "+4.2%", myValue: "9.0%" })).toBeNull();
    // Units that are not one footing.
    expect(gapShare({ gap: "$174k below", myValue: "9.0%" })).toBeNull();
    expect(gapShare({ gap: "300 bps higher", myValue: "$3,706,500" })).toBeNull();
    // A model figure unstated, or nothing in the gap line.
    expect(gapShare({ gap: "$174k below", myValue: "Not modelled" })).toBeNull();
    expect(gapShare({ gap: "$174k below", myValue: null })).toBeNull();
    expect(gapShare({ gap: "In agreement", myValue: "5.45%" })).toBeNull();
  });
});

describe("the gap is the two figures' own subtraction, not the reconciler's arithmetic (research pass 18)", () => {
  it("subtracts two dollar figures and two rates, and reads the line only where the figures make no gap", () => {
    const [noi, vacancy, cap] = SAMPLE_DEAL.reconciliation.rows;
    expect(valueGap(noi)).toEqual({ value: 173_500, unit: "usd" });
    expect(valueGap(vacancy)).toEqual({ value: 300, unit: "bps" });
    expect(valueGap(cap)).toEqual({ value: 0, unit: "bps" });
    // A range, a figure unstated or two footings make no gap of their own.
    expect(valueGap({ omValue: "5.25%–5.75%", myValue: "6.0%" })).toBeNull();
    // A range the typical-range reader draws no track for is still a range,
    // never its first figure.
    expect(valueGap({ omValue: "$950–$1.2M", myValue: "$1,000,000" })).toBeNull();
    expect(valueGap({ omValue: "$3,880,000", myValue: "Not modelled" })).toBeNull();
    expect(valueGap({ omValue: "$2,400/mo", myValue: "$28,800/yr" })).toBeNull();
    expect(rowGap({ omValue: "$3,880,000", myValue: "Not modelled", gap: "$174k below" })).toEqual({ value: 174_000, unit: "usd" });
  });

  it("says where the line and the figures disagree beyond its rounding, and is silent where they agree", () => {
    for (const row of SAMPLE_DEAL.reconciliation.rows) expect(gapDisagreement(row)).toBeNull();
    const wrong = { omValue: "$3,880,000", myValue: "$3,706,500", gap: "$1.2M below the OM" };
    expect(gapDisagreementLine(wrong)).toBe("The two figures differ by $173,500, where the line says $1,200,000.");
    const same = { omValue: "5.50%", myValue: "5.50%", gap: "25 bps tighter" };
    expect(gapDisagreementLine(same)).toBe("The two figures are the same, where the line says 25 bps.");
    expect(gapDisagreementLine({ omValue: "6.0%", myValue: "9.0%", gap: "3 pts higher" })).toBeNull();
    // A per-unit line beside two totals is no claim about the totals' gap.
    expect(gapDisagreement({ omValue: "$3,880,000", myValue: "$3,706,500", gap: "$725 per unit below" })).toBeNull();
  });

  it("draws a row's bar from the figures, and none for a gap of nothing", () => {
    const scale = gapScale([
      { omValue: "$3,880,000", myValue: "$3,706,500", gap: "$1.2M below", direction: "unfavorable" },
      { omValue: "$500,000", myValue: "$400,000", gap: "$100k below", direction: "unfavorable" },
      { omValue: "5.50%", myValue: "5.50%", gap: "25 bps tighter", direction: "unfavorable" },
    ]);
    // $173,500 is the widest dollar gap, not the line's $1.2M.
    expect(scale.shares[0]).toBe(-1);
    expect(scale.shares[1]).toBeCloseTo(-100_000 / 173_500, 10);
    expect(scale.shares[2]).toBeNull();
  });
});

describe("a value below zero is read with its sign (audit c66)", () => {
  it("reads a minus in each of its forms, and accounting's brackets, as the value's own sign", () => {
    expect(valueFigure("-1.0%")).toEqual({ value: -1, unit: "pct" });
    expect(valueFigure("−1.0%")).toEqual({ value: -1, unit: "pct" });
    expect(valueFigure("–1.0%")).toEqual({ value: -1, unit: "pct" });
    expect(valueFigure("(1.0%)")).toEqual({ value: -1, unit: "pct" });
    expect(valueFigure("-$30,000")).toEqual({ value: -30_000, unit: "usd" });
    expect(valueFigure("−$1.2M")).toEqual({ value: -1_200_000, unit: "usd" });
    expect(valueFigure("($30,000)")).toEqual({ value: -30_000, unit: "usd" });
    expect(valueFigure("+$30,000")).toEqual({ value: 30_000, unit: "usd" });
    expect(valueFigure("2.5%/yr")).toEqual({ value: 2.5, unit: "pct" });
  });

  it("never reads a hyphen inside a word, or a bracketed aside, as a minus", () => {
    expect(valueFigure("T-12 $3,880,000")).toEqual({ value: 3_880_000, unit: "usd" });
    expect(valueFigure("$3,880,000 (T-12)")).toEqual({ value: 3_880_000, unit: "usd" });
    expect(valueFigure("(T-12) $3,880,000")).toEqual({ value: 3_880_000, unit: "usd" });
    expect(valueFigure("(est. $30,000)")).toEqual({ value: 30_000, unit: "usd" });
    // A dash set apart from the figure is a sign or a separator: neither is
    // guessed, so the row's own line is read.
    expect(valueFigure("NOI – $3,880,000")).toBeNull();
    expect(valueFigure("− $30,000")).toBeNull();
    expect(valueFigure("Not modelled")).toBeNull();
  });

  it("subtracts 3.0% and -1.0% to 400 bps, and $120,000 and -$30,000 to $150,000", () => {
    // The audit's two: the page read 200 bps and $90,000, and said the
    // reconciler's correct lines were wrong.
    const rate = { omValue: "3.0%", myValue: "-1.0%", gap: "400 bps higher than the model", direction: "unfavorable" as const };
    expect(valueGap(rate)).toEqual({ value: 400, unit: "bps" });
    expect(gapDisagreementLine(rate)).toBeNull();
    const income = { omValue: "$120,000", myValue: "-$30,000", gap: "$150k more income in the OM", direction: "unfavorable" as const };
    expect(valueGap(income)).toEqual({ value: 150_000, unit: "usd" });
    expect(gapDisagreementLine(income)).toBeNull();
    // The other forms of the minus subtract the same way.
    expect(valueGap({ omValue: "2.5%/yr", myValue: "−0.5%/yr" })).toEqual({ value: 300, unit: "bps" });
    expect(valueGap({ omValue: "3.0%", myValue: "(1.0%)" })).toEqual({ value: 400, unit: "bps" });
    expect(valueGap({ omValue: "-1.0%", myValue: "-3.0%" })).toEqual({ value: 200, unit: "bps" });
  });

  it("draws and grades the true gap, and still says a line that is wrong", () => {
    const income = { omValue: "$120,000", myValue: "-$30,000", gap: "$150k more income in the OM", direction: "unfavorable" as const };
    // (OM − model) ÷ |model|, the actuals card's delta: $150,000 over $30,000.
    expect(gapShare(income)).toBeCloseTo(5, 10);
    const scale = gapScale([income, { omValue: "$500,000", myValue: "$400,000", gap: "$100k", direction: "unfavorable" }]);
    expect(scale.shares[0]).toBe(-1);
    expect(scale.shares[1]).toBeCloseTo(-100_000 / 150_000, 10);
    expect(gapDisagreementLine({ omValue: "3.0%", myValue: "-1.0%", gap: "200 bps higher" })).toBe(
      "The two figures differ by 400 bps, where the line says 200 bps.",
    );
  });

  it("leaves a value whose dash it cannot read to the row's own line", () => {
    const row = { omValue: "$120,000", myValue: "– $30,000", gap: "$150k" };
    expect(valueGap(row)).toBeNull();
    expect(rowGap(row)).toEqual({ value: 150_000, unit: "usd" });
    expect(gapDisagreement(row)).toBeNull();
  });
});

describe("a dollar gap is a share only of a figure on its own footing", () => {
  it("refuses a month's gap over a year's figure, and one door's gap over the building", () => {
    // The audit's two: 0.52% and 0.002% read LOW where the true shares are
    // 6.25% and unknowable.
    expect(gapShare({ gap: "$150/mo below the OM", myValue: "$28,800 / unit / yr" })).toBeNull();
    expect(gapShare({ gap: "$150 per unit below", myValue: "$6,499,500" })).toBeNull();
    expect(gapShare({ gap: "$1.50/SF below", myValue: "$3,706,500" })).toBeNull();
    expect(gapShare({ gap: "$150 a month below", myValue: "$3,706,500" })).toBeNull();
  });

  it("divides where the two agree, a year being the period an unstated total is quoted in", () => {
    expect(gapShare({ gap: "$150/unit/mo below", myValue: "$2,400 / unit / mo" })).toBeCloseTo(0.0625, 10);
    expect(gapShare({ gap: "$174k a year below the OM", myValue: "$3,706,500" })).toBeCloseTo(174_000 / 3_706_500, 10);
    expect(gapShare({ gap: "$174k below", myValue: "$3,706,500 / yr" })).toBeCloseTo(174_000 / 3_706_500, 10);
    expect(gapShare({ gap: "$1.50 per SF below", myValue: "$24.00/SF" })).toBeCloseTo(0.0625, 10);
  });

  it("grades only a dollar row on the income's band; a rate's gap keeps its grade", () => {
    expect(gapShare({ gap: "25 bps tighter", myValue: "5.50%" })).toBeCloseTo(0.25 / 5.5, 10);
    expect(incomeGapShare({ gap: "25 bps tighter", myValue: "5.50%" })).toBeNull();
    expect(incomeGapShare({ gap: "3 pts higher", myValue: "9.0%" })).toBeNull();
    expect(incomeGapShare({ gap: "$174k below", myValue: "$3,706,500" })).toBeCloseTo(174_000 / 3_706_500, 10);
    expect(incomeGapShare({ gap: "+4.2% below the OM", myValue: "$3,706,500" })).toBeCloseTo(0.042, 10);
  });
});

describe("gapScale — each row on its own unit's track, signed by direction", () => {
  it("scales the sample's rows: a dollar gap and a bps gap each fill their own track, the neutral row draws none", () => {
    const scale = gapScale(SAMPLE_DEAL.reconciliation.rows);
    expect(scale.units).toEqual(["usd", "bps", null]);
    // Both are unfavorable to the buyer, each the widest of its unit.
    expect(scale.shares).toEqual([-1, -1, null]);
  });

  it("puts two gaps of one unit on one track and signs them by direction", () => {
    const scale = gapScale([
      { gap: "$200k below", direction: "unfavorable" },
      { gap: "$50k above", direction: "favorable" },
      { gap: "$100k", direction: "unfavorable" },
    ]);
    expect(scale.shares).toEqual([-1, 0.25, -0.5]);
    expect(scale.units).toEqual(["usd", "usd", "usd"]);
  });

  it("never mixes units and never draws a neutral or figureless row", () => {
    const scale = gapScale([
      { gap: "$1M light", direction: "unfavorable" },
      { gap: "50 bps wide", direction: "favorable" },
      { gap: "$1M light", direction: "neutral" },
      { gap: "Not modelled", direction: "unfavorable" },
    ]);
    expect(scale.shares).toEqual([-1, 1, null, null]);
    expect(gapScale([]).shares).toEqual([]);
  });
});
