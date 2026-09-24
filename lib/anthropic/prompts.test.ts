// Locks the sector-trap contract on the analytical heart: every class keeps
// the base grill (the four multifamily-flavored pro-forma traps are the
// shared floor), office/industrial/retail ADD their own named trap lists,
// multifamily adds nothing (its list IS the base), and auto carries all
// three gated on detection. A regression that drops a sector's traps — or
// leaks them into multifamily — fails here, not in production.

import { describe, expect, it } from "vitest";
import {
  brokerCompsInstruction,
  challengerInstruction,
  extractionInstruction,
  firstSignalInstruction,
  liveMarketClause,
  marketCheckInstruction,
  reconcilerInstruction,
  reconciliationInstruction,
  verdictInstruction,
} from "@/lib/anthropic/prompts";
import { gapFigure } from "@/lib/gap-detail";
import { compFigures } from "@/lib/comp-detail";
import { rangeRead } from "@/lib/memo/report-document";

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

  // The plan's rows, by the exact labels the readers match (lib/deal-strategy:
  // BUDGET_INCLUDE, LAND_PRICE_INCLUDE, TIMELINE_ROW; the unit-count readers).
  it("the extraction asks for the plan's rows by name, for every plan kind", () => {
    const p = extractionInstruction("multifamily");
    expect(p).toContain("For a value-add, lease-up, conversion or development");
    for (const label of [
      '"Total project cost"',
      '"Construction budget"',
      '"Renovation budget"',
      '"Land cost"',
      '"Units (proposed)"',
      '"Construction period"',
      '"Lease-up period"',
      '"Stabilized in"',
    ]) {
      expect(p).toContain(label);
    }
    expect(p).toContain("never an appraised land value");
    expect(p).toContain("never write 0 for a figure the OM does not state");
  });

  // The headline rows, by the exact labels the shared readers match
  // (lib/criteria: METRIC_FIND.price, buildingSfRow, occupancyRow,
  // findGoingInCap; lib/deal-strategy: unitCountRow), with the figures that
  // must NOT share those labels named beside them.
  it("the extraction names the headline labels exactly and keeps the look-alikes apart", () => {
    const p = extractionInstruction("multifamily");
    expect(p).toContain("Label the headline rows exactly");
    for (const label of ['"Asking price"', '"Units"', '"Total SF"', '"Occupancy"', '"Going-in cap rate"']) {
      expect(p).toContain(label);
    }
    for (const lookAlike of [
      '"Price per unit"',
      '"Last sale price"',
      '"Land area"',
      '"Average unit size"',
      '"Stabilized occupancy"',
      '"Stabilized cap rate"',
    ]) {
      expect(p).toContain(lookAlike);
    }
    expect(p).toContain("Put the number alone in the value");
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

// The steps that read the OM after the extraction — the comp scrutiny, the
// market check, the reconciler — are told what the screen established (the
// deal's kind, the plan's figures), after the document so the cached prefix
// is untouched, and the comp scrutiny holds a plan's comps against total
// cost rather than the shell's price.
describe("what the screen established reaches the steps that read the OM", () => {
  const ctx =
    "Deal type: Conversion — Convert the vacant office building into 320 apartments. The OM's stabilized NOI of $21.0M is the finished project's figure — over $180.0M of total cost it is an 11.7% yield on cost, not today's income and not a cap rate on the price.";

  it("the broker-comp scrutiny holds a plan's comps against total cost, and carries the context last", () => {
    const bare = brokerCompsInstruction();
    expect(bare).toContain("IF THE OM DESCRIBES A PLAN");
    expect(bare).toContain("total cost per unit or per SF");
    expect(bare).toContain("never against the shell's or the land's price");
    expect(bare).not.toContain("<deal_context>");
    const withCtx = brokerCompsInstruction(ctx);
    expect(withCtx).toContain(`<deal_context>\n${ctx}\n</deal_context>`);
    expect(withCtx).toMatch(/never overrides what the OM states/);
    expect(withCtx.indexOf("<deal_context>")).toBeGreaterThan(withCtx.indexOf("no comps at all"));
  });

  it("the market check and the reconciler carry the same block; a blank context adds nothing", () => {
    expect(marketCheckInstruction("office", ctx)).toContain(`<deal_context>\n${ctx}\n</deal_context>`);
    expect(marketCheckInstruction("office", "  ")).toBe(marketCheckInstruction("office"));
    expect(marketCheckInstruction("office", null)).toBe(marketCheckInstruction("office"));
    expect(reconcilerInstruction(ctx)).toContain(`<deal_context>\n${ctx}\n</deal_context>`);
    expect(reconcilerInstruction()).toContain("on the plan's terms");
    expect(reconcilerInstruction()).toContain("never read the OM's stabilized pro forma as the buyer's year one");
    expect(reconcilerInstruction()).not.toContain("<deal_context>");
  });
});

// The deal page and the report draw a reconciliation gap only when its text
// states a magnitude (lib/gap-detail reads dollars, basis points or a
// percentage and nothing otherwise), so the reconciler is told to lead each
// gap with its figure — and every shape the instruction holds up as an
// example must parse through the same reader, or the bars would draw on the
// sample and not on a real screen.
describe("the reconciler's gap lines lead with their figure", () => {
  it("asks for the figure first, and each example it names is one the gap reader draws", () => {
    const p = reconcilerInstruction();
    expect(p).toContain("Lead the gap with its figure");
    expect(p).toContain("the dollar amount, basis points or percentage the two values differ by");
    expect(p).toContain('says "In agreement" and states no figure');
    const examples = [...p.matchAll(/as in "([^"]+)", "([^"]+)" or "([^"]+)"/g)][0]?.slice(1) ?? [];
    expect(examples).toHaveLength(3);
    const units = examples.map((ex) => gapFigure(ex)?.unit ?? null);
    expect(units).toEqual(["usd", "bps", "pct"]);
    expect(gapFigure("In agreement")).toBeNull();
  });
});

// The deal page and the report draw a sale comp's basis only when its detail
// line states one (lib/comp-detail reads a per-unit or per-SF figure and a
// cap, nothing otherwise), so the comp scrutiny is told what `detail` leads
// with — and the sale example it holds up must parse through the same
// reader, while the lease examples carry no basis to draw.
describe("the comp scrutiny names each comp's detail line", () => {
  it("asks for the stated basis first, and its sale example is one the comp reader draws", () => {
    const p = brokerCompsInstruction();
    expect(p).toContain("`detail` leads with what the OM states of its basis");
    expect(p).toContain("carries nothing the OM does not state");
    const sale = p.match(/for a sale comp [^"]*"([^"]+)"/)?.[1];
    expect(sale).toBeTruthy();
    const figures = compFigures(sale!);
    expect(figures.perUnit).toBe(252_000);
    expect(figures.capPct).toBe(5.4);
    const lease = (p.match(/for a lease comp [^"]*"([^"]+)" or "([^"]+)"/) ?? []).slice(1);
    expect(lease).toHaveLength(2);
    for (const ex of lease) expect(compFigures(ex).perUnit == null, ex).toBe(true);
  });
});

// The deal page's market tab and the report's market page draw the OM's
// figure on its typical range only when both parse as numbers in one unit
// (rangeRead), so the market check is told the shape of both fields — and
// every pair of examples it holds up must read as a position on the range.
describe("the market check names the shape of its figures", () => {
  it("asks for omSays with its unit and typicalRange low to high, and its examples draw", () => {
    for (const cls of ["multifamily", "office", "industrial", "retail", "auto"] as const) {
      const p = marketCheckInstruction(cls);
      expect(p, cls).toContain("Write `omSays` as the OM's figure with its unit");
      expect(p, cls).toContain("`typicalRange` as low to high in the same unit with an en dash");
      expect(p, cls).toContain("rather than inventing one");
    }
    const p = marketCheckInstruction("multifamily");
    const oms = (p.match(/figure with its unit \("([^"]+)", "([^"]+)", "([^"]+)"\)/) ?? []).slice(1);
    const ranges = (p.match(/with an en dash \("([^"]+)", "([^"]+)", "([^"]+)"\)/) ?? []).slice(1);
    expect(oms).toHaveLength(3);
    expect(ranges).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      const pos = rangeRead(oms[i], ranges[i]);
      expect(pos, `${oms[i]} on ${ranges[i]}`).not.toBeNull();
      expect(typeof pos).toBe("number");
    }
    // A range in words draws nothing — it is not read as a range.
    expect(rangeRead("5.45%", "varies by submarket")).toBeNull();
  });
});

describe("sector-aware challenger traps", () => {
  it("keeps the two traps every property type shares, for every asset class", () => {
    for (const cls of [
      "multifamily",
      "office",
      "industrial",
      "retail",
      "hospitality_str",
      "self_storage",
      "land_infill",
      "auto",
    ] as const) {
      const p = challengerInstruction(cls);
      expect(p, cls).toContain("taxes NOT reset to the sale price");
      expect(p, cls).toContain("legacy premium");
    }
  });

  it("names the class as a page does, in its own noun and basis — never a stored key", () => {
    const hotel = challengerInstruction("hospitality_str");
    expect(hotel).toContain(
      "The asset class is Hospitality / STR: it is counted in keys and priced per key, and its income is quoted as ADR",
    );
    expect(hotel).not.toContain("hospitality_str");
    expect(challengerInstruction("land_infill")).toContain(
      "it is counted in acres and priced per acre, and it has no operating income",
    );
    expect(challengerInstruction("office")).toContain("it is measured in square feet and priced per SF");
    expect(challengerInstruction("self_storage")).toContain("counted in units and priced per unit and per SF");
  });

  it("grills the multifamily traps only where the class is rental housing", () => {
    for (const cls of ["multifamily", "mixed_use", "student_housing"] as const) {
      expect(challengerInstruction(cls), cls).toContain("loss-to-lease");
    }
    for (const cls of [
      "office",
      "industrial",
      "retail",
      "hospitality_str",
      "self_storage",
      "land_infill",
      "net_lease",
      "senior_housing",
    ] as const) {
      expect(challengerInstruction(cls), cls).not.toContain("loss-to-lease");
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

  it("multifamily carries its own list and no other sector's", () => {
    const p = challengerInstruction("multifamily");
    expect(p).toContain("MULTIFAMILY TRAPS");
    expect(p).not.toContain("WALT");
    expect(p).not.toContain("clear height");
    expect(p).not.toContain("co-tenancy");
    expect(p).not.toContain("REVPAR");
  });

  it("every other class has its own list, by name", () => {
    expect(challengerInstruction("hospitality_str")).toContain("REVPAR IS TWO LEVERS");
    expect(challengerInstruction("self_storage")).toContain("STREET RATE VS IN-PLACE");
    expect(challengerInstruction("manufactured_housing")).toContain("PAD RENT VS HOME RENT");
    expect(challengerInstruction("sfr_btr")).toContain("PER-HOME EXPENSES");
    expect(challengerInstruction("student_housing")).toContain("PRE-LEASING");
    expect(challengerInstruction("senior_housing")).toContain("THE CARE MARGIN");
    // A medical office is an office with an overlay; a mixed-use building
    // is apartments AND retail.
    expect(challengerInstruction("medical_office")).toContain("HEALTH-SYSTEM AFFILIATION");
    expect(challengerInstruction("medical_office")).toContain("WALT");
    expect(challengerInstruction("mixed_use")).toContain("TWO CAP RATES");
    expect(challengerInstruction("mixed_use")).toContain("co-tenancy");
    expect(challengerInstruction("net_lease")).toContain("DARK VALUE");
    expect(challengerInstruction("data_center")).toContain("POWER");
    expect(challengerInstruction("parking")).toContain("OPERATOR AGREEMENT");
    expect(challengerInstruction("land_infill")).toContain("RESIDUAL VALUE");
  });

  it("auto carries every class's list once, gated on what the document turns out to be", () => {
    const p = challengerInstruction("auto");
    expect(p).toContain("whichever asset class the document turns out to be");
    for (const name of [
      "MULTIFAMILY TRAPS",
      "OFFICE-SPECIFIC TRAPS",
      "INDUSTRIAL-SPECIFIC TRAPS",
      "RETAIL-SPECIFIC TRAPS",
      "HOTEL-SPECIFIC TRAPS",
      "SELF-STORAGE TRAPS",
      "MANUFACTURED-HOUSING TRAPS",
      "NET-LEASE TRAPS",
      "LAND TRAPS",
    ]) {
      expect(p).toContain(name);
      // Once each, however many classes share a list.
      expect(p.split(name).length - 1, name).toBe(1);
    }
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

// The market check reads the metro's published figures where the deal sits
// in a covered market (lib/live-market-brief) — handed in AFTER the deal
// context, so the cached document prefix never moves.
describe("market check — the metro's published figures ride last, and only where there are any", () => {
  const brief = "Published figures for the Washington, DC market the deal sits in, read on 2026-09-23.\n- Unemployment 3.4% (Jul 2026, Washington MSA; FRED)";

  it("wraps the figures in <live_market> with the rules for reading them", () => {
    const clause = liveMarketClause(brief);
    expect(clause).toContain(`<live_market>\n${brief}\n</live_market>`);
    expect(clause).toContain("cite the figure with its date in the note");
    expect(clause).toContain(
      "State a metro figure as the metro's and a state figure as the state's (a deal outside the tracked metros is handed its state's figures, and the block says so), never as the submarket's or the building's",
    );
    expect(clause).toContain("a figure narrows the range, it does not replace the OM's own numbers");
  });

  it("nothing to hand over is an empty clause, and the instruction is byte-for-byte the old one", () => {
    expect(liveMarketClause(null)).toBe("");
    expect(liveMarketClause("  ")).toBe("");
    expect(marketCheckInstruction("multifamily", null, null)).toBe(marketCheckInstruction("multifamily"));
    expect(marketCheckInstruction("office", "ctx", "")).toBe(marketCheckInstruction("office", "ctx"));
  });

  it("the figures come after the deal context, and the document-side text before both is unchanged", () => {
    const ctx = "Deal type: Stabilized.";
    const p = marketCheckInstruction("multifamily", ctx, brief);
    const plain = marketCheckInstruction("multifamily", ctx);
    expect(p.startsWith(plain)).toBe(true);
    expect(p.indexOf("<deal_context>")).toBeLessThan(p.indexOf("<live_market>"));
    expect(p).toContain("You do NOT have a live comps feed");
  });
});
