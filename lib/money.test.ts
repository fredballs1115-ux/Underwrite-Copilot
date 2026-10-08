import { describe, expect, it } from "vitest";
import { compactUsd, fmtUsd, parseUsd, readFigure, scaledText, statesRange } from "./money";
import { renovationCostPerDoor } from "./deal-strategy";
import { statedIncomeOf } from "./stated-period";

describe("readFigure", () => {
  it("reads the shorthand an analyst types into a price field", () => {
    // The bug this exists for: every one of these used to read as nothing,
    // so /tools showed a page of em dashes to someone who typed a price.
    expect(readFigure("$20M")).toBe(20_000_000);
    expect(readFigure("20m")).toBe(20_000_000);
    expect(readFigure("$68.5M")).toBe(68_500_000);
    expect(readFigure("500k")).toBe(500_000);
    expect(readFigure("1.2mm")).toBe(1_200_000);
    expect(readFigure("63 million")).toBe(63_000_000);
    expect(readFigure("$2bn")).toBe(2_000_000_000);
    expect(readFigure("2 billion")).toBe(2_000_000_000);
  });

  it("reads the plain forms too", () => {
    expect(readFigure("1,200,000")).toBe(1_200_000);
    expect(readFigure("20000000")).toBe(20_000_000);
    expect(readFigure("6.5")).toBe(6.5);
    expect(readFigure(".5")).toBe(0.5);
    expect(readFigure(" 36 ")).toBe(36);
  });

  it("ignores a unit the field already prints beside the box", () => {
    // The suffix sits outside the input, but people type it anyway.
    expect(readFigure("6.5%")).toBe(6.5);
    expect(readFigure("1.25x")).toBe(1.25);
    expect(readFigure("1.25X")).toBe(1.25);
  });

  it("keeps a sign, because a negative NOI is a real thing to type", () => {
    // sizeLoan has a deliberate answer for a negative NOI (both coverage
    // tests drop out). A reader that refused the minus would turn that
    // into a blank field instead, which is the wrong answer twice over.
    expect(readFigure("-250,000")).toBe(-250_000);
    expect(readFigure("-$250,000")).toBe(-250_000);
    expect(readFigure("$-250,000")).toBe(-250_000);
    expect(readFigure("-1.5M")).toBe(-1_500_000);
    expect(readFigure("+40")).toBe(40);
  });

  it("has no floor, because the same field holds a rent and a price", () => {
    // parseUsd's $10k floor is a typo guard for a building price. Applied
    // here it would swallow "$36" — an office rent per square foot.
    expect(readFigure("36")).toBe(36);
    expect(readFigure("12.50")).toBe(12.5);
    expect(readFigure("0")).toBe(0);
  });

  it("never prints a minus sign on nothing", () => {
    expect(Object.is(readFigure("-0"), 0)).toBe(true);
  });

  it("reads nothing where there is nothing, rather than a zero", () => {
    // A blank is null, never zero — the rule the whole math layer holds.
    for (const raw of ["", "   ", "-", ".", "$", "%", "abc", "k", "--5"]) {
      expect(readFigure(raw), raw).toBeNull();
    }
  });

  it("refuses a string that is not one figure, rather than reading part of it", () => {
    // Unlike parseUsd, which reads the first number out of a pasted line.
    // A field's whole contents are the figure, so half an answer is worse
    // than none: "20x6" is a mistake, not a twenty.
    for (const raw of ["20x6", "1,200,000 per unit", "6.5% cap", "5 - 7", "1e6"]) {
      expect(readFigure(raw), raw).toBeNull();
    }
  });

  it("gives the longer spelling the match", () => {
    // "mm" must beat "m" and "bn" must beat "b", or "$2bn" reads as two
    // billion with a stray "n" and fails the whole-string test.
    expect(readFigure("5MM")).toBe(5_000_000);
    expect(readFigure("5M")).toBe(5_000_000);
    expect(readFigure("5bn")).toBe(5_000_000_000);
    expect(readFigure("5b")).toBe(5_000_000_000);
  });
});

