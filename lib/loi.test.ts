// The LOI draft, unzipped and read back as text: a plan deal's letter must
// carry the clauses its kind needs, and a stabilized asset's must not.
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildLoiDocx, type LoiParams } from "./loi";

const base: LoiParams = {
  buyerName: "Cascade Capital Partners LLC",
  propertyName: "1200 K Street",
  propertyAddress: "1200 K St NW, Washington, DC",
  price: "$20,000,000",
  deposit: "$200,000",
  ddDays: 45,
  closeDays: 30,
  ltvPct: 60,
  openDays: 7,
  dateStr: "September 8, 2026",
  firmName: null,
};

async function letterText(p: LoiParams): Promise<string> {
  const buf = await buildLoiDocx(p);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("LOI draft — the deal's kind shapes the paper", () => {
  it("a stabilized asset gets the six standard clauses and no entitlements contingency", async () => {
    const t = await letterText(base);
    expect(t).toContain("1. Purchase Price");
    expect(t).toContain("3. Due Diligence Period");
    expect(t).toContain("6. Purchase and Sale Agreement");
    expect(t).not.toContain("Entitlements and Approvals");
    expect(t).not.toContain("construction-cost");
    expect(t).toContain("up to 60% of the Purchase Price");
  });

  it("a conversion carries an entitlements contingency and a diligence clause that names the work", async () => {
    const t = await letterText({ ...base, plan: { kind: "conversion", label: "Conversion" } });
    expect(t).toContain("structural, environmental, zoning and construction-cost investigations");
    expect(t).toContain("intended conversion of the Property");
    expect(t).toContain("5. Entitlements and Approvals");
    expect(t).toContain("zoning approvals, entitlements, permits and other governmental consents");
    // The clauses after it renumber.
    expect(t).toContain("6. Closing");
    expect(t).toContain("7. Purchase and Sale Agreement");
  });

  it("a development reads the same way, on the development's work", async () => {
    const t = await letterText({ ...base, plan: { kind: "development", label: "Development" } });
    expect(t).toContain("intended development of the Property");
    expect(t).toContain("5. Entitlements and Approvals");
  });

  it("a value-add names its renovation program in diligence and needs no entitlements clause", async () => {
    const t = await letterText({ ...base, plan: { kind: "value_add", label: "Value-add" } });
    expect(t).toContain("renovation program for the Property");
    expect(t).not.toContain("Entitlements and Approvals");
    expect(t).toContain("5. Closing");
    expect(t).toContain("6. Purchase and Sale Agreement");
  });

  it("no financing contingency still reads as such, and the plan clauses sit beside it", async () => {
    const t = await letterText({ ...base, ltvPct: null, plan: { kind: "lease_up", label: "Lease-up" } });
    expect(t).toContain("This offer is not contingent on financing.");
    expect(t).toContain("intended lease-up of the Property");
    expect(t).not.toContain("Entitlements and Approvals");
  });
});
