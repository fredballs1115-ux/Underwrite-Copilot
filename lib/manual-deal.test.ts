import { describe, it, expect } from "vitest";
import {
  moneyFrom,
  pctFrom,
  countFrom,
  factsFromForm,
  manualFactsProblem,
  buildManualExtraction,
  factsFromExtraction,
  firstSignalFromExtraction,
  manualFactSheet,
  manualCompsStub,
  NOTES_MAX,
  type ManualDealFacts,
} from "./manual-deal";
import { evaluateBuyBox, findMetric, METRIC_FIND } from "./criteria";
import { scoreMandateFit } from "./mandate";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import { computeUnderwrite } from "./underwrite/engine";

/** A realistic dated quadplex — the kind of listing this feature exists for. */
const QUAD: ManualDealFacts = {
  name: "4-unit on Maple St",
  assetClass: "multifamily",
  market: "Woodbridge, VA",
  address: "123 Maple St, Woodbridge, VA 22191",
  price: 1_250_000,
  capPct: 6.2,
  noiAnnual: null, // derivable: 77,500
  units: 4,
  sf: 3_600,
  occupancyPct: 100,
  yearBuilt: 1968,
  avgRentMo: 1_450,
  notes: "Original 1968 interiors, all four units month-to-month, roof 2019.",
};

describe("parsers", () => {
  it("moneyFrom reads plain, formatted, and suffixed amounts", () => {
    expect(moneyFrom("1,250,000")).toBe(1_250_000);
    expect(moneyFrom("$1.25m")).toBe(1_250_000);
    expect(moneyFrom("950k")).toBe(950_000);
    expect(moneyFrom("")).toBeNull();
    expect(moneyFrom("call for pricing")).toBeNull();
  });

  it("pctFrom reads percent points and decimal shares alike", () => {
    expect(pctFrom("5.75")).toBe(5.75);
    expect(pctFrom("5.75%")).toBe(5.75);
    expect(pctFrom("0.0575")).toBeCloseTo(5.75, 10);
    expect(pctFrom("94")).toBe(94);
    expect(pctFrom("")).toBeNull();
    expect(pctFrom("0")).toBeNull();
  });

  it("countFrom reads bare and suffixed counts", () => {
    expect(countFrom("4")).toBe(4);
    expect(countFrom("4 units")).toBe(4);
    expect(countFrom("")).toBeNull();
  });

  it("factsFromForm reads a FormData-shaped bag", () => {
    const form = new Map<string, string>([
      ["name", "  Test Deal  "],
      ["assetClass", "multifamily"],
      ["price", "1.25m"],
      ["cap", "6.2"],
      ["units", "4"],
      ["notes", "MTM tenants"],
    ]);
    const facts = factsFromForm(form);
    expect(facts.name).toBe("Test Deal");
    expect(facts.price).toBe(1_250_000);
    expect(facts.capPct).toBe(6.2);
    expect(facts.units).toBe(4);
    expect(facts.noiAnnual).toBeNull();
    expect(facts.notes).toBe("MTM tenants");
  });

  it("notes accept a full page of context, capped at NOTES_MAX", () => {
    const long = "x".repeat(NOTES_MAX + 500);
    const facts = factsFromForm(new Map([["name", "N"], ["notes", long]]));
    expect(facts.notes.length).toBe(NOTES_MAX);
    expect(NOTES_MAX).toBeGreaterThanOrEqual(4_000);
  });
});

describe("manualFactsProblem — the 'enough information' gate", () => {
  it("requires a name", () => {
    expect(manualFactsProblem({ ...QUAD, name: "" })).toMatch(/name/i);
  });
  it("requires a price, or NOI + cap to derive one", () => {
    const bare = { ...QUAD, price: null, noiAnnual: null, capPct: null };
    expect(manualFactsProblem(bare)).toMatch(/asking price/i);
    expect(manualFactsProblem({ ...bare, noiAnnual: 77_500 })).toMatch(/asking price/i);
    expect(manualFactsProblem({ ...bare, noiAnnual: 77_500, capPct: 6.2 })).toBeNull();
    expect(manualFactsProblem({ ...QUAD, capPct: null })).toBeNull();
  });
});