describe("parseUsd, which answers a different question", () => {
  it("still reads what it always did", () => {
    expect(parseUsd("$68,000,000")).toBe(68_000_000);
    expect(parseUsd("$68.5M")).toBe(68_500_000);
    expect(parseUsd("63 million")).toBe(63_000_000);
    expect(parseUsd("500k")).toBe(500_000);
    expect(parseUsd("68000000")).toBe(68_000_000);
    expect(parseUsd("$2bn")).toBe(2_000_000_000);
  });

  it("keeps its floor and its refusal of a negative", () => {
    expect(parseUsd("$68")).toBeNull();
    expect(parseUsd("$68", 10)).toBe(68);
    expect(parseUsd("-1,000,000")).toBeNull();
    expect(parseUsd("")).toBeNull();
  });

  it("agrees with readFigure about what a suffix means", () => {
    // The one thing the shared scale table exists to guarantee.
    for (const raw of ["$68.5M", "500k", "2bn", "1.2mm", "63 million", "$12.5 mil", "12.5mil", "2.5Mn", "$1.2 bil"]) {
      expect(parseUsd(raw), raw).toBe(readFigure(raw));
    }
  });

  it("reads mil, mn and bil as the shorthand they are, and never part of a longer number (audit C3a)", () => {
    expect(parseUsd("$12.5 mil")).toBe(12_500_000);
    expect(parseUsd("$12.5mil")).toBe(12_500_000);
    expect(parseUsd("USD 25mn")).toBe(25_000_000);
    expect(parseUsd("$1.2 bil")).toBe(1_200_000_000);
    // A figure glued to a word that is no scale is never read by its
    // integer part.
    expect(parseUsd("$32.50psf", 1)).toBeNull();
    expect(parseUsd("$1,250.75psf", 100)).toBeNull();
    expect(parseUsd("2nd lien $5,000,000")).toBe(5_000_000);
    expect(readFigure("12.5mil")).toBe(12_500_000);
    expect(readFigure("2.5mn")).toBe(2_500_000);
  });

  it("formats what it parsed", () => {
    expect(fmtUsd("$68.5M")).toBe("$68,500,000");
    expect(fmtUsd("nope")).toBe("");
    expect(fmtUsd(null)).toBe("");
  });
});

describe("parseUsd — a hyphen in the words is no minus and no range (research pass 37)", () => {
  it("reads the figure a hyphenated word stands beside", () => {
    // Any hyphen anywhere had read as nothing: a stated balance, tax bill or
    // ground rent with a hyphenated word beside it was silently dropped.
    const cases: [string, number][] = [
      ["$24,500,000 (Freddie Mac, non-recourse)", 24_500_000],
      ["$410,000 (2025-26)", 410_000],
      ["$1,250,000 (10-year term)", 1_250_000],
      ["$650,000 (T-12)", 650_000],
      ["$900,000 (fair-market reset in 2031)", 900_000],
      ["$22,000,000 (tax-exempt bonds)", 22_000_000],
      ["$9,500,000 (C-PACE)", 9_500_000],
      ["$24.5M non-recourse", 24_500_000],
      ["$1.2M", 1_200_000],
    ];
    for (const [raw, n] of cases) expect(parseUsd(raw), raw).toBe(n);
  });

  it("refuses a minus before the figure, in each of its forms and either side of the dollar sign", () => {
    for (const raw of ["-250,000", "−$250k", "$-250,000", "–250,000", "- $250,000", "−250000", "$ -250,000", "Net -250,000", "(-250,000)"]) {
      expect(parseUsd(raw), raw).toBeNull();
    }
    // A dash set apart between words and the figure is punctuation, not a sign.
    expect(parseUsd("Senior loan – $24,500,000")).toBe(24_500_000);
  });

  it("refuses accounting brackets around the figure alone, and reads a figure inside words in brackets", () => {
    for (const raw of ["($250,000)", "(250,000)", "$(250,000)", "( $1.2M )"]) expect(parseUsd(raw), raw).toBeNull();
    expect(parseUsd("($250,000 credit at closing)")).toBe(250_000);
  });

  it("refuses a range whose first end is the figure", () => {
    for (const raw of [
      "$40M - $42M",
      "40-42M",
      "$40M to $42M",
      "$40–42M",
      "$40,000,000 – $42,000,000",
      "$40M through $42M",
      "$1.2M—$1.5M",
      "$40 to $42 million",
      "2025-26 $410,000",
    ]) {
      expect(parseUsd(raw), raw).toBeNull();
    }
  });

  it("reads a figure followed by a date or a term after \"to\" or \"through\", which is no range's other end", () => {
    expect(parseUsd("$900,000 through 2031")).toBe(900_000);
    expect(parseUsd("$1,250,000 to 2030")).toBe(1_250_000);
    expect(parseUsd("$3,000,000 to the seller at closing")).toBe(3_000_000);
  });
});

