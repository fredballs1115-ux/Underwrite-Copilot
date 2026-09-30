import { describe, expect, it } from "vitest";
import type { ExtractedAffordability, ExtractionResult } from "@/lib/anthropic/types";
import {
  affordableContextLine,
  affordableNote,
  affordableShortLine,
  affordableTag,
  affordableTermRows,
  amiPctOf,
  readAffordable,
  sharePctText,
} from "./affordable";
import { unitCountFromMetrics } from "./criteria";
import { gluedWords } from "./render-lint";
import { extractionInstruction } from "./anthropic/prompts";

// Every read is on one day, so every "years from today" is fixed.
const TODAY = new Date(Date.UTC(2026, 8, 30));

const affordable = (over: Partial<ExtractedAffordability>): ExtractedAffordability => ({
  programs: [],
  summary: "",
  agreement: "",
  assistance: "",
  tiers: [],
  page: "",
  ...over,
});

type Row = ExtractionResult["metrics"][number];
const row = (label: string, value: string, page = ""): Row => ({ label, value, flagged: false, page, basis: "na" });

const ex = (a: ExtractedAffordability | undefined, metrics: Row[] = [], units = "240"): ExtractionResult => ({
  dealName: "Maple Court",
  assetClass: "multifamily",
  affordable: a,
  totalPages: 60,
  metrics: [row("Asking price", "$38,000,000", "p. 2"), ...(units ? [row("Units", units, "p. 2")] : []), ...metrics],
});

/** The Maple Court fixture: a LIHTC building with a Section 8 contract on
 *  part of it, the way a memorandum's affordability page lays one out. */
const MAPLE = ex(
  affordable({
    programs: ["section8", "lihtc"],
    summary: "A 2011 LIHTC property with a project-based Section 8 contract on 82 units.",
    agreement: "Extended Use Agreement with the state housing finance agency; 180 units at or below 60% AMI",
    assistance: "Project-based HAP contract on 82 units, renewed in 2019 for twenty years",
    tiers: [
      { label: "50% AMI", units: "60", rent: "$1,020", maxRent: "$1,090" },
      { label: "60% AMI", units: "120", rent: "$1,310", maxRent: "$1,310" },
      { label: "Market", units: "60", rent: "$1,657", maxRent: "" },
    ],
    page: "p. 14",
  }),
  [
    row("Restricted units", "180 (75%)", "p. 14"),
    row("Market-rate units", "60", "p. 14"),
    row("Units under HAP contract", "82", "p. 15"),
    row("Affordability expiration", "December 31, 2054", "p. 14"),
    row("Compliance period end", "2025", "p. 14"),
    row("HAP contract expiration", "June 30, 2029", "p. 15"),
  ],
);

describe("amiPctOf — the income limit a tier's label states", () => {
  it("reads the share of the area median, however the memorandum writes it", () => {
    expect(amiPctOf("60% AMI")).toBe(60);
    expect(amiPctOf("at or below 50% of AMI")).toBe(50);
    expect(amiPctOf("30% of area median income")).toBe(30);
    expect(amiPctOf("80% MFI")).toBe(80);
    expect(amiPctOf("AMI ≤ 80%")).toBe(80);
    expect(amiPctOf("120% AMI workforce")).toBe(120);
  });

  it("reads nothing it cannot be sure of", () => {
    expect(amiPctOf("Market")).toBeNull();
    expect(amiPctOf("Section 8")).toBeNull();
    expect(amiPctOf("60%")).toBeNull(); // a share of what?
    expect(amiPctOf("5% AMI")).toBeNull();
    expect(amiPctOf("")).toBeNull();
  });
});

describe("sharePctText — a share never rounded to all or none it is not", () => {
  it("keeps 239 of 240 under 100% and 1 of 240 over 0%", () => {
    expect(sharePctText((239 / 240) * 100)).toBe("99%");
    expect(sharePctText((1 / 240) * 100)).toBe("1%");
    expect(sharePctText(100)).toBe("100%");
    expect(sharePctText(75)).toBe("75%");
  });
});

