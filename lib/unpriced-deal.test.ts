// Research pass 38, item 2, and the second audit's MED-2: an unpriced deal
// ("Call for offers") runs on the site's $10,000,000 placeholder price. The
// memorandum's own NOI was judged against that placeholder ("above any
// going-in cap on this price"), the reader was asked for the NOI it states,
// the withheld line said no NOI was read, and the workbook struck "Price /
// Unit $35,714" for 280 apartments on the placeholder. Where only a cap is
// stated, the placeholder × the cap ran as an NOI derived from the
// memorandum, so a price typed over the placeholder showed returns on it.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import {
  buildSensitivityData,
  placeholderPageLine,
  placeholderReason,
  placeholderWorkbookLine,
} from "@/lib/underwrite/report-grid";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { ex, m } from "@/lib/pass38.fixture";

const noiOnlyBig = ex({
  assetClass: "Multifamily",
  dealName: "Harbor Point (unpriced)",
  metrics: [m("Asking price", "Call for offers"), m("NOI (in-place)", "4,000,000", "in_place"), m("Units", "280"), m("Occupancy", "95%", "in_place")],
});
const capOnly = ex({
  assetClass: "Multifamily",
  dealName: "Birch Commons (unpriced)",
  metrics: [m("Asking price", "Call for offers"), m("Going-in cap rate", "6.00%"), m("Units", "120")],
});
const perUnitOnly = ex({
  assetClass: "Multifamily",
  dealName: "Cedar Flats",
  metrics: [m("Price per unit", "185,000"), m("Units", "120"), m("NOI (in-place)", "1,200,000", "in_place")],
});

const opsLabels = async (model: ReturnType<typeof deriveUnderwriteInputs>): Promise<string[]> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildUnderwriteWorkbook(model)) as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.getWorksheet("Operating Metrics")!.eachRow((row) => out.push(String(row.getCell(1).value ?? "")));
  return out;
};

describe("an unpriced deal whose memorandum states its NOI (research pass 38, item 2)", () => {
  const d = deriveUnderwriteInputs(noiOnlyBig, "x");

  it("never judges the NOI against the placeholder, nor asks for the NOI it states", () => {
    expect(d.sources.purchasePrice?.provenance).toBe("assumption");
    const note = d.sources.inPlaceRentAnnual!.note;
    expect(note).toBe(
      "The OM's NOI (in-place) of $4,000,000 cannot be set against the $10,000,000 placeholder price, which no memorandum stated — enter the price. No going-in cap in the OM either — assumed 6% going-in on the $10,000,000 placeholder",
    );
    expect(note).not.toContain("above any going-in cap");
    expect(note).not.toContain("enter the in-place NOI");
  });

  it("names the stated NOI wherever the returns are withheld, never says none was read", () => {
    const page = placeholderPageLine(d.inputs, d.sources, { priceEntered: false, maxBid: true });
    expect(page).toBe(
      "The returns and the max bid are withheld: no price was read from the memorandum, so its $4,000,000 NOI (in-place) has no price to be set against, and the model runs on a $10,000,000 placeholder price and an assumed NOI; its returns would be a placeholder's. A price typed above reprices the model, but not its year-1 NOI, which was struck on the placeholder — so the returns stay withheld.",
    );
    const report = buildSensitivityData(d.inputs, null, { sources: d.sources }).withheld!;
    expect(report).toContain("its $4,000,000 NOI (in-place) has no price to be set against");
    // A price typed over the placeholder: the NOI judged against it is named.
    const typed = placeholderReason(d.inputs, d.sources, { priceEntered: true })!;
    expect(typed).toBe(
      "the model set the memorandum's $4,000,000 NOI (in-place) against its $10,000,000 placeholder price and does not run it, so it runs on an assumed NOI and its returns would be the assumption's.",
    );
    for (const line of [page!, report, typed, placeholderWorkbookLine(d.inputs, d.sources)!]) {
      expect(line).not.toContain("nor a year-1 NOI");
      expect(line).not.toContain("no year-1 NOI the model could run on was read");
    }
  });

  it("strikes no price per unit, per foot or all-in on the placeholder in the workbook", async () => {
    const labels = await opsLabels(d);
    expect(labels).not.toContain("Price / Unit");
    expect(labels).not.toContain("All-in Basis / Unit (price + capital plan)");
    expect(labels).toContain(
      "Price / Unit and All-in Basis / Unit left out: no price was read from the memorandum, so the Purchase Price is a placeholder and a basis struck on it would be the placeholder's.",
    );
    // A price per unit stated beside no total is not set against the
    // placeholder's "$83,333" either; an NOI the placeholder can carry still
    // anchors year 1.
    const perUnit = deriveUnderwriteInputs(perUnitOnly, "x");
    expect(perUnit.sources.inPlaceRentAnnual?.provenance).toBe("derived");
    expect(await opsLabels(perUnit)).not.toContain("Price / Unit");
  });
});

describe("an unpriced deal whose memorandum states only a cap (the second audit, MED-2)", () => {
  const d = deriveUnderwriteInputs(capOnly, "x");

  it("marks the placeholder × the stated cap as the placeholder's NOI, named as such", () => {
    expect(d.inputs.purchasePrice).toBe(10_000_000);
    expect(d.sources.inPlaceRentAnnual?.provenance).toBe("assumption");
    expect(d.sources.inPlaceRentAnnual?.note).toBe(
      "The $10,000,000 placeholder × the stated 6.00% going-in cap, at an assumed expense ratio — the memorandum states no price or NOI, so this NOI is the placeholder's; enter the price and the in-place NOI",
    );
    // The model's figures are the model's: the NOI is still $600,000.
    expect(d.inputs.inPlaceRentAnnual * (1 - d.inputs.vacancyPct) - d.inputs.expenseLines[0].annual).toBeCloseTo(600_000, 0);
  });

  it("shows no return on the placeholder's NOI whatever price is typed, and the workbook's line names the NOI", () => {
    expect(placeholderReason(d.inputs, d.sources, { priceEntered: true })).not.toBeNull();
    expect(placeholderPageLine(d.inputs, d.sources, { priceEntered: true, maxBid: false })).toMatch(/^The returns are withheld: /);
    expect(placeholderWorkbookLine(d.inputs, d.sources)).toBe(
      "No price was read from the memorandum, nor a year-1 NOI the model could run on, so the model runs on a $10,000,000 placeholder price and an assumed NOI, and its returns are a placeholder's. Enter the price you would pay as the Purchase Price on the Assumptions tab, and the Potential Gross Revenue and expenses that make the year-1 NOI you would run: a price entered alone leaves the NOI struck on the placeholder.",
    );
  });
});
