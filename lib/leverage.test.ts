import { describe, expect, it } from "vitest";
import { leverageRead, THIN_BPS } from "./leverage";

describe("leverageRead", () => {
  it("names negative leverage when the cap sits below the benchmark", () => {
    const r = leverageRead(5.2, 6.3);
    expect(r?.tone).toBe("negative");
    expect(r?.spreadBps).toBe(-110);
    expect(r?.label).toContain("110 bps below");
  });

  it("calls a small positive spread thin (investor debt prices above the benchmark)", () => {
    const r = leverageRead(6.5, 6.3);
    expect(r?.tone).toBe("thin");
    expect(r?.spreadBps).toBe(20);
  });

  it("treats exactly zero spread as thin, not negative", () => {
    expect(leverageRead(6.3, 6.3)?.tone).toBe("thin");
  });

  it("flips to positive exactly at the THIN_BPS boundary", () => {
    const bench = 6.0;
    expect(leverageRead(bench + (THIN_BPS - 1) / 100, bench)?.tone).toBe("thin");
    expect(leverageRead(bench + THIN_BPS / 100, bench)?.tone).toBe("positive");
  });

  it("rounds fractional spreads to whole basis points", () => {
    expect(leverageRead(6.333, 6.0)?.spreadBps).toBe(33);
  });

  it("returns null for implausible or missing inputs", () => {
    expect(leverageRead(NaN, 6)).toBeNull();
    expect(leverageRead(6, NaN)).toBeNull();
    expect(leverageRead(0, 6)).toBeNull();
    expect(leverageRead(6, 0)).toBeNull();
    expect(leverageRead(40, 6)).toBeNull();
    expect(leverageRead(6, 40)).toBeNull();
  });
});
