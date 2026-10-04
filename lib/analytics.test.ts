import { describe, expect, it } from "vitest";
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";
import {
  deriveAnalytics,
  fmtUsdCompact,
  median,
  middleRead,
  middleText,
  parsedPhrase,
  stageCountLine,
  stageCounts,
  type AnalyticsRow,
} from "./analytics";
import { MEDIAN_FLOOR } from "./public-comps/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const metric = (label: string, value: string): ExtractedMetric => ({
  label,
  value,
  flagged: false,
  page: "",
});

const row = (
  id: string,
  name: string,
  extraction: unknown,
  over: Partial<AnalyticsRow> = {},
): AnalyticsRow => ({
  id,
  name,
  asset_class: "multifamily",
  created_at: `2026-09-0${id}T12:00:00Z`,
  is_sample: false,
  stage: "screening",
  verdict: { verdict: "pass" },
  extraction,
  ...over,
});

const STABILIZED: ExtractionResult = {
  dealName: "Maddox Apartments",
  assetClass: "multifamily",
  market: "Dallas, TX",
  address: "1 Maddox Way, Dallas, TX",
  metrics: [
    metric("Asking price", "$50,000,000"),
    metric("Going-in cap rate", "5.70%"),
    metric("NOI (in-place)", "$2,850,000"),
    metric("NOI (stabilized, pro forma)", "$3,300,000"),
    metric("Units", "248"),
  ],
};

/** The deal that started this: a $20M office shell whose OM states the
 *  finished residential building's $21M NOI and an 11.7% stabilized cap. */
const CONVERSION: ExtractionResult = {
  dealName: "1200 K Street — Office-to-Residential Conversion",
  assetClass: "multifamily",
  market: "Washington, DC",
  address: "1200 K St NW, Washington, DC",
  strategy: {
    kind: "conversion",
    summary: "Convert a vacant office building into 612 apartments.",
    capitalBudget: "",
    timeline: "30 months",
  },
  metrics: [
    metric("Purchase price", "$20,000,000"),
    metric("Stabilized NOI (pro forma)", "$21,000,000"),
    metric("Stabilized cap rate", "11.7%"),
    metric("Total project cost", "$180,000,000"),
    metric("Units (proposed)", "612"),
  ],
};

describe("deriveAnalytics — the deal's kind is read first", () => {
  const deals = deriveAnalytics([
    row("1", "Maddox", STABILIZED),
    row("2", "1200 K", CONVERSION),
    row("3", "Sample", STABILIZED, { is_sample: true }),
  ]);

  it("a stabilized asset carries its going-in cap and its price per unit", () => {
    const d = deals.find((x) => x.id === "1")!;
    expect(d.kind).toBe("stabilized");
    expect(d.capPct).toBeCloseTo(5.7, 5);
    expect(d.yieldOnCostPct).toBeNull();
    expect(d.perUnit).toBeCloseTo(50_000_000 / 248, 3);
    expect(d.price).toBe(50_000_000);
  });

  it("a conversion has no going-in cap — its 11.7% is a yield on cost, never a cap point", () => {
    const d = deals.find((x) => x.id === "2")!;
    expect(d.kind).toBe("conversion");
    expect(d.capPct).toBeNull();
    expect(d.yieldOnCostPct).toBeCloseTo((21 / 180) * 100, 3);
    expect(d.price).toBe(20_000_000);
  });

  it("a plan deal's basis per unit is total cost over the planned units, not the shell's price", () => {
    const d = deals.find((x) => x.id === "2")!;
    expect(d.perUnit).toBeCloseTo(180_000_000 / 612, 3);
    expect(d.perUnit).not.toBeCloseTo(20_000_000 / 612, 0);
  });

  it("the sample deal never counts, and the series reads oldest to newest", () => {
    expect(deals.map((d) => d.id)).toEqual(["1", "2"]);
  });

  it("the cap median is a median of going-in caps only", () => {
    const caps = deals.map((d) => d.capPct).filter((v): v is number => v != null);
    expect(median(caps)).toBeCloseTo(5.7, 5);
  });
});

