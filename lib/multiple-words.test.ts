// Research pass 40, L4 and L5: one equity multiple was written three ways.
// The deal page's playground and the workbook printed a multiple at or below
// zero as a figure ("-1.65x") where the full report prints a dash, and the
// report printed its grid's base cell at one place ("1.5x") beside its base
// case's two ("1.53x"). The report's dash and two places are the rule now on
// every surface that prints the screening model's multiple: the playground's
// tile (and the homepage's bench) through lib/underwrite/playground `fmtEm`,
// the workbook's cells through their number format over the live formula,
// and the report's grid. Every name is invented.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { runScenario, fmtEm } from "@/lib/underwrite/playground";
import { buildSensitivityData, heatCellEm } from "@/lib/underwrite/report-grid";
import { sampleDerivedInputs } from "@/lib/sample-derive";
import { SensitivityPlayground, type PlaygroundData } from "@/app/(app)/deals/[id]/sensitivity-playground";
import { visibleText } from "./render-lint";

const row = (label: string, value: string) => ({ label, value, flagged: false, page: "p. 3" });
// An office whose sale at the default exit does not repay its loan: the
// equity gets less than nothing back, a multiple under zero.
const UNDER: ExtractionResult = {
  dealName: "Ridgeline Office Park",
  assetClass: "office",
  market: "",
  metrics: [row("Asking price", "$20,000,000"), row("NOI (in-place)", "$500,000"), row("Total SF", "100,000 SF")],
};

describe("an equity multiple written one way (research pass 40, L4 and L5)", () => {
  it("dashes a multiple at or below zero and writes the rest at two places", () => {
    expect(fmtEm(-1.65)).toBe("—");
    expect(fmtEm(0)).toBe("—");
    expect(fmtEm(null)).toBe("—");
    expect(fmtEm(1.5343)).toBe("1.53x");
  });

  it("the deal page's playground dashes a multiple under zero, as the report does", () => {
    const d = deriveUnderwriteInputs(UNDER, "x");
    const em = runScenario(d.inputs, {}).leveredEquityMultiple!;
    expect(em).toBeLessThan(0);
    const data: PlaygroundData = {
      inputs: d.inputs,
      dealAssetClass: "office",
      checkSource: { assetClass: "office", market: "", metrics: UNDER.metrics },
      box: null,
      sources: d.sources,
      occupancyPct: d.meta.occupancyPct ?? null,
    };
    const text = visibleText(renderToStaticMarkup(React.createElement(SensitivityPlayground, { data })));
    expect(text).toMatch(/Equity multiple\s+—/);
    expect(text).not.toContain(`${em.toFixed(2)}x`);
  });

  it("the report's grid prints its base cell's multiple at the base case's two places", () => {
    const s = buildSensitivityData(sampleDerivedInputs().inputs, 13, { sources: sampleDerivedInputs().sources });
    const base = s.grid.cells[s.grid.baseRow][s.grid.baseCol];
    expect(heatCellEm(base)).toBe("1.53x");
    expect(heatCellEm(base)).toBe(fmtEm(s.baseCase!.equityMultiple));
  });
});
