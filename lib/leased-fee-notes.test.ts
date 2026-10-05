// The second audit's MED-4: on a leased fee whose memorandum states its NOI
// as the ground rent, the model's notes said the year-1 NOI equalled the rent
// "by arithmetic, not read from it", and that the model "does not read" the
// rent — while the NOI was read off the memorandum's own NOI row, which is
// the rent. "By arithmetic" is said only where the NOI was struck (the price
// × the stated cap, or the assumed 6%); a NOI read off a row says it is the
// same figure as the stated rent. Whether the model should read the rent as
// its NOI is the owner's. Every name is invented.
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { buildUnderwriteWorkbook } from "@/lib/underwrite/workbook";
import { ex, m } from "@/lib/pass38.fixture";

const LEASED_FEE = { kind: "leased_fee", summary: "The land under an office building, sold with its ground lease", share: "", groundLease: "Ground lease to 2079", loan: "", page: "p. 2" };
const fee = (rows: ReturnType<typeof m>[]) =>
  ex({
    assetClass: "Office",
    dealName: "Quarry Point (leased fee)",
    interest: LEASED_FEE,
    metrics: [m("Asking price", "15,000,000"), m("Ground rent", "600,000", "in_place", "p. 4"), m("Income before ground rent", "3,000,000", "in_place", "p. 6"), ...rows],
  });

describe("a leased fee whose stated NOI is its ground rent (the second audit, MED-4)", () => {
  it("says the NOI read off the memorandum's row is the same figure as the rent, never by arithmetic", async () => {
    const d = deriveUnderwriteInputs(fee([m("NOI (in-place)", "600,000", "in_place", "p. 5")]), "x");
    expect(d.sources.inPlaceRentAnnual?.provenance).not.toBe("assumption");
    expect(d.sources.inPlaceRentAnnual?.note).toMatch(/ — the same figure as the \$600,000 ground rent the OM states$/);
    expect(d.sources.inPlaceRentAnnual?.note).not.toContain("does not read it");
    expect(d.sources.inPlaceRentAnnual?.notRun).toBeUndefined();
    expect(d.sources.purchasePrice?.note).toContain(
      "its year-1 NOI is the OM's NOI (in-place), $600,000 a year — the same figure as the $600,000 ground rent the OM states, run with a building's assumptions",
    );
    expect(d.sources.purchasePrice?.note).not.toContain("by arithmetic");
    // The workbook's Sources column prints the notes as they stand.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(d)) as unknown as ArrayBuffer);
    const sources: string[] = [];
    wb.getWorksheet("Assumptions")!.eachRow((row) => sources.push(String(row.getCell(3).value ?? "")));
    expect(sources.join("\n")).toContain("the same figure as the $600,000 ground rent the OM states");
    expect(sources.join("\n")).not.toContain("by arithmetic");
  });

  it("keeps \"by arithmetic\" where the NOI was struck on the price and the stated cap", () => {
    const d = deriveUnderwriteInputs(fee([m("Going-in cap rate", "4.00%", "na", "p. 3")]), "x");
    expect(d.sources.purchasePrice?.note).toContain("— equal to the $600,000 ground rent the OM states by arithmetic, not read from it");
    expect(d.sources.inPlaceRentAnnual?.note).toContain("the model does not read it");
  });
});

// The second audit's MED-5: a leased fee's cap read two ways in one deal —
// the deal page's playground printed the model's 4.00%, the workbook "n/a —
// leased fee". The workbook's cap and yield cells now withhold where the
// deal header's cap slot does, and a leased fee's cap stands, labelled as
// the land's price. What a leased fee's cap means is the owner's.
describe("a leased fee's cap in the workbook (the second audit, MED-5)", () => {
  const summaryOf = async (d: ReturnType<typeof deriveUnderwriteInputs>) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildUnderwriteWorkbook(d)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Deal Summary")!;
    const rows = new Map<string, unknown>();
    ws.eachRow((row) => rows.set(String(row.getCell(4).value ?? ""), row.getCell(5).value));
    return rows;
  };

  it("prints the cap on the land's price, live, as the page prints it", async () => {
    const rows = await summaryOf(deriveUnderwriteInputs(fee([m("NOI (in-place)", "600,000", "in_place", "p. 5")]), "x"));
    expect(rows.get("Going-In Cap on the Land's Price (Yr-1 NOI / Price)")).toMatchObject({ formula: expect.stringContaining("/PurchasePrice") });
    expect(rows.get("Year-1 Yield on Total Cost (the Land's)")).toMatchObject({ formula: expect.stringContaining("/TotalUses") });
    expect([...rows.values()]).not.toContain("n/a — leased fee");
  });

  it("still withholds a note's and a share's of no stated percentage", async () => {
    const note = deriveUnderwriteInputs(
      ex({
        assetClass: "Office",
        dealName: "Quarry Point (note sale)",
        interest: { kind: "note", summary: "A first mortgage note", share: "", groundLease: "", loan: "First mortgage note", page: "p. 2" },
        metrics: [m("Asking price", "15,000,000"), m("Unpaid principal balance", "18,000,000"), m("NOI (in-place)", "1,500,000", "in_place")],
      }),
      "x",
    );
    expect((await summaryOf(note)).get("Going-In Cap (Yr-1 NOI / Price)")).toBe("n/a — note");
    const share = deriveUnderwriteInputs(
      ex({
        assetClass: "Office",
        dealName: "Quarry Point (interest)",
        interest: { kind: "partial_interest", summary: "A limited partnership interest", share: "", groundLease: "", loan: "", page: "p. 2" },
        metrics: [m("Asking price", "15,000,000"), m("NOI (in-place)", "1,500,000", "in_place")],
      }),
      "x",
    );
    expect((await summaryOf(share)).get("Going-In Cap (Yr-1 NOI / Price)")).toBe("n/a — share");
  });
});