describe("readAffordable — what a restricted building is", () => {
  it("is nothing on a market-rate deal, an older extraction or marketing words", () => {
    expect(readAffordable(ex(undefined), TODAY)).toBeNull();
    expect(readAffordable(ex(affordable({})), TODAY)).toBeNull();
    // "0 affordable units" is a market-rate building.
    expect(readAffordable(ex(affordable({}), [row("Affordable units", "0")]), TODAY)).toBeNull();
    expect(readAffordable(null, TODAY)).toBeNull();
  });

  it("reads the counts, the share, the tiers and the three clocks", () => {
    const r = readAffordable(MAPLE, TODAY)!;
    expect(r.programs).toEqual(["lihtc", "section8"]);
    expect(r.label).toBe("Housing tax credits (LIHTC) · Section 8 HAP contract");
    expect(r.page).toBe("p. 14");
    expect(r.totalUnits).toBe(240);
    expect(r.restrictedUnits).toBe(180);
    expect(r.marketUnits).toBe(60);
    expect(r.assistedUnits).toBe(82);
    expect(r.restrictedSharePct).toBe(75);
    expect(r.countsDisagree).toBe(false);
    expect(r.hapOnly).toBe(false);
    expect(r.restrictionEnds).toMatchObject({ ends: "2054-12-31", from: "date", page: "p. 14" });
    expect(r.restrictionEnds!.yearsLeft).toBeCloseTo(28.25, 1);
    // A year alone: the compliance period's last day, the HAP contract's first.
    expect(r.complianceEnds).toMatchObject({ ends: "2025-12-31", from: "year" });
    expect(r.hapEnds).toMatchObject({ ends: "2029-06-30", from: "date" });
    expect(r.tiers.map((t) => [t.label, t.kind, t.amiPct, t.units, t.headroom])).toEqual([
      ["50% AMI", "restricted", 50, 60, 70],
      ["60% AMI", "restricted", 60, 120, 0],
      ["Market", "market", null, 60, null],
    ]);
  });

  it("says the restriction, the contract and the compliance period in one lead", () => {
    const r = readAffordable(MAPLE, TODAY)!;
    expect(r.headline).toContain(
      "This is an affordable-housing deal: 180 of the 240 units (75%) are rent-restricted under a LIHTC regulatory agreement until Dec 2054, 28.3 years from today.",
    );
    expect(r.headline).toContain("move with HUD's published income limits, not with the market");
    expect(r.headline).toContain("the restriction's cost, not loss to lease");
    expect(r.headline).toContain("82 of the 240 units carry a Section 8 HAP contract that expires Jun 2029, 2.8 years from today.");
    expect(r.headline).toContain("at renewal HUD brings contract rents above market down to market");
    expect(r.headline).toContain(
      "The credits' compliance period ended in 2025; the rent limits did not — they run to Dec 2054 under the extended-use agreement.",
    );
    expect(gluedWords(r.headline)).toEqual([]);
  });

  it("says each tier against its limit, and the market gap on the memorandum's own averages", () => {
    const r = readAffordable(MAPLE, TODAY)!;
    expect(r.tierLines).toEqual([
      "50% AMI (60 units): $1,020 a month against the $1,090 limit the memorandum states — $70 of headroom; past it, its rents grow only as the limits do.",
      "60% AMI (120 units): $1,310 a month, at the $1,310 limit the memorandum states — its rents grow only as the limits do.",
    ]);
    // (60 × 1,020 + 120 × 1,310) / 180 = 1,213.33; 1,657 − 1,213.33 = 443.67
    // a month, × 180 × 12 = $958k a year.
    expect(r.gapLine).toBe(
      "The restricted units average $1,213 a month and the market-rate units $1,657, on the memorandum's own averages, which blend unit types — $444 a month apart, about $958k a year across the 180 restricted units that the restriction holds back until Dec 2054.",
    );
    expect(affordableContextLine(r)).toContain("$444 a month apart");
  });

  it("says a rent over its limit is a compliance finding, not income", () => {
    const r = readAffordable(
      ex(affordable({ programs: ["lihtc"], tiers: [{ label: "50% AMI", units: "40", rent: "$1,150", maxRent: "$1,090" }] })),
      TODAY,
    )!;
    expect(r.tiers[0].headroom).toBe(-60);
    expect(r.tierLines[0]).toBe(
      "50% AMI (40 units): the $1,150 rent is over the $1,090 limit the memorandum states — a rent over the limit is a compliance finding, not income.",
    );
  });

  it("says what the model is not: one growth rate across restricted and market units", () => {
    const r = readAffordable(MAPLE, TODAY)!;
    expect(r.modelCaveat).toContain(
      "Here 75% of them are capped by the restriction until Dec 2054 and move with HUD's published income limits — read its rent growth as the 60 market-rate units' and hold the restricted units to the limits.",
    );
    expect(r.modelCaveat).toContain("Between renewals a HAP contract's rents move by HUD's annual operating-cost factor");
  });

  it("reads the whole building restricted as the limits' growth, not the market's", () => {
    const r = readAffordable(
      ex(affordable({ programs: ["lihtc"] }), [row("Restricted units", "240"), row("LURA expiration", "2056")]),
      TODAY,
    )!;
    expect(r.headline).toContain("All 240 units are rent-restricted under a LIHTC regulatory agreement until the end of 2056, 30.3 years from today.");
    expect(r.restrictionEnds).toMatchObject({ ends: "2056-12-31", from: "year" });
    expect(r.modelCaveat).toContain("here every unit's rent is capped by the restriction until 2056 — its rent growth is the limits' growth on this deal, not the market's");
    expect(affordableTag(ex(affordable({ programs: ["lihtc"] }), [row("Restricted units", "240")]))).toBe("LIHTC, 100% restricted");
  });

  it("reads a HAP contract alone as the contract's, said once", () => {
    const hap = ex(affordable({ programs: ["section8"] }), [row("Section 8 units", "82"), row("HAP contract expiration", "2029")]);
    const r = readAffordable(hap, TODAY)!;
    expect(r.hapOnly).toBe(true);
    expect(r.restrictedUnits).toBe(82);
    // The year alone, read on its first day: the subsidy is never counted for
    // months it may not run.
    expect(r.hapEnds).toMatchObject({ ends: "2029-01-01", from: "year" });
    expect(r.headline).toMatch(/^This is an affordable-housing deal: 82 of the 240 units carry a Section 8 HAP contract that expires in 2029, 2\.3 years from today\./);
    expect(r.headline).not.toContain("rent-restricted");
    expect(affordableTag(hap)).toBe("Section 8, 34% of units");
    expect(affordableShortLine(r)).toBe("Affordable housing: 82 of 240 units under a Section 8 HAP contract to 2029");
  });

  it("keeps a term counted from a start as stated rather than adding it up", () => {
    const r = readAffordable(
      ex(affordable({ programs: ["lihtc"] }), [row("Restricted units", "120"), row("Affordability period", "30 years from placed in service (2011)")]),
      TODAY,
    )!;
    // 2011 is when the term began, not when it ends.
    expect(r.restrictionEnds).toBeNull();
    expect(r.unreadEnds).toEqual(["The restriction's term as stated: 30 years from placed in service (2011)"]);
    expect(r.headline).toContain('for a term the memorandum states as "30 years from placed in service (2011)" rather than as a date it ends');
  });

  it("says a stated end that has passed, rather than counting negative years", () => {
    const r = readAffordable(ex(affordable({ programs: ["bond"] }), [row("Restricted units", "48"), row("Regulatory agreement term", "Through 2024")]), TODAY)!;
    expect(r.restrictionEnds!.yearsLeft).toBeLessThan(0);
    expect(r.headline).toContain("its stated end, 2024, has passed: check whether it was extended, or the building released");
    expect(affordableShortLine(r)).toContain("(its stated end has passed)");
  });

  it("says counts that cannot all be true, and reads no share off them", () => {
    const r = readAffordable(ex(affordable({ programs: ["lihtc"] }), [row("Restricted units", "250")]), TODAY)!;
    expect(r.countsDisagree).toBe(true);
    expect(r.restrictedSharePct).toBeNull();
    expect(r.headline).toContain("The memorandum's counts do not agree — 250 restricted against 240 units in all; check the rent roll before any share is read.");
    expect(affordableTag(ex(affordable({ programs: ["lihtc"] }), [row("Restricted units", "250")]))).toBe("LIHTC");
  });

  it("sums the tiers only when every tier states its units", () => {
    const partial = readAffordable(
      ex(affordable({
        programs: ["inclusionary"],
        tiers: [
          { label: "80% AMI", units: "20", rent: "", maxRent: "" },
          { label: "60% AMI", units: "", rent: "", maxRent: "" },
        ],
      })),
      TODAY,
    )!;
    expect(partial.restrictedUnits).toBeNull();
    const whole = readAffordable(
      ex(affordable({
        programs: ["inclusionary"],
        tiers: [
          { label: "80% AMI", units: "20", rent: "", maxRent: "" },
          { label: "60% AMI", units: "10", rent: "", maxRent: "" },
        ],
      })),
      TODAY,
    )!;
    expect(whole.restrictedUnits).toBe(30);
    expect(whole.restrictedSharePct).toBeCloseTo(12.5, 5);
    // A city's covenant sets its own limits, said as such.
    expect(whole.headline).toContain("move with the area median income the covenant sets them from");
    expect(affordableTag(ex(affordable({ programs: ["inclusionary"] }), [row("Affordable units", "30")]))).toBe("Affordable, 13% restricted");
  });

  it("never reads a restricted count as the building's unit count", () => {
    expect(unitCountFromMetrics(MAPLE.metrics)).toBe(240);
    const noTotal = ex(affordable({ programs: ["lihtc"] }), [row("Restricted units", "180")], "");
    expect(unitCountFromMetrics(noTotal.metrics)).toBeNull();
    const r = readAffordable(noTotal, TODAY)!;
    expect(r.totalUnits).toBeNull();
    expect(r.restrictedSharePct).toBeNull();
    expect(r.headline).toContain("This is an affordable-housing deal: 180 units are rent-restricted under a LIHTC regulatory agreement");
  });
});

