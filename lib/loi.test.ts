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

describe("LOI draft — what the memorandum states the sale is (lib/loi-terms)", () => {
  const two = [
    { name: "Riverside Apartments", address: "100 River Rd, Pittsburgh, PA" },
    { name: "Hilltop Commons", address: "" },
  ];

  it("a leasehold portfolio sold by a lender: each stretch the memorandum decided, in one opening", async () => {
    const t = await letterText({
      ...base,
      leasehold: { stated: "", page: "" },
      seller: { method: "reo", stated: "", page: "" },
      properties: two,
    });
    expect(t).toContain(
      "to acquire the leasehold interest in the properties listed below under the ground lease (together, the “Property”) from the lender that took it back (“Seller”) on the principal terms set out below.",
    );
    // A note with nothing stated says what the memorandum sells, and no quote.
    expect(t).toContain("[Review before sending: the memorandum sells a leasehold under a ground lease.]");
    expect(t).toContain("(1) Riverside Apartments — 100 River Rd, Pittsburgh, PA");
    expect(t).toContain("(2) Hilltop Commons");
    // The six standard clauses, numbered as before: nothing was added.
    expect(t).toContain("6. Purchase and Sale Agreement");
    expect(t).not.toContain("7.");
  });

  it("quotes the memorandum's own words, cut at a word where they run long, never re-worded", async () => {
    const long = `The interest offered is the leasehold estate ${"under the ground lease ".repeat(20)}as recorded.`;
    const t = await letterText({ ...base, leasehold: { stated: long, page: "p. 4" } });
    const quote = t.match(/“([^”]*)”, p\. 4\./)?.[1] ?? "";
    expect(quote.endsWith("…")).toBe(true);
    expect(long.startsWith(quote.slice(0, -1))).toBe(true);
    expect(quote.length).toBeLessThanOrEqual(241);
  });

  it("strips the control characters XML cannot carry from a property's name", async () => {
    const t = await letterText({ ...base, properties: [{ name: "Bad\u0007 Name", address: "" }, two[1]] });
    expect(t).toContain("(1) Bad Name");
  });
});

// Research pass 23 read a short sale as a sale method; the letter still
// drafted it as the owner's ordinary sale, though it closes only once the
// owner's lender approves the sale and the payoff it will take.
describe("LOI draft — a short sale closes on its lender's approval", () => {
  const CONDITION =
    "The Closing shall be conditioned upon Seller’s lender approving, in writing, the sale of the Property on the terms of the PSA and the payoff it will accept from the sale.";

  it("adds the lender's approval as a condition of closing, with no figure in it, marked for review", async () => {
    const t = await letterText({ ...base, shortSale: { stated: "Offered as a short sale, subject to lender approval.", page: "p. 2" } });
    expect(t).toContain("5. Lender Approval");
    expect(t).toContain(CONDITION);
    expect(t).toContain(
      "[Review before sending: the memorandum says this is a short sale its lender must approve — “Offered as a short sale, subject to lender approval”, p. 2.]",
    );
    // The clauses after it renumber.
    expect(t).toContain("6. Closing");
    expect(t).toContain("7. Purchase and Sale Agreement");
    // A condition, never a figure: no dollar amount or percentage in it.
    const clause = t.slice(t.indexOf("5. Lender Approval"), t.indexOf("6. Closing"));
    expect(clause).not.toMatch(/\$|\d\s*%/);
    // The owner sells: the opening is the usual one.
    expect(t).toContain("from its owner (“Seller”) on the principal terms set out below.");
  });

  it("follows a conversion's entitlements contingency, and the usual letter carries none", async () => {
    const both = await letterText({ ...base, plan: { kind: "conversion", label: "Conversion" }, shortSale: { stated: "", page: "" } });
    expect(both).toContain("5. Entitlements and Approvals");
    expect(both).toContain("6. Lender Approval");
    expect(both).toContain("[Review before sending: the memorandum says this is a short sale its lender must approve.]");
    expect(both).toContain("7. Closing");
    expect(await letterText(base)).not.toContain("Lender Approval");
  });
});
