// Locks the sector-trap contract on the analytical heart: every class keeps
// the base grill (the four multifamily-flavored pro-forma traps are the
// shared floor), office/industrial/retail ADD their own named trap lists,
// multifamily adds nothing (its list IS the base), and auto carries all
// three gated on detection. A regression that drops a sector's traps — or
// leaks them into multifamily — fails here, not in production.

import { describe, expect, it } from "vitest";
import {
  challengerInstruction,
  marketCheckInstruction,
} from "@/lib/anthropic/prompts";

describe("sector-aware challenger traps", () => {
  it("keeps the base four traps for every asset class", () => {
    for (const cls of ["multifamily", "office", "industrial", "retail", "auto"] as const) {
      const p = challengerInstruction(cls);
      expect(p, cls).toContain("taxes NOT reset to the sale price");
      expect(p, cls).toContain("loss-to-lease");
      expect(p, cls).toContain("legacy premium");
    }
  });

  it("office adds WALT / re-leasing / effective-rent / shadow-space traps", () => {
    const p = challengerInstruction("office");
    expect(p).toContain("WALT");
    expect(p).toContain("FACE VS EFFECTIVE");
    expect(p).toContain("sublease");
  });

  it("industrial adds functional-fit and mark-to-market traps", () => {
    const p = challengerInstruction("industrial");
    expect(p).toContain("clear height");
    expect(p).toContain("MARK-TO-MARKET");
    expect(p).toContain("TENANT CONCENTRATION");
  });

  it("retail adds co-tenancy and occupancy-cost traps", () => {
    const p = challengerInstruction("retail");
    expect(p).toContain("co-tenancy");
    expect(p).toContain("OCCUPANCY-COST RATIO");
  });

  it("multifamily stays exactly the base grill — no sector suffix", () => {
    const p = challengerInstruction("multifamily");
    expect(p).not.toContain("WALT");
    expect(p).not.toContain("clear height");
    expect(p).not.toContain("co-tenancy");
  });

  it("auto carries all three sector lists, gated on detection", () => {
    const p = challengerInstruction("auto");
    expect(p).toContain("If the document turns out to be office, industrial, or retail");
    expect(p).toContain("OFFICE-SPECIFIC TRAPS");
    expect(p).toContain("INDUSTRIAL-SPECIFIC TRAPS");
    expect(p).toContain("RETAIL-SPECIFIC TRAPS");
  });
});

describe("sector-aware market-check calibration", () => {
  it("industrial calibrates to current asking, not the prior peak", () => {
    expect(marketCheckInstruction("industrial")).toContain("repriced double digits");
  });

  it("office calibrates against the post-2020 vacancy world", () => {
    expect(marketCheckInstruction("office")).toContain("2019-vintage");
  });

  it("multifamily market check is unchanged", () => {
    const p = marketCheckInstruction("multifamily");
    expect(p).not.toContain("repriced double digits");
    expect(p).not.toContain("2019-vintage");
  });
});
