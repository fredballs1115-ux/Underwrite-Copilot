import { describe, expect, it } from "vitest";
import { usd, usdCents, usdExact } from "./format";

/**
 * The one dollar writer behind /tools: the cards' tiles and the modules'
 * sentences both print through it, so one figure is said one way wherever
 * it sits.
 */
describe("the shared dollar writer", () => {
  it("says a figure compactly from a million, exactly under it", () => {
    expect(usd(13_480_465)).toBe("$13.48M");
    expect(usd(560_000)).toBe("$560,000");
    expect(usdExact(13_480_465)).toBe("$13,480,465");
    expect(usdCents(14)).toBe("$14.00");
    expect(usd(null)).toBe("—");
    expect(usdExact(null)).toBe("—");
    expect(usdCents(null)).toBe("—");
  });

  it("puts the minus sign outside the dollar, the way the site writes money", () => {
    // "$-385,213" is how a negative interpolated straight into a template
    // reads, and nobody writes money that way. The sign is U+2212, as on a
    // re-screen's diff ("−$1.5M") and under a fair market rent ("−$578/mo").
    expect(usdExact(-385_213)).toBe("−$385,213");
    expect(usd(-10_000_000)).toBe("−$10.00M");
    expect(usd(-9_350)).toBe("−$9,350");
    expect(usdCents(-3.2)).toBe("−$3.20");
    for (const s of [usd(-1), usdExact(-1), usdCents(-1), usd(-2_000_000)]) {
      expect(s).not.toContain("$-");
      expect(s).not.toContain("-$");
    }
  });

  it("gives a figure that rounds to nothing no sign", () => {
    // "−$0" is not an amount.
    expect(usdExact(-0.4)).toBe("$0");
    expect(usd(-0.4)).toBe("$0");
    expect(usdCents(-0.004)).toBe("$0.00");
    expect(usdExact(-0)).toBe("$0");
    // …while a figure that survives the rounding keeps it.
    expect(usdExact(-0.6)).toBe("−$1");
    expect(usdCents(-0.006)).toBe("−$0.01");
  });

  it("keeps each writer's precision: whole dollars whole, cents to the cent", () => {
    expect(usdExact(1_234.5)).toBe("$1,235");
    expect(usdCents(59.333)).toBe("$59.33");
    expect(usd(999_999.6)).toBe("$1,000,000");
    expect(usd(1_005_000)).toBe("$1.00M");
  });
});
