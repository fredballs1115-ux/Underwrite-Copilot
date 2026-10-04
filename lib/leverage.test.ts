import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { capSpreadRead, leverageRead, SEEDED_RATE_BENCHMARK, THIN_BPS } from "./leverage";

describe("leverageRead against a named benchmark", () => {
  it("names the 30-yr fixed by default and the seeded screening rate when told to", () => {
    expect(leverageRead(5.4, 6.78)?.label).toBe("Negative leverage: going-in cap sits 138 bps below the 30-yr fixed");
    // The seed is the latest published index, a business day or more old and
    // printed with its date — never "today's" (research pass 27).
    expect(SEEDED_RATE_BENCHMARK).toBe("the latest index plus the class spread");
    expect(leverageRead(5.4, 6.78, SEEDED_RATE_BENCHMARK)?.label).toBe(
      "Negative leverage: going-in cap sits 138 bps below the latest index plus the class spread",
    );
    expect(leverageRead(7.6, 6.78, SEEDED_RATE_BENCHMARK)?.label).toBe(
      "Positive leverage at the benchmark: 82 bps above the latest index plus the class spread",
    );
  });

  it("the deal page's research panel and the demo say the latest curve, never today's", () => {
    // The panel reads the database, so no render test reaches it; its words
    // are held here at the source, beside the demo card's — comments aside.
    const code = (rel: string) =>
      readFileSync(join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const panel = code("app/(app)/deals/[id]/research-panel.tsx");
    const demo = code("app/demo/leverage-card.tsx");
    expect(panel).toContain("leverageRead(capPct, rateSeed.pct, SEEDED_RATE_BENCHMARK)");
    for (const src of [panel, demo]) {
      expect(src).toContain("`Against the latest curve: the cap is ${capSpread.label}");
      expect(src).not.toMatch(/today(?:'|’|&apos;)s (?:curve|index|10-year|Treasury|SOFR)/);
    }
  });
});

describe("capSpreadRead — the cap over the 10-year, a fact with a direction and no verdict", () => {
  it("says the spread and which way it runs", () => {
    expect(capSpreadRead(5.4, 4.94)).toEqual({ spreadBps: 46, label: "46 bps over the 10-year Treasury" });
    expect(capSpreadRead(4.82, 4.94)).toEqual({ spreadBps: -12, label: "12 bps under the 10-year Treasury" });
    expect(capSpreadRead(4.94, 4.94)).toEqual({ spreadBps: 0, label: "level with the 10-year Treasury" });
  });
  it("refuses an implausible figure", () => {
    expect(capSpreadRead(NaN, 4.94)).toBeNull();
    expect(capSpreadRead(5.4, 0)).toBeNull();
    expect(capSpreadRead(40, 4.94)).toBeNull();
  });
});

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
