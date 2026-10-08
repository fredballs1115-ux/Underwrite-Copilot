// Research pass 38, item 5: the full report leaves every model read out
// where the model runs on a placeholder price or an assumed year-1 NOI
// ("nothing else it computed prints either"), while the deal page and the
// workbook's cover printed them — "the model does not bid at all" on an
// auction whose NOI was the model's own 6% of its floor, "its $240k
// year-one income" for a car wash whose $240k was the assumed 6%, and an
// assumable loan "worth $712k of price" on an assumed NOI. One gate now,
// the report's, on all three; only the memorandum's terms print.
import { describe, expect, it } from "vitest";
import React from "react";
import ExcelJS from "exceljs";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { modelReadsWithheld } from "@/lib/underwrite/report-grid";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { assumableView, readAssumable } from "@/lib/assumable-debt";
import { goingConcernModelLine, readGoingConcern } from "@/lib/going-concern";
import { readSale } from "@/lib/sale-terms";
import { saleCeiling } from "@/lib/sale-ceiling";
import { SalePanel } from "@/app/sale-panel";
import { visibleText } from "@/lib/render-lint";
import { ex, m } from "@/lib/pass38.fixture";

const auctionNoNoi = ex({
  assetClass: "Office",
  dealName: "Courthouse Square (auction)",
  sale: { method: "auction", terms: "Online auction, 5% buyer premium", condition: "As-is", page: "p. 1" },
  metrics: [m("Starting bid", "2,000,000"), m("Buyer premium", "5%"), m("Total SF", "88,000 SF"), m("Occupancy", "22%", "in_place")],
});
const carWash = ex({
  assetClass: "Car Wash",
  dealName: "Express Wash (going concern)",
  strategy: { kind: "stabilized", summary: "Sale of the going concern: the real estate and the car wash business", capitalBudget: "", timeline: "" },
  metrics: [m("Asking price", "4,000,000"), m("EBITDA", "600,000"), m("Total SF", "5,200 SF")],
});
const assumableNoNoi = ex({
  assetClass: "Office",
  dealName: "Park Tower (assume the loan)",
  metrics: [
    m("Asking price", "25,000,000"),
    m("Total SF", "180,000 SF"),
    m("Assumable loan balance", "15,000,000"),
    m("Assumable loan rate", "3.50%"),
    m("Assumable loan maturity", "June 2029"),
    m("Assumable loan amortization", "30 years"),
  ],
});

const coverOf = async (model: ReturnType<typeof deriveUnderwriteInputs>): Promise<string[]> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildUnderwriteWorkbook(model)) as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.getWorksheet("Cover")!.eachRow((row) => out.push(`${String(row.getCell(2).value ?? "")} | ${String(row.getCell(3).value ?? "")}`));
  return out;
};

describe("the report's gate on the deal page and the workbook's cover (research pass 38, item 5)", () => {
  it("withholds the model's reads wherever its price or its year-1 NOI is assumed, and keeps a plan deal's", () => {
    const auction = deriveUnderwriteInputs(auctionNoNoi, "x");
    expect(auction.sources.inPlaceRentAnnual?.provenance).toBe("assumption");
    expect(modelReadsWithheld(auction.inputs, auction.sources, false)).toBe(
      "no year-1 NOI the model could run on was read from the memorandum, so the model runs on an assumed one and its returns would be the assumption's.",
    );
    expect(modelReadsWithheld(auction.inputs, auction.sources, true)).toBeNull();
    const priced = deriveUnderwriteInputs(ex({ assetClass: "Office", metrics: [m("Asking price", "25,000,000"), m("NOI (in-place)", "1,900,000", "in_place")] }), "x");
    expect(modelReadsWithheld(priced.inputs, priced.sources, false)).toBeNull();
  });

  it("draws an auction's bid, premium and deadline with no ceiling made of the assumed NOI", () => {
    const sale = readSale(auctionNoNoi)!;
    const auction = deriveUnderwriteInputs(auctionNoNoi, "x");
    // Ungated, the ceiling is the placeholder's verdict.
    expect(saleCeiling(auctionNoNoi, auction.inputs)?.line).toContain("does not bid at all");
    // The page hands the panel no ceiling under the gate.
    const text = visibleText(renderToStaticMarkup(React.createElement(SalePanel, { sale, ceiling: null })));
    expect(text).toContain("Starting bid, $2M");
    expect(text).toContain("Buyer's premium, $100k — $2.1M all-in");
    expect(text).not.toContain("does not bid");
    expect(text).not.toContain("The model's ceiling");
  });

  it("prices an assumable loan against nothing, and says why, where the model's NOI is assumed", () => {
    const d = deriveUnderwriteInputs(assumableNoNoi, "x");
    const why = modelReadsWithheld(d.inputs, d.sources, false);
    expect(why).not.toBeNull();
    const view = assumableView(readAssumable(assumableNoNoi, null)!, d.sources.allInRatePct?.note ?? null, false, why);
    expect(view.sentence).toBe(`It is not priced against a new loan: ${why}`);
    expect(view.pricePremium).toBeNull();
    expect(view.irrGapPts).toBeNull();
    expect(view.marketPct).toBeNull();
    expect(view.basisLine).toBeNull();
    expect(view.termsLine).toContain("$15.0M at 3.50% to Jun 2029");
  });

  it("never names an assumed year-one income as the deal's income", () => {
    const r = readGoingConcern(carWash)!;
    expect(goingConcernModelLine(r, { noi1: 240_000, exitCapPct: 0.06, noiAssumed: true })).toMatch(
      /^The model capitalises an assumed year-one income, not one the memorandum states, at a 6\.00% exit cap as if it were rent/,
    );
    expect(goingConcernModelLine(r, { noi1: 240_000, exitCapPct: 0.06, noiAssumed: true })).not.toContain("$240k");
    expect(goingConcernModelLine(r, { noi1: 240_000, exitCapPct: 0.06 })).toContain("its $240k year-one income");
  });

  it("prints only the memorandum's terms on the workbook's cover, and says once why the reads are left out", async () => {
    const auction = deriveUnderwriteInputs(auctionNoNoi, "x");
    const cover = await coverOf(auction);
    expect(cover.some((r) => r.startsWith("How it is sold | "))).toBe(true);
    expect(cover.join("\n")).not.toContain("does not bid");
    expect(cover).toContain(
      " | The model's reads of these terms are left out: no year-1 NOI the model could run on was read from the memorandum, so the model runs on an assumed one and its returns would be the assumption's.",
    );
    const wash = await coverOf(deriveUnderwriteInputs(carWash, "x"));
    expect(wash.some((r) => r.startsWith("The operating business | "))).toBe(true);
    expect(wash.join("\n")).not.toContain("The model capitalises");
    const loan = await coverOf(deriveUnderwriteInputs(assumableNoNoi, "x"));
    expect(loan.some((r) => r.startsWith("The seller's loan | The seller's loan is offered for assumption: $15.0M at 3.50% to Jun 2029"))).toBe(true);
    expect(loan.join("\n")).not.toContain("Assuming it");
  });
});