describe("deriveAnalytics — no pro forma figure ever fills the cap slot", () => {
  it("a pro forma cap or a yield on cost on an operating asset is not a going-in cap", () => {
    const [d] = deriveAnalytics([
      row("4", "Pro forma only", {
        ...STABILIZED,
        metrics: [
          metric("Asking price", "$50,000,000"),
          metric("Pro forma cap rate", "6.50%"),
          metric("Yield on cost", "8.0%"),
        ],
      }),
    ]);
    expect(d.kind).toBe("stabilized");
    expect(d.capPct).toBeNull();
  });

  it("a development's price is its land cost when the OM states no asking price", () => {
    const [d] = deriveAnalytics([
      row("5", "Ground-up", {
        ...STABILIZED,
        dealName: "Riverside — ground-up development site, fully entitled",
        metrics: [
          metric("Land cost", "$12,000,000"),
          metric("Stabilized NOI (pro forma)", "$9,000,000"),
          metric("Total development cost", "$120,000,000"),
        ],
      }),
    ]);
    expect(d.kind).toBe("development");
    expect(d.price).toBe(12_000_000);
    expect(d.capPct).toBeNull();
    expect(d.yieldOnCostPct).toBeCloseTo(7.5, 5);
  });
});

describe("deriveAnalytics — rows saved before the fields existed", () => {
  it("an extraction with no metrics array does not throw and reads as unknown", () => {
    const [d] = deriveAnalytics([
      row("6", "Old deal", { dealName: "Old deal", assetClass: "office" }),
    ]);
    expect(d.kind).toBe("unknown");
    expect(d.capPct).toBeNull();
    expect(d.yieldOnCostPct).toBeNull();
    expect(d.perUnit).toBeNull();
    expect(d.assetClass).toBe("office");
  });

  it("a null extraction is skipped", () => {
    expect(deriveAnalytics([row("7", "Nothing", null)])).toEqual([]);
  });
});

describe("deriveAnalytics — the $/unit series is multifamily's, never a pool of bases", () => {
  it("a hotel's price per key and an office's per suite never plot as a price per unit", () => {
    const deals = deriveAnalytics([
      row("1", "Maddox", STABILIZED),
      row("2", "Harbor Inn", { ...STABILIZED, assetClass: "hotel", metrics: [metric("Asking price", "$48,000,000"), metric("Keys", "180 keys")] }, { asset_class: "hotel" }),
      row("3", "Tysons Plaza", { ...STABILIZED, assetClass: "office", metrics: [metric("Asking price", "$42,000,000"), metric("Suites", "24"), metric("Total SF", "310,000 SF")] }, { asset_class: "office" }),
      row("4", "1200 K", CONVERSION),
    ]);
    expect(deals.find((d) => d.id === "1")?.perUnit).toBeCloseTo(50_000_000 / 248, 3);
    expect(deals.find((d) => d.id === "2")?.perUnit).toBeNull();
    expect(deals.find((d) => d.id === "3")?.perUnit).toBeNull();
    // A multifamily plan deal keeps its all-in basis per planned unit.
    expect(deals.find((d) => d.id === "4")?.perUnit).toBeCloseTo(180_000_000 / 612, 3);
    const units = deals.map((d) => d.perUnit).filter((v): v is number => v != null);
    expect(median(units)).toBeCloseTo((50_000_000 / 248 + 180_000_000 / 612) / 2, 3);
  });
});

describe("deriveAnalytics — the deal's one class, filed by its words (lib/asset-words dealClassKey)", () => {
  it("a deck's 'Garden-style multifamily' plots on the price-per-unit chart, the analyst's class read first", () => {
    const deals = deriveAnalytics([
      row("1", "Garden Court", { ...STABILIZED, assetClass: "Garden-style multifamily" }, { asset_class: "auto" }),
      // Filed multifamily by the analyst; the deck called it something else.
      row("2", "Filed", { ...STABILIZED, assetClass: "Mixed-use" }, { asset_class: "multifamily" }),
      // Filed an office: no price per unit, whatever the deck says.
      row("3", "Tysons", { ...STABILIZED, assetClass: "Apartments" }, { asset_class: "office" }),
    ]);
    expect(deals.find((d) => d.id === "1")?.perUnit).toBeCloseTo(50_000_000 / 248, 3);
    expect(deals.find((d) => d.id === "2")?.perUnit).toBeCloseTo(50_000_000 / 248, 3);
    expect(deals.find((d) => d.id === "3")?.perUnit).toBeNull();
  });
});

