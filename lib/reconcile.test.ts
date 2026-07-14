import { describe, it, expect } from "vitest";
import {
  computeDiscrepancies,
  applyOverride,
  categorize,
  precedenceOrder,
  severityFor,
} from "./reconcile";
import type { DocFacts, DocFact } from "@/lib/model/types";

const fact = (key: string, label: string, numeric: number, value: string, unit = ""): DocFact => ({
  key,
  label,
  value,
  numeric,
  unit,
  locator: "",
  basis: "",
});
const doc = (kind: string, docName: string, facts: DocFact[]): DocFacts => ({ kind, docName, facts });

describe("classification & precedence", () => {
  it("routes facts to the right category", () => {
    expect(categorize("occupancy")).toBe("occupancy");
    expect(categorize("in_place_rent In-Place Rent")).toBe("rents");
    expect(categorize("real_estate_taxes Real Estate Taxes")).toBe("expenses");
    expect(categorize("noi Net Operating Income")).toBe("income");
    expect(categorize("unit_count Units")).toBe("mix");
  });
  it("rent roll wins rents/occupancy; T-12 wins expenses; OM otherwise", () => {
    expect(precedenceOrder("occupancy")[0]).toBe("rent_roll");
    expect(precedenceOrder("rents")[0]).toBe("rent_roll");
    expect(precedenceOrder("expenses")[0]).toBe("t12");
    expect(precedenceOrder("income")[0]).toBe("t12");
    // A loan term sheet outranks the OM for debt/off-category facts; the OM
    // still wins when no loan_terms doc is present.
    expect(precedenceOrder("other")[0]).toBe("loan_terms");
    expect(precedenceOrder("other")).toContain("om");
  });
  it("buckets severity by the 2% / 5% thresholds", () => {
    expect(severityFor(0.015)).toBe("minor");
    expect(severityFor(0.02)).toBe("material");
    expect(severityFor(0.05)).toBe("material");
    expect(severityFor(0.051)).toBe("red_flag");
  });
});

describe("fixture: occupancy mismatch (rent roll vs OM)", () => {
  const docs = [
    doc("om", "Offering Memorandum", [fact("occupancy", "Occupancy", 0.95, "95%", "%")]),
    doc("rent_roll", "Rent Roll", [fact("occupancy", "Occupancy", 0.92, "92.0%", "%")]),
  ];
  const r = computeDiscrepancies(docs);
  it("produces one discrepancy", () => expect(r.discrepancies).toHaveLength(1));
  it("bases the gap on the rent roll (the authority) → material", () => {
    const d = r.discrepancies[0];
    expect(d.inUse).toBe("rent_roll");
    expect(d.deltaPct).toBeCloseTo(Math.abs(0.95 - 0.92) / 0.92, 4);
    expect(d.severity).toBe("material");
  });
  it("a per-line override flips which source is used", () => {
    const o = computeDiscrepancies(docs, { occupancy: "om" });
    expect(o.discrepancies[0].inUse).toBe("om");
    expect(o.discrepancies[0].deltaPct).toBeCloseTo(Math.abs(0.92 - 0.95) / 0.95, 4);
  });
});

describe("fixture: expense mismatch (T-12 vs OM)", () => {
  const docs = [
    doc("om", "Offering Memorandum", [fact("total_opex", "Total Operating Expenses", 500_000, "$500,000", "$")]),
    doc("t12", "T-12", [fact("total_opex", "Total Operating Expenses", 560_000, "$560,000", "$")]),
  ];
  const r = computeDiscrepancies(docs);
  it("bases the gap on the T-12 (the authority) → red flag at 12%", () => {
    const d = r.discrepancies[0];
    expect(d.inUse).toBe("t12");
    // base is the T-12 (the authority), so the gap is 60k / 560k = 10.7%.
    expect(d.deltaPct).toBeCloseTo(60_000 / 560_000, 4);
    expect(d.severity).toBe("red_flag");
  });
  it("summary line reads correctly", () => {
    expect(r.summary).toBe("1 discrepancy: 1 red flag");
  });
});

describe("fixture: no discrepancy (values agree)", () => {
  const docs = [
    doc("om", "Offering Memorandum", [fact("units", "Units", 248, "248", "units")]),
    doc("rent_roll", "Rent Roll", [fact("units", "Units", 248, "248 units", "units")]),
  ];
  const r = computeDiscrepancies(docs);
  it("reports the overlap but with no material/red-flag severity", () => {
    expect(r.counts.material).toBe(0);
    expect(r.counts.red_flag).toBe(0);
    expect(r.discrepancies[0].severity).toBe("minor");
    expect(r.discrepancies[0].deltaPct).toBe(0);
  });
});