describe("wherever the deal is summarized", () => {
  it("tags the pipeline row with the program and the share", () => {
    expect(affordableTag(MAPLE)).toBe("LIHTC + Section 8, 75% restricted");
    expect(affordableTag(ex(undefined))).toBeNull();
  });

  it("puts the restriction and the contract in one line for the memo and the workbook", () => {
    expect(affordableShortLine(readAffordable(MAPLE, TODAY)!)).toBe(
      "Affordable housing: 180 of 240 units (75%) rent-restricted under LIHTC until Dec 2054; 82 under a Section 8 HAP contract to Jun 2029",
    );
  });

  it("hands every later step the facts, and the challenger each program's traps by name", () => {
    const r = readAffordable(MAPLE, TODAY)!;
    const context = affordableContextLine(r);
    expect(context).toMatch(/^Affordability: This is an affordable-housing deal:/);
    expect(context).toContain("The regulatory agreement as stated: Extended Use Agreement with the state housing finance agency; 180 units at or below 60% AMI.");
    expect(context).toContain("The rental assistance as stated: Project-based HAP contract on 82 units, renewed in 2019 for twenty years.");
    expect(context).toContain("60% AMI (120 units): $1,310 a month, at the $1,310 limit");
    const note = affordableNote(r);
    expect(note).toContain("LIHTC TRAPS, checked by name");
    expect(note).toContain("(c) THE VALUE-ADD — a renovation premium on a restricted unit is capped by the limit");
    expect(note).toContain("SECTION 8 TRAPS, checked by name");
    expect(note).not.toContain("INCLUSIONARY TRAPS");
    expect(gluedWords(note)).toEqual([]);
  });

  it("leads a key-terms block with the restriction's own rows", () => {
    expect(affordableTermRows(MAPLE.metrics).map((m) => m.label)).toEqual([
      "Restricted units",
      "Affordability expiration",
      "Units under HAP contract",
      "HAP contract expiration",
    ]);
    // A compliance period, a share or a rent is not an end or a count.
    expect(
      affordableTermRows([row("Compliance period end", "2025"), row("Affordable units (%)", "75%"), row("Restricted unit rent", "$1,310")]),
    ).toEqual([]);
  });

  it("asks the extraction for exactly the rows the reader reads", () => {
    const prompt = extractionInstruction("multifamily");
    for (const label of [
      "Restricted units",
      "Market-rate units",
      "Units under HAP contract",
      "Affordability expiration",
      "Compliance period end",
      "HAP contract expiration",
    ]) {
      expect(prompt).toContain(`"${label}"`);
      const r = readAffordable(ex(affordable({ programs: ["lihtc", "section8"] }), [row(label, /units/i.test(label) ? "12" : "2040")]), TODAY)!;
      const read = {
        "Restricted units": r.restrictedUnits,
        "Market-rate units": r.marketUnits,
        "Units under HAP contract": r.assistedUnits,
        "Affordability expiration": r.restrictionEnds?.ends,
        "Compliance period end": r.complianceEnds?.ends,
        "HAP contract expiration": r.hapEnds?.ends,
      }[label];
      expect(read, label).not.toBeNull();
      expect(read, label).not.toBeUndefined();
    }
  });
});
