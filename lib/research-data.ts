// Bridges the research seed JSONs to the app. The DB tables (0023) are the
// live source once seeded; these JSON imports are the base layer so the
// feature works before any ops step — and the merge NEVER hides a DB row.
// (Universal: JSON + pure helpers only; DB access stays in server components.)

import rulesSeed from "@/data/research/regulatory_rules.json";
import multifamilySeed from "@/data/research/multifamily.json";
import capitalSeed from "@/data/research/capital_markets.json";
import type { Benchmark, RegulatoryRule, RuleSubject } from "@/lib/research";

export function seedRules(): RegulatoryRule[] {
  return (rulesSeed.rules as unknown as RegulatoryRule[]).filter(
    (r) => r && r.id && r.jurisdiction_state && r.effect
  );
}

/** Benchmarks derived from the sector JSONs. Kept in code (not hand-copied
 *  rows) so a JSON update flows through on the next deploy. */
export function seedBenchmarks(): Benchmark[] {
  const out: Benchmark[] = [];
  const md = multifamilySeed.supply_demand?.on_market_depth_may_2026;
  if (md?.value) {
    const metros: Record<string, { median_sale_price?: number; active_listings?: number; yoy?: string }> =
      md.value as never;
    const label: Record<string, string> = {
      providence_ri: "Providence, RI",
      philadelphia_pa: "Philadelphia, PA",
      scranton_pa: "Scranton, PA",
      albany_ny: "Albany, NY",
      reading_pa: "Reading, PA",
      hartford_ct: "Hartford, CT",
      new_haven_ct: "New Haven, CT",
      bridgeport_ct: "Bridgeport, CT",
    };
    for (const [key, row] of Object.entries(metros)) {
      if (typeof row.median_sale_price === "number") {
        out.push({
          sector: "multifamily",
          metro: label[key] ?? key,
          metric: "median_sale_price_2_4_unit",
          low: row.median_sale_price,
          high: row.median_sale_price,
          unit: "usd",
          source: md.sources?.[0] ?? "",
          as_of: "2026-05-31",
          status: (md.status as Benchmark["status"]) ?? "sourced",
          note: row.yoy ? `YoY ${row.yoy}; single-month median, not a band` : "single-month median, not a band",
        });
      }
    }
  }
  const fmr = multifamilySeed.supply_demand?.rents_fy2026_hud_fmr_dc_area;
  if (fmr?.value) {
    for (const [br, v] of Object.entries(fmr.value)) {
      if (typeof v === "number") {
        out.push({
          sector: "multifamily",
          metro: "Washington DC area",
          metric: `hud_fmr_fy2026_${br}`,
          low: v,
          high: v,
          unit: "usd_month",
          source: fmr.sources?.[0] ?? "",
          as_of: "2025-10-01",
          status: (fmr.status as Benchmark["status"]) ?? "sourced",
          note: fmr.note ?? null,
        });
      }
    }
  }
  const pmms = capitalSeed.snapshot?.mortgage_30y_pmms;
  if (typeof pmms?.value === "number") {
    out.push({
      sector: "capital_markets",
      metro: "",
      metric: "pmms_30y_fixed",
      low: pmms.value,
      high: pmms.value,
      unit: "pct",
      source: pmms.sources?.[0] ?? "",
      as_of: pmms.as_of ?? "2026-08-20",
      status: (pmms.status as Benchmark["status"]) ?? "sourced",
      note: pmms.note ?? null,
    });
  }
  return out;
}

/** The buyer profile the rules evaluate against until a real setting exists.
 *  These mirror the operator's stated profile; anything NOT safely assumable
 *  (RAD registration, permit year) stays undefined so the tri-state engine
 *  surfaces it as an open question instead of a silent pass. */
export const BUYER_DEFAULTS: Partial<RuleSubject> = {
  owner_is_natural_person: true,
  owner_natural_persons: 1,
  owner_form: "natural_person",
  owner_other_rental_units_in_dc: 0,
  owner_total_rental_units_in_county: 0,
  property_type: "rental_housing",
};

const num = (s: string | null | undefined): number | undefined => {
  if (!s) return undefined;
  const m = s.replace(/[,$]/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
};

/** Build the evaluation subject from what the deal already knows. The
 *  sector-facts answers (permit year, RAD registration, other units) override
 *  the defaults — an explicit answer always beats an assumption. */
export function buildSubject(input: {
  address: { state?: string; city?: string; county?: string; submarket?: string } | null;
  sizeText?: string | null;
  yearBuilt?: number | null;
  sectorFields?: Record<string, string | number | boolean> | null;
}): RuleSubject {
  const units =
    input.sizeText && /\b(units?|doors)\b/i.test(input.sizeText) ? num(input.sizeText) : undefined;
  const sf = input.sectorFields ?? {};
  const numField = (k: string): number | undefined =>
    typeof sf[k] === "number" ? (sf[k] as number) : undefined;
  const boolField = (k: string): boolean | undefined =>
    typeof sf[k] === "boolean" ? (sf[k] as boolean) : undefined;
  const otherUnits = numField("owner_units_in_jurisdiction");
  return {
    ...BUYER_DEFAULTS,
    state: input.address?.state || undefined,
    locality: [input.address?.city, input.address?.county, input.address?.submarket].filter(
      (s): s is string => !!s
    ),
    units,
    built_year: input.yearBuilt ?? undefined,
    building_permit_year: numField("building_permit_year"),
    exemption_registered_with_rad: boolField("rad_exemption_registered"),
    ...(otherUnits !== undefined
      ? {
          owner_other_rental_units_in_dc: otherUnits,
          owner_total_rental_units_in_county: otherUnits + (units ?? 0),
        }
      : {}),
    transaction: "sale_of_rental_housing_accommodation",
  };
}

/** Parse "$1,234,567" + "12 units" into price-per-unit, when both parse. */
export function pricePerUnit(priceText?: string | null, sizeText?: string | null): number | null {
  const p = num(priceText);
  const u = sizeText && /\bunits?\b/i.test(sizeText) ? num(sizeText) : undefined;
  if (!p || !u || u < 1) return null;
  return Math.round(p / u);
}
