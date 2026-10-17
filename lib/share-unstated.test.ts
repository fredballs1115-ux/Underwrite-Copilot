// Audit C3a, LOW-8: a share that states no percentage of the owning entity,
// beside the entity's stated loan, runs the model at its own price — nothing
// is grossed up, and the model's note says so — but the report's grids were
// said to run "at the equity's whole", and the workbook's per-unit rows left
// out because "the share's price grossed up is the equity's whole". The
// fixture is the audit's; every name is invented.
import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { basisWithheldOf, deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { gridSubjectOf } from "@/lib/memo/report-document";

const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3" });
const share = (share: string, loan: boolean): ExtractionResult =>
  ({
    dealName: "Share deal",
    assetClass: "multifamily",
    totalPages: 40,
    interest: { kind: "partial_interest", summary: share, share, groundLease: "", loan: "", page: "p. 2" },
    metrics: [
      row("Asking price", "$20,000,000"),
      row("NOI (in-place)", "$1,500,000"),
      row("Units", "200"),
      ...(loan ? [row("Entity loan balance", "$30,000,000")] : []),
    ],
  }) as unknown as ExtractionResult;

describe("a share of no stated percentage runs at its own price, said so on the report and the workbook", () => {
  it("says the grids run at the share's own price, and the entity's loan beside the reason", () => {
    const ex = share("A limited partnership interest in the owning entity", true);
    expect(deriveUnderwriteInputs(ex, "x").inputs.purchasePrice).toBe(20_000_000);
    expect(gridSubjectOf(ex)).toBe("the whole building, run at the share's own price");
    expect(basisWithheldOf(ex)).toEqual({
      word: "share",
      why: "the price buys a share the memorandum states no percentage for, which cannot be grossed up to the building's price, the entity's loan stated beside it",
    });
  });

  it("keeps the equity's whole where a percentage is stated beside the entity's loan, and the no-percentage words without one", () => {
    const pct = share("A 49% limited partnership interest in the owning entity", true);
    expect(gridSubjectOf(pct)).toBe("the whole building, run at the equity's whole");
    expect(basisWithheldOf(pct)?.why).toBe("the share's price grossed up is the equity's whole, with the entity's loan on top of it, not the building's price");
    const bare = share("A limited partnership interest in the owning entity", false);
    expect(gridSubjectOf(bare)).toBe("the whole building, run at the share's own price");
    expect(basisWithheldOf(bare)?.why).toBe("the price buys a share the memorandum states no percentage for, which cannot be grossed up to the building's price");
  });

  it("says a GP stake beside its entity's loan runs at its own price too", () => {
    const gp = share("A 50% interest in the general partner of the owning partnership", true);
    expect(gridSubjectOf(gp)).toBe("the whole building, run at the share's own price");
  });
});
