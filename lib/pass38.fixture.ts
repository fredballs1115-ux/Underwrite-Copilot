// Research pass 38's fixtures: plain extractions of deals whose figures no
// building could have — a price that is a cap rate, an unpriced deal with a
// large NOI, a note far under water — each as the screen stores it. Test
// tooling only; every name is invented.
import type { ExtractedMetric, ExtractionResult } from "@/lib/anthropic/types";

export const m = (label: string, value: string, basis: ExtractedMetric["basis"] = "na", page = "p. 3"): ExtractedMetric =>
  ({ label, value, flagged: false, page, basis, locatorSnippet: "" }) as ExtractedMetric;

const FEE_SIMPLE = { kind: "fee_simple", summary: "", share: "", groundLease: "", loan: "", page: "" };

export const ex = (p: Omit<Partial<ExtractionResult>, "metrics" | "interest" | "strategy"> & {
  metrics: ExtractedMetric[];
  interest?: unknown;
  strategy?: unknown;
}): ExtractionResult =>
  ({
    dealName: "Test",
    assetClass: "auto",
    market: "",
    address: "",
    totalPages: 40,
    screenedOn: "2026-10-05",
    strategy: { kind: "unknown", summary: "", capitalBudget: "", timeline: "" },
    interest: FEE_SIMPLE,
    affordable: { programs: [], summary: "", agreement: "", assistance: "", tiers: [], page: "" },
    singleTenant: { tenant: "", guarantor: "", leaseType: "", landlordObligations: "", tenantRights: "", page: "" },
    hotel: { brand: "", franchise: "", management: "", encumbrance: "unknown", pip: "", page: "" },
    sale: { method: "negotiated", terms: "", condition: "", page: "" },
    tenants: [],
    listingTeam: [],
    properties: [],
    ...p,
  }) as unknown as ExtractionResult;

export const ASOF = new Date("2026-10-05T12:00:00Z");

const NOTE = { kind: "note", summary: "A performing first mortgage note secured by the property", share: "", groundLease: "", loan: "First mortgage note", page: "p. 2" };

export const priceIsCap = ex({
  assetClass: "Industrial",
  dealName: "Logistics Park",
  metrics: [m("Asking price", "6.25% cap rate"), m("NOI (in-place)", "3,125,000", "in_place"), m("Total SF", "410,000 SF")],
});

export const notePctUpb = ex({
  assetClass: "Office",
  dealName: "1 Main (note sale)",
  interest: NOTE,
  metrics: [
    m("Asking price", "75% of UPB"),
    m("Unpaid principal balance", "20,000,000"),
    m("Note rate", "6.00%"),
    m("Maturity date", "March 1, 2028"),
    m("Payment status", "Performing"),
    m("Whole-asset value", "26,000,000"),
    m("NOI (in-place)", "1,640,000", "in_place"),
  ],
});

export const pricePerUnitInValue = ex({
  assetClass: "Multifamily",
  dealName: "Cedar Flats",
  metrics: [m("Asking price", "185,000 per unit"), m("Units", "120"), m("NOI (in-place)", "1,380,000", "in_place"), m("Going-in cap rate", "6.20%")],
});

export const pricePsfInValue = ex({
  assetClass: "Office",
  dealName: "Commerce Center",
  metrics: [m("Asking price", "425/SF"), m("Total SF", "185,000 SF"), m("NOI (in-place)", "3,100,000", "in_place")],
});

export const pricePerAcreInValue = ex({
  assetClass: "Land",
  dealName: "Riverside Tract",
  metrics: [m("Asking price", "1,850,000 per acre"), m("Acres", "12.5")],
});

/** A sandwich position: a master lease of the building, sublet. */
export const sandwich = ex({
  assetClass: "Office",
  dealName: "1400 Market (master lease position)",
  interest: { kind: "leasehold", summary: "A master lease of the building, sublet to its tenants", share: "", groundLease: "Master lease from the owner through December 31, 2034", loan: "", page: "p. 4" },
  metrics: [
    m("Asking price", "3,000,000"),
    m("Master lease rent", "2,400,000"),
    m("Sublease income", "2,900,000"),
    m("Master lease expiration", "December 31, 2034"),
    m("Total SF", "150,000 SF"),
    m("NOI (in-place)", "500,000", "in_place"),
  ],
});

/** A development whose total cost is stated in thousands. */
export const devTotalThousands = ex({
  assetClass: "Multifamily",
  dealName: "Parkline (development site)",
  strategy: { kind: "development", summary: "Ground-up 240-unit apartment development", capitalBudget: "", timeline: "" },
  metrics: [m("Total project cost", "48,500 ($000s)"), m("NOI (stabilized, pro forma)", "3,200,000"), m("Units (proposed)", "200")],
});