describe("buildManualExtraction", () => {
  it("completes the price/cap/NOI triangle from any two sides", () => {
    const fromPriceCap = buildManualExtraction(QUAD);
    const noi = fromPriceCap.metrics.find((m) => /net operating income/i.test(m.label));
    expect(noi?.value).toBe("$77,500");

    const fromNoiCap = buildManualExtraction({
      ...QUAD,
      price: null,
      noiAnnual: 77_500,
    });
    const price = fromNoiCap.metrics.find((m) => m.label === "Asking price");
    expect(price?.value).toBe("$1,250,000");

    const fromPriceNoi = buildManualExtraction({
      ...QUAD,
      capPct: null,
      noiAnnual: 77_500,
    });
    const cap = fromPriceNoi.metrics.find((m) => m.label === "Going-in cap rate");
    expect(cap?.value).toBe("6.2%");
  });

  it("never flags a metric and never fabricates a page", () => {
    const ex = buildManualExtraction(QUAD);
    expect(ex.metrics.length).toBeGreaterThan(5);
    for (const m of ex.metrics) {
      expect(m.flagged).toBe(false);
      expect(m.page).toBe("");
    }
    expect(ex.totalPages).toBe(0);
  });

  // THE load-bearing contract: the labels must keep matching the shared
  // metric matchers, or manual deals silently vanish from the buy box,
  // the pipeline columns, and the workbook.
  it("labels match METRIC_FIND (buy box + mandate score read them)", () => {
    const { metrics } = buildManualExtraction(QUAD);
    expect(
      findMetric(metrics, METRIC_FIND.price.inc, METRIC_FIND.price.exc)?.value,
    ).toBe("$1,250,000");
    expect(findMetric(metrics, METRIC_FIND.goingInCap.inc)?.value).toBe("6.2%");
    expect(findMetric(metrics, METRIC_FIND.perUnit.inc)?.value).toBe(
      "$312,500/unit",
    );
    expect(
      findMetric(metrics, METRIC_FIND.sf.inc, METRIC_FIND.sf.exc)?.value,
    ).toBe("3,600 SF");
  });

  it("notes ride as buyerNotes prose, never a metric — no matcher surface", () => {
    const ex = buildManualExtraction({
      ...QUAD,
      notes: "price per sf cap rate noi square feet units", // worst-case text
    });
    expect(ex.buyerNotes).toBe("price per sf cap rate noi square feet units");
    expect(ex.metrics.some((m) => /context/i.test(m.label))).toBe(false);
    // Figures stay exactly where the matchers expect them.
    expect(
      findMetric(ex.metrics, METRIC_FIND.price.inc, METRIC_FIND.price.exc)?.value,
    ).toBe("$1,250,000");
    expect(
      findMetric(ex.metrics, METRIC_FIND.sf.inc, METRIC_FIND.sf.exc)?.value,
    ).toBe("3,600 SF");
  });

  it("feeds the workbook: derive anchors on the typed price and NOI exactly", () => {
    const ex = buildManualExtraction(QUAD);
    const derived = deriveUnderwriteInputs(ex, QUAD.name);
    expect(derived.inputs.purchasePrice).toBe(1_250_000);
    expect(derived.sources.purchasePrice?.provenance).toBe("extracted");
    expect(derived.inputs.rsf).toBe(3_600);
    expect(derived.inputs.exitCapPct).toBeCloseTo(0.062, 10);
    expect(derived.meta.occupancyPct).toBeCloseTo(1.0, 10);
    // The engine's year-1 NOI must tie to the typed (derived) NOI.
    const yr1 = computeUnderwrite(derived.inputs).cashFlow[0];
    expect(yr1.noi).toBeCloseTo(77_500, 0);
  });

  it("clears a matching buy box and trips a mismatched one", () => {
    const ex = buildManualExtraction(QUAD);
    const good = evaluateBuyBox("multifamily", ex, {
      assetClasses: ["multifamily"],
      priceMaxM: 2,
      minCapPct: 5.5,
      maxPerUnitK: 400,
      geos: [{ label: "Woodbridge, VA", city: "Woodbridge", state: "VA" }],
    });
    expect(good.every((c) => c.status === "pass")).toBe(true);

    const tight = evaluateBuyBox("multifamily", ex, { minCapPct: 7.5 });
    expect(tight[0].status).toBe("miss");

    const score = scoreMandateFit("multifamily", ex, {
      assetClasses: ["multifamily"],
      priceMaxM: 2,
      minCapPct: 5.5,
    });
    expect(score.score).toBeGreaterThanOrEqual(75);
  });

  it("round-trips through factsFromExtraction for the edit form", () => {
    const ex = buildManualExtraction(QUAD);
    const back = factsFromExtraction(ex, "fallback");
    expect(back.name).toBe(QUAD.name);
    expect(back.price).toBe(1_250_000);
    expect(back.capPct).toBeCloseTo(6.2, 10);
    expect(back.noiAnnual).toBe(77_500);
    expect(back.units).toBe(4);
    expect(back.sf).toBe(3_600);
    expect(back.occupancyPct).toBe(100);
    expect(back.yearBuilt).toBe(1968);
    expect(back.avgRentMo).toBe(1_450);
    expect(back.notes).toBe(QUAD.notes);
  });

  it("still reads notes off a legacy extraction that stored them as a metric", () => {
    const legacy = buildManualExtraction({ ...QUAD, notes: "" });
    legacy.metrics.push({
      label: "Context from the buyer",
      value: "roof 2019, tenants MTM",
      flagged: false,
      page: "",
      basis: "na",
    });
    expect(factsFromExtraction(legacy, "x").notes).toBe("roof 2019, tenants MTM");
  });
});

describe("pipeline artifacts", () => {
  it("firstSignalFromExtraction formats the instant headline", () => {
    const sig = firstSignalFromExtraction(buildManualExtraction(QUAD));
    expect(sig.dealName).toBe(QUAD.name);
    expect(sig.askPrice).toBe("$1,250,000");
    expect(sig.goingInCap).toBe("6.2%");
    expect(sig.size).toBe("4 units");
    expect(sig.perUnit).toBe("$312,500/unit");
    expect(sig.take).toMatch(/no OM/i);
  });

  it("manualFactSheet carries the framing and every fact", () => {
    const ex = buildManualExtraction(QUAD);
    const sheet = manualFactSheet(ex, "fallback");
    expect(sheet).toMatch(/no offering memorandum/i);
    expect(sheet).toMatch(/never cite a page/i);
    expect(sheet).toContain("Asking price: $1,250,000");
    expect(sheet).toContain("Woodbridge, VA");
    expect(sheet).toContain(QUAD.notes);
  });

  it("manualCompsStub is a valid empty comps result", () => {
    const stub = manualCompsStub();
    expect(stub.saleComps).toEqual([]);
    expect(stub.leaseComps).toEqual([]);
    expect(stub.redFlags).toEqual([]);
    expect(stub.summary).toMatch(/entered by hand/i);
  });
});