describe("parseUsd — a dash before a percentage, a year or a smaller figure is words after the figure (audit C3a)", () => {
  it("reads the figure a dash and the words after it stand beside", () => {
    // Any dash and digit had read as a range, so these stated figures read as
    // none: a leased fee's ground rent, a single tenant's base rent, a full
    // tax bill and an assumable balance the memorandum states.
    const cases: [string, number][] = [
      ["$450,000 – 10% bumps every 5 years", 450_000],
      ["$450,000 — 2% annual increases", 450_000],
      ["$540,000 – 2% annual increases", 540_000],
      ["$520,500 – 2026 estimate", 520_500],
      ["$520,500 — 2025 actual", 520_500],
      ["$24,500,000 — 3.45% fixed, matures 2031", 24_500_000],
      ["$1,200,000 – 2% annual escalations", 1_200_000],
      ["$410,000 – 2025", 410_000],
      ["$520,500–2026", 520_500],
      ["$610,000 - 2% annual increases", 610_000],
      ["$24,500,000 – 10 years remaining", 24_500_000],
      ["$24.5M – 1.25x coverage", 24_500_000],
      ["$24,500,000 – 180 bps over the 10-year", 24_500_000],
    ];
    for (const [raw, n] of cases) expect(parseUsd(raw), raw).toBe(n);
  });

  it("still refuses a range, whatever the dash, where the other figure is dollars at least half the first", () => {
    for (const raw of [
      "$40,000,000 — $42,000,000",
      "$40M - 42M",
      "$40,000,000 – 42,000,000",
      "$1.0M. – $1.2M.",
      "$950,000 – $1.1M",
      "$40M – $90M",
    ]) {
      expect(parseUsd(raw), raw).toBeNull();
    }
    // A low floor's figures: a thousands comma is no year's, so "2,050" is a
    // range's other end; a year after a dash is not.
    expect(parseUsd("$1,950 – 2,050 per month", 100)).toBeNull();
    expect(parseUsd("$1,950 – 2026 rent roll", 100)).toBe(1_950);
    expect(parseUsd("$850 – $950", 100)).toBeNull();
    expect(parseUsd("$850 – 95 SF over the average", 100)).toBe(850);
  });

  it("refuses a span of years read first, never the year as the figure", () => {
    // "2026–27" is a label; the year is not the rent.
    expect(parseUsd("2026–27: $1,050 per bed", 100)).toBeNull();
    expect(parseUsd("2025 – 26 budget $410,000", 100)).toBeNull();
    expect(parseUsd("2025 to 2030 $410,000", 100)).toBeNull();
  });
});

describe("statesRange — the one test of a range behind every reader that refuses one", () => {
  it("finds a range anywhere in a line", () => {
    for (const raw of [
      "$600 - $700",
      "$1.0M - $1.2M",
      "$15k-20k",
      "$450,000 to $520,000",
      "18-24 months",
      "Rent of $1,950 – 2,050 a month",
      "$1.0 mil. – $1.2 mil.",
      "approx. $600–700 per unit",
    ]) {
      expect(statesRange(raw), raw).toBe(true);
    }
  });

  it("reads a percentage, a year, a smaller figure or a span of years after a figure as words", () => {
    for (const raw of [
      "$610,000 – 2% annual increases",
      "$520,500 – 2026 estimate",
      "$650/mo (2025-26 budget)",
      "$1,100,000 to 2030",
      "$1,100,000 (FY 2024–2025 levy)",
      "$24,500,000 — 3.45% fixed, matures 2031",
      "$650,000 (T-12)",
      "$1,250,000 (10-year term)",
      "$15,000 per door – 2025 pricing",
      "24 months (2025-2027)",
    ]) {
      expect(statesRange(raw), raw).toBe(false);
    }
  });

  it("reads two bare figures in a line that marks its dollars as words, whatever the dash (audit C5, MED-4)", () => {
    for (const raw of [
      "$450,000 (years 1-10 of the PILOT)",
      "$1,250,000 (Phase 1-2)",
      "$1,100,000/yr, 2-3% bumps",
      "$1,100,000 – 2–3% annual bumps",
      "$91,667/mo (1-2 BR)",
      "$650 per unit per month (1-2 BR)",
      "$15,000 per unit (units 1-48)",
      "$15,000 (2-3 week turn)",
    ]) {
      expect(statesRange(raw), raw).toBe(false);
    }
    // A dollar figure on either end is still a range, and a line of bare
    // figures reads as before.
    for (const raw of ["$15k-20k", "40-42M", "$40-$42M", "1,950-$2,050", "18-24 months", "600-700", "Units 1-48 at $650 – $700"]) {
      expect(statesRange(raw), raw).toBe(true);
    }
  });

  it("reads a bare pair that leads the line, before its first dollar figure, as a range (audit C6, MED-6)", () => {
    // Each had read its low end: $12,000 a door, $1,800 a year, $1,850.
    for (const raw of ["12,000-15,000 per door ($2.4M total)", "150-200/mo ($175 avg)", "1,850 - 2,050 per unit (approximately $1.9k)"]) {
      expect(statesRange(raw), raw).toBe(true);
    }
    expect(renovationCostPerDoor("12,000-15,000 per door ($2.4M total)")).toBeNull();
    expect(renovationCostPerDoor("1,850 - 2,050 per unit (approximately $1.9k)")).toBeNull();
    expect(statedIncomeOf("150-200/mo ($175 avg)")).toBeNull();
    expect(statedIncomeOf("1,850 - 2,050 per unit (approximately $1.9k)")).toBeNull();
    // A pair in the words after the figure is still words, and a cap range
    // after a price is the price's words.
    expect(statesRange("$40M, 6-7% cap")).toBe(false);
    expect(parseUsd("$40M, 6-7% cap")).toBe(40_000_000);
    expect(renovationCostPerDoor("$15,000 per door (units 1-48)")).toBe(15_000);
  });
});

