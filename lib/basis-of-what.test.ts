// Research pass 38, item 16: bases struck on what the price does not buy.
// A development priced at its land read "Price / Unit $25,000" — the land's
// cost over the units it plans — in the workbook; and a bulk condominium
// purchase of 42 of a building's 120 units read "$123k/unit" on the card
// and "Price / Unit $122,500" in the workbook, the price over the whole
// condominium's count. The land's figure is labelled the land's now, and a
// bulk purchase divides by the units it buys. Every name is invented.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { HyperFormula } from "hyperformula";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { basisTag } from "@/lib/pipeline-slots";
import { subjectBasis } from "@/lib/comp-detail";
import { condoUnitsOffered } from "@/lib/condo-units";
import { readCondo } from "@/lib/condo";
import { inferStrategy } from "@/lib/deal-strategy";
import { screenYearOf } from "@/lib/criteria";
import { interestOf } from "@/lib/interest";
import { ex, m } from "@/lib/pass38.fixture";

const DEV = { kind: "development", summary: "Ground-up 240-unit apartment development", capitalBudget: "", timeline: "" };
const devLand = ex({ assetClass: "Multifamily", dealName: "Riverbend (development site)", strategy: DEV, metrics: [m("Land cost", "6,000,000"), m("Units (proposed)", "240")] });
const condoBulk = ex({
  assetClass: "Multifamily",
  dealName: "Harborview Lofts (42 condo units)",
  metrics: [
    m("Asking price", "14,700,000"),
    m("Units offered", "42"),
    m("Units in condominium", "120"),
    m("Units", "120"),
    m("NOI (in-place)", "760,000", "in_place"),
    m("HOA dues", "650 per unit per month"),
  ],
});

async function opsOf(extraction: ReturnType<typeof ex>) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildUnderwriteWorkbook(deriveUnderwriteInputs(extraction, "x"))) as unknown as ArrayBuffer);
  const toHf = (v: unknown): number | string | boolean | null => {
    if (v == null) return null;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
    const o = v as { formula?: string; result?: unknown; richText?: { text: string }[] };
    if (o.formula != null) return "=" + o.formula;
    if (o.richText) return o.richText.map((r) => r.text).join("");
    return (o.result as number | string | undefined) ?? null;
  };
  const sheets: Record<string, (number | string | boolean | null)[][]> = {};
  wb.eachSheet((ws) => {
    const grid: (number | string | boolean | null)[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row: (number | string | boolean | null)[] = [];
      for (let c = 1; c <= ws.columnCount; c++) row.push(toHf(ws.getCell(r, c).value));
      grid.push(row);
    }
    sheets[ws.name] = grid;
  });
  const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3" });
  for (const dn of (wb.definedNames as unknown as { model: { name: string; ranges: string[] }[] }).model) {
    if (!dn.ranges?.length) continue;
    try {
      hf.addNamedExpression(dn.name, "=" + dn.ranges[0]);
    } catch {
      /* duplicate or unsupported — skipped */
    }
  }
  const values = hf.getSheetValues(hf.getSheetId("Operating Metrics")!) as unknown[][];
  return new Map(values.filter((row) => typeof row[0] === "string").map((row) => [row[0] as string, row[1]]));
}

describe("a basis struck on what the price buys (research pass 38, item 16)", () => {
  it("calls a development's land price over its planned units the land's cost a unit", async () => {
    const ops = await opsOf(devLand);
    expect(ops.get("Land cost / Unit")).toBe(25_000);
    expect(ops.has("Price / Unit")).toBe(false);
    expect(ops.has("All-in Basis / Unit (land + capital plan)")).toBe(true);
  });

  it("divides a bulk condominium purchase's price by the units it buys, on the card, the comps' tick and the workbook", async () => {
    expect(condoUnitsOffered(condoBulk)).toBe(42);
    // One count: lib/condo's read is the same.
    expect(readCondo(condoBulk)?.unitsOffered).toBe(condoUnitsOffered(condoBulk));
    const kind = inferStrategy(condoBulk).kind;
    expect(subjectBasis(condoBulk.metrics, kind, screenYearOf(condoBulk), interestOf(condoBulk), condoBulk.assetClass, condoUnitsOffered(condoBulk)).perUnit).toBe(350_000);
    expect(basisTag(condoBulk, kind)).toBe("$350k/unit");
    const ops = await opsOf(condoBulk);
    expect(ops.get("Units offered")).toBe(42);
    expect(ops.get("Price / Unit")).toBe(350_000);
    // The model's area and the count it reads are the owner's: untouched.
    const d = deriveUnderwriteInputs(condoBulk, "x");
    expect(d.meta.units).toBe(120);
  });

  it("leaves an ordinary building's yardsticks as they were", async () => {
    const plain = ex({ assetClass: "Multifamily", dealName: "Cedar Court", metrics: [m("Asking price", "24,000,000"), m("Units", "120"), m("NOI (in-place)", "1,320,000", "in_place")] });
    expect(condoUnitsOffered(plain)).toBeNull();
    const ops = await opsOf(plain);
    expect(ops.get("Units")).toBe(120);
    expect(ops.get("Price / Unit")).toBe(200_000);
  });
});
