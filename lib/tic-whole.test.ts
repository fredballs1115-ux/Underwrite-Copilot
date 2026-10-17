// The lead's item 16 (beside audit C3b's LOW-1): at a stated 100% an
// undivided interest held as a tenant in common is all the tenant-in-common
// interests, together the whole property, held by no entity. The plan's
// price label and its findings' price word, the compare table's model-
// returns line, the workbook's price tile and the short line said "all the
// entity's interests" or "an undivided 100% interest". Every name is
// invented.
import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { assessPlausibility, askingPriceOf, inferStrategy, planSummary } from "@/lib/deal-strategy";
import { interestShortLine, readInterest } from "@/lib/interest";
import { modelReturnsRead } from "@/lib/compare-interest";
import { basisWithheldOf, deriveUnderwriteInputs } from "@/lib/underwrite/inputs";

const row = (label: string, value: string, basis: ExtractionResult["metrics"][number]["basis"] = "na") => ({ label, value, flagged: false, page: "p. 3", basis });
const tic = (metrics: ExtractionResult["metrics"], loan = true): ExtractionResult =>
  ({
    dealName: "Summit MOB (TIC interests)",
    assetClass: "Medical Office",
    totalPages: 40,
    interest: {
      kind: "partial_interest",
      summary: "All of the undivided tenant-in-common interests in the fee simple of a medical office building, 100% in all",
      share: "100% tenant-in-common interests",
      groundLease: "",
      loan: "",
      page: "p. 2",
    },
    metrics: [row("Asking price", "$4,200,000"), row("Total SF", "48,000 SF"), ...(loan ? [row("Entity loan balance", "$9,000,000")] : []), ...metrics],
  }) as unknown as ExtractionResult;

describe("all the tenant-in-common interests are said as that, never an entity's", () => {
  it("the plan's price label and its findings' price word", () => {
    const ex = { ...tic([row("NOI (in-place)", "$1,400,000", "in_place")]), strategy: { kind: "value_add", summary: "Re-lease the vacant suites", capitalBudget: "", timeline: "" } } as ExtractionResult;
    const plan = planSummary(ex, inferStrategy(ex))!;
    expect(plan.priceLabel).toBe("Equity's whole, all the tenant-in-common interests");
    const stabilized = tic([row("NOI (in-place)", "$1,400,000", "in_place")]);
    const titles = assessPlausibility(stabilized, inferStrategy(stabilized)).map((f) => `${f.title} ${f.detail}`);
    expect(titles.join(" ")).toContain("The $4.2M for all the tenant-in-common interests is the equity's whole, not the asset's: the stated $9.0M loan on the property sits on top of it.");
    expect(titles.join(" ")).not.toMatch(/entity's interests|the entity's stated/);
  });

  it("the compare table's model-returns line and the workbook's price tile", () => {
    const ex = tic([row("NOI (in-place)", "$300,000", "in_place")]);
    const d = deriveUnderwriteInputs(ex, "x");
    expect(d.meta.priceLabel).toBe("Equity's Whole (all the TIC interests)");
    const line = modelReturnsRead(ex, { purchasePrice: d.inputs.purchasePrice, year1Noi: 300_000, goingInCapPct: 7.1 }).line;
    expect(line).toBe(
      "This price buys all the tenant-in-common interests, and beside the loan on the property it is the equity's whole, not the building's: this model ran the whole building's cash flows at it, so its cap and returns are withheld.",
    );
  });

  it("the workbook's per-unit rows note: nothing grossed up (audit C6, LOW-3)", () => {
    const ex = tic([row("NOI (in-place)", "$300,000", "in_place")]);
    expect(basisWithheldOf(ex)).toEqual({
      word: "share",
      why: "the price for all the tenant-in-common interests is the equity's whole, nothing grossed up, with the loan on the property on top of it, not the building's price",
    });
  });

  it("the short line", () => {
    const ex = tic([], false);
    expect(interestShortLine(readInterest(ex, askingPriceOf(ex))!)).toBe("All the tenant-in-common interests in the property — $4.2M for the whole, nothing grossed up");
  });
});