describe("middleRead — a median needs three figures (the site's MEDIAN_FLOOR)", () => {
  const pct = (v: number) => `${v.toFixed(1)}%`;

  it("reads the floor from lib/public-comps, never a copy of it", () => {
    expect(MEDIAN_FLOOR).toBe(3);
  });

  it("three figures or more are a median", () => {
    const r = middleRead([5.4, 5.0, 6.1]);
    expect(r).toEqual({ kind: "median", n: 3, value: 5.4 });
    expect(middleText(r, pct)).toBe("5.4%");
    expect(middleRead([5.0, 5.2, 5.6, 6.0])).toEqual({ kind: "median", n: 4, value: 5.4 });
  });

  it("one figure is that deal's, never a median", () => {
    const r = middleRead([5.2]);
    expect(r).toEqual({ kind: "one", n: 1, value: 5.2 });
    expect(middleText(r, pct)).toBe("5.2%");
  });

  it("two figures are the two, low and high — never their midpoint called a median", () => {
    const r = middleRead([5.4, 5.0]);
    expect(r).toEqual({ kind: "two", n: 2, low: 5.0, high: 5.4 });
    expect(middleText(r, pct)).toBe("5.0%–5.4%");
    expect(middleText(middleRead([240_000, 215_000]), fmtUsdCompact)).toBe("$215k–$240k");
    // Two that agree print once.
    expect(middleText(middleRead([5.2, 5.2]), pct)).toBe("5.2%");
  });

  it("nothing is nothing, and a value that is not a number is not a figure", () => {
    expect(middleRead([])).toEqual({ kind: "none", n: 0 });
    expect(middleText(middleRead([]), pct)).toBeNull();
    expect(middleRead([Number.NaN, 5.2])).toEqual({ kind: "one", n: 1, value: 5.2 });
  });

  it("says the count behind a read as what it is — never '1 deals'", () => {
    expect(parsedPhrase(0)).toBe("none parsed");
    expect(parsedPhrase(1)).toBe("the one deal that parsed");
    expect(parsedPhrase(2)).toBe("the two deals that parsed");
    expect(parsedPhrase(7)).toBe("7 deals parsed");
  });
});

describe("stageCounts — a closed deal is neither live nor dead", () => {
  it("counts the deals still in play as live, the closed as closed, the dead as dead", () => {
    const deals = deriveAnalytics([
      row("1", "Maddox", STABILIZED),
      row("2", "Harbor View", STABILIZED, { stage: "under_contract" }),
      row("3", "Elm Street Lofts", STABILIZED, { stage: "closed" }),
      row("4", "Tysons Plaza", STABILIZED, { stage: "dead" }),
      // A legacy stage folds onto the ladder (lib/stages) and is in play.
      row("5", "Old row", STABILIZED, { stage: "pursuing" }),
    ]);
    expect(stageCounts(deals)).toEqual({ live: 3, closed: 1, dead: 1 });
    expect(stageCountLine(stageCounts(deals))).toBe("3 live · 1 closed · 1 dead");
    // No closed deal, no closed count.
    expect(stageCountLine({ live: 4, closed: 0, dead: 2 })).toBe("4 live · 2 dead");
    expect(stageCountLine(stageCounts([]))).toBe("0 live · 0 dead");
  });

  it("the analytics page prints its tile and its funnel's caption through them, never its own live filter", () => {
    const page = readFileSync(join(__dirname, "..", "app/(app)/analytics/page.tsx"), "utf8");
    expect(page).toContain("stageCountLine(counts)");
    expect(page).toContain("stageCounts(deals)");
    expect(page).not.toMatch(/stage\s*!==\s*"dead"/);
  });
});
