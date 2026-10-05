// The sample deal's underwriting inputs — ONE derivation for every public
// entry point that runs the fixture through the model: the demo page, the
// demo workbook download and the demo report PDF. The sample carries a rent
// roll and a T-12, and the whole point of the actuals feature is that the
// T-12 outranks the OM's narrative; a public deliverable that derived
// without them ran the deck's story instead (5.71% cap, an 11.8% IRR and a
// sensitivity page that cleared the hurdle) while the page beside it ran the
// actuals (5.45%, 9.3%, and did not). Pure: no I/O.
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildSensitivityGrids, type SensCell } from "@/lib/underwrite/sensitivity";

/** The sample's actuals, in the shape deriveUnderwriteInputs takes. */
export const SAMPLE_ACTUALS = {
  rentRoll: {
    summary: SAMPLE_DEAL.rentRoll.summary,
    asOf: SAMPLE_DEAL.rentRoll.as_of_date,
  },
  t12: {
    summary: SAMPLE_DEAL.t12.summary,
    periodEnd: SAMPLE_DEAL.t12.period_end_date,
  },
} as const;

/** The sample deal's derived model inputs, actuals included. */
export function sampleDerivedInputs() {
  return deriveUnderwriteInputs(SAMPLE_DEAL.extraction, SAMPLE_DEAL.name, SAMPLE_ACTUALS);
}

/**
 * The homepage's "Excel model, live formulas" tile, read off the sample
 * workbook it links (/api/demo/underwrite.xlsx, built from
 * `sampleDerivedInputs`): the base case's levered IRR at its price and its
 * exit cap, then two cells of the workbook's own Sensitivity tab — its Exit
 * Cap × Purchase Price grid one exit-cap step wider, and one price step
 * lower (lib/underwrite/sensitivity, which the workbook's live engine
 * blocks mirror) — each as the workbook computes it. Rows are [input,
 * value, effect]. Research pass 34: the tile had run the first-draft model
 * (lib/model/compute) under a comment promising the workbook's figures, at
 * a 5.50% exit and an 8.7% IRR against the workbook's 5.45% and 9.3%, and
 * flexed a rent growth no tab of the workbook runs.
 */
export function sampleWorkbookPreview(): [string, string, string][] {
  const { inputs } = sampleDerivedInputs();
  const grid = buildSensitivityGrids(inputs).find((g) => g.key === "capPrice")!;
  const p = grid.rowAxis.baseIndex;
  const c = grid.colAxis.baseIndex;
  const irr = (cell: SensCell) => (cell.irrPct == null ? "—" : `IRR ${(cell.irrPct * 100).toFixed(1)}%`);
  const money = (n: number) => `$${Number((n / 1e6).toFixed(1))}M`;
  const cap = (d: number) => `${(d * 100).toFixed(2)}%`;
  return [
    ["Purchase price", money(inputs.purchasePrice), irr(grid.cells[p][c])],
    ["Exit cap", cap(inputs.exitCapPct), irr(grid.cells[p][c])],
    ["Exit cap (flexed)", cap(grid.colAxis.values[c + 1]), irr(grid.cells[p][c + 1])],
    ["Purchase price (flexed)", money(grid.rowAxis.values[p - 1]), irr(grid.cells[p - 1][c])],
  ];
}