describe("only overlapping facts reconcile", () => {
  it("a fact present in only one document is not a discrepancy", () => {
    const docs = [
      doc("om", "OM", [fact("exit_cap", "Exit Cap", 0.06, "6.0%", "%")]),
      doc("t12", "T-12", [fact("total_opex", "Opex", 500_000, "$500,000", "$")]),
    ];
    expect(computeDiscrepancies(docs).discrepancies).toHaveLength(0);
  });
});

describe("unit mismatch never fabricates a discrepancy", () => {
  it("a $/unit/mo rent is not differenced against an annual $ figure", () => {
    // Same key, genuinely different units (monthly-per-unit vs annual). These
    // are the SAME rent expressed two ways — not a conflict.
    const docs = [
      doc("om", "OM", [fact("in_place_rent", "In-Place Rent", 1500, "$1,500", "$/unit/mo")]),
      doc("rent_roll", "Rent Roll", [fact("in_place_rent", "In-Place Rent", 18000, "$18,000", "$")]),
    ];
    expect(computeDiscrepancies(docs).discrepancies).toHaveLength(0);
  });

  it("reconciles within the largest same-unit bucket, dropping the odd unit", () => {
    const docs = [
      doc("om", "OM", [fact("in_place_rent", "In-Place Rent", 1500, "$1,500", "$/unit/mo")]),
      doc("rent_roll", "Rent Roll", [fact("in_place_rent", "In-Place Rent", 1500, "$1,500", "$/unit/mo")]),
      doc("t12", "T-12", [fact("in_place_rent", "In-Place Rent", 20000, "$20,000", "$")]),
    ];
    const r = computeDiscrepancies(docs);
    expect(r.discrepancies).toHaveLength(1);
    // Only the two $/unit/mo values are compared — they agree → minor, 0%.
    expect(r.discrepancies[0].values).toHaveLength(2);
    expect(r.discrepancies[0].deltaPct).toBe(0);
  });

  it("still compares when units differ only in formatting", () => {
    const docs = [
      doc("om", "OM", [fact("occupancy", "Occupancy", 0.95, "95%", "%")]),
      doc("rent_roll", "Rent Roll", [fact("occupancy", "Occupancy", 0.92, "92%", "percent")]),
    ];
    // "%" and "percent" normalize to the same unit → still reconciled.
    expect(computeDiscrepancies(docs).discrepancies).toHaveLength(1);
  });
});

describe("loan term sheet outranks the OM for debt terms", () => {
  it("bases an interest-rate conflict on the loan_terms doc", () => {
    const docs = [
      doc("om", "OM", [fact("interest_rate", "Interest Rate", 0.055, "5.5%", "%")]),
      doc("loan_terms", "Term Sheet", [fact("interest_rate", "Interest Rate", 0.06, "6.0%", "%")]),
    ];
    const r = computeDiscrepancies(docs);
    expect(r.discrepancies).toHaveLength(1);
    expect(r.discrepancies[0].inUse).toBe("loan_terms");
  });
});

describe("applyOverride re-bases a stored result", () => {
  it("flips inUse + delta identically to a fresh compute with the override", () => {
    const docs = [
      doc("om", "OM", [fact("occupancy", "Occupancy", 0.95, "95%", "%")]),
      doc("rent_roll", "Rent Roll", [fact("occupancy", "Occupancy", 0.92, "92%", "%")]),
    ];
    const stored = computeDiscrepancies(docs); // base = rent_roll
    const flipped = applyOverride(stored, "occupancy", "om");
    expect(flipped.discrepancies[0].inUse).toBe("om");
    // …and matches recomputing from scratch with that override (the invariant
    // that makes the toggle sticky across a reload).
    const fresh = computeDiscrepancies(docs, { occupancy: "om" });
    expect(flipped.discrepancies[0].deltaPct).toBeCloseTo(
      fresh.discrepancies[0].deltaPct,
      6,
    );
    expect(flipped.summary).toBe(fresh.summary);
  });
});

describe("severity ordering + full summary", () => {
  it("orders red flags first and summarizes all three buckets", () => {
    const docs = [
      doc("om", "OM", [
        fact("occupancy", "Occupancy", 0.95, "95%", "%"),
        fact("total_opex", "Opex", 500_000, "$500,000", "$"),
        fact("units", "Units", 248, "248", "units"),
      ]),
      doc("rent_roll", "Rent Roll", [
        fact("occupancy", "Occupancy", 0.93, "93%", "%"), // ~2.1% material
        fact("units", "Units", 248, "248", "units"), // 0% minor
      ]),
      doc("t12", "T-12", [fact("total_opex", "Opex", 560_000, "$560,000", "$")]), // 12% red flag
    ];
    const r = computeDiscrepancies(docs);
    expect(r.discrepancies[0].severity).toBe("red_flag");
    expect(r.summary).toBe("3 discrepancies: 1 red flag, 1 material, 1 minor");
  });
});
