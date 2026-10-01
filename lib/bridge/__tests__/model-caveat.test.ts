import { describe, expect, it } from "vitest";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { askingPriceOf } from "@/lib/deal-strategy";
import { readInterest } from "@/lib/interest";
import { PLAN_RETURNS_CAVEAT } from "@/lib/underwrite/plan-caveat";
import { PLAN_MODEL_CAVEAT, screeningModelCaveat } from "../model-caveat";

const building: ExtractionResult = {
  dealName: "Meridian Logistics Center",
  assetClass: "industrial",
  market: "Inland Empire, CA",
  address: "1 Distribution Dr, Fontana, CA",
  metrics: [
    { label: "Asking price", value: "$50,000,000", flagged: false, page: "p. 5" },
    { label: "Going-in cap rate", value: "6.0%", flagged: true, page: "p. 6" },
    { label: "Net operating income", value: "$3,000,000", flagged: false, page: "p. 7" },
  ],
};

const signal = (take: string): FirstSignal => ({
  dealName: "Meridian Logistics Center",
  assetClass: "industrial",
  market: "Inland Empire, CA",
  askPrice: "$50,000,000",
  size: "300,000 SF",
  goingInCap: "6.0%",
  perUnit: "",
  take,
});

describe("what the screening model's figures are, said where they are printed", () => {
  it("says nothing on a stabilized building bought fee simple", () => {
    expect(screeningModelCaveat(building, signal("Check the rent roll."))).toBeNull();
    expect(screeningModelCaveat(null)).toBeNull();
  });

  it("on a note, says the deal page's own words: the collateral as if bought outright", () => {
    const note: ExtractionResult = {
      ...building,
      interest: { kind: "note", summary: "The first mortgage note", share: "", groundLease: "", loan: "", page: "p. 2" },
    };
    const c = screeningModelCaveat(note)!;
    expect(c.kind).toBe("note");
    expect(c.text).toBe(readInterest(note, askingPriceOf(note))!.modelCaveat);
    expect(c.text).toContain("as if it were bought outright at the note's price");
    expect(c.copy).toContain("not the note's return");
  });

  it("on a plan deal, says the playground's own sentence — the screening model's, not the plan's return", () => {
    expect(PLAN_RETURNS_CAVEAT.startsWith(PLAN_MODEL_CAVEAT)).toBe(true);
    const c = screeningModelCaveat(building, signal("A conversion of a vacant plant to last-mile logistics."))!;
    expect(c.kind).toBe("plan");
    expect(c.text).toBe(PLAN_MODEL_CAVEAT);
    expect(c.copy).toContain("not the plan's return");
    // Where the page prints the model's going-in cap too, it says what that is.
    expect(screeningModelCaveat(building, signal("A conversion of a vacant plant."), { cap: true })!.text).toContain(
      "Its going-in cap is year-1 income over the price",
    );
  });

  it("on another interest, says the deal page's caveat for it", () => {
    const leasehold: ExtractionResult = {
      ...building,
      interest: { kind: "leasehold", summary: "Leasehold interest", share: "", groundLease: "Ground lease to 2071", loan: "", page: "p. 3" },
    };
    const c = screeningModelCaveat(leasehold)!;
    expect(c.kind).toBe("interest");
    expect(c.text).toBe(readInterest(leasehold, askingPriceOf(leasehold))!.modelCaveat);
    expect(c.copy).toBe("The screening model capitalises the exit like a fee-simple building.");
  });
});
