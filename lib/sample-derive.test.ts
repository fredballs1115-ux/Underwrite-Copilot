// One derivation for every public entry point that runs the sample deal
// through the model. The demo report once derived without the sample's
// rent roll and T-12 and printed the deck's story — a 5.71% cap, an 11.8%
// IRR and a sensitivity page that cleared the hurdle — beside a demo page
// that ran the actuals and did not.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_DEAL } from "./sample-deal";
import { deriveUnderwriteInputs } from "./underwrite/inputs";
import { sampleDerivedInputs } from "./sample-derive";

describe("sampleDerivedInputs — the sample deal, actuals included", () => {
  it("anchors year 1 on the T-12 actual NOI and the rent roll's SF, not the OM's narrative", () => {
    const d = sampleDerivedInputs();
    expect(d.inputs.rsf).toBe(SAMPLE_DEAL.rentRoll.summary.totalSf);
    expect(d.sources.rsf?.provenance).toBe("extracted");
    expect(d.sources.inPlaceRentAnnual?.note).toMatch(/T-12 actual NOI/);
    // The derivation without the actuals is a different model — the one the
    // report used to ship.
    const bare = deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name);
    expect(bare.inputs.rsf).not.toBe(d.inputs.rsf);
    expect(bare.sources.rsf?.provenance).toBe("assumption");
  });

  it("every public entry point derives through it — the page, the workbook and the report", () => {
    const root = process.cwd();
    for (const rel of ["app/demo/page.tsx", "app/api/demo/underwrite.xlsx/route.ts", "app/api/demo/report/route.ts"]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).toContain("sampleDerivedInputs()");
      expect(src, rel).not.toMatch(/deriveUnderwriteInputs\(/);
    }
  });
});
