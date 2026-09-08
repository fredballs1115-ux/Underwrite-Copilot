// Locks the sector-trap contract on the analytical heart: every class keeps
// the base grill (the four multifamily-flavored pro-forma traps are the
// shared floor), office/industrial/retail ADD their own named trap lists,
// multifamily adds nothing (its list IS the base), and auto carries all
// three gated on detection. A regression that drops a sector's traps — or
// leaks them into multifamily — fails here, not in production.

import { describe, expect, it } from "vitest";
import {
  challengerInstruction,
  extractionInstruction,
  firstSignalInstruction,
  marketCheckInstruction,
  reconciliationInstruction,
  verdictInstruction,
} from "@/lib/anthropic/prompts";

// A deal with a plan — conversion, development, lease-up, heavy value-add —
// is judged on yield on total cost, and its stabilized pro forma is the
// finished project's figure to be tested for conservatism, never a misread
// and never a going-in cap on the price. Every prompt that reads the OM or
// the brief must say so, for every asset class.
describe("plan deals are judged on their own terms", () => {
  it("the challenger grills a plan on total cost, development spread and construction debt", () => {
    for (const cls of ["multifamily", "office", "industrial", "retail", "auto"] as const) {
      const p = challengerInstruction(cls);
      expect(p, cls).toContain("IF THE OM DESCRIBES A PLAN");
      expect(p, cls).toContain("total cost");
      expect(p, cls).toContain("development spread");
      expect(p, cls).toContain("as conservative as the deck says");
      expect(p, cls).toContain("not as a misread");
    }
  });

  it("the market check tests the figures BEHIND the stabilized pro forma, not NOI ÷ price", () => {
    const p = marketCheckInstruction("multifamily");
    expect(p).toContain("If the OM describes a plan");
    expect(p).toContain("do not compare the stabilized NOI to the acquisition price");
  });

  it("the verdict reads basis / exit / debt on the plan's terms when the brief names one", () => {
    const p = verdictInstruction();
    expect(p).toContain("total cost per unit or per SF");
    expect(p).toContain("never a misread and never a going-in cap");
  });

  it("the extraction reads the strategy first and labels every NOI", () => {
    const p = extractionInstruction("multifamily");
    expect(p).toContain("strategy.kind");
    expect(p).toContain('"NOI (in-place)"');
    expect(p).toContain('"NOI (Year 1)"');
    expect(p).toContain('"NOI (stabilized, pro forma)"');
    expect(p).toContain("NEVER label a stabilized pro forma as Year 1");
  });

  it("the model reconciliation asks for the plan and forbids a stabilized pro forma as year 1 without it", () => {
    const p = reconciliationInstruction();
    for (const field of [
      "capitalBudget",
      "constructionYears",
      "leaseUpYears",
      "inPlaceGprDuringWorks",
      "worksOpexAnnual",
      "leaseUpStartOccupancyPct",
    ]) {
      expect(p).toContain(field);
    }
    expect(p).toContain("NEVER put a stabilized pro forma into year1Gpr");
    expect(p).toContain("never write 0 for a figure that is simply absent");
  });
});

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

// The first signal is the first thing a buyer sees after upload, before any
// label can be checked — so it has to know that a yield on cost or a
// stabilized pro forma is not a going-in cap, for every asset class.
describe("first signal — the going-in cap is today's income against the price, nothing else", () => {
  it("tells the fast read to leave goingInCap empty for a stabilized, pro forma or yield-on-cost figure", () => {
    for (const cls of ["multifamily", "office", "industrial", "retail", "auto"] as const) {
      const p = firstSignalInstruction(cls);
      expect(p, cls).toContain("TODAY's in-place income against the asking price");
      expect(p, cls).toContain("yield on cost");
      expect(p, cls).toContain("not a going-in cap at all");
      expect(p, cls).toMatch(/leave `goingInCap` empty/);
      // The take names the kind of deal in the plan vocabulary.
      expect(p, cls).toContain("(stabilized, value-add, lease-up, conversion, development)");
    }
  });
});
