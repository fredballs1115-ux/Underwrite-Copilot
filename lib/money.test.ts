import { describe, expect, it } from "vitest";
import { fmtUsd, parseUsd, readFigure } from "./money";

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
    for (const raw of ["$68.5M", "500k", "2bn", "1.2mm", "63 million"]) {
      expect(parseUsd(raw), raw).toBe(readFigure(raw));
    }
  });

  it("formats what it parsed", () => {
    expect(fmtUsd("$68.5M")).toBe("$68,500,000");
    expect(fmtUsd("nope")).toBe("");
    expect(fmtUsd(null)).toBe("");
  });
});