describe("compactUsd — one compact dollar, rounded one way (research pass 34)", () => {
  it("rounds a half-step up, in whole numbers, never a float's toFixed", () => {
    // The pass's note: "$5.5M" on its card, "$5.6M" on its memo.
    expect((5_550_000 / 1e6).toFixed(1)).toBe("5.5");
    expect(compactUsd(5_550_000)).toBe("$5.6M");
    expect(compactUsd(1_450_000)).toBe("$1.5M");
    expect(compactUsd(2_005_000, { millions: 2 })).toBe("$2.01M");
    expect(compactUsd(1_005_000, { millions: 2 })).toBe("$1.01M");
    expect(compactUsd(850_500)).toBe("$851k");
    expect(compactUsd(12_450, { thousandsPlaces: 1 })).toBe("$12.5k");
    // Short of the half, down.
    expect(compactUsd(5_549_999)).toBe("$5.5M");
  });

  it("agrees with the count of tenths at every $50k step from $1M to $99.95M", () => {
    // The two writers the pass found disagreed on 396 of these 1,980 steps:
    // the float's toFixed is the one that missed.
    let steps = 0;
    let floatDisagrees = 0;
    for (let n = 1_000_000; n < 100_000_000; n += 50_000) {
      steps++;
      const tenths = Math.round(n / 1e5);
      expect(compactUsd(n)).toBe(`$${Math.floor(tenths / 10)}.${tenths % 10}M`);
      if (`$${(n / 1e6).toFixed(1)}M` !== compactUsd(n)) floatDisagrees++;
    }
    expect(steps).toBe(1_980);
    expect(floatDisagrees).toBe(396);
  });

  it("writes each surface's own shape", () => {
    expect(compactUsd(21_000_000)).toBe("$21.0M");
    expect(compactUsd(850_000)).toBe("$850k");
    expect(compactUsd(400)).toBe("$400");
    expect(compactUsd(1_000_000, { trim: true })).toBe("$1M");
    expect(compactUsd(1_250_000, { trim: true })).toBe("$1.3M");
    expect(compactUsd(1_500_000, { millions: 2, trim: true })).toBe("$1.5M");
    expect(compactUsd(3_960_000, { millions: "auto" })).toBe("$3.96M");
    expect(compactUsd(48_000_000, { millions: "auto" })).toBe("$48.0M");
    expect(compactUsd(124_500_000, { wholeMillionsFrom: 1e8 })).toBe("$125M");
    expect(compactUsd(9_350, { thousandsFrom: 1e4 })).toBe("$9,350");
    expect(compactUsd(850_000, { thousandsFrom: Infinity })).toBe("$850,000");
    expect(compactUsd(450, { thousandsFrom: 0 })).toBe("$0k");
    expect(compactUsd(35_000, { thousandsPlaces: 1 })).toBe("$35k");
  });

  it("writes a thousand thousands as a million", () => {
    expect(compactUsd(999_600)).toBe("$1.0M");
    expect(compactUsd(999_400)).toBe("$999k");
  });

  it("writes a figure that rounds across a shape's edge in the next shape", () => {
    // Ten millions take one place where the shape is "auto"…
    expect(compactUsd(9_994_000, { millions: "auto" })).toBe("$9.99M");
    expect(compactUsd(9_996_000, { millions: "auto" })).toBe("$10.0M");
    // …and a hundred are written whole where the surface writes them so.
    expect(compactUsd(99_940_000, { wholeMillionsFrom: 1e8 })).toBe("$99.9M");
    expect(compactUsd(99_960_000, { wholeMillionsFrom: 1e8 })).toBe("$100M");
  });

  it("puts a minus sign outside the dollar, and none on a figure that rounds to nothing", () => {
    expect(compactUsd(-1_550_000)).toBe("−$1.6M");
    expect(compactUsd(-850_000)).toBe("−$850k");
    expect(compactUsd(-0.3)).toBe("$0");
    expect(compactUsd(Number.NaN)).toBe("—");
  });

  it("scaledText counts the last place in whole numbers", () => {
    expect(scaledText(40_000_000, 1e6, 1, true)).toBe("40");
    expect(scaledText(42_500_000, 1e6, 1, true)).toBe("42.5");
    expect(scaledText(5_550_000, 1e6, 1)).toBe("5.6");
    expect(scaledText(50_000, 1e6, 2)).toBe("0.05");
  });
});
